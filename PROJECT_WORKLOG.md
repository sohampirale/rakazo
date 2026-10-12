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

## 4. AI Model Configuration Guide & Grok Bot Setup

Rakazo operates through provider-neutral adapters. For OpenRouter:

### Free Tier Limits (Official OpenRouter Policy)
- **Accounts with < $10 lifetime credits**: **50 requests/day**, 20 requests/minute.
- **Accounts with $\ge \$10$ lifetime credits**: **1,000 requests/day**, 20 requests/minute (permanent upgrade; requests on `:free` models do NOT deduct from your purchased balance).
*(Note: There is no 10,000 requests/day tier on OpenRouter; 1,000 RPD is the max free allocation).*

### Live Benchmark & Recommended Multimodal Models

For Rakazo to function as an autonomous Grok bot clone, the model must support:
1. **JSON Function / Tool Calling** (`browser_*`, `computer_*`, `file_*`, `web_*`).
2. **Vision / Multimodal Input** (`computer_observe` desktop screenshots).
3. **High Upstream Uptime** without shared pool throttling.

| Model ID | Context | Modalities | Tool Calling | Live Status & Benchmark |
| :--- | :--- | :--- | :--- | :--- |
| **`dots-studio/dots-3-note-preview:free`** *(Top Pick)* | **512k** | Text + Image | ✅ Flawless | **Recommended**: Instant response via AtlasCloud, zero upstream 429s, native vision support in Rakazo. |
| **`google/gemma-4-31b-it:free`** | **262k** | Text + Image + Video | ✅ Supported | High reasoning, but subject to intermittent Google AI Studio shared pool throttling. |
| **`google/gemma-4-26b-a4b-it:free`** | **262k** | Text + Image + Video | ✅ Supported | Low latency MoE, also shares Google AI Studio pool. |

Configure in `.env`:
```env
OPENROUTER_API_KEY=sk-or-v1-...
PI_DEFAULT_PROVIDER=openrouter
PI_DEFAULT_MODEL=dots-studio/dots-3-note-preview:free
```


---

## 5. Active Roadmap & Experiments

- [x] Local monorepo dependency installation & build
- [x] Docker desktop sandbox & supervisor integration
- [x] Human Takeover & interactive noVNC screen bridge verified
- [x] GitHub fork (`sohampirale/rakazo`) initialized & remotes configured
- [x] Connect funded OpenRouter key and verify 1,000 free RPD tier
- [x] Implement Antigravity Headless Coding Agent Bridge (`antigravity_run` / `antigravity_status` with zero token burn while waiting and automatic thread notification)
- [ ] Test autonomous web routines (LinkedIn navigation, data gathering)
- [ ] Explore custom skill playbooks & teaching sessions ("Teach a task")
