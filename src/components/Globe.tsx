"use client";

import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";
import type { ArcData } from "@/lib/types";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { WORLD_MAP } from "@/lib/worldmap";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GlobeInstance = any;
type ThreeModule = typeof import("three");

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function createTextSprite(
  T: ThreeModule,
  text: string,
  color: THREE_NS.Color,
  sizeFactor: number = 1,
): { sprite: THREE_NS.Sprite; material: THREE_NS.SpriteMaterial; texture: THREE_NS.CanvasTexture } {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 512, 128);

  // Dark shadow for contrast
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Text in the arc's token color
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.font = "bold 56px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);

  const texture = new T.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new T.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  const sprite = new T.Sprite(material);
  const baseW = 18;
  const baseH = 4.5;
  sprite.scale.set(baseW * sizeFactor, baseH * sizeFactor, 1);

  return { sprite, material, texture };
}

interface DotPosition {
  lat: number;
  lng: number;
  x: number;
  y: number;
  z: number;
}

interface GlobeProps {
  arcs: ArcData[];
  onArcHover?: (arc: ArcData | null) => void;
  loop?: boolean;
  paused?: boolean;
  spawnInterval?: number;
  onSpawnProgress?: (index: number, total: number) => void;
  seekTo?: number | null;
}

// ── Custom Arc Types ──
interface LiveArc {
  mesh: THREE_NS.Mesh;
  material: THREE_NS.MeshBasicMaterial;
  allPoints: THREE_NS.Vector3[];
  growDuration: number;
  retreatDuration: number;
  age: number;
  destinationPoint: THREE_NS.Vector3;
  impactCreated: boolean;
  impactEffect: ImpactEffect | null;
  color: THREE_NS.Color;
  arcData: ArcData;
}

interface ImpactEffect {
  ring: THREE_NS.Mesh;
  ringMaterial: THREE_NS.MeshBasicMaterial;
  outerRing: THREE_NS.Mesh;
  outerRingMaterial: THREE_NS.MeshBasicMaterial;
  centerDot: THREE_NS.Mesh;
  centerDotMaterial: THREE_NS.MeshBasicMaterial;
  age: number;
  maxLife: number;
  position: THREE_NS.Vector3;
  isFadingOut: boolean;
  fadeStartTime: number;
  fadeDuration: number;
  parentArc: LiveArc | null;
  textSprite: THREE_NS.Sprite | null;
  textMaterial: THREE_NS.SpriteMaterial | null;
  textTexture: THREE_NS.CanvasTexture | null;
}

// ── Onion Peel Types ──
interface OnionHalf {
  mesh: THREE_NS.Mesh;
  material: THREE_NS.MeshPhongMaterial;
  geometry: THREE_NS.SphereGeometry;
  side: number; // +1 or -1 for left/right half
  pivot: THREE_NS.Group;
  peelDelay: number;
}

interface OnionSeamLine {
  line: THREE_NS.Line;
  material: THREE_NS.LineBasicMaterial;
}

interface OnionLayer {
  group: THREE_NS.Group;
  halves: [OnionHalf, OnionHalf];
  radius: number;
  baseOpacity: number;
  layerIndex: number;
  seamLines: OnionSeamLine[];
}

interface PeelState {
  active: boolean;
  startTime: number;
  mode: "open" | "close";       // open = peel away, close = wrap back
  onCloseComplete?: () => void;  // callback when close finishes
}

// ── Dot Constants ──
const DOT_COUNT = 40000;
const GLOBE_RADIUS = 100;
const DOT_SIZE = 0.5;
const LIFT = 1.005;
const DEG2RAD = Math.PI / 180;
const BASE_COLOR: [number, number, number] = [0.45, 0.35, 0.25];

// ── Arc Constants (scaled from Ron's radius=11) ──
const S = GLOBE_RADIUS / 11; // scale factor
const ARC_THICKNESS = 0.038 * S;
const ARC_GROW_DURATION = 1.3;
const ARC_RETREAT_DURATION = 2.8;
const ARC_POINTS = 80;
const ARC_SPAWN_INTERVAL = 400;
const MAX_CONCURRENT_ARCS = 15;
const BULLSEYE_SIZE = 0.10 * S;
const BULLSEYE_RING_SIZE = 0.2 * S;
const IMPACT_MAX_RADIUS = 0.05; // fraction of GLOBE_RADIUS
const ARC_RADIAL_SEGMENTS = 6;
const ARC_TUBE_SEGMENTS = 18;

// ── Helpers ──

function generateFibonacciSphere(n: number): DotPosition[] {
  const positions: DotPosition[] = [];
  for (let i = 0; i < n; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
    const lat = 90 - (phi * 180) / Math.PI;
    const lng = (((theta * 180) / Math.PI) % 360) - 180;
    const r = GLOBE_RADIUS * LIFT;
    const p = ((90 - lat) * Math.PI) / 180;
    const t = ((90 - lng) * Math.PI) / 180;
    positions.push({
      lat,
      lng,
      x: r * Math.sin(p) * Math.cos(t),
      y: r * Math.cos(p),
      z: r * Math.sin(p) * Math.sin(t),
    });
  }
  return positions;
}

function isLand(lat: number, lng: number): boolean {
  const rows = WORLD_MAP.length;
  const cols = WORLD_MAP[0].length;
  const latIdx = Math.min(rows - 1, Math.max(0, Math.floor(((90 - lat) * rows) / 180)));
  const lngIdx = Math.min(cols - 1, Math.max(0, Math.floor(((lng + 180) * cols) / 360)));
  return WORLD_MAP[latIdx][lngIdx] === "1";
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function angularDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = lat1 * DEG2RAD;
  const φ2 = lat2 * DEG2RAD;
  const Δφ = (lat2 - lat1) * DEG2RAD;
  const Δλ = (lng2 - lng1) * DEG2RAD;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / DEG2RAD;
}

/** Convert lat/lng to THREE.Vector3 matching three-globe's polar2Cartesian */
function latLngToVec3(THREE: ThreeModule, lat: number, lng: number, r: number = GLOBE_RADIUS): THREE_NS.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// ── Arc Path Generation (Ron's cubic Bezier approach) ──

