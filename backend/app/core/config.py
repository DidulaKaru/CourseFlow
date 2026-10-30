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

    # CORS Configuration
    CORS_ORIGINS: list[str] = ["*"]

    # Curriculum & Academic Constants
    MIN_CREDITS_PER_SEMESTER: int = 18
    MAX_CREDITS_PER_SEMESTER: int = 24
    TOTAL_CREDITS_REQUIRED: int = 150
    DEFAULT_SEMESTERS_COUNT: int = 8

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent.parent
    DATA_PROGRAMS_DIR: Path = BASE_DIR / "src" / "data" / "programs"


settings = Settings()
