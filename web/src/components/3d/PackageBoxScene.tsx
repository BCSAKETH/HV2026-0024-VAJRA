"use client";

import { ContactShadows, Float } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";

import { createQrTexture } from "./qrTexture";
import { createCardboardBumpTexture } from "./cardboardTexture";

type Variant = "idle" | "scroll" | "compact";

export interface PackageBoxSceneProps {
  variant?: Variant;
  /** 0 (closed) -> 1 (fully open). Only used when variant="scroll". Driven by the caller (ScrollTrigger, IntersectionObserver, etc.) — this component stays dumb about *why* it's opening. */
  openProgress?: number;
  accentColor?: string;
  interactive?: boolean;
  className?: string;
  height?: number | string;
}

const INK = "#20262B";
const PAPER = "#F6F3EC";

function Lid({ openProgress }: { openProgress: number }) {
  const eased = 1 - Math.pow(1 - openProgress, 3); // ease-out cubic
  const bumpMap = useMemo(() => createCardboardBumpTexture(), []);
  return (
    <group position={[0, 0.5, -0.6]} rotation={[-eased * 2.1, 0, 0]}>
      <mesh position={[0, 0, 0.6]} castShadow>
        <boxGeometry args={[1.62, 0.05, 1.22]} />
        <meshStandardMaterial color={PAPER} roughness={0.85} bumpMap={bumpMap} bumpScale={0.015} />
      </mesh>
      <lineSegments position={[0, 0, 0.6]}>
        <edgesGeometry args={[new THREE.BoxGeometry(1.62, 0.05, 1.22)]} />
        <lineBasicMaterial color={INK} transparent opacity={0.35} />
      </lineSegments>
    </group>
  );
}

function GlowDot({ accentColor, openProgress }: { accentColor: string; openProgress: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = 0.55 + openProgress * 1.1 + Math.sin(t * 1.6) * 0.04;
  });
  if (openProgress < 0.05) return null;
  return (
    <mesh ref={ref} position={[0, 0.55, 0]}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshBasicMaterial color={accentColor} toneMapped={false} transparent opacity={Math.min(1, openProgress * 1.4)} />
    </mesh>
  );
}

function BoxGroup({ variant, openProgress, accentColor }: { variant: Variant; openProgress: number; accentColor: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const qrTexture = useMemo(() => createQrTexture(accentColor, INK, PAPER), [accentColor]);
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1.6, 1, 1.2), []);
  // Corrugated-fluting bump map — pure relief, no color change, so the box
  // still reads as the same PAPER cream from a distance but actually
  // catches the directional light like a real cardboard surface up close
  // ("add more details like matter" — this is the material getting real
  // substance instead of a flat plastic-smooth primitive).
  const bumpMap = useMemo(() => createCardboardBumpTexture(), []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (variant === "idle" || variant === "compact") {
      groupRef.current.rotation.y += delta * 0.18;
    } else if (variant === "scroll") {
      // settle toward a fixed 3/4 view as it opens, rather than spinning
      const target = -0.6 + openProgress * 0.9;
      groupRef.current.rotation.y += (target - groupRef.current.rotation.y) * Math.min(1, delta * 3);
    }
  });

  return (
    <group ref={groupRef} rotation={[0.12, -0.6, 0]}>
      <mesh castShadow receiveShadow geometry={boxGeo}>
        <meshStandardMaterial color={PAPER} roughness={0.9} bumpMap={bumpMap} bumpScale={0.015} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[boxGeo]} />
        <lineBasicMaterial color={INK} transparent opacity={0.4} />
      </lineSegments>
      {/* QR decal on the front face */}
      <mesh position={[0, -0.08, 0.601]}>
        <planeGeometry args={[0.62, 0.62]} />
        <meshBasicMaterial map={qrTexture} toneMapped={false} />
      </mesh>
      {/* Packing tape — a real physical detail (nothing on a real shipped
          box is a perfect flat primitive): a slightly glossier strip
          running front-to-back across the top seam, plus a short matching
          strip down the front edge. Kept off the QR decal's face area on
          purpose. Belongs to the box body (not Lid), so it reads fine in
          both idle and scroll variants without fighting the open
          animation. */}
      <mesh position={[0, 0.505, 0]} castShadow>
        <boxGeometry args={[0.2, 0.01, 1.22]} />
        <meshStandardMaterial color="#D9C7A3" roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.46, 0.605]} castShadow>
        <boxGeometry args={[0.2, 0.08, 0.01]} />
        <meshStandardMaterial color="#D9C7A3" roughness={0.35} />
      </mesh>
      {variant === "scroll" && <Lid openProgress={openProgress} />}
      {variant === "scroll" && <GlowDot accentColor={accentColor} openProgress={openProgress} />}
    </group>
  );
}

