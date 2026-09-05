import {
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MemoryGraph } from "./components/MemoryGraph";
import { VoiceTranscriber } from "./components/VoiceTranscriber";
import { api, capabilityUnavailable, readableError } from "./lib/api";
import type {
  AgentActivity,
  CapabilityState,
  Directive,
  FoundryCatalog,
  GraphResponse,
  NoteDetail,
  NoteSummary,
  OllamaStatus,
  Project,
  StatusResponse,
  TranscriptionStatus,
  Mission,
  MissionRole,
} from "./types";

const FALLBACK_CATALOG: FoundryCatalog = {
  modes: [
    { value: "plan", label: "PLAN — explorar y proponer" },
    { value: "build", label: "HACER — implementar y verificar" },
    { value: "review", label: "REVISAR — adversarial" },
    { value: "improve", label: "MEJORAR — sin cambiar comportamiento" },
    { value: "fix", label: "ARREGLAR — hasta que funcione" },
    { value: "document", label: "DOCUMENTAR — docs vivos" },
    { value: "audit", label: "AUDITAR — salud y seguridad" },
  ],
  agents: [
    { value: "codex", label: "◆ CODEX" },
    { value: "claude", label: "⚡ CLAUDE CODE" },
  ],
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  meta?: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function Panel({
  id,
  title,
  meta,
  className = "",
  children,
}: {
  id?: string;
  title: string;
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`panel ${className}`.trim()} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="panel-heading">
        <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
        {meta && <div className="panel-meta">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

function StatusDot({ label, state, detail }: { label: string; state: CapabilityState; detail: string }) {
  return (
    <span className={`status-dot status-dot--${state}`} title={detail}>
      <span className="status-dot__orb" aria-hidden="true" />
      <span>{label}</span>
      <span className="sr-only">: {detail}</span>
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="clock" aria-label={now.toLocaleString("es-CR")}>
      <time className="clock__time" dateTime={now.toISOString()} aria-hidden="true">
        {now.toLocaleTimeString("es-CR", { hour12: false })}
      </time>
      <span className="clock__date" aria-hidden="true">
        {now.toLocaleDateString("es-CR", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()}
      </span>
    </div>
  );
}

function SystemVitals({ projects, loading, error }: { projects: Project[]; loading: boolean; error: string | null }) {
  if (loading) return <p className="panel-state">Inspeccionando repositorios locales…</p>;
  if (error) return <p className="panel-state panel-state--error" role="alert">{error}</p>;
  if (projects.length === 0) return <p className="panel-state">No hay proyectos registrados todavía.</p>;
  return (
    <ul className="project-list">
      {projects.map((project) => (
        <li key={project.id} className="project-card">
          <div className="project-card__title">
            <span>{project.name}</span>
            {!project.available && <span className="badge badge--danger">no disponible</span>}
          </div>
          <div className="project-card__badges">
            <span className="badge">{project.git.repository ? project.git.branch || "sin rama" : "sin git"}</span>
            {project.git.dirtyCount > 0
              ? <span className="badge badge--warning">{project.git.dirtyCount} sin commit</span>
              : project.git.repository && <span className="badge badge--ok">limpio</span>}
            {project.git.ahead !== null && project.git.ahead > 0 && <span className="badge badge--warning">↑{project.git.ahead}</span>}
            {project.git.behind !== null && project.git.behind > 0 && <span className="badge badge--warning">↓{project.git.behind}</span>}
          </div>
          {project.git.lastCommit && (
            <p className="project-card__commit" title={project.git.lastCommit.subject}>
              {project.git.lastCommit.subject} · {formatDate(project.git.lastCommit.authoredAt)}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActivityPanel({ activity, state, error }: { activity: AgentActivity[]; state: CapabilityState; error: string | null }) {
  if (state === "checking") return <p className="panel-state">Leyendo actividad local…</p>;
  if (state === "unavailable") {
    return <p className="panel-state">Agent Ops todavía no está conectado al servidor local.</p>;
  }
  if (error) return <p className="panel-state panel-state--error" role="alert">{error}</p>;
  const commits = activity.filter((item) => item.kind === "commit");
  const sessions = activity.filter((item) => item.kind === "session");
  return (
    <div className="activity-grid">
      <div>
        <h3>ACTIVITY <span>commits recientes</span></h3>
        {commits.length ? (
          <ul className="event-list">
            {commits.slice(0, 8).map((item) => (
              <li key={item.id}>
                <time>{formatDate(item.at)}</time>
                <span className="project-tag">{item.project}</span>
                <p>{item.subject}</p>
              </li>
            ))}
          </ul>
        ) : <p className="panel-state panel-state--compact">Sin commits registrados.</p>}
      </div>
      <div>
        <h3>AGENT OPS <span>sesiones lanzadas</span></h3>
        {sessions.length ? (
          <ul className="event-list">
            {sessions.slice(0, 8).map((item) => (
              <li key={item.id}>
                <time>{formatDate(item.at)}</time>
                <span className="project-tag">{item.project}</span>
                <p>{item.agent} · {item.mode || "sesión"}</p>
                {item.commitsAfter !== undefined && (
                  <span className={`badge ${item.commitsAfter ? "badge--ok" : ""}`}>
                    {item.commitsAfter ? `${item.commitsAfter} commits después` : "sin rastro aún"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="panel-state panel-state--compact">Sin sesiones registradas.</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [visibleNotes, setVisibleNotes] = useState<NoteSummary[]>([]);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [activityState, setActivityState] = useState<CapabilityState>("checking");
  const [ollama, setOllama] = useState<OllamaStatus>({ state: "checking" });
  const [voice, setVoice] = useState<TranscriptionStatus>({ state: "checking", available: false });
  const [catalog, setCatalog] = useState<FoundryCatalog>(FALLBACK_CATALOG);
  const [foundryAvailable, setFoundryAvailable] = useState<boolean | null>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      setGraph(await api.graph());
    } catch (error) {
      setGraphError(readableError(error));
    } finally {
      setGraphLoading(false);
    }
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const requests = [
      api.status().then((value) => { setStatus(value); setCoreError(null); })
        .catch((error: unknown) => setCoreError(readableError(error))),
      api.projects().then((value) => { setProjects(value); setProjectsError(null); })
        .catch((error: unknown) => setProjectsError(readableError(error))),
      api.notes().then((value) => { setNotes(value); setVisibleNotes(value); setNotesError(null); })
        .catch((error: unknown) => setNotesError(readableError(error))),
      api.graph().then((value) => { setGraph(value); setGraphError(null); })
        .catch((error: unknown) => setGraphError(readableError(error)))
        .finally(() => setGraphLoading(false)),
    ];
    await Promise.allSettled(requests);
    setCoreLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 12_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const loadOptionalCapabilities = async () => {
      try {
        setOllama(await api.ollamaStatus());
      } catch (error) {
        setOllama({
          state: capabilityUnavailable(error) ? "unavailable" : "off",
          message: readableError(error),
        });
      }
      try {
        setCatalog(await api.foundryCatalog());
        setFoundryAvailable(true);
      } catch (error) {
        setFoundryAvailable(false);
        if (!capabilityUnavailable(error)) console.warn("Foundry no disponible:", readableError(error));
      }
      try {
        setActivity(await api.activity());
        setActivityState("ready");
        setActivityError(null);
      } catch (error) {
        setActivityState(capabilityUnavailable(error) ? "unavailable" : "off");
        setActivityError(capabilityUnavailable(error) ? null : readableError(error));
      }
    };
    void loadOptionalCapabilities();
  }, []);

  const brand = status?.brand?.trim() || "INVENTOR O.S.";
  const tagline = status?.tagline?.trim() || "UNIFIED LOCAL AGENTIC WORKSPACE";
  const primaryDirective = status?.directives.find((directive) => !directive.done)?.text;
  const folders = useMemo(() => [...new Set(notes.map((note) => note.folder))].sort(), [notes]);
  const ollamaHasModel = ollama.state === "ready" && Boolean(ollama.model);
  const ollamaConnectedWithoutModel = ollama.state === "ready" && !ollama.model;

  // ------------------------------------------------------------ consola Ollama
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatLogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight });
  }, [messages]);
  const submitChat = async (event: FormEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: message }]);
    setChatBusy(true);
    try {
      const response = await api.ollamaChat(ollama.model || "", message);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant", text: response.response, meta: response.model || ollama.model,
      }]);
      setOllama((current) => ({ ...current, state: "ready", model: response.model || current.model }));
    } catch (error) {
      const unavailable = capabilityUnavailable(error);
      if (unavailable) setOllama({ state: "unavailable", message: readableError(error) });
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "system",
        text: unavailable ? "La consola Ollama todavía no está conectada al servidor local." : readableError(error),
      }]);
    } finally {
      setChatBusy(false);
    }
  };

  // ------------------------------------------------------------ notas y memoria
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState("all");
  const [capture, setCapture] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const noteDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (search.trim().length < 2) {
        setVisibleNotes(notes);
        return;
      }
      try {
        setVisibleNotes(await api.searchNotes(search.trim()));
        setNotesError(null);
      } catch (error) {
        setNotesError(readableError(error));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [notes, search]);
  const filteredNotes = visibleNotes.filter((note) => activeFolder === "all" || note.folder === activeFolder);
  const openNote = useCallback(async (path: string) => {
    setNoteBusy(true);
    try {
      const note = await api.note(path);
      setSelectedNote(note);
      setNoteDraft(note.content);
      noteDialogRef.current?.showModal();
    } catch (error) {
      setMemoryMessage(readableError(error));
    } finally {
      setNoteBusy(false);
    }
  }, []);
  const submitCapture = async (event: FormEvent) => {
    event.preventDefault();
    const text = capture.trim();
    if (!text || memoryBusy) return;
    setMemoryBusy(true);
    try {
      await api.capture(text);
      setCapture("");
      setMemoryMessage("Captura guardada en el inbox local.");
      await refresh();
    } catch (error) {
      setMemoryMessage(readableError(error));
    } finally {
      setMemoryBusy(false);
    }
  };
  const saveSelectedNote = async () => {
    if (!selectedNote || noteBusy) return;
    setNoteBusy(true);
    try {
      const note = await api.saveNote(selectedNote.path, noteDraft);
      setSelectedNote(note);
      setMemoryMessage("Nota guardada localmente.");
      noteDialogRef.current?.close();
      await refresh();
    } catch (error) {
      setMemoryMessage(readableError(error));
    } finally {
      setNoteBusy(false);
    }
  };

  // ------------------------------------------------------------ directivas
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [newDirective, setNewDirective] = useState("");
  const [directiveBusy, setDirectiveBusy] = useState(false);
  const [directiveError, setDirectiveError] = useState<string | null>(null);
  const [editingDirective, setEditingDirective] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  useEffect(() => setDirectives(status?.directives ?? []), [status]);
  const mutateDirective = async (payload: Parameters<typeof api.mutateDirective>[0]) => {
    setDirectiveBusy(true);
    setDirectiveError(null);
    try {
      const next = await api.mutateDirective(payload);
      setDirectives(next);
      setStatus((current) => current ? { ...current, directives: next } : current);
    } catch (error) {
      setDirectiveError(readableError(error));
    } finally {
      setDirectiveBusy(false);
    }
  };
  const submitDirective = async (event: FormEvent) => {
    event.preventDefault();
    if (!newDirective.trim()) return;
    await mutateDirective({ action: "add", text: newDirective.trim() });
    setNewDirective("");
  };

  // ------------------------------------------------------------ Foundry
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [foundryMode, setFoundryMode] = useState(FALLBACK_CATALOG.modes[0].value);
  const [foundryAgent, setFoundryAgent] = useState(FALLBACK_CATALOG.agents[0].value);
  const [objective, setObjective] = useState("");
  const [foundryBusy, setFoundryBusy] = useState(false);
  const [foundryMessage, setFoundryMessage] = useState<string | null>(null);
  const [forgedPrompt, setForgedPrompt] = useState("");
  const [workflow, setWorkflow] = useState<"single" | "team">("single");
  const [mission, setMission] = useState<Mission | null>(null);
  const [launchContext, setLaunchContext] = useState<{ projectIds: string[]; tool: string; missionId?: string }>({ projectIds: [], tool: "codex" });
  const [launchModel, setLaunchModel] = useState("");
  const [launchBusy, setLaunchBusy] = useState(false);
  const launchGuard = useRef(false);
  const [deliveryText, setDeliveryText] = useState<string | null>(null);
  const deliveryDialogRef = useRef<HTMLDialogElement>(null);
  const promptDialogRef = useRef<HTMLDialogElement>(null);
  const projectDialogRef = useRef<HTMLDialogElement>(null);
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [folderPickerBusy, setFolderPickerBusy] = useState(false);
  const folderPickerRequestRef = useRef<AbortController | null>(null);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    try {
      const id = localStorage.getItem("inventor-mission-id");
      if (id) void api.mission(id).then((saved) => { if (!cancelled) setMission((current) => current ?? saved); }).catch(() => {});
    } catch { /* Memoria del navegador opcional. */ }
    return () => { cancelled = true; };
  }, []);
  const openMissionRole = (value: Mission, role: MissionRole) => {
    setForgedPrompt(value.prompts[role]);
    setLaunchContext({ projectIds: value.projectIds, tool: value.tool, missionId: value.id });
    setLaunchModel(value.profiles[role].model);
    promptDialogRef.current?.showModal();
  };
  const readDeliveries = async () => {
    if (!mission || foundryBusy) return;
    setFoundryBusy(true);
    try {
      const current = await api.mission(mission.id);
      setMission(current);
      setDeliveryText([current.state, current.assignments, ...Object.values(current.deliveries)].join("\n\n────────────────────\n\n"));
      deliveryDialogRef.current?.showModal();
    } catch (error) { setFoundryMessage(readableError(error)); }
    finally { setFoundryBusy(false); }
  };
  useEffect(() => {
    if (!catalog.modes.some((item) => item.value === foundryMode)) setFoundryMode(catalog.modes[0]?.value ?? "plan");
    if (!catalog.agents.some((item) => item.value === foundryAgent)) setFoundryAgent(catalog.agents[0]?.value ?? "codex");
  }, [catalog, foundryAgent, foundryMode]);
  const forge = async () => {
    if (!objective.trim() || selectedProjects.length === 0 || foundryBusy) {
      setFoundryMessage("Seleccioná al menos un proyecto y escribí un objetivo verificable.");
      return;
    }
    setFoundryBusy(true);
    setFoundryMessage("Forjando con contexto local…");
    try {
      const result = await api.forgePrompt({
        projectIds: selectedProjects, mode: foundryMode, objective: objective.trim(), tool: foundryAgent, workflow,
      });
      setForgedPrompt(result.prompt);
      setLaunchContext({ projectIds: [...selectedProjects], tool: foundryAgent, missionId: result.mission?.id });
      setLaunchModel(result.mission?.profiles.orchestrator.model ?? "");
      if (result.mission) {
        setMission(result.mission);
        try { localStorage.setItem("inventor-mission-id", result.mission.id); } catch { /* opcional */ }
      }
      setFoundryAvailable(true);
      setFoundryMessage("Prompt listo para copiar o lanzar.");
      promptDialogRef.current?.showModal();
    } catch (error) {
      if (capabilityUnavailable(error)) setFoundryAvailable(false);
      setFoundryMessage(capabilityUnavailable(error)
        ? "Prompt Foundry todavía no está conectado al servidor local."
        : readableError(error));
    } finally {
      setFoundryBusy(false);
    }
  };
  const refine = async () => {
    if (!objective.trim() || foundryBusy) return;
    setFoundryBusy(true);
    try {
      if (!ollama.model) {
        setFoundryMessage("Refinar requiere un modelo Ollama local disponible.");
        return;
      }
      const result = await api.refineObjective({ objective: objective.trim(), model: ollama.model });
      setObjective(result.objective);
      setFoundryMessage("Objetivo refinado por el modelo local.");
    } catch (error) {
      setFoundryMessage(capabilityUnavailable(error)
        ? "El refinador local todavía no está conectado."
        : readableError(error));
    } finally {
      setFoundryBusy(false);
    }
  };
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(forgedPrompt);
      setFoundryMessage("Prompt copiado al portapapeles.");
    } catch {
      setFoundryMessage("El navegador no permitió copiar; seleccioná el texto manualmente.");
    }
  };
  const launchAgent = async () => {
    if (launchGuard.current) return;
    launchGuard.current = true; setLaunchBusy(true);
    try {
      await api.launchAgent({ ...launchContext, model: launchModel.trim(), prompt: forgedPrompt, confirm: true });
      setFoundryMessage("Agente lanzado en los proyectos seleccionados.");
      promptDialogRef.current?.close();
    } catch (error) {
      setFoundryMessage(capabilityUnavailable(error)
        ? "El puente de agentes todavía no está conectado. Copiar sigue disponible."
        : readableError(error));
    } finally { launchGuard.current = false; setLaunchBusy(false); }
  };
  const addProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectName.trim() || !projectPath.trim() || projectBusy || folderPickerBusy) return;
    setProjectBusy(true);
    setProjectMessage(null);
    try {
      await api.addProject(projectName.trim(), projectPath.trim());
      setProjectName("");
      setProjectPath("");
      projectDialogRef.current?.close();
      await refresh();
    } catch (error) {
      setProjectMessage(readableError(error));
    } finally {
      setProjectBusy(false);
    }
  };
  const selectProjectFolder = async () => {
    if (folderPickerBusy) return;
    const controller = new AbortController();
    folderPickerRequestRef.current = controller;
    setFolderPickerBusy(true);
    setProjectMessage(null);
    try {
      const result = await api.selectProjectFolder(projectPath.trim() || undefined, controller.signal);
      if (folderPickerRequestRef.current !== controller || !result.selected || !result.path) return;
      setProjectPath(result.path);
      if (!projectName.trim()) {
        const inferredName = result.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
        if (inferredName) setProjectName(inferredName);
      }
    } catch (error) {
      if (!controller.signal.aborted && folderPickerRequestRef.current === controller) {
        setProjectMessage(readableError(error));
      }
    } finally {
      if (folderPickerRequestRef.current === controller) {
        folderPickerRequestRef.current = null;
        setFolderPickerBusy(false);
      }
    }
  };
  const resetFolderPicker = () => {
    folderPickerRequestRef.current?.abort();
    folderPickerRequestRef.current = null;
    setFolderPickerBusy(false);
  };
  const closeProjectDialog = () => {
    resetFolderPicker();
    projectDialogRef.current?.close();
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="topbar">
        <div className="brand-block">
          <div className="wordmark">{brand}</div>
          <p>{tagline}</p>
        </div>
        <div className="system-status" aria-label="Estado del sistema">
          <StatusDot label="CORE" state={coreError ? "off" : coreLoading ? "checking" : "ready"} detail={coreError || (coreLoading ? "Comprobando API" : "Servidor local conectado")} />
          <StatusDot label="LINK" state={coreError ? "off" : coreLoading ? "checking" : "ready"} detail={coreError ? "Sin enlace local" : "API loopback"} />
          <StatusDot label="MEM" state={status?.storage === "local" ? "ready" : coreLoading ? "checking" : "off"} detail={status?.storage === "local" ? "Markdown local" : "Memoria no disponible"} />
          <StatusDot
            label="IA"
            state={ollamaConnectedWithoutModel ? "checking" : ollama.state}
            detail={ollamaHasModel ? `Ollama ${ollama.model}` : ollamaConnectedWithoutModel ? "Ollama conectado sin modelos" : ollama.message || "Capacidad no disponible"}
          />
          <StatusDot label="VOZ" state={voice.state} detail={voice.message || (voice.available ? "Whisper local listo" : "Motor de voz no instalado")} />
        </div>
        <Clock />
      </header>

      <p className="motto">« Tu memoria local recuerda para que tu cabeza cree. »</p>
      <div className="global-status" role="status" aria-live="polite">
        {refreshing ? "Sincronizando estado local…" : coreError ? `CORE: ${coreError}` : ""}
      </div>

      <main id="main-content" className="dashboard">
        <aside className="dashboard-column" aria-label="Estado de proyectos">
          <Panel title="SYSTEM VITALS" meta="git local en vivo">
            <SystemVitals projects={projects} loading={coreLoading} error={projectsError} />
          </Panel>
          <Panel title="MEMORY VITALS" meta={status ? `${status.memory.notes} notas` : "—"}>
            <dl className="vital-grid">
              <div><dt>NOTAS</dt><dd>{status?.memory.notes ?? "—"}</dd></div>
              <div><dt>INBOX</dt><dd>{status?.memory.inbox ?? "—"}</dd></div>
              <div><dt>PROYECTOS</dt><dd>{status ? `${status.projects.available}/${status.projects.total}` : "—"}</dd></div>
              <div><dt>STORAGE</dt><dd>{status?.storage === "local" ? "LOCAL" : "OFF"}</dd></div>
            </dl>
          </Panel>
          <Panel title="CAPABILITIES" meta="estado real">
            <ul className="capability-list">
              <li><span>Markdown + Obsidian</span><span className={`badge ${status?.storage === "local" ? "badge--ok" : "badge--danger"}`}>{status?.storage === "local" ? "LISTO" : "OFF"}</span></li>
              <li><span>Prompt Foundry</span><span className={`badge ${foundryAvailable ? "badge--ok" : ""}`}>{foundryAvailable === null ? "…" : foundryAvailable ? "LISTO" : "NO CONECTADO"}</span></li>
              <li>
                <span>Ollama local</span>
                <span className={`badge ${ollamaHasModel ? "badge--ok" : ollamaConnectedWithoutModel ? "badge--warning" : ""}`}>
                  {ollamaHasModel ? "LISTO" : ollamaConnectedWithoutModel ? "SIN MODELO" : ollama.state === "checking" ? "…" : "NO CONECTADO"}
                </span>
              </li>
              <li><span>Agent Ops</span><span className={`badge ${activityState === "ready" ? "badge--ok" : ""}`}>{activityState === "ready" ? "LISTO" : activityState === "checking" ? "…" : "NO CONECTADO"}</span></li>
              <li><span>Voz local</span><span className={`badge ${voice.available ? "badge--ok" : "badge--warning"}`}>{voice.state === "checking" ? "…" : voice.available ? "LISTO" : "SIN MOTOR"}</span></li>
            </ul>
          </Panel>
        </aside>

        <div className="dashboard-column dashboard-column--center">
          <Panel id="memory-graph" title="MEMORY ATLAS" meta="explorá · conectá · descubrí" className="graph-panel">
            <MemoryGraph graph={graph} loading={graphLoading} error={graphError} onOpenNote={openNote} onRetry={refreshGraph} />
            <div className="primary-directive">
              <span>PRIMARY DIRECTIVE</span>
              <strong>{primaryDirective || "Sin directivas pendientes ✓"}</strong>
            </div>
          </Panel>

          <Panel id="ollama-console" title="CONSOLA LOCAL" meta={ollamaHasModel ? `Ollama · ${ollama.model}` : ollamaConnectedWithoutModel ? "Ollama · sin modelos" : "Ollama opcional"}>
            <div ref={chatLogRef} className="chat-log" aria-live="polite" aria-label="Conversación con el modelo local">
              {messages.length === 0 && (
                <p className="panel-state">
                  {ollamaHasModel
                    ? "Escribí una orden para el modelo local."
                    : ollamaConnectedWithoutModel
                      ? "Ollama está conectado, pero necesitás descargar un modelo antes de conversar."
                      : "La consola mostrará respuestas solo cuando Ollama y su endpoint local estén disponibles."}
                </p>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`chat-message chat-message--${message.role}`}>
                  {message.meta && <span>{message.meta}</span>}
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <form className="command-form" onSubmit={submitChat}>
              <label className="sr-only" htmlFor="local-command">Orden para Ollama</label>
              <input id="local-command" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="preguntá, resumí, explorá una idea…" autoComplete="off" />
              <button type="submit" disabled={chatBusy || !chatInput.trim() || !ollamaHasModel}>{chatBusy ? "PENSANDO…" : "ENVIAR"}</button>
            </form>
          </Panel>

          <Panel id="voice-transcription" title="VOICE TRANSCRIPTION" meta={voice.available ? "Whisper · offline" : "instalación opcional"}>
            <VoiceTranscriber
              onStatus={setVoice}
              onUseFoundry={(text) => { setObjective((current) => current.trim() ? `${current.trimEnd()}\n\n${text}` : text); scrollTo("prompt-foundry"); }}
              onUseConsole={(text) => { setChatInput((current) => current.trim() ? `${current.trimEnd()}\n\n${text}` : text); scrollTo("ollama-console"); }}
              onMemorySaved={async () => { await refresh(); }}
            />
          </Panel>

          <Panel title="ACTIVITY / AGENT OPS" meta="sin datos simulados">
            <ActivityPanel activity={activity} state={activityState} error={activityError} />
          </Panel>
        </div>

        <aside className="dashboard-column" aria-label="Comandos y memoria">
          <Panel title="COMMAND DECK" meta={status?.ok ? "local" : "standby"}>
            <nav className="command-deck" aria-label="Atajos del centro de comando">
              <button type="button" onClick={() => scrollTo("prompt-foundry")}>▸ PROMPT</button>
              <button type="button" onClick={() => scrollTo("memory-explorer")}>▸ MEMORIA</button>
              <button type="button" onClick={() => scrollTo("ollama-console")}>▸ OLLAMA</button>
              <button type="button" onClick={() => scrollTo("voice-transcription")}>▸ VOZ</button>
              <button type="button" onClick={() => void refresh()} disabled={refreshing}>▸ REFRESH</button>
              <button type="button" onClick={() => projectDialogRef.current?.showModal()}>＋ NUEVO PROYECTO</button>
            </nav>
          </Panel>

          <Panel id="prompt-foundry" title="PROMPT FOUNDRY" meta="contratos para agentes">
            <div className="foundry-form">
              <fieldset>
                <legend>PROYECTOS</legend>
                <div className="project-selector">
                  {projects.length ? projects.map((project) => (
                    <label key={project.id} className={!project.available ? "is-disabled" : ""}>
                      <input
                        type="checkbox"
                        checked={selectedProjects.includes(project.id)}
                        disabled={!project.available}
                        onChange={(event) => setSelectedProjects((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))}
                      />
                      <span>{project.name}</span>
                    </label>
                  )) : <p className="panel-state panel-state--compact">Registrá un proyecto para forjar contexto.</p>}
                </div>
              </fieldset>
              <div className="field-row">
                <label>AGENTE
                  <select value={foundryAgent} onChange={(event) => setFoundryAgent(event.target.value)}>
                    {catalog.agents.map((agent) => <option key={agent.value} value={agent.value}>{agent.label}</option>)}
                  </select>
                </label>
                <label>MODO
                  <select value={foundryMode} onChange={(event) => setFoundryMode(event.target.value)}>
                    {catalog.modes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </label>
              </div>
              <label>OBJETIVO
                <textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Qué querés lograr, cómo sabremos que quedó bien y qué no debe tocarse…" rows={5} />
              </label>
              <label>FORMA DE TRABAJO
                <select value={workflow} onChange={(event) => setWorkflow(event.target.value as "single" | "team")}>
                  <option value="single">Una sesión · ciclo completo</option>
                  <option value="team">Equipo · orquesta, construye e investiga</option>
                </select>
              </label>
              <div className="role-preview" aria-label="Modelos preferidos">
                {(foundryAgent === "claude" ? ["Fable 5.1", "Opus", "Sonnet"] : ["GPT 6 Astra", "Sol", "Terra"]).map((name, index) => (
                  <div key={name}><strong>{name}</strong><small>{["Orquesta y audita", "Construye", "Investiga"][index]}</small></div>
                ))}
              </div>
              <div className="button-row">
                <button type="button" className="button--primary" onClick={() => void forge()} disabled={foundryBusy}>FORJAR PROMPT</button>
                <button type="button" onClick={() => void refine()} disabled={foundryBusy || !objective.trim()}>REFINAR</button>
              </div>
              <p className={`inline-status ${foundryMessage?.includes("todavía") ? "inline-status--warning" : ""}`} role="status" aria-live="polite">
                {foundryMessage || (foundryAvailable === false ? "Motor Foundry no conectado; los controles muestran el contrato esperado." : "Seleccioná proyecto, agente, modo y objetivo.")}
              </p>
              {mission && <div className="mission-panel">
                <span className="eyebrow">MISIÓN PREPARADA · {mission.id.slice(0, 8)}</span>
                <p>{mission.workflow === "team" ? "Equipo" : "Sesión única"} · {mission.tool} · {mission.projectIds.length} proyecto(s)</p>
                <div className="mission-actions">
                  {(mission.workflow === "team" ? ["orchestrator", "builder", "researcher"] as const : ["orchestrator"] as const).map((role) => (
                    <button type="button" key={role} onClick={() => openMissionRole(mission, role)}>{mission.profiles[role].label} · {role === "orchestrator" ? "Orquestador" : role === "builder" ? "Constructor" : "Investigador"}</button>
                  ))}
                  <button type="button" disabled={foundryBusy} onClick={() => void readDeliveries()}>Consultar encargos y entregas</button>
                </div>
                <small>Modelos preferidos, editables al iniciar. La bandeja no despierta sesiones inactivas; los estados los declara cada rol.</small>
              </div>}
            </div>
          </Panel>

          <Panel id="directives" title="DIRECTIVAS" meta={`${directives.filter((directive) => !directive.done).length} abiertas`}>
            {directiveError && <p className="inline-status inline-status--error" role="alert">{directiveError}</p>}
            <ul className="directive-list">
              {directives.map((directive, directiveIndex) => (
                <li key={directive.id} className={directive.done ? "is-done" : ""}>
                  <input
                    type="checkbox"
                    checked={directive.done}
                    aria-label={`${directive.done ? "Reabrir" : "Completar"}: ${directive.text}`}
                    disabled={directiveBusy}
                    onChange={(event) => void mutateDirective({ action: "toggle", id: directive.id, index: directiveIndex, done: event.target.checked })}
                  />
                  {editingDirective === directive.id ? (
                    <Fragment>
                      <label className="sr-only" htmlFor={`directive-${directive.id}`}>Editar directiva</label>
                      <input id={`directive-${directive.id}`} value={editingText} onChange={(event) => setEditingText(event.target.value)} />
                      <button type="button" className="icon-button" aria-label="Guardar directiva" onClick={() => { void mutateDirective({ action: "edit", id: directive.id, index: directiveIndex, text: editingText }); setEditingDirective(null); }}>✓</button>
                    </Fragment>
                  ) : (
                    <Fragment>
                      <span>{directive.text}</span>
                      <button type="button" className="icon-button" aria-label={`Editar: ${directive.text}`} onClick={() => { setEditingDirective(directive.id); setEditingText(directive.text); }}>✎</button>
                    </Fragment>
                  )}
                  <button type="button" className="icon-button icon-button--danger" aria-label={`Eliminar: ${directive.text}`} disabled={directiveBusy} onClick={() => void mutateDirective({ action: "delete", id: directive.id, index: directiveIndex })}>×</button>
                </li>
              ))}
              {!directives.length && <li className="panel-state panel-state--compact">Sin directivas.</li>}
            </ul>
            <form className="compact-form" onSubmit={submitDirective}>
              <label className="sr-only" htmlFor="new-directive">Nueva directiva</label>
              <input id="new-directive" value={newDirective} onChange={(event) => setNewDirective(event.target.value)} placeholder="nueva directiva…" />
              <button type="submit" disabled={directiveBusy || !newDirective.trim()}>+</button>
            </form>
          </Panel>

          <Panel id="memory-explorer" title="MEMORIA" meta={status ? `${status.memory.notes} notas · inbox ${status.memory.inbox}` : "local"}>
            <form className="compact-form" onSubmit={submitCapture}>
              <label className="sr-only" htmlFor="quick-capture">Captura rápida</label>
              <input id="quick-capture" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="captura rápida → inbox…" />
              <button type="submit" disabled={memoryBusy || !capture.trim()}>+</button>
            </form>
            <label className="sr-only" htmlFor="memory-search">Buscar en la memoria</label>
            <input id="memory-search" className="memory-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="buscar en el vault…" />
            <div className="filter-chips" aria-label="Filtrar notas por carpeta">
              <button type="button" className={activeFolder === "all" ? "is-active" : ""} onClick={() => setActiveFolder("all")}>TODAS</button>
              {folders.map((folder) => <button type="button" key={folder} className={activeFolder === folder ? "is-active" : ""} onClick={() => setActiveFolder(folder)}>{folder}</button>)}
            </div>
            {(notesError || memoryMessage) && <p className={`inline-status ${notesError ? "inline-status--error" : ""}`} role={notesError ? "alert" : "status"}>{notesError || memoryMessage}</p>}
            <ul className="note-list">
              {filteredNotes.slice(0, 30).map((note) => (
                <li key={note.path}>
                  <button type="button" onClick={() => void openNote(note.path)} disabled={noteBusy}>
                    <span>◆ {note.title}</span>
                    <small>{note.folder} · {formatDate(note.modifiedAt)}</small>
                    {note.excerpt && <em>{note.excerpt}</em>}
                  </button>
                </li>
              ))}
              {!notesError && filteredNotes.length === 0 && <li className="panel-state panel-state--compact">No hay notas para este filtro.</li>}
            </ul>
          </Panel>
        </aside>
      </main>

      <dialog ref={noteDialogRef} className="command-dialog" onClose={() => setSelectedNote(null)}>
        <div className="dialog-heading">
          <div><span>MEMORY NOTE</span><h2>{selectedNote?.title || "Nota"}</h2></div>
          <button type="button" className="icon-button" aria-label="Cerrar nota" onClick={() => noteDialogRef.current?.close()}>×</button>
        </div>
        <p className="dialog-path">{selectedNote?.path}</p>
        <label className="sr-only" htmlFor="note-editor">Contenido Markdown</label>
        <textarea id="note-editor" className="note-editor" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} spellCheck />
        <div className="dialog-actions">
          <button type="button" className="button--primary" onClick={() => void saveSelectedNote()} disabled={noteBusy}>{noteBusy ? "GUARDANDO…" : "GUARDAR"}</button>
          <button type="button" onClick={() => noteDialogRef.current?.close()}>CANCELAR</button>
        </div>
      </dialog>

      <dialog ref={promptDialogRef} className="command-dialog command-dialog--wide">
        <div className="dialog-heading">
          <div><span>PROMPT FOUNDRY</span><h2>Contrato listo</h2></div>
          <button type="button" className="icon-button" aria-label="Cerrar prompt" onClick={() => promptDialogRef.current?.close()}>×</button>
        </div>
        <label className="sr-only" htmlFor="forged-prompt">Prompt generado</label>
        <label className="dialog-field">MODELO AL INICIAR
          <input value={launchModel} onChange={(event) => setLaunchModel(event.target.value)} maxLength={120} placeholder="Vacío conserva el modelo configurado" />
        </label>
        <p className="dialog-description">Confirmás el lanzamiento en {launchContext.projectIds.length} proyecto(s) del prompt. El proveedor debe tener disponible el modelo elegido.</p>
        <textarea id="forged-prompt" className="prompt-output" value={forgedPrompt} readOnly />
        <div className="dialog-actions">
          <button type="button" className="button--primary" onClick={() => void copyPrompt()}>COPIAR</button>
          <button type="button" disabled={launchBusy} onClick={() => void launchAgent()}>{launchBusy ? "INICIANDO…" : `LANZAR ${launchContext.tool.toUpperCase()}`}</button>
          <button type="button" onClick={() => promptDialogRef.current?.close()}>CERRAR</button>
        </div>
      </dialog>

      <dialog ref={deliveryDialogRef} className="command-dialog command-dialog--wide" aria-label="Bandeja compartida">
        <div className="dialog-heading"><h2>Encargos y entregas</h2><button type="button" onClick={() => deliveryDialogRef.current?.close()}>Cerrar bandeja</button></div>
        <pre className="mission-deliveries">{deliveryText}</pre>
      </dialog>

      <dialog ref={projectDialogRef} className="command-dialog command-dialog--project" onClose={() => {
        resetFolderPicker();
      }}>
        <form onSubmit={addProject}>
          <div className="dialog-heading">
            <div><span>COMMAND DECK</span><h2>Registrar proyecto local</h2></div>
            <button type="button" className="icon-button" aria-label="Cerrar nuevo proyecto" onClick={closeProjectDialog}>×</button>
          </div>
          <p className="dialog-description">El servidor guarda la ruta únicamente en la configuración local. No se envía a Internet ni aparece en respuestas públicas.</p>
          <label className="dialog-field" htmlFor="project-name">NOMBRE
            <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Mi nuevo invento" autoComplete="off" />
          </label>
          <label className="dialog-field" htmlFor="project-path">CARPETA LOCAL</label>
          <span className="folder-picker-row">
            <input id="project-path" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="C:\Proyectos\mi-invento" autoComplete="off" />
            <button type="button" onClick={() => void selectProjectFolder()} disabled={folderPickerBusy || projectBusy}>
              {folderPickerBusy ? "ESPERANDO WINDOWS…" : "BUSCAR CARPETA…"}
            </button>
          </span>
          {projectMessage && <p className="inline-status inline-status--error" role="alert">{projectMessage}</p>}
          <div className="dialog-actions">
            <button type="submit" className="button--primary" disabled={folderPickerBusy || projectBusy || !projectName.trim() || !projectPath.trim()}>{projectBusy ? "REGISTRANDO…" : "REGISTRAR"}</button>
            <button type="button" onClick={closeProjectDialog}>CANCELAR</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
