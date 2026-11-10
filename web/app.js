'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const dom = (tag, className, text) => { const e = document.createElement(tag); e.className = className || ''; if (text !== undefined) e.textContent = text; return e; };
let sessionToken = '', current = null, busy = false, modelConnected = false;
let messageSignature = '', taskSignature = '', detailSignature = '', knownMessages = null;
let toastTimer, selectedAgent = 'planner';
const safeStore = { get: (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }, set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private mode can block storage. */ } }, remove: key => { try { localStorage.removeItem(key); } catch { /* Private mode can block storage. */ } } };
let voiceOutput = safeStore.get('nyra.voiceOutput', 'true') === 'true';
let motionPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
async function api(path, data) {
  const options = data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nyra-Token': sessionToken }, body: JSON.stringify(data) };
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to reach Nyra. Check that the local server is running.');
  return body;
}
async function refresh() { try { current = await api('/api/state'); renderState(); } catch { $('#connection-label').textContent = 'Server offline'; $('#system-state').textContent = 'OFFLINE'; } }
async function mutate(path, data) { try { await api(path, data); await refresh(); return true; } catch (error) { toast(error.message); return false; } }

function renderState() {
  if (knownMessages !== null) {
    const alerts = current.messages.filter(message => !knownMessages.has(message.id) && message.role === 'assistant' && /^(Timer finished:|Your daily check-in)/.test(message.content));
    if (alerts.length) { const text = alerts[alerts.length - 1].content; toast(text.slice(0, 180)); if (voiceEnabled && voiceOutput && !busy && !speaking) speak(text); }
  }
  const wasStreaming = knownMessages !== null && current.messages.length > knownMessages.size && !busy;
  knownMessages = new Set(current.messages.map(message => message.id));
  if (wasStreaming) { messageSignature = ''; if (!busy) stopTyping(); }
  const tasks = current.tasks, completed = tasks.filter(task => task.done).length;
  $('#task-count').textContent = tasks.length - completed;
  $('#task-progress').textContent = `${completed} complete`;
  $('#progress-fill').style.width = `${tasks.length ? completed / tasks.length * 100 : 0}%`;
  $('#memory-count').textContent = current.memories.length;
  $('#feedback-count').textContent = current.feedback_count;
  $('#insight').textContent = current.insight;
  const nextTasks = JSON.stringify(tasks);
  if (taskSignature !== nextTasks) {
    taskSignature = nextTasks;
    $('#task-list').replaceChildren();
    if (!tasks.length) $('#task-list').append(dom('p', 'empty-tasks', 'A clear orbit. Add your first task, or say “add task” followed by what you want to do.'));
    tasks.slice(0, 8).forEach(task => $('#task-list').append(taskRow(task)));
  }
  const nextMessages = JSON.stringify(current.messages);
  if (nextMessages !== messageSignature && current.messages.length) {
    messageSignature = nextMessages;
    const container = $('#messages');
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    container.replaceChildren(...current.messages.map(messageNode));
    if (nearBottom || busy) container.scrollTop = container.scrollHeight;
  }
  $$('.agent, .agent-row').forEach(agent => {
    const active = agent.dataset.agent === current.active.agent;
    agent.classList.toggle('working', active);
    const status = agent.querySelector('.agent-state');
    if (status) status.textContent = active ? 'WORKING' : agent.dataset.agent === 'planner' || modelConnected && current.settings.model ? 'READY' : 'STANDBY';
  });
  $('#message-count').textContent = current.messages.filter(message => message.role === 'assistant').length;
  const timer = current.timers?.[0];
  $('#stage').textContent = current.active.agent ? current.active.stage : timer ? `Focus · ${Math.max(0, Math.ceil((timer.due * 1000 - Date.now()) / 60000))} min left` : 'Ready when you are';
  $('#system-state').textContent = current.active.agent ? 'WORKING' : modelConnected && current.settings.model ? 'CONNECTED' : 'STANDBY';
  if (!voiceEnabled) $('#core-state').textContent = current.active.agent ? current.active.stage.toUpperCase() : 'AWAITING YOUR VOICE';
  const pending = current.pending_action;
  $('#pending-action').hidden = !pending;
  if (pending) {
    const risk = pending.risk ? `${(pending.domain || 'local').toUpperCase()} · ${pending.risk.toUpperCase()} RISK` : '';
    $('#pending-label').textContent = pending.label;
    $('#pending-steps').textContent = `${risk ? risk + ' · ' : ''}${pending.steps?.join(' · ') || 'Ready to execute'} · Say “OK” or “cancel”.`;
  }
  renderDetail();
}

