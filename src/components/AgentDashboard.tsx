import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scene } from './Scene';
import { KanbanBoard } from './KanbanBoard';
import { Agent, Link, LogEntry, Message, Skill, SystemInfo, Task, ExternalServer, ConversationThread } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Terminal, Users, Cpu, AlertCircle, CheckCircle2, Play, Square, Settings, Server, Wrench, MessageSquare, Database, Globe, Zap, ArrowRight, X, LayoutDashboard, KanbanSquare, Network, Hash, Key, Layers, LineChart, Power, GripVertical } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getProviderFromModel(model?: string | null): string {
  if (!model || typeof model !== 'string') return 'unknown';
  const trimmed = model.trim();
  if (!trimmed) return 'unknown';

  const slashIndex = trimmed.indexOf('/');
  if (slashIndex > 0) return trimmed.slice(0, slashIndex);

  return 'unknown';
}

function resolveProvider(agent: { provider?: string | null; model?: string | null }): string {
  const explicitProvider = typeof agent.provider === 'string' ? agent.provider.trim() : '';

  if (explicitProvider && explicitProvider !== 'unknown') {
    const slashIndex = explicitProvider.indexOf('/');
    return slashIndex > 0 ? explicitProvider.slice(0, slashIndex) : explicitProvider;
  }

  return getProviderFromModel(agent.model);
}

