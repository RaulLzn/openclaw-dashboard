import express from 'express';
import { readFile, readdir } from 'fs/promises';
import os from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3333;
const OPENCLAW_ROOT = '/home/raul/.openclaw';
const AGENTS_ROOT = join(OPENCLAW_ROOT, 'agents');
const SKILLS_GLOBAL = '/home/raul/.npm-global/lib/node_modules/openclaw/skills';
const WORKSPACE_FORGE_ROOT = join(OPENCLAW_ROOT, 'workspace-forge');

type Task = {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'review' | 'done';
  assignedTo: string | null;
  progress: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
};

// Helper to read JSON file
async function readJson(filepath: string) {
  try {
    const content = await readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Helper to get relative time
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function parseAgentIdFromSessionKey(sessionKey?: string | null): string | null {
  if (!sessionKey) return null;
  const match = sessionKey.match(/^agent:([^:]+)/);
  return match?.[1] || null;
}

function normalizeProviderName(provider?: string | null): string {
  if (!provider || typeof provider !== 'string') return 'unknown';

  const normalized = provider.trim().toLowerCase();
  const providerMap: Record<string, string> = {
    'google-antigravity': 'google-antigravity',
    'google-gemini-cli': 'google-gemini-cli',
    'openai-codex': 'openai-codex',
    'openai': 'openai',
    'minimax': 'minimax',
    'anthropic': 'anthropic',
    'xai': 'xai',
    'groq': 'groq',
    'ollama': 'ollama',
  };

  if (providerMap[normalized]) return providerMap[normalized];

  // If no exact mapping, keep the original provider fragment to avoid "unknown"
  // when OpenClaw introduces new providers.
  return provider;
}

function inferProviderFromModelId(modelId?: string | null): string {
  if (!modelId || typeof modelId !== 'string') return 'unknown';

  const value = modelId.trim().toLowerCase();
  if (!value) return 'unknown';

  if (/(^|\b)(gpt|o1|o3|o4|codex)(-|\b)/.test(value)) return 'openai-codex';
  if (/(claude|gemini)/.test(value)) return 'google-antigravity';
  if (/minimax/.test(value)) return 'minimax';

  return 'unknown';
}

function parseModelReference(modelRef?: string | null): { provider: string; model: string } {
  if (!modelRef || typeof modelRef !== 'string') {
    return { provider: 'unknown', model: 'unknown' };
  }

  const trimmed = modelRef.trim();
  if (!trimmed) return { provider: 'unknown', model: 'unknown' };

  if (!trimmed.includes('/')) {
    return {
      provider: inferProviderFromModelId(trimmed),
      model: trimmed,
    };
  }

  const [providerPart, ...rest] = trimmed.split('/');
  const provider = normalizeProviderName(providerPart || 'unknown');

  return {
    provider,
    model: rest.length > 0 ? rest.join('/') : trimmed,
  };
}

function getConfiguredModel(config: any, agent: any): string {
  const defaultsPrimary = config?.agents?.defaults?.model?.primary;
  const defaultsFallback = config?.agents?.defaults?.model?.fallbacks?.[0];

  const modelRef = typeof agent?.model === 'string'
    ? agent.model
    : agent?.model?.primary || agent?.model?.fallbacks?.[0] || defaultsPrimary || defaultsFallback || 'unknown';

  return modelRef || 'unknown';
}

// Check if session is active (within 2 min)
function isActive(timestamp: number): boolean {
  if (!timestamp) return false;
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = diff / 1000 / 60;
  return diff >= 0 && minutes <= 2;
}

// Get all agents from config
async function getAgents() {
  const config = await readJson(join(OPENCLAW_ROOT, 'openclaw.json'));
  if (!config?.agents?.list) return [];
  
  return config.agents.list.map((agent: any) => {
    const configuredModel = getConfiguredModel(config, agent);
    const { provider, model } = parseModelReference(configuredModel);

    return {
      id: agent.id,
      name: agent.id,
      role: agent.id,
      status: 'idle' as const,
      currentTask: '',
      parentId: null,
      position: [0, 0, 0] as [number, number, number],
      provider,
      connectedTo: provider,
      connectionStatus: 'disconnected' as const,
      latencyMs: null as number | null,
      model,
      contextWindow: 200000,
      currentTokens: 0,
      activeSessionId: ''
    };
  });
}

// Get sessions for an agent
async function getAgentSessions(agentId: string) {
  const sessionsFile = join(AGENTS_ROOT, agentId, 'sessions', 'sessions.json');
  const data = await readJson(sessionsFile);
  if (!data) return [];
  
  const sessions = Object.entries(data) as Array<[string, any]>;
  
  return sessions.map(([sessionKey, s]) => {
    const updatedAt = typeof s.updatedAt === 'number'
      ? s.updatedAt
      : Date.parse(s.updatedAt || '') || 0;

    return {
      id: s.sessionId || agentId,
      agentId,
      sessionId: s.sessionId,
      sessionKey,
      updatedAt,
      isActive: isActive(updatedAt),
      totalTokens: s.totalTokens || 0,
      messageCount: s.messageCount || 0,
      spawnedBy: typeof s.spawnedBy === 'string' ? s.spawnedBy : null,
      spawnDepth: typeof s.spawnDepth === 'number' ? s.spawnDepth : 0,
      lastActive: getRelativeTime(updatedAt)
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Get current active sessions
async function getActiveSessions() {
  const activeSessions = [];
  
  try {
    const agentDirs = await readdir(AGENTS_ROOT, { withFileTypes: true });
    
    for (const dir of agentDirs) {
      if (!dir.isDirectory()) continue;
      const agentId = dir.name;
      const sessions = await getAgentSessions(agentId);
      const active = sessions.filter((s) => {
        if (!s.isActive) return false;
        const isSubagentSession = (s.sessionKey || '').includes(':subagent:');
        // Subagent sessions are only counted when truly recent (same 2-minute window).
        if (isSubagentSession) {
          return isActive(s.updatedAt);
        }
        return true;
      });
      activeSessions.push(...active.map(s => ({ ...s, agentId })));
    }
  } catch {
    // ignore
  }
  
  return activeSessions;
}

async function getAgentLastActivityMap() {
  const lastActivity = new Map<string, number>();

  try {
    const agentDirs = await readdir(AGENTS_ROOT, { withFileTypes: true });

    for (const dir of agentDirs) {
      if (!dir.isDirectory()) continue;
      const sessions = await getAgentSessions(dir.name);
      lastActivity.set(dir.name, sessions[0]?.updatedAt || 0);
    }
  } catch {
    // ignore
  }

  return lastActivity;
}

// Get skills
async function getSkills() {
  const skills = { global: [], user: [] };
  
  // Global skills
  try {
    const globalDirs = await readdir(SKILLS_GLOBAL, { withFileTypes: true });
    skills.global = globalDirs
      .filter(d => d.isDirectory())
      .map(d => ({
        id: `global-${d.name}`,
        name: d.name,
        description: '',
        usageCount: 0,
        lastUsed: 0,
        status: 'online' as const
      }));
  } catch {
    // ignore
  }
  
  // User skills - read from multiple locations
  const userSkillsPaths = [
    join(OPENCLAW_ROOT, 'skills'),
    join(OPENCLAW_ROOT, 'workspace', 'skills')
  ];
  
  for (const userSkillsPath of userSkillsPaths) {
    try {
      const userDirs = await readdir(userSkillsPath, { withFileTypes: true });
      const newSkills = userDirs
        .filter(d => d.isDirectory())
        .map(d => ({
          id: `user-${d.name}`,
          name: d.name,
          description: 'Custom skill',
          usageCount: 0,
          lastUsed: 0,
          status: 'online' as const
        }));
      
      // Add unique skills
      for (const s of newSkills) {
        if (!skills.user.find(existing => existing.name === s.name)) {
          skills.user.push(s);
        }
      }
    } catch {
      // ignore
    }
  }
  
  return skills;
}

// Get system info
async function getSystemInfo(activeConnections: number) {
  const config = await readJson(join(OPENCLAW_ROOT, 'openclaw.json'));
  const version = config?.version || '2026.2.25';

  const cpuCount = os.cpus()?.length || 1;
  const loadAvg1m = os.loadavg()[0] || 0;
  const cpuUsage = Math.max(0, Math.min(100, (loadAvg1m / cpuCount) * 100));

  const totalMem = os.totalmem() || 1;
  const freeMem = os.freemem();
  const memoryUsage = Math.max(0, Math.min(100, ((totalMem - freeMem) / totalMem) * 100));

  return {
    version,
    uptime: process.uptime() * 1000,
    gatewayLatency: 0,
    cpuUsage,
    memoryUsage,
    activeConnections
  };
}

function getPriorityFromText(text: string): Task['priority'] {
  const value = text.toLowerCase();
  if (/(critical|urgent|blocker)/.test(value)) return 'critical';
  if (/(high|asap|important)/.test(value)) return 'high';
  if (/(low|later|backlog)/.test(value)) return 'low';
  return 'medium';
}

function normalizeTaskLine(line: string): string {
  return line.replace(/^[-*]\s*/, '').replace(/^\[(?: |x|X)\]\s*/, '').trim();
}

function extractMessageText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
}

function truncateText(text: string, max = 90): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function isGenericTaskTitle(title: string): boolean {
  const value = title.trim().toLowerCase();
  return /^(task|todo|item|ticket|work)\s*#?\d*$/.test(value);
}

function summarizePrompt(text: string): string {
  const compact = text
    .replace(/\s+/g, ' ')
    .replace(/^[-*\d.)\s]+/, '')
    .trim();

  if (!compact) return 'Working on requested task';

  const sentence = compact.split(/[\n.!?]/).map(s => s.trim()).find(Boolean) || compact;
  return truncateText(sentence, 80);
}

async function getSessionActivitySummary(agentId: string, sessionId?: string | null): Promise<{ title: string; description: string } | null> {
  if (!sessionId) return null;

  const sessionPath = join(AGENTS_ROOT, agentId, 'sessions', `${sessionId}.jsonl`);
  try {
    const content = await readFile(sessionPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(-240);

    let latestUserText = '';
    let latestAssistantText = '';

    for (const raw of lines) {
      try {
        const entry = JSON.parse(raw);
        const role = entry?.role || entry?.message?.role;
        const messageText = extractMessageText(entry?.content || entry?.message?.content || entry?.text || '');
        if (!messageText) continue;

        if (role === 'user') latestUserText = messageText;
        if (role === 'assistant') latestAssistantText = messageText;
      } catch {
        // ignore malformed lines
      }
    }

    if (!latestUserText && !latestAssistantText) return null;

    const focus = summarizePrompt(latestUserText || latestAssistantText);
    const latestUpdate = latestAssistantText ? truncateText(summarizePrompt(latestAssistantText), 110) : 'No assistant update captured yet.';

    return {
      title: `${agentId}: ${focus}`,
      description: `Focus: ${focus}. Latest update: ${latestUpdate}`
    };
  } catch {
    return null;
  }
}

async function getRecentMessages(activeSessions: Awaited<ReturnType<typeof getActiveSessions>>) {
  const items: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    content: string;
    timestamp: number;
    status: 'delivered';
    tokensUsed: number;
  }> = [];

  for (const session of activeSessions) {
    if (!session.sessionId) continue;

    const sessionPath = join(AGENTS_ROOT, session.agentId, 'sessions', `${session.sessionId}.jsonl`);
    try {
      const content = await readFile(sessionPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean).slice(-200);

      for (const raw of lines) {
        try {
          const entry = JSON.parse(raw);
          if (entry?.type !== 'message') continue;
          const msg = entry.message;
          if (!msg) continue;

          const text = extractMessageText(msg.content);
          if (!text) continue;

          const ts = msg.timestamp || Date.parse(entry.timestamp || '') || Date.now();
          const tokensUsed = msg?.usage?.totalTokens || 0;
          const role = msg.role || 'assistant';

          items.push({
            id: entry.id || `${session.agentId}-${ts}`,
            sourceId: role === 'user' ? 'composer' : session.agentId,
            targetId: role === 'user' ? session.agentId : 'composer',
            content: text.slice(0, 500),
            timestamp: ts,
            status: 'delivered',
            tokensUsed,
            role,
            sessionId: session.sessionId,
            sessionKey: session.sessionKey,
          });
        } catch {
          // ignore bad json line
        }
      }
    } catch {
      // ignore missing/locked files
    }
  }

  return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
}

async function getConversationThreads(hierarchySessions: Awaited<ReturnType<typeof getRecentHierarchySessions>>) {
  const threads: Array<{
    id: string;
    parentAgentId: string;
    parentAgentName: string;
    subagentId: string;
    subagentName: string;
    sessionId: string;
    sessionKey: string;
    updatedAt: number;
    isActive: boolean;
    messages: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      content: string;
      timestamp: number;
      status: 'delivered';
      tokensUsed: number;
      role: 'user' | 'assistant' | 'system';
      sessionId: string;
      sessionKey: string;
    }>;
  }> = [];

  const relevant = hierarchySessions
    .filter((session) => session.sessionId && session.sessionKey.includes(':subagent:') && Boolean(session.spawnedBy))
    .slice(0, 24);

  for (const session of relevant) {
    const parentAgentId = parseAgentIdFromSessionKey(session.spawnedBy) || 'parent-agent';
    const subagentId = session.sessionKey;
    const sessionPath = join(AGENTS_ROOT, session.agentId, 'sessions', `${session.sessionId}.jsonl`);

    try {
      const content = await readFile(sessionPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean).slice(-300);
      const messages: Array<{
        id: string;
        sourceId: string;
        targetId: string;
        content: string;
        timestamp: number;
        status: 'delivered';
        tokensUsed: number;
        role: 'user' | 'assistant' | 'system';
        sessionId: string;
        sessionKey: string;
      }> = [];

      for (const raw of lines) {
        try {
          const entry = JSON.parse(raw);
          if (entry?.type !== 'message') continue;
          const msg = entry.message;
          if (!msg) continue;
          const role = msg.role || 'assistant';
          if (!['user', 'assistant', 'system'].includes(role)) continue;

          const text = extractMessageText(msg.content);
          if (!text) continue;

          const ts = msg.timestamp || Date.parse(entry.timestamp || '') || Date.now();
          const tokensUsed = msg?.usage?.totalTokens || 0;

          messages.push({
            id: entry.id || `${session.sessionId}-${ts}-${messages.length}`,
            sourceId: role === 'user' ? parentAgentId : subagentId,
            targetId: role === 'user' ? subagentId : parentAgentId,
            content: text.slice(0, 3000),
            timestamp: ts,
            status: 'delivered',
            tokensUsed,
            role,
            sessionId: session.sessionId,
            sessionKey: session.sessionKey,
          });
        } catch {
          // ignore malformed lines
        }
      }

      threads.push({
        id: session.sessionKey,
        parentAgentId,
        parentAgentName: parentAgentId,
        subagentId,
        subagentName: `Subagent ${session.sessionId.slice(-4)}`,
        sessionId: session.sessionId,
        sessionKey: session.sessionKey,
        updatedAt: session.updatedAt,
        isActive: session.isActive,
        messages: messages.sort((a, b) => a.timestamp - b.timestamp),
      });
    } catch {
      // ignore missing session logs
    }
  }

  return threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function getRecentHierarchySessions(limit = 50) {
  const hierarchySessions: Array<{
    sessionId: string;
    sessionKey: string;
    agentId: string;
    spawnedBy: string | null;
    updatedAt: number;
    isActive: boolean;
  }> = [];

  try {
    const agentDirs = await readdir(AGENTS_ROOT, { withFileTypes: true });

    for (const dir of agentDirs) {
      if (!dir.isDirectory()) continue;
      const sessions = await getAgentSessions(dir.name);
      hierarchySessions.push(
        ...sessions
          .filter((s) => Boolean(s.spawnedBy))
          .map((s) => ({
            sessionId: s.sessionId || '',
            sessionKey: s.sessionKey || s.sessionId || `${dir.name}-${s.updatedAt}`,
            agentId: dir.name,
            spawnedBy: s.spawnedBy,
            updatedAt: s.updatedAt,
            isActive: s.isActive,
          }))
      );
    }
  } catch {
    // ignore
  }

  return hierarchySessions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

async function getRecentlyCompletedSessions(limit = 12) {
  const completed: Array<{
    agentId: string;
    sessionId: string;
    updatedAt: number;
    totalTokens: number;
    messageCount: number;
  }> = [];

  try {
    const agentDirs = await readdir(AGENTS_ROOT, { withFileTypes: true });

    for (const dir of agentDirs) {
      if (!dir.isDirectory()) continue;
      const sessions = await getAgentSessions(dir.name);
      const done = sessions
        .filter((s) => !s.isActive && s.sessionId)
        .slice(0, 3)
        .map((s) => ({
          agentId: dir.name,
          sessionId: s.sessionId,
          updatedAt: s.updatedAt,
          totalTokens: s.totalTokens,
          messageCount: s.messageCount,
        }));

      completed.push(...done);
    }
  } catch {
    // ignore
  }

  return completed
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

async function getTasks(
  agents: Awaited<ReturnType<typeof getAgents>>,
  activeSessions: Awaited<ReturnType<typeof getActiveSessions>>
): Promise<Task[]> {
  const tasks: Task[] = [];

  // 1) Pending tasks from HEARTBEAT.md (workspace-forge)
  try {
    const heartbeatPath = join(WORKSPACE_FORGE_ROOT, 'HEARTBEAT.md');
    const heartbeat = await readFile(heartbeatPath, 'utf-8');
    const heartbeatTasks = heartbeat
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^[-*]\s+/.test(line) || /^\[(?: |x|X)\]\s+/.test(line));

    heartbeatTasks.forEach((line, index) => {
      const rawTitle = normalizeTaskLine(line);
      if (!rawTitle || rawTitle.toLowerCase().includes('add tasks below')) return;

      const completed = /^\[(?:x|X)\]/.test(line);
      const title = isGenericTaskTitle(rawTitle)
        ? `Heartbeat action #${index + 1}`
        : rawTitle;

      tasks.push({
        id: `heartbeat-${index}`,
        title,
        description: `From HEARTBEAT.md: ${truncateText(rawTitle, 140)}`,
        status: completed ? 'done' : 'todo',
        assignedTo: null,
        progress: completed ? 100 : 15,
        priority: getPriorityFromText(rawTitle)
      });
    });
  } catch {
    // ignore
  }

  // 2) Recent activity tasks from latest memory/YYYY-MM-DD.md
  try {
    const memoryDir = join(WORKSPACE_FORGE_ROOT, 'memory');
    const entries = await readdir(memoryDir, { withFileTypes: true });
    const latestMd = entries
      .filter(e => e.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(e.name))
      .map(e => e.name)
      .sort()
      .pop();

    if (latestMd) {
      const memoryContent = await readFile(join(memoryDir, latestMd), 'utf-8');
      const memoryLines = memoryContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^[-*]\s*\[(?: |x|X)\]\s+/.test(line));

      memoryLines.slice(0, 10).forEach((line, index) => {
        const rawTitle = normalizeTaskLine(line);
        const completed = /\[(?:x|X)\]/.test(line);
        const title = isGenericTaskTitle(rawTitle)
          ? `Memory follow-up #${index + 1}`
          : rawTitle;

        tasks.push({
          id: `memory-${index}`,
          title,
          description: `From memory/${latestMd}: ${truncateText(rawTitle, 140)}`,
          status: completed ? 'done' : 'review',
          assignedTo: null,
          progress: completed ? 100 : 80,
          priority: getPriorityFromText(rawTitle)
        });
      });
    }
  } catch {
    // ignore
  }

  // 3) Live tasks from active OpenClaw sessions
  for (let index = 0; index < activeSessions.length; index += 1) {
    const session = activeSessions[index];
    const activity = await getSessionActivitySummary(session.agentId, session.sessionId);
    tasks.push({
      id: `session-${session.sessionId || index}`,
      title: activity?.title || `${session.agentId}: Active work session`,
      description: activity?.description || `${session.messageCount} messages • ${session.totalTokens} tokens • last active ${session.lastActive}`,
      status: 'in-progress',
      assignedTo: session.agentId,
      progress: Math.min(90, Math.max(15, Math.round(session.messageCount * 4))),
      priority: session.totalTokens > 50000 ? 'high' : 'medium'
    });
  }

  // 4) Recently finished sessions become done tasks
  const completedSessions = await getRecentlyCompletedSessions();
  for (const session of completedSessions) {
    const activity = await getSessionActivitySummary(session.agentId, session.sessionId);
    tasks.push({
      id: `completed-${session.sessionId}`,
      title: activity?.title?.replace(':', ' completed:') || `${session.agentId}: Completed session`,
      description: activity?.description || `${session.messageCount} messages • ${session.totalTokens} tokens • finished ${getRelativeTime(session.updatedAt)}`,
      status: 'done',
      assignedTo: session.agentId,
      progress: 100,
      priority: session.totalTokens > 50000 ? 'high' : 'medium'
    });
  }

  // 5) If no tasks found, create lightweight real fallback from current agents
  if (tasks.length === 0) {
    agents.slice(0, 6).forEach((agent, index) => {
      tasks.push({
        id: `agent-${agent.id}`,
        title: `${agent.name} waiting for assignment`,
        description: 'No pending tasks found in HEARTBEAT.md or memory. This reflects current idle/available agent state.',
        status: 'todo',
        assignedTo: agent.id,
        progress: 0,
        priority: index === 0 ? 'high' : 'low'
      });
    });
  }

  return tasks.slice(0, 30);
}

// API endpoint for dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const [agents, activeSessions, skills, hierarchySessions, lastActivityByAgent] = await Promise.all([
      getAgents(),
      getActiveSessions(),
      getSkills(),
      getRecentHierarchySessions(),
      getAgentLastActivityMap()
    ]);
    const activeConnections = activeSessions.filter(s => s.isActive).length;
    const systemInfo = await getSystemInfo(activeConnections);
    const tasks = await getTasks(agents, activeSessions);
    
    // Update agent status based on active sessions
    for (const agent of agents) {
      const agentSessions = activeSessions.filter(s => s.agentId === agent.id);
      const hasActive = agentSessions.some(s => s.isActive);
      const latestSession = agentSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const latestActivityTs = latestSession?.updatedAt || lastActivityByAgent.get(agent.id) || 0;
      (agent as any).lastActivityTs = latestActivityTs;

      if (hasActive) {
        agent.status = 'working';
        const activeSession = agentSessions.find(s => s.isActive);
        if (activeSession) {
          const ageMs = Math.max(0, Date.now() - (activeSession.updatedAt || Date.now()));
          agent.activeSessionId = activeSession.sessionId;
          agent.currentTokens = activeSession.totalTokens;
          agent.connectionStatus = 'connected';
          agent.connectedTo = agent.provider || 'unknown';
          agent.latencyMs = Math.max(8, Math.min(999, Math.round(ageMs / 10) + 12));
          agent.currentTask = `Connected to: ${agent.connectedTo} (${agent.latencyMs}ms)`;
        }
      } else {
        agent.connectionStatus = 'disconnected';
        agent.latencyMs = null;
        agent.currentTask = `Disconnected from: ${agent.provider || 'unknown'}`;
      }
    }

    agents.sort((a: any, b: any) => (b.lastActivityTs || 0) - (a.lastActivityTs || 0));

    // Build provider nodes from REAL configured providers (never fictional names)
    const providerOrder = Array.from(
      new Set(
        agents
          .map((agent: any) => (typeof agent.provider === 'string' ? agent.provider.trim() : ''))
          .filter((provider: string) => provider && provider !== 'unknown' && provider !== 'subagent')
      )
    );

    const externalServers = providerOrder.map((provider, index) => {
      const total = Math.max(1, providerOrder.length);
      const angle = (index / total) * Math.PI * 2;
      const radius = 8;

      return {
        id: `provider:${provider}`,
        name: provider,
        type: 'api' as const,
        position: [
          Number((Math.cos(angle) * radius).toFixed(2)),
          2,
          Number((Math.sin(angle) * radius).toFixed(2))
        ] as [number, number, number],
        status: 'online' as const,
      };
    });
    
    // Generate links from session hierarchy + provider connections
    const links: Array<{ source: string; target: string; active: boolean; type?: 'internal' | 'external' }> = [];
    const seenLinks = new Set<string>();

    const pushLink = (source: string | null, target: string | null, active: boolean, type: 'internal' | 'external' = 'internal') => {
      if (!source || !target || source === target) return;
      const key = `${type}:${source}->${target}`;
      if (seenLinks.has(key)) return;
      seenLinks.add(key);
      links.push({ source, target, active, type });
    };

    for (const session of hierarchySessions) {
      const parentAgent = parseAgentIdFromSessionKey(session.spawnedBy);
      const isSubagentSession = (session.sessionKey || '').includes(':subagent:');
      const childAgent = isSubagentSession
        ? session.sessionKey
        : (parseAgentIdFromSessionKey(session.sessionKey) || session.agentId);
      pushLink(parentAgent, childAgent, session.isActive, 'internal');
    }

    for (const agent of agents) {
      pushLink(agent.parentId, agent.id, agent.status === 'working', 'internal');

      const provider = typeof agent.provider === 'string' ? agent.provider.trim() : '';
      if (agent.status === 'working' && provider && provider !== 'unknown' && provider !== 'subagent') {
        pushLink(agent.id, `provider:${provider}`, true, 'external');
      }
    }
    
    // Generate logs from recent activity
    const logs = activeSessions.slice(0, 20).map((s, i) => ({
      id: `log-${i}`,
      timestamp: s.updatedAt,
      message: `${s.agentId}: session ${s.sessionId?.slice(-8)} - ${s.totalTokens} tokens`,
      type: s.isActive ? 'info' as const : 'success' as const,
      sourceId: s.agentId
    }));
    
    // Real messages from active session jsonl streams
    const messages = await getRecentMessages(activeSessions);
    const conversationThreads = await getConversationThreads(hierarchySessions);

    const tokenUsageByAgent = agents.map(agent => {
      const sessions = activeSessions.filter(s => s.agentId === agent.id);
      const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
      return {
        agentId: agent.id,
        agentName: agent.name,
        totalTokens,
        activeSessionCount: sessions.filter(s => s.isActive).length
      };
    });

    const metrics = {
      cpuUsage: systemInfo.cpuUsage,
      memoryUsage: systemInfo.memoryUsage,
      activeConnections: systemInfo.activeConnections,
      totalTokens: tokenUsageByAgent.reduce((sum, item) => sum + item.totalTokens, 0),
      tokenUsageByAgent
    };
    
    res.json({
      agents,
      activeSessions,
      skills,
      systemInfo,
      metrics,
      links,
      externalServers,
      logs,
      messages,
      conversationThreads,
      tasks: tasks ?? []
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Serve static files from Vite build
app.use(express.static(join(__dirname, 'dist')));

app.listen(PORT, () => {
  console.log(`🚀 Dashboard server running at http://localhost:${PORT}`);
});
