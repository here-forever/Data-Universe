from __future__ import annotations

import json
import sys
import tempfile
import tracemalloc
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "backend"))

from app.data.storage import read_page, write_frame  # noqa: E402


def measured(operation):
    tracemalloc.start()
    started = perf_counter()
    operation()
    duration = perf_counter() - started
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return {"seconds": round(duration, 4), "peak_mib": round(peak / 1024 / 1024, 2)}


def main() -> None:
    rows = 500_000
    generator = np.random.default_rng(27)
    frame = pd.DataFrame(
        {
            "record_id": np.arange(rows),
            "group": generator.choice(["Design", "Science", "Business", "Engineering"], rows),
            "metric_a": generator.normal(50, 12, rows),
            "metric_b": generator.normal(120, 24, rows),
            "metric_c": generator.normal(0, 1, rows),
            "description": [f"benchmark-observation-{index:08d}" for index in range(rows)],
        }
    )
    with tempfile.TemporaryDirectory(prefix="vibe-storage-benchmark-") as temporary:
        root = Path(temporary)
        jsonl = root / "revision-1.jsonl"
        frame.to_json(jsonl, orient="records", lines=True, force_ascii=False)
        parquet = write_frame(root, "dataset", 1, frame)
        if jsonl.stat().st_size < 50 * 1024 * 1024:
            raise RuntimeError("Benchmark JSONL input did not reach 50 MiB")

        results = {
            "input_mib": round(jsonl.stat().st_size / 1024 / 1024, 2),
            "parquet_mib": round(parquet.stat().st_size / 1024 / 1024, 2),
            "jsonl_page": measured(
                lambda: pd.read_json(jsonl, orient="records", lines=True).iloc[250_000:250_050]
            ),
            "parquet_page": measured(lambda: read_page(parquet, 250_000, 50)),
        }
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
