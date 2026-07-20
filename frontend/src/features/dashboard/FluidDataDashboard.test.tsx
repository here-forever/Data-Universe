import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "../../test/test-utils";
import { FluidDataDashboard } from "./FluidDataDashboard";

describe("FluidDataDashboard", () => {
  test("cross-filters assets by channel and exposes the selected state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FluidDataDashboard />);

    expect(screen.getByText("华东零售渠道")).toBeInTheDocument();
    expect(screen.getByText("会员复购漏斗")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "线上" }));

    expect(screen.getByRole("button", { name: "线上" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("华东零售渠道")).not.toBeInTheDocument();
    expect(screen.getByText("会员复购漏斗")).toBeInTheDocument();
    expect(screen.getByText("内容投放归因")).toBeInTheDocument();
  });

  test("collapses the navigation without removing its accessible controls", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<FluidDataDashboard />);

    await user.click(screen.getByRole("button", { name: "折叠侧边栏" }));

    expect(container.querySelector(".fluid-app")).toHaveClass("is-collapsed");
    expect(
      screen.getByRole("button", { name: "展开侧边栏" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "总览" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
