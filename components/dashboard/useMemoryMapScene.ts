import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import { type MemoryMapData, type MemoryNodeType } from "@/lib/memoryMap";
import { THEME } from "@/lib/theme";

export type SceneApi = {
  fitView: () => void;
  focusOnNode: (id: string) => void;
};

const INITIAL_ORBIT = { theta: 0.6, phi: 1.15, radius: 320 };

type Args = {
  data: MemoryMapData;
  stageRef: RefObject<HTMLDivElement | null>;
  labelLayerRef: RefObject<HTMLDivElement | null>;
  sceneApiRef: RefObject<SceneApi | null>;
  // Read by the render loop without forcing this effect to depend on (and
  // rebuild the whole scene for) every keystroke/toggle -- the caller keeps
  // these refs in sync with the corresponding state.
  selectedIdRef: RefObject<string | null>;
  searchQueryRef: RefObject<string>;
  activeTypesRef: RefObject<Set<MemoryNodeType>>;
  spinRef: RefObject<boolean>;
  setWebglError: (v: boolean) => void;
  setSelectedId: (id: string | null) => void;
};

// Owns the entire Three.js scene lifecycle for the Memory Map: building the
// node/edge/flow-particle meshes from `data`, the physics simulation, the
// orbit camera, pointer/wheel input, the render loop, and teardown. Kept as
// one imperative effect (rather than split further) because nearly
// everything inside -- the scene graph, physics state, camera, raycaster --
// is local mutable state private to a single WebGL lifecycle; splitting it
// across files would mean threading all of that back out through refs for
// no real separation-of-concerns benefit. What this hook DOES buy over
// having the effect live directly in the MemoryMap component: the 3D
// engine is testable/reasoned-about independently of the ~450 lines of
// surrounding page chrome (nav, search, voice orb, insight panel, etc).
export function useMemoryMapScene({
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
}: Args) {
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
}
