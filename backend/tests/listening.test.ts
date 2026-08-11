import { describe, expect, it } from "vitest";
import { sanitizeQuestion } from "../src/domain.js";
import { buildGoogleTtsRequest } from "../src/google-tts.js";

const row = {
  item_order: 1, section: "listening", test_position: 1,
  item_id: "10000000-0000-4000-8000-000000000001", item_version: 1,
  item_type: "visual_scene", stem: "남자: 노출되면 안 되는 대본", choices: [],
  content_json: {
    question_prompt: "다음을 듣고 고르십시오.", repeat_count: 2,
    dialogue_turns: [{ speaker: "남자", text: "안녕하세요." }, { speaker: "여자", text: "반갑습니다." }],
  },
  audio_asset_id: "20000000-0000-4000-8000-000000000001",
  visual_assets: [{ number: 1, imageUrl: "https://example.com/one.png" }], selected_option: null,
};

describe("listening question safety", () => {
  it("never exposes the stem or transcript during an attempt", () => {
    const question = sanitizeQuestion(row);
    expect(question.stem).toBe("");
    expect(question.transcript).toBeUndefined();
    expect(question.audioAssetId).toBe(row.audio_asset_id);
    expect(question.repeatCount).toBe(2);
    expect(question.visualOptions).toHaveLength(1);
  });

  it("includes the transcript only for unlocked results", () => {
    expect(sanitizeQuestion(row, { includeTranscript: true }).transcript).toEqual(row.content_json.dialogue_turns);
  });
});

describe("Google Gemini TTS request", () => {
  it("maps Korean male and female turns to distinct speaker voices", () => {
    const request = buildGoogleTtsRequest(row.content_json.dialogue_turns as Array<{ speaker: "남자" | "여자"; text: string }>);
    expect(request.input).toMatchObject({ multiSpeakerMarkup: { turns: [
      { speaker: "MaleSpeaker", text: "안녕하세요." },
      { speaker: "FemaleSpeaker", text: "반갑습니다." },
    ] } });
    expect(request.voice).toMatchObject({ multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
      { speakerAlias: "FemaleSpeaker", speakerId: "Aoede" },
      { speakerAlias: "MaleSpeaker", speakerId: "Charon" },
    ] } });
  });

  it("applies a configurable speaking rate and style prompt", () => {
    const request = buildGoogleTtsRequest(
      row.content_json.dialogue_turns as Array<{ speaker: "남자" | "여자"; text: string }>,
      { speakingRate: 0.9, stylePrompt: "차분한 시험 방송처럼 읽어 주세요." },
    );
    expect(request.audioConfig).toMatchObject({ audioEncoding: "MP3", speakingRate: 0.9 });
    expect(request.input.prompt).toContain("차분한 시험 방송처럼 읽어 주세요.");
    expect(request.input.prompt).toContain("slower");
  });
});
