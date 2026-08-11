import { ArrowRight, BookOpen, CheckCircle2, Clock3, Headphones, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Header } from "../components/Header";
import { ErrorState, LoadingState } from "../components/States";
import { useI18n } from "../i18n";
import type { Exam, ExamMode } from "../types";

export function LandingPage() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [modes, setModes] = useState<Record<string, ExamMode>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.exams();
      setExams(data);
      setModes(Object.fromEntries(data.map((exam) => [exam.id, "timed"])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const start = async (exam: Exam) => {
    setStarting(exam.id);
    setError(null);
    try {
      const created = await api.createSession(exam.id, modes[exam.id] ?? "timed");
      navigate(`/session/${created.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start exam");
      setStarting(null);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <section className="hero-glow relative overflow-hidden">
        <div className="brand-grid pointer-events-none absolute inset-0" />
        <Header />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-22 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
          <div>
            {/* <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/75 px-4 py-2 text-xs font-extrabold tracking-[0.16em] text-[#155fcc] shadow-sm backdrop-blur">
              <Sparkles className="size-4" /> {t("heroEyebrow")}
            </span> */}
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.13] tracking-[-0.035em] text-[#121723] sm:text-5xl lg:text-[62px]">
              {t("heroTitle")}
            </h1>
            <p className="mt-7 max-w-2xl text-base font-medium leading-8 text-slate-600 sm:text-lg">{t("heroBody")}</p>
            <a href="#tests" className="focus-ring mt-9 inline-flex items-center gap-3 rounded-2xl bg-[#155fcc] px-6 py-4 font-extrabold text-white shadow-[0_16px_32px_rgba(21,95,204,.26)] hover:bg-blue-700">
              {t("chooseTest")} <ArrowRight className="size-5" />
            </a>
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-6 rounded-[44px] bg-gradient-to-br from-blue-200/55 to-indigo-100/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[32px] border border-white bg-white/90 p-7 shadow-[0_28px_90px_rgba(35,70,130,.17)] backdrop-blur sm:p-9">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-[#155fcc]">TOPIK II · READING</span>
                <span className="text-sm font-bold text-slate-400">50 QUESTIONS</span>
              </div>
              <div className="mt-8 border-y border-slate-100 py-8">
                <p className="text-sm font-bold text-slate-400">QUESTION 25</p>
                <p className="mt-3 text-xl font-extrabold leading-8 text-slate-900">다음 신문 기사의 제목을 가장 잘 설명한 것을 고르십시오.</p>
                <div className="mt-6 space-y-3">
                  {["①", "②", "③", "④"].map((number, index) => (
                    <div key={number} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${index === 1 ? "border-[#155fcc] bg-blue-50 text-[#155fcc]" : "border-slate-200 text-slate-500"}`}>
                      <span>{number}</span><span className="h-2 rounded-full bg-current opacity-25" style={{ width: `${54 + index * 8}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between text-sm font-bold">
                <span className="text-slate-500">24 / 50</span>
                <span className="flex items-center gap-2 text-[#155fcc]"><Clock3 className="size-4" /> 38:24</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tests" className="scroll-mt-8 bg-[#f7f9fc] py-20 sm:py-26">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl">
            {/* <p className="text-sm font-extrabold tracking-[0.14em] text-[#155fcc]">MOCK TEST</p> */}
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{t("chooseTest")}</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">{t("chooseSubtitle")}</p>
          </div>
          {loading ? <LoadingState /> : error && !exams.length ? <ErrorState message={error} retry={load} /> : (
            <div className="mt-11 grid gap-6 lg:grid-cols-2">
              {exams.map((exam, index) => {
                const mode = modes[exam.id] ?? "timed";
                return (
                  <article key={exam.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(30,51,86,.06)] sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-13 place-items-center rounded-2xl bg-[#155fcc] text-xl font-black text-white">{index + 1}</span>
                      <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-500">{exam.section === "listening" ? <Headphones className="size-3.5" /> : <BookOpen className="size-3.5" />}{exam.section.toUpperCase()} · 50 × 2 PTS</span>
                    </div>
                    <h3 className="mt-7 text-2xl font-black text-slate-900">{locale === "id" ? exam.titleId : exam.titleKo}</h3>
                    <p className="mt-3 leading-7 text-slate-600">{locale === "id" ? exam.descriptionId : exam.descriptionKo}</p>
                    <div className="mt-7 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Exam mode">
                      {(["timed", "practice"] as ExamMode[]).map((value) => (
                        <button key={value} onClick={() => setModes((current) => ({ ...current, [exam.id]: value }))} className={`focus-ring rounded-2xl border p-4 text-left ${mode === value ? "border-[#155fcc] bg-blue-50 shadow-[0_0_0_1px_#155fcc]" : "border-slate-200 hover:border-blue-200"}`} aria-pressed={mode === value}>
                          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">{value === "timed" ? <Clock3 className="size-4 text-[#155fcc]" /> : <RotateCcw className="size-4 text-[#155fcc]" />}{t(value)}</span>
                          <span className="mt-2 block text-xs leading-5 text-slate-500">{value === "timed" ? `${Math.round(exam.durationSeconds / 60)}분 · ${t("autoSubmit")}` : t("practiceDesc")}</span>
                        </button>
                      ))}
                    </div>
                    <button disabled={starting !== null} onClick={() => void start(exam)} className="focus-ring mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#155fcc] px-5 py-4 font-extrabold text-white hover:bg-blue-700 disabled:opacity-60">
                      {starting === exam.id ? t("loading") : t("start")} <ArrowRight className="size-5" />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {error && exams.length > 0 && <p className="mt-5 text-sm font-semibold text-red-600">{error}</p>}
        </div>
      </section>

      <section id="guide" className="py-20 sm:py-26">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="rounded-[32px] bg-[#121723] px-6 py-12 text-white sm:px-10 lg:px-14">
            <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
              <div><BookOpen className="size-9 text-blue-400" /><h2 className="mt-5 text-3xl font-black leading-tight">{t("guideTitle")}</h2><p className="mt-5 text-sm leading-7 text-slate-400">{t("privacy")}</p></div>
              <div className="grid gap-4">
                {[t("guide1"), t("guide2"), t("guide3")].map((copy) => <div key={copy} className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-5"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-blue-400" /><p className="font-semibold leading-6 text-slate-200">{copy}</p></div>)}
              </div>
            </div>
          </div>
          <footer className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-8 text-sm text-slate-500 sm:flex-row">
            <span className="flex items-center gap-2 font-bold text-slate-700"><ShieldCheck className="size-4 text-[#155fcc]" /> UNIGATE TOPIK LAB</span>
            <span>© 2026 UNIGATE. All rights reserved.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
