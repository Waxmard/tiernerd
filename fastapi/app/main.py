from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.api import api_router
from app.db.database import create_tables, engine
from app.settings import get_settings

app = FastAPI(
    title="Ranking App API",
    description="API for a ranking application that uses binary comparisons",
    version="0.1.0",
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().CORS_ORIGINS,
    allow_origin_regex=get_settings().CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api")


@app.on_event("startup")
async def startup() -> None:
    """Initialize application on startup."""
    await create_tables()


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {"message": "Welcome to the Ranking App API"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for container monitoring."""
    try:
        # Check database connectivity
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "service": "tiernerd-backend",
            "version": "0.1.0",
            "database": "connected",
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "tiernerd-backend",
            "version": "0.1.0",
            "database": "disconnected",
            "error": str(e),
        }


if __name__ == "__main__":
    import uvicorn

    # Bind 0.0.0.0 so the container is reachable from the host; dev-only entrypoint.
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)  # noqa: S104
