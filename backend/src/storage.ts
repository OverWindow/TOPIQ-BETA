import { config } from "./config.js";

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

/**
 * Produces a public Supabase Storage URL without exposing the service-role key.
 * The v1 reading sets are text-only; this adapter is ready for later audio and
 * image-backed questions while keeping storage configuration server-side.
 */
export function getPublicAssetUrl(objectPath: string) {
  if (!config.supabase.url) return null;

  const baseUrl = config.supabase.url.replace(/\/+$/, "");
  const bucket = encodeURIComponent(trimSlashes(config.supabase.bucket));
  const path = trimSlashes(objectPath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
