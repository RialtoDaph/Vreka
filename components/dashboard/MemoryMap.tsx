"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { MemoryMapData } from "@/lib/memoryMap";

type Props = {
  data: MemoryMapData;
};

type SceneApi = {
  applySelection: (id: string | null) => void;
};

export default function MemoryMap({ data }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const labelLayer = labelLayerRef.current;
    if (!stage || !labelLayer) return;

    const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
    const rect = stage.getBoundingClientRect();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 1, 2000);
    const orbit = { theta: 0.6, phi: 1.15, radius: 320 };
    function applyCamera() {
      camera.position.set(
        orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.radius * Math.cos(orbit.phi),
        orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
      );
      camera.lookAt(0, 0, 0);
    }
    applyCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(rect.width, rect.height);
    renderer.setClearColor(0x05080d, 0);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.cursor = "pointer";
    stage.insertBefore(renderer.domElement, stage.firstChild);

    const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    const meshes: Record<string, THREE.Mesh> = {};
    const glows: Record<string, THREE.Mesh> = {};
    const labels: Record<string, HTMLDivElement> = {};

    for (const n of data.nodes) {
      const col = new THREE.Color(n.color);

      const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: col }));
      mesh.position.set(n.x, n.y, n.z);
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
      glow.position.set(n.x, n.y, n.z);
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
    let ei = 0;
    for (const [aId, bId] of data.edges) {
      const a = byId[aId];
      const b = byId[bId];
      if (a && b) {
        edgePositions[ei] = a.x;
        edgePositions[ei + 1] = a.y;
        edgePositions[ei + 2] = a.z;
        edgePositions[ei + 3] = b.x;
        edgePositions[ei + 4] = b.y;
        edgePositions[ei + 5] = b.z;
      }
      ei += 6;
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    const edgeLines = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: 0x4be8ff, transparent: true, opacity: 0.28 })
    );
    scene.add(edgeLines);

    function projectLabels(selId: string | null) {
      const r = renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector3();
      for (const n of data.nodes) {
        const div = labels[n.id];
        v.set(n.x, n.y + n.r + 6, n.z).project(camera);
        const behind = v.z > 1;
        const x = (v.x * 0.5 + 0.5) * r.width;
        const y = (-v.y * 0.5 + 0.5) * r.height;
        div.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
        const show = !behind && (n.type === "hub" || n.id === selId);
        div.style.opacity = show ? "1" : "0";
      }
    }

    function applySelection(selId: string | null) {
      for (const n of data.nodes) {
        const isSel = selId === n.id;
        const scale = n.r * (isSel ? 1.25 : 1);
        meshes[n.id].scale.setScalar(scale);
        glows[n.id].scale.setScalar(scale * (isSel ? 2.9 : 2.2));
        (glows[n.id].material as THREE.MeshBasicMaterial).opacity = isSel ? 0.3 : 0.16;
      }
      renderer.render(scene, camera);
      projectLabels(selId);
    }
    applySelection(null);
    sceneApiRef.current = { applySelection };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function onClick(e: MouseEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Object.values(meshes), false);
      setSelectedId(hits.length ? (hits[0].object.userData.id as string) : null);
    }
    renderer.domElement.addEventListener("click", onClick);

    function onResize() {
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      renderer.setSize(r.width, r.height);
      applySelection(selectedIdRef.current);
    }
    window.addEventListener("resize", onResize);

    return () => {
      renderer.domElement.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      sceneApiRef.current = null;
      renderer.dispose();
      sphereGeo.dispose();
      edgeGeo.dispose();
      for (const id of Object.keys(meshes)) {
        (meshes[id].material as THREE.Material).dispose();
        (glows[id].material as THREE.Material).dispose();
      }
      labelLayer.innerHTML = "";
      if (renderer.domElement.parentElement === stage) {
        stage.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    sceneApiRef.current?.applySelection(selectedId);
  }, [selectedId]);

  const selectedNode = selectedId ? data.nodes.find((n) => n.id === selectedId) ?? null : null;
  const linkCount = selectedId
    ? data.edges.filter(([a, b]) => a === selectedId || b === selectedId).length
    : 0;

  return (
    // Interim height while this still sits inside the sidebar layout (Phase 1-3).
    // Phase 4 makes this true full-viewport once the chrome-less route lands.
    <div className="relative h-[75vh] min-h-[520px] rounded-md border border-line bg-void overflow-hidden">
      <div ref={stageRef} className="absolute inset-0">
        <div ref={labelLayerRef} className="absolute inset-0 pointer-events-none z-[1]" />
      </div>

      <div className="absolute top-5 left-5 z-[2] w-[230px]">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-full border-2 border-cyan-glow/50 flex items-center justify-center shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-glow pulse-dot" />
          </span>
          <div>
            <p className="font-display font-bold tracking-[0.1em] text-white text-sm leading-tight m-0">
              ASLAN
            </p>
            <p className="font-mono text-[8px] tracking-[0.15em] text-slate-500 m-0">
              {data.nodes.length} memori · {data.edges.length} koneksi
            </p>
          </div>
        </div>
      </div>

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
              className="bg-transparent border-none text-slate-500 text-base leading-none cursor-pointer"
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
                <span className="text-[11.5px] text-slate-500">{f.k}</span>
                <span className="text-[12.5px] text-slate-300 text-right">{f.v}</span>
              </div>
            ))}
          </div>
          <p className="font-mono text-[10px] text-slate-600 mt-4">{linkCount} koneksi</p>
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
        <div className="relative w-[150px] h-[150px] rounded-full flex items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-cyan-glow/55 spin-slow-fwd" />
          <span className="absolute inset-3.5 rounded-full border border-dashed border-cyan-glow/30 spin-slow-rev" />
          <span className="absolute inset-0 rounded-full voice-dial-ring" />
          <span className="relative font-display font-bold tracking-[0.15em] text-[15px] text-cyan-glow">
            A.S.L.A.N
          </span>
        </div>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-cyan-glow flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow pulse-dot" />
          Online
        </p>
      </div>

      <div className="absolute bottom-5 left-5 right-5 z-[2] flex items-center gap-2.5 max-w-[900px] mx-auto">
        <input
          disabled
          placeholder="Tanya Aslan sesuatu..."
          className="flex-1 bg-panel/85 border border-line text-slate-200 font-mono text-[13px] px-[18px] py-3.5 rounded-full outline-none backdrop-blur-[10px] disabled:opacity-60"
        />
        <button
          disabled
          className="w-11 h-11 shrink-0 rounded-full border border-line bg-panel/85 text-cyan-glow backdrop-blur-[10px] disabled:opacity-60"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
