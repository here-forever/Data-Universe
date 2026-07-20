import re

from app.core.errors import AppError

READ_ONLY_STARTERS = ("select", "with")
DANGEROUS_SQL_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|merge|grant|revoke|copy|call|execute)\b",
    re.IGNORECASE,
)


def validate_read_only_sql(sql: str) -> None:
    normalized = strip_sql_comments(sql).strip()
    if not normalized:
        raise AppError("SQL cannot be empty", "sql_empty", 400)
    if ";" in normalized.rstrip(";"):
        raise AppError("Only one SQL statement is allowed", "sql_multiple_statements", 400)
    normalized = normalized.rstrip(";").strip()
    lowered = normalized.lower()
    if not lowered.startswith(READ_ONLY_STARTERS):
        raise AppError("Only read-only SELECT queries are allowed", "sql_not_read_only", 400)
    if DANGEROUS_SQL_PATTERN.search(normalized):
        raise AppError("SQL contains a forbidden operation", "sql_forbidden_operation", 400)


def strip_sql_comments(sql: str) -> str:
    without_line_comments = re.sub(r"--.*?$", "", sql, flags=re.MULTILINE)
    return re.sub(r"/\*.*?\*/", "", without_line_comments, flags=re.DOTALL)
