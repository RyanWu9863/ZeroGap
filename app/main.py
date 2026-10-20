"""FastAPI 進入點：掛上 /api、錯誤格式、CORS（規格書 6.1）。"""

import redis
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import router
from app.config import get_settings
from app.services import ApiError

app = FastAPI(
    title="ZeroGap 零空檔 API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.include_router(router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Retry-After"],
)


def error(status: int, code: str, message: str, headers=None, reasons=None) -> JSONResponse:
    body: dict = {"code": code, "message": message}
    if reasons is not None:
        body["reasons"] = reasons
    return JSONResponse({"error": body}, status_code=status, headers=headers)


@app.exception_handler(ApiError)
async def api_error(request: Request, exc: ApiError):
    return error(exc.status, exc.code, exc.message, exc.headers, exc.reasons)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
    message = first.get("msg", "輸入不合法").removeprefix("Value error, ")
    return error(400, "VALIDATION_ERROR", f"{where}：{message}" if where else message)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
    return error(exc.status_code, codes.get(exc.status_code, "HTTP_ERROR"), str(exc.detail))


@app.exception_handler(redis.RedisError)
async def redis_down(request: Request, exc: redis.RedisError):
    return error(503, "SERVICE_UNAVAILABLE", "暫時無法服務，請稍後再試")


@app.exception_handler(OperationalError)
@app.exception_handler(InterfaceError)
async def db_down(request: Request, exc: Exception):
    return error(503, "SERVICE_UNAVAILABLE", "暫時無法服務，請稍後再試")
