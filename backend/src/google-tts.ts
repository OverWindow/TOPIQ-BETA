import { GoogleAuth } from "google-auth-library";
import { config } from "./config.js";
import { AppError } from "./errors.js";

export type DialogueTurn = { speaker: "남자" | "여자"; text: string };
export type TtsStyle = { speakingRate: number; stylePrompt: string };

export const defaultTtsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" };

export function buildGoogleTtsRequest(turns: DialogueTurn[], style: TtsStyle = defaultTtsStyle) {
  const speakers = new Set(turns.map((turn) => turn.speaker));
  const pace = style.speakingRate < 0.95
    ? "Speak a little slower than normal while keeping natural Korean rhythm."
    : style.speakingRate > 1.05
      ? "Speak a little faster than normal while keeping every word clear."
      : "Speak at a natural pace.";
  const styleInstruction = style.stylePrompt.trim() ? ` ${style.stylePrompt.trim()}` : "";
  const prompt = `TOPIK Korean listening test. Speak clearly, naturally, and neutrally. ${pace}${styleInstruction}`;
  const input = speakers.size === 1
    ? { prompt, text: turns.map((turn) => turn.text).join("\n") }
    : {
        prompt,
        multiSpeakerMarkup: {
          turns: turns.map((turn) => ({
            speaker: turn.speaker === "여자" ? "FemaleSpeaker" : "MaleSpeaker",
            text: turn.text,
          })),
        },
      };
  const voice = speakers.size === 1
    ? {
        languageCode: "ko-KR",
        modelName: config.googleTts.model,
        name: speakers.has("여자") ? config.googleTts.femaleVoice : config.googleTts.maleVoice,
      }
    : {
        languageCode: "ko-KR",
        modelName: config.googleTts.model,
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            { speakerAlias: "FemaleSpeaker", speakerId: config.googleTts.femaleVoice },
            { speakerAlias: "MaleSpeaker", speakerId: config.googleTts.maleVoice },
          ],
        },
      };
  return { input, voice, audioConfig: { audioEncoding: "MP3", speakingRate: style.speakingRate } };
}

function credentials() {
  if (!config.googleTts.credentialsJson) return undefined;
  try {
    return JSON.parse(config.googleTts.credentialsJson) as Record<string, unknown>;
  } catch {
    throw new AppError(503, "TTS_CREDENTIALS_INVALID", "Google Cloud credentials JSON is invalid");
  }
}

export class GoogleTtsClient {
  async synthesize(turns: DialogueTurn[], style: TtsStyle = defaultTtsStyle) {
    if (!config.googleTts.projectId) {
      throw new AppError(503, "TTS_NOT_CONFIGURED", "Google Cloud TTS is not configured");
    }
    const auth = new GoogleAuth({
      projectId: config.googleTts.projectId,
      credentials: credentials(),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const headers = await client.getRequestHeaders();
    const synthesisRequest = buildGoogleTtsRequest(turns, style);
    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: { ...Object.fromEntries(headers.entries()), "x-goog-user-project": config.googleTts.projectId, "Content-Type": "application/json" },
      body: JSON.stringify(synthesisRequest),
    });
    const body = await response.json() as { audioContent?: string; error?: { message?: string } };
    if (!response.ok || !body.audioContent) {
      throw new AppError(502, "TTS_PROVIDER_FAILED", body.error?.message ?? "Google Cloud TTS failed");
    }
    return Buffer.from(body.audioContent, "base64");
  }
}
