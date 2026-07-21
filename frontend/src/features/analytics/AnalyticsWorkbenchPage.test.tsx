import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { AnalyticsWorkbenchPage } from "./AnalyticsWorkbenchPage";

vi.mock("echarts/core", () => ({
  init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }),
  use: vi.fn(),
}));

const fetchMock = vi.fn();

describe("AnalyticsWorkbenchPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/datasets") && !url.includes("/analytics")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "dataset_1",
                project_id: "prj_demo",
                name: "销售订单",
                source_preview_id: "preview_1",
                physical_table_name: "ds_sales",
                row_count: 4,
                fields: [
                  {
                    name: "region",
                    inferred_type: "text",
                    nullable: false,
                    order: 0,
                  },
                  {
                    name: "revenue",
                    inferred_type: "decimal",
                    nullable: false,
                    order: 1,
                  },
                  {
                    name: "cost",
                    inferred_type: "decimal",
                    nullable: false,
                    order: 2,
                  },
                ],
              },
            ],
          }),
        );
      }
      if (url.includes("/aggregate")) {
        return Promise.resolve(
          jsonResponse({
            dataset_id: "dataset_1",
            dataset_name: "销售订单",
            source_row_count: 4,
            filtered_row_count: 4,
            total_groups: 2,
            columns: ["region", "sum_revenue"],
            rows: [
              { region: "华东", sum_revenue: 210 },
              { region: "华西", sum_revenue: 170 },
            ],
          }),
        );
      }
      if (url.includes("/statistics")) {
        return Promise.resolve(
          jsonResponse({
            dataset_id: "dataset_1",
            source_row_count: 4,
            filtered_row_count: 4,
            numeric_fields: [
              {
                field: "revenue",
                count: 4,
                null_count: 0,
                sum: 380,
                mean: 95,
                median: 100,
                minimum: 60,
                maximum: 120,
                standard_deviation: 23.45,
                percentile_25: 82.5,
                percentile_75: 112.5,
              },
            ],
            categorical_fields: [
              {
                field: "region",
                count: 4,
                null_count: 0,
                distinct_count: 2,
                top_values: [{ value: "华东", count: 2, ratio: 0.5 }],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  test("runs dataset aggregation and exposes statistics views", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalyticsWorkbenchPage />, {
      route: "/analytics?project_id=prj_demo&dataset_id=dataset_1",
    });

    expect(
      await screen.findByRole("heading", { name: "分析工作台" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("华东")).toBeInTheDocument();
    expect(screen.getByLabelText("主维度")).toHaveValue("region");
    expect(screen.getByLabelText("指标字段")).toHaveValue("revenue");

    await user.click(screen.getByRole("button", { name: "统计概览" }));
    expect(await screen.findByText("数值字段概览")).toBeInTheDocument();
    expect(screen.getByText("23.45")).toBeInTheDocument();
    expect(screen.getByText("分类字段分布")).toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}
