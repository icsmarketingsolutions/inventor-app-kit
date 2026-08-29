import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp, createGraphLayout, stepGraph, type PositionedNode } from "../lib/graph";
import type { GraphResponse } from "../types";

interface MemoryGraphProps {
  graph: GraphResponse | null;
  loading: boolean;
  error: string | null;
  onOpenNote: (path: string) => void;
  onRetry: () => void;
}

interface Viewport {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface PointerState {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  nodeId: string | null;
  panning: boolean;
}

const COLORS: Record<string, string> = {
  "00-inbox": "#e8a33d",
  "10-projects": "#7dc97d",
  "10-proyectos": "#7dc97d",
  "20-knowledge": "#6db3e8",
  "20-conocimiento": "#6db3e8",
  "30-directives": "#e06c5a",
  "30-directivas": "#e06c5a",
  "40-apps": "#e8df68",
  "50-sessions": "#c88be8",
  "50-sesiones": "#c88be8",
  "90-reports": "#b58ae0",
  "90-reportes": "#b58ae0",
  unresolved: "#5a5142",
};

function nodeColor(node: PositionedNode): string {
  if (node.unresolved) return COLORS.unresolved;
  return COLORS[node.folder] ?? "#e8a33d";
}

export function MemoryGraph({ graph, loading, error, onOpenNote, onRetry }: MemoryGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<PositionedNode[]>([]);
  const viewportRef = useRef<Viewport>({ width: 800, height: 360, scale: 1, offsetX: 0, offsetY: 0 });
  const pointerRef = useRef<PointerState | null>(null);
  const heatRef = useRef(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIndexRef = useRef(0);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const fit = useCallback(() => {
    const nodes = nodesRef.current;
    const viewport = viewportRef.current;
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((node) => node.x)) - 54;
    const maxX = Math.max(...nodes.map((node) => node.x)) + 54;
    const minY = Math.min(...nodes.map((node) => node.y)) - 32;
    const maxY = Math.max(...nodes.map((node) => node.y)) + 32;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    viewport.scale = clamp(Math.min(viewport.width / width, viewport.height / height) * 0.92, 0.28, 1.3);
    viewport.offsetX = (viewport.width - width * viewport.scale) / 2 - minX * viewport.scale;
    viewport.offsetY = (viewport.height - height * viewport.scale) / 2 - minY * viewport.scale;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const viewport = viewportRef.current;
    const dpr = window.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);
    context.translate(viewport.offsetX, viewport.offsetY);
    context.scale(viewport.scale, viewport.scale);

    const byId = new Map(nodesRef.current.map((node) => [node.id, node]));
    const hoveredIdNow = hoveredIdRef.current;
    const hovered = hoveredIdNow ? byId.get(hoveredIdNow) : null;
    context.lineWidth = 1 / viewport.scale;
    for (const edge of graph.edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      const active = hovered && (source.id === hovered.id || target.id === hovered.id);
      context.strokeStyle = active ? "#e8a33dcc" : hovered ? "#3d34232d" : "#3d34238c";
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }

    const selectedId = nodesRef.current[selectedIndexRef.current]?.id;
    for (const node of nodesRef.current) {
      const color = nodeColor(node);
      const related = !hovered || node.id === hovered.id || hovered.neighbors.has(node.id);
      const radius = 3.7 + Math.min(4.5, node.degree * 0.65);
      context.globalAlpha = related ? 1 : 0.22;
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = node.unresolved ? 0 : 9;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      if (node.id === selectedId) {
        context.strokeStyle = "#fff0c7";
        context.lineWidth = 1.4 / viewport.scale;
        context.beginPath();
        context.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
        context.stroke();
      }
      if (node.id === hoveredIdNow || node.id === selectedId || (!hovered && node.degree >= 2)) {
        context.fillStyle = node.id === hoveredIdNow ? "#ffc46b" : "#a99a78";
        context.font = `${node.id === hoveredIdNow ? "700 " : ""}${9.5 / viewport.scale}px monospace`;
        const label = node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
        context.fillText(label, node.x + radius + 5, node.y + 3);
      }
    }
    context.globalAlpha = 1;
  }, [graph]);

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
    draw();
  }, [draw, hoveredId]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    draw();
  }, [draw, selectedIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const width = Math.max(280, canvas.clientWidth);
      const height = Math.max(280, canvas.clientHeight || 380);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      viewportRef.current.width = width;
      viewportRef.current.height = height;
      if (graph) {
        nodesRef.current = createGraphLayout(graph.nodes, graph.edges, width, height);
        heatRef.current = 1;
        setSelectedIndex((current) => {
          const next = clamp(current, 0, Math.max(0, graph.nodes.length - 1));
          selectedIndexRef.current = next;
          return next;
        });
        fit();
        draw();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [draw, fit, graph]);

  useEffect(() => {
    if (!graph || nodesRef.current.length === 0) return;
    let frame = 0;
    if (reduceMotion) {
      for (let step = 0; step < 22; step += 1) stepGraph(nodesRef.current, graph.edges, 0.55, null);
      fit();
      draw();
      return;
    }
    const animate = () => {
      if (heatRef.current >= 0.018) {
        stepGraph(nodesRef.current, graph.edges, heatRef.current, pointerRef.current?.nodeId ?? null);
        heatRef.current *= 0.988;
      }
      draw();
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [draw, fit, graph, reduceMotion]);

  const worldPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    const viewport = viewportRef.current;
    return {
      x: (clientX - bounds.left - viewport.offsetX) / viewport.scale,
      y: (clientY - bounds.top - viewport.offsetY) / viewport.scale,
    };
  };

  const nodeAt = (clientX: number, clientY: number) => {
    const point = worldPoint(clientX, clientY);
    const tolerance = 13 / viewportRef.current.scale;
    return (
      nodesRef.current.find(
        (node) => (node.x - point.x) ** 2 + (node.y - point.y) ** 2 <= tolerance ** 2,
      ) ?? null
    );
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const node = nodeAt(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      nodeId: node?.id ?? null,
      panning: !node,
    };
    if (node) {
      const index = nodesRef.current.findIndex((candidate) => candidate.id === node.id);
      selectedIndexRef.current = Math.max(0, index);
      setSelectedIndex(selectedIndexRef.current);
      heatRef.current = Math.max(heatRef.current, 0.3);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer) {
      setHoveredId(nodeAt(event.clientX, event.clientY)?.id ?? null);
      return;
    }
    const deltaX = event.clientX - pointer.lastX;
    const deltaY = event.clientY - pointer.lastY;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) pointer.moved = true;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    if (pointer.panning) {
      viewportRef.current.offsetX += deltaX;
      viewportRef.current.offsetY += deltaY;
    } else if (pointer.nodeId) {
      const node = nodesRef.current.find((candidate) => candidate.id === pointer.nodeId);
      if (node) {
        const point = worldPoint(event.clientX, event.clientY);
        node.x = point.x;
        node.y = point.y;
        node.anchorX = point.x;
        node.anchorY = point.y;
      }
    }
    draw();
  };

  const releasePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const node = pointer.nodeId
      ? nodesRef.current.find((candidate) => candidate.id === pointer.nodeId)
      : null;
    pointerRef.current = null;
    if (node && !pointer.moved && !node.unresolved) onOpenNote(node.path);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const viewport = viewportRef.current;
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const nextScale = clamp(viewport.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), 0.25, 3);
    viewport.offsetX = localX - (localX - viewport.offsetX) * (nextScale / viewport.scale);
    viewport.offsetY = localY - (localY - viewport.offsetY) * (nextScale / viewport.scale);
    viewport.scale = nextScale;
    draw();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (nodesRef.current.length === 0) return;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      setSelectedIndex((current) => {
        const next = (current + direction + nodesRef.current.length) % nodesRef.current.length;
        selectedIndexRef.current = next;
        return next;
      });
    } else if (event.key === "Enter") {
      const node = nodesRef.current[selectedIndex];
      if (node && !node.unresolved) onOpenNote(node.path);
    } else if (event.key === "Home") {
      event.preventDefault();
      fit();
      draw();
    }
  };

  const selected = graph?.nodes[selectedIndex];
  return (
    <div className="graph-shell">
      {loading && <p className="panel-state">Leyendo wikilinks locales…</p>}
      {error && !loading && (
        <div className="panel-state panel-state--error" role="alert">
          <span>{error}</span>
          <button type="button" className="text-button" onClick={onRetry}>Reintentar</button>
        </div>
      )}
      {!loading && !error && graph?.nodes.length === 0 && (
        <p className="panel-state">El vault todavía no tiene nodos enlazados.</p>
      )}
      <canvas
        ref={canvasRef}
        className="memory-graph"
        hidden={Boolean(loading || error || !graph?.nodes.length)}
        tabIndex={0}
        role="img"
        aria-label={`Grafo de memoria con ${graph?.nodes.length ?? 0} nodos. ${selected ? `Seleccionado: ${selected.label}.` : ""} Usá flechas para recorrer, Enter para abrir y Home para encuadrar.`}
        onDoubleClick={() => { fit(); draw(); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={() => { if (!pointerRef.current) setHoveredId(null); }}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
      {!loading && !error && Boolean(graph?.nodes.length) && (
        <div className="graph-help" aria-hidden="true">
          ARRASTRÁ · RUEDA = ZOOM · DOBLE CLICK = ENCUADRAR
        </div>
      )}
    </div>
  );
}
