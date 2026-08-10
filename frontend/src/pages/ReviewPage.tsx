import { AlertTriangle, ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Header } from "../components/Header";
import { ErrorState, LoadingState } from "../components/States";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";

export function ReviewPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { token, session, error, loading, reload } = useSession(sessionId);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="exam-shell"><Header compact /><LoadingState /></div>;
  if (error || !session) return <div className="exam-shell"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;
  if (session.status === "submitted") {
    return <Navigate to={session.resultsUnlocked ? `/session/${sessionId}/results` : `/session/${sessionId}/feedback`} replace />;
  }

  const unanswered = session.questions.filter((question) => question.selectedOption === null);
  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submit(sessionId, token);
      navigate(`/session/${sessionId}/feedback`, { replace: true });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Unable to submit");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <Header compact />
      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(31,48,77,.07)] sm:p-10">
          <div className="flex flex-col gap-6 border-b border-slate-100 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-[#155fcc]">{locale === "id" ? session.exam.titleId : session.exam.titleKo}</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{t("reviewTitle")}</h1>
              <p className="mt-3 leading-7 text-slate-600">{t("reviewBody")}</p>
            </div>
            <div className={`shrink-0 rounded-2xl px-5 py-4 text-center ${unanswered.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
              <span className="block text-2xl font-black">{unanswered.length}</span>
              <span className="text-xs font-extrabold">{t("unanswered")}</span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-5 gap-2 sm:grid-cols-10">
            {session.questions.map((question) => (
              <button key={question.itemOrder} onClick={() => { sessionStorage.setItem(`unigate.topik.position.${sessionId}`, String(question.itemOrder)); navigate(`/session/${sessionId}`); }} className={`focus-ring relative grid aspect-square place-items-center rounded-xl border text-sm font-extrabold ${question.selectedOption !== null ? "border-blue-200 bg-blue-50 text-[#155fcc]" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                {question.itemOrder}
                {question.selectedOption !== null && <CheckCircle2 className="absolute right-1 top-1 size-3 text-blue-500" />}
              </button>
            ))}
          </div>

          {unanswered.length > 0 && (
            <div className="mt-8 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <span>{unanswered.map((question) => question.itemOrder).join(", ")} · {t("unanswered")}</span>
            </div>
          )}
          <p className="mt-8 text-sm font-semibold text-slate-500">{t("submitConfirm")}</p>
          {submitError && <p className="mt-3 text-sm font-bold text-red-600">{submitError}</p>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button onClick={() => navigate(`/session/${sessionId}`)} className="focus-ring flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3.5 font-bold text-slate-700"><ArrowLeft className="size-4" /> {t("backToTest")}</button>
            <button disabled={submitting} onClick={() => void submit()} className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-[#155fcc] px-6 py-3.5 font-extrabold text-white disabled:opacity-60"><Send className="size-4" /> {submitting ? t("loading") : t("submit")}</button>
          </div>
        </div>
      </main>
    </div>
  );
}
