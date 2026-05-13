"use client";

/**
 * NeuralCubeScene — transparent-background Three.js neural cube.
 *
 * Transparency strategy
 * ─────────────────────
 * • gl={{ alpha: true }} + setClearColor(0,0,0,0) → WebGL writes RGBA=0 to
 *   empty pixels, so the page's body colour shows through everywhere
 *   no geometry is drawn — zero "box" effect.
 *
 * • EffectComposer / postprocessing Bloom is intentionally ABSENT.
 *   Screen-space postprocessing pipelines render to an internal opaque
 *   framebuffer that destroys the alpha channel.  Glow is achieved instead
 *   via high emissiveIntensity + ACESFilmic tonemapping + ring system.
 *
 * • MeshReflectorMaterial floor is intentionally ABSENT.
 *   It renders as a large opaque rectangle, defeating transparency.
 *   A subtle translucent shadow plane replaces it.
 */

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── Scene constants ──────────────────────────────────────────────────────────
const HALF       = 0.92;
const NODE_COUNT = 260;
const KNN        = 6;
const NODE_R     = 0.028;
const RING_R     = 1.52;   // kept for point-light position in Scene
const ACCENT     = new THREE.Color("#FF6B00");
const WHITE      = new THREE.Color("#ffffff");
const EDGE_OPACITY = 0.38;

// ─── Geometry precomputation (module-level — runs once) ───────────────────────

function generateNodes(): THREE.Vector3[] {
  const s = HALF;
  const pts: THREE.Vector3[] = [];
  for (const x of [-s, s])
    for (const y of [-s, s])
      for (const z of [-s, s])
        pts.push(new THREE.Vector3(x, y, z));

  const edgePairs: [[number,number,number],[number,number,number]][] = [
    [[-s,-s,-s],[s,-s,-s]], [[-s,s,-s],[s,s,-s]],
    [[-s,-s,s],[s,-s,s]],   [[-s,s,s],[s,s,s]],
    [[-s,-s,-s],[-s,s,-s]], [[s,-s,-s],[s,s,-s]],
    [[-s,-s,s],[-s,s,s]],   [[s,-s,s],[s,s,s]],
    [[-s,-s,-s],[-s,-s,s]], [[s,-s,-s],[s,-s,s]],
    [[-s,s,-s],[-s,s,s]],   [[s,s,-s],[s,s,s]],
  ];
  for (const [a, b] of edgePairs)
    for (let t = 0.12; t < 1; t += 0.19)
      pts.push(new THREE.Vector3(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ));

  while (pts.length < NODE_COUNT)
    pts.push(new THREE.Vector3(
      (Math.random() * 2 - 1) * s * 0.94,
      (Math.random() * 2 - 1) * s * 0.94,
      (Math.random() * 2 - 1) * s * 0.94,
    ));
  return pts.slice(0, NODE_COUNT);
}

