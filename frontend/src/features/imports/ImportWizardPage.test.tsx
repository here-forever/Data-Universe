import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { ImportWizardPage } from "./ImportWizardPage";

const fetchMock = vi.fn();

describe("ImportWizardPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  test("creates file preview, edits fields, and creates dataset", async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
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
                  size_bytes: 29,
                  status: "parsed",
                  error_message: null,
                  preview_id: "preview_1",
                  preview_row_count: 2,
                  created_at: "2026-07-04T10:00:00Z",
                  updated_at: "2026-07-04T10:00:01Z",
                },
                {
                  id: "file_2",
                  project_id: "prj_demo",
                  uploader_id: "usr_admin",
                  file_name: "notes.txt",
                  file_type: "txt",
                  size_bytes: 5,
                  status: "failed",
                  error_message: "Only CSV and Excel files are supported",
                  preview_id: null,
                  preview_row_count: null,
                  created_at: "2026-07-04T09:00:00Z",
                  updated_at: "2026-07-04T09:00:01Z",
                },
              ],
            }),
          );
        }

        if (url.endsWith("/imports/file-previews")) {
          expect(init?.body).toBeInstanceOf(FormData);
          return Promise.resolve(
            jsonResponse({
              id: "preview_1",
              project_id: "prj_demo",
              uploaded_file_id: "file_1",
              upload_status: "parsed",
              file_name: "sales.csv",
              file_type: "csv",
              row_count: 2,
              fields: [
                {
                  name: "order_id",
                  inferred_type: "integer",
                  nullable: false,
                  order: 0,
                },
                {
                  name: "amount",
                  inferred_type: "decimal",
                  nullable: false,
                  order: 1,
                },
              ],
              sample_rows: [
                { order_id: 1, amount: 19.5 },
                { order_id: 2, amount: 42 },
              ],
            }),
          );
        }

        if (url.endsWith("/imports/file-previews/preview_1")) {
          return Promise.resolve(
            jsonResponse({
              id: "preview_1",
              project_id: "prj_demo",
              uploaded_file_id: "file_1",
              upload_status: "parsed",
              file_name: "sales.csv",
              file_type: "csv",
              row_count: 2,
              fields: [
                {
                  name: "order_id",
                  inferred_type: "integer",
                  nullable: false,
                  order: 0,
                },
                {
                  name: "amount",
                  inferred_type: "decimal",
                  nullable: false,
                  order: 1,
                },
              ],
              sample_rows: [
                { order_id: 1, amount: 19.5 },
                { order_id: 2, amount: 42 },
              ],
            }),
          );
        }

        if (url.endsWith("/datasets")) {
          expect(init?.body).toContain("sales_amount");
          return Promise.resolve(
            jsonResponse({
              id: "dataset_1",
              project_id: "prj_demo",
              name: "Sales",
              source_preview_id: "preview_1",
              physical_table_name: "ds_sales",
              row_count: 2,
              fields: [
                {
                  name: "order_id",
                  inferred_type: "integer",
                  nullable: false,
                  order: 0,
                },
                {
                  name: "sales_amount",
                  inferred_type: "decimal",
                  nullable: false,
                  order: 1,
                },
              ],
            }),
          );
        }

        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(<ImportWizardPage />);

    const file = new File(["order_id,amount\n1,19.5\n2,42\n"], "sales.csv", {
      type: "text/csv",
    });
    await user.upload(screen.getByLabelText("Source file"), file);
    await user.click(screen.getByRole("button", { name: "Create preview" }));

    await screen.findByText("19.5");
    expect(screen.getAllByText("sales.csv")).toHaveLength(3);
    expect(screen.getByText("19.5")).toBeInTheDocument();
    expect(screen.getByText("Upload history")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(
      screen.getByText("Only CSV and Excel files are supported"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open preview" }));
    expect(await screen.findByDisplayValue("amount")).toBeInTheDocument();

    const amountInput = screen.getByDisplayValue("amount");
    await user.clear(amountInput);
    await user.type(amountInput, "sales_amount");
    const datasetNameInput = screen.getByLabelText("Dataset name");
    await user.clear(datasetNameInput);
    await user.type(datasetNameInput, "Sales");
    await user.click(screen.getByRole("button", { name: "Create dataset" }));

    expect(
      await screen.findByText("Created Sales (2 rows)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open dataset workspace/i }),
    ).toHaveAttribute(
      "href",
      "/datasets?project_id=prj_demo&dataset_id=dataset_1",
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/imports/uploads"),
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  test("reopens a saved preview from route query parameters", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/imports/uploads")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      if (url.endsWith("/imports/file-previews/preview_1")) {
        return Promise.resolve(
          jsonResponse({
            id: "preview_1",
            project_id: "prj_demo",
            uploaded_file_id: "file_1",
            upload_status: "parsed",
            file_name: "sales.csv",
            file_type: "csv",
            row_count: 2,
            fields: [
              {
                name: "order_id",
                inferred_type: "integer",
                nullable: false,
                order: 0,
              },
              {
                name: "amount",
                inferred_type: "decimal",
                nullable: false,
                order: 1,
              },
            ],
            sample_rows: [
              { order_id: 1, amount: 19.5 },
              { order_id: 2, amount: 42 },
            ],
          }),
        );
      }

      return Promise.resolve(jsonResponse({}));
    });

    renderWithProviders(<ImportWizardPage />, {
      route: "/import?project_id=prj_demo&preview_id=preview_1",
    });

    expect(await screen.findByDisplayValue("amount")).toBeInTheDocument();
    expect(screen.getByText("19.5")).toBeInTheDocument();
    expect(screen.getByLabelText("Dataset name")).toHaveValue("sales");
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}
