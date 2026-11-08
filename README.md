# Nyra

Nyra is a local, voice-first desktop assistant for Windows that runs from your own machine. You speak or type a request, Nyra routes it to a specialist agent (Researcher, Coder, or Planner), and the answer streams back into a live plasma observatory UI. Every action that touches your laptop is shown before it runs and waits for an explicit **OK**.

Think of Nyra as a personal assistant that can *do* things, not only chat: it can generate and save code, open VS Code on a project, open validated websites and built-in apps, organize folders, run a project's test suite, keep tasks and memories, and run daily check-ins. Calendar, Gmail, and VS Code are being layered in as permission-gated integrations (see [Roadmap](#roadmap)).

## Why Nyra

- **Voice-first** — speak a command, hear the answer, continue listening. Text input and keyboard controls work everywhere.
- **Ask-before-act permissions** — risky actions are proposed as a card first. Nyra says what it will do and waits for you to say or type **OK** (or **cancel**). Actions expire after five minutes.
- **Runs on your laptop** — Python standard library plus Ollama or an optional Gemini key. No npm or pip install required. Data stays in a local SQLite file.
- **Real state, not theater** — tasks, memories, timers, feedback, and agent activity reflect actual runtime state. Nyra does not claim feelings or consciousness.

## Quick start

Requires Python 3.10 or later. No Python or JavaScript packages are needed.

```powershell
cd C:\Users\Lenovo\Documents\Nyra
python server.py
```

Open **http://localhost:8765** in Chrome or Edge. Keep the server running for check-ins. The interface works in other browsers; speech recognition depends on browser support and permissions.

## Connect a model

1. Start the installed Ollama app, or run `ollama serve` in another terminal.
2. Install a model suitable for your hardware, for example `ollama pull qwen2.5:3b`. Nyra does not download model weights.
3. Open **Connections & voice**, click **Refresh**, select the model, and save.

Gemini is optional. Create a key in [Google AI Studio](https://aistudio.google.com/app/apikey), then save it as a **user-level Windows environment variable** before starting Nyra:

```powershell
# Replace the placeholder locally. Never commit this value or paste it into Nyra chat.
[Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY', 'User')

# Start a new PowerShell window so the process receives the new variable.
cd C:\Users\Lenovo\Documents\Nyra
python server.py
```

Nyra offers `gemini-2.5-flash` and `gemini-2.5-flash-lite` when the key is present. The key is read only by the local server and is never stored in SQLite, browser storage, Git, or sent to the browser. Gemini requests send conversation context to Google; use Ollama if you want inference to stay fully local. If the key may have leaked, revoke it in Google AI Studio and create a replacement.

The local runtime uses Ollama at `http://127.0.0.1:11434`. The chosen model serves the specialist and reviewer roles: Researcher for general work, Coder for programming, Planner for planning, plus a separate optional review pass. Routing is deterministic; this version does not run autonomous background model agents or parallel model calls.

## What Nyra can do today

**Assistant core**
- Conversational Chat (voice or text) with specialist routing and an optional reviewer pass.
- Persistent tasks, personal memories, conversation history, and feedback-aware context.
- Daily check-ins and task-based suggestions while the server is running.
- Focus timers that survive restarts.
- Code generation saved to `data/artifacts/` (never executed automatically, never overwriting existing files).

**Permission-gated laptop actions** — Nyra prepares the action, asks, and waits for **OK**:

| Say something like | Nyra will |
|---|---|
| `Open VS Code` / `Open VS Code in C:\path\to\project` | Launch VS Code on a project |
| `Open calculator` / `Open notepad` / `Open paint` | Launch one of three allowlisted apps |
| `Open project folder C:\path\to\folder` | Open a folder in Explorer |
| `Open https://example.com` | Open a validated website |
| `Organize files in C:\path\to\folder` | Move files into extension-named subfolders (never deletes) |
| `Run project tests in C:\path\to\project` | Run that project's test suite |
| `Write artifact nyra-abc123.py to C:\path\to\project\main.py` | Create a **new** file only |

Say **cancel** to decline. Arbitrary shell commands, file deletion, unattended browser clicking, and paths outside the allowlists stay disabled.

## Observing and personalizing

- **Plasma observatory** — drag to turn, scroll to zoom, arrow keys to nudge, **B** for a burst, Escape to exit immersive mode. Reduced-motion settings pause the animation automatically.
- **Drawers** — Tasks, Memory, Activity, and Conversation open from the top navigation. Agent indicators show real runtime state.
- **Voice** — the first microphone click shows a consent screen; choose **Remember on this device** to auto-start voice on later launches. Say **“stop listening”** or press Escape to stop.
- **Suggested automations** — Nyra proposes next steps from your real task state and refreshes them as tasks change.

## Commands that work without a model

- `Add task: finish the report`
- `Complete task finish the report` (use the exact title)
- `Plan my day` / `Check my tasks`
- `Remember that I prefer short answers`
- `Start a 25 minute focus timer`
- `Open calculator`, `Open notepad`, or `Open paint`

## Roadmap

Nyra is a working foundation, not yet a fully autonomous desktop agent. The next layers are being added as explicit, narrow tool adapters behind the same **“OK” permission gate**:

- **Calendar** — read and create events (Google Calendar via OAuth).
- **Gmail** — draft, summarize, and send mail (Google OAuth, drafts first).
- **VS Code** — open projects, apply generated files, and run project tests from the editor.
- **Other apps and platforms** — additional allowlisted integrations, each with an explicit permission prompt.
- **Proactive suggestions** — evaluated research and next-step suggestions before you ask.

None of these ship enabled by default. Each integration must request permission visibly, must show the exact action, and must be reversible or read-only where possible. Background agents, arbitrary shell execution, and unattended computer control remain out of scope until they have a sandbox and an audit trail.

## Data and local security

Data lives in `data/nyra.db` (SQLite); back it up while the server is stopped. It holds conversations, tasks, memories, feedback, settings, and activity. Nothing in `data/` is served as static content. The server binds only to `127.0.0.1`, validates Host and Origin, and requires a session token for mutations. It is built for a trusted single-user machine and is **not** a hardened public service. Stored data is not encrypted.

`NYRA_PORT` changes the port; `NYRA_DATA_DIR` changes the data directory. Do not expose the server through a public tunnel.

## Verify

```powershell
python -m unittest discover -s tests -v
node --check web/app.js
node --check web/plasma.js
```

Tests use temporary databases and mocked model responses, with no downloads or changes to personal data.

## References

- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Ollama model list API](https://docs.ollama.com/api/tags)
- [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)

See `DESIGN.md` for visual direction and validation notes.
