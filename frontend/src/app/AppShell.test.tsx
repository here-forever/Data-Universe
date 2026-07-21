import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";

import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { resetLanguageForTests } from "../i18n";
import { renderWithProviders } from "../test/test-utils";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  beforeEach(() => {
    resetLanguageForTests();
    useWorkspaceStore.setState({ sidebarCollapsed: false });
  });

  test("switches the full shell language and persists the preference", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);

    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Data sources" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Analytics lead")).toBeInTheDocument();
    expect(document.title).toBe("Mistflow Data Atelier");
    expect(document.documentElement.lang).toBe("en-US");
    expect(window.localStorage.getItem("data-analyse.language")).toBe("en-US");

    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByRole("link", { name: "总览" })).toBeInTheDocument();
    expect(document.title).toBe("雾流数据台");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  test("renders the unified data workspace navigation", () => {
    renderWithProviders(<AppShell />);

    expect(
      screen.getByRole("link", { name: "雾流数据工作台首页" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "总览" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "数据源" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "SQL 工作台" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "分析工作台" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "任务中心" })).toBeInTheDocument();
  });

  test("collapses the navigation while keeping links accessible", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);

    await user.click(screen.getByRole("button", { name: "折叠侧边栏" }));

    expect(
      screen.getByRole("button", { name: "展开侧边栏" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "数据集" })).toBeInTheDocument();
  });
});
