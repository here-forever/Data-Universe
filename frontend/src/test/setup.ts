import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("echarts/core", () => {
  class GradientMock {}

  return {
    graphic: {
      LinearGradient: GradientMock,
      RadialGradient: GradientMock,
    },
    init: () => ({
      dispose: vi.fn(),
      on: vi.fn(),
      resize: vi.fn(),
      setOption: vi.fn(),
    }),
    use: vi.fn(),
  };
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
