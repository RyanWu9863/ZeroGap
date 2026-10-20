"""Jev 沒把握時，請 Ollama 從前 3 名選一個（規格書 3、7.1）。

逾時、連不上、回答不是候選之一，一律採用 Jev 機率最高的選項，`used_llm` 是 False。
用 Ollama 的結構化輸出（`format` 帶 JSON schema），限制它只能回答候選的代碼。
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.planning.choose import LLM_TOP_N, ChoiceQuestion

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class LlmPick:
    code: str
    used_llm: bool  # False：沒有問到 LLM，採用的是 Jev 機率最高的選項


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
        fallback = LlmPick(code=ranked[0], used_llm=False)
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
        try:
            resp = httpx.post(f"{self.base_url}/api/generate", json=body, timeout=self.timeout)
            resp.raise_for_status()
            choice = json.loads(resp.json()["response"])["choice"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            log.warning("Ollama 代選失敗，改用 Jev 最高的選項：%r", exc)
            return fallback
        if choice not in candidates:
            log.warning("Ollama 回答的 %r 不是候選之一，改用 Jev 最高的選項", choice)
            return fallback
        return LlmPick(code=choice, used_llm=True)

    def is_connected(self) -> bool:
        """狀態列用的快速檢查；結果由呼叫端快取 30 秒（5.2）。"""
        try:
            return httpx.get(f"{self.base_url}/api/tags", timeout=2.0).status_code == 200
        except httpx.HTTPError:
            return False


class MockLlm:
    """LLM_MODE=mock：不呼叫，直接採用 Jev 機率最高的選項。"""

    def pick(self, question: ChoiceQuestion, probs: dict[str, float]) -> LlmPick:
        return LlmPick(code=_ranked(probs)[0], used_llm=False)

    def is_connected(self) -> bool:
        return False
