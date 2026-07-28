import pandas as pd

from app.data.profiler import profile_frame
from app.insights.service import chart_recommendations


def test_recommendations_rank_strong_numeric_relationship_first() -> None:
    frame = pd.DataFrame(
        {
            "date": pd.date_range("2026-01-01", periods=24, freq="D"),
            "segment": ["A", "B", "C"] * 8,
            "visits": list(range(1, 25)),
            "revenue": [value * 4.2 + (value % 2) for value in range(1, 25)],
        }
    )

    charts = chart_recommendations(frame, profile_frame(frame)["columns"], "en-US")

    assert charts[0]["type"] == "scatter"
    assert {charts[0]["x_field"], charts[0]["y_field"]} == {"visits", "revenue"}
    assert [chart["score"] for chart in charts] == sorted(
        (chart["score"] for chart in charts), reverse=True
    )
    assert [chart["rank"] for chart in charts] == list(range(1, len(charts) + 1))
    assert all(chart["id"] and len(chart["signals"]) == 3 for chart in charts)


def test_recommendations_use_distribution_shape_for_single_numeric_field() -> None:
    frame = pd.DataFrame({"response_time": [1] * 20 + [2] * 5 + [40]})

    charts = chart_recommendations(frame, profile_frame(frame)["columns"], "zh-CN")

    assert len(charts) == 1
    assert charts[0]["type"] == "histogram"
    assert charts[0]["x_field"] == "response_time"
    assert any("偏度" in signal for signal in charts[0]["signals"])
    assert charts[0]["score"] >= 70


def test_recommendations_support_categorical_frequency_without_numeric_fields() -> None:
    frame = pd.DataFrame({"status": ["new", "active", "active", "paused", "active"]})

    charts = chart_recommendations(frame, profile_frame(frame)["columns"], "en-US")

    assert len(charts) == 1
    assert charts[0]["type"] == "bar"
    assert charts[0]["categories"][0] == "active"
    assert charts[0]["series"][0] == 3
    assert "y_field" not in charts[0]
