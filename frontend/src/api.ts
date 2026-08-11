import type { AdminListeningGroup, AdminListeningMockTest, AdminReadingItem, AdminResponseObservation, AdminResponseSession, AdminSummary, Exam, ExamMode, Locale, Results, TestSession, TtsJob, TtsStyle } from "./types";

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

export const adminApi = {
  login(email: string, password: string) {
    return request<{ accessToken: string; expiresAt: number; admin: { id: string; email: string } }>("/v1/admin/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
  },
  me(token: string) { return request<{ admin: { id: string; email: string } }>("/v1/admin/me", { headers: auth(token) }); },
  dashboard(token: string) { return request<{ summary: AdminSummary }>("/v1/admin/dashboard", { headers: auth(token) }); },
  listeningItems(token: string, filters: { setId?: string; status?: string } = {}) {
    const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return request<{ items: AdminListeningGroup[] }>(`/v1/admin/listening/items${query.size ? `?${query}` : ""}`, { headers: auth(token) });
  },
  readingItems(token: string, filters: { setId?: string; search?: string } = {}) {
    const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return request<{ items: AdminReadingItem[] }>(`/v1/admin/reading/items${query.size ? `?${query}` : ""}`, { headers: auth(token) });
  },
  responseSessions(token: string, filters: { section?: string; correctness?: string; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
    return request<{ sessions: AdminResponseSession[]; total: number }>(`/v1/admin/responses/sessions${query.size ? `?${query}` : ""}`, { headers: auth(token) });
  },
  responseSession(token: string, sessionId: string) {
    return request<{ responses: AdminResponseObservation[] }>(`/v1/admin/responses/sessions/${sessionId}`, { headers: auth(token) });
  },
  deleteResponseSessions(token: string, sessionIds: string[]) {
    return request<{ deletedSessions: number; deletedObservations: number }>("/v1/admin/responses/sessions", {
      method: "DELETE", headers: auth(token), body: JSON.stringify({ sessionIds }),
    });
  },
  deleteAllResponseSessions(token: string, confirmation: string) {
    return request<{ deletedSessions: number; deletedObservations: number }>("/v1/admin/responses/sessions/all", {
      method: "DELETE", headers: auth(token), body: JSON.stringify({ confirmation }),
    });
  },
  jobs(token: string) { return request<{ jobs: TtsJob[] }>("/v1/admin/tts/jobs", { headers: auth(token) }); },
  mockTests(token: string) { return request<{ mockTests: AdminListeningMockTest[] }>("/v1/admin/listening/mock-tests", { headers: auth(token) }); },
  audioUrl(token: string, audioAssetId: string) {
    return request<{ audioUrl: string }>(`/v1/admin/listening/audio/${audioAssetId}/url`, { headers: auth(token) });
  },
  generateItem(token: string, itemId: string, itemVersion: number, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ jobId: string; queued: boolean }>(`/v1/admin/listening/items/${itemId}/versions/${itemVersion}/tts`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate, ttsStyle }),
    });
  },
  generateSet(token: string, setId: string, setVersion: number, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ queued: number; jobIds: string[] }>(`/v1/admin/listening/sets/${setId}/versions/${setVersion}/tts`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate, ttsStyle }),
    });
  },
  generateGroup(token: string, setId: string, setVersion: number, leaderItemId: string, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ jobId: string | null; queued: boolean; targetCount: number }>(`/v1/admin/listening/sets/${setId}/versions/${setVersion}/audio-groups/${leaderItemId}/tts`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate, ttsStyle }),
    });
  },
  deleteAudio(token: string, itemId: string, itemVersion: number, audioAssetId: string) {
    return request<{ deleted: boolean; storageDeleted: boolean; sharedAssetRetained: boolean }>(
      `/v1/admin/listening/items/${itemId}/versions/${itemVersion}/audio/${audioAssetId}`,
      { method: "DELETE", headers: auth(token) },
    );
  },
  deleteGroupAudio(token: string, setId: string, setVersion: number, leaderItemId: string, audioAssetId: string) {
    return request<{ deleted: boolean; deletedBindings: number; storageDeleted: boolean; sharedAssetRetained: boolean }>(
      `/v1/admin/listening/sets/${setId}/versions/${setVersion}/audio-groups/${leaderItemId}/audio/${audioAssetId}`,
      { method: "DELETE", headers: auth(token) },
    );
  },
  uploadVisual(token: string, itemId: string, itemVersion: number, optionNumber: number, file: File) {
    const form = new FormData(); form.set("file", file);
    return request<{ visualAssetId: string; url: string }>(`/v1/admin/listening/items/${itemId}/versions/${itemVersion}/visual-options/${optionNumber}`, {
      method: "POST", headers: auth(token), body: form,
    });
  },
  publish(token: string, mockTestId: string, published: boolean) {
    return request<{ published: boolean }>(`/v1/admin/listening/mock-tests/${mockTestId}/publish`, {
      method: "PUT", headers: auth(token), body: JSON.stringify({ published }),
    });
  },
};

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

  audioPlayback(
    sessionId: string, token: string, audioAssetId: string, clientPlayId: string,
    eventType: "started" | "completed" | "interrupted",
  ) {
    return request<{ submitted: boolean; playNumber?: number; maxPlays?: number | null; audioUrl?: string }>(
      `/v1/sessions/${sessionId}/audio/${audioAssetId}/playback`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ clientPlayId, eventType }) },
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
