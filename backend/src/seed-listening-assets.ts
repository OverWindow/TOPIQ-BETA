import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "./config.js";
import { pool } from "./db.js";
import { AdminRepository } from "./admin-repository.js";
import { SupabaseStorage } from "./storage.js";

const pattern = /^([0-9a-f-]{36})-v(\d+)-option-([1-4])\.png$/i;

async function seed() {
  if (!config.adminBootstrap.email) throw new Error("ADMIN_EMAIL is required to attribute seeded assets");
  const admin = await pool.query<{ admin_user_id: string }>(
    "SELECT admin_user_id FROM topik_app.admin_users WHERE email_normalized=$1 AND is_active=TRUE",
    [config.adminBootstrap.email.trim().toLowerCase()],
  );
  const adminUserId = admin.rows[0]?.admin_user_id;
  if (!adminUserId) throw new Error("Run admin:bootstrap before assets:seed");
  const directory = resolve(process.cwd(), "seed-assets/listening");
  const files = (await readdir(directory)).filter((file) => pattern.test(file)).sort();
  const storage = new SupabaseStorage();
  await storage.ensureBuckets();
  const repository = new AdminRepository();
  let uploadedCount = 0;
  for (const file of files) {
    const match = pattern.exec(file)!;
    const itemId = match[1]!; const itemVersion = Number(match[2]); const optionNumber = Number(match[3]);
    const path = `listening/${itemId}/v${itemVersion}/option-${optionNumber}.png`;
    const existing = await pool.query(
      `SELECT 1 FROM topik_app.item_visual_assets
        WHERE item_id=$1 AND item_version=$2 AND option_number=$3 AND storage_path=$4 AND is_current`,
      [itemId, itemVersion, optionNumber, path],
    );
    if (existing.rowCount) continue;
    const data = await readFile(resolve(directory, file));
    const uploaded = await storage.uploadMedia(path, data, "image/png");
    await repository.bindVisualAsset({
      adminUserId, itemId, itemVersion, optionNumber, bucket: uploaded.bucket,
      path: uploaded.path, url: uploaded.url, mimeType: "image/png", byteSize: data.length,
    });
    uploadedCount += 1;
  }
  process.stdout.write(`Listening visual assets ready: ${files.length} (${uploadedCount} uploaded)\n`);
}

seed().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => pool.end());
