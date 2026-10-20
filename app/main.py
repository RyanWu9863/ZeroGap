"""FastAPI 進入點。端點在 G 階段補齊，現在只有健康檢查。"""

from fastapi import FastAPI

app = FastAPI(title="ZeroGap 零空檔 API")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
