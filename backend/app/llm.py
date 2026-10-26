"""Jev 沒把握時，請 Ollama 從前 3 名選一個（規格書 3、7.1）。

逾時、連不上、回答不是候選之一，一律採用 Jev 機率最高的選項，`used_llm` 是 False。
用 Ollama 的結構化輸出（`format` 帶 JSON schema），限制它只能回答候選的代碼。
`status`、`latency_ms`、`model` 只是記錄這次代選的結果，給決策紀錄用，不影響選擇。
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import httpx

from app.planning.choose import LLM_TOP_N, ChoiceQuestion

log = logging.getLogger(__name__)

# ok：回答了候選之一；disabled：LLM_MODE=mock，沒有呼叫。
# 其他都是失敗，改用 Jev 機率最高的選項：
# timeout 逾時、connect 連不上、http 回應錯誤碼、network 其他連線錯誤、
# invalid_response 回答不是約定的 JSON、not_candidate 回答不在候選裡
LlmStatus = Literal[
    "ok", "disabled", "timeout", "connect", "http", "network", "invalid_response", "not_candidate"
]


@dataclass(frozen=True)
class LlmPick:
    code: str
    used_llm: bool  # False：沒有問到 LLM，採用的是 Jev 機率最高的選項
    status: LlmStatus | None = None  # None：呼叫端沒有記錄（例如測試用的假物件）
    latency_ms: float | None = None  # 呼叫 Ollama 花的時間；沒有呼叫是 None
    model: str | None = None


class Llm(Protocol):
    def pick(self, question: ChoiceQuestion, probs: dict[str, float]) -> LlmPick: ...
    def is_connected(self) -> bool: ...


def _ranked(probs: dict[str, float]) -> list[str]:
    return sorted(probs, key=lambda k: (-probs[k], k))


def build_prompt(question: ChoiceQuestion, candidates: list[str]) -> str:
    by_code = {o.code: o for o in question.options}
    lines = [
        "你是行程規劃助手。請依使用者的偏好，從候選中選出最適合的一個。",
        f"題目：{question.instructions}",
        f"使用者偏好：{json.dumps(question.state, ensure_ascii=False, default=str)}",
        "候選：",
    ]
    for code in candidates:
        o = by_code[code]
        attrs = json.dumps(o.attrs, ensure_ascii=False, default=str)
        lines.append(f"- {code}：{o.label}，{attrs}")
    lines.append('只回答 JSON，例如 {"choice": "' + candidates[0] + '"}。')
    return "\n".join(lines)


class LlmPicker:
    def __init__(
        self,
        base_url: str,
        model: str,
        timeout: float = 30.0,
        top_n: int = LLM_TOP_N,
        keep_alive: str = "30m",
        think: bool | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.top_n = top_n
        # 模型第一次載入要將近一分鐘，會超過逾時；讓它留在記憶體裡久一點
        self.keep_alive = keep_alive
        # qwen3 這類會先「思考」的模型，設成 False 可以快一倍；None 就不送這個參數
        self.think = think

    def pick(self, question: ChoiceQuestion, probs: dict[str, float]) -> LlmPick:
        ranked = _ranked(probs)
        candidates = ranked[: self.top_n]
        body: dict[str, Any] = {
            "model": self.model,
            "prompt": build_prompt(question, candidates),
            "stream": False,
            "format": {
                "type": "object",
                "properties": {"choice": {"type": "string", "enum": candidates}},
                "required": ["choice"],
            },
            "options": {"temperature": 0},
            "keep_alive": self.keep_alive,
        }
        if self.think is not None:
            body["think"] = self.think
        start = time.perf_counter()
        status, choice, error = self._call(body)
        latency_ms = round((time.perf_counter() - start) * 1000, 1)

        def fallback(why: LlmStatus) -> LlmPick:
            return LlmPick(ranked[0], False, status=why, latency_ms=latency_ms, model=self.model)

        if status != "ok":
            log.warning("Ollama 代選失敗（%s），改用 Jev 最高的選項：%r", status, error)
            return fallback(status)
        if choice not in candidates:
            log.warning("Ollama 回答的 %r 不是候選之一，改用 Jev 最高的選項", choice)
            return fallback("not_candidate")
        return LlmPick(choice, True, status="ok", latency_ms=latency_ms, model=self.model)

    def _call(self, body: dict[str, Any]) -> tuple[LlmStatus, Any, Exception | None]:
        """回傳 (狀態, 回答, 錯誤)。攔下的錯誤和原本一樣，只是分開記錄是哪一種。"""
        try:
            resp = httpx.post(f"{self.base_url}/api/generate", json=body, timeout=self.timeout)
            resp.raise_for_status()
            return "ok", json.loads(resp.json()["response"])["choice"], None
        except httpx.TimeoutException as exc:  # 含連線逾時
            return "timeout", None, exc
        except httpx.ConnectError as exc:
            return "connect", None, exc
        except httpx.HTTPStatusError as exc:
            return "http", None, exc
        except httpx.HTTPError as exc:
            return "network", None, exc
        except (ValueError, KeyError, TypeError) as exc:
            return "invalid_response", None, exc

    def is_connected(self) -> bool:
        """狀態列用的快速檢查；結果由呼叫端快取 30 秒（5.2）。"""
        try:
            return httpx.get(f"{self.base_url}/api/tags", timeout=2.0).status_code == 200
        except httpx.HTTPError:
            return False


class MockLlm:
    """LLM_MODE=mock：不呼叫，直接採用 Jev 機率最高的選項。"""

    def pick(self, question: ChoiceQuestion, probs: dict[str, float]) -> LlmPick:
        return LlmPick(code=_ranked(probs)[0], used_llm=False, status="disabled")

    def is_connected(self) -> bool:
        return False
