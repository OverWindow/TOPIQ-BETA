import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { bearerToken } from "./domain.js";
import { AppError } from "./errors.js";
import { TopikRepository } from "./repository.js";

const sessionParams = z.object({ sessionId: z.string().uuid() });
const itemParams = sessionParams.extend({ itemOrder: z.coerce.number().int().min(1).max(100) });

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

export async function buildApp(repository = new TopikRepository()) {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.appOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "OPTIONS"],
  });
  await app.register(rateLimit, {
    max: 240,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });

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
