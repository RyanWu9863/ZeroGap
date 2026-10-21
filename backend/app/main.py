"""FastAPI 進入點：掛上 /api 和 /mcp、錯誤格式、CORS（規格書 6.1、6.6）。"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy.exc import InterfaceError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import router
from app.config import get_settings
from app.mcp import mcp
from app.services import ApiError

# 要先建好 MCP 的 app，session_manager 才會存在。Host 由前面的 nginx 控制，
# 所以關掉 SDK 的 DNS rebinding 檢查（不然經過 proxy 的請求都會被擋，回 421）
mcp_app = mcp.streamable_http_app(
    streamable_http_path="/",
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # 掛進來的子 app 的 lifespan 不會執行，要在這裡啟動 MCP
    async with mcp.session_manager.run():
        yield


app = FastAPI(
    title="ZeroGap 零空檔 API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    lifespan=lifespan,
)
app.include_router(router)
app.mount("/mcp", mcp_app)


class McpWithoutSlash:
    """`/mcp` 直接當成 `/mcp/`：Starlette 預設會轉址，但官方 MCP 客戶端不跟著轉址。"""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"] == "/mcp":
            scope = {**scope, "path": "/mcp/", "raw_path": b"/mcp/"}
        await self.inner(scope, receive, send)


app.add_middleware(McpWithoutSlash)
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
