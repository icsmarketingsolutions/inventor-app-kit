import type {
  AgentActivity,
  Directive,
  FoundryCatalog,
  GraphResponse,
  NoteDetail,
  NoteSummary,
  OllamaStatus,
  Project,
  StatusResponse,
  TranscriptionStatus,
  NativeFolderSelection,
} from "../types";

interface ApiErrorBody {
  error?: { code?: string; message?: string } | string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No se pudo completar la operación.";
}

export function capabilityUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 501);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as T & ApiErrorBody)
    : null;
  if (!response.ok) {
    const apiError = body?.error;
    const message =
      typeof apiError === "string"
        ? apiError
        : apiError?.message || `La API respondió ${response.status}.`;
    const code = typeof apiError === "object" ? apiError?.code : undefined;
    throw new ApiError(message, response.status, code);
  }
  if (body === null) throw new ApiError("La API no devolvió JSON.", response.status);
  return body;
}

const post = <T>(path: string, payload: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(payload) });

export const api = {
  status: () => request<StatusResponse>("/api/status"),
  projects: async () => (await request<{ projects: Project[] }>("/api/projects")).projects,
  addProject: async (name: string, path: string) =>
    (await post<{ project: Project }>("/api/projects", { name, path })).project,
  selectProjectFolder: (path?: string, signal?: AbortSignal) =>
    request<NativeFolderSelection>("/api/system/select-folder", {
      method: "POST",
      body: JSON.stringify({ path }),
      signal,
    }),
  notes: async () =>
    (await request<{ notes: NoteSummary[] }>("/api/memory/notes")).notes,
  searchNotes: async (query: string) =>
    (
      await request<{ results: NoteSummary[] }>(
        `/api/memory/search?q=${encodeURIComponent(query)}`,
      )
    ).results.map((result) => ({
      ...result,
      folder: result.folder || result.path.split("/")[0] || "root",
      modifiedAt: result.modifiedAt || "",
      size: result.size || 0,
    })),
  note: async (path: string) =>
    (
      await request<{ note: NoteDetail }>(
        `/api/memory/note?path=${encodeURIComponent(path)}`,
      )
    ).note,
  saveNote: async (path: string, content: string) =>
    (await post<{ note: NoteDetail }>("/api/memory/note", { path, content })).note,
  capture: async (text: string) =>
    (await post<{ note: NoteDetail }>("/api/memory/capture", { text })).note,
  graph: () => request<GraphResponse>("/api/graph"),
  mutateDirective: async (payload: {
    action: "add" | "edit" | "toggle" | "delete";
    id?: string;
    index?: number;
    text?: string;
    done?: boolean;
  }) => (await post<{ directives: Directive[] }>("/api/directives", payload)).directives,

  // Capacidades opcionales. Un 404/501 se presenta como "no disponible";
  // nunca se reemplaza con respuestas o actividad inventadas.
  ollamaStatus: async () => {
    const value = await request<{
      available?: boolean;
      models?: Array<{ name: string }>;
      error?: { message?: string };
      state?: OllamaStatus["state"];
      model?: string;
      message?: string;
    }>("/api/ollama/status");
    const model = value.model || value.models?.[0]?.name;
    return {
      state: value.state || (value.available ? "ready" : "off"),
      model,
      message: value.message || value.error?.message,
    } satisfies OllamaStatus;
  },
  ollamaChat: async (model: string, message: string) => {
    const value = await post<{ content?: string; response?: string; model?: string }>(
      "/api/ollama/chat",
      { model, message },
    );
    return { response: value.content || value.response || "", model: value.model || model };
  },
  foundryCatalog: async () => {
    const value = await request<{
      modes: Array<{ id?: string; title?: string; value?: string; label?: string }>;
      tools?: string[];
      agents?: Array<{ value: string; label: string }>;
    }>("/api/foundry/catalog");
    return {
      modes: value.modes.map((mode) => ({
        value: mode.id || mode.value || "",
        label: mode.title || mode.label || mode.id || mode.value || "modo",
      })),
      agents: value.agents || (value.tools || []).map((tool) => ({
        value: tool,
        label: tool === "codex" ? "◆ CODEX" : tool === "claude" ? "⚡ CLAUDE CODE" : tool.toUpperCase(),
      })),
    } satisfies FoundryCatalog;
  },
  forgePrompt: async (payload: {
    projectIds: string[];
    mode: string;
    objective: string;
    tool: string;
  }) => await post<{ prompt: string }>("/api/foundry/forge", payload),
  refineObjective: async (payload: {
    objective: string;
    model: string;
  }) => await post<{ objective: string }>("/api/foundry/refine", payload),
  launchAgent: async (payload: {
    projectIds: string[];
    tool: string;
    prompt: string;
    confirm: true;
  }) => await post<{ ok: true }>("/api/agents/launch", payload),
  activity: async () =>
    (await request<{ activity: AgentActivity[] }>("/api/agents/activity")).activity,
  transcriptionStatus: () => request<TranscriptionStatus>("/api/transcription/status"),
  transcribeAudio: (audio: Uint8Array, signal?: AbortSignal) => request<{
    transcript: string;
    durationSeconds: number;
    language: string;
    model: string;
  }>("/api/transcription", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: Uint8Array.from(audio).buffer,
    signal,
  }),
};
