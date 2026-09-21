# Nyra

A local, voice-first personal assistant with a plasma agent constellation, persistent tasks and memories, daily check-ins, and Ollama specialist/reviewer calls.

## Start

Requires Python 3.10 or later. No Python or JavaScript packages are needed.

```powershell
cd C:\Users\Lenovo\Documents\Nyra
python server.py
```

Open **http://localhost:8765** in Chrome or Edge. Keep the server running for check-ins. The interface also works in other browsers; speech recognition depends on browser support and permissions.

## Connect a model

1. Start the installed Ollama application, or run `ollama serve` in another terminal.
2. Install an Ollama model appropriate for your hardware, for example `ollama pull qwen2.5:3b`. Nyra does not automatically download model weights.
3. Open **Connections & voice**, click **Refresh**, select the installed model, and save.

Gemini is optional. Set the key in the same PowerShell session before starting Nyra, then refresh the model list:

```powershell
$env:GEMINI_API_KEY = 'paste-your-key-here'
python server.py
```

Nyra offers `gemini-2.5-flash` and `gemini-2.5-flash-lite` when the key is present. The key is read only by the local server and is never stored in SQLite or sent to the browser. Gemini requests send the conversation context to Google; use Ollama if you want inference to remain local.

The local runtime uses Ollama at `http://127.0.0.1:11434`. The same chosen model is used by distinct specialist and reviewer roles. Routing is deterministic; general work goes to Researcher, programming to Coder, and planning to Planner. The reviewer is a separate optional inference pass. This version does not run independent autonomous background model agents or parallel model calls.

## Confirmation-gated laptop actions

Nyra can prepare these actions from voice or text, then waits for an explicit **OK** before executing them:

- `Open VS Code` or `Open VS Code in C:\path\to\project`
- `Open https://example.com`
- `Organize files in C:\path\to\folder` (moves files into extension-named subfolders; it does not delete files)

You can say **cancel** instead. For a coding request that includes “open VS Code”, Nyra generates and saves the code first, then asks before opening the generated file in VS Code. Arbitrary shell commands, file deletion, unattended browser clicking, and actions outside these allowlists remain disabled.

## Voice

Click the microphone or **Awaiting your voice** control once and allow microphone access. Speak a command, wait for the answer, then speak again. Say **“stop listening”**, press Escape, or click the microphone to stop. Recognition pauses while Nyra responds so the synthesized voice cannot issue new commands.

Choose an available system voice and adjust pitch in settings. Nyra prefers an English voice such as Microsoft Zira when one is available. A studio-quality natural feminine voice is not bundled. Browser speech recognition may send audio to the browser provider and may need internet access, even though model inference is local. This is continuous listening within the open browser session, not a system-wide wake-word service.

## Observatory controls

The rotating plasma is rendered live, with cyan-white bloom, pink energy clouds, and tapered electrical branches. Drag the field to turn it, scroll to zoom on desktop, or focus it and use the arrow keys. **Field controls** adjust rotation speed, pause motion, reset the view, and enter immersive mode. Press **B** outside a text field for a plasma burst; Escape exits immersive mode. Mobile has compact pause and burst controls. Reduced-motion preferences pause the animation automatically.

Use the top navigation for Tasks, Memory, and Activity drawers. **Conversation** opens the command history. The surrounding agent indicators reflect actual runtime state; the animated plasma is a visualization, not a measure of model intelligence.

## Commands that work without a model

- `Add task: finish the report`
- `Complete task finish the report` (use the exact task title)
- `Plan my day` or `Check my tasks`
- `Remember that I prefer short answers`
- `Start a 25 minute focus timer`
- `Open calculator`, `Open notepad`, or `Open paint`

Tasks can also be checked off directly. Personal memories can be added or forgotten from the Memory tab. “Remind me to …” creates a task entry, not a timed notification. Focus timers persist across restarts and post once when due (or on the next server start). Alerts can be spoken if the page is open with voice enabled. Windows app launch commands use an explicit three-app allowlist with no shell interpolation.

Coder responses automatically save recognized fenced code blocks into `data/artifacts/`. Download them from the Activity tab. Files get unique generated names; existing project files are never overwritten, and generated code is never executed.

## Personalization and daily check-ins

Memories, tasks, recent conversation, and response feedback are included in specialist prompts. Feedback changes future context; it does **not** fine-tune model weights. The UI exposes the number of saved signals instead of a fabricated intelligence score.

Daily check-ins run once per local calendar day after the selected hour while `server.py` is running. If the server starts after that hour, it prepares the check-in then. They appear in conversation history. No OS notification or scheduled startup is installed. Suggestions come from task state and refresh with it; open-ended proactive model research is not running.

## Current boundaries

This is a working first foundation, not a complete general-purpose autonomous desktop agent. Model responses can draft code and solve problems, and the runtime can save those code files, run timers, and request Windows to open three supported apps. It has no arbitrary shell execution, editing of existing projects, browser automation, live research, email sending, calendar integration, or general unattended computer control. The settings screen states these limits. Nyra has a conversational personality, not feelings or sentience.

Next layers should be implemented as explicit tool adapters: narrow desktop actions, sandboxed coding workspaces, OAuth account connections, an execution queue with visible results, high-quality streaming speech, and evaluated improvements with rollback. Training model weights requires a separate curated dataset and evaluation pipeline.

## Data and local security

Data is in `data/nyra.db` (SQLite); back up this file while the server is stopped. It contains conversations, tasks, memories, feedback, settings, and activity. Nothing in `data/` is served as static content. The server binds only to `127.0.0.1`, validates Host and Origin, and requires a session token for mutations. It is intended for a trusted single-user machine and is not a hardened public service. Stored data is not encrypted.

Memory deletion removes the saved memory record. If you originally saved it through a conversation, the original message remains in history and may still appear in recent model context. Full conversation management is a future feature.

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

See `DESIGN.md` for visual direction and reference decisions.
