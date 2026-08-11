import codecs
import csv
import json
from io import BytesIO, TextIOWrapper
from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import BinaryIO

import pandas as pd
from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import AppError

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".xlsm", ".json", ".txt"}
JSON_COLLECTION_KEYS = ("data", "records", "items", "rows")


async def spool_upload(file: UploadFile, settings: Settings) -> SpooledTemporaryFile[bytes]:
    validate_upload_filename(file.filename or "dataset.csv")
    stream = SpooledTemporaryFile(max_size=settings.upload_spool_max_bytes, mode="w+b")
    total = 0
    try:
        while chunk := await file.read(settings.upload_chunk_bytes):
            total += len(chunk)
            if total > settings.upload_max_bytes:
                raise AppError("The uploaded file exceeds the size limit", "file_too_large", 413)
            stream.write(chunk)
        if total == 0:
            raise AppError("The uploaded file is empty", "empty_file", 400)
        stream.seek(0)
        return stream
    except Exception:
        stream.close()
        raise


def validate_upload_filename(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise AppError(
            "Only CSV, Excel, JSON, and TXT files are supported",
            "unsupported_file_type",
            400,
        )
    return extension


def parse_upload(filename: str, content: BinaryIO | bytes, settings: Settings) -> pd.DataFrame:
    extension = validate_upload_filename(filename)
    stream = BytesIO(content) if isinstance(content, bytes) else content
    size = _stream_size(stream)
    if size == 0:
        raise AppError("The uploaded file is empty", "empty_file", 400)
    if size > settings.upload_max_bytes:
        raise AppError("The uploaded file exceeds the size limit", "file_too_large", 413)

    try:
        if extension in {".csv", ".txt"}:
            frame = _read_delimited(stream)
        elif extension == ".json":
            frame = _read_json(stream)
        else:
            stream.seek(0)
            frame = pd.read_excel(stream, sheet_name=0)
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


def _stream_size(stream: BinaryIO) -> int:
    current = stream.tell()
    stream.seek(0, 2)
    size = stream.tell()
    stream.seek(current)
    return size


def _detect_encoding(stream: BinaryIO) -> str:
    stream.seek(0)
    sample = stream.read(64 * 1024)
    stream.seek(0)
    if sample.startswith(codecs.BOM_UTF8):
        return "utf-8-sig"
    if sample.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return "utf-16"
    for encoding in ("utf-8", "gb18030"):
        try:
            codecs.decode(sample, encoding, errors="strict")
            return encoding
        except UnicodeDecodeError:
            continue
    raise AppError("The text encoding is not supported", "unsupported_text_encoding", 422)


def _text_stream(stream: BinaryIO) -> TextIOWrapper:
    stream.seek(0)
    return TextIOWrapper(stream, encoding=_detect_encoding(stream), newline="")


def _read_delimited(stream: BinaryIO) -> pd.DataFrame:
    text = _text_stream(stream)
    try:
        sample = text.read(8_192)
        text.seek(0)
        delimiter: str | None = None
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=",\t;|").delimiter
        except csv.Error:
            pass
        if delimiter is None:
            lines = [line.strip() for line in text if line.strip()]
            return pd.DataFrame({"value": lines})
        return pd.read_csv(text, sep=delimiter)
    finally:
        text.detach()


def _read_json(stream: BinaryIO) -> pd.DataFrame:
    text = _text_stream(stream)
    try:
        payload = json.load(text)
    except json.JSONDecodeError as error:
        raise AppError("The JSON document is invalid", "invalid_json", 422) from error
    finally:
        text.detach()

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
