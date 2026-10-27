"""地點搜尋用完 TDX 用戶端要關掉連線（bug 清單 L4）。"""

import pytest

from app import services
from app.config import Settings
from app.tdx import TdxError


class FakeTdx:
    instances: list["FakeTdx"] = []

    def __init__(self, *_args, **_kwargs):
        self.closed = False
        FakeTdx.instances.append(self)

    def close(self) -> None:
        self.closed = True


class FakeGeocoder:
    fail = False

    def __init__(self, _tdx, _r, _s):
        pass

    def markname(self, _name, city=None):
        if FakeGeocoder.fail:
            raise TdxError("連不上")
        return []

    def address(self, _address, city=None):
        return []


@pytest.fixture
def fakes(monkeypatch):
    FakeTdx.instances.clear()
    FakeGeocoder.fail = False
    monkeypatch.setattr(services, "TdxTransit", FakeTdx)
    monkeypatch.setattr(services, "Geocoder", FakeGeocoder)
    monkeypatch.setattr(services, "sync_redis", lambda: None)


def test_tdx_client_is_closed_after_search(fakes):
    assert services._tdx_search(Settings(), "中壢車站") == []
    assert [t.closed for t in FakeTdx.instances] == [True]


def test_tdx_client_is_closed_when_search_fails(fakes):
    FakeGeocoder.fail = True
    with pytest.raises(TdxError):
        services._tdx_search(Settings(), "中壢車站")
    assert [t.closed for t in FakeTdx.instances] == [True]
