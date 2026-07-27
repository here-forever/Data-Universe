import { describe, expect, test } from "vitest";

import { type DashboardLayoutItem, reconcileLayoutItems } from "./reportLayout";

describe("reconcileLayoutItems", () => {
  test("preserves the arranged order and appends newly selected charts", () => {
    const current: DashboardLayoutItem[] = [
      { chart_id: "chart_2", x: 0, y: 0, w: 8, h: 4 },
      { chart_id: "chart_1", x: 0, y: 4, w: 4, h: 3 },
    ];

    const items = reconcileLayoutItems(
      current,
      ["chart_1", "chart_2", "chart_3"],
      "dashboard",
    );

    expect(items.map((item) => item.chart_id)).toEqual([
      "chart_2",
      "chart_1",
      "chart_3",
    ]);
    expect(items[0]).toEqual(current[0]);
    expect(items[1]).toEqual(current[1]);
    expect(items[2]).toMatchObject({ chart_id: "chart_3", w: 6, h: 4 });
  });

  test("removes layout items that are no longer selected", () => {
    const current: DashboardLayoutItem[] = [
      { chart_id: "chart_2", x: 0, y: 0, w: 6, h: 4 },
      { chart_id: "chart_1", x: 6, y: 0, w: 6, h: 4 },
    ];

    expect(
      reconcileLayoutItems(current, ["chart_1"], "dashboard").map(
        (item) => item.chart_id,
      ),
    ).toEqual(["chart_1"]);
  });
});
