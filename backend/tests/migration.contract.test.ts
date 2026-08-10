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
});
