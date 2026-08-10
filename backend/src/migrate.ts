import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "./db.js";

async function migrate() {
  const migrationDir = resolve(process.cwd(), "migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('unigate_topik_app_migrations'))");
    await client.query("CREATE SCHEMA IF NOT EXISTS topik_app");
    await client.query(`
      CREATE TABLE IF NOT EXISTS topik_app.schema_migrations (
        version TEXT PRIMARY KEY,
        checksum CHAR(64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const file of files) {
      const sql = await readFile(resolve(migrationDir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string | null }>(
        "SELECT checksum FROM topik_app.schema_migrations WHERE version = $1",
        [file],
      );
      if (existing.rowCount) {
        const recorded = existing.rows[0]?.checksum;
        if (recorded && recorded !== checksum) {
          throw new Error(`Applied migration ${file} has changed`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO topik_app.schema_migrations(version, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        process.stdout.write(`Applied ${file}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('unigate_topik_app_migrations'))");
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
