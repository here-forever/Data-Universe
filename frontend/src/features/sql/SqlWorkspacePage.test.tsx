import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { SqlWorkspacePage } from "./SqlWorkspacePage";

const fetchMock = vi.fn();

describe("SqlWorkspacePage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  test("loads dataset aliases and runs a read-only SQL query", async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/sql/metadata")) {
          return Promise.resolve(
            jsonResponse({
              project_id: "prj_demo",
              datasets: [
                {
                  id: "dataset_1",
                  name: "Orders",
                  table_alias: "dataset_1",
                  row_count: 2,
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
                },
              ],
            }),
          );
        }

      if (url.endsWith("/sql/run")) {
          expect(init?.body).toContain("SELECT * FROM dataset_1 LIMIT 50");
          return Promise.resolve(
            jsonResponse({
              project_id: "prj_demo",
              executed_sql: 'SELECT * FROM "ds_1" LIMIT 50',
              columns: ["customer", "amount"],
              rows: [{ customer: "Ada", amount: 19.5 }],
              row_count: 1,
              limit: 100,
            }),
        );
      }

      if (url.endsWith("/sql/save-data-view")) {
        expect(init?.body).toContain('"name":"Orders View"');
        expect(init?.body).toContain("SELECT * FROM dataset_1 LIMIT 50");
        return Promise.resolve(
          jsonResponse({
            id: "view_1",
            project_id: "prj_demo",
            name: "Orders View",
            description: null,
            source_type: "sql_query",
            source_id: null,
            source_sql: "SELECT * FROM dataset_1 LIMIT 50",
            physical_table_name: "dv_1",
            row_count: 1,
            fields: [
              { name: "customer", inferred_type: "text", nullable: false, order: 0 },
              { name: "amount", inferred_type: "decimal", nullable: false, order: 1 },
            ],
          }),
        );
      }

        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(<SqlWorkspacePage />);

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("dataset_1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Orders/i }));
    await user.click(screen.getByRole("button", { name: "Run query" }));

    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("19.5")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Data view name"));
    await user.type(screen.getByLabelText("Data view name"), "Orders View");
    await user.click(screen.getByRole("button", { name: "Save as data view" }));
    expect(
      await screen.findByText(/Saved Orders View \(1 rows\)/),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}
