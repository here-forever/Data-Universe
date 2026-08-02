import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { renderWithProviders } from "../test/test-utils";
import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenWorkspace(): ReactNode {
  throw new Error("render failed");
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ language: "zh-CN", theme: "dark" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("将未捕获异常转换为可恢复页面", () => {
    renderWithProviders(
      <AppErrorBoundary>
        <BrokenWorkspace />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "这次探索意外中断了" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新加载" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回数据宇宙" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
