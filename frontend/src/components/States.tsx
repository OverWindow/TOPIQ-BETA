import { AlertCircle, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 text-slate-500">
      <LoaderCircle className="size-8 animate-spin text-[#155fcc]" />
      <p className="font-semibold">{t("loading")}</p>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600">
        <AlertCircle className="size-7" />
      </span>
      <p className="text-lg font-bold text-slate-900">{message}</p>
      <div className="mt-6 flex gap-3">
        {retry && <button onClick={retry} className="rounded-xl bg-[#155fcc] px-5 py-3 font-bold text-white">{t("retry")}</button>}
        <Link to="/" className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700">{t("home")}</Link>
      </div>
    </div>
  );
}
