from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter(
    "vibe_http_requests_total",
    "HTTP requests handled by the API",
    ("method", "path", "status"),
)
HTTP_DURATION = Histogram(
    "vibe_http_request_duration_seconds",
    "HTTP request latency",
    ("method", "path"),
)
HTTP_IN_PROGRESS = Gauge(
    "vibe_http_requests_in_progress",
    "HTTP requests currently in progress",
    ("method",),
)
LLM_REQUESTS = Counter(
    "vibe_llm_requests_total",
    "External LLM calls",
    ("api_style", "status"),
)
LLM_DURATION = Histogram(
    "vibe_llm_request_duration_seconds",
    "External LLM call latency",
    ("api_style",),
)
LLM_TOKENS = Counter(
    "vibe_llm_tokens_total",
    "Tokens reported by external LLM providers",
    ("api_style", "direction"),
)
LLM_ESTIMATED_COST = Counter(
    "vibe_llm_estimated_cost_usd_total",
    "Estimated external LLM cost using configured per-million token prices",
    ("api_style",),
)


def record_llm_call(
    *,
    api_style: str,
    status: str,
    duration_seconds: float,
    input_tokens: int = 0,
    output_tokens: int = 0,
    estimated_cost_usd: float = 0,
) -> None:
    LLM_REQUESTS.labels(api_style=api_style, status=status).inc()
    LLM_DURATION.labels(api_style=api_style).observe(duration_seconds)
    if input_tokens:
        LLM_TOKENS.labels(api_style=api_style, direction="input").inc(input_tokens)
    if output_tokens:
        LLM_TOKENS.labels(api_style=api_style, direction="output").inc(output_tokens)
    if estimated_cost_usd:
        LLM_ESTIMATED_COST.labels(api_style=api_style).inc(estimated_cost_usd)
