"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { TYPE_META, type MemoryMapData, type MemoryNodeType } from "@/lib/memoryMap";
import { useVoiceAssistant, type VoicePhase } from "@/lib/assistant/useVoiceAssistant";
import { useGptRealtime } from "@/lib/assistant/useGptRealtime";
import { THEME } from "@/lib/theme";
import SignOutButton from "@/components/SignOutButton";
import ToolbarIconButton from "@/components/asisten/ToolbarIconButton";

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

type SceneApi = {
  fitView: () => void;
  focusOnNode: (id: string) => void;
};

const FILTERS: { id: MemoryNodeType; label: string; dot: string }[] = [
  { id: "task", label: "Kerjaan", dot: TYPE_META.task.color },
  { id: "finance", label: "Keuangan", dot: TYPE_META.finance.color },
  { id: "note", label: "Pelajaran", dot: TYPE_META.note.color },
  { id: "event", label: "Kalender", dot: TYPE_META.event.color },
  { id: "journal", label: "Jurnal", dot: TYPE_META.journal.color },
  { id: "contact", label: "Kontak", dot: TYPE_META.contact.color },
];

const ALL_TYPES = FILTERS.map((f) => f.id);

const INITIAL_ORBIT = { theta: 0.6, phi: 1.15, radius: 320 };

const LAST_MODULE_KEY = "aslan-last-module";

