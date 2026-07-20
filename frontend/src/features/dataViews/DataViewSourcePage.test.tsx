import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { DataViewSourcePage } from "./DataViewSourcePage";

const fetchMock = vi.fn();

describe("DataViewSourcePage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  test("loads data views and previews rows for chart sources", async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/data-views?")) {
          return Promise.resolve(
            jsonResponse({
              items: [
                {
                  id: "view_1",
                  project_id: "prj_demo",
                  name: "Orders View",
                  description: null,
                  source_type: "sql_query",
                  source_id: null,
                  source_sql: "SELECT customer, amount FROM dataset_1",
                  physical_table_name: "dv_orders",
                  row_count: 1,
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

        if (url.includes("/data-views/view_1/preview")) {
          return Promise.resolve(
            jsonResponse({
              data_view: {
                id: "view_1",
                project_id: "prj_demo",
                name: "Orders View",
                description: null,
                source_type: "sql_query",
                source_id: null,
                source_sql: "SELECT customer, amount FROM dataset_1",
                physical_table_name: "dv_orders",
                row_count: 1,
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
              page: 1,
              page_size: 20,
              total_rows: 1,
              rows: [{ _das_row_id: 1, customer: "Ada", amount: 19.5 }],
            }),
          );
        }

        if (url.includes("/charts?")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }

        if (url.endsWith("/charts")) {
          expect(init?.body).toContain('"data_view_id":"view_1"');
          expect(init?.body).toContain('"chart_type":"line"');
          expect(init?.body).toContain('"dimension":"customer"');
          expect(init?.body).toContain('"metric":"amount"');
          expect(init?.body).toContain('"aggregation":"avg"');
          return Promise.resolve(
            jsonResponse({
              id: "chart_1",
              project_id: "prj_demo",
              data_view_id: "view_1",
              name: "Orders View Chart",
              chart_type: "line",
              config: {
                dimension: "customer",
                metric: "amount",
                aggregation: "avg",
              },
            }),
          );
        }

        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(<DataViewSourcePage mode="charts" />);

    expect((await screen.findAllByText("Orders View")).length).toBeGreaterThan(
      0,
    );
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("19.5")).toBeInTheDocument();
    expect(screen.getByText(/configure chart type/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Chart preview")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Chart type"), "line");
    await user.selectOptions(screen.getByLabelText("Aggregation"), "avg");
    await user.click(screen.getByRole("button", { name: "Save chart" }));
    expect(
      await screen.findByText("Saved Orders View Chart"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/charts",
        expect.any(Object),
      );
    });
  });

  test("creates a dashboard or report draft from chart resources", async () => {
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/data-views?")) {
          return Promise.resolve(
            jsonResponse({
              items: [
                {
                  id: "view_1",
                  project_id: "prj_demo",
                  name: "Orders View",
                  description: null,
                  source_type: "sql_query",
                  source_id: null,
                  source_sql: "SELECT customer, amount FROM dataset_1",
                  physical_table_name: "dv_orders",
                  row_count: 1,
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

        if (url.includes("/data-views/view_1/preview")) {
          return Promise.resolve(
            jsonResponse({
              data_view: {
                id: "view_1",
                project_id: "prj_demo",
                name: "Orders View",
                description: null,
                source_type: "sql_query",
                source_id: null,
                source_sql: "SELECT customer, amount FROM dataset_1",
                physical_table_name: "dv_orders",
                row_count: 1,
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
              page: 1,
              page_size: 20,
              total_rows: 1,
              rows: [{ _das_row_id: 1, customer: "Ada", amount: 19.5 }],
            }),
          );
        }

        if (url.includes("/charts?")) {
          return Promise.resolve(
            jsonResponse({
              items: [
                {
                  id: "chart_1",
                  project_id: "prj_demo",
                  data_view_id: "view_1",
                  name: "Orders Chart",
                  chart_type: "bar",
                  config: { dimension: "customer", metric: "amount" },
                },
              ],
            }),
          );
        }

        if (url.includes("/dashboards?")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }

        if (url.endsWith("/dashboards")) {
          expect(init?.body).toContain('"chart_id":"chart_1"');
          expect(init?.body).toContain('"mode":"report"');
          return Promise.resolve(
            jsonResponse({
              id: "dash_1",
              project_id: "prj_demo",
              name: "prj_demo Report",
              layout: {
                mode: "report",
                items: [{ chart_id: "chart_1", x: 0, y: 0, w: 12, h: 6 }],
              },
            }),
          );
        }

        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(<DataViewSourcePage mode="dashboards" />);

    expect((await screen.findAllByText("Orders View")).length).toBeGreaterThan(
      0,
    );
    expect((await screen.findAllByText("Orders Chart")).length).toBeGreaterThan(
      0,
    );
    await user.selectOptions(screen.getByLabelText("Layout mode"), "report");
    await user.click(screen.getByRole("button", { name: "Save layout" }));
    expect(
      await screen.findByText("Saved prj_demo Report"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/dashboards",
        expect.any(Object),
      );
    });
  });

  test("selects a data view from the route query parameters", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/data-views?")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              dataViewFixture("view_1", "Orders View"),
              dataViewFixture("view_2", "Target View"),
            ],
          }),
        );
      }

      if (url.includes("/data-views/view_2/preview")) {
        return Promise.resolve(
          jsonResponse({
            data_view: dataViewFixture("view_2", "Target View"),
            page: 1,
            page_size: 20,
            total_rows: 1,
            rows: [{ _das_row_id: 1, customer: "Lin", amount: 42 }],
          }),
        );
      }

      if (url.includes("/charts?")) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      return Promise.resolve(jsonResponse({}));
    });

    renderWithProviders(<DataViewSourcePage mode="charts" />, {
      route: "/charts?project_id=prj_demo&data_view_id=view_2",
    });

    expect(await screen.findByText("Target View")).toBeInTheDocument();
    expect(await screen.findByText("Lin")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/data-views/view_2/preview?page=1&page_size=20",
        expect.any(Object),
      );
    });
  });

  test("highlights chart and dashboard resources from route query parameters", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/data-views?")) {
        return Promise.resolve(
          jsonResponse({
            items: [dataViewFixture("view_1", "Orders View")],
          }),
        );
      }

      if (url.includes("/data-views/view_1/preview")) {
        return Promise.resolve(
          jsonResponse({
            data_view: dataViewFixture("view_1", "Orders View"),
            page: 1,
            page_size: 20,
            total_rows: 1,
            rows: [{ _das_row_id: 1, customer: "Ada", amount: 19.5 }],
          }),
        );
      }

      if (url.includes("/charts?")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "chart_1",
                project_id: "prj_demo",
                data_view_id: "view_1",
                name: "Orders Chart",
                chart_type: "bar",
                config: { dimension: "customer", metric: "amount" },
              },
            ],
          }),
        );
      }

      if (url.includes("/dashboards?")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "dash_1",
                project_id: "prj_demo",
                name: "Target Dashboard",
                layout: {
                  mode: "dashboard",
                  items: [{ chart_id: "chart_1", x: 0, y: 0, w: 6, h: 4 }],
                },
              },
            ],
          }),
        );
      }

      return Promise.resolve(jsonResponse({}));
    });

    const chartRender = renderWithProviders(
      <DataViewSourcePage mode="charts" />,
      {
        route: "/charts?project_id=prj_demo&chart_id=chart_1",
      },
    );

    expect(
      (await screen.findByText("Orders Chart")).closest(
        "[aria-current='true']",
      ),
    ).not.toBeNull();

    chartRender.unmount();

    renderWithProviders(<DataViewSourcePage mode="dashboards" />, {
      route: "/dashboards?project_id=prj_demo&dashboard_id=dash_1",
    });

    expect(
      (await screen.findByText("Target Dashboard")).closest(
        "[aria-current='true']",
      ),
    ).not.toBeNull();
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function dataViewFixture(id: string, name: string) {
  return {
    id,
    project_id: "prj_demo",
    name,
    description: null,
    source_type: "sql_query",
    source_id: null,
    source_sql: "SELECT customer, amount FROM dataset_1",
    physical_table_name: `dv_${id}`,
    row_count: 1,
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
  };
}
