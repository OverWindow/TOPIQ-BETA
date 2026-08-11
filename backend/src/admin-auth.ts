import { createClient } from "@supabase/supabase-js";
import { pool } from "./db.js";
import { config } from "./config.js";
import { AppError } from "./errors.js";

export type AdminIdentity = { adminUserId: string; authUserId: string; email: string };

function supabaseAdminClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new AppError(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured");
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function adminLogin(email: string, password: string) {
  const result = await supabaseAdminClient().auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) {
    throw new AppError(401, "ADMIN_LOGIN_FAILED", "Invalid administrator credentials");
  }
  const admin = await requireAdmin(result.data.session.access_token);
  return { accessToken: result.data.session.access_token, expiresAt: result.data.session.expires_at, admin: { id: admin.adminUserId, email: admin.email } };
}

export async function requireAdmin(token: string): Promise<AdminIdentity> {
  const supabase = supabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) throw new AppError(401, "ADMIN_AUTH_REQUIRED", "Administrator login required");

  const result = await pool.query<{
    admin_user_id: string;
    auth_user_id: string;
    email_normalized: string;
  }>(
    `SELECT admin_user_id, auth_user_id, email_normalized
       FROM topik_app.admin_users
      WHERE auth_user_id = $1 AND is_active = TRUE`,
    [data.user.id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(403, "ADMIN_FORBIDDEN", "This account is not an administrator");
  return { adminUserId: row.admin_user_id, authUserId: row.auth_user_id, email: row.email_normalized };
}
