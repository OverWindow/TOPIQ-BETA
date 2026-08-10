import type { Exam, ExamMode, Locale, Results, TestSession } from "./types";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? "https://topik-api.unigate.kr" : "")
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "Request failed");
  }
  return body as T;
}

async function requestWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [0, 250, 750];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status < 500) throw error;
    }
  }
  throw lastError;
}

export const sessionStorageKey = (sessionId: string) => `unigate.topik.session.${sessionId}`;

export function getSessionToken(sessionId: string): string | null {
  return localStorage.getItem(sessionStorageKey(sessionId));
}

function auth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export const api = {
  async exams(): Promise<Exam[]> {
    const data = await request<{ exams: Exam[] }>("/v1/exams");
    return data.exams;
  },

  async createSession(mockTestId: string, mode: ExamMode) {
    const created = await request<{ sessionId: string; userId: string; token: string }>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ mockTestId, mode }),
    });
    localStorage.setItem(sessionStorageKey(created.sessionId), created.token);
    return created;
  },

  session(sessionId: string, token: string): Promise<TestSession> {
    return request(`/v1/sessions/${sessionId}`, { headers: auth(token) });
  },

  event(
    sessionId: string,
    token: string,
    itemOrder: number,
    eventType: "presented" | "hidden" | "heartbeat",
    durationMs: number,
  ) {
    const clientEventId = crypto.randomUUID();
    return requestWithRetry(() =>
      request<{ accepted: boolean; submitted: boolean }>(
        `/v1/sessions/${sessionId}/items/${itemOrder}/events`,
        {
          method: "POST",
          headers: auth(token),
          keepalive: true,
          body: JSON.stringify({ clientEventId, eventType, durationMs }),
        },
      ),
    );
  },

  answer(sessionId: string, token: string, itemOrder: number, selectedOption: number, durationMs: number) {
    const clientEventId = crypto.randomUUID();
    return requestWithRetry(() =>
      request<{ accepted: boolean; submitted: boolean }>(
        `/v1/sessions/${sessionId}/items/${itemOrder}/answer`,
        {
          method: "PUT",
          headers: auth(token),
          keepalive: true,
          body: JSON.stringify({ clientEventId, selectedOption, durationMs }),
        },
      ),
    );
  },

  submit(sessionId: string, token: string) {
    return request<{ status: "submitted"; resultsLocked: boolean }>(`/v1/sessions/${sessionId}/submit`, {
      method: "POST",
      headers: auth(token),
    });
  },

  feedback(
    sessionId: string,
    token: string,
    input: { rating: number; locale: Locale; email?: string; marketingConsent: boolean },
  ) {
    return request<{ resultsUnlocked: boolean; emailSubscribed: boolean }>(
      `/v1/sessions/${sessionId}/feedback`,
      { method: "POST", headers: auth(token), body: JSON.stringify(input) },
    );
  },

  results(sessionId: string, token: string): Promise<Results> {
    return request(`/v1/sessions/${sessionId}/results`, { headers: auth(token) });
  },
};
