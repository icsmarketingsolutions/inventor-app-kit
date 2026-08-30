import { describe, expect, it } from "vitest";
import { encodePcmWav, resampleMono, VOICE_SAMPLE_RATE } from "./audio";

describe("audio local", () => {
  it("remuestrea mono sin cambiar una señal constante", () => {
    const input = new Float32Array(48_000).fill(0.25);
    const output = resampleMono(input, 48_000);
    expect(output).toHaveLength(VOICE_SAMPLE_RATE);
    expect(output[8_000]).toBeCloseTo(0.25, 5);
  });

  it("codifica WAV PCM mono de 16 kHz y 16 bits", () => {
    const wav = encodePcmWav([new Float32Array(8_000).fill(0.5), new Float32Array(8_000).fill(-0.5)], 16_000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(32_000);
  });

  it("rechaza frecuencias menores al destino", () => {
    expect(() => resampleMono(new Float32Array(10), 8_000)).toThrow(RangeError);
  });
});
