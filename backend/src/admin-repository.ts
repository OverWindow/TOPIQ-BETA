import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { AppError, notFound } from "./errors.js";
import type { TtsStyle } from "./google-tts.js";

export class AdminRepository {
  async dashboard() {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(DISTINCT item_id) FROM topik_bank.item_versions)::int AS "totalItems",
        (SELECT COUNT(*) FROM topik_bank.item_versions)::int AS "totalVersions",
        (SELECT COUNT(*) FROM topik_bank.item_versions WHERE section='reading')::int AS "readingVersions",
        (SELECT COUNT(*) FROM topik_bank.item_versions WHERE section='listening')::int AS "listeningVersions",
        (SELECT COUNT(*) FROM topik_bank.question_sets)::int AS "setCount",
        (SELECT COUNT(*) FROM topik_app.mock_tests)::int AS "mockTestCount",
        (SELECT COUNT(*) FROM topik_app.mock_tests WHERE is_published)::int AS "publishedMockTests",
        (SELECT COUNT(*) FROM topik_app.item_audio_bindings WHERE is_current)::int AS "audioReady",
        ((SELECT COUNT(*) FROM topik_bank.item_versions WHERE section='listening')
          - (SELECT COUNT(*) FROM topik_app.item_audio_bindings WHERE is_current))::int AS "audioMissing",
        (SELECT COUNT(*) FROM topik_app.item_visual_assets WHERE is_current)::int AS "visualReady",
        (SELECT COUNT(*) FROM topik_app.tts_generation_jobs WHERE status='queued')::int AS "jobsQueued",
        (SELECT COUNT(*) FROM topik_app.tts_generation_jobs WHERE status='processing')::int AS "jobsProcessing",
        (SELECT COUNT(*) FROM (
          SELECT DISTINCT ON (item_id,item_version) status
            FROM topik_app.tts_generation_jobs ORDER BY item_id,item_version,created_at DESC
        ) latest WHERE status='failed')::int AS "jobsFailed",
        (SELECT COUNT(*) FROM topik_app.sessions WHERE started_at::date=CURRENT_DATE)::int AS "sessionsToday",
        (SELECT COUNT(*) FROM topik_app.response_observations)::int AS "responseCount",
        (SELECT COUNT(*) FROM topik_app.response_observations WHERE selected_option IS NOT NULL)::int AS "answeredResponseCount",
        (SELECT COUNT(*) FROM topik_app.response_observations WHERE selected_option IS NULL)::int AS "unansweredResponseCount"`,
    );
    return result.rows[0];
  }

  async listListeningItems(setId?: string, status?: "ready" | "missing" | "failed") {
    const values: unknown[] = [];
    const filters = ["iv.section = 'listening'"];
    if (setId) { values.push(setId); filters.push(`qsi.set_id = $${values.length}`); }
    const result = await pool.query(
      `WITH item_rows AS (
         SELECT qsi.set_id, qsi.set_version, qsi.position,
                iv.item_id, iv.item_version, iv.item_type,
                iv.content_json->'dialogue_turns' AS dialogue_turns,
                COALESCE(iv.content_json->>'question_prompt','') AS question_prompt,
                COALESCE((iv.content_json->>'repeat_count')::int,1) AS repeat_count,
                COALESCE(jsonb_array_length(iv.content_json->'visual_options'),0) AS visual_option_count,
                (SELECT COUNT(*) FROM topik_app.item_visual_assets iva
                  WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version AND iva.is_current)::int AS visual_ready_count,
                iab.audio_asset_id, taa.storage_url, taa.tts_style
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
           LEFT JOIN topik_app.item_audio_bindings iab
             ON iab.item_id=iv.item_id AND iab.item_version=iv.item_version AND iab.is_current
           LEFT JOIN topik_app.tts_audio_assets taa ON taa.audio_asset_id=iab.audio_asset_id
          WHERE ${filters.join(" AND ")}
       ), grouped AS (
         SELECT set_id, set_version, dialogue_turns,
                array_agg(position ORDER BY position) AS positions,
                array_agg(item_id ORDER BY position) AS item_ids,
                array_agg(item_version ORDER BY position) AS item_versions,
                array_agg(item_type ORDER BY position) AS item_types,
                array_agg(question_prompt ORDER BY position) AS question_prompts,
                MAX(repeat_count)::int AS repeat_count,
                jsonb_agg(jsonb_build_object(
                  'itemId',item_id,'itemVersion',item_version,'position',position,
                  'itemType',item_type,'questionPrompt',question_prompt,
                  'visualOptionCount',visual_option_count,'visualReadyCount',visual_ready_count
                ) ORDER BY position) AS targets,
                COUNT(*)::int AS target_count,
                COUNT(audio_asset_id)::int AS bound_count,
                COUNT(DISTINCT audio_asset_id)::int AS distinct_audio_count,
                (array_agg(audio_asset_id ORDER BY position) FILTER (WHERE audio_asset_id IS NOT NULL))[1] AS audio_asset_id,
                (array_agg(storage_url ORDER BY position) FILTER (WHERE storage_url IS NOT NULL))[1] AS storage_url,
                (array_agg(tts_style ORDER BY position) FILTER (WHERE tts_style IS NOT NULL))[1] AS tts_style
           FROM item_rows
          GROUP BY set_id,set_version,dialogue_turns
       )
       SELECT g.set_id AS "setId", g.set_version AS "setVersion", g.positions,
              g.item_ids[1] AS "leaderItemId", g.item_versions[1] AS "leaderItemVersion",
              g.item_types[1] AS "itemType", g.dialogue_turns AS "dialogueTurns",
              g.question_prompts AS "questionPrompts", g.repeat_count AS "repeatCount",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.audio_asset_id END AS "audioAssetId",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.storage_url END AS "audioStorageUrl",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN g.tts_style END AS "ttsStyle",
              CASE WHEN g.bound_count=g.target_count AND g.distinct_audio_count=1 THEN 'ready'
                   WHEN g.bound_count=0 THEN 'missing' ELSE 'partial' END AS "audioStatus",
              g.targets,
              CASE WHEN recent.status='failed' THEN recent.error_message END AS "lastError"
         FROM grouped g
         LEFT JOIN LATERAL (
           SELECT j.status,j.error_message
             FROM topik_app.tts_generation_jobs j
            WHERE EXISTS (
              SELECT 1 FROM topik_app.tts_generation_job_targets tgt
               WHERE tgt.job_id=j.job_id AND tgt.item_id=ANY(g.item_ids)
            )
            ORDER BY j.created_at DESC LIMIT 1
         ) recent ON TRUE
        WHERE ($${values.length + 1}::text IS NULL)
           OR ($${values.length + 1}='ready' AND g.bound_count=g.target_count AND g.distinct_audio_count=1)
           OR ($${values.length + 1}='missing' AND g.bound_count<g.target_count)
           OR ($${values.length + 1}='failed' AND recent.status='failed')
        ORDER BY g.set_id,g.positions[1]`,
      [...values, status ?? null],
    );
    return result.rows;
  }

  async listJobs(limit = 100) {
    const result = await pool.query(
      `SELECT job_id AS "jobId", item_id AS "itemId", item_version AS "itemVersion",
              status, attempts, error_message AS "errorMessage", audio_asset_id AS "audioAssetId",
              created_at AS "createdAt", completed_at AS "completedAt"
         FROM topik_app.tts_generation_jobs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async listListeningMockTests() {
    const result = await pool.query(
      `SELECT mt.mock_test_id AS "mockTestId", mt.title_ko AS "titleKo", mt.is_published AS "published",
              mts.set_id AS "setId", mts.set_version AS "setVersion",
              COUNT(qsi.item_id)::int AS "itemCount",
              COUNT(iab.audio_asset_id)::int AS "audioReady",
              COALESCE(SUM(jsonb_array_length(iv.content_json->'visual_options')),0)::int AS "visualRequired",
              COALESCE(SUM((SELECT COUNT(*) FROM topik_app.item_visual_assets iva
                WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version AND iva.is_current)),0)::int AS "visualReady"
         FROM topik_app.mock_tests mt
         JOIN topik_app.mock_test_sections mts ON mts.mock_test_id=mt.mock_test_id AND mts.section='listening'
         JOIN topik_bank.question_set_items qsi ON qsi.set_id=mts.set_id AND qsi.set_version=mts.set_version
         JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
         LEFT JOIN topik_app.item_audio_bindings iab
           ON iab.item_id=iv.item_id AND iab.item_version=iv.item_version AND iab.is_current
        GROUP BY mt.mock_test_id,mt.title_ko,mt.is_published,mts.set_id,mts.set_version,mt.display_order
        ORDER BY mt.display_order`,
    );
    return result.rows;
  }