const NAV = [
  { href: "/dashboard/ringkasan", label: "Ringkasan", icon: "☀" },
  { href: "/dashboard/keuangan", label: "Keuangan", icon: "⌬" },
  { href: "/dashboard/kerjaan", label: "Kerjaan", icon: "▤" },
  { href: "/dashboard/pelajaran", label: "Pelajaran", icon: "◎" },
  { href: "/dashboard/kalender", label: "Kalender", icon: "▦" },
  { href: "/dashboard/jurnal", label: "Jurnal", icon: "✎" },
  { href: "/dashboard/timeline", label: "Timeline", icon: "⧗" },
  { href: "/dashboard/asisten", label: "Aslan", icon: "✦" },
];

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

  useEffect(() => {
    const stage = stageRef.current;
    const labelLayer = labelLayerRef.current;
    if (!stage || !labelLayer) return;

    const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
    const physics: Record<
      string,
      { x: number; y: number; z: number; vx: number; vy: number; vz: number; fx: number; fy: number; fz: number }
    > = {};
    for (const n of data.nodes) {
      physics[n.id] = { x: n.x, y: n.y, z: n.z, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0 };
    }

    const rect = stage.getBoundingClientRect();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 1, 2000);
    const orbit = { ...INITIAL_ORBIT };
    function applyCamera() {
      camera.position.set(
        orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.radius * Math.cos(orbit.phi),
        orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
      );
      camera.lookAt(0, 0, 0);
    }
    applyCamera();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      // A device that fails to create a WebGL context (blocklisted GPU,
      // hardened browser settings, ...) used to crash this whole route --
      // there's nothing to tear down yet at this point, so just report it
      // and let the component render its non-3D fallback instead.
      console.error("MemoryMap: gagal bikin WebGL context:", err);
      setWebglError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(rect.width, rect.height);
    renderer.setClearColor(THEME.void, 0);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";
    stage.insertBefore(renderer.domElement, stage.firstChild);

    const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    const meshes: Record<string, THREE.Mesh> = {};
    const glows: Record<string, THREE.Mesh> = {};
    const labels: Record<string, HTMLDivElement> = {};

    for (const n of data.nodes) {
      const p = physics[n.id];
      const col = new THREE.Color(n.color);

      const mesh = new THREE.Mesh(
        sphereGeo,
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 })
      );
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.setScalar(n.r);
      mesh.userData.id = n.id;
      scene.add(mesh);
      meshes[n.id] = mesh;

      const glow = new THREE.Mesh(
        sphereGeo,
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.position.set(p.x, p.y, p.z);
      glow.scale.setScalar(n.r * 2.2);
      scene.add(glow);
      glows[n.id] = glow;

      const div = document.createElement("div");
      div.className = "g3d-label";
      div.textContent = n.label;
      labelLayer.appendChild(div);
      labels[n.id] = div;
    }

    const edgePositions = new Float32Array(data.edges.length * 6);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    const edgeLines = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: THEME.cyanGlow, transparent: true, opacity: 0.28 })
    );
    scene.add(edgeLines);

    const flowGeo = new THREE.SphereGeometry(0.55, 8, 6);
    const flowBaseMat = new THREE.MeshBasicMaterial({
      color: 0x9df3ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flowParticles = data.edges.map(() => {
      const m = new THREE.Mesh(flowGeo, flowBaseMat.clone());
      m.userData.phase = Math.random();
      m.userData.speed = 0.05 + Math.random() * 0.03;
      m.visible = Math.random() < 0.5;
      scene.add(m);
      return m;
    });

    let hoveredId: string | null = null;
    let dragging: { x: number; y: number; moved: boolean } | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const meshList = Object.values(meshes);

    function focusSet(): Set<string> | null {
      const focusId = hoveredId || selectedIdRef.current;
      if (!focusId) return null;
      const set = new Set([focusId]);
      for (const [a, b] of data.edges) {
        if (a === focusId) set.add(b);
        if (b === focusId) set.add(a);
      }
      return set;
    }

    // Hubs sit outside the type filter (there's no "hub" toggle -- they're
    // the graph's backbone, not filterable content) but still respect
    // search, so typing a hub's own name can dim everything else down to it.
    function isVisible(id: string): boolean {
      const n = byId[id];
      const q = searchQueryRef.current.trim().toLowerCase();
      const matchesSearch = !q || n.label.toLowerCase().includes(q);
      if (n.type === "hub") return matchesSearch;
      return activeTypesRef.current.has(n.type) && matchesSearch;
    }

    function projectLabels(focus: Set<string> | null) {
      const r = renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector3();
      for (const n of data.nodes) {
        const p = physics[n.id];
        const div = labels[n.id];
        v.set(p.x, p.y + n.r + 6, p.z).project(camera);
        const behind = v.z > 1;
        const x = (v.x * 0.5 + 0.5) * r.width;
        const y = (-v.y * 0.5 + 0.5) * r.height;
        const dim = focus ? !focus.has(n.id) : !isVisible(n.id);
        const show =
          !behind &&
          !dim &&
          (n.type === "hub" ||
            hoveredId === n.id ||
            selectedIdRef.current === n.id ||
            (focus ? focus.has(n.id) : false));
        div.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
        div.style.opacity = show ? "1" : "0";
      }
    }

    function stepPhysics() {
      for (const id in physics) {
        physics[id].fx = 0;
        physics[id].fy = 0;
        physics[id].fz = 0;
      }
      const ids = Object.keys(physics);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = physics[ids[i]];
          const b = physics[ids[j]];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = a.z - b.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 1) d2 = 1;
          const d = Math.sqrt(d2);
          const f = 4200 / d2;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          const fz = (dz / d) * f;
          a.fx += fx;
          a.fy += fy;
          a.fz += fz;
          b.fx -= fx;
          b.fy -= fy;
          b.fz -= fz;
        }
      }
      for (const [aId, bId] of data.edges) {
        const a = physics[aId];
        const b = physics[bId];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const f = (d - 46) * 0.02;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        const fz = (dz / d) * f;
        a.fx += fx;
        a.fy += fy;
        a.fz += fz;
        b.fx -= fx;
        b.fy -= fy;
        b.fz -= fz;
      }
      for (const id of ids) {
        const p = physics[id];
        const n = byId[id];
        if (n.anchor) {
          p.fx += (n.anchor[0] - p.x) * 0.02;
          p.fy += (n.anchor[1] - p.y) * 0.02;
          p.fz += (n.anchor[2] - p.z) * 0.02;
        } else {
          p.fx += -p.x * 0.002;
          p.fy += -p.y * 0.002;
          p.fz += -p.z * 0.002;
        }
        p.fx += (Math.random() - 0.5) * 0.25;
        p.fy += (Math.random() - 0.5) * 0.25;
        p.fz += (Math.random() - 0.5) * 0.25;
        p.vx = (p.vx + p.fx * 0.02) * 0.88;
        p.vy = (p.vy + p.fy * 0.02) * 0.88;
        p.vz = (p.vz + p.fz * 0.02) * 0.88;
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
      }
    }

    let lastFrameTime = 0;
    function syncScene() {
      const focus = focusSet();
      const t = performance.now() * 0.002;
      for (const n of data.nodes) {
        const p = physics[n.id];
        const mesh = meshes[n.id];
        const glow = glows[n.id];
        mesh.position.set(p.x, p.y, p.z);
        glow.position.set(p.x, p.y, p.z);
        const dim = focus ? !focus.has(n.id) : !isVisible(n.id);
        const isFocus = focus !== null && (hoveredId === n.id || selectedIdRef.current === n.id);
        (mesh.material as THREE.MeshBasicMaterial).opacity = dim ? 0.16 : 1;
        const breathe = n.type === "hub" ? 1 + Math.sin(t + p.x) * 0.04 : 1;
        const scale = n.r * breathe * (isFocus ? 1.25 : 1);
        mesh.scale.setScalar(scale);
        glow.scale.setScalar(scale * (isFocus ? 2.8 : 2.2));
        (glow.material as THREE.MeshBasicMaterial).opacity = dim ? 0.02 : isFocus ? 0.3 : 0.16;
      }

      let i = 0;
      for (const [aId, bId] of data.edges) {
        const a = physics[aId];
        const b = physics[bId];
        // A filtered-out endpoint hides the whole edge (not just dims it) --
        // collapsing both ends onto the same point renders as a zero-length,
        // invisible segment without needing a per-segment material/shader.
        const filterHidden = !isVisible(aId) || !isVisible(bId);
        if (a && b && !filterHidden) {
          edgePositions[i] = a.x;
          edgePositions[i + 1] = a.y;
          edgePositions[i + 2] = a.z;
          edgePositions[i + 3] = b.x;
          edgePositions[i + 4] = b.y;
          edgePositions[i + 5] = b.z;
        } else if (a) {
          edgePositions[i] = edgePositions[i + 3] = a.x;
          edgePositions[i + 1] = edgePositions[i + 4] = a.y;
          edgePositions[i + 2] = edgePositions[i + 5] = a.z;
        }
        i += 6;
      }
      edgeGeo.attributes.position.needsUpdate = true;
      (edgeLines.material as THREE.LineBasicMaterial).opacity = focus ? 0.12 : 0.28;

      const now = performance.now();
      const dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0.016;
      lastFrameTime = now;
      data.edges.forEach(([aId, bId], idx) => {
        const a = physics[aId];
        const b = physics[bId];
        const fp = flowParticles[idx];
        if (!a || !b || !fp) return;
        fp.userData.phase = (fp.userData.phase + fp.userData.speed * dt) % 1;
        const tt = fp.userData.phase as number;
        fp.position.set(a.x + (b.x - a.x) * tt, a.y + (b.y - a.y) * tt, a.z + (b.z - a.z) * tt);
        const filterHidden = !isVisible(aId) || !isVisible(bId);
        const dimEdge = focus ? !(focus.has(aId) && focus.has(bId)) : false;
        (fp.material as THREE.MeshBasicMaterial).opacity = filterHidden ? 0 : dimEdge ? 0.03 : 0.35;
      });

      renderer.render(scene, camera);
      projectLabels(focus);
    }

    function pickNode(select: boolean) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(meshList, false);
      const id = hits.length ? (hits[0].object.userData.id as string) : null;
      if (select) setSelectedId(id);
      else if (id !== hoveredId) hoveredId = id;
    }

    function onPointerDown(e: PointerEvent) {
      dragging = { x: e.clientX, y: e.clientY, moved: false };
      renderer.domElement.style.cursor = "grabbing";
      markInteraction();
    }
    function onPointerMove(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (dragging) {
        const dx = e.clientX - dragging.x;
        const dy = e.clientY - dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
        orbit.theta -= dx * 0.005;
        orbit.phi = Math.max(0.25, Math.min(2.9, orbit.phi - dy * 0.005));
        dragging.x = e.clientX;
        dragging.y = e.clientY;
        applyCamera();
      }
    }
    function onPointerUp() {
      if (dragging && !dragging.moved) pickNode(true);
      dragging = null;
      renderer.domElement.style.cursor = "grab";
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      orbit.radius = Math.max(90, Math.min(700, orbit.radius + e.deltaY * 0.4));
      applyCamera();
      markInteraction();
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    function onResize() {
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      renderer.setSize(r.width, r.height);
    }
    window.addEventListener("resize", onResize);

    let fitAnim = 0;
    function animateOrbitTo(targetTheta: number, targetPhi: number, targetRadius: number, duration = 450) {
      if (fitAnim) cancelAnimationFrame(fitAnim);
      const startTheta = orbit.theta;
      const startPhi = orbit.phi;
      const startRadius = orbit.radius;
      const start = performance.now();
      function step(now: number) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        orbit.theta = startTheta + (targetTheta - startTheta) * eased;
        orbit.phi = startPhi + (targetPhi - startPhi) * eased;
        orbit.radius = startRadius + (targetRadius - startRadius) * eased;
        applyCamera();
        fitAnim = t < 1 ? requestAnimationFrame(step) : 0;
      }
      fitAnim = requestAnimationFrame(step);
    }

    // Frames the camera around the nodes' actual current spread instead of a
    // fixed constant, so "Fit" still does something visible even when nodes
    // have drifted or the camera is already at the default orbit.
    function fitView() {
      let maxDist = 0;
      for (const p of Object.values(physics)) {
        const dist = Math.hypot(p.x, p.y, p.z);
        if (dist > maxDist) maxDist = dist;
      }
      const targetRadius = Math.max(140, Math.min(650, maxDist * 2.6 + 90));
      animateOrbitTo(INITIAL_ORBIT.theta, INITIAL_ORBIT.phi, targetRadius);
    }

    // Quick-jump toward a selected node. The camera always looks at the
    // origin (re-aiming look-at itself would be a bigger change to the
    // orbit model), so this approximates "frame that node" by orbiting to
    // face its direction from the origin and pulling the radius in
    // proportional to how far out it sits -- not pixel-perfect centering,
    // but a real ease toward where the node actually is rather than a no-op.
    function focusOnNode(id: string) {
      const p = physics[id];
      if (!p) return;
      const dist = Math.hypot(p.x, p.y, p.z) || 1;
      const targetTheta = Math.atan2(p.x, p.z);
      const targetPhi = Math.acos(Math.max(-1, Math.min(1, p.y / dist)));
      const targetRadius = Math.max(90, Math.min(320, dist * 1.8 + 60));
      animateOrbitTo(targetTheta, targetPhi, targetRadius, 600);
    }
    sceneApiRef.current = { fitView, focusOnNode };

    // Idle auto-fit: ease back to the full-graph framing after 12s of no
    // camera input, so a node quick-jump or a manual drag doesn't leave the
    // view stuck off-center forever. Fires once per idle stretch (not every
    // frame past the threshold) and resets on the next drag/zoom.
    let lastInteractionAt = performance.now();
    let idleFitDone = false;
    function markInteraction() {
      lastInteractionAt = performance.now();
      idleFitDone = false;
    }

    let raf = 0;
    let lastHoverCheck = 0;
    function loop() {
      // Backgrounded tabs still get throttled rAF callbacks eventually, but
      // there's no reason to keep running full physics + a WebGL render for
      // a canvas nobody can see -- stop rescheduling here, and let
      // onVisibilityChange restart the loop once the tab is visible again.
      if (document.visibilityState === "hidden") {
        raf = 0;
        return;
      }
      stepPhysics();
      if (spinRef.current && !dragging) {
        orbit.theta += 0.0012;
        applyCamera();
      }
      const frameNow = performance.now();
      // Hover raycasting doesn't need to run at full frame rate -- ~13fps is
      // plenty responsive for a hover highlight and cuts the per-frame cost.
      if (!dragging && frameNow - lastHoverCheck > 75) {
        pickNode(false);
        lastHoverCheck = frameNow;
      }
      if (!dragging && !idleFitDone && frameNow - lastInteractionAt > 12000) {
        fitView();
        idleFitDone = true;
      }
      syncScene();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !raf) {
        raf = requestAnimationFrame(loop);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(raf);
      if (fitAnim) cancelAnimationFrame(fitAnim);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      sceneApiRef.current = null;
      renderer.dispose();
      sphereGeo.dispose();
      edgeGeo.dispose();
      flowGeo.dispose();
      flowBaseMat.dispose();
      for (const id of Object.keys(meshes)) {
        (meshes[id].material as THREE.Material).dispose();
        (glows[id].material as THREE.Material).dispose();
      }
      for (const fp of flowParticles) (fp.material as THREE.Material).dispose();
      labelLayer.innerHTML = "";
      if (renderer.domElement.parentElement === stage) {
        stage.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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
        <div className="absolute top-5 left-5 z-[2] w-[230px]">
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
                  <span aria-hidden="true">{item.icon}</span>
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
            <p className="font-mono text-[8.5px] tracking-[0.1em] text-slate-500 m-0 mb-1.5">
              {"// SYSTEM.STATUS"}
            </p>
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] mb-1">
              <span className="text-slate-500 shrink-0">NODE</span>
              <span className="text-amber-glow ml-auto">{data.nodes.length}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] mb-1">
              <span className="text-slate-500 shrink-0">MEM</span>
              <span className="text-cyan-glow ml-auto">{vitals.memoryCount}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[9.5px]">
              <span className="text-slate-500 shrink-0">INTG</span>
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

      {!webglError && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[2] flex gap-1 bg-panel/85 border border-line rounded-lg p-1 backdrop-blur-sm">
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
      )}

      {!webglError && !focusMode && (
        <div className="absolute top-5 right-5 z-[2] text-right">
          <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate-400 mb-2">
            Filter
          </p>
          <div className="flex flex-col gap-1.5 items-end">
            <button
              onClick={() => setActiveTypes(new Set(ALL_TYPES))}
              className="flex items-center gap-1.5 bg-transparent border-none py-0.5 font-mono text-xs"
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
                  className="flex items-center gap-1.5 bg-transparent border-none py-0.5 font-mono text-xs"
                  style={{ color: active ? THEME.cyanGlow : THEME.neutral400 }}
                >
                  {f.label}
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: f.dot, opacity: active ? 1 : 0.35 }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="absolute top-0 right-0 bottom-0 w-[300px] bg-panel/90 border-l border-line backdrop-blur-[10px] p-5 z-[3] overflow-y-auto">
          <p className="font-mono text-[9.5px] text-slate-500 mb-2.5 truncate">{breadcrumb}</p>
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
        </div>
      )}

      <div className="absolute z-[2] flex flex-col items-center gap-2.5 top-1/2 right-[34px] -translate-y-1/2">
        <button
          onClick={toggleVoice}
          data-phase={voicePhase}
          aria-label={voiceBusy ? "Hentikan ngobrol sama Aslan" : "Ngobrol sama Aslan"}
          className="relative w-[150px] h-[150px] rounded-full bg-transparent border-none cursor-pointer flex items-center justify-center"
        >
          <span className="aslan-avatar w-[120px] h-[120px]">
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
        {lastReply && (
          <div className="w-[240px] bg-panel/90 border border-line rounded-lg p-3 backdrop-blur-sm shadow-glow">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-cyan-glow mb-1.5">
              🗨 Aslan bilang
            </p>
            <p className="text-[12px] leading-relaxed text-slate-300 m-0">{lastReply}</p>
          </div>
        )}
      </div>

      {!focusMode && selectedNode && !insightDismissed && (insightLoading || insight || insightError) && (
        <div className="absolute bottom-24 left-5 z-[2] w-[270px] bg-panel/90 border border-line rounded-lg p-3.5 backdrop-blur-[10px] shadow-glow">
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
          {insightLoading && <p className="font-mono text-[10px] text-slate-500 m-0">Mikir...</p>}
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
              <p className="font-mono text-[9px] text-slate-600 m-0">Klik node lain buat gali topik itu</p>
            </>
          )}
        </div>
      )}

      {!focusMode && (
        <div className="absolute bottom-24 right-5 z-[2] flex gap-1 bg-panel/85 border border-line rounded-md p-1 backdrop-blur-sm">
          {NAV.map((item) => (
            <button
              key={item.href}
              title={item.label}
              onClick={() => {
                window.localStorage.setItem(LAST_MODULE_KEY, item.href);
                setLastModuleHref(item.href);
                setNavOverlay(item.href);
              }}
              className="relative flex items-center justify-center w-7 h-7 rounded-[3px] text-slate-400 text-sm hover:text-cyan-glow hover:bg-panel2"
            >
              <span aria-hidden="true">{item.icon}</span>
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
          className="fixed inset-0 z-50 bg-void/75 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setNavOverlay(null)}
        >
          <div
            className="relative w-[75vw] h-[75vh] bg-void border border-line rounded-lg overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 h-10 flex items-center justify-between gap-3 px-4 border-b border-line bg-panel/90">
              <span className="font-mono text-[10.5px] text-slate-500 truncate">
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

      {!focusMode && (
        <div className="absolute z-[2] bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 bg-panel/85 border border-line rounded-full p-1.5 backdrop-blur-sm">
            <ToolbarIconButton
              icon="⚡"
              label={gptRealtimeBusy ? "Stop ngobrol sama Aslan" : "Ngobrol real-time sama Aslan"}
              active={gptRealtimeBusy}
              onClick={toggleGptRealtime}
            />
            {screenShareSupported && (
              <ToolbarIconButton
                icon="🖥️"
                label={screenShareActive ? "Matiin screen share" : "Share screen ke Aslan"}
                active={screenShareActive}
                onClick={toggleScreenShare}
              />
            )}
            <ToolbarIconButton
              icon="🧰"
              label="Tools & Integrasi"
              onClick={() => setNavOverlay("/dashboard/asisten")}
            />
            {handsFreeSupported && (
              <ToolbarIconButton
                icon="👂"
                label={handsFreeMode ? "Matiin mode hands-free" : "Nyalain mode hands-free (panggil 'Aslan')"}
                active={handsFreeMode}
                onClick={toggleHandsFree}
              />
            )}
            {voiceSupported && (
              <ToolbarIconButton
                icon="🎤"
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
