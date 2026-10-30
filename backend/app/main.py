"""CourseFlow FastAPI Application Entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Interactive Curriculum Dependency Graph Visualizer & Degree Progress Advisor API",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["System"])
def health_check():
    """Health check endpoint to verify backend operational readiness."""
    return {"status": "healthy", "service": settings.PROJECT_NAME, "version": settings.VERSION}


# Mount API routers: both /api and /api/v1 for convenience and versioning
app.include_router(api_router, prefix="/api")
app.include_router(api_router, prefix=settings.API_V1_STR)