  async listReadingItems(setId?: string, search?: string) {
    const values: unknown[] = [];
    const filters = ["iv.section = 'reading'"];
    if (setId) { values.push(setId); filters.push(`qsi.set_id = $${values.length}`); }
    if (search) {
      values.push(`%${search}%`);
      filters.push(`(iv.stem ILIKE $${values.length} OR iv.item_type ILIKE $${values.length})`);
    }
    const result = await pool.query(
      `SELECT qsi.set_id AS "setId", qsi.set_version AS "setVersion", qsi.position,
              mt.title_ko AS "mockTestTitle", iv.item_id AS "itemId",
              iv.item_version AS "itemVersion", iv.item_type AS "itemType",
              iv.target_level AS "targetLevel", iv.predicted_difficulty AS "predictedDifficulty",
              iv.review_status AS "reviewStatus", iv.stem, iv.choices,
              iv.correct_answer AS "correctAnswer", iv.explanation,
              iv.content_json AS "contentJson"
         FROM topik_bank.question_set_items qsi
         JOIN topik_bank.item_versions iv
           ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
         LEFT JOIN topik_app.mock_test_sections mts
           ON mts.set_id=qsi.set_id AND mts.set_version=qsi.set_version AND mts.section='reading'
         LEFT JOIN topik_app.mock_tests mt ON mt.mock_test_id=mts.mock_test_id
        WHERE ${filters.join(" AND ")}
        ORDER BY qsi.set_id, qsi.position`,
      values,
    );
    return result.rows;
  }

