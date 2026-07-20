import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { DatasetPage } from "./DatasetPage";

const fetchMock = vi.fn();

describe("DatasetPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  test("renders dataset list, schema, and paged preview rows", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/datasets?")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "dataset_1",
                project_id: "prj_demo",
                name: "Sales Orders",
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
                    name: "amount",
                    inferred_type: "decimal",
                    nullable: false,
                    order: 1,
                  },
                ],
              },
            ],
          }),
        );
      }

      if (url.includes("/datasets/dataset_1/preview")) {
        return Promise.resolve(
          jsonResponse({
            dataset: {
              id: "dataset_1",
              project_id: "prj_demo",
              name: "Sales Orders",
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
                  name: "amount",
                  inferred_type: "decimal",
                  nullable: false,
                  order: 1,
                },
              ],
            },
            page: 1,
            page_size: 20,
            total_rows: 2,
            rows: [
              { _das_row_id: 1, order_id: 1001, amount: 19.5 },
              { _das_row_id: 2, order_id: 1002, amount: 42 },
            ],
          }),
        );
      }

      if (url.includes("/datasets/dataset_1/quality")) {
        return Promise.resolve(
          jsonResponse(datasetQuality("dataset_1", "Sales Orders")),
        );
      }

      return Promise.resolve(jsonResponse({}));
    });

    renderWithProviders(<DatasetPage />);

    expect(await screen.findByText("Sales Orders")).toBeInTheDocument();
    expect(screen.getAllByText("ds_sales")).toHaveLength(2);
    expect(await screen.findByText("1001")).toBeInTheDocument();
    expect(screen.getByText("19.5")).toBeInTheDocument();
    expect(screen.getAllByText("integer").length).toBeGreaterThan(0);
    expect(await screen.findByText("Quality overview")).toBeInTheDocument();
    expect(screen.getByText("No major warnings")).toBeInTheDocument();
    expect(screen.getByText("Profiled fields")).toBeInTheDocument();
  });

  test("submits project id and requests datasets for that project", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    const user = userEvent.setup();

    renderWithProviders(<DatasetPage />);

    const input = screen.getByLabelText("Project ID");
    await user.clear(input);
    await user.type(input, "prj_custom");
    await user.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/datasets?project_id=prj_custom",
        expect.any(Object),
      );
    });
  });

  test("loads project and selected dataset from route query parameters", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/datasets?")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "dataset_1",
                project_id: "prj_target",
                name: "Old Dataset",
                source_preview_id: "preview_1",
                physical_table_name: "ds_old",
                row_count: 1,
                fields: [
                  {
                    name: "id",
                    inferred_type: "integer",
                    nullable: false,
                    order: 0,
                  },
                ],
              },
              {
                id: "dataset_2",
                project_id: "prj_target",
                name: "Imported Dataset",
                source_preview_id: "preview_2",
                physical_table_name: "ds_imported",
                row_count: 1,
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

      if (url.includes("/datasets/dataset_2/preview")) {
        return Promise.resolve(
          jsonResponse({
            dataset: {
              id: "dataset_2",
              project_id: "prj_target",
              name: "Imported Dataset",
              source_preview_id: "preview_2",
              physical_table_name: "ds_imported",
              row_count: 1,
              fields: [
                {
                  name: "amount",
                  inferred_type: "decimal",
                  nullable: false,
                  order: 0,
                },
              ],
            },
            page: 1,
            page_size: 20,
            total_rows: 1,
            rows: [{ _das_row_id: 1, amount: 88.8 }],
          }),
        );
      }

      if (url.includes("/datasets/dataset_2/quality")) {
        return Promise.resolve(
          jsonResponse(datasetQuality("dataset_2", "Imported Dataset")),
        );
      }

      return Promise.resolve(jsonResponse({}));
    });

    renderWithProviders(<DatasetPage />, {
      route: "/datasets?project_id=prj_target&dataset_id=dataset_2",
    });

    expect(screen.getByLabelText("Project ID")).toHaveValue("prj_target");
    expect(await screen.findByText("Imported Dataset")).toBeInTheDocument();
    expect(await screen.findByText("88.8")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/datasets?project_id=prj_target",
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/datasets/dataset_2/preview?page=1&page_size=20",
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/datasets/dataset_2/quality",
        expect.any(Object),
      );
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function datasetQuality(datasetId: string, name: string) {
  return {
    dataset: {
      id: datasetId,
      project_id: "prj_demo",
      name,
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
        { name: "amount", inferred_type: "decimal", nullable: false, order: 1 },
      ],
    },
    row_count: 2,
    field_count: 2,
    null_cell_count: 0,
    null_cell_ratio: 0,
    duplicate_row_count: 0,
    warnings: [],
    field_profiles: [
      {
        name: "order_id",
        inferred_type: "integer",
        nullable: false,
        null_count: 0,
        null_ratio: 0,
        distinct_count: 2,
        duplicate_count: 0,
        sample_values: [1001, 1002],
        warnings: [],
      },
      {
        name: "amount",
        inferred_type: "decimal",
        nullable: false,
        null_count: 0,
        null_ratio: 0,
        distinct_count: 2,
        duplicate_count: 0,
        sample_values: [19.5, 42],
        warnings: [],
      },
    ],
  };
}
