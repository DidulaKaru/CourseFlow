"""API v1 router aggregator."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, courses, extraction, plans, programs

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Faculty Authentication"])
api_router.include_router(courses.router, prefix="/courses", tags=["Course Administration"])
api_router.include_router(extraction.router, prefix="/extraction", tags=["MIS Extraction"])
api_router.include_router(programs.router, prefix="/programs", tags=["Degree Programs"])
api_router.include_router(plans.router, prefix="/plans", tags=["Study Plans"])
