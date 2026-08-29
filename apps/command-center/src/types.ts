export type CapabilityState = "ready" | "off" | "checking" | "unavailable";

export interface Directive {
  id: string;
  text: string;
  done: boolean;
}

export interface StatusResponse {
  ok: true;
  storage: "local";
  brand?: string;
  tagline?: string;
  memory: { notes: number; inbox: number };
  projects: { total: number; available: number };
  directives: Directive[];
}

export interface Project {
  id: string;
  name: string;
  available: boolean;
  git: {
    repository: boolean;
    branch: string;
    dirtyCount: number;
    ahead: number | null;
    behind: number | null;
    lastCommit: { subject: string; authoredAt: string } | null;
  };
}

export interface NoteSummary {
  path: string;
  title: string;
  folder: string;
  modifiedAt: string;
  size: number;
  excerpt?: string;
}

export interface NoteDetail extends NoteSummary {
  content: string;
}

export interface GraphNode {
  id: string;
  path: string;
  label: string;
  folder: string;
  unresolved: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface OllamaStatus {
  state: CapabilityState;
  model?: string;
  message?: string;
}

export interface AgentActivity {
  id: string;
  at: string;
  project: string;
  subject: string;
  kind: "commit" | "session";
  agent?: string;
  mode?: string;
  commitsAfter?: number | null;
}

export interface FoundryCatalogItem {
  value: string;
  label: string;
}

export interface FoundryCatalog {
  modes: FoundryCatalogItem[];
  agents: FoundryCatalogItem[];
}
