# NanoClaw Agent Container
# Runs Claude Agent SDK in isolated Linux VM with browser automation

FROM node:22-slim

# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for agent-browser
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Sandbox: proxy build args for npm through MITM proxy
ARG http_proxy
ARG https_proxy
RUN npm config set strict-ssl false

# Install agent-browser and claude-code globally
RUN npm install -g agent-browser @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Build TypeScript to /app/dist (pre-compiled, not at runtime)
RUN npx tsc --outDir /app/dist && ln -s /app/node_modules /app/dist/node_modules

# Clone private skills repo into image (token used only at build time, never stored in image)
# Skills land in /app/private-skills/ — entrypoint merges them into /home/node/.claude/skills/ at startup
RUN --mount=type=secret,id=github_pat \
    PAT=$(cat /run/secrets/github_pat) && \
    mkdir -p /app/private-skills && \
    curl -ksSL -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/idolaman/x-agent/tarball/main" -o /tmp/skills.tar.gz && \
    tar xz --strip-components=1 -C /app/private-skills -f /tmp/skills.tar.gz && \
    rm /tmp/skills.tar.gz

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input

# Create entrypoint script
# Container input (prompt, group info) is passed via stdin JSON.
# Credentials are injected by the host's credential proxy — never passed here.
# Follow-up messages arrive via IPC files in /workspace/ipc/input/
RUN printf '#!/bin/bash\nset -e\n# Merge private skills into .claude/skills/ (which is bind-mounted from host)\nif [ -d /app/private-skills/.claude/skills ]; then\n  mkdir -p /home/node/.claude/skills\n  cp -rn /app/private-skills/.claude/skills/. /home/node/.claude/skills/ 2>/dev/null || true\nfi\ncat > /tmp/input.json\nnode /app/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace && chmod 777 /home/node

# Switch to non-root user (required for --dangerously-skip-permissions)
USER node

# Set working directory to group workspace
WORKDIR /workspace/group

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
