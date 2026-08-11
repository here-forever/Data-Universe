from __future__ import annotations

import json
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Literal

import httpx

from app.core.config import Settings
from app.core.metrics import record_llm_call
from app.core.ssrf_guard import UnsafeUrlError, validate_outbound_https_url
from app.i18n import render
from app.insights.schemas import LlmConfig

Locale = Literal["zh-CN", "en-US"]


class ExternalLlmError(Exception):
    pass


@dataclass(frozen=True)
class LlmConnection:
    base_url: str
    model: str
    api_key: str | None
    api_style: Literal["responses", "chat_completions"]


class Narrator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def answer(
        self,
        question: str,
        profile: dict[str, Any],
        exploration: dict[str, Any],
        locale: Locale = "zh-CN",
        llm: LlmConfig | None = None,
    ) -> tuple[str, str, list[str], str | None]:
        evidence = build_evidence(profile, exploration, locale)
        connection = self._connection(llm)
        if connection:
            try:
                answer = self._external_answer(
                    question,
                    profile,
                    exploration,
                    locale,
                    connection,
                )
                return "external_llm", answer, evidence, connection.model
            except ExternalLlmError:
                if llm is not None:
                    raise
        return (
            "statistical_engine",
            local_answer(question, profile, exploration, locale),
            evidence,
            None,
        )

    def check(self, llm: LlmConfig) -> None:
        connection = self._connection(llm)
        if connection is None:
            raise ExternalLlmError("The model configuration is incomplete")
        self._request(
            connection,
            "Reply with OK only.",
            "This is a connection check. Do not include any other text.",
        )

    def _connection(self, llm: LlmConfig | None) -> LlmConnection | None:
        if llm is not None:
            return LlmConnection(
                base_url=str(llm.base_url).rstrip("/"),
                model=llm.model.strip(),
                api_key=llm.api_key.get_secret_value() if llm.api_key else None,
                api_style=llm.api_style,
            )
        if not self.settings.llm_api_key:
            return None
        return LlmConnection(
            base_url=self.settings.llm_base_url.rstrip("/"),
            model=self.settings.llm_model,
            api_key=self.settings.llm_api_key,
            api_style=self.settings.llm_api_style,
        )

    def _external_answer(
        self,
        question: str,
        profile: dict[str, Any],
        exploration: dict[str, Any],
        locale: Locale,
        connection: LlmConnection,
    ) -> str:
        context = {
            "shape": {
                "rows": profile.get("row_count"),
                "columns": profile.get("column_count"),
            },
            "quality_score": profile.get("quality_score"),
            "columns": profile.get("columns", []),
            "correlations": exploration.get("correlations"),
            "anomalies": exploration.get("anomalies", [])[:8],
        }
        prompt = f"Question: {question}\nEvidence: {json.dumps(context, ensure_ascii=False)}"
        return self._request(connection, prompt, external_instructions(locale))

    def _request(
        self,
        connection: LlmConnection,
        prompt: str,
        instructions: str,
    ) -> str:
        started = perf_counter()
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if connection.api_key:
            headers["Authorization"] = f"Bearer {connection.api_key}"
        if connection.api_style == "responses":
            endpoint = f"{connection.base_url}/responses"
            body = {
                "model": connection.model,
                "instructions": instructions,
                "input": prompt,
            }
        else:
            endpoint = f"{connection.base_url}/chat/completions"
            body = {
                "model": connection.model,
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": prompt},
                ],
            }
        try:
            validate_outbound_https_url(endpoint, resolve_dns=True)
        except UnsafeUrlError as error:
            self._record_llm_metrics(connection, "blocked_url", started)
            raise ExternalLlmError("The provider URL is not allowed") from error
        try:
            response = httpx.post(
                endpoint,
                headers=headers,
                json=body,
                timeout=self.settings.llm_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as error:
            self._record_llm_metrics(connection, "provider_error", started)
            raise ExternalLlmError(_provider_error(error.response.status_code)) from error
        except httpx.RequestError as error:
            self._record_llm_metrics(connection, "network_error", started)
            raise ExternalLlmError("The provider could not be reached") from error
        except ValueError as error:
            self._record_llm_metrics(connection, "invalid_json", started)
            raise ExternalLlmError("The provider returned invalid JSON") from error

        answer = _response_text(payload, connection.api_style)
        if not answer:
            self._record_llm_metrics(connection, "empty_response", started, payload)
            raise ExternalLlmError("The provider returned an empty response")
        self._record_llm_metrics(connection, "success", started, payload)
        return answer

    def _record_llm_metrics(
        self,
        connection: LlmConnection,
        status: str,
        started: float,
        payload: dict[str, Any] | None = None,
    ) -> None:
        usage = payload.get("usage", {}) if payload else {}
        input_tokens = _usage_value(usage, "input_tokens", "prompt_tokens")
        output_tokens = _usage_value(usage, "output_tokens", "completion_tokens")
        estimated_cost = (
            input_tokens * self.settings.llm_input_cost_per_million
            + output_tokens * self.settings.llm_output_cost_per_million
        ) / 1_000_000
        record_llm_call(
            api_style=connection.api_style,
            status=status,
            duration_seconds=perf_counter() - started,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_cost_usd=estimated_cost,
        )


def _provider_error(status_code: int) -> str:
    if status_code in {401, 403}:
        return "The provider rejected the supplied credentials"
    if status_code == 429:
        return "The provider rate limit was reached"
    return "The provider rejected the request"


def _usage_value(usage: Any, primary: str, fallback: str) -> int:
    if not isinstance(usage, dict):
        return 0
    value = usage.get(primary, usage.get(fallback, 0))
    return value if isinstance(value, int) and value > 0 else 0


def _response_text(
    payload: dict[str, Any],
    api_style: Literal["responses", "chat_completions"],
) -> str | None:
    if api_style == "chat_completions":
        choices = payload.get("choices", [])
        if choices and isinstance(choices[0], dict):
            content = choices[0].get("message", {}).get("content")
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                texts = [
                    item.get("text", "")
                    for item in content
                    if isinstance(item, dict) and item.get("type") in {"text", "output_text"}
                ]
                combined = "".join(str(item) for item in texts).strip()
                return combined or None
        return None
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"].strip()
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                return str(content["text"]).strip()
    return None


def external_instructions(locale: Locale) -> str:
    return render("external.instructions", locale)


def build_evidence(
    profile: dict[str, Any],
    exploration: dict[str, Any],
    locale: Locale = "zh-CN",
) -> list[str]:
    evidence = [
        render(
            "evidence.shape",
            locale,
            rows=profile.get("row_count", 0),
            columns=profile.get("column_count", 0),
        ),
        render("evidence.quality", locale, score=profile.get("quality_score", 0)),
        render(
            "evidence.issues",
            locale,
            missing=profile.get("missing_cells", 0),
            duplicates=profile.get("duplicate_rows", 0),
        ),
    ]
    strongest = exploration.get("correlations", {}).get("strongest_pairs", [])
    if strongest:
        pair = strongest[0]
        evidence.append(render("evidence.correlation", locale, **pair))
    if exploration.get("anomalies"):
        evidence.append(render("evidence.anomalies", locale, count=len(exploration["anomalies"])))
    return evidence


def local_answer(
    question: str,
    profile: dict[str, Any],
    exploration: dict[str, Any],
    locale: Locale = "zh-CN",
) -> str:
    normalized = question.casefold()
    columns = profile.get("columns", [])
    numeric = [column for column in columns if column.get("kind") == "numeric"]
    strongest = exploration.get("correlations", {}).get("strongest_pairs", [])

    if any(term in normalized for term in ("缺失", "质量", "clean", "missing")):
        most_missing = max(columns, key=lambda column: column.get("missing_count", 0), default=None)
        detail = (
            render(
                "answer.quality.missing",
                locale,
                field=most_missing["name"],
                count=most_missing["missing_count"],
            )
            if most_missing and most_missing.get("missing_count")
            else render("answer.quality.complete", locale)
        )
        return render(
            "answer.quality",
            locale,
            score=profile.get("quality_score", 0),
            detail=detail,
        )
    if any(
        term in normalized
        for term in ("相关", "关系", "因素", "correlation", "relationship", "related")
    ):
        if strongest:
            pair = strongest[0]
            return render("answer.relationship", locale, **pair)
        return render("answer.relationship.insufficient", locale)
    if any(term in normalized for term in ("异常", "突变", "突然", "outlier", "spike")):
        anomalies = exploration.get("anomalies", [])
        if anomalies:
            first = anomalies[0]
            return render("answer.anomaly", locale, **first)
        return render("answer.anomaly.none", locale)
    if (
        any(
            term in normalized
            for term in ("分布", "平均", "中位", "distribution", "mean", "average", "median")
        )
        and numeric
    ):
        field = numeric[0]
        stats = field.get("stats", {})
        return render(
            "answer.distribution",
            locale,
            field=field["name"],
            mean=stats.get("mean"),
            median=stats.get("median"),
            minimum=stats.get("min"),
            maximum=stats.get("max"),
        )
    values = {
        "rows": profile.get("row_count", 0),
        "columns": profile.get("column_count", 0),
        "score": profile.get("quality_score", 0),
    }
    if strongest:
        return render("answer.default.relationship", locale, **values, **strongest[0])
    return render("answer.default", locale, **values)