  async listResponseSessions(input: {
    section?: "reading" | "listening";
    correctness?: "correct" | "incorrect" | "unanswered";
    page: number;
    pageSize: number;
  }) {
    const values: unknown[] = [];
    const filters: string[] = [];
    if (input.section) {
      values.push(input.section);
      filters.push(`EXISTS (SELECT 1 FROM topik_app.session_items sx WHERE sx.session_id=s.session_id AND sx.section=$${values.length})`);
    }
    if (input.correctness === "correct") filters.push("EXISTS (SELECT 1 FROM topik_app.response_observations rx WHERE rx.session_id=s.session_id AND rx.is_correct=TRUE)");
    if (input.correctness === "incorrect") filters.push("EXISTS (SELECT 1 FROM topik_app.response_observations rx WHERE rx.session_id=s.session_id AND rx.is_correct=FALSE AND rx.selected_option IS NOT NULL)");
    if (input.correctness === "unanswered") filters.push("EXISTS (SELECT 1 FROM topik_app.response_observations rx WHERE rx.session_id=s.session_id AND rx.selected_option IS NULL)");
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const limitParam = values.length - 1;
    const offsetParam = values.length;
    const result = await pool.query(
      `SELECT COUNT(*) OVER()::int AS "totalCount", s.session_id AS "sessionId",
              s.user_id AS "userId", mt.title_ko AS "mockTestTitle", s.mode, s.status,
              s.started_at AS "startedAt", s.submitted_at AS "submittedAt", s.score,
              s.max_score AS "maxScore", af.rating,
              MIN(si.section) AS section,
              COUNT(ro.observation_id)::int AS "responseCount",
              COUNT(ro.observation_id) FILTER (WHERE ro.selected_option IS NOT NULL)::int AS "answeredCount",
              COUNT(ro.observation_id) FILTER (WHERE ro.selected_option IS NULL)::int AS "unansweredCount",
              COUNT(ro.observation_id) FILTER (WHERE ro.is_correct)::int AS "correctCount",
              COUNT(ro.observation_id) FILTER (WHERE NOT ro.is_correct AND ro.selected_option IS NOT NULL)::int AS "incorrectCount"
         FROM topik_app.sessions s
         JOIN topik_app.mock_tests mt ON mt.mock_test_id=s.mock_test_id
         LEFT JOIN topik_app.attempt_feedback af ON af.session_id=s.session_id
         JOIN topik_app.response_observations ro ON ro.session_id=s.session_id
         JOIN topik_app.session_items si ON si.session_id=ro.session_id AND si.item_order=ro.item_order
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        GROUP BY s.session_id,mt.title_ko,af.rating
        ORDER BY s.submitted_at DESC NULLS LAST
        LIMIT $${limitParam} OFFSET $${offsetParam}`,
      values,
    );
    return { sessions: result.rows, total: result.rows[0]?.totalCount ?? 0 };
  }

