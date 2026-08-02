import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "../test/test-utils";
import { ConfirmDialog } from "./ConfirmDialog";

const labels = {
  cancelLabel: "取消",
  confirmLabel: "确认删除",
  description: "删除后无法恢复。",
  eyebrow: "危险操作",
  pendingLabel: "正在删除",
  title: "删除数据集",
};

describe("ConfirmDialog", () => {
  test("默认聚焦取消按钮并支持 Escape 关闭", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    renderWithProviders(
      <ConfirmDialog {...labels} onCancel={onCancel} onConfirm={vi.fn()} />,
    );

    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("删除数据集");
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test("确认操作可执行且等待期间锁定对话框", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = renderWithProviders(
      <ConfirmDialog {...labels} onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(
      <ConfirmDialog
        {...labels}
        isPending
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在删除" })).toBeDisabled();
  });
});
