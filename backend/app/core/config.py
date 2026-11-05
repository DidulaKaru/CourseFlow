"""Application configuration and environment settings."""

from pathlib import Path

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

    # Database Configuration
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/courseflow"

    # CORS Configuration
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Curriculum & Academic Constants
    MIN_CREDITS_PER_SEMESTER: int = 18
    MAX_CREDITS_PER_SEMESTER: int = 24
    TOTAL_CREDITS_REQUIRED: int = 150
    DEFAULT_SEMESTERS_COUNT: int = 8

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent.parent

    @property
    def DATA_PROGRAMS_DIR(self) -> Path:
        """Resolve curriculum programs directory in frontend/src or src."""
        frontend_path = self.BASE_DIR / "frontend" / "src" / "data" / "programs"
        if frontend_path.exists():
            return frontend_path
        container_path = Path("/frontend/src/data/programs")
        if container_path.exists():
            return container_path
        return self.BASE_DIR / "src" / "data" / "programs"


settings = Settings()
