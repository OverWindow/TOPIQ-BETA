import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { bearerToken } from "./domain.js";
import { AppError } from "./errors.js";
import { TopikRepository } from "./repository.js";
import { AdminRepository } from "./admin-repository.js";
import { adminLogin, requireAdmin } from "./admin-auth.js";
import { SupabaseStorage } from "./storage.js";
import { ttsWorker } from "./tts-worker.js";

const sessionParams = z.object({ sessionId: z.string().uuid() });
const itemParams = sessionParams.extend({ itemOrder: z.coerce.number().int().min(1).max(100) });
const audioParams = sessionParams.extend({ audioAssetId: z.string().uuid() });
const listeningItemParams = z.object({ itemId: z.string().uuid(), itemVersion: z.coerce.number().int().positive() });
const listeningSetParams = z.object({ setId: z.string().uuid(), setVersion: z.coerce.number().int().positive() });
const listeningGroupParams = listeningSetParams.extend({ leaderItemId: z.string().uuid() });
const visualParams = listeningItemParams.extend({ optionNumber: z.coerce.number().int().min(1).max(4) });
const mockTestParams = z.object({ mockTestId: z.string().uuid() });
const adminAudioParams = z.object({ audioAssetId: z.string().uuid() });
const ttsStyleSchema = z.object({
  speakingRate: z.number().finite().min(0.75).max(1.25).default(1),
  stylePrompt: z.string().trim().max(300).default(""),
});

function requireToken(authorization: string | undefined) {
  const token = bearerToken(authorization);
  if (!token) throw new AppError(401, "SESSION_TOKEN_REQUIRED", "Session token required");
  return token;
}

function isClientHttpError(
  error: unknown,
): error is Error & { statusCode: number; code?: string } {
  if (!(error instanceof Error) || !("statusCode" in error)) return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}

