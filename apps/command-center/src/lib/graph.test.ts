import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "../types";
import { clamp, createGraphLayout, stepGraph, filterGraph } from "./graph";

const nodes: GraphNode[] = [
  { id: "a", path: "10-projects/a.md", label: "A", folder: "10-projects", unresolved: false },
  { id: "b", path: "20-knowledge/b.md", label: "B", folder: "20-knowledge", unresolved: false },
];
const edges: GraphEdge[] = [{ source: "a", target: "b" }];

describe("grafo de memoria", () => {
  it("filtra sin enlaces huérfanos y conserva el grafo original", () => {
    const graph = { nodes, edges };
    expect(filterGraph(graph, "  A  ", "10-projects")).toEqual({ nodes: [nodes[0]], edges: [] });
    expect(filterGraph(graph, "", "")).toEqual(graph);
    expect(filterGraph(graph, "ausente", "")).toEqual({ nodes: [], edges: [] });
    expect(filterGraph(null, "", "")).toBeNull();
    expect(graph.edges).toHaveLength(1);
  });
  it("produce un layout determinista y calcula vecinos", () => {
    const first = createGraphLayout(nodes, edges, 800, 360);
    const second = createGraphLayout(nodes, edges, 800, 360);
    expect(first.map(({ x, y }) => [x, y])).toEqual(second.map(({ x, y }) => [x, y]));
    expect(first[0].neighbors.has("b")).toBe(true);
    expect(first[0].degree).toBe(1);
  });

  it("mueve nodos sin producir valores inválidos", () => {
    const layout = createGraphLayout(nodes, edges, 800, 360);
    stepGraph(layout, edges, 1, null);
    expect(layout.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
