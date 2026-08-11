import { ArrowLeft, CheckCircle2, ChevronDown, CircleX, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, getSessionToken } from "../api";
import { Header } from "../components/Header";
import { QuestionCard } from "../components/QuestionCard";
import { ErrorState, LoadingState } from "../components/States";
import { useI18n } from "../i18n";
import type { Results } from "../types";
import { questionTypeLabel } from "../questionTypeLabels";

export function ResultsPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const token = sessionId ? getSessionToken(sessionId) : null;
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!sessionId || !token) return setLoading(false);
    setLoading(true);
    try {
      setResults(await api.results(sessionId, token));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "RESULTS_LOCKED") {
        navigate(`/session/${sessionId}/feedback`, { replace: true });
        return;
      }
      setError(cause instanceof Error ? cause.message : "Unable to load results");
    } finally {
      setLoading(false);
    }
  }, [navigate, sessionId, token]);
  useEffect(() => { void load(); }, [load]);

  const incorrectGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof results>["incorrect"]>();
    for (const question of results?.incorrect ?? []) {
      const key = `${question.section}:${question.itemType}`;
      groups.set(key, [...(groups.get(key) ?? []), question]);
    }
    return Array.from(groups.values());
  }, [results]);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="min-h-screen bg-[#f7f9fc]"><Header compact /><LoadingState /></div>;
  if (error || !results) return <div className="min-h-screen bg-[#f7f9fc]"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={load} /></div>;

  const percentage = Math.round((results.score / results.maxScore) * 100);
  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <Header compact />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="overflow-hidden rounded-[30px] bg-[#121723] text-white shadow-[0_24px_70px_rgba(18,23,35,.16)]">
          <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
            <div>
              <p className="text-sm font-extrabold tracking-[0.12em] text-blue-400">{locale === "id" ? results.titleId : results.titleKo}</p>
              <h1 className="mt-4 text-3xl font-black sm:text-4xl">{t("resultTitle")}</h1>
              <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
                <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><CheckCircle2 className="size-4 text-emerald-400" /> {50 - results.incorrectCount} / 50</span>
                <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><CircleX className="size-4 text-rose-400" /> {results.incorrectCount} {t("incorrect")}</span>
              </div>
            </div>
            <div className="flex items-center gap-5 rounded-3xl bg-white p-6 text-[#121723]">
              <span className="grid size-14 place-items-center rounded-2xl bg-blue-50 text-[#155fcc]"><Trophy className="size-7" /></span>
              <div><p className="text-xs font-extrabold text-slate-400">{t("score")}</p><p className="mt-1 text-4xl font-black"><span className="text-[#155fcc]">{results.score}</span><span className="text-xl text-slate-400"> / {results.maxScore}</span></p><p className="mt-1 text-xs font-bold text-slate-500">{percentage}%</p></div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-sm font-extrabold text-[#155fcc]">REVIEW</p><h2 className="mt-2 text-2xl font-black text-slate-900">{t("incorrect")} · {results.incorrectCount}</h2></div>
            <Link to="/" className="focus-ring flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"><ArrowLeft className="size-4" /> {t("home")}</Link>
          </div>
          {results.incorrect.length === 0 ? (
            <div className="mt-7 rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center font-extrabold text-emerald-800">{t("perfect")}</div>
          ) : (
            <>
              <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
                <p className="text-xs font-black tracking-[.12em] text-[#155fcc]">WRONG ANSWER SUMMARY</p>
                <h3 className="mt-2 text-xl font-black text-slate-900">{locale === "ko" ? "틀린 유형과 문제" : "Jenis dan nomor soal yang salah"}</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {incorrectGroups.map((questions) => <button key={`${questions[0].section}-${questions[0].itemType}`} onClick={() => { const order = questions[0].itemOrder; setExpanded((current) => new Set(current).add(order)); document.getElementById(`incorrect-${order}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="focus-ring flex items-center justify-between rounded-2xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50/40"><span><b className="block text-sm text-slate-900">{questionTypeLabel(questions[0].itemType, questions[0].section, locale)}</b><span className="mt-1 block text-xs font-bold text-slate-400">{questions.map((question) => `${question.itemOrder}${locale === "ko" ? "번" : ""}`).join(", ")}</span></span><span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-black text-red-600">{questions.length}</span></button>)}
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {results.incorrect.map((question) => {
                  const isOpen = expanded.has(question.itemOrder);
                  return <article id={`incorrect-${question.itemOrder}`} key={question.itemOrder} className="scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><button onClick={() => setExpanded((current) => { const next = new Set(current); isOpen ? next.delete(question.itemOrder) : next.add(question.itemOrder); return next; })} className="focus-ring flex w-full items-center gap-4 p-5 text-left sm:p-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 font-black text-red-600">{question.itemOrder}</span><span className="min-w-0 flex-1"><b className="block text-sm text-slate-900">{questionTypeLabel(question.itemType, question.section, locale)}</b><span className="mt-1 block text-xs font-bold text-slate-500">{t("yourAnswer")} {question.selectedOption ?? t("noAnswer")} · {t("correctAnswer")} {question.correctAnswer}</span></span><ChevronDown className={`size-5 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} /></button>{isOpen && <div className="border-t border-slate-100 bg-slate-50/60 p-3 sm:p-5"><QuestionCard question={question} disabled showResult={{ correctAnswer: question.correctAnswer }} /><div className="mx-3 rounded-b-3xl border border-t-0 border-blue-100 bg-blue-50 p-5 sm:mx-6 sm:p-6"><p className="text-xs font-extrabold text-[#155fcc]">{t("explanation")}</p><p className="question-copy mt-2 text-sm font-medium text-slate-700 sm:text-base">{question.explanation || "—"}</p></div></div>}</article>;
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
