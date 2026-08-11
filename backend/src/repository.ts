import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import {
  clampActiveDuration,
  normalizeEmail,
  sanitizeQuestion,
  type ExamMode,
  type Locale,
  type ResponseEventType,
} from "./domain.js";
import { AppError, notFound, resultsLocked, sessionClosed, unauthorized } from "./errors.js";
import { SupabaseStorage } from "./storage.js";

type SessionRow = {
  session_id: string;
  user_id: string;
  mock_test_id: string;
  mode: ExamMode;
  status: "in_progress" | "submitted";
  access_token_hash: string;
  started_at: Date;
  expires_at: Date | null;
  submitted_at: Date | null;
  results_unlocked_at: Date | null;
  score: number | null;
  max_score: number;
  timed_out_submission: boolean;
};

type QuestionRow = {
  item_order: number;
  section: string;
  test_position: number;
  item_id: string;
  item_version: number;
  item_type: string;
  stem: string;
  choices: unknown;
  content_json: Record<string, unknown>;
  audio_asset_id: string | null;
  visual_assets: unknown;
  selected_option: number | null;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function assertToken(row: SessionRow, token: string) {
  const expected = Buffer.from(row.access_token_hash, "hex");
  const actual = Buffer.from(tokenHash(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw unauthorized();
  }
}

async function begin(): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query("BEGIN");
  return client;
}

async function loadSession(client: PoolClient, sessionId: string, forUpdate = false) {
  const result = await client.query<SessionRow>(
    `SELECT * FROM topik_app.sessions WHERE session_id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
    [sessionId],
  );
  const row = result.rows[0];
  if (!row) throw notFound("Session not found");
  return row;
}

function isExpired(session: SessionRow): boolean {
  return Boolean(
    session.status === "in_progress" &&
      session.mode === "timed" &&
      session.expires_at &&
      session.expires_at.getTime() <= Date.now(),
  );
}

async function finalizeInTransaction(
  client: PoolClient,
  session: SessionRow,
  timedOutSubmission: boolean,
) {
  const rows = await client.query<{
    user_id: string;
    session_id: string;
    item_id: string;
    item_version: number;
    item_order: number;
    selected_option: number | null;
    correct_answer: number | null;
    response_time_ms: string;
    answer_changed: boolean;
    theta_before: number | null;
    theta_after: number | null;
    policy_version: string;
    score_weight: number;
  }>(
    `SELECT s.user_id,
            si.session_id,
            si.item_id,
            si.item_version,
            si.item_order,
            a.selected_option,
            iv.correct_answer,
            COALESCE((
              SELECT SUM(e.active_duration_delta_ms)
              FROM topik_app.response_events e
              WHERE e.session_id = si.session_id AND e.item_order = si.item_order
            ), 0)::text AS response_time_ms,
            COALESCE((
              SELECT COUNT(DISTINCT e.selected_option) > 1
              FROM topik_app.response_events e
              WHERE e.session_id = si.session_id
                AND e.item_order = si.item_order
                AND e.event_type IN ('answer_selected', 'answer_changed')
                AND e.selected_option IS NOT NULL
            ), FALSE) AS answer_changed,
            si.theta_before,
            si.theta_after,
            si.policy_version,
            si.score_weight
       FROM topik_app.session_items si
       JOIN topik_app.sessions s ON s.session_id = si.session_id
       JOIN topik_bank.item_versions iv
         ON iv.item_id = si.item_id AND iv.item_version = si.item_version
       LEFT JOIN topik_app.answer_states a
         ON a.session_id = si.session_id AND a.item_order = si.item_order
      WHERE si.session_id = $1
      ORDER BY si.item_order`,
    [session.session_id],
  );

  for (const row of rows.rows) {
    const unanswered = row.selected_option === null;
    const correct = !unanswered && row.correct_answer === row.selected_option;
    await client.query(
      `INSERT INTO topik_app.response_observations(
          observation_id, user_id, session_id, item_id, item_version, item_order,
          selected_option, is_correct, response_time_ms, skipped, timed_out,
          answer_changed, theta_before, theta_after, policy_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (session_id, item_order) DO NOTHING`,
      [
        randomUUID(),
        row.user_id,
        row.session_id,
        row.item_id,
        row.item_version,
        row.item_order,
        row.selected_option,
        correct,
        Number(row.response_time_ms),
        unanswered && !timedOutSubmission,
        unanswered && timedOutSubmission,
        row.answer_changed,
        row.theta_before,
        row.theta_after,
        row.policy_version,
      ],
    );
  }

  const score = rows.rows.reduce(
    (total, row) =>
      total + (row.selected_option !== null && row.selected_option === row.correct_answer ? row.score_weight : 0),
    0,
  );

  await client.query(
    `UPDATE topik_app.sessions
        SET status = 'submitted',
            submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
            score = $2,
            timed_out_submission = $3,
            last_seen_at = CURRENT_TIMESTAMP
      WHERE session_id = $1`,
    [session.session_id, score, timedOutSubmission],
  );
}

async function finalizeIfExpired(sessionId: string, token: string) {
  const client = await begin();
  try {
    const session = await loadSession(client, sessionId, true);
    assertToken(session, token);
    if (isExpired(session)) {
      await finalizeInTransaction(client, session, true);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class TopikRepository {
  async listExams() {
    const result = await pool.query(
      `SELECT mock_test_id AS "id", slug, title_id AS "titleId", title_ko AS "titleKo",
              description_id AS "descriptionId", description_ko AS "descriptionKo",
              duration_seconds AS "durationSeconds", question_count AS "questionCount",
              max_score AS "maxScore", mts.section
         FROM topik_app.mock_tests mt
         JOIN LATERAL (SELECT section FROM topik_app.mock_test_sections
                        WHERE mock_test_id=mt.mock_test_id ORDER BY section_order LIMIT 1) mts ON TRUE
        WHERE mt.is_published = TRUE
        ORDER BY display_order`,
    );
    return result.rows;
  }

  async createSession(mockTestId: string, mode: ExamMode) {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const client = await begin();
    try {
      const exam = await client.query<{
        duration_seconds: number;
        question_count: number;
        max_score: number;
      }>(
        `SELECT duration_seconds, question_count, max_score
           FROM topik_app.mock_tests
          WHERE mock_test_id = $1 AND is_published = TRUE`,
        [mockTestId],
      );
      const selectedExam = exam.rows[0];
      if (!selectedExam) throw notFound("Mock test not found");

      await client.query("INSERT INTO topik_app.users(user_id) VALUES ($1)", [userId]);
      await client.query(
        `INSERT INTO topik_app.sessions(
           session_id, user_id, mock_test_id, mode, access_token_hash,
           expires_at, max_score
         ) VALUES (
           $1, $2, $3, $4, $5,
           CASE WHEN $4 = 'timed' THEN CURRENT_TIMESTAMP + ($6 * INTERVAL '1 second') ELSE NULL END,
           $7
         )`,
        [
          sessionId,
          userId,
          mockTestId,
          mode,
          tokenHash(token),
          selectedExam.duration_seconds,
          selectedExam.max_score,
        ],
      );

      const inserted = await client.query(
         `INSERT INTO topik_app.session_items(
           session_id, item_order, section, test_position,
           set_id, set_version, item_id, item_version, score_weight, policy_version
         )
         SELECT $1,
                ROW_NUMBER() OVER (ORDER BY mts.section_order, qsi.position),
                mts.section,
                qsi.position,
                mts.set_id,
                mts.set_version,
                qsi.item_id,
                qsi.item_version,
                2,
                'STATIC_MOCK_V1'
           FROM topik_app.mock_test_sections mts
           JOIN topik_bank.question_set_items qsi
             ON qsi.set_id = mts.set_id AND qsi.set_version = mts.set_version
          WHERE mts.mock_test_id = $2
          ORDER BY mts.section_order, qsi.position
        RETURNING item_order`,
        [sessionId, mockTestId],
      );
      if (inserted.rowCount !== selectedExam.question_count) {
        throw new AppError(503, "INCOMPLETE_EXAM", "The published mock test is incomplete");
      }

      await client.query("COMMIT");
      return { sessionId, userId, token };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSession(sessionId: string, token: string) {
    await finalizeIfExpired(sessionId, token);
    const sessionResult = await pool.query<SessionRow & {
      slug: string;
      title_id: string;
      title_ko: string;
    }>(
      `SELECT s.*, m.slug, m.title_id, m.title_ko
         FROM topik_app.sessions s
         JOIN topik_app.mock_tests m ON m.mock_test_id = s.mock_test_id
        WHERE s.session_id = $1`,
      [sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) throw notFound("Session not found");
    assertToken(session, token);

    const questions = await pool.query<QuestionRow>(
      `SELECT si.item_order, si.section, si.test_position, si.item_id, si.item_version,
              iv.item_type, iv.stem, iv.choices, iv.content_json, a.selected_option,
              iab.audio_asset_id,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'number', iva.option_number, 'imageUrl', iva.storage_url
              ) ORDER BY iva.option_number)
                FROM topik_app.item_visual_assets iva
               WHERE iva.item_id=si.item_id AND iva.item_version=si.item_version AND iva.is_current), '[]'::jsonb) visual_assets
         FROM topik_app.session_items si
         JOIN topik_bank.item_versions iv
           ON iv.item_id = si.item_id AND iv.item_version = si.item_version
         LEFT JOIN topik_app.answer_states a
           ON a.session_id = si.session_id AND a.item_order = si.item_order
         LEFT JOIN topik_app.item_audio_bindings iab
           ON iab.item_id=si.item_id AND iab.item_version=si.item_version AND iab.is_current
        WHERE si.session_id = $1
        ORDER BY si.item_order`,
      [sessionId],
    );
    await pool.query(
      "UPDATE topik_app.sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = $1",
      [sessionId],
    );
    return {
      sessionId: session.session_id,
      userId: session.user_id,
      mode: session.mode,
      status: session.status,
      startedAt: session.started_at.toISOString(),
      expiresAt: session.expires_at?.toISOString() ?? null,
      submittedAt: session.submitted_at?.toISOString() ?? null,
      resultsUnlocked: session.results_unlocked_at !== null,
      serverTime: new Date().toISOString(),
      exam: { slug: session.slug, titleId: session.title_id, titleKo: session.title_ko },
      questions: questions.rows.map((row) => sanitizeQuestion(row)),
    };
  }

  async recordEvent(input: {
    sessionId: string;
    token: string;
    itemOrder: number;
    clientEventId: string;
    eventType: Exclude<ResponseEventType, "answer_selected" | "answer_changed">;
    durationMs: number;
  }) {
    const client = await begin();
    try {
      const session = await loadSession(client, input.sessionId, true);
      assertToken(session, input.token);
      if (isExpired(session)) {
        await finalizeInTransaction(client, session, true);
        await client.query("COMMIT");
        return { accepted: false, submitted: true };
      }
      if (session.status !== "in_progress") throw sessionClosed();
      const result = await client.query(
        `INSERT INTO topik_app.response_events(
           event_id, client_event_id, session_id, item_order, event_type,
           active_duration_delta_ms
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (client_event_id) DO NOTHING`,
        [
          randomUUID(),
          input.clientEventId,
          input.sessionId,
          input.itemOrder,
          input.eventType,
          clampActiveDuration(input.durationMs),
        ],
      );
      await client.query("COMMIT");
      return { accepted: result.rowCount === 1, submitted: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveAnswer(input: {
    sessionId: string;
    token: string;
    itemOrder: number;
    clientEventId: string;
    selectedOption: number;
    durationMs: number;
  }) {
    const client = await begin();
    try {
      const session = await loadSession(client, input.sessionId, true);
      assertToken(session, input.token);
      if (isExpired(session)) {
        await finalizeInTransaction(client, session, true);
        await client.query("COMMIT");
        return { accepted: false, submitted: true };
      }
      if (session.status !== "in_progress") throw sessionClosed();

      const current = await client.query<{ selected_option: number }>(
        `SELECT selected_option FROM topik_app.answer_states
          WHERE session_id = $1 AND item_order = $2`,
        [input.sessionId, input.itemOrder],
      );
      const eventType =
        current.rows[0] && current.rows[0].selected_option !== input.selectedOption
          ? "answer_changed"
          : "answer_selected";
      const event = await client.query(
        `INSERT INTO topik_app.response_events(
           event_id, client_event_id, session_id, item_order, event_type,
           selected_option, active_duration_delta_ms
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (client_event_id) DO NOTHING`,
        [
          randomUUID(),
          input.clientEventId,
          input.sessionId,
          input.itemOrder,
          eventType,
          input.selectedOption,
          clampActiveDuration(input.durationMs),
        ],
      );
      if (event.rowCount === 1) {
        await client.query(
          `INSERT INTO topik_app.answer_states(
             session_id, item_order, selected_option
           ) VALUES ($1,$2,$3)
           ON CONFLICT (session_id, item_order) DO UPDATE SET
             selected_option = EXCLUDED.selected_option,
             final_selected_at = CURRENT_TIMESTAMP,
             selection_count = topik_app.answer_states.selection_count + 1`,
          [input.sessionId, input.itemOrder, input.selectedOption],
        );
      }
      await client.query("COMMIT");
      return { accepted: event.rowCount === 1, submitted: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAudioPlayback(input: {
    sessionId: string;
    token: string;
    audioAssetId: string;
    clientPlayId: string;
    eventType: "started" | "completed" | "interrupted";
  }) {
    const client = await begin();
    try {
      const session = await loadSession(client, input.sessionId, true);
      assertToken(session, input.token);
      if (isExpired(session)) {
        await finalizeInTransaction(client, session, true);
        await client.query("COMMIT");
        return { submitted: true };
      }
      if (session.status !== "in_progress") throw sessionClosed();
      const asset = await client.query<{ storage_path: string; repeat_count: number }>(
        `SELECT taa.storage_path,
                MAX(COALESCE((iv.content_json->>'repeat_count')::int,1))::int repeat_count
           FROM topik_app.session_items si
           JOIN topik_bank.item_versions iv ON iv.item_id=si.item_id AND iv.item_version=si.item_version
           JOIN topik_app.item_audio_bindings iab
             ON iab.item_id=si.item_id AND iab.item_version=si.item_version AND iab.is_current
           JOIN topik_app.tts_audio_assets taa ON taa.audio_asset_id=iab.audio_asset_id
          WHERE si.session_id=$1 AND iab.audio_asset_id=$2
          GROUP BY taa.storage_path`,
        [input.sessionId, input.audioAssetId],
      );
      const audio = asset.rows[0];
      if (!audio) throw notFound("Audio asset not found in this session");

      let playNumber: number;
      const started = await client.query<{ play_number: number }>(
        `SELECT play_number FROM topik_app.audio_playback_events
          WHERE session_id=$1 AND audio_asset_id=$2 AND client_play_id=$3 AND event_type='started'`,
        [input.sessionId, input.audioAssetId, input.clientPlayId],
      );
      if (started.rows[0]) {
        playNumber = started.rows[0].play_number;
      } else if (input.eventType === "started") {
        const count = await client.query<{ count: string }>(
          `SELECT COUNT(DISTINCT client_play_id)::text count FROM topik_app.audio_playback_events
            WHERE session_id=$1 AND audio_asset_id=$2 AND event_type='started'`,
          [input.sessionId, input.audioAssetId],
        );
        playNumber = Number(count.rows[0]?.count ?? 0) + 1;
        if (session.mode === "timed" && playNumber > audio.repeat_count) {
          throw new AppError(409, "AUDIO_REPLAY_LIMIT", "The listening replay limit has been reached");
        }
      } else {
        throw new AppError(409, "AUDIO_NOT_STARTED", "Start the audio before completing it");
      }
      await client.query(
        `INSERT INTO topik_app.audio_playback_events(
           playback_event_id,client_play_id,session_id,audio_asset_id,event_type,play_number
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (client_play_id,event_type) DO NOTHING`,
        [randomUUID(),input.clientPlayId,input.sessionId,input.audioAssetId,input.eventType,playNumber],
      );
      await client.query("COMMIT");
      if (input.eventType !== "started") return { submitted: false, playNumber };
      const audioUrl = await new SupabaseStorage().signedAudioUrl(audio.storage_path);
      return { submitted: false, playNumber, maxPlays: session.mode === "timed" ? audio.repeat_count : null, audioUrl };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async submitSession(sessionId: string, token: string) {
    const client = await begin();
    try {
      const session = await loadSession(client, sessionId, true);
      assertToken(session, token);
      if (session.status === "in_progress") {
        await finalizeInTransaction(client, session, isExpired(session));
      }
      await client.query("COMMIT");
      return { status: "submitted", resultsLocked: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveFeedback(input: {
    sessionId: string;
    token: string;
    rating: number;
    locale: Locale;
    email?: string;
    marketingConsent: boolean;
  }) {
    const client = await begin();
    try {
      const session = await loadSession(client, input.sessionId, true);
      assertToken(session, input.token);
      if (session.status !== "submitted") {
        throw new AppError(409, "SESSION_NOT_SUBMITTED", "Submit the session first");
      }
      if (input.email && !input.marketingConsent) {
        throw new AppError(400, "CONSENT_REQUIRED", "Marketing consent is required for email storage");
      }
      await client.query(
        `INSERT INTO topik_app.attempt_feedback(session_id, rating, locale)
         VALUES ($1,$2,$3)
         ON CONFLICT (session_id) DO UPDATE SET
           rating = EXCLUDED.rating,
           locale = EXCLUDED.locale,
           updated_at = CURRENT_TIMESTAMP`,
        [input.sessionId, input.rating, input.locale],
      );
      if (input.email) {
        const normalized = normalizeEmail(input.email);
        await client.query(
          `INSERT INTO topik_app.email_subscriptions(
             subscription_id, session_id, email_normalized, email_original, locale
           ) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (email_normalized) DO UPDATE SET
             session_id = EXCLUDED.session_id,
             email_original = EXCLUDED.email_original,
             locale = EXCLUDED.locale,
             consented_at = CURRENT_TIMESTAMP,
             unsubscribed_at = NULL`,
          [randomUUID(), input.sessionId, normalized, input.email.trim(), input.locale],
        );
      }
      await client.query(
        `UPDATE topik_app.sessions
            SET results_unlocked_at = COALESCE(results_unlocked_at, CURRENT_TIMESTAMP),
                last_seen_at = CURRENT_TIMESTAMP
          WHERE session_id = $1`,
        [input.sessionId],
      );
      await client.query("COMMIT");
      return { resultsUnlocked: true, emailSubscribed: Boolean(input.email) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getResults(sessionId: string, token: string) {
    await finalizeIfExpired(sessionId, token);
    const sessionResult = await pool.query<SessionRow & { title_id: string; title_ko: string }>(
      `SELECT s.*, m.title_id, m.title_ko
         FROM topik_app.sessions s
         JOIN topik_app.mock_tests m ON m.mock_test_id = s.mock_test_id
        WHERE s.session_id = $1`,
      [sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) throw notFound("Session not found");
    assertToken(session, token);
    if (session.status !== "submitted" || !session.results_unlocked_at) throw resultsLocked();

    const wrong = await pool.query<QuestionRow & {
      correct_answer: number;
      explanation: string;
    }>(
      `SELECT si.item_order, si.section, si.test_position, si.item_id, si.item_version,
              iv.item_type, iv.stem, iv.choices, iv.content_json,
              ro.selected_option, iv.correct_answer, iv.explanation,
              iab.audio_asset_id,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'number', iva.option_number, 'imageUrl', iva.storage_url
              ) ORDER BY iva.option_number)
                FROM topik_app.item_visual_assets iva
               WHERE iva.item_id=si.item_id AND iva.item_version=si.item_version AND iva.is_current), '[]'::jsonb) visual_assets
         FROM topik_app.response_observations ro
         JOIN topik_app.session_items si
           ON si.session_id = ro.session_id AND si.item_order = ro.item_order
         JOIN topik_bank.item_versions iv
           ON iv.item_id = si.item_id AND iv.item_version = si.item_version
         LEFT JOIN topik_app.item_audio_bindings iab
           ON iab.item_id=si.item_id AND iab.item_version=si.item_version AND iab.is_current
        WHERE ro.session_id = $1 AND ro.is_correct = FALSE
        ORDER BY si.item_order`,
      [sessionId],
    );
    return {
      sessionId,
      titleId: session.title_id,
      titleKo: session.title_ko,
      score: session.score ?? 0,
      maxScore: session.max_score,
      submittedAt: session.submitted_at?.toISOString() ?? null,
      incorrectCount: wrong.rowCount ?? 0,
      incorrect: wrong.rows.map((row) => ({
        ...sanitizeQuestion(row, { includeTranscript: true }),
        correctAnswer: row.correct_answer,
        explanation: row.explanation,
      })),
    };
  }
}
