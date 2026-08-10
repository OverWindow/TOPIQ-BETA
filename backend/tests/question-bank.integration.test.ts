import "dotenv/config";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const databaseTests = databaseUrl ? describe : describe.skip;
const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

afterAll(async () => {
  await pool?.end();
});

databaseTests("published reading question bank", () => {
  it("contains two complete, renderable 50-item mock sets", async () => {
    const result = await pool!.query<{
      set_id: string;
      item_count: number;
      four_choice_count: number;
      structured_count: number;
    }>(`
      SELECT qsi.set_id::text,
             COUNT(*)::int AS item_count,
             COUNT(*) FILTER (WHERE jsonb_array_length(iv.choices) = 4)::int AS four_choice_count,
             COUNT(*) FILTER (
               WHERE iv.item_type IN ('grammar_blank', 'similar_expression')
                  OR (
                    NULLIF(iv.content_json->>'passage', '') IS NOT NULL
                    AND NULLIF(iv.content_json->>'question_prompt', '') IS NOT NULL
                  )
             )::int AS structured_count
        FROM topik_bank.question_set_items qsi
        JOIN topik_bank.item_versions iv
          ON iv.item_id = qsi.item_id AND iv.item_version = qsi.item_version
       WHERE qsi.set_version = 1
         AND qsi.set_id IN (
           '64c027ea-fa18-5cd3-8039-79ecde41916a',
           'fc0a5fa7-391e-586f-ab7c-1b7b8193358a'
         )
       GROUP BY qsi.set_id
       ORDER BY qsi.set_id
    `);

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.item_count).toBe(50);
      expect(row.four_choice_count).toBe(50);
      expect(row.structured_count).toBe(50);
    }
  });
});