// Thinking indicator: the synchronous command call takes a while, so show progress as soon as the server reports work.
let typingTimer;
function startTyping() {
  clearInterval(typingTimer);
  $('#typing').hidden = false;
  const tick = () => { $('#typing-label').textContent = current?.active?.agent && !busy ? `${(current.active.stage || 'Working').toUpperCase()}…` : 'Nyra is thinking…'; };
  tick(); typingTimer = setInterval(tick, 700);
}
function stopTyping() { clearInterval(typingTimer); $('#typing').hidden = true; $('#typing-label').textContent = 'Nyra is thinking…'; }
function taskRow(task, prefix = 'task') {
  const row = dom('div', 'task' + (task.done ? ' done' : ''));
  const checkbox = dom('input'); checkbox.type = 'checkbox'; checkbox.id = `${prefix}-${task.id}`; checkbox.checked = !!task.done;
  checkbox.addEventListener('change', async () => { checkbox.disabled = true; const ok = await mutate('/api/task', { id: task.id, done: checkbox.checked }); if (!ok) checkbox.checked = !checkbox.checked; checkbox.disabled = false; });
  const label = dom('label', '', task.title); label.htmlFor = checkbox.id;
  row.append(checkbox, label); return row;
}
function messageNode(message) {
  const article = dom('article', `message ${message.role}`);
  const body = dom('div', 'message-content');
  const pieces = message.content.split(/(```[a-zA-Z]*\s*\n[\s\S]*?```)/g);
  pieces.forEach(piece => {
    const code = piece.match(/^```([a-zA-Z]*)\s*\n([\s\S]*?)```$/);
    if (code) { const block = dom('div', 'code-block'); const header = dom('div', 'code-header', code[1] || 'code'); const pre = dom('pre'); pre.append(dom('code', '', code[2].trimEnd())); block.append(header, pre); body.append(block); }
    else body.append(document.createTextNode(piece));
  });
  article.append(dom('div', 'message-head', message.role === 'user' ? 'YOU' : `✧ NYRA / ${message.agent.toUpperCase()}`), body);
  if (message.role === 'assistant') {
    const actions = dom('div', 'feedback-actions');
    for (const [rating, text] of [[1, '↑ Helpful'], [-1, '↓ Improve']]) {
      const button = dom('button', '', text);
      button.addEventListener('click', async () => {
        let note = '';
        if (rating < 0) { note = window.prompt('What should Nyra do differently next time?', '') ?? ''; }
        if (await mutate('/api/feedback', { id: message.id, rating, note })) { toast('Feedback saved for future conversations.'); button.textContent = '✓ Saved'; }
      });
      actions.append(button);
    }
    const copy = dom('button', '', 'Copy'); copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(message.content); toast('Response copied.'); } catch { toast('Select the response text to copy it.'); } }); actions.append(copy);
    article.append(actions);
  }
  return article;
}
async function command(text, fromVoice = false) {
  if (!text.trim()) return;
  if (busy) { toast('Nyra is still working on your previous request.'); return; }
  busy = true;
  startTyping();
  stopRecognition();
  // Keep the input usable but block a second submit with the button until this request finishes.
  $('#send-button').disabled = true;
  $('#command-input').value = '';
  $('#core-state').textContent = 'CONNECTING THE DOTS'; $('#stage').textContent = 'Routing your command';
  try {
    const response = await api('/api/command', { command: text.trim() });
    await refresh();
    if (!fromVoice && !/Say “OK”/.test(response.content)) openConversation(true);
    if (voiceOutput && (fromVoice || voiceEnabled)) speak(response.content);
  } catch (error) { toast(error.message); $('#command-input').value = text; }
  finally {
    busy = false;
    stopTyping();
    $('#send-button').disabled = false; $('#command-input').disabled = false;
    if (voiceEnabled && !speaking) scheduleRecognition();
  }
}
$('#command-form').addEventListener('submit', event => { event.preventDefault(); command($('#command-input').value); });
$$('[data-command]').forEach(button => button.addEventListener('click', () => command(button.dataset.command)));
$('#brief-button').addEventListener('click', () => command('Plan my day'));
$('#focus-button').addEventListener('click', () => command(current?.tasks.some(task => !task.done) ? 'Help me prioritize my open tasks and choose a 25-minute first step.' : 'Help me choose one meaningful goal for today. Ask me one question to begin.'));
$('#add-task').addEventListener('click', () => { $('#task-dialog').showModal(); $('#task-input').focus(); });
$('#task-form').addEventListener('submit', async event => { event.preventDefault(); const button = $('#task-form button[type=submit]'); button.disabled = true; if (await mutate('/api/tasks', { title: $('#task-input').value })) { $('#task-input').value = ''; $('#task-dialog').close(); } button.disabled = false; });
$$('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));

function renderDetail() {
  const view = location.hash.slice(1) || 'overview';
  $$('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $('#detail-section').hidden = view === 'overview' || !['memory', 'activity', 'tasks'].includes(view);
  if (!$('#detail-section').hidden) { $('#conversation-panel').hidden = true; $('#conversation-toggle').setAttribute('aria-expanded', 'false'); }
  syncDrawers();
  if ($('#detail-section').hidden || !current) return;
  const signature = JSON.stringify([view, view === 'memory' ? current.memories : view === 'tasks' ? current.tasks : [current.events, current.artifacts]]);
  if (signature === detailSignature) return;
  detailSignature = signature;
  const content = $('#detail-content'); content.replaceChildren();
  $('#detail-title').textContent = { tasks: 'Your tasks', memory: 'What Nyra remembers', activity: 'What’s been happening' }[view];
  if (view === 'tasks') {
    const add = dom('button', 'primary-button', 'Add a task +');
    add.addEventListener('click', () => { $('#task-dialog').showModal(); $('#task-input').focus(); });
    content.append(add);
    if (!current.tasks.length) content.append(dom('p', 'detail-empty', 'No tasks yet. Add a task above or use your voice.'));
    current.tasks.forEach(task => content.append(taskRow(task, 'detail-task')));
  } else if (view === 'memory') {
    content.append(dom('p', 'detail-empty', 'Personal context you choose to save. Memories are included in future model prompts and can be forgotten here.'));
    const form = dom('form', 'memory-add'); const input = dom('input'); input.setAttribute('aria-label', 'New memory'); input.placeholder = 'Something you want Nyra to remember…'; input.maxLength = 2000; input.required = true;
    const button = dom('button', 'subtle-button', 'Save memory ↗'); button.type = 'submit'; form.append(input, button);
    form.addEventListener('submit', async event => { event.preventDefault(); button.disabled = true; await mutate('/api/memories', { content: input.value }); button.disabled = false; }); content.append(form);
    current.memories.forEach(memory => { const row = dom('div', 'detail-row'); const remove = dom('button', 'subtle-button', 'Forget'); remove.addEventListener('click', async () => { if (await mutate('/api/forget', { id: memory.id })) toast('Memory removed.'); }); row.append(dom('p', '', memory.content), remove); content.append(row); });
  } else {
    if (current.artifacts?.length) {
      content.append(dom('h3', '', 'Your code files'));
      current.artifacts.forEach(artifact => { const row = dom('div', 'detail-row'); const link = dom('a', 'text-button', 'Download ↗'); link.href = `/api/artifact/${artifact.id}`; link.download = artifact.name; row.append(dom('p', '', artifact.name), link); content.append(row); });
      content.append(dom('h3', '', 'Agent activity'));
    }
    if (!current.events.length) content.append(dom('p', 'detail-empty', 'Your agent activity will appear here as Nyra works.'));
    current.events.forEach(event => { const row = dom('div', 'detail-row'); const text = dom('p', '', `${event.agent.toUpperCase()} · ${event.content}`); const time = dom('time', '', new Date(event.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); time.dateTime = event.created; row.append(text, time); content.append(row); });
  }
}
window.addEventListener('hashchange', () => { renderDetail(); if (!$('#detail-section').hidden) $('#detail-section .icon-button').focus(); });

function syncDrawers() {
  const open = !$('#conversation-panel').hidden || !$('#detail-section').hidden;
  $('#drawer-scrim').hidden = !open;
  $('.topbar').inert = open; $('#observatory').inert = open;
  document.body.classList.toggle('drawer-open', open);
}
function openConversation(open) {
  if (open) { history.replaceState(null, '', '#overview'); $('#detail-section').hidden = true; }
  $('#conversation-panel').hidden = !open;
  $('#conversation-toggle').setAttribute('aria-expanded', String(open));
  syncDrawers();
  if (open) { $('#close-conversation').focus(); $('#messages').scrollTop = $('#messages').scrollHeight; }
  else $('#command-input').focus();
}
function closeDrawers() { history.replaceState(null, '', '#overview'); $('#detail-section').hidden = true; openConversation(false); renderDetail(); }
$('#conversation-toggle').addEventListener('click', () => openConversation($('#conversation-panel').hidden));
$('#close-conversation').addEventListener('click', () => openConversation(false));
$('#back-to-command').addEventListener('click', () => openConversation(false));
$('#drawer-scrim').addEventListener('click', closeDrawers);
// Clicking any nav item, including "Observatory", always closes open drawers.
$$('.nav-item[data-view]').forEach(item => item.addEventListener('click', () => {
  if (item.dataset.view === 'overview') closeDrawers();
  else { $('#conversation-panel').hidden = true; $('#conversation-toggle').setAttribute('aria-expanded', 'false'); }
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !$('#drawer-scrim').hidden) closeDrawers();
  if (event.key !== 'Tab' || $('#drawer-scrim').hidden || document.querySelector('dialog[open]')) return;
  const panel = !$('#conversation-panel').hidden ? $('#conversation-panel') : $('#detail-section');
  const focusable = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select')];
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});

const agentInfo = {
  planner: ['Planner', 'I help turn goals into clear next steps. Task commands work immediately. With a connected model, I can use your saved tasks and memories to help plan your day. External calendars are not connected.', 'Help me make a practical plan for '],
  coder: ['Coder', 'I draft code, explain errors, and help solve programming problems with your connected model. Recognized code blocks are saved as downloadable files in Activity. Generated code is never executed automatically.', 'Help me write code to '],
  researcher: ['Researcher', 'I explain concepts, compare ideas, and reason through problems using your connected model. This version has no live web access, so current facts need independent verification.', 'Help me understand '],
  reviewer: ['Reviewer', 'I provide a separate model pass to check specialist responses for accuracy and unsupported claims. Enable “Second perspective” in settings. This is a separate role using the same selected model.', 'Review the following idea and help me improve it: ']
};
$$('[data-agent]').forEach(button => button.addEventListener('click', () => { selectedAgent = button.dataset.agent; $('#agent-title').textContent = agentInfo[selectedAgent][0]; $('#agent-description').textContent = agentInfo[selectedAgent][1]; $('#agent-dialog').showModal(); }));
$('#agent-action').addEventListener('click', () => { $('#agent-dialog').close(); $('#command-input').value = agentInfo[selectedAgent][2]; $('#command-input').focus(); });

async function refreshModels() {
  $('#model-status').textContent = 'Checking Ollama…';
  try {
    const result = await api('/api/models'); modelConnected = result.connected;
    $('#model-status').textContent = result.connected ? `${result.models.length} model${result.models.length === 1 ? '' : 's'} available.` : result.error;
    $('#model-provider').textContent = result.models.some(model => model.startsWith('gemini-')) ? 'Ollama + Gemini intelligence' : 'Ollama · local intelligence';
    $('#model-select').replaceChildren(new Option(result.models.length ? 'Choose an available model' : 'No models available', ''));
    result.models.forEach(model => $('#model-select').add(new Option(model.startsWith('gemini-') ? `${model} · Gemini API` : `${model} · Ollama`, model)));
    const selected = current?.settings.model || '';
    if (selected && !result.models.includes(selected)) $('#model-select').add(new Option(`${selected} (unavailable)`, selected));
    $('#model-select').value = selected;
    const ready = result.connected && result.models.includes(selected);
    $('#connection-label').textContent = ready ? 'Model connected' : result.connected ? 'Select a model' : 'Connect model';
    $('#connection-dot').classList.toggle('warning', !ready);
    $('#settings-dot').classList.toggle('warning', !result.connected);
    $('#agent-status').textContent = ready ? '4 specialists · model connected' : '4 specialists · awaiting model';
  } catch (error) { toast(error.message); }
}
$('#confirm-action').addEventListener('click', () => command('OK', false));
function populateVoices() {
  const select = $('#voice-select'); const desired = safeStore.get('nyra.voice');
  select.replaceChildren(new Option('System default', ''));
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  voices.forEach(voice => select.add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI)));
  const preferred = voices.find(voice => /zira|jenny|aria|samantha|susan|hazel|female/i.test(voice.name) && /^en/i.test(voice.lang));
  select.value = voices.some(voice => voice.voiceURI === desired) ? desired : preferred?.voiceURI || '';
}
for (let hour = 0; hour < 24; hour++) $('#brief-hour').add(new Option(`${String(hour).padStart(2, '0')}:00`, hour));
async function openSettings() {
  $('#settings-dialog').showModal();
  if (current) { $('#review-toggle').checked = current.settings.review; $('#daily-toggle').checked = current.settings.daily_brief; $('#brief-hour').value = current.settings.brief_hour; }
  $('#voice-pitch').value = safeStore.get('nyra.pitch', '1.05'); $('#pitch-value').textContent = $('#voice-pitch').value;
  populateVoices(); renderCalendar(); await refreshModels();
}
function renderCalendar() {
  const calendar = current?.calendar;
  if (!calendar) return;
  $('#calendar-state').textContent = calendar.connected ? 'Connected · read-only' : calendar.configured ? 'Ready to connect' : 'Not configured';
  $('#calendar-state').classList.toggle('connected', calendar.connected);
  $('#calendar-message').textContent = calendar.message;
  $('#calendar-setup').hidden = calendar.connected || calendar.configured;
  $('#calendar-oauth').hidden = !calendar.configured || calendar.connected;
  $('#calendar-disconnect').hidden = !calendar.connected;
  // Show only the correct call to action: (not configured) setup -> (configured) OAuth -> (connected) disconnect.
  $('#calendar-authorize').hidden = !calendar.configured || calendar.connected;
  $('#calendar-exchange').hidden = !calendar.configured || calendar.connected;
  $('#calendar-code').hidden = !calendar.configured || calendar.connected;
}
$('#calendar-connect').addEventListener('click', async () => {
  const button = $('#calendar-connect'); button.disabled = true;
  try {
    const result = await api('/api/calendar/connect', { client_id: $('#calendar-client-id').value, client_secret: $('#calendar-client-secret').value });
    $('#calendar-client-secret').value = ''; toast(result.message); await refresh(); renderCalendar();
  } catch (error) { toast(error.message); }
  button.disabled = false;
});
$('#calendar-authorize').addEventListener('click', async () => {
  try { const result = await api('/api/calendar/authorize', {}); window.open(result.url, '_blank', 'noopener'); toast('Approve read-only access in the new tab, then paste the code Google gives you.'); }
  catch (error) { toast(error.message); }
});
$('#calendar-exchange').addEventListener('click', async () => {
  const button = $('#calendar-exchange'); button.disabled = true;
  try { const result = await api('/api/calendar/exchange', { code: $('#calendar-code').value }); $('#calendar-code').value = ''; toast(result.message); await refresh(); renderCalendar(); }
  catch (error) { toast(error.message); }
  button.disabled = false;
});
$('#calendar-disconnect').addEventListener('click', async () => {
  try { const result = await api('/api/calendar/disconnect', {}); toast(result.message); await refresh(); renderCalendar(); }
  catch (error) { toast(error.message); }
});
$$('[data-open=settings]').forEach(button => button.addEventListener('click', openSettings));
$('#refresh-models').addEventListener('click', refreshModels);
$('#voice-pitch').addEventListener('input', () => { $('#pitch-value').textContent = $('#voice-pitch').value; });
$('#save-settings').addEventListener('click', async () => {
  const button = $('#save-settings'); button.disabled = true;
  const ok = await mutate('/api/settings', { model: $('#model-select').value, review: $('#review-toggle').checked, daily_brief: $('#daily-toggle').checked, brief_hour: Number($('#brief-hour').value) });
  if (ok) { safeStore.set('nyra.voice', $('#voice-select').value); safeStore.set('nyra.pitch', $('#voice-pitch').value); $('#settings-dialog').close(); toast('Preferences saved.'); await refreshModels(); }
  button.disabled = false;
});

// Continuous voice is opt-in. Recognition never runs while Nyra speaks.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null, voiceEnabled = false, recognizing = false, speaking = false, autoStarting = false, restartTimer, speechWatchdog;
const voiceConsentKey = 'nyra.voiceConsent.v1';
function hasVoiceConsent() { return safeStore.get(voiceConsentKey) === 'true'; }
function updateVoiceArmed() { const armed = hasVoiceConsent(); $('#voice-armed').hidden = !armed; document.body.classList.toggle('auto-voice-armed', armed); }
function voiceUI(text) { updateVoiceArmed(); document.body.classList.toggle('is-listening', voiceEnabled); $('#voice-status').textContent = text; $('#mic-button').classList.toggle('listening', voiceEnabled); $('#mic-button').setAttribute('aria-label', voiceEnabled ? 'Stop continuous voice' : hasVoiceConsent() ? 'Resume automatic voice' : 'Enable continuous voice'); $('#core-state').textContent = voiceEnabled ? speaking ? 'SPEAKING TO YOU' : busy ? 'THINKING WITH YOU' : 'LISTENING TO YOU' : hasVoiceConsent() ? 'AUTO VOICE ARMED' : 'AWAITING YOUR VOICE'; }
function stopRecognition() { clearTimeout(restartTimer); if (recognition && recognizing) { try { recognition.abort(); } catch { /* Already stopped. */ } } }
function scheduleRecognition() { clearTimeout(restartTimer); if (voiceEnabled && !busy && !speaking) restartTimer = setTimeout(startRecognition, 650); }
function startRecognition() {
  if (!voiceEnabled || busy || speaking || recognizing) return;
  try { recognition.start(); } catch { scheduleRecognition(); }
}
function disableVoice(text = 'Your microphone is off.') { voiceEnabled = false; stopRecognition(); if ('speechSynthesis' in window) speechSynthesis.cancel(); speaking = false; clearTimeout(speechWatchdog); voiceUI(text); }
function beginVoice() {
  if (voiceEnabled) return;
  if (!Recognition) { toast('Speech recognition is unavailable in this browser. Open Nyra in Chrome or Edge and try again.'); return; }
  if (!recognition) {
    recognition = new Recognition(); recognition.lang = 'en-IN'; recognition.continuous = false; recognition.interimResults = true;
    recognition.onstart = () => { recognizing = true; autoStarting = false; voiceUI('Listening · Say your command, or “stop listening” to end voice mode.'); };
    recognition.onresult = event => {
      let finalText = '', interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) finalText += event.results[i][0].transcript; else interim += event.results[i][0].transcript; }
      if (interim) $('#voice-status').textContent = `Hearing: ${interim}`;
      if (finalText && !busy && !speaking && voiceEnabled) {
        if (/^(?:hey )?(?:nyra[, ]+)?(?:stop listening|microphone off|stop voice)[.!?]?$/i.test(finalText.trim())) { disableVoice(); return; }
        command(finalText, true);
      }
    };
    recognition.onend = () => { recognizing = false; scheduleRecognition(); };
    recognition.onerror = event => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      if (autoStarting && (event.error === 'not-allowed' || event.error === 'service-not-allowed')) { autoStarting = false; voiceEnabled = false; voiceUI('Auto voice is armed · click the microphone once to resume.'); return; }
      disableVoice(event.error === 'not-allowed' ? 'Microphone permission was denied. Allow it in browser settings to use voice.' : `Voice stopped (${event.error}). Check microphone and browser connectivity, then try again.`);
      toast($('#voice-status').textContent);
    };
  }
  voiceEnabled = true; voiceUI(autoStarting ? 'Starting automatic voice…' : 'Connecting your microphone…'); startRecognition();
}
function toggleVoice() {
  if (voiceEnabled) { disableVoice(); return; }
  if (!hasVoiceConsent()) { $('#voice-consent-dialog').showModal(); return; }
  beginVoice();
}
function speak(text, preview = false) {
  if (!('speechSynthesis' in window)) { if (preview) toast('Speech synthesis is unavailable in this browser.'); return; }
  stopRecognition(); speechSynthesis.cancel(); speaking = true;
  const clean = text.replace(/```[\s\S]*?```/g, 'I have included code in the conversation.').replace(/[#*`]/g, '').slice(0, 1800);
  const utterance = new SpeechSynthesisUtterance(clean);
  const wanted = preview ? $('#voice-select').value : safeStore.get('nyra.voice');
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find(voice => voice.voiceURI === wanted) || voices.find(voice => /zira|jenny|aria|samantha|susan|hazel/i.test(voice.name) && /^en/i.test(voice.lang)) || null;
  utterance.rate = 0.97; utterance.pitch = Number(preview ? $('#voice-pitch').value : safeStore.get('nyra.pitch', '1.05'));
  const finish = () => { clearTimeout(speechWatchdog); speaking = false; voiceUI(voiceEnabled ? 'Ready for your next command…' : 'Your microphone is off.'); scheduleRecognition(); };
  utterance.onend = finish; utterance.onerror = finish; speechWatchdog = setTimeout(() => { speechSynthesis.cancel(); finish(); }, 150000);
  voiceUI('Nyra is speaking…'); speechSynthesis.speak(utterance);
}
$('#mic-button').addEventListener('click', toggleVoice); $('#core-button').addEventListener('click', toggleVoice);
$('#enable-voice').addEventListener('click', () => { if ($('#remember-voice').checked) safeStore.set(voiceConsentKey, 'true'); else safeStore.remove(voiceConsentKey); $('#voice-consent-dialog').close(); autoStarting = false; beginVoice(); });
$('#test-voice').addEventListener('click', () => speak('Hey, I’m Nyra. Your ideas, your goals, your universe. Let’s make a little more possible.', true));
function updateOutputToggle() { $('#voice-output').textContent = voiceOutput ? '◖)) Voice on' : '◖)) Voice off'; $('#voice-output').setAttribute('aria-pressed', voiceOutput); }
$('#voice-output').addEventListener('click', () => { voiceOutput = !voiceOutput; safeStore.set('nyra.voiceOutput', voiceOutput); updateOutputToggle(); if (!voiceOutput && 'speechSynthesis' in window) { speechSynthesis.cancel(); clearTimeout(speechWatchdog); speaking = false; scheduleRecognition(); } });
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', populateVoices);
window.addEventListener('pagehide', () => disableVoice());
document.addEventListener('keydown', event => { if (event.key === 'Escape' && voiceEnabled) disableVoice(); });

// The observatory renderer is separate from application and voice state.
const plasma = window.createNyraPlasma($('#plasma'), {
  paused: motionPaused,
  getActivity: () => ({ agent: current?.active.agent, busy, speaking })
});
function updateMotionButton() {
  $('#motion-toggle').setAttribute('aria-pressed', String(motionPaused));
  $('#motion-toggle').textContent = motionPaused ? '▷ Resume' : 'Ⅱ Pause';
  $('#mobile-motion').setAttribute('aria-pressed', String(motionPaused));
  $('#mobile-motion').setAttribute('aria-label', motionPaused ? 'Resume rotation' : 'Pause rotation');
  $('#mobile-motion').textContent = motionPaused ? '▷' : 'Ⅱ';
}
function toggleMotion() { motionPaused = !motionPaused; plasma.setPaused(motionPaused); updateMotionButton(); }
$('#motion-toggle').addEventListener('click', toggleMotion);
$('#mobile-motion').addEventListener('click', toggleMotion);
function triggerBurst() { if (motionPaused) { toast('Resume motion to trigger a plasma burst.'); return; } plasma.burst(); }
$('#burst-button').addEventListener('click', triggerBurst);
$('#mobile-burst').addEventListener('click', triggerBurst);
$('#rotation-speed').addEventListener('input', event => { const speed = Number(event.target.value); plasma.setSpeed(speed); $('#speed-value').textContent = speed.toFixed(1) + '×'; });
$('#reset-view').addEventListener('click', () => { plasma.reset(); $('#rotation-speed').value = 1; plasma.setSpeed(1); $('#speed-value').textContent = '1.0×'; });
function setImmersive(value) { document.body.classList.toggle('immersive', value); $('#exit-immersive').hidden = !value; $('#immersive-button').setAttribute('aria-pressed', String(value)); if (value) $('#exit-immersive').focus(); else $('#immersive-button').focus(); }
$('#immersive-button').addEventListener('click', () => setImmersive(true));
$('#exit-immersive').addEventListener('click', () => setImmersive(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('immersive')) setImmersive(false);
  if (event.key.toLowerCase() === 'b' && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.id !== 'plasma' && !document.querySelector('dialog[open]') && $('#drawer-scrim').hidden) triggerBurst();
});
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { motionPaused = event.matches; plasma.setPaused(motionPaused); updateMotionButton(); });
function updateClock() { const date = new Date(); $('#clock').textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); $('#date-label').textContent = date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); }
// Theme: follow the saved choice, otherwise the operating system preference.
const themeButton = $('#theme-toggle');
function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.documentElement.dataset.theme = theme;
  const next = theme === 'light' ? 'dark' : 'light';
  themeButton.setAttribute('aria-label', `Switch to ${next} theme`);
  themeButton.title = `Switch to ${next} theme`;
}
applyTheme(safeStore.get('nyra.theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
themeButton.addEventListener('click', () => {
  const next = document.body.classList.contains('theme-light') ? 'dark' : 'light';
  safeStore.set('nyra.theme', next); applyTheme(next);
});

async function boot() {
  updateClock(); setInterval(updateClock, 10000); updateOutputToggle(); updateMotionButton(); populateVoices(); updateVoiceArmed();
  try { sessionToken = (await api('/api/session')).token; await refresh(); await refreshModels(); if (hasVoiceConsent() && Recognition) { autoStarting = true; window.setTimeout(beginVoice, 500); } } catch { toast('Unable to connect to Nyra. Start the local server and reload.'); }
  setInterval(refresh, 1000);
}
boot();
