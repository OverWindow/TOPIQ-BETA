import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { TopikRepository } from "../src/repository.js";

const repositories: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map((app) => app.close()));
});

describe("public API", () => {
  it("exposes a health endpoint", async () => {
    const repository = { listExams: vi.fn() } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "unigate-topik-api" });
  });

  it("returns the published exam catalog", async () => {
    const listExams = vi.fn().mockResolvedValue([{ id: "exam-1", slug: "topik-ii-reading-1" }]);
    const repository = { listExams } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/exams" });
    expect(response.statusCode).toBe(200);
    expect(response.json().exams).toHaveLength(1);
    expect(listExams).toHaveBeenCalledOnce();
  });

  it("accepts a bodyless session submission", async () => {
    const submitSession = vi.fn().mockResolvedValue({
      status: "submitted",
      resultsLocked: true,
    });
    const repository = { submitSession } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/submit",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "submitted", resultsLocked: true });
    expect(submitSession).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "session-token",
    );
  });

  it("preserves Fastify client errors instead of returning 500", async () => {
    const repository = { submitSession: vi.fn() } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/submit",
      headers: {
        authorization: "Bearer session-token",
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("FST_ERR_CTP_EMPTY_JSON_BODY");
  });
});
