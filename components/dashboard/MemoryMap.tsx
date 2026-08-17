"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquare, Zap, Monitor, Wrench, Ear, Mic } from "lucide-react";
import { TYPE_META, type MemoryMapData, type MemoryNodeType } from "@/lib/memoryMap";
import { useVoiceAssistant, type VoicePhase } from "@/lib/assistant/useVoiceAssistant";
import { useGptRealtime } from "@/lib/assistant/useGptRealtime";
import { THEME } from "@/lib/theme";
import { NAV_MODULES } from "@/lib/navModules";
import SignOutButton from "@/components/SignOutButton";
import ToolbarIconButton from "@/components/asisten/ToolbarIconButton";
import AslanInbox from "@/components/dashboard/AslanInbox";
import { useMemoryMapScene, type SceneApi } from "@/components/dashboard/useMemoryMapScene";

export type MemoryMapVitals = {
  memoryCount: number;
  integrationsConnected: number;
  integrationsTotal: number;
  hasOverdueTask: boolean;
  dailyActivity: number[];
};

type Props = {
  data: MemoryMapData;
  vitals: MemoryMapVitals;
};

const FILTERS: { id: MemoryNodeType; label: string; dot: string }[] = [
  { id: "task", label: "Kerjaan", dot: TYPE_META.task.color },
  { id: "finance", label: "Keuangan", dot: TYPE_META.finance.color },
  { id: "note", label: "Pelajaran", dot: TYPE_META.note.color },
  { id: "event", label: "Kalender", dot: TYPE_META.event.color },
  { id: "journal", label: "Jurnal", dot: TYPE_META.journal.color },
  { id: "milestone", label: "Timeline", dot: TYPE_META.milestone.color },
  { id: "contact", label: "Kontak", dot: TYPE_META.contact.color },
];

const ALL_TYPES = FILTERS.map((f) => f.id);

const LAST_MODULE_KEY = "aslan-last-module";

// Every module except Memory Map itself -- this component is that page, so
// linking to it here would just be a no-op entry in its own nav drawer.
const NAV = NAV_MODULES.filter((m) => m.href !== "/dashboard");

const VOICE_PHASE_STYLE: Record<VoicePhase, { color: string; label: string }> = {
  idle: { color: THEME.cyanGlow, label: "Online" },
  "wake-listening": { color: THEME.cyanGlow, label: "Nunggu 'Aslan'..." },
  listening: { color: THEME.mintGlow, label: "Lagi dengerin..." },
  processing: { color: THEME.amberGlow, label: "Mikir..." },
  speaking: { color: THEME.mintGlow, label: "Ngomong..." },
  error: { color: THEME.roseGlow, label: "Error" },
};

