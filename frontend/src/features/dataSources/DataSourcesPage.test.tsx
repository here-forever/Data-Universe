import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { DataSourcesPage } from "./DataSourcesPage";

const fetchMock = vi.fn();

describe("DataSourcesPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  test("focuses the source center on local CSV and Excel imports", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/imports/uploads")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "file_1",
                project_id: "prj_demo",
                uploader_id: "usr_admin",
                file_name: "sales.csv",
                file_type: "csv",
                size_bytes: 2048,
                status: "parsed",
                error_message: null,
                preview_id: "preview_1",
                preview_row_count: 120,
                created_at: "2026-07-21T09:00:00Z",
                updated_at: "2026-07-21T09:00:01Z",
              },
              {
                id: "file_2",
                project_id: "prj_demo",
                uploader_id: "usr_admin",
                file_name: "broken.xlsx",
                file_type: "xlsx",
                size_bytes: 4096,
                status: "failed",
                error_message: "Workbook is damaged",
                preview_id: null,
                preview_row_count: null,
                created_at: "2026-07-21T08:00:00Z",
                updated_at: "2026-07-21T08:00:01Z",
              },
            ],
          }),
        );
      }
      if (url.includes("/datasets")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "dataset_1",
                project_id: "prj_demo",
                name: "销售订单",
                source_preview_id: "preview_1",
                physical_table_name: "ds_sales",
                row_count: 120,
                fields: [
                  {
                    name: "amount",
                    inferred_type: "decimal",
                    nullable: false,
                    order: 0,
                  },
                ],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    renderWithProviders(<DataSourcesPage />);

    expect(
      await screen.findByRole("heading", { name: "本地数据源" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "上传文件" })).toHaveAttribute(
      "href",
      "/import?project_id=prj_demo",
    );
    expect(
      await screen.findByRole("link", { name: "继续最近预览" }),
    ).toHaveAttribute(
      "href",
      "/import?project_id=prj_demo&preview_id=preview_1",
    );
    expect(screen.getAllByText("sales.csv").length).toBeGreaterThan(0);
    expect(screen.getByText("Workbook is damaged")).toBeInTheDocument();
    expect(screen.getByText("销售订单")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "分析" })).toHaveAttribute(
      "href",
      "/analytics?project_id=prj_demo&dataset_id=dataset_1",
    );
    expect(screen.queryByText("External database")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !String(input).includes("external-databases"),
      ),
    ).toBe(true);
  });
});

function jsonResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}
