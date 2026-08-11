import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { API_BASE_URL } from "../../lib/apiClient";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import {
  CollaborationContext,
  type CollaborationEvent,
  parseCollaborationEvent,
  reconnectDelay,
  type SharedFilter,
} from "./collaborationState";

interface ChannelState {
  datasetId: string | null;
  connected: boolean;
  online: number;
  recentEvent: CollaborationEvent | null;
  chartFilter: SharedFilter | null;
  particleMapping: Record<string, string> | null;
}

function resolveActor(): string {
  const key = "vibe-data-universe.actor";
  const stored = window.sessionStorage.getItem(key);
  if (stored) return stored.slice(0, 80);
  const actor = `VIBE-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  window.sessionStorage.setItem(key, actor);
  return actor;
}

function emptyChannel(datasetId: string | null): ChannelState {
  return {
    datasetId,
    connected: false,
    online: 0,
    recentEvent: null,
    chartFilter: null,
    particleMapping: null,
  };
}

function channelForDataset(
  current: ChannelState,
  datasetId: string,
): ChannelState {
  return current.datasetId === datasetId ? current : emptyChannel(datasetId);
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function applySharedEvent(
  current: ChannelState,
  event: CollaborationEvent,
): ChannelState {
  const next = { ...current, recentEvent: event };
  if (event.type === "chart_filter") {
    const field = event.payload?.field;
    const value = event.payload?.value;
    if (typeof field === "string" && typeof value === "string") {
      next.chartFilter = { field, value };
    }
  } else if (event.type === "chart_filter_clear") {
    next.chartFilter = null;
  } else if (event.type === "particle_mapping") {
    next.particleMapping = stringRecord(event.payload?.mapping);
  }
  return next;
}

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const datasetId = useWorkspaceStore((state) => state.activeDatasetId);
  const socketRef = useRef<WebSocket | null>(null);
  const [channel, setChannel] = useState<ChannelState>(() =>
    emptyChannel(null),
  );
  const [actor] = useState(resolveActor);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(
        `${API_BASE_URL.replace(/^http/, "ws")}/collaboration/${datasetId}/ws`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        reconnectAttempt = 0;
        setChannel((current) => ({
          ...channelForDataset(current, datasetId),
          connected: true,
        }));
      };
      socket.onmessage = (message) => {
        const event = parseCollaborationEvent(String(message.data));
        if (!event) return;
        setChannel((current) => {
          const active = channelForDataset(current, datasetId);
          if (event.type === "presence" && typeof event.online === "number") {
            return { ...active, online: event.online };
          }
          return applySharedEvent(active, event);
        });
      };
      socket.onerror = () => {
        setChannel((current) => ({
          ...channelForDataset(current, datasetId),
          connected: false,
        }));
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        setChannel((current) =>
          current.datasetId === datasetId
            ? { ...current, connected: false, online: 0 }
            : current,
        );
        if (!cancelled) {
          reconnectTimer = setTimeout(
            connect,
            reconnectDelay(reconnectAttempt),
          );
          reconnectAttempt += 1;
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close(1000, "Dataset changed");
    };
  }, [datasetId]);

  const send = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (!datasetId) return;
      const event = { type, actor, payload };
      setChannel((current) =>
        applySharedEvent(channelForDataset(current, datasetId), event),
      );
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    },
    [actor, datasetId],
  );

  const activeChannel =
    channel.datasetId === datasetId ? channel : emptyChannel(datasetId);
  const value = useMemo(
    () => ({
      actor,
      connected: activeChannel.connected,
      online: activeChannel.online,
      recentEvent: activeChannel.recentEvent,
      chartFilter: activeChannel.chartFilter,
      particleMapping: activeChannel.particleMapping,
      send,
    }),
    [
      actor,
      activeChannel.chartFilter,
      activeChannel.connected,
      activeChannel.online,
      activeChannel.particleMapping,
      activeChannel.recentEvent,
      send,
    ],
  );

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}
