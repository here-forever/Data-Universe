import { createContext, useContext } from "react";

export interface CollaborationEvent {
  type: string;
  actor?: string;
  online?: number;
  payload?: Record<string, unknown>;
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
