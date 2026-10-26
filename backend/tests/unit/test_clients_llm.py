"""make_llm 依設定建立 LLM：棄權開關從設定傳進 LlmPicker。"""

from app.clients import make_llm
from app.config import Settings
from app.llm import LlmPicker, MockLlm


def settings(monkeypatch, **kw) -> Settings:
    for name in ("LLM_MODE", "LLM_ALLOW_ABSTAIN"):
        monkeypatch.delenv(name, raising=False)
    return Settings(_env_file=None, **kw)


def test_abstain_is_off_by_default(monkeypatch):
    llm = make_llm(settings(monkeypatch))
    assert isinstance(llm, LlmPicker) and llm.allow_abstain is False


def test_abstain_follows_setting(monkeypatch):
    llm = make_llm(settings(monkeypatch, llm_allow_abstain=True))
    assert isinstance(llm, LlmPicker) and llm.allow_abstain is True


def test_env_variable(monkeypatch):
    for name in ("LLM_MODE", "LLM_ALLOW_ABSTAIN"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LLM_ALLOW_ABSTAIN", "true")
    assert make_llm(Settings(_env_file=None)).allow_abstain is True


def test_mock_mode_unchanged(monkeypatch):
    assert isinstance(make_llm(settings(monkeypatch, llm_mode="mock")), MockLlm)