export default function MemoryMap({ data, vitals }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<MemoryNodeType>>(() => new Set(ALL_TYPES));
  // Respects prefers-reduced-motion for the initial auto-spin state -- the
  // user can still turn it back on manually via the "Auto-spin" toggle.
  const [spin, setSpin] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [navOpen, setNavOpen] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [lastModuleHref, setLastModuleHref] = useState<string | null>(null);
  useEffect(() => {
    setLastModuleHref(window.localStorage.getItem(LAST_MODULE_KEY));
  }, []);
  // Memory Map is the one page where a nav icon opens a quick-peek overlay
  // (the real route, iframed in a modal) instead of navigating away --
  // every other page's nav just links out directly.
  const [navOverlay, setNavOverlay] = useState<string | null>(null);
  useEffect(() => {
    if (!navOverlay) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOverlay(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOverlay]);
  // Strips the corner chrome (nav/search/status, filters, Riset Aslan) down
  // to just the graph and the voice orb, for a cleaner look at a busy graph.
  const [focusMode, setFocusMode] = useState(false);
  const [insight, setInsight] = useState<{ text: string; sources: { label: string; url: string }[] } | null>(
    null
  );
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightDismissed, setInsightDismissed] = useState(false);

  const [screenShareSupported, setScreenShareSupported] = useState(false);
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setScreenShareSupported(!!navigator.mediaDevices?.getDisplayMedia);
    return () => {
      screenShareStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function captureScreenFrame(): string | undefined {
    const video = screenVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  async function toggleScreenShare() {
    if (screenShareActive) {
      screenShareStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenShareStreamRef.current = null;
      setScreenShareActive(false);
      return;
    }
    setScreenShareError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenShareStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        // play() isn't reliably promise-returning across environments (e.g.
        // jsdom in tests returns undefined instead of a Promise), so guard
        // before chaining .catch() onto it.
        const playResult = screenVideoRef.current.play();
        if (playResult && typeof playResult.then === "function") {
          await playResult.catch(() => {});
        }
      }
      // The browser's own "Stop sharing" control ends the track directly --
      // this is the only way to know that happened without polling.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        screenShareStreamRef.current = null;
        setScreenShareActive(false);
      });
      setScreenShareActive(true);
    } catch {
      setScreenShareError("Gagal mulai screen share. Coba lagi atau izinin akses share screen di browser.");
    }
  }

  const {
    supported: voiceSupported,
    phase: voicePhase,
    errorMsg: voiceError,
    toggle: toggleVoice,
    audioRef,
    lastReply,
    handsFreeSupported,
    handsFreeMode,
    toggleHandsFree,
  } = useVoiceAssistant({
    getScreenshot: () => (screenShareActive ? captureScreenFrame() : undefined),
  });
  const voiceStyle = VOICE_PHASE_STYLE[voicePhase];
  const voiceBusy = voicePhase !== "idle" && voicePhase !== "wake-listening" && voicePhase !== "error";

  const {
    phase: gptRealtimePhase,
    errorMsg: gptRealtimeError,
    audioRef: gptRealtimeAudioRef,
    toggle: toggleGptRealtime,
  } = useGptRealtime();
  const gptRealtimeBusy = gptRealtimePhase !== "idle" && gptRealtimePhase !== "error";

  // At least one type must stay active -- turning off the last one would
  // hide every leaf node with no way back short of the "Semua" reset.
  function toggleType(id: MemoryNodeType) {
    setActiveTypes((prev) => {
      if (prev.has(id) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Read by the render loop without forcing the mount effect to depend on
  // (and rebuild the whole three.js scene for) every keystroke/toggle.
  const selectedIdRef = useRef(selectedId);
  const searchQueryRef = useRef(debouncedSearchQuery);
  const activeTypesRef = useRef(activeTypes);
  const spinRef = useRef(spin);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    searchQueryRef.current = debouncedSearchQuery;
  }, [debouncedSearchQuery]);
  useEffect(() => {
    activeTypesRef.current = activeTypes;
  }, [activeTypes]);
  useEffect(() => {
    spinRef.current = spin;
  }, [spin]);

  // ~200ms debounce so the dim/hide recompute (read every render frame) isn't
  // driven straight off every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Camera quick-jump: ease toward whatever got selected. Only fires on a
  // new selection, not on deselect -- an auto-snap-back on close would be
  // disorienting, so the camera just stays wherever the user left it.
  useEffect(() => {
    if (selectedId) sceneApiRef.current?.focusOnNode(selectedId);
  }, [selectedId]);

  // "Riset Aslan" -- a short contextual note (backed by the web_search
  // server tool) about whatever node is selected, shown in the panel below.
  // Re-fires on every new selection and aborts the previous in-flight
  // request rather than racing it; an aborted request's own callback bails
  // out instead of touching loading/error state, so it can't clobber
  // whatever the newer selection's effect run already set.
  useEffect(() => {
    if (!selectedId) {
      setInsight(null);
      setInsightError(null);
      setInsightLoading(false);
      return;
    }
    const node = data.nodes.find((n) => n.id === selectedId);
    if (!node) return;
    const controller = new AbortController();
    setInsight(null);
    setInsightError(null);
    setInsightDismissed(false);
    setInsightLoading(true);
    fetch("/api/assistant/node-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeLabel: node.typeLabel, label: node.label, fields: node.fields }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setInsightError(String(json.error));
        else setInsight({ text: json.text, sources: Array.isArray(json.sources) ? json.sources : [] });
        setInsightLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setInsightError("Gagal ambil riset.");
        setInsightLoading(false);
      });
    return () => controller.abort();
  }, [selectedId, data.nodes]);

  useMemoryMapScene({
    data,
    stageRef,
    labelLayerRef,
    sceneApiRef,
    selectedIdRef,
    searchQueryRef,
    activeTypesRef,
    spinRef,
    setWebglError,
    setSelectedId,
  });

  const selectedNode = selectedId ? data.nodes.find((n) => n.id === selectedId) ?? null : null;
  const linkCount = selectedId
    ? data.edges.filter(([a, b]) => a === selectedId || b === selectedId).length
    : 0;
  // A leaf's `link` points at its parent hub id; hubs have none. Only leaves
  // get a breadcrumb third level + a back button to reopen the hub's popup.
  const parentHub = selectedNode?.link ? (data.nodes.find((n) => n.id === selectedNode.link) ?? null) : null;
  const breadcrumb = selectedNode
    ? parentHub
      ? `Memory Map ▸ ${parentHub.label} ▸ ${selectedNode.label}`
      : `Memory Map ▸ ${selectedNode.label}`
    : "";

  return (
    <div className="relative h-dvh bg-void overflow-hidden">
      <div ref={stageRef} className="absolute inset-0">
        <div ref={labelLayerRef} className="absolute inset-0 pointer-events-none z-[1]" />
      </div>

      {webglError && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p className="text-xs font-mono uppercase tracking-[0.3em] text-amber-glow mb-2">
              Grafis 3D nggak kebuka
            </p>
            <p className="text-sm text-slate-400">
              Browser/device ini nggak bisa render tampilan 3D-nya. Semua data kamu tetap aman —
              pakai menu di kiri atas buat langsung ke modul yang kamu mau.
            </p>
          </div>
        </div>
      )}

      {!focusMode && (
        <div className="absolute top-5 left-5 z-[2] w-[150px] sm:w-[230px]">
          <button
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            aria-label="Buka menu navigasi"
            className="flex items-center gap-2 mb-3.5 bg-transparent border-none cursor-pointer p-0 text-left"
          >
            <span className="relative w-[26px] h-[26px] rounded-full border-2 border-cyan-glow/50 flex items-center justify-center shrink-0">
              <span className="w-2 h-2 rounded-full bg-cyan-glow pulse-dot" />
              {vitals.hasOverdueTask && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-glow"
                  aria-label="Ada tugas telat"
                  title="Ada tugas telat"
                />
              )}
            </span>
            <div>
              <p className="font-display font-bold tracking-[0.1em] text-white text-sm leading-tight m-0 flex items-center gap-1.5">
                VREKA
                <span className="text-slate-400 text-[10px]">{navOpen ? "▲" : "▼"}</span>
              </p>
              <p className="font-mono text-[8px] tracking-[0.15em] text-slate-400 m-0">
                {data.nodes.length} memori · {data.edges.length} koneksi
              </p>
            </div>
          </button>

          {navOpen && (
            <div className="mb-3.5 bg-panel/90 border border-line rounded-lg backdrop-blur-sm overflow-hidden">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono uppercase tracking-wider text-slate-300 hover:text-cyan-glow hover:bg-panel2 transition-colors border-b border-line/60"
                >
                  <item.icon aria-hidden="true" className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  {item.label}
                  {item.href === "/dashboard/kerjaan" && vitals.hasOverdueTask && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-glow ml-auto" aria-hidden="true" />
                  )}
                </Link>
              ))}
              <div className="px-3 py-2.5">
                <SignOutButton />
              </div>
            </div>
          )}

          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari memori..."
            className="w-full box-border bg-panel/75 border border-line text-slate-200 font-mono text-xs px-3 py-2.5 rounded-lg outline-none backdrop-blur-sm focus-visible:outline-cyan-glow mb-3.5"
          />

          <div className="bg-panel/75 border border-line rounded-lg px-3 py-2.5 backdrop-blur-sm">
            <p className="font-mono text-[8.5px] tracking-[0.1em] text-slate-400 m-0 mb-1.5">
              {"// SYSTEM.STATUS"}
            </p>
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] mb-1">
              <span className="text-slate-400 shrink-0">NODE</span>
              <span className="text-amber-glow ml-auto">{data.nodes.length}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] mb-1">
              <span className="text-slate-400 shrink-0">MEM</span>
              <span className="text-cyan-glow ml-auto">{vitals.memoryCount}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[9.5px]">
              <span className="text-slate-400 shrink-0">INTG</span>
              <span className="text-mint-glow ml-auto">
                {vitals.integrationsConnected}/{vitals.integrationsTotal}
              </span>
            </div>
            {vitals.dailyActivity.length > 0 && (
              <div className="flex items-end gap-[2px] h-[22px] mt-2 pt-2 border-t border-line">
                {vitals.dailyActivity.map((count, i) => {
                  const max = Math.max(1, ...vitals.dailyActivity);
                  const h = Math.max(2, Math.round((count / max) * 22));
                  return (
                    <span
                      key={i}
                      title={`${count} aksi`}
                      className="block w-1 bg-cyan-glow/25 rounded-[1px]"
                      style={{ height: h }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Centered from `sm:` up, per the layout the user asked for. Stays
          right-aligned below that breakpoint -- a horizontally centered
          toolbar's left edge sits well inside the top-left nav/search
          panel's width on any phone-sized viewport, and the filter row
          (7 type toggles) makes this one wider than before. */}
      {!webglError && (
        <div className="absolute top-5 right-5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[2] flex items-start gap-1.5">
          {!focusMode && (
            <div className="flex items-center gap-1 bg-panel/85 border border-line rounded-lg p-1 backdrop-blur-sm">
              <button
                onClick={() => setActiveTypes(new Set(ALL_TYPES))}
                title="Semua"
                className="px-1.5 h-7 rounded-[5px] font-mono text-[9px] uppercase tracking-wider whitespace-nowrap"
                style={{ color: activeTypes.size === ALL_TYPES.length ? THEME.cyanGlow : THEME.neutral400 }}
              >
                Semua
              </button>
              {FILTERS.map((f) => {
                const active = activeTypes.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleType(f.id)}
                    aria-pressed={active}
                    aria-label={f.label}
                    title={f.label}
                    className="flex items-center justify-center w-7 h-7 rounded-[5px]"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: f.dot, opacity: active ? 1 : 0.35 }}
                    />
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-1 bg-panel/85 border border-line rounded-lg p-1 backdrop-blur-sm">
            <button
              onClick={() => setFocusMode((f) => !f)}
              aria-pressed={focusMode}
              title="Focus Mode"
              className={`flex items-center justify-center w-7 h-7 rounded-[5px] border font-mono text-sm ${
                focusMode ? "bg-cyan-glow/10 border-cyan-glow/50 text-cyan-glow" : "border-transparent text-slate-400"
              }`}
            >
              ◱
            </button>
            {!focusMode && (
              <>
                <button
                  onClick={() => sceneApiRef.current?.fitView()}
                  title="Fit"
                  className="flex items-center justify-center w-7 h-7 rounded-[5px] border border-transparent text-slate-400 font-mono text-sm hover:text-slate-200"
                >
                  ⊙
                </button>
                <button
                  onClick={() => setSpin((s) => !s)}
                  aria-pressed={spin}
                  title={spin ? "Auto-spin" : "Diam"}
                  className={`flex items-center justify-center w-7 h-7 rounded-[5px] border font-mono text-sm ${
                    spin ? "bg-cyan-glow/10 border-cyan-glow/50 text-cyan-glow" : "border-transparent text-slate-400"
                  }`}
                >
                  ◍
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* top-16 on mobile clears the toolbar row above (which stays
          right-aligned below `sm:`); once that toolbar centers itself at
          `sm:`, the corner's free and this can sit at the same top-5. */}
      <div className="absolute top-16 right-5 sm:top-5 z-[2]">
        <AslanInbox />
      </div>

      {selectedNode && (
        <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[300px] bg-panel/90 border-l border-line backdrop-blur-[10px] p-5 z-[3] overflow-y-auto">
          <p className="font-mono text-[9.5px] text-slate-400 mb-2.5 truncate">{breadcrumb}</p>
          <div className="flex items-center justify-between mb-4">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.15em] border rounded-[3px] px-[7px] py-0.5"
              style={{ color: selectedNode.color, borderColor: selectedNode.color }}
            >
              {selectedNode.typeLabel}
            </span>
            <button
              onClick={() => setSelectedId(null)}
              className="bg-transparent border-none text-slate-400 text-base leading-none cursor-pointer"
              aria-label="Tutup detail"
            >
              ×
            </button>
          </div>
          <p className="font-display text-lg font-bold text-white mb-3">{selectedNode.label}</p>
          <div className="flex flex-col gap-2.5">
            {selectedNode.fields.map((f) => (
              <div
                key={f.k}
                className="flex justify-between gap-2.5 border-b border-line/60 pb-2"
              >
                <span className="text-[11.5px] text-slate-400">{f.k}</span>
                <span className="text-[12.5px] text-slate-300 text-right">{f.v}</span>
              </div>
            ))}
          </div>
          <p className="font-mono text-[10px] text-slate-400 mt-4">{linkCount} koneksi</p>
          {selectedNode.href && (
            <a
              href={selectedNode.href}
              className="inline-block mt-4 text-xs font-mono text-cyan-glow hover:underline"
            >
              Lihat semua →
            </a>
          )}
          {parentHub && (
            <button
              onClick={() => setSelectedId(parentHub.id)}
              className="mt-3.5 w-full bg-transparent border border-line text-slate-400 font-mono text-[11px] uppercase tracking-wider py-2 rounded-sm hover:text-slate-200 hover:border-slate-500"
            >
              ← Kembali ke {parentHub.label}
            </button>
          )}

          {/* Rendered inline (not as its own floating card) so it stays
              reachable when this panel goes full-width on mobile -- a
              separate bottom-left card would sit underneath it, unreachable,
              on any screen narrow enough for the panel to cover the width. */}
          {!focusMode && !insightDismissed && (insightLoading || insight || insightError) && (
            <div className="mt-5 pt-4 border-t border-line">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-cyan-glow">
                  <span className="w-[5px] h-[5px] rounded-full bg-cyan-glow pulse-dot" />
                  Riset Aslan
                </span>
                <button
                  onClick={() => setInsightDismissed(true)}
                  className="bg-transparent border-none text-slate-400 text-sm leading-none cursor-pointer"
                  aria-label="Tutup riset"
                >
                  ×
                </button>
              </div>
              {insightLoading && <p className="font-mono text-[10px] text-slate-400 m-0">Mikir...</p>}
              {insightError && !insightLoading && (
                <p className="text-[11.5px] text-rose-glow m-0">{insightError}</p>
              )}
              {insight && !insightLoading && (
                <>
                  <p className="text-[12.5px] leading-relaxed text-slate-300 mb-2.5 mt-0">{insight.text}</p>
                  {insight.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {insight.sources.map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[9.5px] no-underline border border-cyan-glow/30 text-cyan-glow rounded-full px-2 py-0.5 bg-cyan-glow/[.06] hover:bg-cyan-glow/10"
                        >
                          {s.label}
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="font-mono text-[9px] text-slate-400 m-0">Klik node lain buat gali topik itu</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="absolute z-[2] flex flex-col items-center gap-2.5 top-1/2 right-4 sm:right-[34px] -translate-y-1/2">
        <button
          onClick={toggleVoice}
          data-phase={voicePhase}
          aria-label={voiceBusy ? "Hentikan ngobrol sama Aslan" : "Ngobrol sama Aslan"}
          className="relative w-[100px] h-[100px] sm:w-[150px] sm:h-[150px] rounded-full bg-transparent border-none cursor-pointer flex items-center justify-center"
        >
          <span className="aslan-avatar w-20 h-20 sm:w-[120px] sm:h-[120px]">
            <img src="/aslan.png" alt="" />
          </span>
        </button>
        <p
          className="font-mono text-[9.5px] uppercase tracking-[0.15em] flex items-center gap-1.5"
          style={{ color: voiceStyle.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ backgroundColor: voiceStyle.color }} />
          {voiceStyle.label}
        </p>
      </div>

      {!focusMode && (
        <div className="absolute bottom-24 right-5 z-[2] hidden md:flex gap-1 bg-panel/85 border border-line rounded-md p-1 backdrop-blur-sm">
          {NAV.map((item) => (
            <button
              key={item.href}
              title={item.label}
              onClick={() => {
                window.localStorage.setItem(LAST_MODULE_KEY, item.href);
                setLastModuleHref(item.href);
                setNavOverlay(item.href);
              }}
              className="relative flex items-center justify-center w-7 h-7 rounded-[3px] text-slate-400 hover:text-cyan-glow hover:bg-panel2"
            >
              <item.icon aria-hidden="true" className="w-4 h-4" strokeWidth={1.75} />
              {lastModuleHref === item.href && (
                <span className="absolute top-0.5 right-0.5 w-[5px] h-[5px] rounded-full bg-mint-glow" aria-hidden="true" />
              )}
              {item.href === "/dashboard/kerjaan" && vitals.hasOverdueTask && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-glow border border-void"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {navOverlay && (
        <div
          className="fixed inset-0 z-50 bg-void/75 backdrop-blur-sm flex items-center justify-center animate-backdrop-in"
          onClick={() => setNavOverlay(null)}
        >
          <div
            className="relative w-[92vw] h-[85vh] sm:w-[75vw] sm:h-[75vh] bg-void border border-line rounded-lg overflow-hidden shadow-2xl flex flex-col animate-panel-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 h-10 flex items-center justify-between gap-3 px-4 border-b border-line bg-panel/90">
              <span className="font-mono text-[10.5px] text-slate-400 truncate">
                Memory Map ▸ <span className="text-cyan-glow">{NAV.find((n) => n.href === navOverlay)?.label}</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={navOverlay}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 h-[26px] px-3 rounded-full border border-line bg-panel2 text-slate-400 font-mono text-[10.5px] uppercase tracking-wider no-underline hover:border-cyan-glow/40"
                >
                  Buka penuh ↗
                </a>
                <button
                  onClick={() => setNavOverlay(null)}
                  aria-label="Tutup preview"
                  className="w-[26px] h-[26px] rounded-full border border-line bg-panel2 text-slate-400 text-sm hover:border-cyan-glow/40"
                >
                  ×
                </button>
              </div>
            </div>
            <iframe
              src={`${navOverlay}?embed=1`}
              title={NAV.find((n) => n.href === navOverlay)?.label ?? "Preview"}
              className="flex-1 w-full border-none"
            />
          </div>
        </div>
      )}

      {/* Sits right above the Ask bar regardless of focus mode -- the
          avatar/mic button that starts a voice turn stays visible in focus
          mode too, so a reply from it shouldn't disappear along with the
          icon row below. */}
      {lastReply && (
        <div className="absolute z-[2] bottom-24 left-1/2 -translate-x-1/2 w-[min(480px,92vw)]">
          <div className="bg-panel/90 border border-line rounded-lg p-3 backdrop-blur-sm shadow-glow">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-cyan-glow mb-1.5 flex items-center gap-1.5">
              <MessageSquare aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
              Aslan bilang
            </p>
            <p className="text-[12px] leading-relaxed text-slate-300 m-0">{lastReply}</p>
          </div>
        </div>
      )}

      {!focusMode && (
        <div className="absolute z-[2] bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 max-w-[94vw]">
          <div className="flex items-center flex-wrap justify-center gap-2 bg-panel/85 border border-line rounded-full p-1.5 backdrop-blur-sm">
            <ToolbarIconButton
              icon={Zap}
              label={gptRealtimeBusy ? "Stop ngobrol sama Aslan" : "Ngobrol real-time sama Aslan"}
              active={gptRealtimeBusy}
              onClick={toggleGptRealtime}
            />
            {screenShareSupported && (
              <ToolbarIconButton
                icon={Monitor}
                label={screenShareActive ? "Matiin screen share" : "Share screen ke Aslan"}
                active={screenShareActive}
                onClick={toggleScreenShare}
              />
            )}
            <ToolbarIconButton
              icon={Wrench}
              label="Tools & Integrasi"
              onClick={() => setNavOverlay("/dashboard/asisten")}
            />
            {handsFreeSupported && (
              <ToolbarIconButton
                icon={Ear}
                label={handsFreeMode ? "Matiin mode hands-free" : "Nyalain mode hands-free (panggil 'Aslan')"}
                active={handsFreeMode}
                onClick={toggleHandsFree}
              />
            )}
            {voiceSupported && (
              <ToolbarIconButton
                icon={Mic}
                label={voiceBusy ? "Stop mode suara" : "Mode suara"}
                active={voiceBusy}
                onClick={toggleVoice}
              />
            )}
          </div>
          {screenShareActive && (
            <p className="text-[9.5px] font-mono text-cyan-glow flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow animate-pulse" />
              Screen share aktif — Aslan liat snapshot layar kamu tiap ngobrol.
            </p>
          )}
          {screenShareError && <p className="text-[9.5px] font-mono text-rose-glow">{screenShareError}</p>}
          {voiceError && <p className="text-[9.5px] font-mono text-rose-glow">{voiceError}</p>}
          {gptRealtimeError && <p className="text-[9.5px] font-mono text-rose-glow">{gptRealtimeError}</p>}
        </div>
      )}

      {/* Hidden -- only used as a frame source for screen-share snapshots,
          never shown to the user directly. */}
      <video ref={screenVideoRef} className="hidden" muted playsInline />
      <audio ref={audioRef} className="hidden" />
      <audio ref={gptRealtimeAudioRef} className="hidden" />
    </div>
  );
}
