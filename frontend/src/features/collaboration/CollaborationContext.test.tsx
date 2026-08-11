import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkspaceStore } from "../workspace/workspaceStore";
import { CollaborationProvider } from "./CollaborationContext";
import { useCollaboration } from "./collaborationState";

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 0;
  readonly send = vi.fn();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

function CollaborationProbe() {
  const collaboration = useCollaboration();
  return (
    <div>
      <span>{collaboration.connected ? "connected" : "offline"}</span>
      <span>online:{collaboration.online}</span>
      <button
        onClick={() =>
          collaboration.send("chart_filter", { field: "team", value: "A" })
        }
        type="button"
      >
        share
      </button>
    </div>
  );
}

describe("CollaborationProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    window.sessionStorage.clear();
    useWorkspaceStore.setState({ activeDatasetId: "dataset-1" });
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useWorkspaceStore.setState({ activeDatasetId: null });
  });

  test("校验消息、发送事件并在断线后重连", () => {
    const view = render(
      <CollaborationProvider>
        <CollaborationProbe />
      </CollaborationProvider>,
    );
    const first = FakeWebSocket.instances[0];
    expect(first.url).toBe(
      "ws://127.0.0.1:8000/api/v1/collaboration/dataset-1/ws",
    );

    act(() => first.open());
    expect(screen.getByText("connected")).toBeInTheDocument();
    act(() => first.receive("not-json"));
    expect(screen.getByText("online:0")).toBeInTheDocument();
    act(() => first.receive('{"type":"presence","online":3}'));
    expect(screen.getByText("online:3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "share" }));
    expect(first.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"chart_filter"'),
    );

    act(() => first.close());
    expect(screen.getByText("offline")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].url).toBe(first.url);
    view.unmount();
  });
});
