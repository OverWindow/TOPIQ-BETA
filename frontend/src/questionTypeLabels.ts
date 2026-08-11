import type { Locale } from "./types";

const labels: Record<string, { ko: string; id: string }> = {
  grammar_blank: { ko: "문법 빈칸", id: "Isian tata bahasa" },
  similar_expression: { ko: "유사 표현", id: "Ungkapan serupa" },
  short_text_topic: { ko: "짧은 글 주제", id: "Topik teks pendek" },
  content_match_short: { ko: "짧은 글 내용 일치", id: "Kesesuaian teks pendek" },
  sentence_order: { ko: "문장 순서", id: "Urutan kalimat" },
  paragraph_blank_short: { ko: "짧은 지문 빈칸", id: "Isian paragraf pendek" },
  paragraph_blank: { ko: "지문 빈칸", id: "Isian paragraf" },
  headline_interpretation: { ko: "신문 제목 해석", id: "Interpretasi judul" },
  content_match: { ko: "내용 일치", id: "Kesesuaian isi" },
  main_topic: { ko: "중심 생각", id: "Gagasan utama" },
  sentence_insertion: { ko: "문장 삽입", id: "Penyisipan kalimat" },
  visual_scene: { ko: "그림 선택", id: "Pilihan gambar" },
  visual_chart: { ko: "그래프 선택", id: "Pilihan grafik" },
  next_response: { ko: "이어질 말", id: "Respons berikutnya" },
  followup_action: { ko: "이어질 행동", id: "Tindakan berikutnya" },
  content_match_once: { ko: "들은 내용 일치", id: "Kesesuaian isi audio" },
  main_idea_once: { ko: "들은 내용 중심 생각", id: "Gagasan utama audio" },
};

export function questionTypeLabel(itemType: string, section: string, locale: Locale) {
  if (itemType.startsWith("paired_")) {
    return locale === "ko"
      ? (section === "listening" ? "공통 듣기" : "공통 지문")
      : (section === "listening" ? "Audio bersama" : "Teks bersama");
  }
  return labels[itemType]?.[locale] ?? itemType.replaceAll("_", " ");
}
