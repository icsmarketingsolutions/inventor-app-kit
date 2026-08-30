import { describe, expect, it, vi } from "vitest";
import { releaseRecorder } from "./VoiceTranscriber";

describe("ciclo privado del micrófono", () => {
  it("detiene todas las pistas aunque desconectar nodos falle", async () => {
    const stopFirst = vi.fn();
    const stopSecond = vi.fn();
    const close = vi.fn(async () => undefined);
    const resources = {
      context: { state: "running", close },
      processor: {
        onaudioprocess: () => undefined,
        disconnect: () => { throw new Error("ya desconectado"); },
      },
      source: { disconnect: () => { throw new Error("ya desconectado"); } },
      stream: { getTracks: () => [{ stop: stopFirst }, { stop: stopSecond }] },
    } as unknown as Parameters<typeof releaseRecorder>[0];

    await releaseRecorder(resources);

    expect(stopFirst).toHaveBeenCalledOnce();
    expect(stopSecond).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
