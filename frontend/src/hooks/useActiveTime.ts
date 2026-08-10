import { useEffect } from "react";
import { api } from "../api";

export function useActiveTime(sessionId: string, token: string, itemOrder: number, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let activeSince = document.visibilityState === "visible" ? performance.now() : null;

    const send = (eventType: "presented" | "hidden" | "heartbeat") => {
      const now = performance.now();
      const duration = activeSince === null ? 0 : now - activeSince;
      activeSince = document.visibilityState === "visible" ? now : null;
      void api.event(sessionId, token, itemOrder, eventType, duration).catch(() => undefined);
    };

    send("presented");
    const visibility = () => {
      if (document.visibilityState === "hidden") send("hidden");
      else {
        activeSince = performance.now();
        send("presented");
      }
    };
    document.addEventListener("visibilitychange", visibility);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") send("heartbeat");
    }, 15_000);

    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(heartbeat);
      if (activeSince !== null) send("hidden");
    };
  }, [enabled, itemOrder, sessionId, token]);
}
