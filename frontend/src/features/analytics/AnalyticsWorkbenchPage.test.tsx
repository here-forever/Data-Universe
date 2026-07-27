import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { AnalyticsWorkbenchPage } from "./AnalyticsWorkbenchPage";

vi.mock("echarts/core", () => ({
  init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }),
  use: vi.fn(),
}));

const fetchMock = vi.fn();
let savedDefinitions: Array<Record<string, unknown>> = [];

describe("AnalyticsWorkbenchPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    savedDefinitions = [];
    global.fetch = fetchMock;
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/analytics/definitions")) {
          if (url.endsWith("/materialize")) {
            return Promise.resolve(
              jsonResponse({
                id: "view_analysis_1",
                project_id: "prj_demo",
                name: "区域分析 - 维度结果",
                description: null,
                source_type: "analysis_definition",
                source_id: "analysis_1",
                source_sql: null,
                physical_table_name: "dv_analysis_1",
                row_count: 2,
                fields: [
                  {
                    name: "region",
                    inferred_type: "text",
                    nullable: false,
                    order: 0,
                  },
                ],
              }),
            );
          }
          if (url.endsWith("/run")) {
            return Promise.resolve(
              jsonResponse({
                definition: savedDefinitions[0],
                aggregate: aggregateFixture(),
                statistics: statisticsFixture(),
                correlation: null,
                regression: null,
              }),
            );
          }
          if (init?.method === "POST") {
            const payload = JSON.parse(String(init.body));
            const definition = {
              id: "analysis_1",
              ...payload,
              configuration_version: 1,
              last_run_at: null,
              created_at: "2026-07-27T00:00:00Z",
              updated_at: "2026-07-27T00:00:00Z",
            };
            savedDefinitions = [definition];
            return Promise.resolve(jsonResponse(definition));
          }
          return Promise.resolve(jsonResponse({ items: savedDefinitions }));
        }
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
          return Promise.resolve(jsonResponse(aggregateFixture()));
        }
        if (url.includes("/statistics")) {
          return Promise.resolve(jsonResponse(statisticsFixture()));
        }
        return Promise.resolve(jsonResponse({}));
      },
    );
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

  test("saves, reruns, and promotes an analysis into downstream builders", async () => {
    const user = userEvent.setup();
    const rendered = renderWithProviders(<AnalyticsWorkbenchPage />, {
      route: "/analytics?project_id=prj_demo&dataset_id=dataset_1",
    });

    await screen.findByText("华东");
    await user.type(screen.getByLabelText("分析名称"), "区域分析");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByRole("option", { name: "区域分析" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/analytics/definitions",
      expect.objectContaining({
        body: expect.stringContaining('"source_dataset_id":"dataset_1"'),
        method: "POST",
      }),
    );

    rendered.unmount();
    renderWithProviders(<AnalyticsWorkbenchPage />, {
      route: "/analytics?project_id=prj_demo&analysis_id=analysis_1",
    });
    await waitFor(() => {
      expect(screen.getByLabelText("分析名称")).toHaveValue("区域分析");
    });

    await user.click(screen.getByRole("button", { name: "按保存配置重跑" }));
    expect(
      await screen.findByText("已按保存配置重新运行。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "生成数据视图" }));
    expect(await screen.findByText("区域分析 - 维度结果")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "配置图表" })).toHaveAttribute(
      "href",
      "/charts?project_id=prj_demo&data_view_id=view_analysis_1",
    );
    expect(screen.getByRole("link", { name: "进入看板" })).toHaveAttribute(
      "href",
      "/dashboards?project_id=prj_demo&data_view_id=view_analysis_1",
    );
  });
});

function aggregateFixture() {
  return {
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
  };
}

function statisticsFixture() {
  return {
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
  };
}

function jsonResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}
