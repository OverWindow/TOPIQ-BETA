import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Question } from "../types";
import { QuestionCard } from "./QuestionCard";

const baseQuestion: Question = {
  itemOrder: 1,
  section: "reading",
  testPosition: 1,
  itemId: "item-id",
  itemVersion: 1,
  itemType: "grammar_blank",
  stem: "노래를 ( ) 좋아합니다.",
  passage: "",
  auxiliaryText: "",
  questionPrompt: "",
  highlightText: "",
  choices: ["부르고", "불러서", "부르면", "부르지만"],
  selectedOption: null,
};

const makeQuestion = (input: Partial<Question>): Question => ({ ...baseQuestion, ...input });

describe("QuestionCard", () => {
  it("uses the grammar fallback instruction and records a choice", async () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={baseQuestion} onAnswer={onAnswer} />);
    expect(screen.getByText("( )에 들어갈 말로 가장 알맞은 것을 고르십시오.")).toBeInTheDocument();
    expect(screen.getByTestId("blank-marker")).toBeInTheDocument();
    await userEvent.click(screen.getByText("불러서"));
    expect(onAnswer).toHaveBeenCalledWith(2);
  });

  it("does not render a flattened stem when structured fields exist", () => {
    render(<QuestionCard question={makeQuestion({
      itemType: "content_match",
      stem: "분리된 지문 분리된 질문",
      passage: "분리된 지문",
      questionPrompt: "분리된 질문",
    })} />);
    expect(screen.getByText("분리된 지문")).toBeInTheDocument();
    expect(screen.getByText("분리된 질문")).toBeInTheDocument();
    expect(screen.queryByText("분리된 지문 분리된 질문")).not.toBeInTheDocument();
  });

  it("renders a matching highlight inline and an unmatched highlight as a fallback", () => {
    const { rerender } = render(<QuestionCard question={makeQuestion({
      itemType: "similar_expression",
      stem: "식당을 찾고자 지도를 꺼냈다.",
      highlightText: "찾고자",
    })} />);
    expect(screen.getByTestId("inline-highlight")).toHaveTextContent("찾고자");
    expect(screen.queryByTestId("highlight-fallback")).not.toBeInTheDocument();

    rerender(<QuestionCard question={makeQuestion({
      itemType: "paired_23_24",
      passage: "회사에서 중요한 발표를 준비했다.",
      questionPrompt: "심정으로 알맞은 것을 고르십시오.",
      highlightText: "어떻게 할지 몰라 허둥댔다",
    })} />);
    expect(screen.getByTestId("highlight-fallback")).toHaveTextContent("어떻게 할지 몰라 허둥댔다");
  });

  it("renders sequence rows, an insertion sentence, a headline, and a paired label", () => {
    const { rerender } = render(<QuestionCard question={makeQuestion({
      itemType: "sentence_order",
      passage: "(가) 첫 번째 문장\n(나) 두 번째 문장\n(다) 세 번째 문장\n(라) 네 번째 문장",
      questionPrompt: "순서에 맞게 배열하십시오.",
    })} />);
    expect(screen.getByTestId("sequence-body").children).toHaveLength(4);

    rerender(<QuestionCard question={makeQuestion({
      itemType: "sentence_insertion",
      auxiliaryText: "새로 들어갈 문장입니다.",
      passage: "본문입니다. (①) 다음 문장입니다.",
      questionPrompt: "주어진 문장이 들어갈 곳을 고르십시오.",
    })} />);
    expect(screen.getByText("주어진 문장")).toBeInTheDocument();
    expect(screen.getByText("새로 들어갈 문장입니다.")).toBeInTheDocument();

    rerender(<QuestionCard question={makeQuestion({
      itemType: "headline_interpretation",
      passage: "친환경 농산물 주문 폭주, 온라인 마켓 서버 다운",
      questionPrompt: "신문 제목을 가장 잘 설명한 것을 고르십시오.",
    })} />);
    expect(screen.getByTestId("headline-body")).toBeInTheDocument();

    rerender(<QuestionCard question={makeQuestion({
      itemType: "paired_48_50",
      passage: "공통으로 사용하는 긴 지문입니다.",
      questionPrompt: "윗글의 내용과 같은 것을 고르십시오.",
    })} />);
    expect(screen.getByText("48~50번 공통 지문")).toBeInTheDocument();
    expect(screen.getByTestId("question-layout")).toHaveAttribute("data-two-column", "true");
  });

  it("maps all 18 reading item types to a renderable layout with four choices", () => {
    const cases: Array<[string, string]> = [
      ["grammar_blank", "inline"],
      ["similar_expression", "inline"],
      ["short_text_topic", "material"],
      ["content_match_short", "material"],
      ["sentence_order", "sequence"],
      ["paragraph_blank_short", "blank"],
      ["paired_19_20", "paired"],
      ["paired_21_22", "paired"],
      ["paired_23_24", "paired"],
      ["headline_interpretation", "headline"],
      ["paragraph_blank", "blank"],
      ["content_match", "passage"],
      ["main_topic", "passage"],
      ["sentence_insertion", "insertion"],
      ["paired_42_43", "paired"],
      ["paired_44_45", "paired"],
      ["paired_46_47", "paired"],
      ["paired_48_50", "paired"],
    ];

    for (const [itemType, layout] of cases) {
      const { unmount } = render(<QuestionCard question={makeQuestion({
        itemType,
        passage: itemType === "grammar_blank" || itemType === "similar_expression" ? "" : "구조화된 문제 지문",
        auxiliaryText: itemType === "sentence_insertion" ? "주어진 문장" : "",
        questionPrompt: itemType === "grammar_blank" || itemType === "similar_expression" ? "" : "문제의 묻는 부분",
      })} />);
      expect(screen.getByTestId("question-layout")).toHaveAttribute("data-question-layout", layout);
      expect(screen.getAllByRole("radio")).toHaveLength(4);
      unmount();
    }
  });

  it("marks the correct option in result mode", () => {
    render(<QuestionCard question={{ ...baseQuestion, selectedOption: 1 }} disabled showResult={{ correctAnswer: 2 }} />);
    expect(screen.getByText("불러서").closest("button")).toHaveClass("border-emerald-400");
  });
});
