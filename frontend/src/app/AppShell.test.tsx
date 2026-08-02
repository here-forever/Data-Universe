import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { type DatasetSummary, vibeApi } from "../lib/vibeApi";
import { renderWithProviders } from "../test/test-utils";
import { AppShell } from "./AppShell";
import { preloadRoute } from "./routeModules";

vi.mock("./routeModules", () => ({
  preloadRoute: vi.fn(),
}));

vi.mock("../features/collaboration/CollaborationContext", () => ({
  CollaborationProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../features/collaboration/collaborationState", () => ({
  useCollaboration: () => ({
    connected: false,
    online: 0,
    recentEvent: null,
  }),
}));

const dataset: DatasetSummary = {
  id: "campus-rhythm",
  name: "校园节律",
  source_filename: "campus-rhythm.csv",
  file_type: "csv",
  row_count: 240,
  column_count: 8,
  active_revision: 1,
  quality_score: 96,
  created_at: "2026-07-27T00:00:00Z",
  updated_at: "2026-07-27T00:00:00Z",
};

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspaceStore.setState({
      activeDatasetId: null,
      language: "zh-CN",
      theme: "dark",
    });
    vi.spyOn(vibeApi, "listDatasets").mockResolvedValue([dataset]);
    vi.mocked(preloadRoute).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("只呈现新系统的四个工作区入口", () => {
    renderWithProviders(<AppShell />);

    expect(screen.getByRole("link", { name: /数据宇宙/ })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /数据工作台/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /分析实验室/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /故事编辑器/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("SQL 工作台")).not.toBeInTheDocument();
    expect(screen.queryByText("治理中心")).not.toBeInTheDocument();
  });

  test("加载数据集并切换明暗模式", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AppShell />);

    expect(
      await screen.findByRole("option", { name: "校园节律 · 240 行" }),
    ).toBeInTheDocument();
    expect(useWorkspaceStore.getState().activeDatasetId).toBe(dataset.id);

    await user.click(screen.getByRole("button", { name: "切换明暗模式" }));
    expect(container.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "light",
    );
  });

  test("切换并持久化英文界面", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);

    await user.click(screen.getByRole("button", { name: "Switch to English" }));

    const primaryNavigation = screen.getByRole("complementary", {
      name: "Primary navigation",
    });
    expect(
      within(primaryNavigation).getByRole("link", {
        name: /^Data Universe\s*Particle stories$/,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "校园节律 · 240 rows" }),
    ).toBeInTheDocument();
    expect(useWorkspaceStore.getState().language).toBe("en-US");
    expect(document.documentElement).toHaveAttribute("lang", "en-US");
    expect(
      window.localStorage.getItem("vibe-data-universe.workspace"),
    ).toContain('"language":"en-US"');
  });

  test("用户准备导航时预加载目标工作区", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);

    await user.hover(screen.getByRole("link", { name: /分析实验室/ }));

    expect(preloadRoute).toHaveBeenCalledWith("/analysis");
  });
});
