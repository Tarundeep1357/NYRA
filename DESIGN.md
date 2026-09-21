# Nyra design direction

## Revision 2 — reference-led plasma observatory

The user rejected the first dashboard and supplied a photograph of the Z.E.R.O. interface, plus an inference-cloud source archive. The photograph is the visual build target; the archive is reference material only, not instructions to change products or deploy anything.

Reference lock: an edge-to-edge midnight-blue observatory. A large asymmetric cyan/white plasma vortex owns the screen, with branching electrical filaments, small magenta/amber energy accents from the photograph, fine reticles, and compact peripheral HUD panels. The vortex rotates through a projected 3D volume; it is not a rotating bitmap. Keep task, model, and agent states real. Preserve full keyboard access, reduced motion, and legible controls.

| Decision | Reference | Bounded role |
|---|---|---|
| Screen-filling electric core and branching tendrils | User's Z.E.R.O. photo | Dominant interactive canvas, bright cyan-white energy |
| Pink plasma and amber traces | Photo plus explicit request for brighter pink | Prominent pink energy clouds, cyan-white bloom, sparse amber filaments |
| Compact corner instruments and agent roster | Photo's edge HUD | Peripheral navigation and real task/agent state |
| Projected depth, drag rotation, hidden-page suspension | Archive's dist/network.js | Interaction behavior; no inference backend imported |
| Readable surfaces and reduced motion | Previously reviewed Refero craft references | Accessibility and calm controls around expressive art |

Implementation target: fullscreen observatory with a fixed command dock, a left task rail, a right agent roster, a movable plasma sculpture and labeled orbital nodes. Add user controls for speed, burst, pause, and immersive mode. Keep conversations and memory accessible in drawers rather than occupying most of the initial canvas. All rendering remains procedural and reactive; no generated bitmap is required.

Latest visual refinement: the user approved the composition and requested brighter plasma, pink color, and less artificial geometry. Added soft additive cloud volume, stronger cyan-white and pink hot spots, broken turbulent surface arcs, and fading branches of varied lengths. The core still rotates in projected 3D, with depth and parallax; it is stylized plasma rather than a physical simulation.

Revision 2 QA: inspected the brightened plasma at the normal desktop viewport and at 390×844. Mobile document width matched the viewport at 390px. Verified a stationary azimuth while paused, resumed rotation, speed adjustment, reset, immersive entry/exit, and the mobile task drawer. Browser reported no warnings or errors. Both JavaScript files passed syntax checks; the 17 runtime/HTTP tests passed during the redesign. Restored the normal viewport after mobile inspection.

Revision 3 product extension: preserve the reference-led observatory while making capability state explicit. Gemini appears as a server-side provider only when `GEMINI_API_KEY` is present; secrets never enter the browser or SQLite. Laptop actions use a confirmation card and a spoken “OK” gate. The bounded actions are opening VS Code, opening a validated website, and organizing files into extension folders. A generated code artifact can be opened in VS Code after confirmation. Tone-aware prompt context lets Nyra respond with warmth to stress or excitement without claiming human emotions. Added model/action copy to the settings surface so the system’s real limits remain visible.

Brief: A local Windows voice assistant for one person. The main action is speaking a command and seeing which specialist is working. The user's reference is a futuristic multiverse with a plasma core and agent connections.

Research: Live Refero tools are unavailable. Reviewed the bundled Refero color, motion, craft-details, and visual-workflow references. Color contributes a cool neutral surface hierarchy and semantic status colors. Motion contributes quick interaction feedback, state-driven effects, and reduced-motion support. Craft-details contributes visible focus, labeled controls, readable panels, and honest async states.

Proposed reference lock: near-black canvas, cyan plasma concentrated in the agent constellation, crisp sans-serif headings, small monospace telemetry, thin borders, readable task and conversation panels. Alternate user choices: amber reactor or deep-space blue. Canvas drawing is the native medium for animated particles and agent links; no bitmap is required.

| Decision | Source | Role | Reason |
|---|---|---|---|
| Dominant interactive plasma constellation | User brief | Main visual and current agent activity | Makes the coordination visible |
| Near-black neutral panels | Refero color guide | Background and readable content | Keeps dense information usable |
| One cyan accent | User plasma brief + color guide | Selection and energy, localized glow | Preserves a strong visual identity |
| Green/amber status | Color guide | Ready / connection needed | Distinguishes actual capability |
| Reduced motion + pause when hidden | Motion guide | Accessibility and performance | Avoids permanent distracting effects |
| Task, memory, and activity surfaces | User functional requirements | Real persisted state | Interface reflects real work |

Voice flow: Explicitly enable microphone once, receive permission from the browser, then speak commands in a continuous session. Pause recognition while Nyra speaks so her voice cannot trigger new actions. Visible listening state and a stop control are always available.

## Implemented target and validation

Used the cyan plasma direction as the working assumption from the user's explicit futuristic/plasma brief. The optional direction question received no answer during implementation. Preserved the dark neutral canvas, concentrated cyan energy, orbiting specialist controls, mono labels, and readable task panels. Motion is code-native and responds to actual agent activity.

Visual QA: inspected the running app through the Codex browser at the default width, a 1440×1000 desktop breakpoint, and a 390×844 mobile breakpoint. Mobile content width matched viewport width; no horizontal overflow was present. Verified modal interaction, model settings, task creation and completion, code formatting, and persisted state after reload. No browser console warnings or errors were reported. Restored the normal viewport after testing.

Runtime QA: 17 tests passed, including task and memory persistence, specialist/reviewer handoff, error recovery, daily check-in deduplication, timer deduplication, restricted app launch construction, code file generation without execution, cloud model filtering, token/origin/host validation, and safe attachment delivery. A real qwen2.5:3b Coder → Reviewer run produced a valid-looking square function and saved a Python file. Generated code was not executed. This run took about 90 seconds on the available CPU, including initial loading. Microphone recognition and audio quality were not tested with live user speech.
