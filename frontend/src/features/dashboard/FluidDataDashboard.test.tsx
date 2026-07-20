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

  test("resets the linked filters to the default view", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FluidDataDashboard />);

    await user.click(screen.getByRole("button", { name: "线上" }));
    await user.click(screen.getByRole("button", { name: "本季度" }));
    await user.click(screen.getByRole("button", { name: "重置" }));

    expect(screen.getByRole("button", { name: "全部渠道" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "本月" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("华东零售渠道")).toBeInTheDocument();
  });
});
