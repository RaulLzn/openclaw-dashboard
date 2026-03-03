# OpenClaw Dashboard Integration Skill

## Overview

This skill provides instructions for integrating the OpenClaw Command Center Dashboard into any OpenClaw ecosystem.

## When to Use

Use this skill when you need to:
- Deploy a real-time monitoring dashboard for OpenClaw
- Visualize agent activity and communication
- Track AI provider usage and costs
- Monitor system health and sessions

## Prerequisites

1. A running OpenClaw instance (v2026.2+)
2. Node.js 18+ installed
3. Access to the OpenClaw data directory

## Quick Integration

### Step 1: Get the Dashboard

Clone or copy the dashboard files to your system:

```bash
git clone https://github.com/username/openclaw-commandcenter.git
cd openclaw-commandcenter
npm install
```

### Step 2: Configure Paths

The dashboard needs to know where your OpenClaw data is located. You can configure this via environment variables:

```bash
# For local OpenClaw
export OPENCLAW_ROOT="$HOME/.openclaw"
export OPENCLAW_AGENTS_DIR="$OPENCLAW_ROOT/agents"

# For global skills
export OPENCLAW_GLOBAL_SKILLS="$HOME/.npm-global/lib/node_modules/openclaw/skills"

# For user skills
export OPENCLAW_USER_SKILLS="$OPENCLAW_ROOT/skills"
```

### Step 3: Start the Dashboard

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The dashboard will be available at `http://localhost:3333`

## Integration with OpenClaw

### As a Service (Linux/systemd)

Create a systemd service for auto-start:

```ini
[Unit]
Description=OpenClaw Dashboard
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/dashboard
Environment=OPENCLAW_ROOT=/home/youruser/.openclaw
Environment=PORT=3333
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

### For Remote Access

If accessing remotely, you may want to use a reverse proxy:

```bash
# With nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3333;
    }
}
```

## Configuration Options

### Dashboard Settings

| Option | Environment | Description |
|--------|-------------|-------------|
| Port | `PORT` | Server port (default: 3333) |
| OpenClaw Root | `OPENCLAW_ROOT` | Path to .openclaw directory |
| Refresh Interval | `REFRESH_INTERVAL` | Polling interval in ms (default: 5000) |

### Security Considerations

⚠️ **Important**: The dashboard provides read-only access to OpenClaw data. For production:

1. **Don't expose publicly** - Use firewall or VPN
2. **Consider authentication** - Add auth if needed
3. **Use HTTPS** - In production, use TLS/SSL

## Verification

After setup, verify the dashboard is working:

1. Open `http://localhost:3333`
2. You should see:
   - Agent count
   - Active sessions
   - Skills inventory
3. Check browser console for any errors

## Customization

### Adding New Metrics

To add custom metrics, edit `server.ts`:

```typescript
app.get('/api/dashboard', async (req, res) => {
  // Add your custom metric
  const customMetric = await getCustomMetric();
  
  res.json({
    // ... existing data
    customMetric
  });
});
```

### Custom Agent Information

Add agent-specific displays in the frontend components.

## Troubleshooting

### "No agents found"
- Verify `OPENCLAW_ROOT` points to correct directory
- Check that agents are configured in `openclaw.json`

### "Skills not showing"
- Verify paths to global and user skills directories
- Check directory permissions

### Dashboard not updating
- Check that OpenClaw gateway is running
- Verify network connectivity

## File Locations

The dashboard reads from these OpenClaw files:

| File | Purpose |
|------|---------|
| `agents/*/sessions/sessions.json` | Session data |
| `openclaw.json` | Agent configuration |
| `skills/*/SKILL.md` | Skill definitions |
| `memory/YYYY-MM-DD.md` | Activity logs |

## Related Skills

- `document-converter` - Convert documents for AI processing
- `repo-merger` - Merge repositories for context
- `google-drive` - Access Google Drive files

---

**Skill ID**: openclaw-dashboard
**Version**: 1.0.0
**Compatible**: OpenClaw v2026.2+
