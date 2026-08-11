import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RowPage } from "../../lib/vibeApi";
import { PreviewTable } from "./PreviewTable";
import { formatPreviewCell } from "./previewTableUtils";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 38,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 3) }, (_, index) => ({
        index,
        key: index,
        size: 38,
        start: index * 38,
      })),
    measureElement: vi.fn(),
  }),
}));

const page: RowPage = {
  dataset_id: "dataset",
  revision: 1,
  offset: 0,
  limit: 200,
  total: 400,
  columns: ["name", "value"],
  rows: Array.from({ length: 200 }, (_, index) => ({
    name: `row-${index + 1}`,
    value: index,
  })),
};

describe("PreviewTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("仅渲染虚拟窗口并支持翻页", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<PreviewTable page={page} onNext={onNext} onPrevious={vi.fn()} />);

    expect(screen.getByText("row-1")).toBeInTheDocument();
    expect(screen.getByText("row-3")).toBeInTheDocument();
    expect(screen.queryByText("row-4")).not.toBeInTheDocument();
    expect(screen.getByText("1-200 / 400")).toBeInTheDocument();

    await user.click(screen.getByTitle("下一页"));
    expect(onNext).toHaveBeenCalledOnce();
  });

  test("空页显示零范围且单元格格式稳定", () => {
    render(
      <PreviewTable
        page={{ ...page, rows: [], total: 0 }}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
      />,
    );

    expect(screen.getByText("0-0 / 0")).toBeInTheDocument();
    expect(formatPreviewCell(null)).toBe("—");
    expect(formatPreviewCell({ value: 2 })).toBe('{"value":2}');
  });
});
