import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Fog,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Sphere,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { ParticlePoint } from "../../lib/vibeApi";

interface ParticleUniverseProps {
  paused: boolean;
  points: ParticlePoint[];
  selectedId: number | null;
  theme: "dark" | "light";
  onSelect: (point: ParticlePoint | null) => void;
}

interface Simulation {
  base: Float32Array;
  colors: Float32Array;
  phase: Float32Array;
  center: Vector3;
  count: number;
}

interface SceneState {
  camera: PerspectiveCamera;
  cloud: Group;
  connections: LineSegments<BufferGeometry, LineBasicMaterial>;
  controls: OrbitControls;
  fog: Fog;
  particles: Points<BufferGeometry, PointsMaterial>;
  renderer: WebGLRenderer;
  scene: Scene;
  selection: Mesh<SphereGeometry, MeshBasicMaterial>;
  glow: CanvasTexture;
}

const SCALE = 4.8;
const DRIFT = 0.14;
const SPRING = 0.14;
const BASE_POINT_SIZE = 0.22;
const CONNECTION_DISTANCE = 1.2;
const MAX_CONNECTIONS = 620;
const CONNECTION_REFRESH = 16;
const CURSOR_SPHERE_RADIUS = 7;
const REPEL_RADIUS = 2.5;
const REPEL_STRENGTH = 1.15;

const EMPTY_GEOMETRY = () => new BufferGeometry();

function maximumDpr(pointCount: number): number {
  if (pointCount > 2_000) return 1.15;
  if (pointCount > 1_000) return 1.35;
  return 1.65;
}

function makeGlowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function buildSimulation(points: ParticlePoint[]): Simulation {
  const count = points.length;
  const base = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const center = new Vector3();
  points.forEach((point, index) => {
    const i3 = index * 3;
    base[i3] = point.x * SCALE;
    base[i3 + 1] = point.y * SCALE;
    base[i3 + 2] = point.z * SCALE;
    center.x += base[i3];
    center.y += base[i3 + 1];
    center.z += base[i3 + 2];
    const color = new Color(point.color);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    phase[index] = Math.random() * Math.PI * 2;
  });
  if (count > 0) center.divideScalar(count);
  return { base, colors, phase, center, count };
}

function buildGeometry(sim: Simulation): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(sim.base.slice(), 3));
  geometry.setAttribute("color", new BufferAttribute(sim.colors, 3));
  geometry.boundingSphere = new Sphere(sim.center.clone(), CURSOR_SPHERE_RADIUS + 3);
  return geometry;
}

