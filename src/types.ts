export type AgentStatus = 'idle' | 'working' | 'deploying' | 'error' | 'paused';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentTask: string;
  parentId: string | null;
  position: [number, number, number];
  model: string;
  provider?: string;
  connectedTo?: string;
  connectionStatus?: 'connected' | 'disconnected';
  latencyMs?: number | null;
  contextWindow: number;
  currentTokens: number;
  activeSessionId: string;
  lastActivityAt?: number;
}

export interface ExternalServer {
  id: string;
  name: string;
  type: 'database' | 'api' | 'web';
  position: [number, number, number];
  status: 'online' | 'offline';
}

export interface Link {
  source: string;
  target: string;
  active: boolean;
  type?: 'internal' | 'external';
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  sourceId?: string;
}

export interface Message {
  id: string;
  sourceId: string;
  targetId: string;
  content: string;
  response?: string;
  timestamp: number;
  status: 'pending' | 'delivered' | 'failed';
  tokensUsed: number;
  role?: 'user' | 'assistant' | 'system';
  sessionId?: string;
  sessionKey?: string;
}

export interface ConversationThread {
  id: string;
  parentAgentId: string;
  parentAgentName: string;
  subagentId: string;
  subagentName: string;
  sessionId: string;
  sessionKey: string;
  updatedAt: number;
  isActive: boolean;
  messages: Message[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  usageCount: number;
  lastUsed: number;
  status: 'online' | 'offline' | 'degraded';
}

export interface SystemInfo {
  version: string;
  uptime: number;
  gatewayLatency: number;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
}

export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedTo: string | null;
  progress: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