function buildEdgeBuffer(nodes: THREE.Vector3[]): Float32Array {
  const seen = new Set<string>();
  const buf: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const sorted = nodes
      .map((p, j) => ({ j, d: j === i ? Infinity : nodes[i].distanceTo(p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, KNN);
    for (const { j } of sorted) {
      const key = `${Math.min(i, j)}_${Math.max(i, j)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      buf.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
    }
  }
  return new Float32Array(buf);
}

function buildSparkBuffer(count: number): Float32Array {
  const buf = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = HALF * (1.25 + Math.random() * 0.95);
    const θ = Math.random() * Math.PI * 2;
    const φ = Math.acos(2 * Math.random() - 1);
    buf[i * 3]     = r * Math.sin(φ) * Math.cos(θ);
    buf[i * 3 + 1] = r * Math.sin(φ) * Math.sin(θ) - 0.15;
    buf[i * 3 + 2] = r * Math.cos(φ);
  }
  return buf;
}

const NODES     = generateNodes();
const EDGE_BUF  = buildEdgeBuffer(NODES);
const SPARK_BUF = buildSparkBuffer(160);
const PHASES    = Float32Array.from({ length: NODE_COUNT }, () => Math.random() * Math.PI * 2);
const SPEEDS    = Float32Array.from({ length: NODE_COUNT }, () => 0.8 + Math.random() * 1.2);
const AR = 1.0, AG = 0.420, AB = 0.0;
const _col = new THREE.Color();

// ─── Sub-components ───────────────────────────────────────────────────────────

function NodeMesh() {
  const mesh = useMemo(() => {
    const geo = new THREE.SphereGeometry(NODE_R, 7, 7);
    const mat = new THREE.MeshStandardMaterial({
      color: ACCENT,
      emissive: ACCENT,
      emissiveIntensity: 5.0,
      roughness: 0.10,
      metalness: 0.0,
    });
    const im = new THREE.InstancedMesh(geo, mat, NODE_COUNT);
    const m4 = new THREE.Matrix4();
    NODES.forEach((pos, i) => { m4.setPosition(pos); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    return im;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < NODE_COUNT; i++) {
      const v = 0.55 + 0.45 * Math.sin(t * SPEEDS[i] + PHASES[i]);
      const f = 0.5 + 2.0 * v;
      _col.setRGB(AR * f, AG * f, AB * f);
      mesh.setColorAt(i, _col);
    }
    mesh.instanceColor!.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

function EdgeLines() {
  const { seg, mat } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(EDGE_BUF, 3));
    const mat = new THREE.LineBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: EDGE_OPACITY,
    });
    const seg = new THREE.LineSegments(geo, mat);
    seg.frustumCulled = false;
    return { seg, mat };
  }, []);

  useFrame(({ clock }) => {
    mat.opacity = 0.22 + 0.32 * Math.abs(Math.sin(clock.elapsedTime * 0.55));
  });

  return <primitive object={seg} />;
}

function Sparks() {
  const points = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(SPARK_BUF, 3));
    const mat = new THREE.PointsMaterial({
      color: ACCENT,
      size: 0.018,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }, []);
  return <primitive object={points} />;
}

// ─── Ring palette (module-level so it's stable across renders) ────────────────
const RING_PALETTE = [
  new THREE.Color("#f68c06"), // amber
  new THREE.Color("#ffd700"), // gold
  new THREE.Color("#4a9eff"), // teal blue
];
const SPARKLE_COUNT = 120;

/**
 * Ring — Saturn-style warm amber ring system with sparkle particles.
 *
 * mainRing   radius 2.0,  tube 0.022 — solid amber ring
 * innerRing  radius 1.75, tube 0.010 — golden brown inner trace
 * outerRing  radius 2.25, tube 0.055 — soft additive glow halo
 * sparkleMesh — 120 InstancedMesh spheres orbiting the ring path
 *               with per-frame flicker (8 random particles per frame)
 */
function Ring() {
  const sparkleGroupRef = useRef<THREE.Group>(null!);

  const { mainRing, innerRing, outerRing, sparkleMesh, sparkleBaseColors } =
    useMemo(() => {
      // ── Main ring ─────────────────────────────────────────────────────────
      const mainRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.0, 0.022, 128, 200),
        new THREE.MeshBasicMaterial({
          color:       new THREE.Color("#f68c06"),
          transparent: true,
          opacity:     0.85,
        }),
      );
      mainRing.rotation.x = Math.PI / 2;

      // ── Inner glow ring ───────────────────────────────────────────────────
      const innerRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.75, 0.010, 128, 180),
        new THREE.MeshBasicMaterial({
          color:       new THREE.Color("#bc8a3f"),
          transparent: true,
          opacity:     0.60,
        }),
      );
      innerRing.rotation.x = Math.PI / 2;

      // ── Outer soft halo ───────────────────────────────────────────────────
      const outerRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.25, 0.055, 128, 180),
        new THREE.MeshBasicMaterial({
          color:       new THREE.Color("#f68c06"),
          transparent: true,
          opacity:     0.08,
          depthWrite:  false,
          blending:    THREE.AdditiveBlending,
        }),
      );
      outerRing.rotation.x = Math.PI / 2;

      // ── Sparkle particles — InstancedMesh ─────────────────────────────────
      const sparkleMat = new THREE.MeshBasicMaterial({ color: WHITE });
      const sparkleGeo = new THREE.SphereGeometry(0.008, 6, 6);
      const sm         = new THREE.InstancedMesh(sparkleGeo, sparkleMat, SPARKLE_COUNT);
      sm.frustumCulled = false;

      // Store base colors so useFrame can restore them after flicker
      const sparkleBaseColors: THREE.Color[] = [];
      const m4 = new THREE.Matrix4();

      for (let i = 0; i < SPARKLE_COUNT; i++) {
        const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
        const r     = 1.85 + Math.random() * 0.35;
        const x     = Math.cos(angle) * r;
        const y     = (Math.random() - 0.5) * 0.15;
        const z     = Math.sin(angle) * r;
        m4.setPosition(x, y, z);
        sm.setMatrixAt(i, m4);

        const baseOpacity = 0.3 + Math.random() * 0.6;
        const base        = new THREE.Color(baseOpacity, baseOpacity, baseOpacity);
        sparkleBaseColors.push(base);
        sm.setColorAt(i, base);
      }
      sm.instanceMatrix.needsUpdate = true;
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true;

      return { mainRing, innerRing, outerRing, sparkleMesh: sm, sparkleBaseColors };
    }, []);

  // Reusable color object to avoid per-frame allocations
  const _flickerCol = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    // ── Ring Y-axis rotations ─────────────────────────────────────────────
    mainRing.rotation.y  += 0.003;
    innerRing.rotation.y += 0.004;
    outerRing.rotation.y += 0.002;

    // ── Sparkle group orbits with mainRing ────────────────────────────────
    sparkleGroupRef.current.rotation.y += 0.003;

    // ── Flicker: toggle 8 random particles each frame ─────────────────────
    for (let k = 0; k < 8; k++) {
      const idx           = Math.floor(Math.random() * SPARKLE_COUNT);
      const flickerScale  = Math.random() < 0.5 ? 0.2 : 1.0;
      _flickerCol.setRGB(flickerScale, flickerScale, flickerScale);
      sparkleMesh.setColorAt(idx, _flickerCol);
    }
    sparkleMesh.instanceColor!.needsUpdate = true;
  });

  // Keep sparkleBaseColors referenced so it isn't GC'd
  void sparkleBaseColors;

  return (
    <>
      <primitive object={mainRing}  />
      <primitive object={innerRing} />
      <primitive object={outerRing} />
      <group ref={sparkleGroupRef}>
        <primitive object={sparkleMesh} />
      </group>
    </>
  );
}

function Scene() {
  const floatRef = useRef<THREE.Group>(null!);
  const cubeRef  = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    floatRef.current.position.y = Math.sin(t * 0.44) * 0.10;
    cubeRef.current.rotation.y  = t * 0.22;
  });

  return (
    <>
      <ambientLight intensity={0.10} color="#1a0a00" />

      <group ref={floatRef} position={[0.45, 0, 0]}>
        {/* Cube rotates on Y */}
        <group ref={cubeRef}>
          <NodeMesh />
          <EdgeLines />
          <Sparks />
        </group>

        {/* Ring system — independent of cube rotation */}
        <Ring />

        {/* Vivid orange point lights */}
        <pointLight color="#FF6B00" intensity={14} distance={4.5} decay={2} />
        <pointLight color="#FF4400" intensity={7}  distance={3.5} decay={2} position={[0.5, 0.4, 0]} />
        <pointLight color="#FF6B00" intensity={5}  distance={3.0} decay={2} position={[-0.4, -0.4, 0.5]} />
        <pointLight color="#ffe8d0" intensity={4}  distance={2.8} decay={2} position={[RING_R * 0.7, 0.1, RING_R * 0.3]} />
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.45, -HALF - 0.15, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshBasicMaterial
          color="#FF6B00"
          transparent
          opacity={0.07}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

// ─── Canvas wrapper ───────────────────────────────────────────────────────────
export default function NeuralCubeScene() {
  return (
    <Canvas
      camera={{ position: [1.8, 1.4, 5.4], fov: 44 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", background: "transparent" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      <Scene />
    </Canvas>
  );
}
