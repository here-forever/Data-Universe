import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("echarts/core", () => ({
  init: () => ({
    dispose: vi.fn(),
    resize: vi.fn(),
    setOption: vi.fn(),
  }),
  use: vi.fn(),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
