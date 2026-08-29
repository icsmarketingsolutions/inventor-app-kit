import { describe, expect, it } from "vitest";
import { ApiError, capabilityUnavailable, readableError } from "./api";

describe("errores de API", () => {
  it("distingue una capacidad opcional ausente de una falla real", () => {
    expect(capabilityUnavailable(new ApiError("no existe", 404))).toBe(true);
    expect(capabilityUnavailable(new ApiError("pendiente", 501))).toBe(true);
    expect(capabilityUnavailable(new ApiError("falló", 500))).toBe(false);
  });

  it("produce mensajes honestos para errores conocidos y desconocidos", () => {
    expect(readableError(new ApiError("Ollama apagado", 503))).toBe("Ollama apagado");
    expect(readableError(null)).toBe("No se pudo completar la operación.");
  });
});
