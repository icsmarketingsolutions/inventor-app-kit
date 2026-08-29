import type { GraphEdge, GraphNode } from "../types";

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  anchorX: number;
  anchorY: number;
  degree: number;
  neighbors: Set<string>;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function createGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): PositionedNode[] {
  const folders = [...new Set(nodes.map((node) => node.folder || "memory"))].sort();
  const columns = Math.max(1, Math.ceil(Math.sqrt(folders.length)));
  const folderIndex = new Map(folders.map((folder, index) => [folder, index]));
  const byFolder = new Map<string, number>();
  const positioned = nodes.map((node) => {
    const folder = node.folder || "memory";
    const index = folderIndex.get(folder) ?? 0;
    const itemIndex = byFolder.get(folder) ?? 0;
    byFolder.set(folder, itemIndex + 1);
    const rows = Math.ceil(folders.length / columns);
    const anchorX = ((index % columns) + 0.5) * (width / columns);
    const anchorY = (Math.floor(index / columns) + 0.5) * (height / Math.max(1, rows));
    const angle = itemIndex * 2.39996 + (hash(node.id) % 23) / 23;
    const radius = 12 + 11 * Math.sqrt(itemIndex);
    return {
      ...node,
      x: anchorX + Math.cos(angle) * radius,
      y: anchorY + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      anchorX,
      anchorY,
      degree: 0,
      neighbors: new Set<string>(),
    };
  });
  const byId = new Map(positioned.map((node) => [node.id, node]));
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    source.degree += 1;
    target.degree += 1;
    source.neighbors.add(target.id);
    target.neighbors.add(source.id);
  }
  return positioned;
}

export function stepGraph(
  nodes: PositionedNode[],
  edges: GraphEdge[],
  heat: number,
  pinnedId: string | null,
): void {
  if (heat <= 0) return;
  for (let first = 0; first < nodes.length; first += 1) {
    for (let second = first + 1; second < nodes.length; second += 1) {
      const a = nodes[first];
      const b = nodes[second];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 1) {
        dx = 0.5;
        dy = -0.5;
        distanceSquared = 1;
      }
      if (distanceSquared > 48_000) continue;
      const force = (220 / distanceSquared) * heat;
      a.vx += dx * force;
      a.vy += dy * force;
      b.vx -= dx * force;
      b.vy -= dy * force;
    }
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const force = (distance - 82) * 0.045 * heat;
    source.vx += (dx / distance) * force;
    source.vy += (dy / distance) * force;
    target.vx -= (dx / distance) * force;
    target.vy -= (dy / distance) * force;
  }
  for (const node of nodes) {
    if (node.id === pinnedId) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += (node.anchorX - node.x) * 0.009 * heat;
    node.vy += (node.anchorY - node.y) * 0.009 * heat;
    node.vx = clamp(node.vx * 0.74, -2.6, 2.6);
    node.vy = clamp(node.vy * 0.74, -2.6, 2.6);
    if (Math.abs(node.vx) < 0.035) node.vx = 0;
    if (Math.abs(node.vy) < 0.035) node.vy = 0;
    node.x += node.vx;
    node.y += node.vy;
  }
}
