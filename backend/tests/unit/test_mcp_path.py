"""`/mcp` 直接當成 `/mcp/`：官方 MCP 客戶端不跟著轉址（2026-10-21 實測）。"""

from app.main import McpWithoutSlash


async def test_mcp_without_slash_is_rewritten():
    seen = []

    async def inner(scope, receive, send):
        seen.append((scope["path"], scope.get("raw_path")))

    wrapped = McpWithoutSlash(inner)
    await wrapped({"type": "http", "path": "/mcp", "raw_path": b"/mcp"}, None, None)
    await wrapped({"type": "http", "path": "/mcp/", "raw_path": b"/mcp/"}, None, None)
    await wrapped({"type": "http", "path": "/api/health", "raw_path": b"/api/health"}, None, None)
    assert seen == [("/mcp/", b"/mcp/"), ("/mcp/", b"/mcp/"), ("/api/health", b"/api/health")]
