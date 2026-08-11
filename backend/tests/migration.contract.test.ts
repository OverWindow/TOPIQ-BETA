import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("topik_app migration contract", () => {
  it("defines the required analytics tables, fields, and fixed mock sets", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/001_topik_app.sql"), "utf8");

    for (const table of [
      "users",
      "sessions",
      "session_items",
      "answer_states",
      "response_events",
      "response_observations",
      "theta_estimation_runs",
      "attempt_feedback",
      "email_subscriptions",
    ]) {
      expect(sql).toContain(`topik_app.${table}`);
    }

    for (const field of [
      "user_id",
      "session_id",
      "item_id",
      "item_version",
      "item_order",
      "selected_option",
      "is_correct",
      "response_time_ms",
      "skipped",
      "timed_out",
      "answer_changed",
      "theta_before",
      "theta_after",
      "policy_version",
      "created_at",
    ]) {
      expect(sql).toContain(field);
    }

    expect(sql).toContain("64c027ea-fa18-5cd3-8039-79ecde41916a");
    expect(sql).toContain("fc0a5fa7-391e-586f-ab7c-1b7b8193358a");
    expect(sql).toContain("UNIQUE (session_id, set_id, set_version, test_position)");
    expect(sql).toContain("CHECK (NOT (skipped AND timed_out))");
  });

  it("defines admin, listening TTS, media, playback, and fixed listening sets", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/002_admin_listening.sql"), "utf8");
    for (const table of ["admin_users", "tts_generation_jobs", "tts_audio_assets", "item_audio_bindings", "item_visual_assets", "audio_playback_events"]) {
      expect(sql).toContain(`topik_app.${table}`);
    }
    expect(sql).toContain("3ffc10a1-db41-5718-b479-60224edec836");
    expect(sql).toContain("c5e3af83-93d5-5bef-a2e7-5186ee358f9c");
    expect(sql).toContain("topik-ii-listening-1");
    expect(sql).toContain("topik-ii-listening-2");
  });

  it("stores TTS style snapshots and adds response management indexes", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/003_admin_management.sql"), "utf8");
    expect(sql).toContain("tts_style JSONB");
    expect(sql).toContain("speakingRate");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("response_observations_created_idx");
  });

  it("defines grouped TTS targets and auditable session response deletion", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/004_admin_response_audio_groups.sql"), "utf8");
    expect(sql).toContain("topik_app.tts_generation_job_targets");
    expect(sql).toContain("topik_app.response_deletion_audits");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("INSERT INTO topik_app.tts_generation_job_targets");
  });
});
