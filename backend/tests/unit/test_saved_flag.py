"""網頁的 SSE `result` 多帶 `saved`（規格書 6.8，v0.23）：存成功 true、存不進去 false。

存不進去時，自己的瀏覽器還看得到 /p/{job_id}，但傳出去的連結會 404；前端看這個欄位把分享停用。
MCP 不走這裡（它用 on_saved 決定附不附 share_url），回傳的格式不變。
"""

import asyncio

from app.plan_stream import with_saved_flag

EVENTS = [
    ("queued", {"job_id": "j", "position": 1}),
    ("progress", {"stage": "filtering"}),
    ("result", {"job_id": "j", "plans": []}),
]


def source(saved: list[bool], ok: bool | None, closed: list[bool] | None = None):
    """像 plan_events：交出 result 前先呼叫 on_saved（這裡直接寫進 saved）。"""

    async def gen():
        try:
            for name, data in EVENTS:
                if name == "result" and ok is not None:
                    saved.append(ok)
                yield name, data
        finally:
            await asyncio.sleep(0)
            if closed is not None:
                closed.append(True)

    return gen()


async def collect(events):
    return [item async for item in events]


async def test_result_says_saved_true_when_saving_worked():
    saved: list[bool] = []
    out = await collect(with_saved_flag(source(saved, True), saved))
    assert out[:2] == EVENTS[:2]  # 其他事件原封不動
    assert out[2] == ("result", {"job_id": "j", "plans": [], "saved": True})


async def test_result_says_saved_false_when_saving_failed():
    saved: list[bool] = []
    out = await collect(with_saved_flag(source(saved, False), saved))
    assert out[2] == ("result", {"job_id": "j", "plans": [], "saved": False})


async def test_result_says_saved_false_when_save_never_reported():
    saved: list[bool] = []
    out = await collect(with_saved_flag(source(saved, None), saved))
    assert out[2][1]["saved"] is False


async def test_does_not_change_the_original_result_dict():
    saved: list[bool] = []
    await collect(with_saved_flag(source(saved, True), saved))
    assert EVENTS[2][1] == {"job_id": "j", "plans": []}  # 存進 Redis 的那份不會被多加欄位


async def test_closing_early_closes_the_inner_stream_now():
    # 和 plan_events 一樣：提早關掉要馬上收尾，才會釋放這個 IP 的「規劃中」標記
    saved: list[bool] = []
    closed: list[bool] = []
    events = with_saved_flag(source(saved, True, closed), saved)
    await anext(events)
    await events.aclose()
    assert closed == [True]
