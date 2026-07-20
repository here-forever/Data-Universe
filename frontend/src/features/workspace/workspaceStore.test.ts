import { beforeEach, describe, expect, test } from "vitest";

import { useWorkspaceStore } from "./workspaceStore";

describe("workspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeProjectId: null, sidebarCollapsed: false });
  });

  test("stores active project id", () => {
    useWorkspaceStore.getState().setActiveProject("project-1");

    expect(useWorkspaceStore.getState().activeProjectId).toBe("project-1");
  });

  test("toggles sidebar collapsed state", () => {
    useWorkspaceStore.getState().toggleSidebar();

    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(true);
  });
});
