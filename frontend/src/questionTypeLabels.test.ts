import { describe, expect, it } from "vitest";
import { questionTypeLabel } from "./questionTypeLabels";

describe("question type labels", () => {
  it("localizes known reading and listening types", () => {
    expect(questionTypeLabel("grammar_blank", "reading", "ko")).toBe("문법 빈칸");
    expect(questionTypeLabel("visual_chart", "listening", "id")).toBe("Pilihan grafik");
  });

  it("distinguishes shared passages from shared listening audio", () => {
    expect(questionTypeLabel("paired_21_22", "reading", "ko")).toBe("공통 지문");
    expect(questionTypeLabel("paired_21_22", "listening", "ko")).toBe("공통 듣기");
  });
});
