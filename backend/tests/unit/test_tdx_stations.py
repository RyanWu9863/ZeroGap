"""TDX 軌道車站的解析（v2，2026-10-20 實際抓到的資料）。"""

import json
from pathlib import Path

from app.collectors.tdx_stations import parse_stations

FIXTURES = Path(__file__).parent.parent / "fixtures" / "tdx"
COUNTIES = {"桃園市": 1, "臺北市": 2, "新北市": 3}


def load(name):
    return json.loads((FIXTURES / f"stations_{name}.json").read_text(encoding="utf-8"))


def test_tra():
    rows = parse_stations(load("tra"), "TRA", COUNTIES)
    zhongli = next(r for r in rows if r["name"] == "中壢")
    assert zhongli["station_uid"].startswith("TRA-")
    assert zhongli["operator"] == "TRA"
    assert zhongli["county_id"] == 1
    assert zhongli["geom"].startswith("SRID=4326;POINT(121.2")


def test_metro_uses_rail_system_as_operator():
    rows = parse_stations(load("tymc"), "TYMC", COUNTIES)
    assert {r["operator"] for r in rows} == {"TYMC"}
    assert any(r["name"] == "台北車站" and r["county_id"] == 2 for r in rows)


def test_unknown_county_is_skipped():
    rows = parse_stations(load("thsr"), "THSR", {"桃園市": 1})
    assert [r["name"] for r in rows] == ["桃園"]


def test_missing_position_is_skipped():
    data = load("tra")[:1]
    data[0] = {**data[0], "StationPosition": {"PositionLon": 0, "PositionLat": 0}}
    assert parse_stations(data, "TRA", {data[0]["LocationCity"]: 1}) == []
