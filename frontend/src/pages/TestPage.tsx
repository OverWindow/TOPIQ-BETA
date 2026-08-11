import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Grid3X3, Save, TimerOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Header } from "../components/Header";
import { QuestionCard } from "../components/QuestionCard";
import { ListeningAudioPlayer } from "../components/ListeningAudioPlayer";
import { ErrorState, LoadingState } from "../components/States";
import { useActiveTime } from "../hooks/useActiveTime";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function TestPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { token, session, setSession, error, loading, reload } = useSession(sessionId);
  const [currentOrder, setCurrentOrder] = useState(() => Number(sessionStorage.getItem(`unigate.topik.position.${sessionId}`)) || 1);
  const [saveError, setSaveError] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState(currentOrder);

  const current = session?.questions.find((question) => question.itemOrder === currentOrder) ?? session?.questions[0];
  const displayQuestions = useMemo(() => {
    if (!session || !current) return [];
    if (!current.itemType.startsWith("paired_")) return [current];
    return session.questions.filter((question) => question.itemType === current.itemType).sort((a, b) => a.itemOrder - b.itemOrder);
  }, [current, session]);
  const lastDisplayOrder = displayQuestions.at(-1)?.itemOrder ?? currentOrder;
  useActiveTime(sessionId ?? "", token ?? "", activeOrder, Boolean(session && token && current && session.status === "in_progress"));

  const displayStartOrder = displayQuestions[0]?.itemOrder ?? currentOrder;
  useEffect(() => { setActiveOrder(displayStartOrder); }, [currentOrder, displayStartOrder]);

  useEffect(() => {
    if (!session) return;
    if (session.status === "submitted") {
      navigate(session.resultsUnlocked ? `/session/${session.sessionId}/results` : `/session/${session.sessionId}/feedback`, { replace: true });
      return;
    }
    if (session.mode === "timed" && session.expiresAt) {
      const offset = Date.now() - new Date(session.serverTime).getTime();
      const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(session.expiresAt!).getTime() + offset - Date.now()) / 1000)));
      tick();
      const interval = window.setInterval(tick, 1000);
      return () => window.clearInterval(interval);
    }
    setRemaining(null);
  }, [navigate, session]);

  useEffect(() => {
    if (remaining !== 0 || !sessionId || !token || submitting) return;
    setSubmitting(true);
    void api.submit(sessionId, token).finally(() => navigate(`/session/${sessionId}/feedback`, { replace: true }));
  }, [navigate, remaining, sessionId, submitting, token]);

  const answered = useMemo(() => session?.questions.filter((question) => question.selectedOption !== null).length ?? 0, [session]);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="exam-shell"><Header compact /><LoadingState /></div>;
  if (error || !session || !current) return <div className="exam-shell"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;

  const go = (order: number) => {
    let bounded = Math.max(1, Math.min(session.questions.length, order));
    const target = session.questions.find((question) => question.itemOrder === bounded);
    if (target?.itemType.startsWith("paired_")) {
      bounded = Math.min(...session.questions.filter((question) => question.itemType === target.itemType).map((question) => question.itemOrder));
    }
    sessionStorage.setItem(`unigate.topik.position.${sessionId}`, String(bounded));
    setCurrentOrder(bounded);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const answer = async (itemOrder: number, selectedOption: number) => {
    setSaveError(false);
    setSession({
      ...session,
      questions: session.questions.map((question) => question.itemOrder === itemOrder ? { ...question, selectedOption } : question),
    });
    setActiveOrder(itemOrder);
    try {
      const result = await api.answer(sessionId, token, itemOrder, selectedOption, 0);
      if (result.submitted) navigate(`/session/${sessionId}/feedback`, { replace: true });
    } catch {
      setSaveError(true);
    }
  };

  return (
    <div className="exam-shell pb-28">
      <Header compact />
      <div className="sticky top-0 z-10 border-b border-blue-100 bg-[#155fcc] text-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3 text-sm font-extrabold">
            <span>{locale === "id" ? session.exam.titleId : session.exam.titleKo}</span>
            <span className="hidden rounded-full bg-white/15 px-3 py-1 text-xs sm:inline">{answered} / {session.questions.length}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-black text-[#155fcc]">
            {remaining === null ? <TimerOff className="size-4" /> : <Clock3 className="size-4" />}
            <span>{remaining === null ? t("practiceMode") : `${t("timeLeft")} ${formatTime(remaining)}`}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="mb-4 flex items-center justify-between px-1 text-sm font-bold text-slate-500">
            <span>{t("question")} {displayQuestions.length > 1 ? `${displayQuestions[0].itemOrder}~${lastDisplayOrder}` : current.itemOrder} / {session.questions.length}</span>
            <span className="flex items-center gap-2"><Save className="size-4 text-emerald-500" /> {t("answered")} {answered}</span>
          </div>
          {current.section === "listening" && current.audioAssetId && <ListeningAudioPlayer key={current.audioAssetId} sessionId={sessionId} token={token} audioAssetId={current.audioAssetId} repeatCount={current.repeatCount ?? 1} mode={session.mode} />}
          <div className="space-y-5">{displayQuestions.map((question) => <div key={question.itemOrder} onFocus={() => setActiveOrder(question.itemOrder)} onPointerDown={() => setActiveOrder(question.itemOrder)}><QuestionCard question={question} onAnswer={(option) => void answer(question.itemOrder, option)} /></div>)}</div>
          {saveError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{t("saveError")}</p>}
        </div>

        <aside className="order-first rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:order-last lg:sticky lg:top-20 lg:h-fit">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Grid3X3 className="size-4 text-[#155fcc]" /> {t("question")}</span>
            <span className="text-xs font-bold text-slate-400">{answered}/{session.questions.length}</span>
          </div>
          <div className="grid grid-cols-10 gap-1.5 lg:grid-cols-5">
            {session.questions.map((question) => (
              <button key={question.itemOrder} onClick={() => go(question.itemOrder)} aria-label={`${t("question")} ${question.itemOrder}`} className={`focus-ring grid aspect-square place-items-center rounded-lg text-xs font-extrabold ${displayQuestions.some((shown) => shown.itemOrder === question.itemOrder) ? "bg-[#155fcc] text-white" : question.selectedOption !== null ? "bg-blue-100 text-[#155fcc]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                {question.itemOrder}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 shadow-[0_-8px_30px_rgba(25,45,75,.08)] backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
          <button disabled={current.itemOrder === 1} onClick={() => go(current.itemOrder - 1)} className="focus-ring flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 font-bold text-slate-700 disabled:opacity-35"><ArrowLeft className="size-4" /> <span className="hidden sm:inline">{t("previous")}</span></button>
          <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 sm:block"><div className="h-full rounded-full bg-[#155fcc] transition-all" style={{ width: `${(answered / session.questions.length) * 100}%` }} /></div>
          {lastDisplayOrder < session.questions.length ? (
            <button onClick={() => go(lastDisplayOrder + 1)} className="focus-ring flex items-center gap-2 rounded-xl bg-[#155fcc] px-5 py-3 font-extrabold text-white">{t("next")} <ArrowRight className="size-4" /></button>
          ) : (
            <button onClick={() => navigate(`/session/${sessionId}/review`)} className="focus-ring flex items-center gap-2 rounded-xl bg-[#155fcc] px-5 py-3 font-extrabold text-white"><CheckCircle2 className="size-4" /> {t("review")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