  async getResponseSession(sessionId: string) {
    const result = await pool.query(
      `SELECT ro.observation_id AS "observationId", ro.user_id AS "userId",
              ro.session_id AS "sessionId", ro.item_id AS "itemId",
              ro.item_version AS "itemVersion", ro.item_order AS "itemOrder",
              si.section, si.test_position AS "testPosition", mt.title_ko AS "mockTestTitle",
              iv.item_type AS "itemType", ro.selected_option AS "selectedOption",
              iv.correct_answer AS "correctAnswer", ro.is_correct AS "isCorrect",
              ro.response_time_ms AS "responseTimeMs", ro.skipped, ro.timed_out AS "timedOut",
              ro.answer_changed AS "answerChanged", ro.policy_version AS "policyVersion",
              ro.created_at AS "createdAt", s.mode, s.score, af.rating
         FROM topik_app.response_observations ro
         JOIN topik_app.session_items si ON si.session_id=ro.session_id AND si.item_order=ro.item_order
         JOIN topik_bank.item_versions iv ON iv.item_id=ro.item_id AND iv.item_version=ro.item_version
         JOIN topik_app.sessions s ON s.session_id=ro.session_id
         JOIN topik_app.mock_tests mt ON mt.mock_test_id=s.mock_test_id
         LEFT JOIN topik_app.attempt_feedback af ON af.session_id=s.session_id
        WHERE ro.session_id=$1 ORDER BY ro.item_order`,
      [sessionId],
    );
    if (!result.rowCount) throw notFound("Response session not found");
    return { responses: result.rows };
  }

