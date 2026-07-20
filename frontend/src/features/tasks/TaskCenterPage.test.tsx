import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { TaskCenterPage } from "./TaskCenterPage";

const fetchMock = vi.fn();

describe("TaskCenterPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  test("renders task summary and workflow tasks", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: "task_1",
            project_id: "prj_demo",
            initiator_id: "usr_admin",
            name: "Parsed file preview: orders.csv",
            task_type: "file_preview_parse",
            status: "success",
            progress: 100,
            error_message: null,
            related_resource_type: "file_import_preview",
            related_resource_id: "preview_1",
            can_retry: false,
            started_at: "2026-07-04T08:00:00Z",
            finished_at: "2026-07-04T08:00:01Z",
            created_at: "2026-07-04T08:00:00Z",
            updated_at: "2026-07-04T08:00:01Z",
          },
          {
            id: "task_2",
            project_id: "prj_demo",
            initiator_id: "usr_admin",
            name: "Materialized SQL data view: West Orders View",
            task_type: "sql_data_view_materialization",
            status: "success",
            progress: 100,
            error_message: null,
            related_resource_type: "data_view",
            related_resource_id: "view_1",
            can_retry: false,
            started_at: "2026-07-04T08:01:00Z",
            finished_at: "2026-07-04T08:01:03Z",
            created_at: "2026-07-04T08:01:00Z",
            updated_at: "2026-07-04T08:01:03Z",
          },
          {
            id: "task_3",
            project_id: "prj_demo",
            initiator_id: "usr_admin",
            name: "Export failed",
            task_type: "dashboard_save",
            status: "failed",
            progress: 100,
            error_message: "Template missing",
            related_resource_type: "dashboard",
            related_resource_id: "dash_1",
            can_retry: false,
            started_at: "2026-07-04T08:02:00Z",
            finished_at: "2026-07-04T08:02:05Z",
            created_at: "2026-07-04T08:02:00Z",
            updated_at: "2026-07-04T08:02:05Z",
          },
        ],
      }),
    );

    renderWithProviders(<TaskCenterPage />);

    expect(
      await screen.findByText("Parsed file preview: orders.csv"),
    ).toBeInTheDocument();
    expect(screen.getByText("SQL data view")).toBeInTheDocument();
    expect(screen.getByText("Template missing")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open resource" })).toEqual([
      expect.objectContaining({
        href: expect.stringContaining(
          "/charts?project_id=prj_demo&data_view_id=view_1",
        ),
      }),
      expect.objectContaining({
        href: expect.stringContaining(
          "/dashboards?project_id=prj_demo&dashboard_id=dash_1",
        ),
      }),
    ]);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Import preview")).toBeInTheDocument();
    expect(screen.getByText("Report")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/tasks?project_id=prj_demo",
        expect.any(Object),
      );
    });
  });

  test("requests retry for failed tasks and refreshes the list", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/tasks/task_failed/retry")) {
        return Promise.resolve(
          jsonResponse({
            original_task: {
              ...failedTask,
              status: "retryable",
              error_message: "Template missing | Retry requested as task_retry",
              can_retry: true,
            },
            retry_task: {
              ...failedTask,
              id: "task_retry",
              name: "Retry requested: Export failed",
              status: "success",
              progress: 100,
              error_message: null,
              can_retry: false,
            },
          }),
        );
      }

      if (url.includes("/tasks?")) {
        return Promise.resolve(jsonResponse({ items: [failedTask] }));
      }

      return Promise.resolve(jsonResponse({}));
    });
    const user = userEvent.setup();

    renderWithProviders(<TaskCenterPage />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("Retry finished as task_retry"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/tasks/task_failed/retry",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/tasks?project_id=prj_demo",
      expect.any(Object),
    );
  });

  test("submits a project id and reloads project tasks", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    const user = userEvent.setup();

    renderWithProviders(<TaskCenterPage />);

    const input = screen.getByLabelText("Project ID");
    await user.clear(input);
    await user.type(input, "prj_custom");
    await user.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/tasks?project_id=prj_custom",
        expect.any(Object),
      );
    });
  });

  test("loads the project id from route query parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    renderWithProviders(<TaskCenterPage />, {
      route: "/tasks?project_id=prj_target",
    });

    expect(screen.getByLabelText("Project ID")).toHaveValue("prj_target");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/api/tasks?project_id=prj_target",
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

const failedTask = {
  id: "task_failed",
  project_id: "prj_demo",
  initiator_id: "usr_admin",
  name: "Export failed",
  task_type: "dashboard_save",
  status: "failed",
  progress: 100,
  error_message: "Template missing",
  related_resource_type: "dashboard",
  related_resource_id: "dash_1",
  can_retry: true,
  started_at: "2026-07-04T08:02:00Z",
  finished_at: "2026-07-04T08:02:05Z",
  created_at: "2026-07-04T08:02:00Z",
  updated_at: "2026-07-04T08:02:05Z",
};
