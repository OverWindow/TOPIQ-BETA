export type Locale = "id" | "ko";
export type ExamMode = "timed" | "practice";
export type SessionStatus = "in_progress" | "submitted";
export type ResponseEventType =
  | "presented"
  | "hidden"
  | "heartbeat"
  | "answer_selected"
  | "answer_changed";

export type QuestionContent = Record<string, unknown>;

export interface PublicQuestion {
  itemOrder: number;
  section: string;
  testPosition: number;
  itemId: string;
  itemVersion: number;
  itemType: string;
  stem: string;
  passage: string;
  auxiliaryText: string;
  questionPrompt: string;
  highlightText: string;
  choices: string[];
  selectedOption: number | null;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const stringChoices = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((choice) => text(choice)).filter(Boolean);
};

export function sanitizeQuestion(row: {
  item_order: number;
  section: string;
  test_position: number;
  item_id: string;
  item_version: number;
  item_type: string;
  stem: string;
  choices: unknown;
  content_json: QuestionContent;
  selected_option: number | null;
}): PublicQuestion {
  const content = row.content_json ?? {};
  const choices = stringChoices(content.choices);
  return {
    itemOrder: row.item_order,
    section: row.section,
    testPosition: row.test_position,
    itemId: row.item_id,
    itemVersion: row.item_version,
    itemType: row.item_type,
    stem: text(content.stem) || row.stem,
    passage: text(content.passage),
    auxiliaryText: text(content.auxiliary_text),
    questionPrompt: text(content.question_prompt),
    highlightText: text(content.highlight_text),
    choices: choices.length ? choices : stringChoices(row.choices),
    selectedOption: row.selected_option,
  };
}

export function clampActiveDuration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(60_000, Math.max(0, Math.round(value)));
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
}
