"""Application configuration and environment settings."""

import json
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """FastAPI application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "CourseFlow API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    # Database Configuration (Neon Serverless PostgreSQL or local container)
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/courseflow"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: str | None) -> str:
        """Normalize legacy postgres:// prefix to standard postgresql:// required by SQLAlchemy 2.0."""
        if isinstance(v, str) and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v or "postgresql://postgres:postgres@localhost:5432/courseflow"

    # CORS Configuration
    CORS_ORIGINS: list[str] | str = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse comma-separated string, JSON list, or standard list of CORS origins."""
        if isinstance(v, str):
            trimmed = v.strip()
            if trimmed.startswith("[") and trimmed.endswith("]"):
                try:
                    parsed = json.loads(trimmed)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed]
                except (json.JSONDecodeError, TypeError, ValueError):
                    return [i.strip() for i in trimmed.strip("[]").split(",") if i.strip()]
            return [i.strip() for i in trimmed.split(",") if i.strip()]
        return v

    # Curriculum & Academic Constants
    MIN_CREDITS_PER_SEMESTER: int = 18
    MAX_CREDITS_PER_SEMESTER: int = 24
    TOTAL_CREDITS_REQUIRED: int = 150
    DEFAULT_SEMESTERS_COUNT: int = 8

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent.parent

    @property
    def DATA_PROGRAMS_DIR(self) -> Path:
        """Resolve curriculum programs directory across backend, frontend, or container paths."""
        # 1. Self-contained local backend data directory (ideal for Vercel/serverless deployments)
        backend_local = Path(__file__).resolve().parent.parent.parent / "data" / "programs"
        if backend_local.exists():
            return backend_local
        # 2. Workspace frontend directory
        frontend_path = self.BASE_DIR / "frontend" / "src" / "data" / "programs"
        if frontend_path.exists():
            return frontend_path
        # 3. Docker container mount point
        container_path = Path("/frontend/src/data/programs")
        if container_path.exists():
            return container_path
        # 4. Fallback legacy root src path
        return self.BASE_DIR / "src" / "data" / "programs"


settings = Settings()
