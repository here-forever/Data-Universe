import { createContext, useContext } from "react";

export interface CollaborationEvent {
  type: string;
  actor?: string;
  online?: number;
  payload?: Record<string, unknown>;
}

export function parseCollaborationEvent(
  raw: string,
): CollaborationEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.type !== "string" ||
    candidate.type.length === 0 ||
    candidate.type.length > 40
  ) {
    return null;
  }
  if (candidate.actor !== undefined && typeof candidate.actor !== "string") {
    return null;
  }
  if (
    candidate.online !== undefined &&
    (typeof candidate.online !== "number" ||
      !Number.isInteger(candidate.online) ||
      candidate.online < 0)
  ) {
    return null;
  }
  if (
    candidate.payload !== undefined &&
    (!candidate.payload ||
      typeof candidate.payload !== "object" ||
      Array.isArray(candidate.payload))
  ) {
    return null;
  }
  return {
    type: candidate.type,
    ...(typeof candidate.actor === "string" ? { actor: candidate.actor } : {}),
    ...(typeof candidate.online === "number"
      ? { online: candidate.online }
      : {}),
    ...(candidate.payload
      ? { payload: candidate.payload as Record<string, unknown> }
      : {}),
  };
}

export function reconnectDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.max(0, attempt), 30_000);
}

export interface SharedFilter {
  field: string;
  value: string;
}

export interface CollaborationValue {
  connected: boolean;
  online: number;
  actor: string;
  recentEvent: CollaborationEvent | null;
  chartFilter: SharedFilter | null;
  particleMapping: Record<string, string> | null;
  send: (type: string, payload: Record<string, unknown>) => void;
}

export const CollaborationContext = createContext<CollaborationValue | null>(
  null,
);

export function useCollaboration(): CollaborationValue {
  const value = useContext(CollaborationContext);
  if (!value) {
    throw new Error(
      "useCollaboration must be used inside CollaborationProvider",
    );
  }
  return value;
}
