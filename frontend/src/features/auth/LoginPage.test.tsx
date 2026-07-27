import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetLanguageForTests } from "../../i18n";
import { renderWithProviders } from "../../test/test-utils";
import { login } from "./api";
import { LoginPage } from "./LoginPage";

vi.mock("./api", () => ({
  login: vi.fn(),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    resetLanguageForTests();
    vi.clearAllMocks();
    vi.mocked(login).mockResolvedValue({
      access_token: "das1.signed",
      token_type: "bearer",
      expires_in: 3600,
    });
  });

  test("submits the prefilled local account through the secure login flow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { route: "/login" });

    expect(
      screen.getByRole("heading", { name: "欢迎回来" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /进入工作区/ }));

    expect(login).toHaveBeenCalledWith("admin@example.com", "admin123");
  });
});
