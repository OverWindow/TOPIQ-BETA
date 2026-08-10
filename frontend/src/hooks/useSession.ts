import { useCallback, useEffect, useState } from "react";
import { api, getSessionToken } from "../api";
import type { TestSession } from "../types";

export function useSession(sessionId: string | undefined) {
  const token = sessionId ? getSessionToken(sessionId) : null;
  const [session, setSession] = useState<TestSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId && token));

  const reload = useCallback(async () => {
    if (!sessionId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSession(await api.session(sessionId, token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId, token]);

  useEffect(() => { void reload(); }, [reload]);
  return { token, session, setSession, error, loading, reload };
}
