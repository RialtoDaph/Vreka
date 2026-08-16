"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { CanvasArrow, CanvasNode, CanvasNodeKind } from "@/lib/types";
import { arrowEndpoints, clampZoom, toWorldPoint, zoomFromWheel, type Pan } from "@/lib/canvas";
import { THEME } from "@/lib/theme";
import { useConfirm } from "@/lib/useConfirm";
import { StickyNote, ListTodo } from "lucide-react";

const CARD_COLORS = [THEME.cyanGlow, THEME.amberGlow, THEME.roseGlow, THEME.mintGlow, THEME.violetGlow];

const INITIAL_PAN: Pan = { x: 0, y: 0 };

const canvasToolBtnClass =
  "bg-panel/80 border border-line text-slate-300 font-mono text-[11px] px-3 py-[7px] rounded-md cursor-pointer whitespace-nowrap backdrop-blur-sm hover:border-cyan-glow/40";
const canvasZoomBtnClass =
  "w-7 h-7 bg-panel/80 border border-line text-slate-300 rounded-md cursor-pointer backdrop-blur-sm hover:border-cyan-glow/40";

type DragState = { nodeId: string; offsetX: number; offsetY: number };
type PanState = { startClientX: number; startClientY: number; startPanX: number; startPanY: number };

export default function CanvasKerjaPage() {
  const supabase = createClient();
  const stageRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [arrows, setArrows] = useState<CanvasArrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pan, setPan] = useState<Pan>(INITIAL_PAN);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [panning, setPanning] = useState<PanState | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [linkCursor, setLinkCursor] = useState({ x: 0, y: 0 });
  const { confirm, confirmDialog } = useConfirm();

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const [{ data: nodeRows }, { data: arrowRows }] = await Promise.all([
      supabase.from("canvas_nodes").select("*").order("created_at", { ascending: true }),
      supabase.from("canvas_arrows").select("*"),
    ]);
    setNodes(nodeRows ?? []);
    setArrows(arrowRows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React's synthetic wheel handler is passive by default, so
  // e.preventDefault() inside a JSX onWheel is silently ignored -- a raw,
  // explicitly non-passive listener is the only way to actually stop the
  // page from scrolling while zooming the canvas (same reason MemoryMap.tsx
  // does its own event wiring instead of JSX props for this one).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setZoom((z) => zoomFromWheel(z, e.deltaY));
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  // Pinch-to-zoom for touch devices. This runs as a raw capture-phase
  // listener rather than a React onPointerDown/Move prop so it sees every
  // pointer regardless of which child element it lands on -- a node's own
  // pointerdown handler calls stopPropagation() (needed so a tap on a node
  // starts a drag, not a canvas pan), which would otherwise hide a second
  // finger from a handler attached further up the React tree.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const active = new Map<number, { x: number; y: number }>();
    let pinchStartDist: number | null = null;
    let pinchStartZoom = 1;

    function distance(): number {
      const pts = Array.from(active.values());
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    function onDown(e: PointerEvent) {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2) {
        pinchStartDist = distance();
        setZoom((z) => {
          pinchStartZoom = z;
          return z;
        });
        setPanning(null);
        setDragging(null);
      }
    }
    function onMove(e: PointerEvent) {
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2 && pinchStartDist) {
        setZoom(clampZoom(pinchStartZoom * (distance() / pinchStartDist)));
      }
    }
    function onUp(e: PointerEvent) {
      active.delete(e.pointerId);
      if (active.size < 2) pinchStartDist = null;
    }

    stage.addEventListener("pointerdown", onDown, { capture: true });
    stage.addEventListener("pointermove", onMove, { capture: true });
    stage.addEventListener("pointerup", onUp, { capture: true });
    stage.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      stage.removeEventListener("pointerdown", onDown, { capture: true });
      stage.removeEventListener("pointermove", onMove, { capture: true });
      stage.removeEventListener("pointerup", onUp, { capture: true });
      stage.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, []);

  async function addNode(kind: CanvasNodeKind) {
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesi login habis. Refresh halaman terus coba lagi.");
      return;
    }
    const world = toWorldPoint(220, 220, pan, zoom);
    // Two separate insert() calls rather than one call fed a union payload --
    // Supabase's generated insert type rejects a value whose shape varies by
    // branch, since it can't narrow which row type applies.
    const { data, error: insertError } =
      kind === "sticky"
        ? await supabase
            .from("canvas_nodes")
            .insert({
              user_id: user.id,
              kind: "sticky",
              x: world.x,
              y: world.y,
              w: 200,
              h: 150,
              text: "",
              color: CARD_COLORS[nodes.length % CARD_COLORS.length],
              label: null,
            })
            .select("*")
            .single()
        : await supabase
            .from("canvas_nodes")
            .insert({
              user_id: user.id,
              kind: "task",
              x: world.x,
              y: world.y,
              w: 220,
              h: 110,
              text: "Tugas baru",
              color: null,
              label: "Belum ditautkan",
            })
            .select("*")
            .single();
    if (insertError || !data) {
      setError("Gagal nambah kartu. Coba lagi.");
      return;
    }
    setNodes((prev) => [...prev, data]);
  }

  async function deleteNode(id: string) {
    if (!(await confirm("Yakin mau hapus kartu ini? Panah yang nyambung ke sini ikut kehapus."))) return;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setArrows((prev) => prev.filter((a) => a.from_node_id !== id && a.to_node_id !== id));
    await supabase.from("canvas_nodes").delete().eq("id", id);
  }

  function updateNodeField(id: string, patch: Partial<Pick<CanvasNode, "text" | "label" | "color">>) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function persistNodeField(id: string, patch: Partial<Pick<CanvasNode, "text" | "label" | "color">>) {
    await supabase.from("canvas_nodes").update(patch).eq("id", id);
  }

  function setNodeColor(id: string, color: string) {
    updateNodeField(id, { color });
    persistNodeField(id, { color });
  }

  async function persistNodePosition(node: CanvasNode) {
    await supabase.from("canvas_nodes").update({ x: node.x, y: node.y }).eq("id", node.id);
  }

  async function finishLink(targetId: string) {
    const fromId = linkingFrom;
    setLinkingFrom(null);
    if (!fromId || fromId === targetId) return;
    if (arrows.some((a) => a.from_node_id === fromId && a.to_node_id === targetId)) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("canvas_arrows")
      .insert({ user_id: user.id, from_node_id: fromId, to_node_id: targetId })
      .select("*")
      .single();
    if (!error && data) setArrows((prev) => [...prev, data]);
  }

  function onStagePointerDown(e: React.PointerEvent) {
    // A click on empty canvas while a link is armed cancels it instead of
    // starting a pan -- otherwise there'd be no way to back out of linking
    // mode without picking some other (wrong) node.
    if (linkingFrom) {
      setLinkingFrom(null);
      return;
    }
    setPanning({ startClientX: e.clientX, startClientY: e.clientY, startPanX: pan.x, startPanY: pan.y });
  }

  function onNodePointerDown(node: CanvasNode, e: React.PointerEvent) {
    e.stopPropagation();
    if (linkingFrom) {
      finishLink(node.id);
      return;
    }
    const world = toWorldPoint(e.clientX, e.clientY, pan, zoom);
    setDragging({ nodeId: node.id, offsetX: world.x - node.x, offsetY: world.y - node.y });
  }

  function onLinkPointPointerDown(nodeId: string, e: React.PointerEvent) {
    e.stopPropagation();
    setLinkingFrom(nodeId);
  }

  function onStagePointerMove(e: React.PointerEvent) {
    if (panning) {
      setPan({
        x: panning.startPanX + (e.clientX - panning.startClientX),
        y: panning.startPanY + (e.clientY - panning.startClientY),
      });
      return;
    }
    if (dragging) {
      const world = toWorldPoint(e.clientX, e.clientY, pan, zoom);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragging.nodeId ? { ...n, x: world.x - dragging.offsetX, y: world.y - dragging.offsetY } : n
        )
      );
      return;
    }
    if (linkingFrom) {
      setLinkCursor(toWorldPoint(e.clientX, e.clientY, pan, zoom));
    }
  }

  function onStagePointerUp() {
    if (dragging) {
      const node = nodes.find((n) => n.id === dragging.nodeId);
      if (node) persistNodePosition(node);
    }
    setDragging(null);
    setPanning(null);
    // Linking is a two-click gesture (down on the source's link dot to arm
    // it, then down on the target node to complete it via finishLink) --
    // clearing linkingFrom here too would wipe the armed state the instant
    // the arming click's own pointerup bubbles up, before the second click
    // ever lands.
  }

  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const linkSource = linkingFrom ? (nodesById.get(linkingFrom) ?? null) : null;

  return (
    <div className="relative h-dvh bg-void overflow-hidden select-none">
      <div
        ref={stageRef}
        className="absolute inset-0"
        style={{ cursor: panning ? "grabbing" : "default", touchAction: "none" }}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerLeave={onStagePointerUp}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
          <defs>
            <pattern id="canvas-grid" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(75,232,255,.06)" strokeWidth="1" />
            </pattern>
            <marker id="canvas-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6" fill={THEME.cyanGlow} opacity="0.6" />
            </marker>
          </defs>
          <g style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
            <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#canvas-grid)" />
            {arrows.map((a) => {
              const from = nodesById.get(a.from_node_id);
              const to = nodesById.get(a.to_node_id);
              if (!from || !to) return null;
              const pts = arrowEndpoints(from, to);
              return (
                <line
                  key={a.id}
                  x1={pts.x1}
                  y1={pts.y1}
                  x2={pts.x2}
                  y2={pts.y2}
                  stroke={THEME.cyanGlow}
                  strokeWidth={2}
                  opacity={0.45}
                  markerEnd="url(#canvas-arrowhead)"
                />
              );
            })}
            {linkSource && (
              <line
                x1={linkSource.x + linkSource.w / 2}
                y1={linkSource.y + linkSource.h / 2}
                x2={linkCursor.x}
                y2={linkCursor.y}
                stroke={THEME.cyanGlow}
                strokeWidth={2}
                opacity={0.3}
                strokeDasharray="4 4"
              />
            )}
          </g>
        </svg>

        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {nodes.map((node) => {
            const isSticky = node.kind === "sticky";
            const accent = node.color ?? THEME.cyanGlow;
            return (
              <div
                key={node.id}
                data-node
                onPointerDown={(e) => onNodePointerDown(node, e)}
                className="absolute flex flex-col p-2.5 rounded-md shadow-lg"
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.w,
                  height: node.h,
                  background: isSticky ? "rgba(15,26,44,.92)" : "rgba(11,18,32,.92)",
                  border: `1px solid ${isSticky ? `${accent}55` : THEME.line}`,
                  borderLeft: `3px solid ${accent}`,
                  cursor: dragging?.nodeId === node.id ? "grabbing" : "grab",
                  touchAction: "none",
                }}
              >
                <div className="flex items-center justify-between mb-1.5 text-xs" style={{ color: accent }}>
                  {isSticky ? (
                    <StickyNote aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={1.75} />
                  ) : (
                    <ListTodo aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                    {CARD_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={(e) => {
                          e.stopPropagation();
                          setNodeColor(node.id, c);
                        }}
                        aria-label={`Warna ${c}`}
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: c,
                          outline: node.color === c ? `1px solid ${THEME.void}` : "none",
                          boxShadow: node.color === c ? `0 0 0 1.5px ${c}` : "none",
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`Hapus kartu ${isSticky ? "sticky" : "tugas"}`}
                    className="bg-transparent border-none text-white/40 hover:text-white/70 cursor-pointer text-sm leading-none"
                  >
                    ×
                  </button>
                </div>
                {isSticky ? (
                  <textarea
                    value={node.text}
                    onChange={(e) => updateNodeField(node.id, { text: e.target.value })}
                    onBlur={(e) => persistNodeField(node.id, { text: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    placeholder="Tulis catatan..."
                    className="flex-1 w-full bg-transparent border-none text-slate-200 text-[13px] resize-none outline-none"
                  />
                ) : (
                  <>
                    <input
                      value={node.label ?? ""}
                      onChange={(e) => updateNodeField(node.id, { label: e.target.value })}
                      onBlur={(e) => persistNodeField(node.id, { label: e.target.value })}
                      onPointerDown={(e) => e.stopPropagation()}
                      placeholder="Label"
                      className="w-full bg-transparent border-none text-[9px] font-mono uppercase tracking-wider text-slate-400 outline-none mb-1"
                    />
                    <input
                      value={node.text}
                      onChange={(e) => updateNodeField(node.id, { text: e.target.value })}
                      onBlur={(e) => persistNodeField(node.id, { text: e.target.value })}
                      onPointerDown={(e) => e.stopPropagation()}
                      placeholder="Judul tugas"
                      className="w-full bg-transparent border-none text-[13px] text-slate-200 outline-none"
                    />
                  </>
                )}
                <div
                  onPointerDown={(e) => onLinkPointPointerDown(node.id, e)}
                  className="absolute -right-1.5 -bottom-1.5 w-4 h-4 -m-0.5 rounded-full border-2 z-10"
                  style={{ background: THEME.cyanGlow, borderColor: THEME.void, cursor: "crosshair", touchAction: "none" }}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute top-5 left-5 z-[2] flex flex-col gap-2.5 max-w-[150px] sm:max-w-none">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-full border-2 border-cyan-glow/50 flex items-center justify-center shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-glow" />
          </span>
          <div>
            <p className="font-display font-bold tracking-[0.1em] text-white text-sm leading-tight m-0">
              CANVAS KERJA
            </p>
            <p className="font-mono text-[8px] tracking-[0.15em] text-slate-400 m-0">
              Modul 08 · {nodes.length} item
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => addNode("sticky")} className={canvasToolBtnClass}>
            + Sticky
          </button>
          <button onClick={() => addNode("task")} className={canvasToolBtnClass}>
            + Kartu Tugas
          </button>
          <Link href="/dashboard/kerjaan" className={canvasToolBtnClass}>
            ← Kerjaan
          </Link>
        </div>
        {error && (
          <p className="max-w-[260px] text-[11px] text-rose-glow bg-rose-glow/10 border border-rose-glow/30 rounded-sm px-2.5 py-1.5">
            {error}
          </p>
        )}
      </div>

      <div className="absolute top-5 right-5 z-[2] flex gap-1.5">
        <button onClick={() => setZoom((z) => clampZoom(z - 0.1))} className={canvasZoomBtnClass}>
          −
        </button>
        <span className="font-mono text-[11px] text-slate-400 px-1.5 flex items-center">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom((z) => clampZoom(z + 0.1))} className={canvasZoomBtnClass}>
          +
        </button>
        <button
          onClick={() => {
            setPan(INITIAL_PAN);
            setZoom(1);
          }}
          className={canvasToolBtnClass}
        >
          ⊙ Fit
        </button>
      </div>

      {!loading && nodes.length === 0 && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center pointer-events-none">
          <p className="text-sm text-slate-600">Kosong -- klik &quot;+ Sticky&quot; atau &quot;+ Kartu Tugas&quot; buat mulai.</p>
        </div>
      )}

      <p className="absolute bottom-4 left-5 z-[2] font-mono text-[10px] text-slate-600 tracking-wide max-w-[calc(100%-40px)]">
        Drag kanvas kosong buat geser · klik titik cyan di pojok kartu lalu klik kartu lain buat sambung · klik titik
        warna buat ganti warna kartu · scroll atau cubit buat zoom
      </p>

      {confirmDialog}
    </div>
  );
}
