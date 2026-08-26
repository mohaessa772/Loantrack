"""Tests for the two guards that wrap every migration.

Every test here works on a throwaway database created inside pytest's tmp_path.
Nothing touches the real development database.
"""

import sqlite3

import pytest
from sqlalchemy import create_engine, text

from app.migration_safety import (
    MigrationSafetyError,
    assert_no_foreign_key_violations,
    backup_sqlite_database,
    foreign_key_violations,
    sqlite_file,
)


def make_database(path, rows=3):
    """A small database with a real parent/child foreign key."""
    conn = sqlite3.connect(str(path))
    conn.executescript(
        """
        CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE child (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER NOT NULL REFERENCES parent(id)
        );
        """
    )
    for i in range(1, rows + 1):
        conn.execute("INSERT INTO parent (id, name) VALUES (?, ?)", (i, f"p{i}"))
        conn.execute("INSERT INTO child (id, parent_id) VALUES (?, ?)", (i, i))
    conn.commit()
    conn.close()
    return path


@pytest.fixture
def db_path(tmp_path):
    return make_database(tmp_path / "sample.db")


@pytest.fixture
def engine(db_path):
    return create_engine(f"sqlite:///{db_path}")


def backups_beside(db_path):
    return sorted(db_path.parent.glob(f"{db_path.name}.pre-migration-*"))


# ======================================================================
# Guard 1: the pre-migration backup
# ======================================================================

class TestBackupIsCreated:
    def test_a_backup_file_appears_next_to_the_database(self, engine, db_path):
        with engine.connect() as connection:
            result = backup_sqlite_database(connection)

        assert result is not None
        assert result.exists()
        assert result.parent == db_path.parent
        assert result.name.startswith(f"{db_path.name}.pre-migration-")

    def test_the_backup_holds_the_same_rows(self, engine, db_path):
        with engine.connect() as connection:
            backup = backup_sqlite_database(connection)

        copy = sqlite3.connect(f"file:{backup}?immutable=1", uri=True)
        assert copy.execute("SELECT COUNT(*) FROM parent").fetchone()[0] == 3
        assert copy.execute("SELECT COUNT(*) FROM child").fetchone()[0] == 3
        assert copy.execute("PRAGMA integrity_check").fetchone()[0] == "ok"

    def test_the_path_is_returned_so_it_can_be_reported(self, engine):
        with engine.connect() as connection:
            assert "pre-migration-" in str(backup_sqlite_database(connection))

    def test_a_backup_after_a_committed_write_sees_that_write(self, engine, db_path):
        with engine.connect() as connection:
            connection.execute(text("INSERT INTO parent (id, name) VALUES (99, 'late')"))
            connection.commit()
            backup = backup_sqlite_database(connection)

        copy = sqlite3.connect(f"file:{backup}?immutable=1", uri=True)
        assert copy.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert copy.execute("SELECT COUNT(*) FROM parent").fetchone()[0] == 4

    def test_an_open_write_transaction_is_refused_not_hung(self, engine):
        """sqlite3's backup() waits for the writer's lock and, on the same
        connection, waits forever. A silent hang is worse than an error, so it
        refuses instead - and refusing aborts the migration, which is correct."""
        with engine.connect() as connection:
            connection.execute(text("INSERT INTO parent (id, name) VALUES (99, 'late')"))
            with pytest.raises(MigrationSafetyError) as exc:
                backup_sqlite_database(connection)

        assert "block indefinitely" in str(exc.value)


class TestBackupNeverOverwrites:
    def test_two_backups_produce_two_files(self, engine, db_path):
        with engine.connect() as connection:
            first = backup_sqlite_database(connection)
            second = backup_sqlite_database(connection)

        assert first != second
        assert first.exists() and second.exists()
        assert len(backups_beside(db_path)) == 2

    def test_older_backups_are_left_alone(self, engine, db_path):
        with engine.connect() as connection:
            first = backup_sqlite_database(connection)
        original_bytes = first.read_bytes()

        with engine.connect() as connection:
            connection.execute(text("DELETE FROM child"))
            connection.commit()
            backup_sqlite_database(connection)

        # The first backup still holds the pre-delete state.
        assert first.read_bytes() == original_bytes
        copy = sqlite3.connect(f"file:{first}?immutable=1", uri=True)
        assert copy.execute("SELECT COUNT(*) FROM child").fetchone()[0] == 3

    def test_nothing_is_deleted_automatically(self, engine, db_path):
        with engine.connect() as connection:
            for _ in range(3):
                backup_sqlite_database(connection)
        assert len(backups_beside(db_path)) == 3


class TestBackupIsSkippedWhenPointless:
    def test_in_memory_databases_are_skipped(self):
        engine = create_engine("sqlite://")
        with engine.connect() as connection:
            assert sqlite_file(connection) is None
            assert backup_sqlite_database(connection) is None

    def test_a_database_that_does_not_exist_yet_is_skipped(self, tmp_path):
        """The very first migration has nothing to lose."""
        engine = create_engine(f"sqlite:///{tmp_path / 'brand-new.db'}")
        with engine.connect() as connection:
            assert backup_sqlite_database(connection) is None
        assert not backups_beside(tmp_path / "brand-new.db")


