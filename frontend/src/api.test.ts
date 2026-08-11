import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi, api } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("telemetry delivery", () => {
  it("reuses the deduplication key when an event request is retried", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ accepted: false, submitted: false }),
      } as unknown as Response);

    const request = api.event(
      "10000000-0000-4000-8000-000000000001",
      "session-token",
      1,
      "heartbeat",
      15_000,
    );
    await vi.advanceTimersByTimeAsync(250);
    await request;

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody.clientEventId).toBe(firstBody.clientEventId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("request headers", () => {
  it("does not declare JSON content for a bodyless submit request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: "submitted", resultsLocked: true }),
    } as unknown as Response);

    await api.submit(
      "10000000-0000-4000-8000-000000000001",
      "session-token",
    );

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(init?.body).toBeUndefined();
    expect(headers.has("Content-Type")).toBe(false);
  });
});

describe("admin response deletion", () => {
  it("sends selected session ids with a DELETE request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ deletedSessions: 2, deletedObservations: 100 }),
    } as unknown as Response);
    const sessionIds = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ];

    await adminApi.deleteResponseSessions("admin-token", sessionIds);

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v1\/admin\/responses\/sessions$/);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ sessionIds });
  });

  it("sends the required confirmation phrase for deleting all submitted responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ deletedSessions: 3, deletedObservations: 150 }),
    } as unknown as Response);

    await adminApi.deleteAllResponseSessions("admin-token", "전체 응답 삭제");

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v1\/admin\/responses\/sessions\/all$/);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ confirmation: "전체 응답 삭제" });
  });
});
