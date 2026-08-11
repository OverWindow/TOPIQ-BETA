import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const environmentName = process.env.NODE_ENV ?? "development";

// Load the environment-specific file regardless of whether the process was
// started from the workspace root or from backend/. Existing process variables
// always win, which keeps Render/Vercel secrets authoritative in production.
loadEnv({ path: resolve(backendRoot, `.env.${environmentName}`), quiet: true });
loadEnv({ path: resolve(backendRoot, ".env"), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["disable", "require"]).default("disable"),
  APP_ORIGINS: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_AUDIO_BUCKET: z.string().default("topik-listening-audio"),
  SUPABASE_MEDIA_BUCKET: z.string().default("topik-question-media"),
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_CLOUD_CREDENTIALS_JSON: z.string().optional(),
  GOOGLE_TTS_MODEL: z.string().default("gemini-2.5-flash-tts"),
  GOOGLE_TTS_FEMALE_VOICE: z.string().default("Aoede"),
  GOOGLE_TTS_MALE_VOICE: z.string().default("Charon"),
  TTS_WORKER_ENABLED: z.enum(["true", "false"]).default("true"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
});

const parsed = envSchema.parse({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.NODE_ENV === "test" ? "postgresql://localhost:5432/topik_test" : undefined),
});

export const config = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  databaseUrl: parsed.DATABASE_URL,
  databaseSsl: parsed.DATABASE_SSL === "require",
  appOrigins: parsed.APP_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  trustProxy: parsed.TRUST_PROXY === "true",
  supabase: {
    url: parsed.SUPABASE_URL,
    serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    audioBucket: parsed.SUPABASE_AUDIO_BUCKET,
    mediaBucket: parsed.SUPABASE_MEDIA_BUCKET,
  },
  googleTts: {
    projectId: parsed.GOOGLE_CLOUD_PROJECT_ID,
    credentialsJson: parsed.GOOGLE_CLOUD_CREDENTIALS_JSON,
    model: parsed.GOOGLE_TTS_MODEL,
    femaleVoice: parsed.GOOGLE_TTS_FEMALE_VOICE,
    maleVoice: parsed.GOOGLE_TTS_MALE_VOICE,
    workerEnabled: parsed.TTS_WORKER_ENABLED === "true",
  },
  adminBootstrap: { email: parsed.ADMIN_EMAIL, password: parsed.ADMIN_PASSWORD },
} as const;
