import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "../test/test-utils";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  test("renders data workspace navigation", () => {
    renderWithProviders(<AppShell />);

    expect(screen.getByRole("heading", { name: "Data Analysis System" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data Sources" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SQL Workspace" })).toBeInTheDocument();
    expect(screen.getByText("Professional data analysis workbench")).toBeInTheDocument();
  });
});
