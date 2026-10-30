"""API v1 router aggregator."""

from fastapi import APIRouter

from app.api.v1.endpoints import plans, programs

api_router = APIRouter()
api_router.include_router(programs.router, prefix="/programs", tags=["Degree Programs"])
api_router.include_router(plans.router, prefix="/plans", tags=["Study Plans"])
