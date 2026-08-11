from __future__ import annotations

from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq


def write_frame(root: Path, dataset_id: str, revision: int, frame: pd.DataFrame) -> Path:
    directory = root / dataset_id
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"revision-{revision}.parquet"
    frame.to_parquet(
        path,
        engine="pyarrow",
        compression="zstd",
        index=False,
        row_group_size=16_384,
    )
    clear_frame_cache()
    return path.resolve()


def read_frame(path: str | Path, columns: Iterable[str] | None = None) -> pd.DataFrame:
    resolved = Path(path).resolve()
    selected = tuple(dict.fromkeys(columns)) if columns is not None else ()
    frame = _read_frame_cached(str(resolved), resolved.stat().st_mtime_ns, selected)
    return frame.copy(deep=True)


def read_preview(path: str | Path, limit: int) -> pd.DataFrame:
    resolved = Path(path)
    if resolved.suffix.lower() != ".parquet":
        return read_frame(resolved).head(limit).reset_index(drop=True)
    parquet = pq.ParquetFile(resolved)
    batches = parquet.iter_batches(batch_size=max(1, limit))
    first = next(batches, None)
    return _arrow_to_frame(pa.Table.from_batches([first])) if first is not None else pd.DataFrame()


def read_page(path: str | Path, offset: int, limit: int) -> tuple[int, list[str], pd.DataFrame]:
    resolved = Path(path)
    if resolved.suffix.lower() != ".parquet":
        frame = read_frame(resolved)
        page = frame.iloc[offset : offset + limit].reset_index(drop=True)
        return len(frame), list(frame.columns), page

    parquet = pq.ParquetFile(resolved)
    total = parquet.metadata.num_rows
    columns = parquet.schema_arrow.names
    if offset >= total:
        return total, columns, pd.DataFrame(columns=columns)

    remaining = limit
    cursor = 0
    pieces: list[pa.Table] = []
    for row_group in range(parquet.num_row_groups):
        row_count = parquet.metadata.row_group(row_group).num_rows
        group_end = cursor + row_count
        if group_end <= offset:
            cursor = group_end
            continue
        local_offset = max(0, offset - cursor)
        take = min(remaining, row_count - local_offset)
        pieces.append(parquet.read_row_group(row_group).slice(local_offset, take))
        remaining -= take
        cursor = group_end
        if remaining == 0:
            break
    table = pa.concat_tables(pieces) if pieces else pa.table({name: [] for name in columns})
    return total, columns, _arrow_to_frame(table)


def read_sample(
    path: str | Path,
    positions: Iterable[int],
    columns: Iterable[str],
) -> pd.DataFrame:
    selected_positions = list(positions)
    if not selected_positions:
        return pd.DataFrame(columns=list(columns))
    resolved = Path(path)
    selected_columns = list(dict.fromkeys(columns))
    if resolved.suffix.lower() != ".parquet":
        sampled = read_frame(resolved, selected_columns).iloc[selected_positions]
        return sampled.reset_index(drop=True)
    table = pq.read_table(resolved, columns=selected_columns)
    sampled = table.take(pa.array(selected_positions, type=pa.int64()))
    return _arrow_to_frame(sampled)


def frame_columns(path: str | Path) -> list[str]:
    resolved = Path(path)
    if resolved.suffix.lower() == ".parquet":
        return pq.ParquetFile(resolved).schema_arrow.names
    return list(read_frame(resolved).columns)


def clear_frame_cache() -> None:
    _read_frame_cached.cache_clear()


@lru_cache(maxsize=8)
def _read_frame_cached(path: str, modified_ns: int, columns: tuple[str, ...]) -> pd.DataFrame:
    del modified_ns
    if Path(path).suffix.lower() == ".parquet":
        frame = pd.read_parquet(path, columns=list(columns) or None, engine="pyarrow")
    else:
        frame = pd.read_json(path, orient="records", lines=True)
        if columns:
            frame = frame.loc[:, list(columns)]
    return frame.convert_dtypes()


def _arrow_to_frame(table: pa.Table) -> pd.DataFrame:
    return table.to_pandas().convert_dtypes()
