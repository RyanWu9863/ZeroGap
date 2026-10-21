"""docker-compose 的 worker 分工（規格書 5.6、8.1）。

RQ 只在兩個工作之間照監聽順序挑下一個：同一個 worker 聽 `plans crawl` 時，
抓取（開眼約 14 分鐘、OSM 判斷約 20 分鐘）一開始，規劃就只能排隊等它做完（2026-10-21 實測）。
"""

import shlex
from pathlib import Path

import pytest
import yaml

from app.jobs.queue import PLANS

COMPOSE = Path(__file__).resolve().parents[3] / "docker-compose.yml"
CRAWL = "crawl"


def _worker_queues() -> dict[str, list[str]]:
    """每個跑 `rq worker` 的服務聽哪些佇列。"""
    if not COMPOSE.exists():
        pytest.skip("找不到 docker-compose.yml（例如在容器裡跑測試）")
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    out = {}
    for name, svc in services.items():
        command = svc.get("command") or []
        line = " ".join(command) if isinstance(command, list) else command
        words = shlex.split(line)
        for i in range(len(words) - 1):
            if words[i : i + 2] == ["rq", "worker"]:
                args = words[i + 2 :]
                out[name] = [
                    w for j, w in enumerate(args)
                    if not w.startswith("-") and not args[j - 1].startswith("--url")
                ]  # fmt: skip
    return out


def test_plans_and_crawl_have_separate_workers():
    queues = _worker_queues()
    assert any(PLANS in q for q in queues.values()), "沒有 worker 處理規劃"
    assert any(CRAWL in q for q in queues.values()), "沒有 worker 處理抓取"
    both = [name for name, q in queues.items() if PLANS in q and CRAWL in q]
    assert not both, f"{both} 同時聽規劃和抓取，抓取時規劃會一直排隊"
