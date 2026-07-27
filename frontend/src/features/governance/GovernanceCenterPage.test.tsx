import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetLanguageForTests } from "../../i18n";
import { renderWithProviders } from "../../test/test-utils";
import {
  archiveGovernedResource,
  getFocusedLineage,
  listGovernedResources,
  listOperationLogs,
  listProjectMembers,
  listProjects,
  restoreGovernedResource,
} from "./api";
import { GovernanceCenterPage } from "./GovernanceCenterPage";

vi.mock("./api", () => ({
  addProjectMember: vi.fn(),
  archiveGovernedResource: vi.fn(),
  getFocusedLineage: vi.fn(),
  listGovernedResources: vi.fn(),
  listOperationLogs: vi.fn(),
  listProjectMembers: vi.fn(),
  listProjects: vi.fn(),
  removeProjectMember: vi.fn(),
  restoreGovernedResource: vi.fn(),
  updateProjectMember: vi.fn(),
}));

const datasetResource = {
  resource_type: "dataset" as const,
  resource_id: "ds_sales",
  project_id: "prj_demo",
  name: "Demo Sales Orders",
  status: "active" as const,
  archived_at: null,
  archived_by_id: null,
  created_at: "2026-07-27T08:00:00Z",
  updated_at: "2026-07-27T08:00:00Z",
  direct_dependency_count: 1,
};

const dashboardResource = {
  ...datasetResource,
  resource_type: "dashboard" as const,
  resource_id: "dash_sales",
  name: "Demo Sales Dashboard",
  direct_dependency_count: 0,
};

describe("GovernanceCenterPage", () => {
  beforeEach(() => {
    resetLanguageForTests();
    vi.clearAllMocks();
    vi.mocked(listProjects).mockResolvedValue([
      {
        id: "prj_demo",
        name: "Demo workspace",
        description: null,
        owner_id: "usr_admin",
        role: "owner",
      },
    ]);
    vi.mocked(listGovernedResources).mockResolvedValue({
      items: [datasetResource, dashboardResource],
      summary: { total: 2, active: 2, archived: 0, with_dependents: 1 },
    });
    vi.mocked(listOperationLogs).mockResolvedValue({
      items: [
        {
          id: "log_1",
          project_id: "prj_demo",
          actor_id: "usr_admin",
          actor_name: "System Administrator",
          action: "resource.archived",
          resource_type: "dataset",
          resource_id: "ds_sales",
          detail: { name: "Demo Sales Orders" },
          created_at: "2026-07-27T09:00:00Z",
        },
      ],
      total: 1,
    });
    vi.mocked(listProjectMembers).mockResolvedValue([
      {
        user_id: "usr_admin",
        email: "admin@example.com",
        display_name: "System Administrator",
        role: "owner",
      },
    ]);
    vi.mocked(getFocusedLineage).mockResolvedValue({
      root: {
        resource_type: "dataset",
        resource_id: "ds_sales",
        label: "Demo Sales Orders",
        status: "active",
        depth: 0,
      },
      nodes: [
        {
          resource_type: "dataset",
          resource_id: "ds_sales",
          label: "Demo Sales Orders",
          status: "active",
          depth: 0,
        },
        {
          resource_type: "dashboard",
          resource_id: "dash_sales",
          label: "Demo Sales Dashboard",
          status: "active",
          depth: 1,
        },
      ],
      edges: [
        {
          id: "edge_1",
          source_type: "dataset",
          source_id: "ds_sales",
          target_type: "dashboard",
          target_id: "dash_sales",
          transform_type: "dashboard_layout",
          transform_id: "dash_sales",
          created_at: "2026-07-27T08:30:00Z",
        },
      ],
      direction: "both",
      max_depth: 4,
    });
    vi.mocked(archiveGovernedResource).mockResolvedValue({
      ...datasetResource,
      status: "archived",
      archived_at: "2026-07-27T10:00:00Z",
      archived_by_id: "usr_admin",
    });
    vi.mocked(restoreGovernedResource).mockResolvedValue(datasetResource);
  });

  test("renders the resource vault and confirms recoverable archiving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GovernanceCenterPage />, {
      route: "/governance?project_id=prj_demo",
    });

    expect(await screen.findByText("Demo Sales Orders")).toBeInTheDocument();
    expect(screen.getByText("活跃资产")).toBeInTheDocument();
    expect(screen.getByText("存在下游")).toBeInTheDocument();

    const resourceRow = screen
      .getByText("Demo Sales Orders")
      .closest("article");
    expect(resourceRow).not.toBeNull();
    await user.click(
      within(resourceRow!).getByRole("button", { name: "归档" }),
    );

    const dialog = screen.getByRole("dialog", { name: "安全归档资源？" });
    expect(dialog).toHaveTextContent("数据和血缘记录会完整保留");
    await user.click(within(dialog).getByRole("button", { name: "确认归档" }));

    expect(archiveGovernedResource).toHaveBeenCalledWith(
      "prj_demo",
      datasetResource,
    );
    expect(
      await screen.findByText("资源已安全归档，可随时恢复。"),
    ).toBeInTheDocument();
  });

  test("switches between lineage, activity, and member governance", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GovernanceCenterPage />, {
      route: "/governance?project_id=prj_demo",
    });

    await screen.findByText("Demo Sales Orders");
    await user.click(screen.getByRole("button", { name: "依赖关系" }));
    expect(await screen.findByText("转换链路")).toBeInTheDocument();
    expect(screen.getByText("Demo Sales Dashboard")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "操作轨迹" }));
    expect(screen.getByText("资源已归档")).toBeInTheDocument();
    expect(screen.getByText(/System Administrator/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "成员协作" }));
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("所有者")).toBeInTheDocument();
  });
});
