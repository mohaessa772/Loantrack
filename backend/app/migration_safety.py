"""Guard rails that run around every migration.

These live here rather than inside migrations/env.py for one reason: env.py is
executed by Alembic in its own context and is close to untestable. Keeping the
logic in an ordinary module means it can be unit-tested like anything else, and
env.py is left as a few lines of wiring.

Two guards, both born from a real incident:

1. A pre-migration backup. SQLite cannot ALTER most things, so Alembic rebuilds
   the whole table - and a rebuild that goes wrong takes the data with it. A
   copy taken before anything runs is the difference between a bad afternoon
   and a lost database.

2. A foreign key check afterwards. Enforcement has to be off during a rebuild
   (see migrations/env.py), which means a migration *could* leave a dangling
   reference behind. Finding that later is far worse than failing now.
"""

import logging
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("alembic.env")


class MigrationSafetyError(RuntimeError):
    """Raised to stop a migration. Never caught internally - it must escape."""


# ======================================================================
# Pre-migration backup
# ======================================================================

def sqlite_file(connection) -> Path | None:
    """The database file behind this connection, or None if there is not one.

    Returns None for PostgreSQL (backed up by other means) and for in-memory
    SQLite (tests - there is nothing on disk and nothing to lose).
    """
    if connection.dialect.name != "sqlite":
        return None
    database = connection.engine.url.database
    if not database or database == ":memory:":
        return None
    return Path(database)


def backup_sqlite_database(connection) -> Path | None:
    """Copy the database before a migration touches it.

    Returns the backup path, or None when there is nothing to back up (a
    PostgreSQL connection, an in-memory database, or a file that does not exist
    yet because this is the very first migration).

    Raises MigrationSafetyError if a backup was needed but could not be made -
    the migration must not proceed on a database it cannot fall back from.
    """
    source = sqlite_file(connection)
    if source is None:
        return None
    if not source.exists() or source.stat().st_size == 0:
        logger.info("No existing database to back up - this looks like a first run.")
        return None

    # Timestamped, and never reused: a backup that overwrites the previous one
    # is worth very little the second time you need it.
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = source.with_name(f"{source.name}.pre-migration-{stamp}")
    suffix = 1
    while destination.exists():
        destination = source.with_name(f"{source.name}.pre-migration-{stamp}-{suffix}")
        suffix += 1

    try:
        _copy_database(connection, source, destination)
    except MigrationSafetyError:
        raise
    except Exception as exc:  # noqa: BLE001 - any failure here must abort
        raise MigrationSafetyError(
            f"Could not create a pre-migration backup at {destination}: {exc}. "
            "Refusing to migrate a database that cannot be restored."
        ) from exc

    _verify_backup(destination, source)
    logger.info("Pre-migration backup written to %s", destination)
    return destination


def _copy_database(connection, source: Path, destination: Path) -> None:
    """Use SQLite's own backup API where possible.

    A plain file copy of a database with an open connection can catch it
    mid-write; the backup API takes a consistent snapshot instead. If the raw
    driver connection is not reachable, fall back to copying the file.

    One hard precondition: the source connection must NOT have an open write
    transaction. sqlite3's backup() waits for the writer's lock and, on the same
    connection, waits forever - a silent hang, which is a far worse failure than
    an error. So this refuses outright rather than risking it. env.py satisfies
    the precondition by taking the backup before any migration work begins.
    """
    raw = getattr(connection.connection, "driver_connection", None)
    if isinstance(raw, sqlite3.Connection):
        if raw.in_transaction:
            raise MigrationSafetyError(
                "Cannot take a consistent backup while a write transaction is "
                "open on the same connection - SQLite's backup would block "
                "indefinitely. Take the backup before the migration starts."
            )
        target = sqlite3.connect(str(destination))
        try:
            raw.backup(target)
        finally:
            target.close()
    else:
        shutil.copy2(source, destination)


def _verify_backup(destination: Path, source: Path) -> None:
    """Confirm the backup exists, is non-empty, and is a readable database.

    "The copy command returned without error" is not the same as "there is a
    usable backup on disk", and only the second one is worth anything.
    """
    if not destination.exists():
        raise MigrationSafetyError(
            f"Pre-migration backup was reported as written but {destination} does not exist."
        )
    size = destination.stat().st_size
    if size == 0:
        raise MigrationSafetyError(f"Pre-migration backup at {destination} is empty.")

    try:
        check = sqlite3.connect(f"file:{destination}?immutable=1", uri=True)
        try:
            result = check.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            check.close()
    except sqlite3.Error as exc:
        raise MigrationSafetyError(
            f"Pre-migration backup at {destination} is not a readable database: {exc}"
        ) from exc

    if result != "ok":
        raise MigrationSafetyError(
            f"Pre-migration backup at {destination} failed its integrity check: {result}"
        )


# ======================================================================
# Post-migration foreign key check
# ======================================================================

def foreign_key_violations(connection) -> list[tuple]:
    """Rows whose foreign key points at something that is not there.

    PRAGMA foreign_key_check works whether or not enforcement is switched on -
    it inspects, it does not enforce - so this is safe to run while foreign keys
    are still disabled for the migration.
    """
    if connection.dialect.name != "sqlite":
        return []
    return list(connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall())


def assert_no_foreign_key_violations(connection, backup_path=None, pre_existing=0) -> None:
    """Raise if there is a dangling reference after the migration.

    Raising here aborts the migration: the exception propagates out of
    context.run_migrations(), so the revision is never recorded as applied and
    the database is not left silently marked as up to date.

    `pre_existing` is the count found BEFORE the migration ran. It changes only
    the wording, not the outcome - either way the migration stops - but it
    matters that the report does not accuse a migration of damage it did not do.
    """
    violations = foreign_key_violations(connection)
    if not violations:
        return

    lines = []
    for row in violations[:20]:
        table, rowid, parent, fkid = (list(row) + [None] * 4)[:4]
        lines.append(f"    {table} rowid={rowid} -> missing row in {parent} (fk #{fkid})")
    if len(violations) > 20:
        lines.append(f"    ... and {len(violations) - 20} more")

    total = len(violations)
    if pre_existing >= total:
        headline = (
            f"The database already had {total} foreign key violation(s) before this "
            "migration; it has been aborted. The migration did not cause them, but "
            "migrating a database with dangling references would only bury the problem."
        )
    elif pre_existing:
        headline = (
            f"{total} foreign key violation(s) after the migration, "
            f"{total - pre_existing} of them new; it has been aborted."
        )
    else:
        headline = (
            f"Migration introduced {total} foreign key violation(s); it has been aborted."
        )

    message = [headline, *lines]
    if backup_path:
        message.append(f"  Restore from the pre-migration backup: {backup_path}")
    raise MigrationSafetyError("\n".join(message))