function createArcPath(
  THREE: ThreeModule,
  startPos: THREE_NS.Vector3,
  endPos: THREE_NS.Vector3
): THREE_NS.Vector3[] {
  const midPoint = startPos.clone().add(endPos).multiplyScalar(0.5);
  const distance = startPos.distanceTo(endPos);
  midPoint.normalize().multiplyScalar(GLOBE_RADIUS + distance * 1.8);

  const adjustStart = startPos.clone().normalize().multiplyScalar(GLOBE_RADIUS * 0.997);
  const adjustEnd = endPos.clone().normalize().multiplyScalar(GLOBE_RADIUS * 0.997);

  const allPoints: THREE_NS.Vector3[] = [];
  for (let i = 0; i <= ARC_POINTS; i++) {
    let t: number;
    if (i === 0) t = 0;
    else if (i === ARC_POINTS) t = 1;
    else {
      const norm = i / ARC_POINTS;
      t = (Math.sin((norm - 0.5) * Math.PI) + 1) / 2;
    }

    const point = new THREE.Vector3();
    if (i === 0) {
      point.copy(adjustStart);
    } else if (i === ARC_POINTS) {
      point.copy(adjustEnd);
    } else {
      const cp1 = new THREE.Vector3().lerpVectors(adjustStart, midPoint, 0.25);
      const cp2 = new THREE.Vector3().lerpVectors(midPoint, adjustEnd, 0.75);
      const u = 1 - t;
      point.x = u * u * u * adjustStart.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * adjustEnd.x;
      point.y = u * u * u * adjustStart.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * adjustEnd.y;
      point.z = u * u * u * adjustStart.z + 3 * u * u * t * cp1.z + 3 * u * t * t * cp2.z + t * t * t * adjustEnd.z;
    }
    allPoints.push(point);
  }
  return allPoints;
}

// ── Cash register "ka-ching" sound effect ──
let audioCtx: AudioContext | null = null;
let kachingBuffer: AudioBuffer | null = null;
let audioUnlocked = false;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") ctx.resume();
  loadKachingBuffer();
  document.removeEventListener("click", unlockAudio);
  document.removeEventListener("keydown", unlockAudio);
  document.removeEventListener("pointerdown", unlockAudio);
}

if (typeof document !== "undefined") {
  document.addEventListener("click", unlockAudio);
  document.addEventListener("keydown", unlockAudio);
  document.addEventListener("pointerdown", unlockAudio);
}

let kachingRawBuf: ArrayBuffer | null = null;

async function prefetchKaching() {
  if (kachingRawBuf) return;
  const resp = await fetch("/kaching.mp3");
  kachingRawBuf = await resp.arrayBuffer();
}

async function loadKachingBuffer() {
  if (kachingBuffer) return;
  if (!kachingRawBuf) await prefetchKaching();
  const ctx = getAudioCtx();
  kachingBuffer = await ctx.decodeAudioData(kachingRawBuf!.slice(0));
}

// Pre-fetch MP3 bytes immediately on module load (no AudioContext needed)
if (typeof window !== "undefined") {
  prefetchKaching();
}

function playKaching(volume: number = 0.15) {
  const ctx = getAudioCtx();
  if (!kachingBuffer) {
    loadKachingBuffer().then(() => playKaching(volume));
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = kachingBuffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0, 0.2);
}

