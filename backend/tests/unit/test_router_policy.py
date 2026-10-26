"""Router 政策：判斷 Jev 有沒有把握的幾種方式。預設 fixed 0.6 必須和 needs_llm 完全相同。"""

import math
import random

import pytest

from app.jev.base import ChoiceAnswer
from app.llm import _ranked
from app.planning.choose import (
    MIN_TOP_PROBABILITY,
    RouterPolicy,
    decision_features,
    needs_llm,
)


def random_probs(rng: random.Random) -> dict[str, float]:
    k = rng.randint(1, 10)
    raw = [rng.random() ** rng.choice([1, 3, 6]) for _ in range(k)]
    total = sum(raw)
    return {f"r{i}": v / total for i, v in enumerate(raw)}


def test_default_policy_is_fixed_0_6():
    p = RouterPolicy()
    assert (p.kind, p.param) == ("fixed", MIN_TOP_PROBABILITY)


def test_fixed_policy_matches_needs_llm_exactly():
    rng = random.Random(20261026)
    for _ in range(3000):
        probs = random_probs(rng)
        t = rng.choice([0.0, 0.3, 0.5, 0.6, 0.7, 1.0, rng.random()])
        assert RouterPolicy("fixed", t).unsure(probs) == needs_llm(probs, t)
    # 邊界：剛好等於門檻算有把握
    assert RouterPolicy().unsure({"a": 0.6, "b": 0.4}) is False
    assert RouterPolicy().unsure({}) is False


def test_features():
    f = decision_features({"a": 0.5, "b": 0.3, "c": 0.2})
    assert f.k == 3
    assert (f.p_top, f.p_second) == (0.5, 0.3)
    assert f.margin == pytest.approx(0.2)
    h = -(0.5 * math.log(0.5) + 0.3 * math.log(0.3) + 0.2 * math.log(0.2))
    assert f.norm_entropy == pytest.approx(h / math.log(3))


def test_features_edge_cases():
    one = decision_features({"a": 1.0})
    assert (one.k, one.p_second, one.margin, one.norm_entropy) == (1, 0.0, 1.0, 0.0)
    uniform = decision_features({c: 0.25 for c in "abcd"})
    assert uniform.norm_entropy == pytest.approx(1.0)
    # 機率總和不是 1：熵先正規化，其他照原始值
    scaled = decision_features({"a": 1.0, "b": 0.6, "c": 0.4})
    assert scaled.norm_entropy == pytest.approx(
        decision_features({"a": 0.5, "b": 0.3, "c": 0.2}).norm_entropy
    )
    assert scaled.p_top == 1.0
    with pytest.raises(ValueError):
        decision_features({})


def test_options_policy_scales_with_number_of_options():
    policy = RouterPolicy("options", 0.3)
    # k=10：門檻 0.1 + 0.3 × 0.9 = 0.37，0.45 算有把握
    ten = {"a": 0.45, **{f"o{i}": 0.55 / 9 for i in range(9)}}
    assert policy.unsure(ten) is False
    # k=2：門檻 0.5 + 0.3 × 0.5 = 0.65，0.6 算沒把握（fixed 0.6 會說有把握）
    two = {"a": 0.6, "b": 0.4}
    assert policy.unsure(two) is True
    assert RouterPolicy().unsure(two) is False


def test_margin_and_entropy_policies():
    close = {"a": 0.42, "b": 0.40, "c": 0.18}
    clear = {"a": 0.70, "b": 0.20, "c": 0.10}
    assert RouterPolicy("margin", 0.1).unsure(close) is True
    assert RouterPolicy("margin", 0.1).unsure(clear) is False
    assert RouterPolicy("entropy", 0.7).unsure({c: 1 / 3 for c in "abc"}) is True
    assert RouterPolicy("entropy", 0.9).unsure(clear) is False


@pytest.mark.parametrize("kind", ["options", "margin", "entropy"])
def test_single_option_is_always_sure(kind):
    assert RouterPolicy(kind, 1.0).unsure({"only": 1.0}) is False
    assert RouterPolicy(kind, 0.0).unsure({}) is False


@pytest.mark.parametrize(("kind", "param"), [("magic", 0.5), ("fixed", -0.1), ("margin", 1.5)])
def test_invalid_policy(kind, param):
    with pytest.raises(ValueError):
        RouterPolicy(kind, param)


def test_top_on_tie_matches_llm_fallback():
    # 新政策可能在第一名同分時接受 Jev；這時要和 LLM 失敗時的退回選同一個
    for probs in ({"r2": 0.4, "r1": 0.4, "r3": 0.2}, {"m9": 0.5, "m10": 0.5}):
        assert ChoiceAnswer(probs).top == _ranked(probs)[0]
    assert ChoiceAnswer({"r1": 0.62, "r2": 0.38}).top == "r1"