export async function buildApp(repository = new TopikRepository(), adminRepository = new AdminRepository()) {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    trustProxy: config.trustProxy,
    bodyLimit: 6 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.appOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, {
    max: 240,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024 } });

  app.get("/health", async () => ({ ok: true, service: "unigate-topik-api" }));

  app.get("/v1/exams", async () => ({ exams: await repository.listExams() }));

  app.post("/v1/sessions", async (request, reply) => {
    const body = z
      .object({ mockTestId: z.string().uuid(), mode: z.enum(["timed", "practice"]) })
      .parse(request.body);
    const created = await repository.createSession(body.mockTestId, body.mode);
    return reply.code(201).send(created);
  });

  app.get("/v1/sessions/:sessionId", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.getSession(sessionId, requireToken(request.headers.authorization));
  });

  app.post("/v1/sessions/:sessionId/items/:itemOrder/events", async (request) => {
    const { sessionId, itemOrder } = itemParams.parse(request.params);
    const body = z
      .object({
        clientEventId: z.string().uuid(),
        eventType: z.enum(["presented", "hidden", "heartbeat"]),
        durationMs: z.number().finite().min(0),
      })
      .parse(request.body);
    return repository.recordEvent({
      sessionId,
      itemOrder,
      token: requireToken(request.headers.authorization),
      ...body,
    });
  });

  app.put("/v1/sessions/:sessionId/items/:itemOrder/answer", async (request) => {
    const { sessionId, itemOrder } = itemParams.parse(request.params);
    const body = z
      .object({
        clientEventId: z.string().uuid(),
        selectedOption: z.number().int().min(1).max(4),
        durationMs: z.number().finite().min(0),
      })
      .parse(request.body);
    return repository.saveAnswer({
      sessionId,
      itemOrder,
      token: requireToken(request.headers.authorization),
      ...body,
    });
  });

  app.post("/v1/sessions/:sessionId/audio/:audioAssetId/playback", async (request) => {
    const { sessionId, audioAssetId } = audioParams.parse(request.params);
    const body = z.object({
      clientPlayId: z.string().uuid(),
      eventType: z.enum(["started", "completed", "interrupted"]),
    }).parse(request.body);
    return repository.recordAudioPlayback({
      sessionId, audioAssetId, token: requireToken(request.headers.authorization), ...body,
    });
  });

  app.post("/v1/sessions/:sessionId/submit", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.submitSession(sessionId, requireToken(request.headers.authorization));
  });

  app.post("/v1/sessions/:sessionId/feedback", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        locale: z.enum(["id", "ko"]),
        email: z.string().trim().email().max(320).optional(),
        marketingConsent: z.boolean().default(false),
      })
      .parse(request.body);
    return repository.saveFeedback({
      sessionId,
      token: requireToken(request.headers.authorization),
      ...body,
    });
  });

  app.get("/v1/sessions/:sessionId/results", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.getResults(sessionId, requireToken(request.headers.authorization));
  });

  app.get("/v1/admin/me", async (request) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    return { admin: { id: admin.adminUserId, email: admin.email } };
  });

  app.post("/v1/admin/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (request) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(12).max(200) }).parse(request.body);
    return adminLogin(body.email, body.password);
  });

  app.get("/v1/admin/dashboard", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    return { summary: await adminRepository.dashboard() };
  });

  app.get("/v1/admin/listening/items", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({
      setId: z.string().uuid().optional(),
      status: z.enum(["ready", "missing", "failed"]).optional(),
    }).parse(request.query);
    return { items: await adminRepository.listListeningItems(query.setId, query.status) };
  });

  app.get("/v1/admin/reading/items", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({
      setId: z.string().uuid().optional(),
      search: z.string().trim().max(100).optional(),
    }).parse(request.query);
    return { items: await adminRepository.listReadingItems(query.setId, query.search) };
  });

  app.get("/v1/admin/responses/sessions", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({
      section: z.enum(["reading", "listening"]).optional(),
      correctness: z.enum(["correct", "incorrect", "unanswered"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(50),
    }).parse(request.query);
    return adminRepository.listResponseSessions(query);
  });

  app.get("/v1/admin/responses/sessions/:sessionId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { sessionId } = sessionParams.parse(request.params);
    return adminRepository.getResponseSession(sessionId);
  });

  app.delete("/v1/admin/responses/sessions", async (request) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const body = z.object({ sessionIds: z.array(z.string().uuid()).min(1).max(100) }).parse(request.body);
    return adminRepository.deleteResponseSessions(admin.adminUserId, [...new Set(body.sessionIds)]);
  });

  app.delete("/v1/admin/responses/sessions/all", async (request) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const body = z.object({ confirmation: z.literal("전체 응답 삭제") }).parse(request.body);
    return adminRepository.deleteResponseSessions(admin.adminUserId, "all");
  });

  app.get("/v1/admin/tts/jobs", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    return { jobs: await adminRepository.listJobs(query.limit) };
  });

  app.get("/v1/admin/listening/mock-tests", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    return { mockTests: await adminRepository.listListeningMockTests() };
  });

  app.get("/v1/admin/listening/audio/:audioAssetId/url", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { audioAssetId } = adminAudioParams.parse(request.params);
    const path = await adminRepository.audioPath(audioAssetId);
    return { audioUrl: await new SupabaseStorage().signedAudioUrl(path, 600) };
  });

  app.delete("/v1/admin/listening/items/:itemId/versions/:itemVersion/audio/:audioAssetId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { itemId, itemVersion } = listeningItemParams.parse(request.params);
    const { audioAssetId } = adminAudioParams.parse(request.params);
    const storage = new SupabaseStorage();
    return adminRepository.deleteAudioAsset(
      itemId,
      itemVersion,
      audioAssetId,
      (bucket, path) => storage.removeObject(bucket, path),
    );
  });

  app.post("/v1/admin/listening/items/:itemId/versions/:itemVersion/tts", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { itemId, itemVersion } = listeningItemParams.parse(request.params);
    const body = z.object({ forceRegenerate: z.boolean().default(false), ttsStyle: ttsStyleSchema.default({ speakingRate: 1, stylePrompt: "" }) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueItem(admin.adminUserId, itemId, itemVersion, body.forceRegenerate, body.ttsStyle);
    ttsWorker.kick();
    return reply.code(202).send(result);
  });

  app.post("/v1/admin/listening/sets/:setId/versions/:setVersion/tts", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion } = listeningSetParams.parse(request.params);
    const body = z.object({ forceRegenerate: z.boolean().default(false), ttsStyle: ttsStyleSchema.default({ speakingRate: 1, stylePrompt: "" }) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueSet(admin.adminUserId, setId, setVersion, body.forceRegenerate, body.ttsStyle);
    ttsWorker.kick();
    return reply.code(202).send(result);
  });

  app.post("/v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/tts", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion, leaderItemId } = listeningGroupParams.parse(request.params);
    const body = z.object({ forceRegenerate: z.boolean().default(false), ttsStyle: ttsStyleSchema.default({ speakingRate: 1, stylePrompt: "" }) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueGroup(admin.adminUserId, setId, setVersion, leaderItemId, body.forceRegenerate, body.ttsStyle);
    ttsWorker.kick();
    return reply.code(202).send(result);
  });

  app.delete("/v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/audio/:audioAssetId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion, leaderItemId } = listeningGroupParams.parse(request.params);
    const { audioAssetId } = adminAudioParams.parse(request.params);
    const storage = new SupabaseStorage();
    return adminRepository.deleteAudioGroup(
      setId, setVersion, leaderItemId, audioAssetId,
      (bucket, path) => storage.removeObject(bucket, path),
    );
  });

  app.post("/v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { itemId, itemVersion, optionNumber } = visualParams.parse(request.params);
    const file = await request.file();
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      throw new AppError(400, "IMAGE_REQUIRED", "A PNG, JPEG or WebP image is required");
    }
    const data = await file.toBuffer();
    const extension = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const path = `listening/${itemId}/v${itemVersion}/option-${optionNumber}-${randomUUID()}.${extension}`;
    const uploaded = await new SupabaseStorage().uploadMedia(path, data, file.mimetype);
    const result = await adminRepository.bindVisualAsset({
      adminUserId: admin.adminUserId, itemId, itemVersion, optionNumber,
      bucket: uploaded.bucket, path: uploaded.path, url: uploaded.url,
      mimeType: file.mimetype, byteSize: data.length,
    });
    return reply.code(201).send(result);
  });

  app.put("/v1/admin/listening/mock-tests/:mockTestId/publish", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { mockTestId } = mockTestParams.parse(request.params);
    const body = z.object({ published: z.boolean() }).parse(request.body);
    return adminRepository.publishMockTest(mockTestId, body.published);
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", issues: error.issues },
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    if (isClientHttpError(error)) {
      return reply.code(error.statusCode).send({
        error: { code: error.code ?? "BAD_REQUEST", message: error.message },
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  });

  return app;
}
