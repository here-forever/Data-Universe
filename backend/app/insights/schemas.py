from datetime import datetime
from typing import Any, Literal

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)

from app.core.ssrf_guard import validate_outbound_https_url

Locale = Literal["zh-CN", "en-US"]


class ChartRecommendation(BaseModel):
    id: str
    rank: int = Field(ge=1)
    type: Literal["line", "bar", "scatter", "histogram"]
    title: str
    reason: str
    score: int = Field(ge=0, le=100)
    confidence: Literal["high", "medium", "exploratory"]
    signals: list[str]
    x_field: str
    y_field: str | None = None
    categories: list[str] | None = None
    series: list[float] | None = None
    points: list[tuple[float, float]] | None = None


class ExploreFilter(BaseModel):
    field: str = Field(min_length=1, max_length=160)
    value: str = Field(max_length=500)


class ExploreOverview(BaseModel):
    row_count: int
    source_row_count: int
    column_count: int
    quality_score: float
    numeric_fields: int
    categorical_fields: int
    datetime_fields: int
    filters: list[ExploreFilter]


class CorrelationPair(BaseModel):
    left: str
    right: str
    value: float


class CorrelationPayload(BaseModel):
    fields: list[str]
    matrix: list[list[float | None]]
    strongest_pairs: list[CorrelationPair]


class DistributionPayload(BaseModel):
    field: str
    kind: Literal["numeric", "categorical"]
    labels: list[str]
    values: list[int]


class AnomalyPayload(BaseModel):
    row: int
    field: str
    value: Any
    z_score: float


class ExploreResponse(BaseModel):
    dataset_id: str
    revision: int
    overview: ExploreOverview
    correlations: CorrelationPayload
    distributions: list[DistributionPayload]
    anomalies: list[AnomalyPayload]
    charts: list[ChartRecommendation]


class ExploreRequest(BaseModel):
    filters: list[ExploreFilter] = Field(default_factory=list, max_length=5)
    locale: Locale = "zh-CN"


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    locale: Locale = "zh-CN"
    llm: "LlmConfig | None" = None


class LlmConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: AnyHttpUrl
    model: str = Field(min_length=1, max_length=200)
    api_key: SecretStr | None = Field(default=None, max_length=4096)
    api_style: Literal["responses", "chat_completions"] = "chat_completions"

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: AnyHttpUrl) -> AnyHttpUrl:
        validate_outbound_https_url(str(value), resolve_dns=False)
        return value

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("model cannot be blank")
        return normalized

    def public_dict(self) -> dict[str, str]:
        return {
            "base_url": str(self.base_url).rstrip("/"),
            "model": self.model,
            "api_style": self.api_style,
        }


class LlmConnectionResponse(BaseModel):
    ok: bool
    model: str
    api_style: Literal["responses", "chat_completions"]
    message: str


class AskResponse(BaseModel):
    analysis_id: str
    dataset_id: str
    mode: Literal["statistical_engine", "external_llm"]
    model: str | None = None
    answer: str
    evidence: list[str]
    suggested_chart: ChartRecommendation | None = None


class AdvancedRequest(BaseModel):
    method: Literal["regression", "hypothesis", "clustering"]
    feature: str | None = None
    target: str | None = None
    group_field: str | None = None
    group_a: str | None = None
    group_b: str | None = None
    fields: list[str] = Field(default_factory=list)
    clusters: int = Field(default=3, ge=2, le=8)

    @model_validator(mode="after")
    def validate_method_fields(self) -> "AdvancedRequest":
        if self.method == "regression" and (not self.feature or not self.target):
            raise ValueError("regression requires feature and target")
        if self.method == "hypothesis" and (
            not self.target or not self.group_field or not self.group_a or not self.group_b
        ):
            raise ValueError("hypothesis requires target, group_field, group_a, and group_b")
        if self.method == "clustering" and len(self.fields) < 2:
            raise ValueError("clustering requires at least two fields")
        return self


class AnalysisRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    kind: str
    request: dict[str, Any]
    result: dict[str, Any]
    created_at: datetime
