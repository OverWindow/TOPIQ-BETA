import { Languages } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function Header({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <header className={`relative z-20 ${compact ? "border-b border-slate-200 bg-white" : "bg-transparent"}`}>
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="focus-ring flex items-center gap-3 rounded-lg" aria-label="UNIGATE TOPIK home">
          <img
            src="/logo.svg"
            alt="UNIGATE"
            className="h-6 w-auto sm:h-7"
          />
          <span className="hidden border-l border-slate-200 pl-3 text-[10px] font-bold tracking-[0.12em] text-slate-500 sm:block">TOPIK LAB</span>
        </Link>

        {!compact && (
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex" aria-label="Main navigation">
            <a className="hover:text-[#155fcc]" href="#tests">{t("navTests")}</a>
            <a className="hover:text-[#155fcc]" href="#guide">{t("navGuide")}</a>
          </nav>
        )}

        <div className="flex items-center rounded-full border border-slate-200 bg-white/85 p-1 shadow-sm backdrop-blur">
          <Languages className="ml-2 size-4 text-slate-500" aria-hidden="true" />
          {(["id", "ko"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocale(value)}
              className={`focus-ring ml-1 rounded-full px-3 py-1.5 text-xs font-bold ${locale === value ? "bg-[#155fcc] text-white" : "text-slate-500 hover:text-slate-800"}`}
              aria-pressed={locale === value}
            >
              {value === "id" ? "ID" : "한국어"}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
