import { Check, FileText, Quote } from "lucide-react";
import type { ReactNode } from "react";
import type { Question } from "../types";
import { getQuestionPresentation, type QuestionPresentation } from "./questionPresentation";

const choiceLabels = ["①", "②", "③", "④"];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function RichQuestionText({ text, highlight }: { text: string; highlight: string }) {
  const hasInlineHighlight = Boolean(highlight && text.includes(highlight));
  const tokens = ["\\(\\s*\\)"];
  if (hasInlineHighlight) tokens.unshift(escapeRegExp(highlight));
  const parts = text.split(new RegExp(`(${tokens.join("|")})`, "g"));

  return parts.map((part, index) => {
    if (hasInlineHighlight && part === highlight) {
      return (
        <mark
          key={`${part}-${index}`}
          data-testid="inline-highlight"
          className="rounded bg-amber-100 px-1 font-bold text-amber-950 underline decoration-2 decoration-amber-500 underline-offset-4"
        >
          {part}
        </mark>
      );
    }
    if (/^\(\s*\)$/.test(part)) {
      return (
        <span
          key={`blank-${index}`}
          data-testid="blank-marker"
          className="mx-1 inline-flex min-w-16 items-center justify-center rounded-lg border-2 border-dashed border-[#155fcc]/45 bg-blue-50 px-3 py-0.5 font-extrabold text-[#155fcc]"
        >
          ( )
        </span>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

function HighlightFallback({ highlight }: { highlight: string }) {
  if (!highlight) return null;
  return (
    <div data-testid="highlight-fallback" className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-950">
      <Quote className="mt-1 size-4 shrink-0 text-amber-600" />
      <span>{highlight}</span>
    </div>
  );
}

function BodyText({
  presentation,
  highlight,
}: {
  presentation: QuestionPresentation;
  highlight: string;
}) {
  const { body, layout, auxiliary, groupLabel } = presentation;
  const highlightIsInline = Boolean(highlight && body.includes(highlight));
  let content: ReactNode;

  if (layout === "headline") {
    content = (
      <div data-testid="headline-body" className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-6 py-10 text-center shadow-sm sm:px-10">
        <p className="question-copy text-xl font-black leading-9 text-slate-900 sm:text-2xl">{body}</p>
      </div>
    );
  } else if (layout === "sequence") {
    const rows = body.split(/\n+/).map((row) => row.trim()).filter(Boolean);
    content = (
      <div data-testid="sequence-body" className="space-y-2.5 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 sm:p-6">
        {rows.map((row, index) => (
          <div key={`${row}-${index}`} className="question-copy rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[15px] font-medium text-slate-800 shadow-sm sm:px-5 sm:text-base">
            <RichQuestionText text={row} highlight={highlight} />
          </div>
        ))}
      </div>
    );
  } else if (layout === "insertion") {
    content = (
      <div data-testid="insertion-body" className="space-y-4">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
          <p className="mb-2 text-xs font-black tracking-[0.12em] text-[#155fcc]">주어진 문장</p>
          <p className="question-copy font-bold text-slate-900">{auxiliary}</p>
        </div>
        <div className="question-copy rounded-3xl border border-slate-200 bg-slate-50/80 p-5 text-[15px] text-slate-800 sm:p-7 sm:text-base">
          <RichQuestionText text={body} highlight={highlight} />
        </div>
      </div>
    );
  } else if (layout === "material") {
    content = (
      <div data-testid="material-body" className="question-copy rounded-3xl border border-blue-100 bg-[linear-gradient(135deg,#f5f9ff,#fff)] p-6 text-[15px] font-semibold text-slate-800 shadow-sm sm:p-8 sm:text-base">
        <RichQuestionText text={body} highlight={highlight} />
      </div>
    );
  } else if (layout === "inline") {
    content = (
      <div data-testid="inline-body" className="question-copy rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-8 text-center text-lg font-bold leading-9 text-slate-900 sm:px-8 sm:py-10 sm:text-xl">
        <RichQuestionText text={body} highlight={highlight} />
      </div>
    );
  } else {
    content = (
      <div data-testid="passage-body" className="question-copy rounded-3xl border border-slate-200 bg-slate-50/80 p-5 text-[15px] text-slate-800 sm:p-7 sm:text-base">
        <RichQuestionText text={body} highlight={highlight} />
      </div>
    );
  }

  return (
    <div>
      {groupLabel && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3.5 py-2 text-xs font-black text-[#155fcc]">
          <FileText className="size-3.5" />
          {groupLabel}
        </div>
      )}
      {content}
      {!highlightIsInline && <HighlightFallback highlight={highlight} />}
    </div>
  );
}

function ChoiceList({
  question,
  onAnswer,
  disabled,
  correctAnswer,
}: {
  question: Question;
  onAnswer?: (option: number) => void;
  disabled: boolean;
  correctAnswer?: number;
}) {
  return (
    <div className="grid content-start gap-3" role="radiogroup" aria-label="Answer choices">
      {question.choices.map((choice, index) => {
        const option = index + 1;
        const selected = question.selectedOption === option;
        const correct = correctAnswer === option;
        return (
          <button
            key={`${option}-${choice}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onAnswer?.(option)}
            className={`choice-button focus-ring flex min-h-15 items-start gap-4 rounded-2xl border px-4 py-4 text-left sm:px-5 ${
              correct
                ? "border-emerald-400 bg-emerald-50"
                : selected
                  ? "border-[#155fcc] bg-blue-50 shadow-[0_0_0_1px_#155fcc]"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
            } disabled:cursor-default`}
          >
            <span className={`grid size-7 shrink-0 place-items-center rounded-full border text-sm font-bold ${selected ? "border-[#155fcc] bg-[#155fcc] text-white" : correct ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-500"}`}>
              {correct ? <Check className="size-4" /> : choiceLabels[index]}
            </span>
            <span className="question-copy pt-0.5 text-[15px] font-medium text-slate-800 sm:text-base">{choice}</span>
          </button>
        );
      })}
    </div>
  );
}

export function QuestionCard({
  question,
  onAnswer,
  disabled = false,
  showResult,
}: {
  question: Question;
  onAnswer?: (option: number) => void;
  disabled?: boolean;
  showResult?: { correctAnswer: number };
}) {
  const presentation = getQuestionPresentation(question);
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(31,48,77,0.07)] sm:p-8 lg:p-10">
      <div className="mb-7 flex items-start gap-3 border-b border-slate-100 pb-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#155fcc] text-sm font-extrabold text-white">
          {question.testPosition}
        </span>
        <h1 className="question-copy pt-1 text-lg font-extrabold text-slate-900 sm:text-xl">
          {presentation.instruction}
        </h1>
      </div>

      <div
        data-testid="question-layout"
        data-question-layout={presentation.layout}
        data-two-column={presentation.twoColumn}
        className={presentation.twoColumn ? "grid gap-7 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,.88fr)] lg:items-start" : "space-y-7"}
      >
        <BodyText presentation={presentation} highlight={question.highlightText} />
        <ChoiceList
          question={question}
          onAnswer={onAnswer}
          disabled={disabled}
          correctAnswer={showResult?.correctAnswer}
        />
      </div>
    </article>
  );
}
