from sqlmodel import SQLModel, create_engine
import os

# Default to SQLite for MVP if no connection string provided, or use Postgres
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./connectaflow.db")

engine = create_engine(DATABASE_URL, echo=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    from sqlmodel import Session
    with Session(engine) as session:
        yield session
