import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { pool } from "./db.js";

async function bootstrap() {
  const { url, serviceRoleKey } = config.supabase;
  const { email, password } = config.adminBootstrap;
  if (!url || !serviceRoleKey || !email || !password) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const normalized = email.trim().toLowerCase();
  const existing = await pool.query<{ auth_user_id: string }>(
    "SELECT auth_user_id FROM topik_app.admin_users WHERE email_normalized = $1",
    [normalized],
  );
  let authUserId = existing.rows[0]?.auth_user_id;
  if (!authUserId) {
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw new Error(listed.error.message);
    authUserId = listed.data.users.find((user) => user.email?.toLowerCase() === normalized)?.id;
    if (!authUserId) {
      const created = await supabase.auth.admin.createUser({
        email: normalized,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) throw new Error(created.error?.message ?? "Unable to create admin user");
      authUserId = created.data.user.id;
    }
  }
  await pool.query(
    `INSERT INTO topik_app.admin_users(admin_user_id, auth_user_id, email_normalized)
     VALUES ($1,$2,$3)
     ON CONFLICT (email_normalized) DO UPDATE SET
       auth_user_id = EXCLUDED.auth_user_id, is_active = TRUE, updated_at = CURRENT_TIMESTAMP`,
    [randomUUID(), authUserId, normalized],
  );
  process.stdout.write(`Administrator ready: ${normalized}\n`);
}

bootstrap()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => pool.end());
