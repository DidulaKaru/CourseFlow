"""CourseFlow FastAPI Application Entrypoint."""


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.schemas.curriculum import DegreeProgram

app = FastAPI(
    title="CourseFlow API",
    description="Interactive Curriculum Dependency Graph Visualizer & Degree Progress Advisor API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["System"])
def health_check():
    """Health check endpoint to verify backend operational readiness."""
    return {"status": "healthy", "service": "CourseFlow API"}


@app.get(
    "/api/programs",
    response_model=list[DegreeProgram],
    tags=["Degree Programs"],
    summary="List Degree Programs",
)
def list_programs() -> list[DegreeProgram]:
    """Retrieve summaries for all available engineering degree programs."""
    return []


@app.get(
    "/api/programs/{id}",
    response_model=DegreeProgram,
    tags=["Degree Programs"],
    summary="Get Degree Program by ID",
)
def get_program(id: str) -> DegreeProgram:
    """Retrieve full curriculum graph for a specific degree program."""
    return DegreeProgram(
        id=id,
        name="",
        department="",
        courses=[],
    )
