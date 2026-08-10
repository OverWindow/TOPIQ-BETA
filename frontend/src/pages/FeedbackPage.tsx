import { ArrowRight, Mail, Star } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Header } from "../components/Header";
import { ErrorState, LoadingState } from "../components/States";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";

export function FeedbackPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { token, session, error, loading, reload } = useSession(sessionId);
  const [rating, setRating] = useState(0);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="min-h-screen bg-[#f7f9fc]"><Header compact /><LoadingState /></div>;
  if (error || !session) return <div className="min-h-screen bg-[#f7f9fc]"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;
  if (session.resultsUnlocked) {
    return <Navigate to={`/session/${sessionId}/results`} replace />;
  }
  if (session.status !== "submitted") {
    return <Navigate to={`/session/${sessionId}`} replace />;
  }

  const save = async () => {
    if (!rating) return setFormError(t("ratingRequired"));
    if (emailEnabled && email && !consent) return setFormError(t("consentRequired"));
    setSaving(true);
    setFormError(null);
    try {
      await api.feedback(sessionId, token, {
        rating,
        locale,
        email: emailEnabled && email ? email : undefined,
        marketingConsent: emailEnabled && Boolean(email) && consent,
      });
      navigate(`/session/${sessionId}/results`, { replace: true });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save feedback");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <Header compact />
      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
        <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(31,48,77,.10)]">
          <div className="bg-[#155fcc] px-6 py-8 text-center text-white sm:px-10 sm:py-10">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/15"><Star className="size-7" /></span>
            <h1 className="mt-5 text-3xl font-black">{t("feedbackTitle")}</h1>
            <p className="mx-auto mt-3 max-w-lg leading-7 text-blue-100">{t("feedbackBody")}</p>
          </div>
          <div className="p-6 sm:p-10">
            <div className="flex justify-center gap-2" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} onClick={() => setRating(value)} className="focus-ring rounded-xl p-1.5" aria-label={`${value} stars`} aria-pressed={rating === value}>
                  <Star className={`size-9 sm:size-11 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                </button>
              ))}
            </div>
            <div className="mt-9 border-t border-slate-100 pt-8">
              <label className="flex cursor-pointer items-start gap-3 font-bold text-slate-800">
                <input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} className="mt-1 size-4 accent-[#155fcc]" />
                <span>{t("emailLabel")}</span>
              </label>
              {emailEnabled && (
                <div className="mt-5 space-y-4">
                  <label className="relative block"><Mail className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailPlaceholder")} className="focus-ring w-full rounded-2xl border border-slate-200 py-4 pl-12 pr-4 outline-none focus:border-[#155fcc]" /></label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-600"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4 accent-[#155fcc]" /><span>{t("consent")}</span></label>
                </div>
              )}
            </div>
            {formError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{formError}</p>}
            <button disabled={saving} onClick={() => void save()} className="focus-ring mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#155fcc] px-6 py-4 font-extrabold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? t("loading") : t("unlock")} <ArrowRight className="size-5" /></button>
          </div>
        </div>
      </main>
    </div>
  );
}
