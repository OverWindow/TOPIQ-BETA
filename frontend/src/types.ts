export type Locale = "id" | "ko";
export type ExamMode = "timed" | "practice";

export interface Exam {
  id: string;
  slug: string;
  titleId: string;
  titleKo: string;
  descriptionId: string;
  descriptionKo: string;
  durationSeconds: number;
  questionCount: number;
  maxScore: number;
  section: "reading" | "listening" | "writing";
}

export interface VisualOption { number: number; imageUrl: string }
export interface TranscriptTurn { speaker: string; text: string }

export interface Question {
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
  visualOptions?: VisualOption[];
  audioAssetId?: string | null;
  repeatCount?: number;
  transcript?: TranscriptTurn[];
  selectedOption: number | null;
}

export interface TestSession {
  sessionId: string;
  userId: string;
  mode: ExamMode;
  status: "in_progress" | "submitted";
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  resultsUnlocked: boolean;
  serverTime: string;
  exam: { slug: string; titleId: string; titleKo: string };
  questions: Question[];
}

export interface IncorrectQuestion extends Question {
  correctAnswer: number;
  explanation: string;
}

export interface Results {
  sessionId: string;
  titleId: string;
  titleKo: string;
  score: number;
  maxScore: number;
  submittedAt: string | null;
  incorrectCount: number;
  incorrect: IncorrectQuestion[];
}

export interface AdminSummary {
  totalItems: number; totalVersions: number; readingVersions: number; listeningVersions: number;
  setCount: number; mockTestCount: number; publishedMockTests: number; audioReady: number;
  audioMissing: number; visualReady: number; jobsQueued: number; jobsProcessing: number;
  jobsFailed: number; sessionsToday: number;
  responseCount: number; answeredResponseCount: number; unansweredResponseCount: number;
}

export interface AdminListeningTarget {
  itemId: string; itemVersion: number; position: number; itemType: string; questionPrompt: string;
  visualOptionCount: number; visualReadyCount: number;
}

export interface AdminListeningGroup {
  setId: string; setVersion: number; positions: number[]; leaderItemId: string; leaderItemVersion: number;
  itemType: string; dialogueTurns: TranscriptTurn[]; questionPrompts: string[]; repeatCount: number;
  audioAssetId: string | null; audioStorageUrl: string | null;
  audioStatus: "ready" | "missing" | "partial"; targets: AdminListeningTarget[];
  lastError: string | null; ttsStyle: TtsStyle | null;
}

export interface TtsJob {
  jobId: string; itemId: string; itemVersion: number; status: "queued" | "processing" | "succeeded" | "failed";
  attempts: number; errorMessage: string | null; audioAssetId: string | null; createdAt: string; completedAt: string | null;
}

export interface AdminListeningMockTest {
  mockTestId: string; titleKo: string; published: boolean; setId: string; setVersion: number;
  itemCount: number; audioReady: number; visualRequired: number; visualReady: number;
}

export interface TtsStyle {
  speakingRate: number;
  stylePrompt: string;
}

export interface AdminReadingItem {
  setId: string; setVersion: number; position: number; mockTestTitle: string | null;
  itemId: string; itemVersion: number; itemType: string; targetLevel: number;
  predictedDifficulty: number; reviewStatus: string; stem: string; choices: string[];
  correctAnswer: number | null; explanation: string; contentJson: Record<string, unknown>;
}

export interface AdminResponseSession {
  sessionId: string; userId: string; mockTestTitle: string; mode: ExamMode; status: "submitted";
  startedAt: string; submittedAt: string; score: number; maxScore: number; rating: number | null;
  section: "reading" | "listening"; responseCount: number; answeredCount: number;
  unansweredCount: number; correctCount: number; incorrectCount: number;
}

export interface AdminResponseObservation {
  observationId: string; userId: string; sessionId: string; itemId: string; itemVersion: number;
  itemOrder: number; section: "reading" | "listening"; testPosition: number; mockTestTitle: string; itemType: string;
  selectedOption: number | null; correctAnswer: number; isCorrect: boolean; responseTimeMs: number; skipped: boolean;
  timedOut: boolean; answerChanged: boolean; policyVersion: string; createdAt: string;
  mode: ExamMode; score: number | null; rating: number | null;
}
