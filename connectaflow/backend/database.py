from sqlmodel import SQLModel, create_engine, Session
from config import settings
from services.migrations import apply_sqlite_migrations
from pathlib import Path
import shutil
import sqlite3
from sqlalchemy.engine.url import make_url
from loguru import logger

engine = create_engine(settings.DATABASE_URL, echo=False)


def _sqlite_path_from_url(db_url: str) -> Path | None:
    if not db_url.startswith("sqlite"):
        return None
    url = make_url(db_url)
    if not url.database:
        return None
    if url.database == ":memory:":
        return None
    return Path(url.database).expanduser()


def maybe_seed_demo_db() -> None:
    """
    Seed a fresh SQLite DB with demo data if no tables exist.
    This keeps first-run UX fast without clobbering real data.
    """
    db_path = _sqlite_path_from_url(settings.DATABASE_URL)
    if not db_path:
        return

    demo_path = Path(__file__).resolve().parent / "demo_connectaflow.db"
    if not demo_path.exists():
        return

    if not db_path.exists():
        db_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(demo_path, db_path)
        logger.info("Seeded demo data (new SQLite DB).")
        return

    if db_path.stat().st_size < 4096:
        shutil.copyfile(demo_path, db_path)
        logger.info("Seeded demo data (empty SQLite DB).")
        return

    try:
        with sqlite3.connect(db_path) as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not tables:
                shutil.copyfile(demo_path, db_path)
                logger.info("Seeded demo data (no tables found).")
                return

            def _count(table: str) -> int:
                if table not in tables:
                    return 0
                return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

            if _count("gtm_contexts") == 0 and _count("company_profiles") == 0 and _count("playbooks") == 0 and _count("leads") == 0:
                shutil.copyfile(demo_path, db_path)
                logger.info("Seeded demo data (empty workspace).")
    except Exception as exc:
        logger.warning(f"Demo seed check skipped: {exc}")

def create_db_and_tables():
    maybe_seed_demo_db()
    SQLModel.metadata.create_all(engine)
    apply_sqlite_migrations(engine)


def get_session():
    with Session(engine) as session:
        yield session
