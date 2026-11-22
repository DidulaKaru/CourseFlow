"""CourseFlow FastAPI Application Entrypoint."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.api import api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Interactive Curriculum Dependency Graph Visualizer & Degree Progress Advisor API",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    # The prerequisite AST is both a request body (CF-203) and part of every course response. One
    # shared schema keeps the generated TypeScript names (LogicalRuleNode, ...) stable for the frontend.
    separate_input_output_schemas=False,
)

# CORS Middleware supporting both explicit origin list and Cloudflare Pages domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https:\/\/.*\.pages\.dev$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RecursionError)
async def recursion_error_handler(_request: Request, _exc: RecursionError) -> JSONResponse:
    """Answer absurdly nested JSON bodies (e.g. a ~2000-level prerequisite tree) with 422 instead of a 500.

    The JSON parser itself hits Python's recursion limit before any schema validation runs.
    """
    detail = [{"loc": ["body"], "msg": "Request body is nested too deeply to process.", "type": "value_error"}]
    return JSONResponse(status_code=422, content={"detail": detail})


@app.get("/", tags=["System"])
def root():
    """Root endpoint for top-level health verification."""
    return {"status": "healthy", "service": settings.PROJECT_NAME, "version": settings.VERSION}


@app.get("/api/health", tags=["System"])
def health_check():
    """Health check endpoint to verify backend operational readiness."""
    return {"status": "healthy", "service": settings.PROJECT_NAME, "version": settings.VERSION}


# Mount API routers: both /api and /api/v1 for convenience and versioning
app.include_router(api_router, prefix="/api")
app.include_router(api_router, prefix=settings.API_V1_STR)
