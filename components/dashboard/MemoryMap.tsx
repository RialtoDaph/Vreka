"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { TYPE_META, type MemoryMapData, type MemoryNodeType } from "@/lib/memoryMap";
import { useVoiceAssistant, type VoicePhase } from "@/lib/assistant/useVoiceAssistant";
import { THEME } from "@/lib/theme";
import SignOutButton from "@/components/SignOutButton";

type Props = {
  data: MemoryMapData;
};

type FilterId = MemoryNodeType | "all";

type SceneApi = {
  fitView: () => void;
};

const FILTERS: { id: FilterId; label: string; dot: string }[] = [
  { id: "all", label: "Semua", dot: THEME.neutral400 },
  { id: "task", label: "Kerjaan", dot: TYPE_META.task.color },
  { id: "finance", label: "Keuangan", dot: TYPE_META.finance.color },
  { id: "note", label: "Pelajaran", dot: TYPE_META.note.color },
  { id: "event", label: "Kalender", dot: TYPE_META.event.color },
  { id: "journal", label: "Jurnal", dot: TYPE_META.journal.color },
  { id: "contact", label: "Kontak", dot: TYPE_META.contact.color },
];

const INITIAL_ORBIT = { theta: 0.6, phi: 1.15, radius: 320 };

const NAV = [
  { href: "/dashboard/keuangan", label: "Keuangan", icon: "⌬" },
  { href: "/dashboard/kerjaan", label: "Kerjaan", icon: "▤" },
  { href: "/dashboard/pelajaran", label: "Pelajaran", icon: "◎" },
  { href: "/dashboard/kalender", label: "Kalender", icon: "▦" },
  { href: "/dashboard/jurnal", label: "Jurnal", icon: "✎" },
  { href: "/dashboard/asisten", label: "Aslan", icon: "✦" },
];

const VOICE_PHASE_STYLE: Record<VoicePhase, { color: string; label: string }> = {
  idle: { color: THEME.cyanGlow, label: "Online" },
  listening: { color: THEME.mintGlow, label: "Lagi dengerin..." },
  processing: { color: THEME.amberGlow, label: "Mikir..." },
  speaking: { color: THEME.mintGlow, label: "Ngomong..." },
  error: { color: THEME.roseGlow, label: "Error" },
};