export default function ParticleUniverse({
  onSelect,
  paused,
  points,
  selectedId,
  theme,
}: ParticleUniverseProps) {
  const container = useRef<HTMLDivElement>(null);
  const sceneState = useRef<SceneState | null>(null);
  const onSelectRef = useRef(onSelect);
  const pausedRef = useRef(paused);
  const pointsRef = useRef(points);
  const simRef = useRef<Simulation | null>(null);
  const mouseNdc = useRef(new Vector2());
  const mouseActive = useRef(false);
  const cursorStrength = useRef(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    const host = container.current;
    if (!host) return;

    const background = new Color("#0c100f");
    const scene = new Scene();
    scene.background = background;
    const fog = new Fog(background, 8, 23);
    scene.fog = fog;

    const camera = new PerspectiveCamera(52, 1, 0.1, 80);
    camera.position.set(0, 0.4, 9);

    const renderer = new WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(background);
    host.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.045;
    controls.enablePan = false;
    controls.minDistance = 4.2;
    controls.maxDistance = 16;
    controls.autoRotateSpeed = 0.35;

    const glow = makeGlowTexture();
    const cloud = new Group();
    const particles = new Points(
      EMPTY_GEOMETRY(),
      new PointsMaterial({
        map: glow,
        alphaMap: glow,
        alphaTest: 0.02,
        blending: AdditiveBlending,
        depthWrite: false,
        opacity: 0.95,
        size: BASE_POINT_SIZE,
        sizeAttenuation: true,
        transparent: true,
        vertexColors: true,
      }),
    );
    const connections = new LineSegments(
      EMPTY_GEOMETRY(),
      new LineBasicMaterial({
        color: "#96b6aa",
        opacity: 0.16,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const selection = new Mesh(
      new SphereGeometry(0.16, 20, 20),
      new MeshBasicMaterial({
        color: "#ffffff",
        opacity: 0.8,
        transparent: true,
        wireframe: true,
      }),
    );
    selection.visible = false;
    cloud.add(connections, particles, selection);
    scene.add(cloud);

    const state: SceneState = {
      camera,
      cloud,
      connections,
      controls,
      fog,
      particles,
      renderer,
      scene,
      selection,
      glow,
    };
    sceneState.current = state;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          maximumDpr(pointsRef.current.length),
        ),
      );
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const raycaster = new Raycaster();
    raycaster.params.Points = { threshold: 0.18 };
    const pointer = new Vector2();
    const handleClick = (event: MouseEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const match = raycaster.intersectObject(particles, false)[0];
      const point =
        typeof match?.index === "number"
          ? (pointsRef.current[match.index] ?? null)
          : null;
      onSelectRef.current(point);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      mouseNdc.current.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      mouseActive.current = true;
    };
    const handlePointerLeave = () => {
      mouseActive.current = false;
    };
    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

    // Preallocated connection buffer (avoid per-refresh allocation churn).
    const connectionPositions = new Float32Array(MAX_CONNECTIONS * 6);
    const cursorSphere = new Sphere(new Vector3(), CURSOR_SPHERE_RADIUS);
    const cursorVec = new Vector3();
    let frame = 0;
    let previousTime = performance.now();

    const rebuildConnections = (arr: Float32Array, count: number) => {
      let made = 0;
      for (let i = 0; i < count && made < MAX_CONNECTIONS; i += 1) {
        const i3 = i * 3;
        let best = -1;
        let bestDist = CONNECTION_DISTANCE;
        for (let j = i + 1; j < count; j += 1) {
          const j3 = j * 3;
          const dx = arr[i3] - arr[j3];
          const dy = arr[i3 + 1] - arr[j3 + 1];
          const dz = arr[i3 + 2] - arr[j3 + 2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestDist * bestDist) {
            bestDist = Math.sqrt(d);
            best = j;
          }
        }
        if (best >= 0) {
          const o = made * 6;
          const b3 = best * 3;
          connectionPositions[o] = arr[i3];
          connectionPositions[o + 1] = arr[i3 + 1];
          connectionPositions[o + 2] = arr[i3 + 2];
          connectionPositions[o + 3] = arr[b3];
          connectionPositions[o + 4] = arr[b3 + 1];
          connectionPositions[o + 5] = arr[b3 + 2];
          made += 1;
        }
      }
      const positionAttr = connections.geometry.getAttribute(
        "position",
      ) as BufferAttribute;
      if (positionAttr && positionAttr.array === connectionPositions) {
        positionAttr.needsUpdate = true;
      } else {
        connections.geometry.dispose();
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          "position",
          new BufferAttribute(connectionPositions, 3),
        );
        connections.geometry = geometry;
      }
      connections.geometry.setDrawRange(0, made * 2);
    };

    renderer.setAnimationLoop((time) => {
      const delta = Math.min((time - previousTime) / 1_000, 0.1);
      previousTime = time;
      const t = time * 0.001;
      controls.autoRotate = !pausedRef.current && !reducedMotion.current;
      controls.update();

      const sim = simRef.current;
      if (sim && !pausedRef.current && sim.count > 0) {
        const animate = !reducedMotion.current;
        const posAttr = particles.geometry.getAttribute(
          "position",
        ) as BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const count = sim.count;

        cursorSphere.center.copy(sim.center);
        let targetStrength = 0;
        if (mouseActive.current && animate) {
          raycaster.setFromCamera(mouseNdc.current, camera);
          if (raycaster.ray.intersectSphere(cursorSphere, cursorVec)) {
            targetStrength = 1;
          }
        }
        cursorStrength.current +=
          (targetStrength - cursorStrength.current) * 0.08;

        for (let i = 0; i < count; i += 1) {
          const i3 = i * 3;
          const ph = sim.phase[i];
          let tx = sim.base[i3];
          let ty = sim.base[i3 + 1];
          let tz = sim.base[i3 + 2];
          if (animate) {
            tx += Math.sin(t * 0.6 + ph) * DRIFT;
            ty += Math.cos(t * 0.5 + ph * 1.3) * DRIFT;
            tz += Math.sin(t * 0.45 + ph * 0.7) * DRIFT;
          }
          if (cursorStrength.current > 0.001) {
            const dx = arr[i3] - cursorVec.x;
            const dy = arr[i3 + 1] - cursorVec.y;
            const dz = arr[i3 + 2] - cursorVec.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < REPEL_RADIUS && dist > 0.0001) {
              const force =
                (1 - dist / REPEL_RADIUS) *
                REPEL_STRENGTH *
                cursorStrength.current;
              const inv = 1 / dist;
              tx += dx * inv * force;
              ty += dy * inv * force;
              tz += dz * inv * force;
            }
          }
          arr[i3] += (tx - arr[i3]) * SPRING;
          arr[i3 + 1] += (ty - arr[i3 + 1]) * SPRING;
          arr[i3 + 2] += (tz - arr[i3 + 2]) * SPRING;
        }
        posAttr.needsUpdate = true;

        if (animate) {
          particles.material.size =
            BASE_POINT_SIZE * (1 + 0.08 * Math.sin(t * 1.4));
        }

        frame += 1;
        if (frame % CONNECTION_REFRESH === 0) {
          rebuildConnections(arr, count);
        }
      }

      if (!pausedRef.current && !reducedMotion.current) {
        cloud.rotation.y += delta * 0.025;
        cloud.rotation.x = Math.sin(time * 0.00012) * 0.035;
      }
      renderer.render(scene, camera);
    });

    return () => {
      sceneState.current = null;
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      resizeObserver.disconnect();
      controls.dispose();
      particles.geometry.dispose();
      particles.material.dispose();
      connections.geometry.dispose();
      connections.material.dispose();
      selection.geometry.dispose();
      selection.material.dispose();
      glow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const state = sceneState.current;
    if (!state) return;
    const sim = buildSimulation(points);
    simRef.current = sim;
    state.particles.geometry.dispose();
    state.particles.geometry = buildGeometry(sim);
    state.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, maximumDpr(points.length)),
    );
  }, [points]);

  useEffect(() => {
    const state = sceneState.current;
    if (!state) return;
    const selectedPoint = points.find((point) => point.id === selectedId);
    state.selection.visible = Boolean(selectedPoint);
    if (selectedPoint) {
      state.selection.position.set(
        selectedPoint.x * SCALE,
        selectedPoint.y * SCALE,
        selectedPoint.z * SCALE,
      );
    }
  }, [points, selectedId]);

  useEffect(() => {
    const state = sceneState.current;
    if (!state) return;
    const dark = theme === "dark";
    const background = new Color(dark ? "#0c100f" : "#eef2f0");
    state.scene.background = background;
    state.fog.color.copy(background);
    state.renderer.setClearColor(background);
    state.connections.material.color.set(dark ? "#96b6aa" : "#5b6b64");
    state.selection.material.color.set(dark ? "#ffffff" : "#16201c");
  }, [theme]);

  return <div className="particle-universe" ref={container} />;
}
