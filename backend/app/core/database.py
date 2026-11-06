"""Database connection engine and session configuration.

Optimized for both local development and serverless PostgreSQL deployments (Neon Free Tier).
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Determine if running in serverless environment (e.g. Vercel) or production
# In serverless environments, NullPool avoids connection pool exhaustion on Neon's free tier
is_serverless = os.getenv("VERCEL") == "1" or settings.ENVIRONMENT in ("production", "staging")

engine_kwargs: dict = {
    "pool_pre_ping": True,
    "future": True,
}

if is_serverless:
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(
    settings.DATABASE_URL,
    **engine_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator:
    """Yield database session dependency for FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