  async deleteResponseSessions(adminUserId: string, sessionIds: string[] | "all") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = sessionIds === "all"
        ? await client.query<{ session_id: string; user_id: string }>(
            `SELECT s.session_id,s.user_id FROM topik_app.sessions s
              WHERE s.status='submitted' AND EXISTS (
                SELECT 1 FROM topik_app.response_observations ro WHERE ro.session_id=s.session_id
              ) FOR UPDATE`,
          )
        : await client.query<{ session_id: string; user_id: string }>(
            `SELECT s.session_id,s.user_id FROM topik_app.sessions s
              WHERE s.session_id=ANY($1::uuid[]) AND s.status='submitted' AND EXISTS (
                SELECT 1 FROM topik_app.response_observations ro WHERE ro.session_id=s.session_id
              ) FOR UPDATE`,
            [sessionIds],
          );
      if (sessionIds !== "all" && selected.rowCount !== new Set(sessionIds).size) {
        throw new AppError(409, "RESPONSE_SESSION_INVALID", "One or more response sessions cannot be deleted");
      }
      const ids = selected.rows.map((row) => row.session_id);
      const userIds = selected.rows.map((row) => row.user_id);
      const observations = ids.length
        ? await client.query("DELETE FROM topik_app.response_observations WHERE session_id=ANY($1::uuid[]) RETURNING observation_id", [ids])
        : { rowCount: 0 };
      if (ids.length) {
        await client.query("DELETE FROM topik_app.sessions WHERE session_id=ANY($1::uuid[])", [ids]);
        await client.query(
          `DELETE FROM topik_app.users u WHERE u.user_id=ANY($1::uuid[])
            AND NOT EXISTS (SELECT 1 FROM topik_app.sessions s WHERE s.user_id=u.user_id)`,
          [userIds],
        );
      }
      await client.query(
        `INSERT INTO topik_app.response_deletion_audits(
           deletion_audit_id,deleted_by,deletion_scope,deleted_session_count,deleted_observation_count
         ) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), adminUserId, sessionIds === "all" ? "all_response_sessions" : "selected_sessions", ids.length, observations.rowCount ?? 0],
      );
      await client.query("COMMIT");
      return { deletedSessions: ids.length, deletedObservations: observations.rowCount ?? 0 };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async audioPath(audioAssetId: string) {
    const result = await pool.query<{ storage_path: string }>(
      "SELECT storage_path FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1",
      [audioAssetId],
    );
    if (!result.rows[0]) throw notFound("Audio asset not found");
    return result.rows[0].storage_path;
  }

  private async resolveAudioGroup(client: PoolClient, setId: string, setVersion: number, leaderItemId: string) {
    const result = await client.query<{
      item_id: string; item_version: number; position: number;
    }>(
      `WITH leader AS (
         SELECT iv.content_json->'dialogue_turns' AS dialogue_turns
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND qsi.item_id=$3 AND iv.section='listening'
       )
       SELECT qsi.item_id,qsi.item_version,qsi.position
         FROM topik_bank.question_set_items qsi
         JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
         JOIN leader l ON iv.content_json->'dialogue_turns'=l.dialogue_turns
        WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND iv.section='listening'
        ORDER BY qsi.position`,
      [setId, setVersion, leaderItemId],
    );
    if (!result.rowCount) throw notFound("Listening audio group not found");
    return result.rows;
  }

  private async createGroupJob(client: PoolClient, input: {
    adminUserId: string; setId: string; setVersion: number; leaderItemId: string;
    forceRegenerate: boolean; ttsStyle: TtsStyle;
  }) {
    const targets = await this.resolveAudioGroup(client, input.setId, input.setVersion, input.leaderItemId);
    const itemIds = targets.map((target) => target.item_id);
    const itemVersions = targets.map((target) => target.item_version);
    const active = await client.query<{ job_id: string }>(
      `SELECT DISTINCT j.job_id FROM topik_app.tts_generation_jobs j
         JOIN topik_app.tts_generation_job_targets tgt ON tgt.job_id=j.job_id
        WHERE j.status IN ('queued','processing')
          AND (tgt.item_id,tgt.item_version) IN (
            SELECT * FROM unnest($1::uuid[],$2::integer[])
          ) LIMIT 1`,
      [itemIds, itemVersions],
    );
    if (active.rows[0]) return { jobId: active.rows[0].job_id, queued: false, targetCount: targets.length };
    if (!input.forceRegenerate) {
      const ready = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int count FROM topik_app.item_audio_bindings iab
          WHERE iab.is_current AND (iab.item_id,iab.item_version) IN (
            SELECT * FROM unnest($1::uuid[],$2::integer[])
          )`,
        [itemIds, itemVersions],
      );
      if (ready.rows[0]?.count === targets.length) return { jobId: null, queued: false, targetCount: targets.length };
    }
    const leader = targets[0]!;
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO topik_app.tts_generation_jobs(
         job_id,item_id,item_version,requested_by,force_regenerate,tts_style
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [jobId, leader.item_id, leader.item_version, input.adminUserId, input.forceRegenerate, input.ttsStyle],
    );
    await client.query(
      `INSERT INTO topik_app.tts_generation_job_targets(job_id,item_id,item_version)
       SELECT $1,target.item_id,target.item_version
         FROM unnest($2::uuid[],$3::integer[]) AS target(item_id,item_version)`,
      [jobId, itemIds, itemVersions],
    );
    return { jobId, queued: true, targetCount: targets.length };
  }

  async enqueueGroup(adminUserId: string, setId: string, setVersion: number, leaderItemId: string, forceRegenerate: boolean, ttsStyle: TtsStyle) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.createGroupJob(client, { adminUserId, setId, setVersion, leaderItemId, forceRegenerate, ttsStyle });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async enqueueItem(adminUserId: string, itemId: string, itemVersion: number, forceRegenerate: boolean, ttsStyle: TtsStyle) {
    const membership = await pool.query<{ set_id: string; set_version: number }>(
      `SELECT qsi.set_id,qsi.set_version FROM topik_bank.question_set_items qsi
       JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
       WHERE qsi.item_id=$1 AND qsi.item_version=$2 AND iv.section='listening'
       ORDER BY qsi.set_version DESC LIMIT 1`,
      [itemId, itemVersion],
    );
    const row = membership.rows[0];
    if (!row) throw notFound("Listening item not found");
    return this.enqueueGroup(adminUserId, row.set_id, row.set_version, itemId, forceRegenerate, ttsStyle);
  }

  async enqueueSet(adminUserId: string, setId: string, setVersion: number, forceRegenerate: boolean, ttsStyle: TtsStyle) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const leaders = await client.query<{ item_id: string }>(
        `SELECT DISTINCT ON (iv.content_json->'dialogue_turns') qsi.item_id
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND iv.section='listening'
          ORDER BY iv.content_json->'dialogue_turns',qsi.position`,
        [setId, setVersion],
      );
      if (!leaders.rowCount) throw notFound("Listening set not found");
      const jobIds: string[] = [];
      for (const leader of leaders.rows) {
        const result = await this.createGroupJob(client, {
          adminUserId, setId, setVersion, leaderItemId: leader.item_id, forceRegenerate, ttsStyle,
        });
        if (result.queued && result.jobId) jobIds.push(result.jobId);
      }
      await client.query("COMMIT");
      return { queued: jobIds.length, jobIds };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async deleteAudioGroup(
    setId: string,
    setVersion: number,
    leaderItemId: string,
    audioAssetId: string,
    removeObject: (bucket: string, path: string) => Promise<void>,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const targets = await this.resolveAudioGroup(client, setId, setVersion, leaderItemId);
      const itemIds = targets.map((target) => target.item_id);
      const itemVersions = targets.map((target) => target.item_version);
      const asset = await client.query<{ storage_bucket: string; storage_path: string }>(
        `SELECT storage_bucket,storage_path FROM topik_app.tts_audio_assets
          WHERE audio_asset_id=$1 FOR UPDATE`,
        [audioAssetId],
      );
      const row = asset.rows[0];
      const bound = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int count FROM topik_app.item_audio_bindings
          WHERE audio_asset_id=$1 AND is_current AND (item_id,item_version) IN (
            SELECT * FROM unnest($2::uuid[],$3::integer[])
          )`,
        [audioAssetId, itemIds, itemVersions],
      );
      if (!row || bound.rows[0]?.count !== targets.length) throw notFound("Current group audio asset not found");
      await client.query(
        `DELETE FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1 AND is_current
          AND (item_id,item_version) IN (SELECT * FROM unnest($2::uuid[],$3::integer[]))`,
        [audioAssetId, itemIds, itemVersions],
      );
      const shared = await client.query(
        "SELECT 1 FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1 AND is_current LIMIT 1",
        [audioAssetId],
      );
      let storageDeleted = false;
      if (!shared.rowCount) {
        await removeObject(row.storage_bucket, row.storage_path);
        await client.query("UPDATE topik_app.tts_generation_jobs SET audio_asset_id=NULL WHERE audio_asset_id=$1", [audioAssetId]);
        await client.query("DELETE FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1", [audioAssetId]);
        const playbackHistory = await client.query("SELECT 1 FROM topik_app.audio_playback_events WHERE audio_asset_id=$1 LIMIT 1", [audioAssetId]);
        if (playbackHistory.rowCount) {
          await client.query("UPDATE topik_app.tts_audio_assets SET deleted_at=CURRENT_TIMESTAMP,storage_url='' WHERE audio_asset_id=$1", [audioAssetId]);
        } else {
          await client.query("DELETE FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1", [audioAssetId]);
        }
        storageDeleted = true;
      }
      await client.query("COMMIT");
      return { deleted: true, deletedBindings: targets.length, storageDeleted, sharedAssetRetained: !storageDeleted };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async deleteAudioAsset(
    itemId: string,
    itemVersion: number,
    audioAssetId: string,
    removeObject: (bucket: string, path: string) => Promise<void>,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const asset = await client.query<{ storage_bucket: string; storage_path: string }>(
        `SELECT taa.storage_bucket, taa.storage_path
           FROM topik_app.tts_audio_assets taa
           JOIN topik_app.item_audio_bindings iab ON iab.audio_asset_id=taa.audio_asset_id
          WHERE taa.audio_asset_id=$1 AND iab.item_id=$2 AND iab.item_version=$3 AND iab.is_current
          FOR UPDATE OF taa`,
        [audioAssetId, itemId, itemVersion],
      );
      const row = asset.rows[0];
      if (!row) throw notFound("Current audio asset not found");
      await client.query(
        `DELETE FROM topik_app.item_audio_bindings
          WHERE audio_asset_id=$1 AND item_id=$2 AND item_version=$3 AND is_current`,
        [audioAssetId, itemId, itemVersion],
      );
      const shared = await client.query(
        "SELECT 1 FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1 AND is_current LIMIT 1",
        [audioAssetId],
      );
      let storageDeleted = false;
      if (!shared.rowCount) {
        await removeObject(row.storage_bucket, row.storage_path);
        await client.query("UPDATE topik_app.tts_generation_jobs SET audio_asset_id=NULL WHERE audio_asset_id=$1", [audioAssetId]);
        await client.query("DELETE FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1", [audioAssetId]);
        const playbackHistory = await client.query(
          "SELECT 1 FROM topik_app.audio_playback_events WHERE audio_asset_id=$1 LIMIT 1",
          [audioAssetId],
        );
        if (playbackHistory.rowCount) {
          await client.query(
            "UPDATE topik_app.tts_audio_assets SET deleted_at=CURRENT_TIMESTAMP, storage_url='' WHERE audio_asset_id=$1",
            [audioAssetId],
          );
        } else {
          await client.query("DELETE FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1", [audioAssetId]);
        }
        storageDeleted = true;
      }
      await client.query("COMMIT");
      return { deleted: true, storageDeleted, sharedAssetRetained: !storageDeleted };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async bindVisualAsset(input: {
    adminUserId: string; itemId: string; itemVersion: number; optionNumber: number;
    bucket: string; path: string; url: string; mimeType: string; byteSize: number;
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE topik_app.item_visual_assets SET is_current=FALSE
          WHERE item_id=$1 AND item_version=$2 AND option_number=$3 AND is_current`,
        [input.itemId, input.itemVersion, input.optionNumber],
      );
      const assetId = randomUUID();
      await client.query(
        `INSERT INTO topik_app.item_visual_assets(
          visual_asset_id,item_id,item_version,option_number,storage_bucket,storage_path,
          storage_url,mime_type,byte_size,created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [assetId,input.itemId,input.itemVersion,input.optionNumber,input.bucket,input.path,
          input.url,input.mimeType,input.byteSize,input.adminUserId],
      );
      await client.query("COMMIT");
      return { visualAssetId: assetId, url: input.url };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async publishMockTest(mockTestId: string, publish: boolean) {
    if (publish) {
      const readiness = await pool.query<{ expected: number; audio_ready: number; visual_expected: number; visual_ready: number }>(
        `SELECT COUNT(*)::int expected,
                COUNT(iab.audio_asset_id)::int audio_ready,
                COALESCE(SUM(jsonb_array_length(iv.content_json->'visual_options')),0)::int visual_expected,
                COALESCE(SUM((SELECT COUNT(*) FROM topik_app.item_visual_assets iva
                  WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version AND iva.is_current)),0)::int visual_ready
           FROM topik_app.mock_test_sections mts
           JOIN topik_bank.question_set_items qsi ON qsi.set_id=mts.set_id AND qsi.set_version=mts.set_version
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
           LEFT JOIN topik_app.item_audio_bindings iab
             ON iab.item_id=iv.item_id AND iab.item_version=iv.item_version AND iab.is_current
          WHERE mts.mock_test_id=$1 AND mts.section='listening'`,
        [mockTestId],
      );
      const row = readiness.rows[0];
      if (!row || row.expected !== 50 || row.audio_ready !== 50 || row.visual_ready < row.visual_expected) {
        throw new AppError(409, "LISTENING_ASSETS_INCOMPLETE", "All 50 audio and visual assets are required before publishing");
      }
    }
    const updated = await pool.query(
      `UPDATE topik_app.mock_tests SET is_published=$2, updated_at=CURRENT_TIMESTAMP
        WHERE mock_test_id=$1 AND slug LIKE 'topik-ii-listening-%'`,
      [mockTestId, publish],
    );
    if (!updated.rowCount) throw notFound("Listening mock test not found");
    return { published: publish };
  }
}
