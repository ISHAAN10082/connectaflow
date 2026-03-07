from __future__ import annotations

from sqlalchemy import inspect, text
from sqlmodel import SQLModel

from models import DEFAULT_WORKSPACE_ID


def apply_sqlite_migrations(engine) -> None:
    """
    Best-effort SQLite migration: add missing columns for existing tables.
    This keeps dev DBs working when models evolve without Alembic.
    """
    if engine.dialect.name != "sqlite":
        return

    insp = inspect(engine)

    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue

            existing_cols = {c["name"] for c in insp.get_columns(table.name)}

            for column in table.columns:
                if column.name in existing_cols:
                    continue

                col_type = column.type.compile(dialect=engine.dialect)
                sql = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}"
                conn.execute(text(sql))

            # Backfill workspace_id where applicable
            if "workspace_id" in {c.name for c in table.columns}:
                conn.execute(
                    text(
                        f"UPDATE {table.name} SET workspace_id = :ws WHERE workspace_id IS NULL"
                    ),
                    {"ws": str(DEFAULT_WORKSPACE_ID)},
                )
