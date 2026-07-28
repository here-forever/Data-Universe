import csv
import json
from io import BytesIO, StringIO
from pathlib import Path

import pandas as pd

from app.core.config import Settings
from app.core.errors import AppError

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".xlsm", ".json", ".txt"}
JSON_COLLECTION_KEYS = ("data", "records", "items", "rows")


def parse_upload(filename: str, content: bytes, settings: Settings) -> pd.DataFrame:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise AppError(
            "Only CSV, Excel, JSON, and TXT files are supported",
            "unsupported_file_type",
            400,
        )
    if not content:
        raise AppError("The uploaded file is empty", "empty_file", 400)
    if len(content) > settings.upload_max_bytes:
        raise AppError("The uploaded file exceeds the size limit", "file_too_large", 413)

    try:
        if extension in {".csv", ".txt"}:
            frame = _read_delimited(content)
        elif extension == ".json":
            frame = _read_json(content)
        else:
            frame = pd.read_excel(BytesIO(content), sheet_name=0)
    except AppError:
        raise
    except Exception as error:
        raise AppError(
            f"Unable to parse {extension.removeprefix('.').upper()} content: {error}",
            "file_parse_failed",
            422,
        ) from error

    if frame.empty and len(frame.columns) == 0:
        raise AppError("The uploaded file has no tabular data", "empty_table", 400)
    if len(frame) > settings.dataset_max_rows:
        raise AppError(
            f"The dataset exceeds the {settings.dataset_max_rows:,} row limit",
            "dataset_row_limit_exceeded",
            413,
        )
    if len(frame.columns) > settings.dataset_max_columns:
        raise AppError(
            f"The dataset exceeds the {settings.dataset_max_columns} column limit",
            "dataset_column_limit_exceeded",
            413,
        )

    frame = frame.copy()
    frame.columns = _normalize_columns(frame.columns)
    for column in frame.select_dtypes(include=["object", "string"]).columns:
        frame[column] = frame[column].map(
            lambda value: value.strip() if isinstance(value, str) else value
        )
        frame[column] = frame[column].replace("", pd.NA)
    return frame.convert_dtypes()


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "gb18030", "utf-16"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise AppError("The text encoding is not supported", "unsupported_text_encoding", 422)


def _read_delimited(content: bytes) -> pd.DataFrame:
    text = _decode_text(content)
    sample = text[:8_192]
    delimiter: str | None = None
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=",\t;|").delimiter
    except csv.Error:
        pass

    if delimiter is None:
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            return pd.DataFrame()
        return pd.DataFrame({"value": lines})
    return pd.read_csv(StringIO(text), sep=delimiter)


def _read_json(content: bytes) -> pd.DataFrame:
    try:
        payload = json.loads(_decode_text(content))
    except json.JSONDecodeError as error:
        raise AppError("The JSON document is invalid", "invalid_json", 422) from error

    if isinstance(payload, dict):
        wrapped = next(
            (
                payload[key]
                for key in JSON_COLLECTION_KEYS
                if key in payload and isinstance(payload[key], list)
            ),
            None,
        )
        payload = wrapped if wrapped is not None else [payload]
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        raise AppError(
            "JSON must be an object, an array of objects, or a data/records/items/rows wrapper",
            "invalid_json_structure",
            422,
        )
    return pd.json_normalize(payload, sep=".")


def _normalize_columns(columns: pd.Index) -> list[str]:
    normalized: list[str] = []
    counts: dict[str, int] = {}
    for index, raw_name in enumerate(columns):
        base = str(raw_name).strip() or f"column_{index + 1}"
        count = counts.get(base, 0) + 1
        counts[base] = count
        normalized.append(base if count == 1 else f"{base}_{count}")
    return normalized
