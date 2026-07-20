import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { DataSourcesPage } from "./DataSourcesPage";

const fetchMock = vi.fn();

describe("DataSourcesPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  test("shows local file intake, upload history, and linked datasets", async () => {
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

      if (url.includes("/datasets")) {
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
                ],
              },
            ],
          }),
        );
      }

      if (url.includes("/data-sources/external-databases")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "src_1",
                project_id: "prj_demo",
                name: "Warehouse readonly",
                database_type: "postgresql",
                host: "warehouse.local",
                port: 5432,
                database_name: "analytics",
                username: "readonly_user",
                read_only: true,
                status: "available",
                last_error: null,
                archived_at: null,
                created_at: "2026-07-04T10:00:00Z",
                updated_at: "2026-07-04T10:01:00Z",
              },
            ],
          }),
        );
      }

      return Promise.resolve(jsonResponse({}));
    });

    renderWithProviders(<DataSourcesPage />);

    expect(
      await screen.findByRole("heading", { name: "Source intake center" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload file" })).toHaveAttribute(
      "href",
      "/import?project_id=prj_demo",
    );
    expect(
      await screen.findByRole("link", { name: "Resume latest" }),
    ).toHaveAttribute(
      "href",
      "/import?project_id=prj_demo&preview_id=preview_1",
    );
    expect(screen.getAllByText("sales.csv").length).toBeGreaterThan(0);
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(
      screen.getByText("Only CSV and Excel files are supported"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sales Orders")).toBeInTheDocument();
    expect(screen.getByText("External database")).toBeInTheDocument();
    expect(screen.getByText("Warehouse readonly")).toBeInTheDocument();
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(screen.getByText("API source")).toBeInTheDocument();
  });

  test("saves and tests an external database connection", async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/imports/uploads")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }

        if (url.includes("/datasets")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }

        if (url.includes("/data-sources/external-imports")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }

        if (
          url.endsWith("/data-sources/external-databases") &&
          init?.method === "POST"
        ) {
          expect(init.body).toContain('"database_type":"mysql"');
          expect(init.body).toContain('"read_only":true');
          expect(init.body).toContain('"password":"secret-password"');
          return Promise.resolve(
            jsonResponse({
              ...connectionPayload,
              status: "untested",
              last_error: null,
            }),
          );
        }

        if (
          url.endsWith("/data-sources/external-databases/src_1/schema") &&
          init?.method === "GET"
        ) {
          return Promise.resolve(jsonResponse(schemaPayload));
        }

        if (
          url.endsWith(
            "/data-sources/external-databases/src_1/preview-table",
          ) &&
          init?.method === "POST"
        ) {
          expect(init.body).toContain('"schema_name":"public"');
          expect(init.body).toContain('"table_name":"orders"');
          return Promise.resolve(jsonResponse(tablePreviewPayload));
        }

        if (
          url.endsWith("/data-sources/external-databases/src_1/import-table") &&
          init?.method === "POST"
        ) {
          expect(init.body).toContain('"schema_name":"public"');
          expect(init.body).toContain('"table_name":"orders"');
          expect(init.body).toContain('"dataset_name":"Orders"');
          expect(init.body).toContain('"name":"buyer_name"');
          return Promise.resolve(
            jsonResponse({
              dataset: importedTableDataset,
              row_count: 2,
              source_type: "external_table",
            }),
          );
        }

        if (
          url.endsWith("/data-sources/external-databases/src_1/preview-sql") &&
          init?.method === "POST"
        ) {
          expect(init.body).toContain(
            '"sql":"SELECT region, amount FROM orders"',
          );
          return Promise.resolve(jsonResponse(sqlPreviewPayload));
        }

        if (
          url.endsWith("/data-sources/external-databases/src_1/import-sql") &&
          init?.method === "POST"
        ) {
          expect(init.body).toContain(
            '"sql":"SELECT region, amount FROM orders"',
          );
          expect(init.body).toContain('"dataset_name":"SQL Orders"');
          return Promise.resolve(
            jsonResponse({
              dataset: importedSqlDataset,
              row_count: 1,
              source_type: "external_sql",
            }),
          );
        }

        if (
          url.endsWith("/data-sources/external-databases/src_1/test") &&
          init?.method === "POST"
        ) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              message: "Read-only connection test succeeded",
              connection: {
                ...connectionPayload,
                status: "available",
                last_error: null,
              },
            }),
          );
        }

        if (url.includes("/data-sources/external-databases")) {
          return Promise.resolve(
            jsonResponse({
              items: [
                {
                  ...connectionPayload,
                  status: "untested",
                  last_error: null,
                },
              ],
            }),
          );
        }

        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(<DataSourcesPage />);

    await screen.findByText("Warehouse readonly");
    await user.click(screen.getByRole("button", { name: "MySQL" }));
    await user.type(
      screen.getByLabelText("Connection name"),
      "Warehouse readonly",
    );
    await user.type(screen.getByLabelText("Host"), "mysql.local");
    await user.clear(screen.getByLabelText("Database"));
    await user.type(screen.getByLabelText("Database"), "analytics");
    await user.type(screen.getByLabelText("Username"), "readonly_user");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Save connection" }));

    expect(
      await screen.findByText(
        "Saved Warehouse readonly. Run a connection test before importing tables.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Test" }));

    expect(
      await screen.findByText("Read-only connection test succeeded"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discover" }));

    expect(await screen.findByText("public.orders")).toBeInTheDocument();
    await user.click(screen.getByText("public.orders").closest("button")!);
    expect(screen.getByDisplayValue("Orders")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview table" }));
    expect(await screen.findByText("Preview result")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Field name 1"));
    await user.type(screen.getByLabelText("Field name 1"), "buyer_name");
    await user.click(screen.getByRole("button", { name: "Confirm import" }));

    expect(
      await screen.findByText("Created Orders (2 rows)"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open dataset" })).toHaveAttribute(
      "href",
      "/datasets?project_id=prj_demo&dataset_id=dataset_table_1",
    );

    const sqlDatasetNameInput = screen.getByLabelText("Dataset name", {
      selector: "#external-sql-dataset-name",
    });
    await user.type(sqlDatasetNameInput, "SQL Orders");
    const sqlInput = screen.getByLabelText("SQL");
    await user.clear(sqlInput);
    await user.type(sqlInput, "SELECT region, amount FROM orders");
    await user.click(
      screen.getByRole("button", { name: "Preview SQL result" }),
    );
    expect(await screen.findByDisplayValue("region")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirm SQL import" }),
    );

    expect(
      await screen.findByText("Created SQL Orders (1 rows)"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/data-sources/external-databases/src_1/test",
        expect.objectContaining({ method: "POST" }),
      );
    });
  }, 10000);

  test("updates, archives, and restores a saved connection", async () => {
    let archivedAt: string | null = null;
    let host = connectionPayload.host;
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/imports/uploads")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }
        if (url.includes("/datasets")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }
        if (url.includes("/data-sources/external-imports")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }
        if (
          url.endsWith("/data-sources/external-databases/src_1") &&
          init?.method === "PATCH"
        ) {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          expect(body.password).toBeUndefined();
          expect(body.host).toBe("warehouse-primary.local");
          host = String(body.host);
          return Promise.resolve(
            jsonResponse({
              ...connectionPayload,
              host,
              archived_at: archivedAt,
              status: "untested",
              last_error: null,
            }),
          );
        }
        if (
          url.endsWith("/data-sources/external-databases/src_1/archive") &&
          init?.method === "POST"
        ) {
          archivedAt = "2026-07-16T11:00:00Z";
          return Promise.resolve(
            jsonResponse({
              ...connectionPayload,
              host,
              archived_at: archivedAt,
            }),
          );
        }
        if (
          url.endsWith("/data-sources/external-databases/src_1/restore") &&
          init?.method === "POST"
        ) {
          archivedAt = null;
          return Promise.resolve(
            jsonResponse({
              ...connectionPayload,
              host,
              archived_at: archivedAt,
              status: "untested",
            }),
          );
        }
        if (url.includes("/data-sources/external-databases")) {
          return Promise.resolve(
            jsonResponse({
              items: [
                {
                  ...connectionPayload,
                  host,
                  archived_at: archivedAt,
                  status: "untested",
                  last_error: null,
                },
              ],
            }),
          );
        }

        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(<DataSourcesPage />);

    await screen.findByText("Warehouse readonly");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const hostInput = screen.getByLabelText("Host");
    await user.clear(hostInput);
    await user.type(hostInput, "warehouse-primary.local");
    await user.click(screen.getByRole("button", { name: "Update connection" }));

    expect(
      await screen.findByText(
        "Updated Warehouse readonly. Test it before the next import.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(
      await screen.findByRole("button", { name: "Restore" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
  }, 10000);
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

const connectionPayload = {
  id: "src_1",
  project_id: "prj_demo",
  name: "Warehouse readonly",
  database_type: "mysql",
  host: "mysql.local",
  port: 3306,
  database_name: "analytics",
  username: "readonly_user",
  read_only: true,
  archived_at: null,
  created_at: "2026-07-04T10:00:00Z",
  updated_at: "2026-07-04T10:01:00Z",
};

const schemaPayload = {
  connection: connectionPayload,
  tables: [
    {
      schema_name: "public",
      table_name: "orders",
      columns: [
        {
          name: "customer",
          data_type: "TEXT",
          inferred_type: "text",
          nullable: false,
          order: 0,
        },
        {
          name: "amount",
          data_type: "NUMERIC",
          inferred_type: "decimal",
          nullable: false,
          order: 1,
        },
      ],
    },
  ],
};

const tablePreviewPayload = {
  source_type: "external_table",
  fields: [
    {
      name: "customer",
      inferred_type: "text",
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
    {
      customer: "Ada",
      amount: 19.5,
    },
  ],
  row_count: 1,
  limit: 100,
};

const sqlPreviewPayload = {
  source_type: "external_sql",
  fields: [
    {
      name: "region",
      inferred_type: "text",
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
    {
      region: "West",
      amount: 61.5,
    },
  ],
  row_count: 1,
  limit: 100,
};

const importedTableDataset = {
  id: "dataset_table_1",
  project_id: "prj_demo",
  name: "Orders",
  source_preview_id: "",
  physical_table_name: "ds_table",
  row_count: 2,
  fields: [
    {
      name: "customer",
      inferred_type: "text",
      nullable: false,
      order: 0,
    },
  ],
};

const importedSqlDataset = {
  id: "dataset_sql_1",
  project_id: "prj_demo",
  name: "SQL Orders",
  source_preview_id: "",
  physical_table_name: "ds_sql",
  row_count: 1,
  fields: [
    {
      name: "region",
      inferred_type: "text",
      nullable: false,
      order: 0,
    },
  ],
};
