import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.core import config
from app.core.jobs import cleanup
from app.core.limits import BodyLimit, LimitsMiddleware
from app.routes.tools import router


@asynccontextmanager
async def lifespan(app):
    async def janitor():
        while True:
            await asyncio.to_thread(cleanup)
            await asyncio.sleep(60)

    await asyncio.to_thread(cleanup)
    task = asyncio.create_task(janitor())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


api = FastAPI(title="FileCraft API", lifespan=lifespan, docs_url="/api/docs", redoc_url=None)
api.include_router(router)


@api.get("/api/health")
async def health():
    return {"status": "ok"}


@api.exception_handler(BodyLimit)
async def body_error(request: Request, exc: BodyLimit):
    return JSONResponse({"detail": "Request exceeds the upload limit."}, 413)


@api.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    return JSONResponse({"detail": "The server could not process this request."}, 500)


api.add_middleware(LimitsMiddleware)
app = CORSMiddleware(
    api,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)