export default function Globe({ arcs, onArcHover, loop = true, paused = false, spawnInterval: spawnIntervalMs = 400, onSpawnProgress, seekTo }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance>(null);
  const dotMeshRef = useRef<THREE_NS.InstancedMesh | null>(null);
  const landDotsRef = useRef<DotPosition[]>([]);
  const threeRef = useRef<ThreeModule | null>(null);
  const globeGroupRef = useRef<THREE_NS.Object3D | null>(null);
  const liveArcsRef = useRef<LiveArc[]>([]);
  const impactEffectsRef = useRef<ImpactEffect[]>([]);
  const animFrameRef = useRef<number>(0);
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnIdxRef = useRef<number>(0);
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;
  // Per-dot glow state for impact flash effect
  const dotBaseColorsRef = useRef<Float32Array | null>(null);
  const dotGlowIntensityRef = useRef<Float32Array | null>(null);
  const dotGlowColorRef = useRef<Float32Array | null>(null);
  // Onion peel loading animation
  const onionLayersRef = useRef<OnionLayer[] | null>(null);
  const peelStateRef = useRef<PeelState | null>(null);
  const firstDataArrivalRef = useRef<boolean>(false);

  // ── Init globe + dots + animation loop ──
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    async function init() {
      const GlobeGL = (await import("globe.gl")).default;
      const THREE = await import("three");
      if (cancelled || !containerRef.current) return;

      threeRef.current = THREE;
      const el = containerRef.current;

      const globe = new GlobeGL(el, {
        rendererConfig: {
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        },
      });

      // Warm beige sphere to match background
      const globeMat = globe.globeMaterial() as THREE_NS.MeshPhongMaterial;
      globeMat.color = new THREE.Color(0xd5cfc5);
      globeMat.transparent = true;
      globeMat.opacity = 0.85;
      globeMat.emissive = new THREE.Color(0xc8bfb0);
      globeMat.emissiveIntensity = 0.45;
      globeMat.shininess = 5;

      // Only atmosphere + basic config — NO arc or ring layers
      globe
        .showAtmosphere(true)
        .atmosphereColor("#b8a888")
        .atmosphereAltitude(0.25)
        .backgroundColor("rgba(0,0,0,0)")
        .width(el.clientWidth)
        .height(el.clientHeight);

      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.3;
      globe.controls().enableZoom = true;
      globe.controls().minDistance = 200;
      globe.controls().maxDistance = 500;
      globe.pointOfView({ lat: 35, lng: -95, altitude: 2.5 });

      globeRef.current = globe;

      // Find the ThreeGlobe group to attach objects to
      const globeObj = globe.scene().children.find(
        (c: THREE_NS.Object3D) => c.type === "Group" || c.children.length > 0
      );
      globeGroupRef.current = globeObj || globe.scene();

      // ── Build dot mesh ──
      const allDots = generateFibonacciSphere(DOT_COUNT);
      const landDots = allDots.filter((d) => isLand(d.lat, d.lng));
      landDotsRef.current = landDots;
      const count = landDots.length;
      console.log(`[Globe] ${allDots.length} total → ${count} land dots`);

      const dotGeo = new THREE.CircleGeometry(DOT_SIZE, 6);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthTest: true,
        depthWrite: true,
        blending: THREE.NormalBlending,
      });

      const dotMesh = new THREE.InstancedMesh(dotGeo, dotMat, count);
      const dummy = new THREE.Object3D();
      const c = new THREE.Color();

      for (let i = 0; i < count; i++) {
        const d = landDots[i];
        dummy.position.set(d.x, d.y, d.z);
        dummy.lookAt(0, 0, 0);
        dummy.updateMatrix();
        dotMesh.setMatrixAt(i, dummy.matrix);
        c.setRGB(BASE_COLOR[0], BASE_COLOR[1], BASE_COLOR[2]);
        dotMesh.setColorAt(i, c);
      }
      dotMesh.instanceMatrix.needsUpdate = true;
      if (dotMesh.instanceColor) dotMesh.instanceColor.needsUpdate = true;
      dotMeshRef.current = dotMesh;
      globeGroupRef.current.add(dotMesh);

      // ── Create onion shell layers ──
      onionLayersRef.current = createOnionLayers(THREE, globeGroupRef.current);

      // If arcs are already available (cached data arrived before init),
      // trigger peel immediately. Use ref to get latest arcs value
      // since the closure captures the initial (possibly empty) array.
      const currentArcs = arcsRef.current;
      if (currentArcs.length > 0) {
        firstDataArrivalRef.current = true;
        hadVisibleArcsRef.current = true;
        updateDotColors(THREE);
        triggerPeel(300, "open");
        setTimeout(() => {
          spawnIdxRef.current = 0;
          onSpawnProgress?.(0, currentArcs.length);
          if (!paused) startSpawnInterval();
        }, 300);
      }

      // Initialize per-dot glow arrays
      dotBaseColorsRef.current = new Float32Array(count * 3);
      dotGlowIntensityRef.current = new Float32Array(count); // all 0
      dotGlowColorRef.current = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        dotBaseColorsRef.current[i * 3] = BASE_COLOR[0];
        dotBaseColorsRef.current[i * 3 + 1] = BASE_COLOR[1];
        dotBaseColorsRef.current[i * 3 + 2] = BASE_COLOR[2];
      }

      // ── Animation loop for custom arcs + impacts ──
      let lastTime = performance.now();

      function animate() {
        if (cancelled) return;
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
        lastTime = now;

        const T = threeRef.current!;
        const group = globeGroupRef.current!;
        const liveArcs = liveArcsRef.current;
        const impacts = impactEffectsRef.current;
        const nowSec = now / 1000;

        // ── Onion shell breathing + spin (while loading) ──
        const onionLayers = onionLayersRef.current;
        const peelState = peelStateRef.current;
        if (onionLayers && !peelState) {
          for (let li = 0; li < onionLayers.length; li++) {
            const layer = onionLayers[li];
            const layerOffset = li * 2.1;
            const s = 1 + 0.025 * Math.sin(nowSec * 2.0 + layerOffset);
            layer.group.scale.set(s, s, s);
            // Visible spin — each layer slightly faster, alternating direction
            const dir = li % 2 === 0 ? 1 : -1;
            layer.group.rotation.y += dt * dir * (0.4 + li * 0.15);
          }
        }

        // ── Onion peel animation (open = peel away, close = wrap back) ──
        if (onionLayers && peelState?.active) {
          const elapsed = nowSec - peelState.startTime;
          const isClosing = peelState.mode === "close";
          const peelDuration = isClosing ? 0.6 : 1.0;
          let allDone = true;

          for (const layer of onionLayers) {
            let layerMaxPeel = 0;

            for (const half of layer.halves) {
              const halfDelay = isClosing ? (half.peelDelay * 0.5) : half.peelDelay;
              const halfElapsed = elapsed - halfDelay;

              if (halfElapsed < 0) {
                if (isClosing) {
                  // Not started closing yet — hold at fully peeled
                  half.pivot.rotation.x = -(150 * DEG2RAD);
                  half.material.opacity = 0;
                  layerMaxPeel = Math.max(layerMaxPeel, 1);
                } else {
                  const layerOffset = layer.layerIndex * 2.1;
                  const s = 1 + 0.025 * Math.sin(nowSec * 2.0 + layerOffset);
                  layer.group.scale.set(s, s, s);
                }
                allDone = false;
                continue;
              }

              const t = Math.min(1, halfElapsed / peelDuration);
              if (t < 1) allDone = false;

              // peelProgress: 0 = closed (wrapped), 1 = fully peeled away
              let peelProgress: number;
              if (isClosing) {
                // t: 0→1, peelProgress: 1→0 (peeled → closed), easeOutCubic
                peelProgress = Math.pow(1 - t, 3);
              } else {
                // t: 0→1, peelProgress: 0→1 (closed → peeled), easeOutCubic
                peelProgress = 1 - Math.pow(1 - t, 3);
              }

              layerMaxPeel = Math.max(layerMaxPeel, peelProgress);

              half.pivot.rotation.x = -(150 * DEG2RAD) * peelProgress;

              const pushDir = half.pivot.position.clone().normalize();
              const pushAmount = GLOBE_RADIUS * 0.15 * peelProgress;
              half.pivot.position.set(0, -layer.radius, 0);
              half.pivot.position.addScaledVector(pushDir, pushAmount);

              half.material.opacity = layer.baseOpacity * (1 - peelProgress);
            }

            for (const seam of layer.seamLines) {
              seam.material.opacity = layer.baseOpacity * 1.5 * (1 - layerMaxPeel);
            }
          }

          if (allDone) {
            if (isClosing) {
              // Close complete — reset all halves to closed position
              for (const layer of onionLayers) {
                layer.group.scale.set(1, 1, 1);
                for (const half of layer.halves) {
                  half.pivot.rotation.x = 0;
                  half.pivot.position.set(0, -layer.radius, 0);
                  half.material.opacity = layer.baseOpacity;
                }
                for (const seam of layer.seamLines) {
                  seam.material.opacity = layer.baseOpacity * 1.5;
                }
              }
              peelStateRef.current = null;
              peelState.onCloseComplete?.();
            } else {
              // Open complete — dispose shells
              for (const layer of onionLayers) {
                for (const half of layer.halves) {
                  half.geometry.dispose();
                  half.material.dispose();
                  half.pivot.remove(half.mesh);
                  layer.group.remove(half.pivot);
                }
                for (const seam of layer.seamLines) {
                  seam.line.geometry.dispose();
                  seam.material.dispose();
                  layer.group.remove(seam.line);
                }
                group.remove(layer.group);
              }
              onionLayersRef.current = null;
              peelStateRef.current = null;
            }
          }
        }

        // Update arcs
        for (let i = liveArcs.length - 1; i >= 0; i--) {
          const arc = liveArcs[i];
          arc.age += dt;

          // ── Growth phase ──
          if (arc.age < arc.growDuration) {
            let gp = arc.age / arc.growDuration;
            // easeInOutQuad
            gp = gp < 0.5 ? 2 * gp * gp : -1 + (4 - 2 * gp) * gp;

            // Trigger impact at 90% growth
            if (gp >= 0.9 && !arc.impactCreated) {
              const effect = createImpact(T, group, arc.destinationPoint, arc.color);
              effect.parentArc = arc;
              impacts.push(effect);
              arc.impactCreated = true;
              arc.impactEffect = effect;
              // Flash nearby land dots in the arc's token color
              triggerDotGlow(arc.arcData.endLat, arc.arcData.endLng, arc.color);

              // Play kaching if impact is on the visible side of the globe
              // Volume scales with both visibility angle and transfer value
              const cam = globeRef.current?.camera?.();
              if (cam) {
                const impactNormal = arc.destinationPoint.clone().normalize();
                const camDir = cam.position.clone().normalize();
                const dot = impactNormal.dot(camDir);
                if (dot > 0.15) {
                  const usdVal = Math.max(arc.arcData.totalUsd, 1);
                  // Log-scale: $10K→0.6x, $100K→1.0x, $1M→1.4x, $10M→1.8x
                  const valueMult = 0.2 + 0.4 * Math.max(0, Math.log10(usdVal) - 4);
                  const vol = (0.08 + 0.07 * dot) * valueMult;
                  playKaching(vol);
                }
              }

              // Create floating text label at impact point, sized by transaction value
              const toFlag = COUNTRY_FLAGS[arc.arcData.toCountry] ?? "";
              const label = `${toFlag} +${formatUsd(arc.arcData.totalUsd)} ${arc.arcData.tokenSymbol}`;
              // Log-scale sizing: $10K → 1.5x, $100K → 1.95x, $1M → 2.4x, $10M → 2.85x, $100M → 3.3x
              const usd = Math.max(arc.arcData.totalUsd, 1);
              const sizeFactor = 1.5 + 0.45 * Math.max(0, Math.log10(usd) - 4);
              const { sprite, material: spriteMat, texture: spriteTex } = createTextSprite(T, label, arc.color, sizeFactor);
              const normal = arc.destinationPoint.clone().normalize();
              sprite.position.copy(arc.destinationPoint).addScaledVector(normal, 0.5 * S);
              group.add(sprite);
              effect.textSprite = sprite;
              effect.textMaterial = spriteMat;
              effect.textTexture = spriteTex;
            }

            const pointCount = Math.max(2, Math.floor(gp * arc.allPoints.length));
            const currentPoints = arc.allPoints.slice(0, pointCount);
            rebuildTube(T, group, arc, currentPoints, ARC_THICKNESS, 0.7);
          }
          // ── Retreat phase ──
          else if (arc.age < arc.growDuration + arc.retreatDuration) {
            let rp = (arc.age - arc.growDuration) / arc.retreatDuration;
            // Smooth hermite
            rp = rp * rp * (3 - 2 * rp);
            if (rp < 0.2) rp = rp * rp * 5;

            const startIdx = Math.floor(rp * arc.allPoints.length);
            const currentPoints = arc.allPoints.slice(startIdx);

            if (currentPoints.length < 2) {
              arc.material.opacity = 0;
            } else {
              const thickness = ARC_THICKNESS * (1 - rp * 0.3);
              rebuildTube(T, group, arc, currentPoints, thickness, 0.7 * (1 - rp * 0.5));
            }
          }
          // ── Remove ──
          else {
            group.remove(arc.mesh);
            arc.mesh.geometry.dispose();
            arc.material.dispose();
            // Start fading the bullseye
            if (arc.impactEffect) {
              arc.impactEffect.isFadingOut = true;
              arc.impactEffect.fadeStartTime = now / 1000;
              arc.impactEffect.fadeDuration = 1.0;
              arc.impactEffect.parentArc = null;
            }
            liveArcs.splice(i, 1);
          }
        }

        // Update impact effects
        for (let i = impacts.length - 1; i >= 0; i--) {
          const fx = impacts[i];

          // Handle bullseye fade-out
          if (fx.isFadingOut) {
            const elapsed = now / 1000 - fx.fadeStartTime;
            const fp = Math.min(1, elapsed / fx.fadeDuration);
            fx.centerDotMaterial.opacity = 0.85 * (1 - fp);
            if (fp >= 1) {
              group.remove(fx.centerDot);
              fx.centerDot.geometry.dispose();
              fx.centerDotMaterial.dispose();
              group.remove(fx.ring);
              fx.ring.geometry.dispose();
              fx.ringMaterial.dispose();
              group.remove(fx.outerRing);
              fx.outerRing.geometry.dispose();
              fx.outerRingMaterial.dispose();
              if (fx.textSprite) {
                group.remove(fx.textSprite);
                fx.textMaterial?.dispose();
                fx.textTexture?.dispose();
              }
              impacts.splice(i, 1);
            }
            continue;
          }

          fx.age += dt;

          // Animate text sprite: drift upward in screen space and fade
          if (fx.textSprite && fx.textMaterial) {
            const textAge = fx.age;
            const textLife = 3.0;
            if (textAge < textLife) {
              fx.textSprite.position.y += dt * 3;
              fx.textMaterial.opacity = 1.0 - textAge / textLife;
            } else {
              group.remove(fx.textSprite);
              fx.textMaterial.dispose();
              fx.textTexture?.dispose();
              fx.textSprite = null;
              fx.textMaterial = null;
              fx.textTexture = null;
            }
          }

          if (fx.age < fx.maxLife) {
            const progress = fx.age / fx.maxLife;

            // Expanding inner ring
            const innerR = 0.15 * S + progress * GLOBE_RADIUS * IMPACT_MAX_RADIUS;
            const border = innerR * 0.2;
            group.remove(fx.ring);
            fx.ring.geometry.dispose();
            fx.ring.geometry = new T.RingGeometry(innerR - border, innerR, 24);
            fx.ringMaterial.opacity = 0.8 * (1 - Math.pow(progress, 1.5));
            group.add(fx.ring);

            // Expanding outer ring
            const outerR = innerR * 1.3;
            const outerBorder = outerR * 0.15;
            group.remove(fx.outerRing);
            fx.outerRing.geometry.dispose();
            fx.outerRing.geometry = new T.RingGeometry(outerR - outerBorder, outerR, 24);
            fx.outerRingMaterial.opacity = 0.6 * (1 - Math.pow(progress, 2));
            group.add(fx.outerRing);

            fx.ring.lookAt(new T.Vector3(0, 0, 0));
            fx.outerRing.lookAt(new T.Vector3(0, 0, 0));
          } else if (!fx.isFadingOut) {
            // Expanding rings done — rapid fade then remove rings
            if (fx.ringMaterial.opacity > 0.02) {
              fx.ringMaterial.opacity *= 0.7;
              fx.outerRingMaterial.opacity *= 0.7;
            } else {
              // Remove expanding rings, keep bullseye center dot
              group.remove(fx.ring);
              fx.ring.geometry.dispose();
              fx.ringMaterial.dispose();
              group.remove(fx.outerRing);
              fx.outerRing.geometry.dispose();
              fx.outerRingMaterial.dispose();

              // Check if parent arc is gone, start fade
              if (!fx.parentArc) {
                fx.isFadingOut = true;
                fx.fadeStartTime = now / 1000;
                fx.fadeDuration = 1.0;
              }
            }
          }
        }

        // ── Decay dot glows and update colors ──
        const glowI = dotGlowIntensityRef.current;
        const glowC = dotGlowColorRef.current;
        const baseC = dotBaseColorsRef.current;
        const dMesh = dotMeshRef.current;
        if (glowI && glowC && baseC && dMesh) {
          let anyGlow = false;
          const dc = new T.Color();
          const decayFactor = Math.pow(0.08, dt); // ~1.5s visible glow
          for (let j = 0; j < glowI.length; j++) {
            if (glowI[j] > 0.01) {
              glowI[j] *= decayFactor;
              anyGlow = true;
              const gi = glowI[j];
              dc.setRGB(
                baseC[j * 3] * (1 - gi) + glowC[j * 3] * gi,
                baseC[j * 3 + 1] * (1 - gi) + glowC[j * 3 + 1] * gi,
                baseC[j * 3 + 2] * (1 - gi) + glowC[j * 3 + 2] * gi
              );
              dMesh.setColorAt(j, dc);
            } else if (glowI[j] > 0) {
              // Snap back to base color
              glowI[j] = 0;
              dc.setRGB(baseC[j * 3], baseC[j * 3 + 1], baseC[j * 3 + 2]);
              dMesh.setColorAt(j, dc);
              anyGlow = true;
            }
          }
          if (anyGlow && dMesh.instanceColor) {
            dMesh.instanceColor.needsUpdate = true;
          }
        }

        animFrameRef.current = requestAnimationFrame(animate);
      }

      animate();
    }

    init().catch((err) => console.error("[Globe] init failed:", err));

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      // Clean up arcs and impacts
      const group = globeGroupRef.current;
      if (group) {
        for (const arc of liveArcsRef.current) {
          group.remove(arc.mesh);
          arc.mesh.geometry.dispose();
          arc.material.dispose();
        }
        for (const fx of impactEffectsRef.current) {
          group.remove(fx.ring);
          group.remove(fx.outerRing);
          group.remove(fx.centerDot);
          if (fx.textSprite) {
            group.remove(fx.textSprite);
            fx.textMaterial?.dispose();
            fx.textTexture?.dispose();
          }
        }
      }
      liveArcsRef.current = [];
      impactEffectsRef.current = [];
      // Clean up onion shells
      cleanupOnionLayers();
      if (dotMeshRef.current) {
        dotMeshRef.current.geometry.dispose();
        (dotMeshRef.current.material as THREE_NS.MeshBasicMaterial).dispose();
        dotMeshRef.current.removeFromParent();
        dotMeshRef.current = null;
      }
      if (globeRef.current) {
        globeRef.current._destructor?.();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: spawn a single arc at spawnIdxRef.current ──
  // Uses arcsRef.current so it always reads the latest arcs,
  // even when called from an interval created during init.
  function spawnOneArc() {
    const T = threeRef.current;
    const g = globeGroupRef.current;
    const currentArcs = arcsRef.current;
    if (!T || !g || currentArcs.length === 0) return;
    if (liveArcsRef.current.length >= MAX_CONCURRENT_ARCS) return;

    const idx = spawnIdxRef.current;

    // In non-loop mode, stop after all arcs have been spawned
    if (!loop && idx >= currentArcs.length) {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current);
        spawnIntervalRef.current = null;
      }
      return;
    }

    const arcData = currentArcs[idx % currentArcs.length];
    spawnIdxRef.current = idx + 1;

    // Report progress
    onSpawnProgress?.(Math.min(idx + 1, currentArcs.length), currentArcs.length);

    const startPos = latLngToVec3(T, arcData.startLat, arcData.startLng);
    const endPos = latLngToVec3(T, arcData.endLat, arcData.endLng);
    const allPoints = createArcPath(T, startPos, endPos);

    const color = new T.Color(arcData.color);

    const initialPoints = allPoints.slice(0, 4);
    const tubePath = new T.CatmullRomCurve3(initialPoints);
    tubePath.tension = 0.5;
    const tubeGeo = new T.TubeGeometry(tubePath, 3, ARC_THICKNESS, ARC_RADIAL_SEGMENTS, false);

    const tubeMat = new T.MeshBasicMaterial({
      color: color,
      opacity: 0.7,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
    });

    const mesh = new T.Mesh(tubeGeo, tubeMat);
    g.add(mesh);

    const liveArc: LiveArc = {
      mesh,
      material: tubeMat,
      allPoints,
      growDuration: ARC_GROW_DURATION + Math.random() * 0.4,
      retreatDuration: ARC_RETREAT_DURATION + Math.random() * 0.8,
      age: 0,
      destinationPoint: endPos.clone(),
      impactCreated: false,
      impactEffect: null,
      color,
      arcData,
    };

    liveArcsRef.current.push(liveArc);
  }

  function startSpawnInterval() {
    if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
    spawnIntervalRef.current = setInterval(spawnOneArc, spawnIntervalMs);
  }

  // Helper to clean up onion layers
  function cleanupOnionLayers() {
    if (onionLayersRef.current) {
      for (const layer of onionLayersRef.current) {
        for (const half of layer.halves) {
          half.geometry.dispose();
          half.material.dispose();
          half.pivot.remove(half.mesh);
          layer.group.remove(half.pivot);
        }
        for (const seam of layer.seamLines) {
          seam.line.geometry.dispose();
          seam.material.dispose();
          layer.group.remove(seam.line);
        }
        layer.group.parent?.remove(layer.group);
      }
      onionLayersRef.current = null;
      peelStateRef.current = null;
    }
  }

  // Helper to trigger onion peel after delay
  function triggerPeel(delayMs: number, mode: "open" | "close" = "open", onComplete?: () => void) {
    setTimeout(() => {
      if (onionLayersRef.current) {
        peelStateRef.current = {
          active: true,
          startTime: performance.now() / 1000,
          mode,
          onCloseComplete: onComplete,
        };
      }
    }, delayMs);
  }

  // Track whether there were previously visible arcs (to know if we need close animation)
  const hadVisibleArcsRef = useRef(false);
  const pendingPeelRef = useRef(false);

  // Helper to clear live arcs and impact effects from the scene
  function clearLiveArcs() {
    const group = globeGroupRef.current;
    if (!group) return;
    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    }
    for (const arc of liveArcsRef.current) {
      group.remove(arc.mesh);
      arc.mesh.geometry.dispose();
      arc.material.dispose();
    }
    liveArcsRef.current = [];
    for (const fx of impactEffectsRef.current) {
      group.remove(fx.ring);
      group.remove(fx.outerRing);
      group.remove(fx.centerDot);
      if (fx.textSprite) {
        group.remove(fx.textSprite);
        fx.textMaterial?.dispose();
        fx.textTexture?.dispose();
      }
    }
    impactEffectsRef.current = [];
    spawnIdxRef.current = 0;
  }

  // Helper to start the open peel + spawn
  function beginOpenPeel(delay: number) {
    const THREE = threeRef.current;
    if (!THREE) return;
    updateDotColors(THREE);
    triggerPeel(delay, "open");
    setTimeout(() => {
      if (!paused) startSpawnInterval();
    }, delay);
  }

  // ── React to arcs changes (view switch, new data, preset change) ──
  useEffect(() => {
    const THREE = threeRef.current;
    const group = globeGroupRef.current;
    if (!THREE || !group) {
      // Three.js not ready yet — init effect will handle arcs if present
      return;
    }

    const hadArcs = hadVisibleArcsRef.current;

    if (hadArcs && !onionLayersRef.current) {
      // There were visible arcs and no onion — play close animation first
      // Clear arcs immediately so nothing stays frozen on screen
      clearLiveArcs();
      onSpawnProgress?.(0, arcs.length);

      // Create shells starting in peeled-open position
      onionLayersRef.current = createOnionLayers(THREE, group);

      // Set halves to fully peeled state so close animation starts from there
      for (const layer of onionLayersRef.current) {
        for (const half of layer.halves) {
          half.pivot.rotation.x = -(150 * DEG2RAD);
          half.material.opacity = 0;
        }
        for (const seam of layer.seamLines) {
          seam.material.opacity = 0;
        }
      }

      // Start close animation immediately
      triggerPeel(0, "close", () => {
        if (arcs.length > 0) {
          pendingPeelRef.current = false;
          beginOpenPeel(100);
        } else {
          pendingPeelRef.current = true;
        }
      });
    } else {
      // No previous arcs or onion already exists — go straight to closed + open
      cleanupOnionLayers();
      clearLiveArcs();
      onSpawnProgress?.(0, arcs.length);

      onionLayersRef.current = createOnionLayers(THREE, group);

      if (arcs.length > 0) {
        const delay = firstDataArrivalRef.current ? 200 : 400;
        firstDataArrivalRef.current = true;
        pendingPeelRef.current = false;
        beginOpenPeel(delay);
      } else {
        pendingPeelRef.current = true;
      }
    }

    hadVisibleArcsRef.current = arcs.length > 0;

    return () => {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current);
        spawnIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcs]);

  // ── Handle deferred peel when arcs populate after being empty ──
  const prevArcsLenRef = useRef(arcs.length);
  useEffect(() => {
    const wasEmpty = prevArcsLenRef.current === 0;
    prevArcsLenRef.current = arcs.length;

    if (!wasEmpty || arcs.length === 0 || !pendingPeelRef.current) return;

    const THREE = threeRef.current;
    if (!THREE) return;

    // Data just arrived while onion was waiting closed
    pendingPeelRef.current = false;
    firstDataArrivalRef.current = true;
    hadVisibleArcsRef.current = true;
    beginOpenPeel(200);

    spawnIdxRef.current = 0;
    onSpawnProgress?.(0, arcs.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcs]);

  // ── Pause / resume effect ──
  useEffect(() => {
    if (arcs.length === 0) return;
    if (paused) {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current);
        spawnIntervalRef.current = null;
      }
    } else {
      // Resume from current position
      startSpawnInterval();
    }
    return () => {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current);
        spawnIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // ── Seek effect ──
  useEffect(() => {
    if (seekTo == null || arcs.length === 0) return;
    const group = globeGroupRef.current;
    if (!group) return;

    // Stop current spawning
    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    }

    // Remove all live arcs and impacts
    for (const arc of liveArcsRef.current) {
      group.remove(arc.mesh);
      arc.mesh.geometry.dispose();
      arc.material.dispose();
    }
    liveArcsRef.current = [];
    for (const fx of impactEffectsRef.current) {
      group.remove(fx.ring);
      group.remove(fx.outerRing);
      group.remove(fx.centerDot);
      if (fx.textSprite) {
        group.remove(fx.textSprite);
        fx.textMaterial?.dispose();
        fx.textTexture?.dispose();
      }
    }
    impactEffectsRef.current = [];

    // Set new spawn position and resume
    spawnIdxRef.current = seekTo;
    onSpawnProgress?.(seekTo, arcs.length);
    if (!paused) {
      startSpawnInterval();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo]);

  // ── Resize ──
  useEffect(() => {
    function handleResize() {
      if (globeRef.current && containerRef.current) {
        globeRef.current
          .width(containerRef.current.clientWidth)
          .height(containerRef.current.clientHeight);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Helper: create onion shell layers around the globe ──
  function createOnionLayers(T: ThreeModule, group: THREE_NS.Object3D): OnionLayer[] {
    const layerConfigs = [
      { radiusMult: 1.04, color: "#b89860", opacity: 0.65 },
      { radiusMult: 1.09, color: "#c4a878", opacity: 0.50 },
      { radiusMult: 1.15, color: "#d4c4a0", opacity: 0.38 },
    ];
    const yRotations = [0, Math.PI / 3, (2 * Math.PI) / 3]; // 0°, 60°, 120°
    const layers: OnionLayer[] = [];

    // Peel delay stagger: alternating sides across layers (outer→inner)
    // [layerIndex][sideIndex] → delay in seconds
    const peelDelays: Record<string, number> = {
      "2_0": 0.00,  // outer half-A (left)
      "1_1": 0.25,  // middle half-B (right)
      "0_0": 0.50,  // inner half-A (left)
      "2_1": 0.75,  // outer half-B (right)
      "1_0": 1.00,  // middle half-A (left)
      "0_1": 1.25,  // inner half-B (right)
    };

    for (let i = 0; i < layerConfigs.length; i++) {
      const cfg = layerConfigs[i];
      const r = GLOBE_RADIUS * cfg.radiusMult;
      const layerGroup = new T.Group();
      layerGroup.rotation.y = yRotations[i];

      const halves: OnionHalf[] = [];
      for (let side = 0; side < 2; side++) {
        // Each half covers 180° of phi (vertical seam split)
        const phiStart = side * Math.PI;
        const geo = new T.SphereGeometry(r, 32, 24, phiStart, Math.PI);
        const mat = new T.MeshPhongMaterial({
          color: new T.Color(cfg.color),
          transparent: true,
          opacity: cfg.opacity,
          side: T.DoubleSide,
          depthWrite: false,
        });
        const mesh = new T.Mesh(geo, mat);

        // Create pivot group at bottom of sphere so rotation hinges from the bottom
        const pivot = new T.Group();
        pivot.position.set(0, -r, 0);
        mesh.position.set(0, r, 0);
        pivot.add(mesh);
        layerGroup.add(pivot);

        const delay = peelDelays[`${i}_${side}`] ?? 0;
        halves.push({
          mesh,
          material: mat,
          geometry: geo,
          side: side === 0 ? 1 : -1,
          pivot,
          peelDelay: delay,
        });
      }

      // Create seam lines along the edges where the two halves meet
      // THREE.js SphereGeometry seams are at phi=0 and phi=π in the XY plane
      const seamLines: OnionSeamLine[] = [];
      const seamSegments = 32;
      for (const seamPhi of [0, Math.PI]) {
        const seamPoints: THREE_NS.Vector3[] = [];
        for (let si = 0; si <= seamSegments; si++) {
          const theta = (si / seamSegments) * Math.PI;
          seamPoints.push(new T.Vector3(
            -r * Math.cos(seamPhi) * Math.sin(theta),
            r * Math.cos(theta),
            r * Math.sin(seamPhi) * Math.sin(theta)
          ));
        }
        const seamGeo = new T.BufferGeometry().setFromPoints(seamPoints);
        const seamMat = new T.LineBasicMaterial({
          color: new T.Color(cfg.color).lerp(new T.Color(0xffffff), 0.3),
          transparent: true,
          opacity: cfg.opacity * 1.5,
          depthWrite: false,
        });
        const seamLine = new T.Line(seamGeo, seamMat);
        layerGroup.add(seamLine);
        seamLines.push({ line: seamLine, material: seamMat });
      }

      group.add(layerGroup);
      layers.push({
        group: layerGroup,
        halves: halves as [OnionHalf, OnionHalf],
        radius: r,
        baseOpacity: cfg.opacity,
        layerIndex: i,
        seamLines,
      });
    }

    return layers;
  }

  // ── Helper: rebuild tube geometry for an arc ──
  function rebuildTube(
    T: ThreeModule,
    group: THREE_NS.Object3D,
    arc: LiveArc,
    points: THREE_NS.Vector3[],
    thickness: number,
    opacity: number
  ) {
    try {
      const tubePath = new T.CatmullRomCurve3(points);
      tubePath.tension = 0.4;
      const segments = Math.max(5, Math.min(ARC_TUBE_SEGMENTS, Math.ceil(points.length * 0.8)));
      const newGeo = new T.TubeGeometry(tubePath, segments, thickness, ARC_RADIAL_SEGMENTS, false);

      group.remove(arc.mesh);
      arc.mesh.geometry.dispose();
      arc.mesh.geometry = newGeo;
      arc.material.opacity = opacity;
      group.add(arc.mesh);
    } catch {
      // Skip frame on error
    }
  }

  // ── Helper: create impact effect at destination ──
  function createImpact(
    T: ThreeModule,
    group: THREE_NS.Object3D,
    position: THREE_NS.Vector3,
    color: THREE_NS.Color
  ): ImpactEffect {
    const lightenedColor = color.clone().lerp(new T.Color(0xffffff), 0.4);
    const matProps = {
      side: T.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
    } as const;

    // Inner expanding ring
    const ringGeo = new T.RingGeometry(BULLSEYE_SIZE * 0.67, BULLSEYE_SIZE, 24);
    const ringMat = new T.MeshBasicMaterial({ ...matProps, color, opacity: 0.95 });
    const ring = new T.Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.lookAt(new T.Vector3(0, 0, 0));
    group.add(ring);

    // Outer expanding ring
    const outerRingGeo = new T.RingGeometry(BULLSEYE_SIZE * 0.67, BULLSEYE_SIZE, 24);
    const outerRingMat = new T.MeshBasicMaterial({ ...matProps, color: lightenedColor, opacity: 0.75 });
    const outerRing = new T.Mesh(outerRingGeo, outerRingMat);
    outerRing.position.copy(position);
    const dirToCenter = new T.Vector3(0, 0, 0).sub(position).normalize();
    outerRing.position.add(dirToCenter.multiplyScalar(0.01 * S));
    outerRing.lookAt(new T.Vector3(0, 0, 0));
    group.add(outerRing);

    // Center dot (bullseye)
    const centerGeo = new T.CircleGeometry(BULLSEYE_SIZE, 24);
    const centerMat = new T.MeshBasicMaterial({ ...matProps, color, opacity: 0.85 });
    const centerDot = new T.Mesh(centerGeo, centerMat);
    centerDot.position.copy(position);
    const dirFromCenter = position.clone().normalize();
    centerDot.position.add(dirFromCenter.multiplyScalar(0.008 * S));
    centerDot.lookAt(new T.Vector3(0, 0, 0));
    group.add(centerDot);

    return {
      ring,
      ringMaterial: ringMat,
      outerRing,
      outerRingMaterial: outerRingMat,
      centerDot,
      centerDotMaterial: centerMat,
      age: 0,
      maxLife: 0.5 + Math.random() * 0.3,
      position: position.clone(),
      isFadingOut: false,
      fadeStartTime: 0,
      fadeDuration: 1.0,
      parentArc: null,
      textSprite: null,
      textMaterial: null,
      textTexture: null,
    };
  }

  // ── Helper: trigger glow on nearby land dots when arc impacts ──
  function triggerDotGlow(destLat: number, destLng: number, color: THREE_NS.Color) {
    const landDots = landDotsRef.current;
    const intensity = dotGlowIntensityRef.current;
    const glowCol = dotGlowColorRef.current;
    if (!intensity || !glowCol || landDots.length === 0) return;

    for (let i = 0; i < landDots.length; i++) {
      const dist = angularDistance(landDots[i].lat, landDots[i].lng, destLat, destLng);
      if (dist < 6) {
        // Full intensity within 3°, linear falloff to 6°
        const falloff = dist < 3 ? 1.0 : 1.0 - (dist - 3) / 3;
        intensity[i] = Math.max(intensity[i], falloff);
        glowCol[i * 3] = color.r;
        glowCol[i * 3 + 1] = color.g;
        glowCol[i * 3 + 2] = color.b;
      }
    }
  }

  // ── Helper: update dot base colors from arc endpoints ──
  function updateDotColors(THREE: ThreeModule) {
    const mesh = dotMeshRef.current;
    const landDots = landDotsRef.current;
    const baseColors = dotBaseColorsRef.current;
    if (!mesh || landDots.length === 0) return;

    const color = new THREE.Color();
    const endpoints: { lat: number; lng: number; color: string }[] = [];
    for (const arc of arcs) {
      endpoints.push({ lat: arc.startLat, lng: arc.startLng, color: arc.color });
      endpoints.push({ lat: arc.endLat, lng: arc.endLng, color: arc.color });
    }

    for (let i = 0; i < landDots.length; i++) {
      const dot = landDots[i];
      let minDist = Infinity;
      let nearestColor = "";
      for (const ep of endpoints) {
        const dist = angularDistance(dot.lat, dot.lng, ep.lat, ep.lng);
        if (dist < minDist) {
          minDist = dist;
          nearestColor = ep.color;
        }
      }

      let r: number, g: number, b: number;
      if (minDist < 4) {
        [r, g, b] = hexToRgb(nearestColor);
      } else if (minDist < 10) {
        const rgb = hexToRgb(nearestColor);
        const t = (minDist - 4) / 6;
        r = rgb[0] * (1 - t) + BASE_COLOR[0] * t;
        g = rgb[1] * (1 - t) + BASE_COLOR[1] * t;
        b = rgb[2] * (1 - t) + BASE_COLOR[2] * t;
      } else {
        [r, g, b] = BASE_COLOR;
      }

      color.setRGB(r, g, b);
      mesh.setColorAt(i, color);
      // Store as base color for glow blending
      if (baseColors) {
        baseColors[i * 3] = r;
        baseColors[i * 3 + 1] = g;
        baseColors[i * 3 + 2] = b;
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // Suppress unused warning — kept for potential future use
  void onArcHover;

  return (
    <div className="w-full h-full relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(180, 165, 130, 0.15) 0%, rgba(140, 125, 100, 0.05) 40%, transparent 60%)",
        }}
      />
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
