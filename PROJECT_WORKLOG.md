# Rakazo Project Worklog & Engineering Roadmap

This worklog tracks our active development, local stack orchestration, and feature roadmap for **Rakazo** on the `sohampirale/rakazo` fork.

---

## 1. Repository & Remote Setup

The repository has been forked via GitHub CLI and linked directly to your GitHub account:

- **Origin (Personal Fork)**: [`https://github.com/sohampirale/rakazo`](https://github.com/sohampirale/rakazo) (Push & Pull enabled)
- **Upstream (Original Project)**: `https://github.com/elie222/rakazo` (Tracks official releases & PRs)

### Syncing with Upstream
To pull upstream updates into your fork at any time:
```bash
git fetch upstream
git rebase upstream/main
git push origin main
```

---

## 2. Local Stack Status

| Service | Address | Health / Status | Notes |
| :--- | :--- | :--- | :--- |
| **Web UI** | `http://127.0.0.1:5173` | Active (200 OK) | Vite + React + Base UI / shadcn |
| **API Server** | `http://127.0.0.1:3100` | Active (200 OK) | Fastify backend with BetterAuth |
| **Sandbox Supervisor** | `http://127.0.0.1:7091` | Active (200 OK) | Manages computer containers & noVNC |
| **PostgreSQL Database** | `127.0.0.1:5434` | Active (Healthy) | Docker container `compose-postgres-1` |
| **Background Worker** | In-process queue | Active | Graphile worker polling Postgres |
| **Computer Sandbox** | `rakazo/computer:local` | Ready | Debian 12 + Xvfb + Fluxbox + Chromium |

---

## 3. Key Fixes Applied

1. **Postgres Port Remapping (`5434`)**:
   - Resolved port conflict on host port `5433` (used by existing service) by routing Rakazo to `5434`.
2. **Canonical Snap Docker Compatibility**:
   - Added `RAKAZO_DISABLE_NO_NEW_PRIVS=true` support to `infra/sandboxes/supervisor/src/computer-spec.ts`.
   - Prevents Snap AppArmor from rejecting unprivileged container initialization (`operation not permitted` exit code 255).
3. **Local Computer Container Build**:
   - Built standalone local sandbox container image `rakazo/computer:local` (1.14 GB) with C capture acceleration (`librakazo-xcapture.so`) and Chrome DevTools Protocol automation (`rakazo-page-browser`).

---

## 4. AI Model Configuration Guide

Rakazo operates through provider-neutral adapters. For OpenRouter:

### Free Tier with $\ge \$10$ Credits
Accounts with $\ge \$10$ in credits receive **1,000 requests/day** for free on `:free` models without consuming account balance.

Recommended multimodal models:
- `google/gemma-4-31b-it:free` (Recommended for high precision & vision)
- `google/gemma-4-26b-a4b-it:free` (Low latency MoE)
- `qwen/qwen3.8-27b:free` (Visual reasoning leader)

Configure in `.env`:
```env
OPENROUTER_API_KEY=sk-or-v1-...
PI_DEFAULT_PROVIDER=openrouter
PI_DEFAULT_MODEL=google/gemma-4-31b-it:free
```

---

## 5. Active Roadmap & Experiments

- [x] Local monorepo dependency installation & build
- [x] Docker desktop sandbox & supervisor integration
- [x] Human Takeover & interactive noVNC screen bridge verified
- [x] GitHub fork (`sohampirale/rakazo`) initialized & remotes configured
- [ ] Connect funded OpenRouter key and verify end-to-end task execution in chat
- [ ] Test autonomous web routines (LinkedIn navigation, data gathering)
- [ ] Explore custom skill playbooks & teaching sessions ("Teach a task")
