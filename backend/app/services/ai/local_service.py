"""Deterministic local fallback for debriefs and chat.

Used when the cloud AI provider is not configured or temporarily unavailable.
"""

from __future__ import annotations

from typing import Any

from app.services.ai.base import ChatResult, DebriefResult, HealthAIService

_METRIC_META: dict[str, dict[str, Any]] = {
    "sleep_hours": {"label": "Sleep", "unit": "hrs", "decimals": 1},
    "hrv": {"label": "HRV", "unit": "ms", "decimals": 0},
    "resting_hr": {"label": "Resting HR", "unit": "bpm", "decimals": 0},
    "steps": {"label": "Steps", "unit": "steps", "decimals": 0},
}


def _metric_meta(metric_type: str) -> dict[str, Any]:
    return _METRIC_META.get(
        metric_type,
        {"label": metric_type.replace("_", " ").title(), "unit": "", "decimals": 1},
    )


def _format_value(metric_type: str, value: float | int | None) -> str:
    if value is None:
        return "No data"

    meta = _metric_meta(metric_type)
    decimals = int(meta["decimals"])
    unit = str(meta["unit"])
    formatted = f"{float(value):.{decimals}f}" if decimals else f"{round(float(value))}"
    return f"{formatted} {unit}".strip()


def _format_delta(delta: float | None) -> str:
    if delta is None:
        return "Baseline unavailable"
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta:.1f}%"


def _trend_phrase(metric: dict[str, Any]) -> str:
    trend = metric.get("trend")
    wow_delta = metric.get("wow_delta_pct")

    if trend == "improving":
        return "improving versus last week"
    if trend == "declining":
        return "declining versus last week"
    if wow_delta is not None:
        sign = "+" if wow_delta > 0 else ""
        return f"{sign}{wow_delta:.1f}% versus last week"
    return "stable week over week"


def build_highlights(summary: dict[str, Any]) -> list[dict[str, str]]:
    highlights: list[dict[str, str]] = []

    for metric in summary.get("per_metric", []):
        metric_type = str(metric.get("type"))
        avg = metric.get("current_avg")
        if avg is None:
            continue

        meta = _metric_meta(metric_type)
        highlights.append(
            {
                "label": str(meta["label"]),
                "value": _format_value(metric_type, avg),
                "delta_vs_baseline": _format_delta(metric.get("delta_pct_vs_baseline")),
            }
        )

    return highlights


def build_local_debrief_text(summary: dict[str, Any]) -> str:
    week = str(summary.get("week", "this week"))
    insufficient = bool(summary.get("insufficient_data"))
    scores = summary.get("composite_scores") or {}
    per_metric = summary.get("per_metric") or []
    notable_days = summary.get("notable_days") or []

    score_parts = []
    for key, label in (
        ("recovery", "Recovery"),
        ("sleep", "Sleep"),
        ("activity", "Activity"),
    ):
        value = scores.get(key)
        if value is not None:
            score_parts.append(f"{label} {value}")

    if score_parts:
        intro = (
            f"This local debrief covers {week}. "
            f"Composite scores: {', '.join(score_parts)}."
        )
    else:
        intro = f"This local debrief covers {week}."

    if insufficient:
        intro += " There is not enough data yet for a full narrative, but the current trends are still useful."

    metric_sentences = []
    for metric in per_metric:
        metric_type = str(metric.get("type"))
        avg = metric.get("current_avg")
        if avg is None:
            continue
        meta = _metric_meta(metric_type)
        days = metric.get("days_with_data") or 0
        baseline_delta = _format_delta(metric.get("delta_pct_vs_baseline"))
        metric_sentences.append(
            f"{meta['label']} averaged {_format_value(metric_type, avg)} across {days} day"
            f"{'' if days == 1 else 's'}, {_trend_phrase(metric)}, with a baseline delta of {baseline_delta}."
        )

    if metric_sentences:
        trends = " ".join(metric_sentences)
    else:
        trends = (
            "No synced metric data is available yet. Connect HealthKit or keep collecting data to build baselines."
        )

    if notable_days:
        top = notable_days[:2]
        notable_parts = []
        for item in top:
            metric_type = str(item.get("metric_type"))
            meta = _metric_meta(metric_type)
            notable_parts.append(
                f"{item.get('date')}: {meta['label']} {_format_value(metric_type, item.get('value'))} ({item.get('flag')})"
            )
        notable = "Notable days: " + "; ".join(notable_parts) + "."
    else:
        notable = "No major outlier days stood out this week."

    close = (
        "This version was generated from local rules because cloud AI is not configured yet. "
        "Keep syncing data for a stronger baseline and use the trends above to guide your next week."
    )

    return "\n\n".join([intro, trends, notable, close])


