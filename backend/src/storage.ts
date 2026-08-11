import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { AppError } from "./errors.js";

function configuredClient(): SupabaseClient {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new AppError(503, "STORAGE_NOT_CONFIGURED", "Supabase Storage is not configured");
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function objectUrl(bucket: string, objectPath: string, access: "public" | "authenticated") {
  if (!config.supabase.url) return null;
  const path = trimSlashes(objectPath).split("/").map(encodeURIComponent).join("/");
  return `${config.supabase.url.replace(/\/+$/, "")}/storage/v1/object/${access}/${encodeURIComponent(bucket)}/${path}`;
}

export function getPublicAssetUrl(objectPath: string, bucket = config.supabase.mediaBucket) {
  return objectUrl(bucket, objectPath, "public");
}

export class SupabaseStorage {
  private readonly client = configuredClient();

  async ensureBuckets() {
    const buckets = await this.client.storage.listBuckets();
    if (buckets.error) throw new AppError(502, "STORAGE_BUCKET_LIST_FAILED", buckets.error.message);
    const names = new Set(buckets.data.map((bucket) => bucket.name));
    if (!names.has(config.supabase.audioBucket)) {
      const created = await this.client.storage.createBucket(config.supabase.audioBucket, { public: false, fileSizeLimit: 20 * 1024 * 1024 });
      if (created.error) throw new AppError(502, "STORAGE_BUCKET_CREATE_FAILED", created.error.message);
    }
    if (!names.has(config.supabase.mediaBucket)) {
      const created = await this.client.storage.createBucket(config.supabase.mediaBucket, { public: true, fileSizeLimit: 5 * 1024 * 1024 });
      if (created.error) throw new AppError(502, "STORAGE_BUCKET_CREATE_FAILED", created.error.message);
    }
  }

  async uploadAudio(path: string, data: Buffer) {
    const bucket = config.supabase.audioBucket;
    const result = await this.client.storage.from(bucket).upload(path, data, {
      contentType: "audio/mpeg",
      cacheControl: "31536000",
      upsert: true,
    });
    if (result.error) throw new AppError(502, "STORAGE_UPLOAD_FAILED", result.error.message);
    return { bucket, path, url: objectUrl(bucket, path, "authenticated")! };
  }

  async uploadMedia(path: string, data: Buffer, contentType: string) {
    const bucket = config.supabase.mediaBucket;
    const result = await this.client.storage.from(bucket).upload(path, data, {
      contentType,
      cacheControl: "31536000",
      upsert: true,
    });
    if (result.error) throw new AppError(502, "STORAGE_UPLOAD_FAILED", result.error.message);
    return { bucket, path, url: objectUrl(bucket, path, "public")! };
  }

  async signedAudioUrl(path: string, expiresInSeconds = 300) {
    const result = await this.client.storage
      .from(config.supabase.audioBucket)
      .createSignedUrl(path, expiresInSeconds);
    if (result.error) throw new AppError(502, "STORAGE_SIGN_FAILED", result.error.message);
    return result.data.signedUrl;
  }

  async removeObject(bucket: string, path: string) {
    const result = await this.client.storage.from(bucket).remove([path]);
    if (result.error) throw new AppError(502, "STORAGE_DELETE_FAILED", result.error.message);
  }
}
