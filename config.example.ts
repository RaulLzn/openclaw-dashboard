// Configuration template for OpenClaw Dashboard
// Copy this to config.ts and customize for your setup

export const config = {
  // OpenClaw root directory (where .openclaw folder is located)
  openclawRoot: process.env.OPENCLAW_ROOT || process.cwd(),
  
  // Server port
  port: parseInt(process.env.PORT || '3333'),
  
  // Paths (can be overridden via environment variables)
  paths: {
    agents: process.env.OPENCLAW_AGENTS_DIR || '.openclaw/agents',
    skills: {
      global: process.env.OPENCLAW_GLOBAL_SKILLS || '.npm-global/lib/node_modules/openclaw/skills',
      user: process.env.OPENCLAW_USER_SKILLS || '.openclaw/skills'
    }
  }
};
