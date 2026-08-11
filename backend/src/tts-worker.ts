import { createHash, randomUUID } from "node:crypto";
import { pool } from "./db.js";
import { config } from "./config.js";
import { GoogleTtsClient, type DialogueTurn, type TtsStyle } from "./google-tts.js";
import { SupabaseStorage } from "./storage.js";

type Job = {
  job_id: string; item_id: string; item_version: number; requested_by: string;
  force_regenerate: boolean; attempts: number; tts_style: TtsStyle;
};

export class TtsWorker {
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly tts = new GoogleTtsClient(),
    private readonly storageFactory = () => new SupabaseStorage(),
  ) {}

  start() {
    if (!config.googleTts.workerEnabled || this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), 3_000);
    this.timer.unref();
    void this.runOnce();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  kick() { void this.runOnce(); }

  private async claim(): Promise<Job | null> {
    const result = await pool.query<Job>(
      `WITH candidate AS (
         SELECT job_id FROM topik_app.tts_generation_jobs
          WHERE (status='queued' OR (status='processing' AND lease_expires_at<CURRENT_TIMESTAMP))
            AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE topik_app.tts_generation_jobs j
          SET status='processing', attempts=attempts+1, started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
              lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes', error_message=NULL
         FROM candidate c WHERE j.job_id=c.job_id RETURNING j.*`,
    );
    return result.rows[0] ?? null;
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      let job: Job | null;
      while ((job = await this.claim())) await this.process(job);
    } finally { this.running = false; }
  }

  private async process(job: Job) {
    try {
      const item = await pool.query<{ content_json: Record<string, unknown> }>(
        "SELECT content_json FROM topik_bank.item_versions WHERE item_id=$1 AND item_version=$2 AND section='listening'",
        [job.item_id, job.item_version],
      );
      const turns = (item.rows[0]?.content_json.dialogue_turns ?? []) as DialogueTurn[];
      if (!turns.length || turns.some((turn) => !["남자", "여자"].includes(turn.speaker) || !turn.text)) {
        throw new Error("Listening dialogue_turns are missing or invalid");
      }
      const style = job.tts_style;
      const sourceHash = createHash("sha256").update(JSON.stringify({
        turns, promptVersion: "TOPIK_NEUTRAL_V1", model: config.googleTts.model,
        female: config.googleTts.femaleVoice, male: config.googleTts.maleVoice, style,
      })).digest("hex");
      let asset = !job.force_regenerate ? await pool.query<{ audio_asset_id: string }>(
        `SELECT audio_asset_id FROM topik_app.tts_audio_assets
          WHERE source_hash=$1 AND model_name=$2 AND female_voice=$3 AND male_voice=$4
            AND deleted_at IS NULL LIMIT 1`,
        [sourceHash, config.googleTts.model, config.googleTts.femaleVoice, config.googleTts.maleVoice],
      ) : { rows: [] as { audio_asset_id: string }[] };

      let audioAssetId = asset.rows[0]?.audio_asset_id;
      if (!audioAssetId) {
        const audio = await this.tts.synthesize(turns, style);
        const path = `listening/${sourceHash.slice(0, 2)}/${sourceHash}.mp3`;
        const uploaded = await this.storageFactory().uploadAudio(path, audio);
        audioAssetId = randomUUID();
        await pool.query(
          `INSERT INTO topik_app.tts_audio_assets(
             audio_asset_id,source_hash,model_name,female_voice,male_voice,storage_bucket,
             storage_path,storage_url,byte_size,created_by,tts_style
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (source_hash,model_name,female_voice,male_voice) DO UPDATE SET
             storage_bucket=EXCLUDED.storage_bucket,storage_path=EXCLUDED.storage_path,
             storage_url=EXCLUDED.storage_url,byte_size=EXCLUDED.byte_size,
             tts_style=EXCLUDED.tts_style,deleted_at=NULL
           RETURNING audio_asset_id`,
          [audioAssetId,sourceHash,config.googleTts.model,config.googleTts.femaleVoice,
            config.googleTts.maleVoice,uploaded.bucket,uploaded.path,uploaded.url,audio.length,job.requested_by,style],
        ).then((result) => { audioAssetId = result.rows[0].audio_asset_id; });
      }

      const targetResult = await pool.query<{ item_id: string; item_version: number }>(
        `SELECT item_id,item_version FROM topik_app.tts_generation_job_targets WHERE job_id=$1
         UNION ALL
         SELECT $2::uuid,$3::integer WHERE NOT EXISTS (
           SELECT 1 FROM topik_app.tts_generation_job_targets WHERE job_id=$1
         )`,
        [job.job_id, job.item_id, job.item_version],
      );
      const targetIds = targetResult.rows.map((target) => target.item_id);
      const targetVersions = targetResult.rows.map((target) => target.item_version);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE topik_app.item_audio_bindings SET is_current=FALSE WHERE is_current
            AND (item_id,item_version) IN (SELECT * FROM unnest($1::uuid[],$2::integer[]))`,
          [targetIds, targetVersions],
        );
        await client.query(
          `INSERT INTO topik_app.item_audio_bindings(item_id,item_version,audio_asset_id,source_hash)
           SELECT target.item_id,target.item_version,$3,$4
             FROM unnest($1::uuid[],$2::integer[]) AS target(item_id,item_version)
           ON CONFLICT (item_id,item_version,audio_asset_id)
           DO UPDATE SET source_hash=EXCLUDED.source_hash,is_current=TRUE`,
          [targetIds, targetVersions, audioAssetId, sourceHash],
        );
        await client.query(
          `UPDATE topik_app.tts_generation_jobs SET status='succeeded',audio_asset_id=$2,
             completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL WHERE job_id=$1`,
          [job.job_id, audioAssetId],
        );
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await pool.query(
        `UPDATE topik_app.tts_generation_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,
           error_message=$2,completed_at=CASE WHEN attempts>=3 THEN CURRENT_TIMESTAMP ELSE NULL END,
           lease_expires_at=NULL WHERE job_id=$1`,
        [job.job_id, message],
      );
    }
  }
}

export const ttsWorker = new TtsWorker();
