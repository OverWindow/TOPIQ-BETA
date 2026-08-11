import type { Question } from "../types";

export type QuestionLayout =
  | "inline"
  | "material"
  | "sequence"
  | "blank"
  | "headline"
  | "passage"
  | "insertion"
  | "paired";

export interface QuestionPresentation {
  layout: QuestionLayout;
  instruction: string;
  body: string;
  auxiliary: string;
  groupLabel: string;
  twoColumn: boolean;
}

const layoutByItemType: Record<string, QuestionLayout> = {
  grammar_blank: "inline",
  similar_expression: "inline",
  short_text_topic: "material",
  content_match_short: "material",
  sentence_order: "sequence",
  paragraph_blank_short: "blank",
  paragraph_blank: "blank",
  headline_interpretation: "headline",
  content_match: "passage",
  main_topic: "passage",
  sentence_insertion: "insertion",
};

const fallbackInstructions: Record<string, string> = {
  grammar_blank: "( )에 들어갈 말로 가장 알맞은 것을 고르십시오.",
  similar_expression: "밑줄 친 부분과 의미가 가장 비슷한 것을 고르십시오.",
};

function pairedLabel(itemType: string, listening: boolean) {
  const match = /^paired_(\d+)_(\d+)$/.exec(itemType);
  const suffix = listening ? "공통 듣기" : "공통 지문";
  return match ? `${match[1]}~${match[2]}번 ${suffix}` : suffix;
}

export function getQuestionPresentation(question: Question): QuestionPresentation {
  const isPaired = question.itemType.startsWith("paired_");
  const layout = isPaired ? "paired" : (layoutByItemType[question.itemType] ?? (question.passage ? "passage" : "inline"));
  const hasStructuredContent = Boolean(
    question.passage || question.questionPrompt || question.auxiliaryText,
  );
  const body = question.passage || (!hasStructuredContent ? question.stem : "");
  const instruction =
    question.questionPrompt ||
    fallbackInstructions[question.itemType] ||
    (question.section === "listening" ? "다음을 듣고 물음에 답하십시오." : "다음을 읽고 물음에 답하십시오.");
  const twoColumn = question.section !== "listening" && (
    layout === "passage" ||
    layout === "paired" ||
    layout === "sequence" ||
    layout === "insertion" ||
    (layout === "blank" && question.itemType === "paragraph_blank"));

  return {
    layout,
    instruction,
    body,
    auxiliary: question.auxiliaryText,
    groupLabel: isPaired ? pairedLabel(question.itemType, question.section === "listening") : "",
    twoColumn,
  };
}
