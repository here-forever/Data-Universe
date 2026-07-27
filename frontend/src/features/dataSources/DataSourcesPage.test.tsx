import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useLocation } from "react-router-dom";

import { setLanguageForTests } from "../../i18n";
import { renderWithProviders } from "../../test/test-utils";
import { DataSourcesPage } from "./DataSourcesPage";

const fetchMock = vi.fn();

describe("DataSourcesPage", () => {
  beforeEach(() => {
    setLanguageForTests("zh-CN");
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
    expect(screen.getByLabelText("选择本地数据文件")).toHaveAttribute(
      "accept",
      ".csv,.xlsx,.xlsm",
    );
    expect(screen.getByText("选择文件")).toBeInTheDocument();
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

    const historySection = screen
      .getByRole("heading", { name: "上传与解析记录" })
      .closest("section");
    expect(historySection).not.toBeNull();
    const history = within(historySection as HTMLElement);
    await userEvent.click(history.getByRole("button", { name: "解析失败1" }));
    expect(history.getByText("broken.xlsx")).toBeInTheDocument();
    expect(history.queryByText("sales.csv")).not.toBeInTheDocument();

    await userEvent.click(history.getByRole("button", { name: "全部2" }));
    await userEvent.type(history.getByLabelText("搜索上传记录"), "sales");
    expect(history.getByText("sales.csv")).toBeInTheDocument();
    expect(history.queryByText("broken.xlsx")).not.toBeInTheDocument();
  });

  test("uploads a selected file and opens its field preview", async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/imports/uploads") || url.includes("/datasets")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }
        if (url.endsWith("/imports/file-previews")) {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBeInstanceOf(FormData);
          expect((init?.body as FormData).get("project_id")).toBe("prj_demo");
          expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
          return Promise.resolve(
            jsonResponse({
              id: "preview_fresh",
              project_id: "prj_demo",
              uploaded_file_id: "file_fresh",
              upload_status: "parsed",
              file_name: "quarterly-sales.csv",
              file_type: "csv",
              row_count: 2,
              fields: [],
              sample_rows: [],
            }),
          );
        }
        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <DataSourcesPage />
        <LocationProbe />
      </>,
    );

    const file = new File(
      ["region,revenue\nEast,120\nWest,90\n"],
      "quarterly-sales.csv",
      { type: "text/csv" },
    );
    await user.upload(screen.getByLabelText("选择本地数据文件"), file);

    expect(
      screen.getByRole("heading", { name: "quarterly-sales.csv" }),
    ).toBeInTheDocument();
    expect(screen.getByText("文件已就绪")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "解析并预览" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/import?project_id=prj_demo&preview_id=preview_fresh",
      );
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith("/imports/file-previews") &&
            init?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  test("rejects unsupported files dropped on the import dock", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/imports/uploads") || url.includes("/datasets")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderWithProviders(<DataSourcesPage />);

    fireEvent.drop(screen.getByTestId("local-upload-dropzone"), {
      dataTransfer: {
        files: [new File(["notes"], "notes.txt", { type: "text/plain" })],
      },
    });

    expect(
      await screen.findByText("仅支持 .csv、.xlsx 或 .xlsm 文件"),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });
});

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location-probe">
      {location.pathname}
      {location.search}
    </output>
  );
}

function jsonResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}
