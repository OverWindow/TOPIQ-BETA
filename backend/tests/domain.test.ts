import { describe, expect, it } from "vitest";
import { bearerToken, clampActiveDuration, normalizeEmail, sanitizeQuestion } from "../src/domain.js";

describe("response analytics helpers", () => {
  it("caps active time deltas to one minute", () => {
    expect(clampActiveDuration(-5)).toBe(0);
    expect(clampActiveDuration(10_250.4)).toBe(10_250);
    expect(clampActiveDuration(90_000)).toBe(60_000);
    expect(clampActiveDuration(Number.NaN)).toBe(0);
  });

  it("normalizes subscription emails", () => {
    expect(normalizeEmail("  Student@Example.COM ")).toBe("student@example.com");
  });

  it("extracts bearer tokens safely", () => {
    expect(bearerToken("Bearer secret-token")).toBe("secret-token");
    expect(bearerToken("Basic secret-token")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe("question sanitization", () => {
  it("returns renderable content without correct answers or explanations", () => {
    const result = sanitizeQuestion({
      item_order: 1,
      section: "reading",
      test_position: 1,
      item_id: "item-id",
      item_version: 2,
      item_type: "grammar_blank",
      stem: "fallback",
      choices: ["a", "b", "c", "d"],
      selected_option: null,
      content_json: {
        stem: "문장 ( ) 문장",
        choices: ["가", "나", "다", "라"],
        answer: 3,
        explanation: "secret",
      },
    });
    expect(result.stem).toBe("문장 ( ) 문장");
    expect(result.choices).toEqual(["가", "나", "다", "라"]);
    expect(result).not.toHaveProperty("answer");
    expect(result).not.toHaveProperty("explanation");
  });
});
