import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Agent, Link, ExternalServer } from '../types';

const statusColors = {
  idle: '#6b7280', // gray-500
  working: '#3b82f6', // blue-500
  deploying: '#eab308', // yellow-500
  error: '#ef4444', // red-500
  paused: '#9ca3af', // gray-400
};

function getProvider(agent: Agent): string {
  const explicit = (agent.provider || '').trim();
  if (explicit && explicit !== 'unknown') {
    return explicit.includes('/') ? explicit.split('/')[0] : explicit;
  }

  const model = (agent.model || '').trim();
  if (!model) return 'unknown';
  return model.includes('/') ? model.split('/')[0] : 'unknown';
}

function AgentNode({
  agent,
  position,
  hasActiveSubagents = false,
}: {
  agent: Agent;
  position: [number, number, number];
  hasActiveSubagents?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const hasActiveSession =
    Boolean(agent.activeSessionId) ||
    agent.status === 'working' ||
    agent.status === 'deploying' ||
    hasActiveSubagents;

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (meshRef.current) {
      // Gentle floating animation (local to group)
      meshRef.current.position.y = Math.sin(t * 2 + agent.position[0]) * 0.12;

      // Pulse when node has active session
      const scale = hasActiveSession ? 1 + Math.sin(t * 5 + agent.position[2]) * 0.08 : 1 + Math.sin(t * 2 + agent.position[2]) * 0.02;
      meshRef.current.scale.set(scale, scale, scale);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.8;
      const ringScale = hasActiveSession ? 1 + Math.sin(t * 4) * 0.06 : 1;
      ringRef.current.scale.set(ringScale, ringScale, ringScale);
    }

    if (materialRef.current) {
      materialRef.current.emissiveIntensity = hasActiveSession
        ? 0.45 + Math.sin(t * 5) * 0.35
        : 0.18 + Math.sin(t * 2) * 0.05;
    }
  });

  const color = statusColors[agent.status];

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Outer glow ring */}
      {hasActiveSession && (
        <mesh ref={ringRef}>
          <ringGeometry args={[0.55, 0.62, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      <Html position={[0, -0.7, 0]} center distanceFactor={10}>
        <div className="flex flex-col items-center pointer-events-none">
          <div className="px-2 py-1 bg-black/80 border border-white/10 rounded backdrop-blur-sm whitespace-nowrap min-w-32">
            <p className="text-white text-xs font-bold font-mono">{agent.name}</p>
            <p className="text-blue-300/90 text-[10px] font-mono truncate">{agent.model || 'unknown'}</p>
          </div>
        </div>
      </Html>
    </group>
  );
}

function ServerNode({ server }: { server: ExternalServer }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime + server.position[0]) * 0.05;
    }
  });

  const color = server.status === 'online' ? '#10b981' : '#ef4444'; // emerald-500 or red-500

  return (
    <group position={server.position}>
      <mesh ref={meshRef}>
        <boxGeometry args={[0.6, 0.8, 0.6]} />
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      <Html position={[0, -0.8, 0]} center distanceFactor={10}>
        <div className="flex flex-col items-center pointer-events-none">
          <div className="px-2 py-1 bg-black/80 border border-white/10 rounded backdrop-blur-sm whitespace-nowrap">
            <p className="text-emerald-400 text-xs font-bold font-mono">{server.name}</p>
            <p className="text-white/60 text-[10px] uppercase tracking-wider">{server.type}</p>
          </div>
        </div>
      </Html>
    </group>
  );
}

