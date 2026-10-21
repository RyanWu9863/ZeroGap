"""寫入時判斷店家屬性（規格書 7.3）。Jev 金鑰到之前，交給本機 Ollama（2026-10-20 決定）。

一家店要判斷的欄位一次問完，用結構化輸出限制答案只能是合法的代碼；
判斷失敗就留空，這家店不會排進規劃（10.1：沒判斷出價位或用餐時間的店不排）。
"""

import json
import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)

PRICE_RANGES = ["under_200", "200_500", "500_1000", "over_1000"]
MEAL_DURATIONS = ["fast", "normal", "slow"]
SUITABILITY = [0, 1, 2]
FIELD_HELP = {
    "category_code": "料理類別",
    "price_range": (
        "每人價位：under_200 是 200 元以下、200_500、500_1000、over_1000 是 1,000 元以上"
    ),
    "meal_duration": (
        "吃一餐要多久：fast 快速（速食、小吃）、normal 一般、slow 慢食（火鍋、燒肉、套餐）"
    ),
    "date_suitability": "適不適合約會：0 不適合、1 普通、2 適合",
}


class RestaurantJudge:
    def __init__(
        self,
        base_url: str,
        model: str,
        cuisines: dict[str, str],
        timeout: float = 30.0,
        keep_alive: str = "30m",
        think: bool | None = None,
    ):
        """`cuisines` 是 {代碼: 給模型的說明}，來自 `categories` 表（kind = cuisine）。"""
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.cuisines = cuisines
        self.timeout = timeout
        self.keep_alive = keep_alive
        self.think = think

    def _enum(self, field: str) -> list[Any]:
        return {
            "category_code": list(self.cuisines),
            "price_range": PRICE_RANGES,
            "meal_duration": MEAL_DURATIONS,
            "date_suitability": SUITABILITY,
        }[field]

    def _prompt(self, name: str, tags: dict[str, str], fields: list[str]) -> str:
        useful = {k: v for k, v in tags.items() if k in ("amenity", "cuisine", "brand", "name:en")}
        lines = [
            "你是台灣的餐廳資料整理員。依店名和標籤，判斷這家店的屬性。",
            f"店名：{name}",
            f"標籤：{json.dumps(useful, ensure_ascii=False)}",
            "要判斷的欄位：",
        ]
        for f in fields:
            lines.append(f"- {f}：{FIELD_HELP[f]}")
            if f == "category_code":
                lines.extend(f"    {code}：{desc}" for code, desc in self.cuisines.items())
        lines.append("只回答 JSON。")
        return "\n".join(lines)

    def judge(self, name: str, tags: dict[str, str], fields: list[str]) -> dict[str, Any]:
        if not fields:
            return {}
        schema = {
            "type": "object",
            "properties": {
                f: {"type": "integer" if f == "date_suitability" else "string",
                    "enum": self._enum(f)}
                for f in fields
            },
            "required": fields,
        }  # fmt: skip
        body: dict[str, Any] = {
            "model": self.model,
            "prompt": self._prompt(name, tags, fields),
            "stream": False,
            "format": schema,
            "options": {"temperature": 0},
            "keep_alive": self.keep_alive,
        }
        if self.think is not None:
            body["think"] = self.think
        try:
            resp = httpx.post(f"{self.base_url}/api/generate", json=body, timeout=self.timeout)
            resp.raise_for_status()
            answer = json.loads(resp.json()["response"])
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            log.warning("Ollama 判斷「%s」失敗：%r", name, exc)
            return {}
        if not isinstance(answer, dict):
            return {}
        return {f: answer[f] for f in fields if answer.get(f) in self._enum(f)}


class MovieJudge:
    """電影的片型（7.3 的 `genre`）：依片名、簡介、出品國，從 `categories` 的片型主清單選一個。"""

    def __init__(
        self,
        base_url: str,
        model: str,
        genres: dict[str, str],
        timeout: float = 30.0,
        keep_alive: str = "30m",
        think: bool | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.genres = genres  # {代碼: 說明}
        self.timeout = timeout
        self.keep_alive = keep_alive
        self.think = think

    def genre(self, title: str, synopsis: str | None, country: str | None) -> str | None:
        lines = [
            "你是電影資料整理員。依片名、簡介、出品國，從下面的片型選一個最符合的。",
            f"片名：{title}",
            f"出品國：{country or '不明'}",
            f"簡介：{(synopsis or '（沒有簡介）')[:400]}",
            "片型：",
            *(f"- {code}：{desc}" for code, desc in self.genres.items()),
            "只回答 JSON。",
        ]
        body: dict[str, Any] = {
            "model": self.model,
            "prompt": "\n".join(lines),
            "stream": False,
            "format": {
                "type": "object",
                "properties": {"genre": {"type": "string", "enum": list(self.genres)}},
                "required": ["genre"],
            },
            "options": {"temperature": 0},
            "keep_alive": self.keep_alive,
        }
        if self.think is not None:
            body["think"] = self.think
        try:
            resp = httpx.post(f"{self.base_url}/api/generate", json=body, timeout=self.timeout)
            resp.raise_for_status()
            value = json.loads(resp.json()["response"])["genre"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            log.warning("Ollama 判斷片型「%s」失敗：%r", title, exc)
            return None
        return value if value in self.genres else None