class TestBackupFailureAbortsTheMigration:
    def test_an_unwritable_destination_raises(self, engine, db_path, monkeypatch):
        def explode(*args, **kwargs):
            raise OSError("disk full")

        monkeypatch.setattr("app.migration_safety._copy_database", explode)

        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                backup_sqlite_database(connection)

        assert "disk full" in str(exc.value)
        assert "Refusing to migrate" in str(exc.value)

    def test_a_backup_that_never_appeared_raises(self, engine, monkeypatch):
        """Copying "succeeding" is not the same as a file being there."""
        monkeypatch.setattr("app.migration_safety._copy_database", lambda *a, **k: None)

        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                backup_sqlite_database(connection)

        assert "does not exist" in str(exc.value)

    def test_an_empty_backup_raises(self, engine, monkeypatch):
        def write_nothing(connection, source, destination):
            destination.touch()

        monkeypatch.setattr("app.migration_safety._copy_database", write_nothing)

        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                backup_sqlite_database(connection)

        assert "is empty" in str(exc.value)

    def test_a_corrupt_backup_raises(self, engine, monkeypatch):
        def write_junk(connection, source, destination):
            destination.write_bytes(b"this is not a database")

        monkeypatch.setattr("app.migration_safety._copy_database", write_junk)

        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                backup_sqlite_database(connection)

        assert "not a readable database" in str(exc.value)


# ======================================================================
# Guard 2: the foreign key check
# ======================================================================

def break_a_reference(db_path):
    """Delete a parent while enforcement is off - exactly what a bad migration
    would leave behind."""
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("DELETE FROM parent WHERE id = 2")
    conn.commit()
    conn.close()


class TestForeignKeyCheck:
    def test_a_clean_database_passes(self, engine):
        with engine.connect() as connection:
            assert foreign_key_violations(connection) == []
            assert_no_foreign_key_violations(connection)  # must not raise

    def test_a_dangling_reference_is_detected(self, engine, db_path):
        break_a_reference(db_path)
        with engine.connect() as connection:
            assert len(foreign_key_violations(connection)) == 1

    def test_a_dangling_reference_raises(self, engine, db_path):
        break_a_reference(db_path)
        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError):
                assert_no_foreign_key_violations(connection)

    def test_the_message_names_the_offending_table_and_row(self, engine, db_path):
        break_a_reference(db_path)
        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                assert_no_foreign_key_violations(connection)

        message = str(exc.value)
        assert "child" in message
        assert "parent" in message
        assert "rowid=2" in message
        assert "aborted" in message

    def test_the_message_points_at_the_backup(self, engine, db_path):
        break_a_reference(db_path)
        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                assert_no_foreign_key_violations(connection, backup_path="/tmp/before.db")

        assert "/tmp/before.db" in str(exc.value)

    def test_it_works_while_enforcement_is_off(self, engine, db_path):
        """The check has to run during a migration, when foreign keys are
        disabled - PRAGMA foreign_key_check inspects rather than enforces."""
        break_a_reference(db_path)
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            with pytest.raises(MigrationSafetyError):
                assert_no_foreign_key_violations(connection)

    def test_many_violations_are_summarised(self, tmp_path):
        path = make_database(tmp_path / "many.db", rows=30)
        conn = sqlite3.connect(str(path))
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("DELETE FROM parent")
        conn.commit()
        conn.close()

        engine = create_engine(f"sqlite:///{path}")
        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                assert_no_foreign_key_violations(connection)

        message = str(exc.value)
        assert "30 foreign key violation(s)" in message
        assert "and 10 more" in message  # capped at 20 listed


class FakeConnection:
    """Just enough of a connection to answer "which dialect are you?"."""

    class _Dialect:
        def __init__(self, name):
            self.name = name

    def __init__(self, name):
        self.dialect = self._Dialect(name)


class TestNonSqliteIsUntouched:
    """PostgreSQL has real ALTER TABLE, is backed up by other means, and never
    needs the pragma dance. These guards must quietly do nothing there."""

    def test_no_backup_is_attempted(self):
        assert sqlite_file(FakeConnection("postgresql")) is None
        assert backup_sqlite_database(FakeConnection("postgresql")) is None

    def test_no_foreign_key_check_is_attempted(self):
        # Would raise AttributeError if it tried to run a PRAGMA.
        assert foreign_key_violations(FakeConnection("postgresql")) == []
        assert_no_foreign_key_violations(FakeConnection("postgresql"))


class TestViolationWording:
    """The report must not accuse a migration of damage it inherited."""

    def test_new_violations_are_called_introduced(self, engine, db_path):
        break_a_reference(db_path)
        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                assert_no_foreign_key_violations(connection, pre_existing=0)
        assert "introduced 1 foreign key violation" in str(exc.value)

    def test_pre_existing_violations_say_so(self, engine, db_path):
        break_a_reference(db_path)
        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                assert_no_foreign_key_violations(connection, pre_existing=1)
        message = str(exc.value)
        assert "already had 1 foreign key violation" in message
        assert "did not cause them" in message

    def test_a_mix_reports_how_many_are_new(self, tmp_path):
        path = make_database(tmp_path / "mixed.db", rows=4)
        conn = sqlite3.connect(str(path))
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("DELETE FROM parent WHERE id IN (1,2,3)")
        conn.commit()
        conn.close()

        engine = create_engine(f"sqlite:///{path}")
        with engine.connect() as connection:
            with pytest.raises(MigrationSafetyError) as exc:
                assert_no_foreign_key_violations(connection, pre_existing=1)
        assert "3 foreign key violation(s) after the migration, 2 of them new" in str(exc.value)

    def test_it_still_aborts_regardless_of_wording(self, engine, db_path):
        """Whatever the cause, the migration stops."""
        break_a_reference(db_path)
        with engine.connect() as connection:
            for pre in (0, 1, 99):
                with pytest.raises(MigrationSafetyError):
                    assert_no_foreign_key_violations(connection, pre_existing=pre)
