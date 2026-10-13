from fastapi import APIRouter

from app.api.endpoints import comparisons, items, lists, users

api_router = APIRouter()

# Include routers from endpoints
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(lists.router, prefix="/lists", tags=["lists"])
api_router.include_router(items.router, prefix="/items", tags=["items"])
api_router.include_router(
    comparisons.router, prefix="/items/comparison", tags=["comparisons"]
)
