from app.config import Settings


def make(monkeypatch, **env):
    # 不讀 .env，也不受本機環境變數影響
    for field in Settings.model_fields:
        monkeypatch.delenv(field.upper(), raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return Settings(_env_file=None)


def test_defaults_follow_spec_10_1(monkeypatch):
    s = make(monkeypatch)
    assert s.wait_minutes == 10
    assert s.meal_minutes == {"fast": 45, "normal": 75, "slow": 105}
    assert s.jev_min_top_probability == 0.6
    assert s.arrive_before_showtime_minutes == 15
    assert s.last_order_before_close_minutes == 30
    assert s.walk_detour_factor == 1.3
    assert s.walk_meters_per_minute == 75
    assert s.walk_limit_options == [5, 8, 12, 15, 20]
    assert s.plan_timeout_seconds == 600
    assert s.plan_queue_max_waiting == 5
    assert s.plan_queue_ttl_seconds == 900


def test_external_services_default_to_mock(monkeypatch):
    s = make(monkeypatch)
    assert s.jev_mode == "mock"
    assert s.tdx_mode == "mock"
    assert s.google_mode == "mock"
    assert s.llm_mode == "ollama"


def test_env_overrides(monkeypatch):
    s = make(monkeypatch, WAIT_MINUTES="15", MEAL_MINUTES='{"fast": 30, "normal": 60, "slow": 90}')
    assert s.wait_minutes == 15
    assert s.meal_minutes["fast"] == 30


def test_cors_origins_accepts_comma_separated(monkeypatch):
    s = make(monkeypatch, CORS_ORIGINS="http://localhost:5173,http://localhost:8080")
    assert s.cors_origins == ["http://localhost:5173", "http://localhost:8080"]
