import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { setLanguageForTests } from "../../i18n";
import { DataViewSourcePage } from "./DataViewSourcePage";

const fetchMock = vi.fn();

describe("DataViewSourcePage", () => {
  beforeEach(() => {
    setLanguageForTests("en-US");
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
    await user.click(screen.getByRole("button", { name: "Save report" }));
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

  test("reopens a report, persists interactions, and exports PDF", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:report-export");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    let updateBody = "";

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/data-views?")) {
          return Promise.resolve(
            jsonResponse({ items: [dataViewFixture("view_1", "Orders View")] }),
          );
        }
        if (url.includes("/data-views/view_1/preview")) {
          return Promise.resolve(
            jsonResponse({
              data_view: dataViewFixture("view_1", "Orders View"),
              page: 1,
              page_size: 20,
              total_rows: 2,
              rows: [
                { _das_row_id: 1, customer: "Ada", amount: 19.5 },
                { _das_row_id: 2, customer: "Lin", amount: 42 },
              ],
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
                  chart_type: "table",
                  config: {
                    dimension: "customer",
                    metric: "amount",
                    aggregation: "sum",
                    preview_rows: [
                      { customer: "Ada", amount: 19.5 },
                      { customer: "Lin", amount: 42 },
                    ],
                  },
                },
              ],
            }),
          );
        }
        if (url.includes("/dashboards?") && init?.method === "GET") {
          return Promise.resolve(
            jsonResponse({
              items: [
                {
                  id: "dash_1",
                  project_id: "prj_demo",
                  name: "Orders Delivery Report",
                  configuration_version: 3,
                  created_at: "2026-07-27T10:00:00Z",
                  updated_at: "2026-07-27T10:30:00Z",
                  layout: {
                    schema_version: 1,
                    mode: "report",
                    theme: "warm",
                    items: [{ chart_id: "chart_1", x: 0, y: 0, w: 12, h: 6 }],
                    global_filters: [
                      {
                        id: "filter_customer",
                        field: "customer",
                        operator: "eq",
                        value: "Ada",
                        data_view_id: "view_1",
                      },
                    ],
                    active_selections: [],
                  },
                },
              ],
            }),
          );
        }
        if (url.endsWith("/dashboards/dash_1") && init?.method === "PATCH") {
          updateBody = String(init.body);
          const payload = JSON.parse(updateBody) as {
            name: string;
            layout: Record<string, unknown>;
          };
          return Promise.resolve(
            jsonResponse({
              id: "dash_1",
              project_id: "prj_demo",
              name: payload.name,
              configuration_version: 4,
              created_at: "2026-07-27T10:00:00Z",
              updated_at: "2026-07-27T11:00:00Z",
              layout: payload.layout,
            }),
          );
        }
        if (
          url.includes("/dashboards/dash_1/exports?format=pdf") &&
          init?.method === "POST"
        ) {
          return Promise.resolve(blobResponse("orders_report.pdf"));
        }
        if (url.endsWith("/dashboards/dash_1/exports")) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }
        return Promise.resolve(jsonResponse({}));
      },
    );
    const user = userEvent.setup();

    renderWithProviders(<DataViewSourcePage mode="dashboards" />, {
      route: "/dashboards?project_id=prj_demo&dashboard_id=dash_1",
    });

    expect(
      await screen.findByDisplayValue("Orders Delivery Report"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Layout mode")).toHaveValue("report");
    expect(screen.getByLabelText("Report theme")).toHaveValue("warm");
    expect(screen.getByLabelText("Filter value")).toHaveValue("Ada");

    const chartSection = screen
      .getByRole("heading", { name: "Orders Chart" })
      .closest("section");
    expect(chartSection).not.toBeNull();
    expect(chartSection?.parentElement).toHaveClass("report-preview-warm");
    expect(chartSection?.parentElement).not.toHaveClass(
      "report-preview-aurora",
    );
    await user.click(within(chartSection as HTMLElement).getByText("Ada"));
    expect(await screen.findByText(/customer: Ada/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(updateBody).toContain('"expected_version":3'));
    expect(updateBody).toContain('"active_selections"');
    expect(updateBody).toContain('"value":"Ada"');

    await user.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => {
      expect(createObjectUrl).toHaveBeenCalled();
      expect(anchorClick).toHaveBeenCalled();
      expect(revokeObjectUrl).toHaveBeenCalled();
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function blobResponse(fileName: string): Response {
  return {
    blob: async () => new Blob(["report"]),
    headers: new Headers({
      "Content-Disposition": `attachment; filename="${fileName}"`,
    }),
    ok: true,
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
