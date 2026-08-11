import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ListeningAudioPlayer } from "./ListeningAudioPlayer";

vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
  api: { audioPlayback: vi.fn() },
}));

const playbackMock = vi.mocked(api.audioPlayback);

describe("ListeningAudioPlayer", () => {
  beforeEach(() => {
    playbackMock.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  it("stops and reports the previous playback when the audio group changes", async () => {
    playbackMock.mockResolvedValue({ submitted: false, playNumber: 1, audioUrl: "https://example.com/old.mp3" });
    const { rerender } = render(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-old"
        repeatCount={2}
        mode="practice"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "듣기 시작" }));
    await waitFor(() => expect(playbackMock).toHaveBeenCalledWith(
      "session-id", "session-token", "asset-old", expect.any(String), "started",
    ));

    rerender(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-new"
        repeatCount={2}
        mode="practice"
      />,
    );

    await waitFor(() => expect(playbackMock).toHaveBeenCalledWith(
      "session-id", "session-token", "asset-old", expect.any(String), "interrupted",
    ));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  });

  it("ignores an old audio URL that resolves after navigation", async () => {
    let resolveOld!: (value: { submitted: false; playNumber: number; audioUrl: string }) => void;
    playbackMock.mockImplementation((_sessionId, _token, _assetId, _playId, eventType) => {
      if (eventType === "interrupted") return Promise.resolve({ submitted: false });
      return new Promise((resolve) => { resolveOld = resolve; });
    });
    const { container, rerender } = render(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-old"
        repeatCount={2}
        mode="practice"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "듣기 시작" }));
    rerender(
      <ListeningAudioPlayer
        sessionId="session-id"
        token="session-token"
        audioAssetId="asset-new"
        repeatCount={2}
        mode="practice"
      />,
    );
    resolveOld({ submitted: false, playNumber: 1, audioUrl: "https://example.com/stale.mp3" });

    await waitFor(() => {
      expect(container.querySelector("audio")).not.toHaveAttribute("src", "https://example.com/stale.mp3");
    });
  });
});
