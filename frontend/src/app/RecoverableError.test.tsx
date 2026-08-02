import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { renderWithProviders } from "../test/test-utils";
import { RecoverableError } from "./RecoverableError";

describe("RecoverableError", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ language: "zh-CN" });
  });

  test("保留错误信息并允许原地重试", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <RecoverableError message="后端暂时不可用" onRetry={onRetry} />,
    );

    expect(screen.getByText("后端暂时不可用")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
