"""真的 Jev 用戶端：TypeSafe System One（規格書 3.1）。`JEV_MODE=real` 時使用。

格式照官方文件（2026-10-21 查證，金鑰到了再實測）：
- `POST https://api.typesafe.ai/v1/systemone`，`Authorization: Bearer <金鑰>`
- 請求：`model`、`state`（可以是物件）、
  `questions`：{題目 id: {type: "choice", instructions, criteria}}；
  choice 的 `criteria` 是「選項代碼 → 說明」，說明可以是物件，最多 255 個
- 回應：`model`、`answers`：{題目 id: {type, choice, confidence, probabilities}}、
  `usage.input_tokens`
- 429（超過限制）、529（過載）用指數退避重試；其他 4xx 是請求本身的問題，不重試

https://docs.typesafe.ai/api/system-one.md 、https://docs.typesafe.ai/api/errors.md
"""

import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

from app.jev.base import ChoiceAnswer, JevResult
from app.planning.choose import ChoiceQuestion

log = logging.getLogger(__name__)

JEV_URL = "https://api.typesafe.ai/v1/systemone"
RETRY_STATUSES = (429, 529)


class JevError(Exception):
    pass


class JevClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float = 10.0,
        retries: int = 2,
        http: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        limiter: Callable[[], None] | None = None,
    ):
        """`limiter`：每次送出請求前呼叫（等每分鐘 300 次的額度），重試也算（5.5）。"""
        if not api_key:
            raise JevError("JEV_MODE=real 要先在 .env 填 TYPESAFE_API_KEY")
        self.api_key, self.model = api_key, model
        self.retries = retries
        self.http = http or httpx.Client(timeout=timeout)
        self.sleep = sleep
        self.limiter = limiter

    def _body(self, questions: list[ChoiceQuestion], state: dict[str, Any] | None) -> dict:
        return {
            "model": self.model,
            "state": {
                **(state or {}),
                # 每題自己的偏好（例如想吃的類別）放在各題底下，Jev 才知道對應哪一題
                "questions": {q.id: q.state for q in questions if q.state},
            },
            "questions": {
                q.id: {
                    "type": "choice",
                    "instructions": q.instructions,
                    "criteria": {o.code: {"label": o.label, "attrs": o.attrs} for o in q.options},
                }
                for q in questions
            },
        }

    def choose(
        self, questions: list[ChoiceQuestion], state: dict[str, Any] | None = None
    ) -> JevResult:
        body = self._body(questions, state)
        headers = {"Authorization": f"Bearer {self.api_key}"}
        for attempt in range(self.retries + 1):
            if self.limiter:
                self.limiter()
            try:
                resp = self.http.post(JEV_URL, json=body, headers=headers)
            except httpx.TimeoutException:
                if attempt == self.retries:
                    raise JevError("Jev 逾時") from None
                self.sleep(2**attempt)
                continue
            if resp.status_code in RETRY_STATUSES and attempt < self.retries:
                self.sleep(2**attempt)  # 1、2 秒
                continue
            if resp.status_code != 200:
                raise JevError(f"Jev HTTP {resp.status_code}：{resp.text[:200]}")
            return self._parse(resp.json(), questions)
        raise JevError("Jev 失敗")

    @staticmethod
    def _parse(data: dict[str, Any], questions: list[ChoiceQuestion]) -> JevResult:
        answers = {}
        for q in questions:
            raw = (data.get("answers") or {}).get(q.id)
            if not raw or "probabilities" not in raw:
                raise JevError(f"Jev 的回應少了題目 {q.id}")
            answers[q.id] = ChoiceAnswer(
                probabilities={k: float(v) for k, v in raw["probabilities"].items()},
                confidence=raw.get("confidence"),
            )
        return JevResult(
            answers=answers,
            model=data.get("model", ""),
            input_tokens=int((data.get("usage") or {}).get("input_tokens", 0)),
        )
