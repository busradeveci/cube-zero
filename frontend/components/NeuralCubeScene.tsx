"use client";

/**
 * NeuralCubeScene — transparent-background Three.js neural cube.
 *
 * Transparency strategy
 * ─────────────────────
 * • gl={{ alpha: true }} + setClearColor(0,0,0,0) → WebGL writes RGBA=0 to
 *   empty pixels, so the page's #261f38 body colour shows through everywhere
 *   no geometry is drawn — zero "box" effect.
 *
 * • EffectComposer / postprocessing Bloom is intentionally ABSENT.
 *   Screen-space postprocessing pipelines render to an internal opaque
 *   framebuffer that destroys the alpha channel.  Glow is achieved instead
 *   via high emissiveIntensity + ACESFilmic tonemapping + a double-torus
 *   "halo ring" technique (inner sharp ring + outer soft transparent halo).
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
const NODE_R     = 0.028;          // slightly larger nodes for better visibility
const RING_R     = 1.52;
const RING_TUBE  = 0.012;          // medium thickness neon ring
const RING_TILT  = Math.PI * 0.13; // ~23°
const ACCENT     = new THREE.Color("#FF6B00"); // vivid orange
const WHITE      = new THREE.Color("#ffffff");
const EDGE_OPACITY = 0.38;         // brighter edges

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
const AR = 1.0, AG = 0.420, AB = 0.0; // #FF6B00 linearised
const _col = new THREE.Color();

// ─── Sub-components ───────────────────────────────────────────────────────────

function NodeMesh() {
  const mesh = useMemo(() => {
    const geo = new THREE.SphereGeometry(NODE_R, 7, 7);
    const mat = new THREE.MeshStandardMaterial({
      color: ACCENT,
      emissive: ACCENT,
      emissiveIntensity: 5.0,   // high HDR value for tonemapped glow
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

  // "Breathing" — opacity gently pulses between 0.15 and 0.42
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
      blending: THREE.AdditiveBlending, // additive — particles glow over each other
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }, []);
  return <primitive object={points} />;
}

/**
 * Ring — double-torus "fake bloom" technique.
 * Y-rotation is now handled by the parent cubeRef group so Ring and Cube
 * orbit together. Only emissive intensity is animated here.
 */
function Ring() {
  const { innerTorus, haloTorus, innerMat } = useMemo(() => {
    const sharpGeo = new THREE.TorusGeometry(RING_R, RING_TUBE, 20, 280);
    const innerMat = new THREE.MeshStandardMaterial({
      color: WHITE,
      emissive: WHITE,
      emissiveIntensity: 16,
      roughness: 0.0,
      metalness: 0.0,
    });
    const inner = new THREE.Mesh(sharpGeo, innerMat);
    inner.rotation.x = RING_TILT;

    const haloGeo = new THREE.TorusGeometry(RING_R, 0.052, 14, 220);
    const haloMat = new THREE.MeshBasicMaterial({
      color: WHITE,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = RING_TILT;

    return { innerTorus: inner, haloTorus: halo, innerMat };
  }, []);

  // Pulse emissive only — Y rotation comes from parent cubeRef
  useFrame(({ clock }) => {
    innerMat.emissiveIntensity = 12 + 8 * Math.abs(Math.sin(clock.elapsedTime * 0.55));
  });

  return (
    <>
      <primitive object={innerTorus} />
      <primitive object={haloTorus} />
    </>
  );
}

function Scene() {
  const floatRef = useRef<THREE.Group>(null!);
  const cubeRef  = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    floatRef.current.position.y = Math.sin(t * 0.44) * 0.10;
    // Cube AND Ring rotate together at the same Y speed
    cubeRef.current.rotation.y  = t * 0.22;
  });

  return (
    <>
      <ambientLight intensity={0.10} color="#1a0a00" />

      <group ref={floatRef} position={[0.45, 0, 0]}>
        {/* Ring is INSIDE cubeRef — they share the same Y rotation */}
        <group ref={cubeRef}>
          <NodeMesh />
          <EdgeLines />
          <Sparks />
          <Ring />
        </group>

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
        alpha: true,                  // RGBA framebuffer
        powerPreference: "high-performance",
      }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", background: "transparent" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0); // alpha = 0 → fully transparent clear
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      {/* No <color> tag — background is intentionally transparent */}
      <Scene />
    </Canvas>
  );
}