function Packet({
  sourcePos,
  targetPos,
  color,
  speed = 1.5,
  offset = 0,
}: {
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  color: string;
  speed?: number;
  offset?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const source = useMemo(() => new THREE.Vector3(...sourcePos), [sourcePos]);
  const target = useMemo(() => new THREE.Vector3(...targetPos), [targetPos]);

  useFrame((state) => {
    if (!meshRef.current) return;

    const progress = (state.clock.elapsedTime * speed + offset) % 1;
    meshRef.current.position.lerpVectors(source, target, progress);

    const pulse = 0.8 + Math.sin(state.clock.elapsedTime * 8 + offset * Math.PI * 2) * 0.2;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.07, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} />
    </mesh>
  );
}

function AnimatedLink({
  sourcePos,
  targetPos,
  active,
  type,
  hierarchy = false,
}: {
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  active: boolean;
  type?: 'internal' | 'external';
  hierarchy?: boolean;
}) {
  const lineRef = useRef<any>(null);
  const points = useMemo(() => [new THREE.Vector3(...sourcePos), new THREE.Vector3(...targetPos)], [sourcePos, targetPos]);
  const color = hierarchy ? '#a78bfa' : type === 'external' ? '#10b981' : '#60a5fa';
  const shouldAnimate = active || hierarchy;

  useFrame((state) => {
    if (!lineRef.current) return;

    if (shouldAnimate) {
      lineRef.current.material.dashOffset = -state.clock.elapsedTime * (hierarchy ? 1.4 : 0.9);
    } else {
      lineRef.current.material.dashOffset = 0;
    }
  });

  return (
    <group>
      <Line
        ref={lineRef}
        points={points}
        color={shouldAnimate ? color : '#374151'}
        lineWidth={hierarchy ? 2.4 : shouldAnimate ? 1.8 : 1}
        dashed
        dashScale={shouldAnimate ? (hierarchy ? 26 : 20) : 8}
        dashSize={hierarchy ? 0.8 : 0.6}
        gapSize={hierarchy ? 0.32 : 0.4}
        transparent
        opacity={hierarchy ? 0.95 : shouldAnimate ? 0.85 : 0.3}
      />

      {shouldAnimate && (
        <>
          <Packet sourcePos={sourcePos} targetPos={targetPos} color={color} speed={0.9} offset={0} />
          <Packet sourcePos={sourcePos} targetPos={targetPos} color={color} speed={1.1} offset={0.33} />
          <Packet sourcePos={sourcePos} targetPos={targetPos} color={color} speed={1.3} offset={0.66} />
        </>
      )}
    </group>
  );
}

const isAgentActive = (agent: Agent) => Boolean(agent.activeSessionId) || agent.status === 'working' || agent.status === 'deploying';

export function Scene({ agents, links, externalServers = [] }: { agents: Agent[]; links: Link[]; externalServers?: ExternalServer[] }) {
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const serverMap = useMemo(() => new Map(externalServers.map((server) => [server.id, server])), [externalServers]);

  const activeChildrenCount = useMemo(() => {
    const counts = new Map<string, number>();

    agents.forEach((agent) => {
      if (!agent.parentId || !isAgentActive(agent)) return;
      counts.set(agent.parentId, (counts.get(agent.parentId) ?? 0) + 1);
    });

    return counts;
  }, [agents]);

  const visualAgentPositions = useMemo(() => {
    const positions = new Map<string, [number, number, number]>();

    agents.forEach((agent) => {
      const activeChildCount = activeChildrenCount.get(agent.id) ?? 0;
      const lift = activeChildCount > 0 ? 0.85 + Math.min(activeChildCount - 1, 3) * 0.35 : 0;
      positions.set(agent.id, [agent.position[0], agent.position[1] + lift, agent.position[2]]);
    });

    return positions;
  }, [agents, activeChildrenCount]);

  const derivedHierarchyLinks = useMemo(() => {
    const parentLinks = agents
      .filter((agent) => agent.parentId && agentMap.has(agent.parentId))
      .map((agent) => ({
        source: agent.parentId as string,
        target: agent.id,
        active: isAgentActive(agent),
        type: 'internal' as const,
        hierarchy: true,
      }));

    const seen = new Set(links.map((link) => `${link.source}|${link.target}|${link.type ?? 'internal'}`));
    return parentLinks.filter((link) => !seen.has(`${link.source}|${link.target}|${link.type}`));
  }, [agents, agentMap, links]);

  const allLinks = useMemo(() => [...links, ...derivedHierarchyLinks], [links, derivedHierarchyLinks]);

  return (
    <Canvas camera={{ position: [0, 6, 12], fov: 45 }}>
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 10, 30]} />

      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />

      {/* Grid helper for that cyber feel */}
      <gridHelper args={[30, 30, '#1f2937', '#111827']} position={[0, -2, 0]} />

      <group>
        {externalServers.map((server) => (
          <ServerNode key={server.id} server={server} />
        ))}

        {allLinks.map((link, i) => {
          const sourcePos = visualAgentPositions.get(link.source);
          if (!sourcePos) return null;

          let targetPos: [number, number, number] | undefined;

          if (link.type === 'external') {
            targetPos = serverMap.get(link.target)?.position;
          } else {
            targetPos = visualAgentPositions.get(link.target);
          }

          if (!targetPos) return null;

          return (
            <AnimatedLink
              key={`${link.source}-${link.target}-${link.type ?? 'internal'}-${i}`}
              sourcePos={sourcePos}
              targetPos={targetPos}
              active={link.active}
              type={link.type}
              hierarchy={'hierarchy' in link && Boolean(link.hierarchy)}
            />
          );
        })}

        {agents.map((agent) => (
          <AgentNode
            key={agent.id}
            agent={agent}
            position={visualAgentPositions.get(agent.id) ?? agent.position}
            hasActiveSubagents={(activeChildrenCount.get(agent.id) ?? 0) > 0}
          />
        ))}
      </group>

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        autoRotate={true}
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2 - 0.1} // Don't go below ground
      />

      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
      </EffectComposer>
    </Canvas>
  );
}
