import { describe, expect, test } from "vitest";

import { parseCollaborationEvent, reconnectDelay } from "./collaborationState";

describe("collaboration event validation", () => {
  test("accepts a valid presence event", () => {
    expect(parseCollaborationEvent('{"type":"presence","online":2}')).toEqual({
      type: "presence",
      online: 2,
    });
  });

  test.each([
    "not-json",
    "[]",
    '{"type":4}',
    '{"type":"presence","online":-1}',
    '{"type":"selection","payload":[]}',
  ])("ignores malformed messages: %s", (message) => {
    expect(parseCollaborationEvent(message)).toBeNull();
  });

  test("uses capped exponential backoff", () => {
    expect([0, 1, 2, 8].map(reconnectDelay)).toEqual([
      1_000, 2_000, 4_000, 30_000,
    ]);
  });
});