/** Procedural, flat-shaded courier figure — confirmed direction was "reads
 * as a simplified mascot, not an illustrated character" (no sprite art, no
 * rigged/animated model, zero external assets — same reasoning as the box
 * itself). Purely additive: doesn't read or touch BoxGroup/Lid/GlowDot at
 * all, so it can't regress anything already shipped. A gentle idle bob is
 * its only animation — no walk cycle, matching the earlier-agreed "v1
 * doesn't need one, a stationary figure reads fine" call. */
function CourierFigure() {
  // Legs are a 0.36-tall box centered at local y=0.12, scaled by 0.62 —
  // their bottom edge sits at (0.12 - 0.18) * 0.62 ≈ -0.037 relative to
  // this group's own origin. ContactShadows (the floor plane) is at
  // y=-0.62, so the group itself needs to sit at -0.62 - (-0.037) ≈ -0.583
  // for the feet to actually touch the ground instead of floating above it.
  const GROUND_Y = -0.583;
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = GROUND_Y + Math.sin(clock.getElapsedTime() * 1.1) * 0.025;
  });

  return (
    <group ref={groupRef} position={[0.95, GROUND_Y, -0.3]} rotation={[0, -0.3, 0]} scale={0.62}>
      {/* head */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <sphereGeometry args={[0.22, 20, 20]} />
        <meshStandardMaterial color="#E0B98A" roughness={0.85} />
      </mesh>
      {/* body */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.44, 0.62, 0.28]} />
        <meshStandardMaterial color="#6B8F71" roughness={0.9} />
      </mesh>
      {/* legs */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.4, 0.36, 0.26]} />
        <meshStandardMaterial color="#172B3A" roughness={0.9} />
      </mesh>
      {/* Arm, attached at the shoulder. Confirmed from a real screenshot:
          the previous position (x=-0.3, well past the body's own 0.22
          half-width) floated visibly detached from the body — at this
          scale/angle it read as an unrelated dark diamond next to the
          figure, not a limb. Pulled in to actually meet the body edge,
          shortened, and rotated less aggressively so it stays a clearly-
          attached small gesture rather than a separate floating shape. */}
      <mesh position={[-0.24, 0.8, 0.06]} rotation={[0, 0, 0.35]} castShadow>
        <boxGeometry args={[0.26, 0.11, 0.11]} />
        <meshStandardMaterial color="#6B8F71" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Procedural delivery truck — same rule as everything else in this scene:
 * flat-shaded primitives, zero external assets. Cargo box + cab + 4 wheels,
 * LOCUS's own orange (matches the brand's real "warehouse action" accent,
 * not copied from any reference image's arbitrary color). Positioned in
 * the background, well behind and smaller than the actual box, so it
 * reads as scene detail — the box stays the one thing the eye lands on. */
const TRUCK_BASE_ROTATION_Y = 0.45;

