from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.core.config import Settings
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
            response = httpx.post(
                endpoint,
                headers=headers,
                json=body,
                timeout=self.settings.llm_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as error:
            detail = _provider_error(error.response)
            raise ExternalLlmError(detail) from error
        except httpx.RequestError as error:
            raise ExternalLlmError("The provider could not be reached") from error
        except ValueError as error:
            raise ExternalLlmError("The provider returned invalid JSON") from error

        answer = _response_text(payload, connection.api_style)
        if not answer:
            raise ExternalLlmError("The provider returned an empty response")
        return answer


def _provider_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
        message = payload.get("error", {}).get("message")
        if isinstance(message, str) and message.strip():
            return f"Provider returned {response.status_code}: {message.strip()}"
    except ValueError:
        pass
    return f"Provider returned HTTP {response.status_code}"


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
                    if isinstance(item, dict)
                    and item.get("type") in {"text", "output_text"}
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
    if locale == "en-US":
        return (
            "You are a concise data guide for students. Answer in English. Use only the "
            "supplied aggregate evidence, state uncertainty, and never invent causality. "
            "Return plain text in at most 120 words."
        )
    return (
        "You are a concise data guide for students. Answer in Chinese. Use only the "
        "supplied aggregate evidence, state uncertainty, and never invent causality. "
        "Return plain text in at most 180 Chinese characters."
    )


def build_evidence(
    profile: dict[str, Any],
    exploration: dict[str, Any],
    locale: Locale = "zh-CN",
) -> list[str]:
    if locale == "en-US":
        evidence = [
            f"{profile.get('row_count', 0):,} rows and {profile.get('column_count', 0)} columns",
            f"data quality score {profile.get('quality_score', 0)} / 100",
            f"{profile.get('missing_cells', 0):,} missing cells and "
            f"{profile.get('duplicate_rows', 0):,} duplicate rows",
        ]
    else:
        evidence = [
            f"{profile.get('row_count', 0):,} 行，{profile.get('column_count', 0)} 个字段",
            f"数据质量评分 {profile.get('quality_score', 0)} / 100",
            f"{profile.get('missing_cells', 0):,} 个缺失单元格，"
            f"{profile.get('duplicate_rows', 0):,} 个重复行",
        ]
    strongest = exploration.get("correlations", {}).get("strongest_pairs", [])
    if strongest:
        pair = strongest[0]
        evidence.append(
            f"strongest numeric correlation: {pair['left']} / {pair['right']} = {pair['value']:.2f}"
            if locale == "en-US"
            else f"最强数值相关：{pair['left']} / {pair['right']} = {pair['value']:.2f}"
        )
    if exploration.get("anomalies"):
        evidence.append(
            f"{len(exploration['anomalies'])} high-priority anomaly samples"
            if locale == "en-US"
            else f"{len(exploration['anomalies'])} 个高优先级异常样本"
        )
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
        if locale == "en-US":
            detail = (
                f"{most_missing['name']} has the most missing values "
                f"({most_missing['missing_count']})"
                if most_missing and most_missing.get("missing_count")
                else "No notable missing values were found"
            )
            return (
                f"The current quality score is {profile.get('quality_score', 0)}. "
                f"{detail}. Complete any needed treatment in the Data Workbench before "
                "comparing model results."
            )
        detail = (
            f"缺失最多的是 {most_missing['name']}（{most_missing['missing_count']} 条）"
            if most_missing and most_missing.get("missing_count")
            else "没有发现明显缺失"
        )
        return (
            f"当前质量评分 {profile.get('quality_score', 0)}。{detail}，"
            "建议先在数据工作台完成处理后再比较模型结果。"
        )
    if any(
        term in normalized
        for term in ("相关", "关系", "因素", "correlation", "relationship", "related")
    ):
        if strongest:
            pair = strongest[0]
            if locale == "en-US":
                return (
                    f"{pair['left']} and {pair['right']} have the strongest linear "
                    f"correlation at {pair['value']:.2f}. Correlation is not causation; "
                    "continue with regression or a group test in the Analysis Lab."
                )
            return (
                f"{pair['left']} 与 {pair['right']} 的线性相关最强，系数为 {pair['value']:.2f}。"
                "相关不等于因果，可在分析实验室继续做回归或分组检验。"
            )
        return (
            "There are not enough complete numeric fields for correlation analysis. "
            "Check field types or address missing values first."
            if locale == "en-US"
            else "当前数据中可用于相关分析的完整数值字段不足，先检查字段类型或补齐缺失值。"
        )
    if any(term in normalized for term in ("异常", "突变", "突然", "outlier", "spike")):
        anomalies = exploration.get("anomalies", [])
        if anomalies:
            first = anomalies[0]
            if locale == "en-US":
                return (
                    f"The clearest anomaly is in {first['field']} with a value of "
                    f"{first['value']}, about {first['z_score']:.1f} standard deviations "
                    "from the mean. Check the source record to confirm whether it is a real event."
                )
            return (
                f"最明显的异常来自 {first['field']}，值为 {first['value']}，"
                f"偏离约 {first['z_score']:.1f} 个标准差。"
                "建议结合原始记录核对是否为真实事件。"
            )
        return (
            "The IQR and standard-score checks found no clear anomalies that need priority review."
            if locale == "en-US"
            else "按 IQR 与标准分数检查后，没有发现需要优先处理的明显异常。"
        )
    if (
        any(
            term in normalized
            for term in ("分布", "平均", "中位", "distribution", "mean", "average", "median")
        )
        and numeric
    ):
        field = numeric[0]
        stats = field.get("stats", {})
        if locale == "en-US":
            return (
                f"{field['name']} has a mean of {stats.get('mean')}, a median of "
                f"{stats.get('median')}, and ranges from {stats.get('min')} to "
                f"{stats.get('max')}. The gap between mean and median can indicate skew."
            )
        return (
            f"{field['name']} 的均值为 {stats.get('mean')}，中位数为 {stats.get('median')}，"
            f"范围 {stats.get('min')} 到 {stats.get('max')}。均值与中位数的差距可帮助判断偏态。"
        )
    if locale == "en-US":
        return (
            f"This dataset contains {profile.get('row_count', 0):,} rows across "
            f"{profile.get('column_count', 0)} fields, with a quality score of "
            f"{profile.get('quality_score', 0)}. "
            + (
                f"Start with the relationship between {strongest[0]['left']} and "
                f"{strongest[0]['right']}."
                if strongest
                else "Start with the recommended charts and field distributions."
            )
        )
    return (
        f"这份数据包含 {profile.get('row_count', 0):,} 行、"
        f"{profile.get('column_count', 0)} 个字段，"
        f"质量评分 {profile.get('quality_score', 0)}。"
        + (
            f"最值得先看的关系是 {strongest[0]['left']} 与 {strongest[0]['right']}。"
            if strongest
            else "建议先从推荐图表和字段分布开始探索。"
        )
    )
