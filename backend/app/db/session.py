"""Engine and session factory."""

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def make_engine(database_url: str | None = None) -> Engine:
    """Create an engine for ``database_url`` (defaults to ``settings.DATABASE_URL``)."""
    return create_engine(database_url or settings.DATABASE_URL, pool_pre_ping=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
