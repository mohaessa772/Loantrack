import logging
from logging.config import fileConfig

from flask import current_app

from app.migration_safety import (
    assert_no_foreign_key_violations,
    backup_sqlite_database,
    foreign_key_violations,
)

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')


def get_engine():
    try:
        # this works with Flask-SQLAlchemy<3 and Alchemical
        return current_app.extensions['migrate'].db.get_engine()
    except (TypeError, AttributeError):
        # this works with Flask-SQLAlchemy>=3
        return current_app.extensions['migrate'].db.engine


def get_engine_url():
    try:
        return get_engine().url.render_as_string(hide_password=False).replace(
            '%', '%%')
    except AttributeError:
        return str(get_engine().url).replace('%', '%%')


# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
config.set_main_option('sqlalchemy.url', get_engine_url())
target_db = current_app.extensions['migrate'].db

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def get_metadata():
    if hasattr(target_db, 'metadatas'):
        return target_db.metadatas[None]
    return target_db.metadata


def run_migrations_offline():
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url, target_metadata=get_metadata(), literal_binds=True
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    # this callback is used to prevent an auto-migration from being generated
    # when there are no changes to the schema
    # reference: http://alembic.zzzcomputing.com/en/latest/cookbook.html
    def process_revision_directives(context, revision, directives):
        if getattr(config.cmd_opts, 'autogenerate', False):
            script = directives[0]
            if script.upgrade_ops.is_empty():
                directives[:] = []
                logger.info('No changes in schema detected.')

    conf_args = current_app.extensions['migrate'].configure_args
    if conf_args.get("process_revision_directives") is None:
        conf_args["process_revision_directives"] = process_revision_directives

    connectable = get_engine()

    with connectable.connect() as connection:
        # ------------------------------------------------------------------
        # SQLite: foreign keys MUST be off while migrations run.
        #
        # SQLite cannot ALTER most things, so Alembic uses "batch" mode: it
        # creates a new table, copies the rows across, DROPS the original and
        # renames. The app turns on PRAGMA foreign_keys, and with it on that
        # DROP fires every ON DELETE CASCADE pointing at the table - so
        # altering `users` silently deletes every person and transaction.
        #
        # This is not hypothetical. It happened, and it cost a full database.
        # Turning the pragma off for the duration of the migration makes the
        # table rebuild what it is meant to be: a structural change, not a
        # deletion.
        # ------------------------------------------------------------------
        is_sqlite = connection.dialect.name == "sqlite"

        # A copy is taken BEFORE anything is configured or run. If it cannot be
        # made, this raises and the migration never starts.
        backup_path = backup_sqlite_database(connection)

        if is_sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")

        # Counted before anything runs, so the report can tell the difference
        # between damage this migration did and damage it inherited.
        violations_before = len(foreign_key_violations(connection))

        context.configure(
            connection=connection,
            target_metadata=get_metadata(),
            **conf_args
        )

        try:
            with context.begin_transaction():
                context.run_migrations()

                # Inside the transaction, so raising aborts the migration
                # rather than reporting a problem after it has been recorded
                # as applied. PRAGMA foreign_key_check inspects without
                # enforcing, so it works with enforcement still switched off.
                assert_no_foreign_key_violations(
                    connection, backup_path, pre_existing=violations_before
                )

            # Commit explicitly.
            #
            # Alembic sets transactional_ddl=False for SQLite, so
            # begin_transaction() above is a no-op context that commits nothing.
            # Meanwhile PRAGMA foreign_keys=OFF has already opened an implicit
            # transaction on this connection. Without this commit, closing the
            # connection rolls the whole migration back and it silently does
            # nothing at all - the command reports "Running upgrade..." and the
            # schema never changes.
            if connection.in_transaction():
                connection.commit()
        except Exception:
            try:
                connection.rollback()
            except Exception:  # noqa: BLE001 - never mask the original failure
                logger.error("Rollback after a failed migration did not succeed.")
            if backup_path:
                logger.error("Migration failed. Pre-migration backup: %s", backup_path)
            raise
        finally:
            if is_sqlite:
                # Enforcement back on for whoever uses this connection next.
                # Outside the transaction, because the pragma is a no-op inside
                # one.
                connection.exec_driver_sql("PRAGMA foreign_keys=ON")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