function normalizeTimestampMs(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;

  // Accept either epoch seconds or epoch milliseconds.
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

function formatRelativeTime(timestamp: number): string {
  const normalized = normalizeTimestampMs(timestamp);
  if (!normalized) return 'never';

  const diffMs = Math.max(0, Date.now() - normalized);
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Initial mock data
const initialAgents: Agent[] = [
  { id: 'core-1', name: 'Orchestrator', role: 'Master Control', status: 'working', currentTask: 'Monitoring sub-agents', parentId: null, position: [0, 2, 0], model: 'gemini-3.1-pro-preview', contextWindow: 2000000, currentTokens: 145000, activeSessionId: 'sess-alpha-001' },
  { id: 'worker-1', name: 'Data Miner Alpha', role: 'Data Extraction', status: 'idle', currentTask: 'Awaiting instructions', parentId: 'core-1', position: [-3, 0, -2], model: 'gemini-3-flash-preview', contextWindow: 1000000, currentTokens: 1200, activeSessionId: 'sess-beta-042' },
  { id: 'worker-2', name: 'Analyzer Beta', role: 'Data Processing', status: 'working', currentTask: 'Processing dataset X', parentId: 'core-1', position: [3, 0, -2], model: 'gemini-3.1-pro-preview', contextWindow: 2000000, currentTokens: 850000, activeSessionId: 'sess-gamma-099' },
  { id: 'worker-3', name: 'Comms Relay', role: 'External API', status: 'idle', currentTask: 'Idle', parentId: 'core-1', position: [0, 0, 3], model: 'gemini-3-flash-preview', contextWindow: 1000000, currentTokens: 450, activeSessionId: 'sess-delta-112' },
];

const initialExternalServers: ExternalServer[] = [];

const initialLinks: Link[] = [
  { source: 'core-1', target: 'worker-1', active: false },
  { source: 'core-1', target: 'worker-2', active: true },
  { source: 'core-1', target: 'worker-3', active: false },
];

const initialLogs: LogEntry[] = [
  { id: '1', timestamp: Date.now() - 10000, message: 'System initialized.', type: 'success' },
  { id: '2', timestamp: Date.now() - 8000, message: 'Orchestrator online.', type: 'info', sourceId: 'core-1' },
  { id: '3', timestamp: Date.now() - 5000, message: 'Analyzer Beta started processing dataset X.', type: 'info', sourceId: 'worker-2' },
];

const initialSkills: Skill[] = [
  { id: 'sk-1', name: 'web_search', description: 'Search the internet for real-time information.', usageCount: 142, lastUsed: Date.now() - 120000, status: 'online' },
  { id: 'sk-2', name: 'code_execution', description: 'Execute Python/JS code in a secure sandbox.', usageCount: 89, lastUsed: Date.now() - 300000, status: 'online' },
  { id: 'sk-3', name: 'database_query', description: 'Query internal knowledge base and SQL databases.', usageCount: 456, lastUsed: Date.now() - 5000, status: 'online' },
  { id: 'sk-4', name: 'image_generation', description: 'Generate images using diffusion models.', usageCount: 12, lastUsed: Date.now() - 86400000, status: 'degraded' },
];

const initialSystemInfo: SystemInfo = {
  version: 'v2.4.1-beta',
  uptime: 0,
  gatewayLatency: 45,
  cpuUsage: 12,
  memoryUsage: 34,
  activeConnections: 4,
};

const initialMessages: Message[] = [
  { id: 'm-1', sourceId: 'core-1', targetId: 'worker-2', content: 'Analyze dataset X for anomalies.', response: 'Analysis in progress. ETA 2 mins.', timestamp: Date.now() - 4000, status: 'delivered', tokensUsed: 145 },
];

const initialTasks: Task[] = [];
const initialConversationThreads: ConversationThread[] = [];

type ViewMode = 'overview' | 'kanban' | 'network' | 'metrics';

// Resizable Panel Hook
function useResizablePanel(initialSize: number, minSize: number, maxSize: number, direction: 'horizontal' | 'vertical' = 'horizontal') {
  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(initialSize);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSizeRef.current = size;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      const newSize = Math.max(minSize, Math.min(maxSize, startSizeRef.current + delta));
      setSize(newSize);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [size, minSize, maxSize, direction]);

  return { size, setSize, isResizing, handleMouseDown, startResize: handleMouseDown };
}

// Resize Handle Component
function ResizeHandle({ direction, isResizing, onMouseDown }: { direction?: 'horizontal' | 'vertical'; isResizing: boolean; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className={cn(
        "shrink-0 z-20 flex items-center justify-center",
        direction === 'vertical' ? "h-1 cursor-row-resize hover:bg-blue-500/50" : "w-1 cursor-col-resize hover:bg-blue-500/50",
        isResizing ? "bg-blue-500" : "bg-white/10 hover:bg-white/30"
      )}
      style={direction === 'vertical' ? { width: '100%' } : { height: '100%' }}
      onMouseDown={onMouseDown}
    >
      <GripVertical className={cn("w-3 h-3 text-white/50", direction === 'vertical' && "rotate-90")} />
    </div>
  );
}

// Mock data for charts
const generateChartData = (points: number, min: number, max: number) => {
  return Array.from({ length: points }, (_, i) => ({
    time: i,
    value: Math.floor(Math.random() * (max - min + 1)) + min
  }));
};

export function AgentDashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  
  // Panel sizes for resizable panels
  const [leftPanelSize, setLeftPanelSize] = useState(280);
  const [rightPanelSize, setRightPanelSize] = useState(320);
  const [bottomPanelSize, setBottomPanelSize] = useState(256);
  
  // Resize handlers
  const leftPanel = useResizablePanel(leftPanelSize, 200, 450, 'horizontal');
  const rightPanel = useResizablePanel(rightPanelSize, 250, 500, 'horizontal');
  const bottomPanel = useResizablePanel(bottomPanelSize, 120, 400, 'vertical');

  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [externalServers, setExternalServers] = useState<ExternalServer[]>(initialExternalServers);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(initialSystemInfo);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [conversationThreads, setConversationThreads] = useState<ConversationThread[]>(initialConversationThreads);
  const [isRunning, setIsRunning] = useState(true);
  
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'agents' | 'messages'>('agents');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'logs' | 'comms'>('logs');

  // Chart state
  const [cpuData, setCpuData] = useState(generateChartData(20, 10, 40));
  const [tokenData, setTokenData] = useState(generateChartData(20, 1000, 5000));
  const [tokenUsageByAgent, setTokenUsageByAgent] = useState<Array<{ agentId: string; agentName: string; totalTokens: number; activeSessionCount: number }>>([]);

  // Fetch real data from API
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard', { cache: 'no-store' });
        const data = await res.json();
        
        if (data.agents) {
          const parseAgentId = (sessionKey?: string | null) => {
            if (!sessionKey || typeof sessionKey !== 'string') return null;
            const match = sessionKey.match(/^agent:([^:]+)/);
            return match?.[1] || null;
          };

          const activeByAgent = new Map<string, any>();
          (data.activeSessions || []).forEach((s: any) => {
            if (s?.agentId) activeByAgent.set(s.agentId, s);
          });

          // Map OpenClaw agents to dashboard format (using real API fields)
          const mappedAgents: Agent[] = data.agents.map((a: any, i: number) => {
            const liveSession = activeByAgent.get(a.id);
            const updatedAt = typeof liveSession?.updatedAt === 'number'
              ? liveSession.updatedAt
              : Date.parse(liveSession?.updatedAt || '') || 0;
            const hasRecentActivity = Boolean(updatedAt) && (Date.now() - updatedAt) <= (2 * 60 * 1000);
            const isWorking = (a.status === 'working') || hasRecentActivity;

            const normalizedStatus = ['idle', 'working', 'deploying', 'error', 'paused'].includes(a.status)
              ? a.status
              : 'idle';

            const provider = resolveProvider(a);
            const rawConnectedTo = typeof a.connectedTo === 'string' ? a.connectedTo.trim() : '';
            const connectedTo = rawConnectedTo
              ? (rawConnectedTo.includes('/') ? getProviderFromModel(rawConnectedTo) : rawConnectedTo)
              : provider;
            const connectionStatus = (hasRecentActivity || a.connectionStatus === 'connected') ? 'connected' : 'disconnected';
            const latencyMs = connectionStatus === 'connected'
              ? (a.latencyMs ?? Math.max(8, Math.min(999, Math.round((Date.now() - (updatedAt || Date.now())) / 10) + 12)))
              : null;

            return {
              id: a.id,
              name: a.name || a.id,
              role: a.role || a.id,
              status: isWorking ? 'working' : normalizedStatus,
              currentTask: hasRecentActivity
                ? `Connected to: ${connectedTo}${latencyMs !== null ? ` (${latencyMs}ms)` : ''}`
                : (a.currentTask || `Disconnected from: ${provider}`),
              parentId: a.parentId ?? null,
              position: [(i % 5) * 3 - 6, 0, Math.floor(i / 5) * 3 - 3] as [number, number, number],
              model: a.model || 'unknown',
              provider,
              connectedTo,
              connectionStatus,
              latencyMs,
              contextWindow: a.contextWindow || 200000,
              currentTokens: a.currentTokens ?? liveSession?.totalTokens ?? 0,
              activeSessionId: hasRecentActivity ? (a.activeSessionId || liveSession?.sessionId || '') : '',
              lastActivityAt: updatedAt || 0
            };
          });

          const agentById = new Map<string, Agent>(mappedAgents.map((agent) => [agent.id, agent]));
          const subAgentsFromSessions = (data.activeSessions || [])
            .filter((s: any) => typeof s?.sessionKey === 'string' && s.sessionKey.includes(':subagent:'))
            .map((s: any, index: number) => {
              const parentId = parseAgentId(s.spawnedBy);
              const parent = parentId ? agentById.get(parentId) : null;
              const position: [number, number, number] = parent
                ? [parent.position[0] + ((index % 3) - 1) * 1.4, parent.position[1] - 2, parent.position[2] + (Math.floor(index / 3) + 1) * 1.2]
                : [((index % 5) * 2.2) - 4.4, -2, Math.floor(index / 5) * 1.8 + 2];

              return {
                id: s.sessionKey,
                name: `Subagent ${String(s.sessionId || '').slice(-4)}`,
                role: 'Subagent Task',
                status: s.isActive ? 'working' as const : 'idle' as const,
                currentTask: s.isActive
                  ? 'Connected to: parent-session'
                  : 'Disconnected from: parent-session',
                parentId: parentId,
                position,
                model: 'subagent',
                provider: 'subagent',
                connectedTo: 'parent-session',
                connectionStatus: s.isActive ? 'connected' : 'disconnected',
                latencyMs: s.isActive ? 0 : null,
                contextWindow: 200000,
                currentTokens: s.totalTokens || 0,
                activeSessionId: s.isActive ? (s.sessionId || '') : '',
                lastActivityAt: Date.parse(s.updatedAt || '') || 0
              } as Agent;
            });

          setAgents([...mappedAgents, ...subAgentsFromSessions]);
        }
        
        if (data.systemInfo || data.metrics) {
          setSystemInfo({
            version: data.systemInfo?.version || '2026.2.25',
            uptime: data.systemInfo?.uptime || 0,
            gatewayLatency: data.systemInfo?.gatewayLatency || 0,
            cpuUsage: data.metrics?.cpuUsage ?? data.systemInfo?.cpuUsage ?? 0,
            memoryUsage: data.metrics?.memoryUsage ?? data.systemInfo?.memoryUsage ?? 0,
            activeConnections: data.metrics?.activeConnections ?? data.systemInfo?.activeConnections ?? 0
          });
        }
        
        if (data.skills) {
          // Map skills
          const allSkills = [
            ...(data.skills.global || []).map((s: any) => ({
              id: s.id || s.name,
              name: s.name,
              description: s.description || '',
              usageCount: s.usageCount || 0,
              lastUsed: normalizeTimestampMs(s.lastUsed || 0),
              status: 'online' as const
            })),
            ...(data.skills.user || []).map((s: any) => ({
              id: s.id || s.skill,
              name: s.skill || s.name,
              description: s.description || 'Custom skill',
              usageCount: s.usageCount || 0,
              lastUsed: normalizeTimestampMs(s.lastUsed || 0),
              status: 'online' as const
            }))
          ];
          setSkills(allSkills);
        }
        
        if (data.logs) {
          setLogs(data.logs.map((l: any, i: number) => ({
            id: l.id || `log-${i}`,
            timestamp: l.timestamp || Date.now(),
            message: l.message,
            type: l.type || 'info',
            sourceId: l.sourceId
          })));
        }
        
        if (data.messages) {
          setMessages(data.messages.map((m: any, i: number) => ({
            id: m.id || `msg-${i}`,
            sourceId: m.sourceId,
            targetId: m.targetId || 'composer',
            content: m.content || m.preview || '',
            timestamp: m.timestamp || Date.now(),
            status: 'delivered' as const,
            tokensUsed: m.tokensUsed || 0,
            role: m.role,
            sessionId: m.sessionId,
            sessionKey: m.sessionKey,
          })));
        }

        if (data.conversationThreads) {
          setConversationThreads(data.conversationThreads);
          setSelectedThreadId((prev: string | null) => {
            if (prev && data.conversationThreads.some((thread: ConversationThread) => thread.id === prev)) return prev;
            return data.conversationThreads[0]?.id || null;
          });
        }

        if (data.links) {
          setLinks(data.links.map((l: any) => ({
            source: l.source,
            target: l.target,
            active: Boolean(l.active),
            type: l.type === 'external' ? 'external' : 'internal'
          })));
        }

        if (data.externalServers) {
          setExternalServers(data.externalServers.map((s: any) => ({
            id: s.id,
            name: s.name,
            type: s.type === 'database' || s.type === 'web' ? s.type : 'api',
            position: Array.isArray(s.position) && s.position.length === 3
              ? [Number(s.position[0]) || 0, Number(s.position[1]) || 0, Number(s.position[2]) || 0] as [number, number, number]
              : [0, 2, 0] as [number, number, number],
            status: s.status === 'offline' ? 'offline' : 'online'
          })));
        }

        if (data.tasks) {
          setTasks(data.tasks.map((t: any, i: number) => ({
            id: t.id || `task-${i}`,
            title: t.title || 'Untitled task',
            description: t.description || '',
            status: ['todo', 'in-progress', 'review', 'done'].includes(t.status) ? t.status : 'todo',
            assignedTo: t.assignedTo ?? null,
            progress: typeof t.progress === 'number' ? Math.max(0, Math.min(100, t.progress)) : 0,
            priority: ['low', 'medium', 'high', 'critical'].includes(t.priority) ? t.priority : 'medium'
          })));
        }
        
        if (data.metrics) {
          setCpuData(curr => [...curr.slice(1), { time: curr[curr.length - 1].time + 1, value: data.metrics.cpuUsage || 0 }]);
          setTokenData(curr => [...curr.slice(1), { time: curr[curr.length - 1].time + 1, value: data.metrics.totalTokens || 0 }]);
          setTokenUsageByAgent(data.metrics.tokenUsageByAgent || []);
        } else if (data.activeSessions) {
          // Backward compatibility if metrics is missing
          const totalTokens = data.activeSessions.reduce((sum: number, s: any) => sum + (s.totalTokens || 0), 0);
          setTokenData(curr => [...curr.slice(1), { time: curr[curr.length - 1].time + 1, value: totalTokens }]);
        }
      } catch (e) {
        console.error('Failed to fetch dashboard data:', e);
      }
    }
    
    // Initial fetch
    fetchData();
    
    // Poll every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Lightweight visual updates (do not overwrite real CPU/memory metrics from API)
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSystemInfo(prev => ({
        ...prev,
        uptime: prev.uptime + 3,
        gatewayLatency: Math.max(10, Math.min(200, prev.gatewayLatency + (Math.random() * 20 - 10))),
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const selectedThread = conversationThreads.find((thread) => thread.id === selectedThreadId) || null;
  const selectedAgentMessages = messages.filter(m => m.sourceId === selectedAgentId || m.targetId === selectedAgentId);
  const onlineAgents = agents.filter(a => a.status === 'working');
  const offlineAgents = agents.filter(a => a.status !== 'working');
  const rosterAgents = [...agents].sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));

  return (
    <div className="w-full h-screen bg-[#050505] text-white overflow-hidden font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-black/50 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-500/20 border border-blue-500/50 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">OpenClaw Command Center</h1>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span className="flex items-center gap-1">
                <div className={cn("w-2 h-2 rounded-full", isRunning ? "bg-green-500" : "bg-red-500")} />
                {isRunning ? 'System Active' : 'System Halted'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
          <button 
            onClick={() => setViewMode('overview')}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors", viewMode === 'overview' ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80")}
          >
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button 
            onClick={() => setViewMode('kanban')}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors", viewMode === 'kanban' ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80")}
          >
            <KanbanSquare className="w-4 h-4" /> Tasks
          </button>
          <button 
            onClick={() => setViewMode('network')}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors", viewMode === 'network' ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80")}
          >
            <Network className="w-4 h-4" /> Network
          </button>
          <button 
            onClick={() => setViewMode('metrics')}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors", viewMode === 'metrics' ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80")}
          >
            <LineChart className="w-4 h-4" /> Metrics
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-md border border-white/10">
            <Users className="w-4 h-4 text-white/50" />
            <span className="text-sm font-mono">{agents.length} Agents</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-md border border-white/10">
            <Activity className="w-4 h-4 text-white/50" />
            <span className="text-sm font-mono">{agents.filter(a => a.status === 'working').length} Active</span>
          </div>
          <div className="h-6 w-px bg-white/10 mx-2" />
          <button 
            onClick={() => setIsRunning(!isRunning)}
            className={cn(
              "p-2 rounded-md border transition-colors",
              isRunning 
                ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" 
                : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
            )}
          >
            {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button className="p-2 rounded-md border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - System & Skills (Only in Overview/Network) */}
        {(viewMode === 'overview' || viewMode === 'network') && (
          <>
            <div style={{ width: leftPanel.size }} className="border-r border-white/10 bg-black/50 backdrop-blur-md flex flex-col z-10 shrink-0 overflow-y-auto">
            {/* System Info */}
            <div className="p-4 border-b border-white/10">
              <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-white/70 mb-4">
                <Server className="w-4 h-4" />
                Gateway Status
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/50">Version</span>
                  <span className="font-mono text-white/80">{systemInfo.version}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/50">Latency</span>
                  <span className={cn("font-mono", systemInfo.gatewayLatency > 100 ? "text-yellow-400" : "text-green-400")}>
                    {systemInfo.gatewayLatency.toFixed(0)}ms
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/50">CPU Usage</span>
                    <span className="font-mono text-white/80">{systemInfo.cpuUsage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${systemInfo.cpuUsage}%` }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/50">Memory</span>
                    <span className="font-mono text-white/80">{systemInfo.memoryUsage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${systemInfo.memoryUsage}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Power Status */}
            <div className="p-4 border-b border-white/10">
              <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-white/70 mb-4">
                <Power className="w-4 h-4" />
                Agent Status
              </h2>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-md border border-green-500/30 bg-green-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-green-300/70">ON</div>
                  <div className="text-lg font-bold font-mono text-green-300">{onlineAgents.length}</div>
                </div>
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-red-300/70">OFF</div>
                  <div className="text-lg font-bold font-mono text-red-300">{offlineAgents.length}</div>
                </div>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {agents.map(agent => {
                  const isOn = agent.status === 'working';
                  const provider = resolveProvider(agent);

                  return (
                    <button
                      key={`status-${agent.id}`}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="w-full flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-left hover:bg-white/10 transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-mono text-white/80 truncate">{agent.name}</div>
                        {isOn && provider !== 'unknown' && (
                          <div className="text-[10px] text-blue-300/80 font-mono truncate">{provider}</div>
                        )}
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded border",
                        isOn
                          ? "text-green-300 bg-green-500/15 border-green-500/40"
                          : "text-red-300 bg-red-500/15 border-red-500/40"
                      )}>
                        {isOn ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Skills */}
            <div className="p-4 flex-1">
              <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-white/70 mb-4">
                <Wrench className="w-4 h-4" />
                Available Skills
              </h2>
              <div className="space-y-3">
                {skills.map(skill => (
                  <div key={skill.id} className="p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {skill.name === 'web_search' && <Globe className="w-3.5 h-3.5 text-blue-400" />}
                        {skill.name === 'code_execution' && <Terminal className="w-3.5 h-3.5 text-green-400" />}
                        {skill.name === 'database_query' && <Database className="w-3.5 h-3.5 text-purple-400" />}
                        {skill.name === 'image_generation' && <Zap className="w-3.5 h-3.5 text-yellow-400" />}
                        <span className="text-xs font-bold font-mono">{skill.name}</span>
                      </div>
                      <div className={cn("w-1.5 h-1.5 rounded-full", skill.status === 'online' ? "bg-green-500" : "bg-yellow-500")} />
                    </div>
                    <p className="text-[10px] text-white/50 mb-2 leading-tight">{skill.description}</p>
                    <div className="flex justify-between items-center text-[10px] font-mono text-white/40">
                      <span>Uses: {skill.usageCount}</span>
                      <span>Last: {formatRelativeTime(skill.lastUsed)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>
            {/* Left Panel Resize Handle */}
            <ResizeHandle direction="horizontal" isResizing={leftPanel.isResizing} onMouseDown={leftPanel.startResize} />
          </>
        )}

        {/* Main Content Area */}
        {viewMode === 'overview' ? (
          <div className="flex-1 relative bg-black">
            <Scene agents={agents} links={links} externalServers={[]} />
            
            {/* Viewport Overlay */}
            <div className="absolute top-4 left-4 pointer-events-none">
              <div className="px-3 py-1.5 bg-black/50 backdrop-blur-md border border-white/10 rounded-md text-xs font-mono text-white/50 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                LIVE HIERARCHY VIEW
              </div>
            </div>
          </div>
        ) : viewMode === 'network' ? (
          <div className="flex-1 relative bg-black overflow-y-auto p-6">
            {/* Network View: Provider Boxes */}
            <div className="absolute top-4 left-4 pointer-events-none z-10">
              <div className="px-3 py-1.5 bg-black/50 backdrop-blur-md border border-white/10 rounded-md text-xs font-mono text-white/50 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                NETWORK TOPOLOGY VIEW
              </div>
            </div>
            
            {/* Provider Boxes Grid */}
            <div className="mt-12 max-w-6xl mx-auto">
              <h2 className="text-xl font-bold tracking-tight mb-6 flex items-center gap-2">
                <Network className="w-5 h-5" />
                Provider Network
              </h2>
              
              {/* Group agents by provider */}
              {(() => {
                const providers = [...new Set(agents.map(a => resolveProvider(a)))];
                const providerColors: Record<string, string> = {
                  'google': '#4285f4',
                  'openai': '#10a37f', 
                  'anthropic': '#d97757',
                  'cohere': '#39594d',
                  'mistral': '#cb8c38',
                  'subagent': '#8b5cf6',
                  'unknown': '#6b7280'
                };
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {providers.map(provider => {
                      const providerAgents = agents.filter(a => resolveProvider(a) === provider);
                      const color = providerColors[provider] || '#6b7280';
                      
                      return (
                        <div 
                          key={provider}
                          className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
                        >
                          {/* Provider Box Header */}
                          <div 
                            className="px-4 py-3 border-b border-white/10 flex items-center gap-3"
                            style={{ backgroundColor: `${color}15` }}
                          >
                            <div 
                              className="w-10 h-10 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: `${color}30` }}
                            >
                              <Server className="w-5 h-5" style={{ color }} />
                            </div>
                            <div>
                              <h3 className="font-bold text-white capitalize">{provider}</h3>
                              <p className="text-xs text-white/50">{providerAgents.length} agent{providerAgents.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          
                          {/* Connected Agents */}
                          <div className="p-3 space-y-2">
                            {providerAgents.map(agent => {
                              const isOn = agent.status === 'working';
                              return (
                                <div 
                                  key={agent.id}
                                  className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/5 hover:border-white/20 transition-colors cursor-pointer"
                                  onClick={() => setSelectedAgentId(agent.id)}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={cn(
                                      "w-2 h-2 rounded-full shrink-0",
                                      isOn ? "bg-green-500 animate-pulse" : "bg-gray-500"
                                    )} />
                                    <div className="min-w-0">
                                      <div className="text-xs font-mono text-white truncate">{agent.name}</div>
                                      <div className="text-[10px] text-white/50 truncate">{agent.model || 'unknown'}</div>
                                    </div>
                                  </div>
                                  <OnOffBadge isOn={isOn} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              
              {/* External Servers Section */}
              {externalServers.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    External Services
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {externalServers.map(server => (
                      <div 
                        key={server.id}
                        className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3"
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          server.status === 'online' ? "bg-emerald-500/20" : "bg-red-500/20"
                        )}>
                          <Database className={cn(
                            "w-5 h-5",
                            server.status === 'online' ? "text-emerald-400" : "text-red-400"
                          )} />
                        </div>
                        <div>
                          <div className="text-sm font-mono text-white">{server.name}</div>
                          <div className="text-[10px] text-white/50 uppercase">{server.type} • {server.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard 
            tasks={tasks} 
            agents={agents} 
            onUpdateTask={(id, updates) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))} 
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0a]">
            <div className="max-w-6xl mx-auto space-y-6">
              <h2 className="text-xl font-bold tracking-tight">System Metrics</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="text-xs text-white/50 uppercase tracking-wider mb-1">CPU Usage</div>
                  <div className="text-2xl font-mono text-blue-300">{systemInfo.cpuUsage.toFixed(1)}%</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="text-xs text-white/50 uppercase tracking-wider mb-1">Memory Usage</div>
                  <div className="text-2xl font-mono text-purple-300">{systemInfo.memoryUsage.toFixed(1)}%</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="text-xs text-white/50 uppercase tracking-wider mb-1">Active Connections</div>
                  <div className="text-2xl font-mono text-green-300">{systemInfo.activeConnections}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="text-xs text-white/50 uppercase tracking-wider mb-1">Total Tokens</div>
                  <div className="text-2xl font-mono text-yellow-300">{tokenData[tokenData.length - 1]?.value?.toLocaleString?.() || 0}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* CPU Usage Chart */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                    <Cpu className="w-4 h-4" /> CPU Usage (%)
                  </h3>
                  <div className="h-48 flex items-end gap-1">
                    {cpuData.map((d, i) => (
                      <div key={i} className="flex-1 bg-blue-500/20 rounded-t relative group">
                        <div 
                          className="absolute bottom-0 w-full bg-blue-500 rounded-t transition-all duration-300"
                          style={{ height: `${d.value}%` }}
                        />
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap z-10">
                          {d.value.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Token Usage Chart */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                    <Hash className="w-4 h-4" /> Token Consumption (per tick)
                  </h3>
                  <div className="h-48 flex items-end gap-1">
                    {tokenData.map((d, i) => {
                      const maxTokens = Math.max(...tokenData.map(t => t.value), 1000);
                      const height = (d.value / maxTokens) * 100;
                      return (
                        <div key={i} className="flex-1 bg-purple-500/20 rounded-t relative group">
                          <div 
                            className="absolute bottom-0 w-full bg-purple-500 rounded-t transition-all duration-300"
                            style={{ height: `${height}%` }}
                          />
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap z-10">
                            {d.value} tkns
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Agent Token Breakdown */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Token Usage per Agent
                </h3>
                <div className="space-y-4">
                  {(tokenUsageByAgent.length > 0
                    ? tokenUsageByAgent.map(item => ({
                        id: item.agentId,
                        name: item.agentName,
                        totalTokens: item.totalTokens,
                        activeSessionCount: item.activeSessionCount,
                      }))
                    : agents.map(agent => ({
                        id: agent.id,
                        name: agent.name,
                        totalTokens: agent.currentTokens || 0,
                        activeSessionCount: agent.status === 'working' ? 1 : 0,
                      }))
                  ).map(agentMetric => {
                    const maxTokens = Math.max(
                      ...(tokenUsageByAgent.length > 0
                        ? tokenUsageByAgent.map(a => a.totalTokens)
                        : agents.map(a => a.currentTokens || 0)),
                      1
                    );

                    return (
                      <div key={agentMetric.id} className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono text-white/80">{agentMetric.name}</span>
                          <span className="font-mono text-white/60">
                            {agentMetric.totalTokens.toLocaleString()} tkns • {agentMetric.activeSessionCount} active
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-500",
                              agentMetric.activeSessionCount > 0 ? "bg-purple-500" : "bg-gray-500"
                            )}
                            style={{ width: `${Math.min(100, (agentMetric.totalTokens / maxTokens) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Sidebar - Agent List & Details (Only in Overview/Network) */}
        {(viewMode === 'overview' || viewMode === 'network') && (
          <>
            {/* Right Panel Resize Handle */}
            <ResizeHandle direction="horizontal" isResizing={rightPanel.isResizing} onMouseDown={rightPanel.startResize} />
            <div style={{ width: rightPanel.size }} className="border-l border-white/10 bg-black/50 backdrop-blur-md flex flex-col z-10 shrink-0">
            <div className="p-2 border-b border-white/10 bg-black/40 flex gap-1">
              <button
                onClick={() => setRightTab('agents')}
                className={cn("flex-1 px-3 py-1.5 text-xs rounded border", rightTab === 'agents' ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-white/10 text-white/60 hover:text-white")}
              >
                Agents
              </button>
              <button
                onClick={() => setRightTab('messages')}
                className={cn("flex-1 px-3 py-1.5 text-xs rounded border", rightTab === 'messages' ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-white/10 text-white/60 hover:text-white")}
              >
                Messages
              </button>
            </div>

            {rightTab === 'agents' ? (
              selectedAgent ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-white/70">
                      Agent Details
                    </h2>
                    <button onClick={() => setSelectedAgentId(null)} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 border-b border-white/10">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold font-mono text-white">{selectedAgent.name}</h3>
                        <p className="text-xs text-white/50 uppercase tracking-wider">{selectedAgent.role}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <OnOffBadge isOn={selectedAgent.status === 'working'} />
                        <StatusBadge status={selectedAgent.status} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-black/30 border border-white/10 rounded p-2">
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">Model</div>
                        <div className="text-xs font-mono text-white/90 truncate">{selectedAgent.model || 'unknown'}</div>
                      </div>
                      <div className="bg-black/30 border border-white/10 rounded p-2">
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">Provider</div>
                        <div className="text-xs font-mono text-blue-300 truncate">{resolveProvider(selectedAgent)}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs text-white/50 uppercase tracking-wider">Current Task</div>
                      <div className="text-sm text-white/90 bg-black/30 p-3 rounded border border-white/5 font-mono">{selectedAgent.currentTask}</div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="text-xs text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Recent Comms
                    </div>
                    <div className="space-y-3">
                      {selectedAgentMessages.length === 0 ? (
                        <div className="text-xs text-white/30 italic">No recent communications.</div>
                      ) : (
                        selectedAgentMessages.map(msg => (
                          <div key={msg.id} className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs">
                            <div className="flex items-center justify-between text-white/50 font-mono text-[10px] mb-2">
                              <span>[{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]</span>
                              <span className="text-white/40">{msg.sourceId} → {msg.targetId}</span>
                            </div>
                            <div className="text-white/80">{msg.content}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-white/70">
                      <Users className="w-4 h-4" />
                      Agent Roster
                    </h2>
                    <p className="text-[10px] text-white/40 mt-1">Name • Status • Model • Provider • Last Active • Tokens • Session ID</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <AnimatePresence>
                      <div className="flex flex-col gap-3">
                        {rosterAgents.map(agent => {
                          const provider = resolveProvider(agent);
                          const isOn = agent.status === 'working';
                          const sessionId = agent.activeSessionId?.trim();

                          return (
                            <motion.button
                              key={agent.id}
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              onClick={() => setSelectedAgentId(agent.id)}
                              className="w-full text-left rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="font-mono font-bold text-white truncate">{agent.name}</div>
                                <OnOffBadge isOn={isOn} />
                              </div>

                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-white/45 uppercase tracking-wider">Model</span>
                                  <span className="font-mono text-white/85 truncate">{agent.model || 'unknown'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-white/45 uppercase tracking-wider">Provider</span>
                                  <span className="font-mono text-blue-300/90 truncate">{provider}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-white/45 uppercase tracking-wider">Last Active</span>
                                  <span className="font-mono text-white/70">{formatRelativeTime(agent.lastActivityAt || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-white/45 uppercase tracking-wider">Tokens</span>
                                  <span className="font-mono text-white/85">{(agent.currentTokens || 0).toLocaleString()}</span>
                                </div>
                                <div className="pt-1 border-t border-white/10">
                                  <div className="text-white/45 uppercase tracking-wider mb-1">Session ID</div>
                                  <div className="font-mono text-purple-300/80 text-[11px] break-all">{sessionId || '-'}</div>
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </AnimatePresence>
                  </div>
                </>
              )
            ) : (
              <div className="flex-1 flex overflow-hidden">
                <div className="w-36 border-r border-white/10 overflow-y-auto p-2 space-y-2">
                  {conversationThreads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={cn(
                        "w-full text-left p-2 rounded border text-[10px]",
                        selectedThreadId === thread.id ? "border-purple-500/40 bg-purple-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                      )}
                    >
                      <div className="font-mono text-white/80 truncate">{thread.parentAgentName} →</div>
                      <div className="font-mono text-purple-300 truncate">{thread.subagentName}</div>
                      <div className="text-white/40 mt-1">{new Date(thread.updatedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}</div>
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {!selectedThread ? (
                    <div className="text-xs text-white/40 italic">Select an agent/sub-agent pair to inspect messages.</div>
                  ) : selectedThread.messages.length === 0 ? (
                    <div className="text-xs text-white/40 italic">No messages captured yet for this thread.</div>
                  ) : (
                    selectedThread.messages.map((msg) => {
                      const isParent = msg.sourceId === selectedThread.parentAgentId;
                      return (
                        <div key={msg.id} className={cn("max-w-[90%] rounded-lg border px-3 py-2 text-xs", isParent ? "ml-auto bg-blue-500/10 border-blue-500/30" : "mr-auto bg-purple-500/10 border-purple-500/30")}>
                          <div className="text-[10px] text-white/50 mb-1">[{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}] {isParent ? selectedThread.parentAgentName : selectedThread.subagentName}</div>
                          <div className="text-white/85 whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      {/* Bottom Panel - Terminal Logs & Comms */}
      <div className="h-64 border-t border-white/10 bg-[#0a0a0a] flex flex-col z-10 shrink-0">
        <div className="flex items-center border-b border-white/10 bg-black/50 px-2">
          <button 
            onClick={() => setBottomTab('logs')}
            className={cn(
              "px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors",
              bottomTab === 'logs' ? "border-blue-500 text-blue-400" : "border-transparent text-white/50 hover:text-white/70"
            )}
          >
            <Terminal className="w-4 h-4" />
            System Logs
          </button>
          <button 
            onClick={() => setBottomTab('comms')}
            className={cn(
              "px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors",
              bottomTab === 'comms' ? "border-purple-500 text-purple-400" : "border-transparent text-white/50 hover:text-white/70"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Comms Intercept
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
          {bottomTab === 'logs' ? (
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {logs.map(log => {
                  const sourceAgent = log.sourceId ? agents.find(a => a.id === log.sourceId) : null;
                  return (
                    <motion.div 
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-3 hover:bg-white/5 p-1 rounded transition-colors"
                    >
                      <span className="text-white/30 shrink-0">
                        [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
                      </span>
                      <span className={cn(
                        "shrink-0",
                        log.type === 'info' && "text-blue-400",
                        log.type === 'success' && "text-green-400",
                        log.type === 'warning' && "text-yellow-400",
                        log.type === 'error' && "text-red-400",
                      )}>
                        {log.type === 'info' && '>'}
                        {log.type === 'success' && '✓'}
                        {log.type === 'warning' && '⚠'}
                        {log.type === 'error' && '✖'}
                      </span>
                      {sourceAgent && (
                        <span className="text-white/50 shrink-0">
                          [{sourceAgent.name}]
                        </span>
                      )}
                      <span className={cn(
                        "text-white/80",
                        log.type === 'error' && "text-red-300"
                      )}>
                        {log.message}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {messages.map(msg => {
                  const source = agents.find(a => a.id === msg.sourceId) || externalServers.find(s => s.id === msg.sourceId);
                  const target = agents.find(a => a.id === msg.targetId) || externalServers.find(s => s.id === msg.targetId);
                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-1 bg-white/5 p-2 rounded border border-white/5"
                    >
                      <div className="flex items-center gap-2 text-[10px] text-white/40">
                        <span>[{new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]</span>
                        <span className="text-blue-400">{source?.name || msg.sourceId}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="text-purple-400">{target?.name || msg.targetId}</span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className="flex items-center gap-1 text-purple-400/70 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                            <Hash className="w-3 h-3" /> {msg.tokensUsed}
                          </span>
                          <span className="uppercase text-[9px] border border-white/10 px-1 rounded">{msg.status}</span>
                        </span>
                      </div>
                      <div className="text-white/80 pl-2 border-l-2 border-blue-500/50 ml-1">
                        {msg.content}
                      </div>
                      {msg.response && (
                        <div className="text-white/60 pl-2 border-l-2 border-purple-500/50 ml-1 mt-1">
                          ↳ {msg.response}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnOffBadge({ isOn }: { isOn: boolean }) {
  return (
    <div className={cn(
      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0",
      isOn
        ? "bg-green-500/20 text-green-300 border-green-500/40"
        : "bg-red-500/20 text-red-300 border-red-500/40"
    )}>
      {isOn ? 'ON' : 'OFF'}
    </div>
  );
}

function StatusBadge({ status }: { status: Agent['status'] }) {
  return (
    <div className={cn(
      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0",
      status === 'idle' && "bg-gray-500/20 text-gray-400 border border-gray-500/30",
      status === 'working' && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
      status === 'deploying' && "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
      status === 'error' && "bg-red-500/20 text-red-400 border border-red-500/30",
      status === 'paused' && "bg-gray-400/20 text-gray-300 border border-gray-400/30",
    )}>
      {status === 'working' && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
      {status === 'deploying' && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />}
      {status}
    </div>
  );
}