def build_local_chat_answer(context: dict[str, Any], user_message: str) -> str:
    message = user_message.lower()
    per_metric = {
        str(metric.get("type")): metric for metric in (context.get("per_metric") or [])
    }
    scores = context.get("composite_scores") or {}

    def metric_reply(metric_type: str) -> str | None:
        metric = per_metric.get(metric_type)
        if not metric or metric.get("current_avg") is None:
            meta = _metric_meta(metric_type)
            return f"I do not have enough synced {meta['label'].lower()} data yet to answer that well."

        meta = _metric_meta(metric_type)
        avg = _format_value(metric_type, metric.get("current_avg"))
        min_value = _format_value(metric_type, metric.get("current_min"))
        max_value = _format_value(metric_type, metric.get("current_max"))
        trend = _trend_phrase(metric)
        baseline_delta = _format_delta(metric.get("delta_pct_vs_baseline"))
        return (
            f"{meta['label']} averaged {avg} this week, ranging from {min_value} to {max_value}. "
            f"It looks {trend}, with a baseline delta of {baseline_delta}."
        )

    if any(token in message for token in ("sleep", "bed", "asleep")):
        return metric_reply("sleep_hours") or "I do not have enough sleep data yet."

    if "hrv" in message or "variability" in message:
        return metric_reply("hrv") or "I do not have enough HRV data yet."

    if any(token in message for token in ("resting heart", "resting hr", "heart rate")):
        return metric_reply("resting_hr") or "I do not have enough resting heart rate data yet."

    if any(token in message for token in ("steps", "activity", "walk", "walking")):
        return metric_reply("steps") or "I do not have enough activity data yet."

    if "recovery" in message:
        recovery = scores.get("recovery")
        sleep = scores.get("sleep")
        activity = scores.get("activity")
        return (
            f"Your current composite scores are recovery {recovery if recovery is not None else 'unavailable'}, "
            f"sleep {sleep if sleep is not None else 'unavailable'}, and "
            f"activity {activity if activity is not None else 'unavailable'}. "
            f"{metric_reply('hrv') or ''} {metric_reply('resting_hr') or ''}".strip()
        )

    if any(token in message for token in ("summary", "week", "overview", "trend", "debrief")):
        available = [
            metric_reply(metric_type)
            for metric_type in ("sleep_hours", "hrv", "resting_hr", "steps")
        ]
        summary_lines = [line for line in available if line]
        if summary_lines:
            return " ".join(summary_lines[:2])

    return (
        "Cloud AI is not configured yet, but I can still answer from your synced trends. "
        "Ask about sleep, HRV, resting heart rate, activity, recovery, or a weekly summary."
    )


class LocalHealthAIService(HealthAIService):
    """Deterministic fallback used when cloud AI is unavailable."""

    @staticmethod
    def build_chat_answer_from_context(
        context: dict[str, Any], user_message: str
    ) -> str:
        return build_local_chat_answer(context, user_message)

    async def generate_debrief(self, summary: dict) -> DebriefResult:
        return DebriefResult(
            narrative=build_local_debrief_text(summary),
            highlights=build_highlights(summary),
        )

    async def chat_response(
        self,
        system_prompt: str,
        messages: list[dict],
        user_message: str,
    ) -> ChatResult:
        return ChatResult(
            answer=(
                "Cloud AI is not configured yet, so this local fallback can only answer in a limited way. "
                + build_local_chat_answer({}, user_message)
            )
        )
