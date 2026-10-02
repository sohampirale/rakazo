# Using Rakazo with Antigravity (`agy`) CLI Subscription

This guide explains how to run Rakazo entirely using your active Google Antigravity (`agy`) subscription, with **zero API keys and zero paid LLM bills**.

---

## 1. How It Works

1. Rakazo already features native support for local OpenAI-compatible endpoints (`packages/adapters/src/pi-local-provider.ts`).
2. The AGY Bridge (`scripts/agy-bridge.mjs`) is a lightweight local service that runs on loopback `http://127.0.0.1:4000/v1`.
3. It translates standard OpenAI `/v1/chat/completions` requests and function tool calling into your local `agy` CLI binary (`/home/soham/.local/bin/agy`), leveraging your existing Antigravity subscription and G1 credits.
4. When Rakazo bots execute tasks (running shell commands, creating files, web browsing, computer use), Pi handles the tool dispatching loop, while `agy` handles model reasoning and generation.

---

## 2. Supported Models

The bridge supports any model available through your `agy` subscription, including:

- `gemini-3.8-flash-high`
- `gemini-3.7-flash-high`
- `gemini-3.6-flash-high`
- `claude-sonnet-4-6` (Thinking)
- `claude-opus-4-6-thinking`
- `gemini-3.1-pro-high`

---

## 3. Quick Start

### Step 1: Start the AGY Bridge

In a terminal, run:

```bash
pnpm agy:bridge
```

You should see:
```text
=================================================
   Rakazo <-> Antigravity (AGY) OpenAI Bridge    
=================================================
Checking agy binary: agy
✓ AGY Bridge running on http://127.0.0.1:4000/v1
✓ Models endpoint: http://127.0.0.1:4000/v1/models
✓ Chat completions: http://127.0.0.1:4000/v1/chat/completions
```

### Step 2: Configure Rakazo

Add the following lines to your `.env` file:

```bash
# Point local model server to the AGY bridge
RAKAZO_LOCAL_MODELS_URL=http://127.0.0.1:4000/v1
RAKAZO_LOCAL_MODELS=gemini-3.8-flash-high,claude-sonnet-4-6,claude-opus-4-6-thinking
```

### Step 3: Run Rakazo

Start Rakazo as usual:

```bash
pnpm dev
```

Open your browser at `http://127.0.0.1:5173`. When creating or editing a bot, choose the **Local** provider and pick `gemini-3.8-flash-high` or `claude-sonnet-4-6`. Your bots will now run using your AGY subscription!

Alternatively, in the UI you can also connect via **OpenAI-compatible**:
- **Base URL**: `http://127.0.0.1:4000/v1`
- **Model ID**: `gemini-3.8-flash-high`
- **API Key**: `local`

---

## 4. Running the Tests

To verify that the bridge and Pi runtime integration are working:

```bash
pnpm test:agy
```

All unit, protocol, streaming, and tool-dispatching tests will run offline, followed by a live smoke test against your local `agy` binary.

---

## 5. How to Revert or Switch Back Anytime

The integration is completely modular and non-intrusive:

1. **Temporary Switch**: Simply comment out or remove the two lines in `.env`:
   ```bash
   # RAKAZO_LOCAL_MODELS_URL=...
   # RAKAZO_LOCAL_MODELS=...
   ```
2. **Complete Git Revert**:
   All changes are isolated on branch `feat/agy-integration`. To switch back to vanilla Rakazo:
   ```bash
   git checkout main
   ```