export default function MemoryMap({ data }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  // Respects prefers-reduced-motion for the initial auto-spin state -- the
  // user can still turn it back on manually via the "Auto-spin" toggle.
  const [spin, setSpin] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [chatDraft, setChatDraft] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [webglError, setWebglError] = useState(false);

  const { phase: voicePhase, toggle: toggleVoice, sendText, audioRef } = useVoiceAssistant();
  const voiceStyle = VOICE_PHASE_STYLE[voicePhase];
  const voiceBusy = voicePhase !== "idle" && voicePhase !== "error";

  function submitChat(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = chatDraft.trim();
    if (!trimmed || voiceBusy) return;
    sendText(trimmed);
    setChatDraft("");
  }

  // Read by the render loop without forcing the mount effect to depend on
  // (and rebuild the whole three.js scene for) every keystroke/toggle.
  const selectedIdRef = useRef(selectedId);
  const searchQueryRef = useRef(searchQuery);
  const activeFilterRef = useRef(activeFilter);
  const spinRef = useRef(spin);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);
  useEffect(() => {
    activeFilterRef.current = activeFilter;
  }, [activeFilter]);
  useEffect(() => {
    spinRef.current = spin;
  }, [spin]);

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

    function isVisible(id: string): boolean {
      const n = byId[id];
      const q = searchQueryRef.current.trim().toLowerCase();
      const f = activeFilterRef.current;
      return (f === "all" || n.type === f) && (!q || n.label.toLowerCase().includes(q));
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
        if (a && b) {
          edgePositions[i] = a.x;
          edgePositions[i + 1] = a.y;
          edgePositions[i + 2] = a.z;
          edgePositions[i + 3] = b.x;
          edgePositions[i + 4] = b.y;
          edgePositions[i + 5] = b.z;
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
        const dimEdge = focus ? !(focus.has(aId) && focus.has(bId)) : false;
        (fp.material as THREE.MeshBasicMaterial).opacity = dimEdge ? 0.03 : 0.35;
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

    function fitView() {
      orbit.theta = INITIAL_ORBIT.theta;
      orbit.phi = INITIAL_ORBIT.phi;
      orbit.radius = INITIAL_ORBIT.radius;
      applyCamera();
    }
    sceneApiRef.current = { fitView };

    let raf = 0;
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
      if (!dragging) pickNode(false);
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

      <div className="absolute top-5 left-5 z-[2] w-[230px]">
        <button
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label="Buka menu navigasi"
          className="flex items-center gap-2 mb-3.5 bg-transparent border-none cursor-pointer p-0 text-left"
        >
          <span className="w-[26px] h-[26px] rounded-full border-2 border-cyan-glow/50 flex items-center justify-center shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-glow pulse-dot" />
          </span>
          <div>
            <p className="font-display font-bold tracking-[0.1em] text-white text-sm leading-tight m-0 flex items-center gap-1.5">
              ASLAN
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
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono uppercase tracking-wider text-slate-300 hover:text-cyan-glow hover:bg-panel2 transition-colors border-b border-line/60"
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
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
          className="w-full box-border bg-panel/75 border border-line text-slate-200 font-mono text-xs px-3 py-2.5 rounded-lg outline-none backdrop-blur-sm focus-visible:outline-cyan-glow"
        />
      </div>

      {!webglError && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-2">
          <button
            onClick={() => sceneApiRef.current?.fitView()}
            className="flex items-center gap-1.5 bg-panel/75 border border-line text-slate-300 font-mono text-[11px] px-3.5 py-2 rounded-full backdrop-blur-sm hover:border-cyan-glow/40"
          >
            ⊙ Fit
          </button>
          <button
            onClick={() => setSpin((s) => !s)}
            className={`flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] px-3.5 py-2 rounded-full backdrop-blur-sm border ${
              spin
                ? "bg-cyan-glow/10 border-cyan-glow/50 text-cyan-glow"
                : "bg-panel/75 border-line text-slate-300"
            }`}
          >
            ◍ {spin ? "Auto-spin" : "Diam"}
          </button>
        </div>
      )}

      {!webglError && (
        <div className="absolute top-5 right-5 z-[2] text-right">
          <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate-400 mb-2">
            Filter
          </p>
          <div className="flex flex-col gap-1.5 items-end">
            {FILTERS.map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className="flex items-center gap-1.5 bg-transparent border-none py-0.5 font-mono text-xs"
                  style={{ color: active ? THEME.cyanGlow : THEME.neutral400 }}
                >
                  {f.label}
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.dot }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="absolute top-0 right-0 bottom-0 w-[300px] bg-panel/90 border-l border-line backdrop-blur-[10px] p-5 z-[3] overflow-y-auto">
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
      </div>

      <form
        onSubmit={submitChat}
        className="absolute bottom-5 left-5 right-5 z-[2] flex items-center gap-2.5 max-w-[900px] mx-auto"
      >
        <input
          value={chatDraft}
          onChange={(e) => setChatDraft(e.target.value)}
          disabled={voiceBusy}
          placeholder="Tanya Aslan sesuatu..."
          className="flex-1 bg-panel/85 border border-line text-slate-200 font-mono text-[13px] px-[18px] py-3.5 rounded-full outline-none backdrop-blur-[10px] disabled:opacity-60 focus-visible:outline-cyan-glow"
        />
        <button
          type="submit"
          disabled={voiceBusy || !chatDraft.trim()}
          className="w-11 h-11 shrink-0 rounded-full border border-line bg-panel/85 text-cyan-glow backdrop-blur-[10px] disabled:opacity-60"
        >
          ➤
        </button>
      </form>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