function DeliveryTruck() {
  const GROUND_Y = -0.62; // sits directly on the same floor plane as ContactShadows
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y = GROUND_Y + Math.sin(t * 0.8 + 2) * 0.02;
    // A slow idle sway around its base orientation — enough to read as
    // "alive" (subtly rocking, like a parked vehicle's suspension) without
    // looking like it's actually driving anywhere.
    groupRef.current.rotation.y = TRUCK_BASE_ROTATION_Y + Math.sin(t * 0.5) * 0.025;
  });

  const wheelPositions: [number, number, number][] = [
    [-0.55, 0.16, 0.32],
    [-0.55, 0.16, -0.32],
    [0.35, 0.16, 0.32],
    [0.35, 0.16, -0.32],
  ];

  return (
    <group ref={groupRef} position={[-1.1, GROUND_Y, 0.1]} rotation={[0, TRUCK_BASE_ROTATION_Y, 0]} scale={0.44}>
      {/* cargo box */}
      <mesh position={[-0.15, 0.55, 0]} castShadow>
        <boxGeometry args={[1.1, 0.72, 0.68]} />
        <meshStandardMaterial color="#E76F2F" roughness={0.85} />
      </mesh>
      {/* cab */}
      <mesh position={[0.62, 0.42, 0]} castShadow>
        <boxGeometry args={[0.5, 0.46, 0.62]} />
        <meshStandardMaterial color="#E76F2F" roughness={0.85} />
      </mesh>
      {/* windshield */}
      <mesh position={[0.84, 0.5, 0]} rotation={[0, 0, -0.35]}>
        <boxGeometry args={[0.05, 0.28, 0.5]} />
        <meshStandardMaterial color="#172B3A" roughness={0.6} />
      </mesh>
      {/* wheels */}
      {wheelPositions.map((pos, i) => (
        <mesh key={i} position={pos} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.1, 16]} />
          <meshStandardMaterial color="#20262B" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// Small floating package cluster — the recurring motif across every
// reference sheet you sent (the van blueprint, the mobile asset sheet).
// Same procedural/flat-shaded rule as the box and the courier: primitives
// only, zero external assets. Each one is a tiny plain cube (no QR decal,
// no edges lines) so they read as background detail, not competing focal
// points with the real box.
// Pulled inward from the original ±1.5 spread — confirmed from real
// screenshots that the truck and courier (also pulled in below) were
// getting cropped by the canvas edge on narrower container aspect ratios,
// since their world positions never accounted for anything but the widest
// case. Keeping the whole prop cluster within roughly ±1.1 of center gives
// enough margin to stay fully on-screen down to a ~4:5 container.
const MINI_BOX_LAYOUT: Array<{ pos: [number, number, number]; scale: number; rotY: number; speed: number }> = [
  { pos: [-1.05, 0.55, -0.5], scale: 0.22, rotY: 0.4, speed: 1.3 },
  { pos: [-0.85, -0.15, 0.55], scale: 0.16, rotY: -0.6, speed: 1.7 },
  { pos: [1.05, 0.85, 0.2], scale: 0.19, rotY: 0.9, speed: 1.1 },
  { pos: [0.15, 1.15, -0.9], scale: 0.14, rotY: -0.3, speed: 1.9 },
];

function MiniBox({ pos, scale, rotY, speed }: { pos: [number, number, number]; scale: number; rotY: number; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = pos[1] + Math.sin(t * speed + phase) * 0.07;
    ref.current.rotation.y = rotY + t * 0.15;
  });
  return (
    <mesh ref={ref} position={pos} scale={scale} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#DCB78C" roughness={0.9} />
    </mesh>
  );
}

function FloatingPackages() {
  return (
    <>
      {MINI_BOX_LAYOUT.map((box, i) => (
        <MiniBox key={i} {...box} />
      ))}
    </>
  );
}

function useWebglSupport() {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setSupported(!!gl);
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const listener = () => setReduced(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/** Static 2D fallback — used when WebGL is unavailable, or as the poster
 * frame while the canvas mounts. Keeps the same silhouette so there's no
 * layout jump once the real scene takes over. */
function StaticBoxFallback({ accentColor }: { accentColor: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="relative flex h-40 w-52 items-center justify-center rounded-md border"
        style={{ borderColor: `${INK}33`, background: PAPER, boxShadow: `0 0 40px -10px ${accentColor}55` }}
      >
        <span className="font-mono text-xs uppercase tracking-[0.2em]" style={{ color: `${INK}80` }}>
          LOCUS
        </span>
      </div>
    </div>
  );
}

/**
 * The one shared 3D asset reused across landing / login / track — see
 * `Scene3D` in the UML reference doc. Everything here is procedural
 * (no imported .glb), so there's no asset-loading risk and it re-themes
 * for free by prop.
 */
export function PackageBoxScene({
  variant = "idle",
  openProgress = 0,
  accentColor = "#4F46E5",
  className,
  height = "100%",
}: PackageBoxSceneProps) {
  const webgl = useWebglSupport();
  const reducedMotion = usePrefersReducedMotion();

  if (webgl === false) {
    return (
      <div className={className} style={{ height }}>
        <StaticBoxFallback accentColor={accentColor} />
      </div>
    );
  }

  const effectiveVariant: Variant = reducedMotion && variant !== "compact" ? "compact" : variant;

  return (
    <div className={className} style={{ height }}>
      <Suspense fallback={<StaticBoxFallback accentColor={accentColor} />}>
        <Canvas
          shadows
          dpr={[1, 1.5]}
          // Pulled back slightly (was [2.6,1.6,3.2] / fov 38) — confirmed
          // from real screenshots that the truck and courier were getting
          // clipped by the canvas edge on the container's actual (often
          // taller-than-wide) aspect ratio. Combined with pulling those
          // props inward above, this keeps the whole scene on-screen with
          // real margin while the box itself loses only a few percent of
          // its apparent size.
          camera={{ position: [2.85, 1.75, 3.55], fov: 35 }}
          gl={{ antialias: true, alpha: true }}
        >
          {/* The accent point light was intensity=12, inherited from the
              orphaned branch this component was ported from, never tuned
              against this actual running scene — exactly the risk this
              file's own docs warned about. Confirmed from a real
              screenshot: it was overpowering the box's PAPER material,
              washing the intended warm cream color toward a cool gray.
              Pulled way down so it reads as a subtle accent rim light
              instead of the dominant light source. */}
          <ambientLight intensity={0.75} />
          <directionalLight position={[3, 4, 2]} intensity={1.05} castShadow />
          <pointLight position={[-2.5, 1, -2]} intensity={2.2} color={accentColor} />

          <Float speed={reducedMotion ? 0 : 1.4} rotationIntensity={reducedMotion ? 0 : 0.15} floatIntensity={reducedMotion ? 0 : 0.5}>
            <BoxGroup variant={effectiveVariant} openProgress={reducedMotion ? 1 : openProgress} accentColor={accentColor} />
          </Float>
          <CourierFigure />
          <DeliveryTruck />
          <FloatingPackages />

          <ContactShadows position={[0, -0.62, 0]} opacity={0.35} scale={4} blur={2.4} far={2} />
        </Canvas>
      </Suspense>
    </div>
  );
}
