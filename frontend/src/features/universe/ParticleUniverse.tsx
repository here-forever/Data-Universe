import {
  Canvas,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { ParticlePoint } from "../../lib/vibeApi";

interface ParticleUniverseProps {
  paused: boolean;
  points: ParticlePoint[];
  selectedId: number | null;
  theme: "dark" | "light";
  onSelect: (point: ParticlePoint | null) => void;
}

function CameraController({ paused }: { paused: boolean }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.045;
    orbit.enablePan = false;
    orbit.minDistance = 4.2;
    orbit.maxDistance = 16;
    orbit.autoRotateSpeed = 0.35;
    controls.current = orbit;
    return () => orbit.dispose();
  }, [camera, gl]);

  useFrame(() => {
    if (!controls.current) return;
    controls.current.autoRotate = !paused;
    controls.current.update();
  });
  return null;
}

function DataCloud({
  paused,
  points,
  selectedId,
  onSelect,
}: Omit<ParticleUniverseProps, "theme">) {
  const cloud = useRef<THREE.Group>(null);
  const pointObject = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      positions[index * 3] = point.x * 4.8;
      positions[index * 3 + 1] = point.y * 4.8;
      positions[index * 3 + 2] = point.z * 4.8;
      const color = new THREE.Color(point.color);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    next.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return next;
  }, [points]);

  const connections = useMemo(() => {
    const limit = Math.min(points.length - 1, 220);
    const positions = new Float32Array(Math.max(0, limit) * 6);
    for (let index = 0; index < limit; index += 1) {
      const left = points[index];
      const right = points[index + 1];
      positions[index * 6] = left.x * 4.8;
      positions[index * 6 + 1] = left.y * 4.8;
      positions[index * 6 + 2] = left.z * 4.8;
      positions[index * 6 + 3] = right.x * 4.8;
      positions[index * 6 + 4] = right.y * 4.8;
      positions[index * 6 + 5] = right.z * 4.8;
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return next;
  }, [points]);

  useEffect(
    () => () => {
      geometry.dispose();
      connections.dispose();
    },
    [connections, geometry],
  );

  useFrame((state, delta) => {
    if (!cloud.current || paused) return;
    cloud.current.rotation.y += delta * 0.025;
    cloud.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.035;
  });

  const selectedPoint = points.find((point) => point.id === selectedId);
  const selectPoint = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const pointIndex = event.index;
    if (typeof pointIndex === "number") onSelect(points[pointIndex] ?? null);
  };

  return (
    <group ref={cloud}>
      <lineSegments geometry={connections}>
        <lineBasicMaterial color="#96b6aa" transparent opacity={0.075} />
      </lineSegments>
      <points
        geometry={geometry}
        onClick={selectPoint}
        onPointerMissed={() => onSelect(null)}
        ref={pointObject}
      >
        <pointsMaterial
          alphaTest={0.05}
          depthWrite={false}
          opacity={0.93}
          size={0.075}
          sizeAttenuation
          transparent
          vertexColors
        />
      </points>
      {selectedPoint && (
        <mesh
          position={[
            selectedPoint.x * 4.8,
            selectedPoint.y * 4.8,
            selectedPoint.z * 4.8,
          ]}
        >
          <sphereGeometry args={[0.16, 20, 20]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.8}
            wireframe
          />
        </mesh>
      )}
    </group>
  );
}

export default function ParticleUniverse(props: ParticleUniverseProps) {
  const background = props.theme === "dark" ? "#101310" : "#eef1ec";
  return (
    <Canvas
      camera={{ fov: 52, near: 0.1, far: 80, position: [0, 0.4, 9] }}
      dpr={[1, 1.65]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 8, 23]} />
      <DataCloud
        onSelect={props.onSelect}
        paused={props.paused}
        points={props.points}
        selectedId={props.selectedId}
      />
      <CameraController paused={props.paused} />
    </Canvas>
  );
}
