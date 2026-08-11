import { Headphones, LoaderCircle, Play, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import type { ExamMode } from "../types";

export function ListeningAudioPlayer({
  sessionId, token, audioAssetId, repeatCount, mode,
}: { sessionId: string; token: string; audioAssetId: string; repeatCount: number; mode: ExamMode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentPlayId = useRef<string | null>(null);
  const playIndex = useRef(0);
  const mounted = useRef(true);
  const requestGeneration = useRef(0);
  const [src, setSrc] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "complete" | "blocked" | "error">("idle");
  const [message, setMessage] = useState("");

  const start = async () => {
    if (status === "loading") return;
    setStatus("loading"); setMessage("");
    const generation = requestGeneration.current;
    const id = crypto.randomUUID(); currentPlayId.current = id;
    try {
      const result = await api.audioPlayback(sessionId, token, audioAssetId, id, "started");
      if (!mounted.current || generation !== requestGeneration.current || !result.audioUrl) return;
      playIndex.current = result.playNumber ?? playIndex.current + 1;
      setSrc(result.audioUrl); setStatus("playing");
      window.setTimeout(() => {
        void audioRef.current?.play().catch(() => { setStatus("blocked"); setMessage("재생 시작 버튼을 눌러 주세요."); });
      }, 0);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "AUDIO_REPLAY_LIMIT") { setStatus("complete"); setMessage("정해진 듣기 횟수를 모두 사용했습니다."); }
      else { setStatus("error"); setMessage(cause instanceof Error ? cause.message : "음원을 불러오지 못했습니다."); }
    }
  };

  useEffect(() => {
    mounted.current = true; requestGeneration.current += 1; playIndex.current = 0; currentPlayId.current = null; setSrc(""); setStatus("idle"); setMessage("");
    if (mode === "timed") void start();
    return () => {
      mounted.current = false; requestGeneration.current += 1;
      const audio = audioRef.current;
      if (audio) {
        audio.pause(); audio.currentTime = 0; audio.removeAttribute("src"); audio.load();
      }
      if (currentPlayId.current && !audioRef.current?.ended) void api.audioPlayback(sessionId, token, audioAssetId, currentPlayId.current, "interrupted").catch(() => undefined);
    };
    // A new asset represents a new listening group; start() intentionally runs once per group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioAssetId, mode, sessionId, token]);

  const ended = async () => {
    const id = currentPlayId.current;
    if (id) await api.audioPlayback(sessionId, token, audioAssetId, id, "completed").catch(() => undefined);
    if (mode === "timed" && playIndex.current < repeatCount) void start();
    else setStatus("complete");
  };

  return (
    <section className="mb-5 rounded-3xl bg-[#121723] p-5 text-white shadow-lg sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-blue-500/20 text-blue-300"><Headphones className="size-6" /></span><div><p className="text-xs font-black tracking-[.12em] text-blue-300">LISTENING</p><p className="mt-1 text-sm font-bold">{mode === "timed" ? `자동 재생 · 최대 ${repeatCount}회` : "연습 모드 · 자유롭게 다시 듣기"}</p></div></div>
        {mode === "timed" ? <div className="flex items-center gap-3"><span className="rounded-full bg-white/10 px-3 py-2 text-xs font-black">{Math.min(playIndex.current, repeatCount)} / {repeatCount}</span>{status === "loading" && <LoaderCircle className="size-5 animate-spin text-blue-300" />}{status === "playing" && <Volume2 className="size-5 animate-pulse text-blue-300" />}{(status === "blocked" || status === "error") && <button onClick={() => void (src && audioRef.current ? audioRef.current.play().then(() => setStatus("playing")).catch(() => undefined) : start())} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-[#155fcc]"><Play className="size-4" /> 재생 시작</button>}</div> : <button onClick={() => void start()} disabled={status === "loading"} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-[#155fcc]"><RotateCcw className="size-4" /> {src ? "다시 듣기" : "듣기 시작"}</button>}
      </div>
      {message && <p className="mt-3 text-sm font-bold text-amber-300">{message}</p>}
      <audio ref={audioRef} src={src} controls={mode === "practice"} onEnded={() => void ended()} className={mode === "practice" && src ? "mt-4 w-full" : "hidden"} />
    </section>
  );
}
