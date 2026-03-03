# OpenClaw Command Center Dashboard

A real-time, 3D可视化 dashboard for monitoring OpenClaw AI agent ecosystems.

![Dashboard Preview](https://via.placeholder.com/800x400?text=OpenClaw+Command+Center)

## Features

### 🎯 Real-Time Agent Monitoring
- View all agents and their current status (ON/OFF)
- See active sessions in real-time
- Monitor agent-to-subagent spawning and communication

### 🧠 Agent Communication
- Visual 3D hierarchy of agents and sub-agents
- Live communication feed (Comms Intercept)
- Message thread viewer between agents

### 📊 Comprehensive Metrics
- System health (CPU, Memory, Gateway status)
- Token usage per agent
- Skills inventory (global and user-created)
- Network connections to AI providers

### 📋 Task Management
- Kanban board for tracking agent tasks
- Task descriptions from real agent activity
- Progress tracking

### 🔌 Provider Network
- Visual display of AI provider connections
- Real-time latency monitoring
- Provider: Google Antigravity, OpenAI Codex, MiniMax, Gemini CLI

## Installation

### Prerequisites
- Node.js 18+
- A running OpenClaw instance
- Access to the OpenClaw configuration directory

### Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/openclaw-commandcenter.git
cd openclaw-commandcenter

# Install dependencies
npm install

# Configure (see Configuration section below)
cp config.example.ts config.ts
# Edit config.ts with your paths

# Start the server
npm run dev
# OR for production
npm run build
npm start
```

The dashboard will be available at `http://localhost:3333`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3333` |
| `OPENCLAW_ROOT` | Path to OpenClaw root directory | Current directory |
| `OPENCLAW_AGENTS_DIR` | Path to agents directory | `.openclaw/agents` |
| `OPENCLAW_GLOBAL_SKILLS` | Path to global skills | `.npm-global/...` |
| `OPENCLAW_USER_SKILLS` | Path to user skills | `.openclaw/skills` |

### Or use config.ts

```typescript
// config.ts
export const config = {
  openclawRoot: '/path/to/your/openclaw',
  port: 3333,
  paths: {
    agents: '.openclaw/agents',
    skills: {
      global: '/home/user/.npm-global/lib/node_modules/openclaw/skills',
      user: '/home/user/.openclaw/skills'
    }
  }
};
```

## Architecture

### Frontend
- **React** with TypeScript
- **Three.js** for 3D agent visualization
- **Vite** for fast development and building
- **Tailwind CSS** for styling

### Backend
- **Express** server
- Reads directly from OpenClaw's data files:
  - `agents/*/sessions/*.json` - Session data
  - `openclaw.json` - Configuration
  - Skills directories

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard` | Main dashboard data (agents, sessions, skills) |
| `GET /api/health` | Health check |

## Screenshots

### Overview Tab
Real-time system status, active agents, and quick metrics.

### Network Tab
Visual representation of agent connections to AI providers.

### Tasks Tab
Kanban board with real task tracking.

### Skills Tab
Inventory of all available skills.

## Development

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Troubleshooting

### Dashboard shows "No active sessions"
- Verify OpenClaw is running
- Check that the path to OpenClaw directory is correct in config

### 3D visualization not rendering
- Ensure WebGL is enabled in your browser
- Try a different browser (Chrome recommended)

### Port already in use
- Change the PORT in environment or config.ts

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this dashboard for your OpenClaw ecosystem.

## Related

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)

---

Built with ❤️ for the OpenClaw community
