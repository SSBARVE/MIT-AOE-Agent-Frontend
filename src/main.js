/**
 * main.js — MIT Assistant Frontend Entry Point (Vite)
 *
 * Module structure:
 *   src/main.js   → app state, event wiring, render cycle
 *   src/api.js    → all HTTP calls to https://research-teaching-service-api-952306581103.asia-south1.run.app 
 *   src/style.css → design system
 */

import './style.css';
import { checkHealth, embedPDF, MODE_FETCH } from './api.js';

// ─── Mode Configuration ─────────────────────────────────────────────────────

const MODES = {
  ra: {
    badge: 'Research Mode',
    badgeStyle: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
    title: 'Scientific Literature & Search Assistant',
    desc: 'Uses LangGraph and live MCP tools (arXiv, Tavily Search, Extract Webpage) to create comparative literature summaries.',
    placeholder: 'Ask the Research Assistant to search academic databases and summarize...',
    welcomeIcon: '🧬',
    suggestions: [
      { label: 'Academic Search', text: 'Search arXiv for recent papers on LLM agents security models' },
      { label: 'Web Comparison', text: 'Summarize differences between Gemini 1.5 and Llama 3 architectures' },
      { label: 'Literature Review', text: 'Create a summary of modern vector database indexing algorithms' },
      { label: 'Deep Extraction', text: 'Extract and summarize the Model Context Protocol specification' },
    ],
  },
  ta: {
    badge: 'Teaching Mode',
    badgeStyle: { bg: 'rgba(6,182,212,0.15)', color: '#22d3ee' },
    title: 'C Programming Curriculum Assistant',
    desc: 'Uses localised RAG (ChromaDB index of the C syllabus) with a DuckDuckGo web-search fallback to tutor you in C programming.',
    placeholder: 'Ask a question about C programming — variables, pointers, structs...',
    welcomeIcon: '🎓',
    suggestions: [
      { label: 'Memory Mgmt', text: 'Explain dynamic memory allocation using malloc and free in C' },
      { label: 'Data Types', text: 'What is the difference between a structure and a union in C?' },
      { label: 'Pointers', text: 'Explain pointers and why memory leaks occur' },
      { label: 'Course Scope', text: 'What C libraries are covered in the MIT AOE curriculum?' },
    ],
  },
  hw: {
    badge: 'Homework Mode',
    badgeStyle: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
    title: 'Sequential Homework Q&A Generator',
    desc: 'Orchestrates a cooperative multi-agent flow: first generates targeted questions, then answers them from the curriculum.',
    placeholder: 'Specify a C topic to generate a homework sheet (e.g. Arrays, Pointers, Recursion)...',
    welcomeIcon: '📝',
    suggestions: [
      { label: 'Array Quiz', text: 'Generate homework questions for Multidimensional Arrays' },
      { label: 'Loop Control', text: 'Create a test with solutions for while and for loops' },
      { label: 'Recursion', text: 'Generate C homework on recursive functions and stack memory' },
      { label: 'File Handling', text: 'Generate homework questions on fopen, fread, and fwrite' },
    ],
  },
};

// ─── Application State ──────────────────────────────────────────────────────

const state = {
  currentMode: 'ra',
  isProcessing: false,
  chatHistories: { ra: [], ta: [], hw: [] },
  traceHistories: { ra: [], ta: [], hw: [] },
};

// ─── DOM Helpers ────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

// ─── Markdown Parser ────────────────────────────────────────────────────────

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseMarkdown(raw) {
  if (!raw) return '';
  let s = escapeHTML(raw);

  // Fenced code blocks
  const codeBlocks = [];
  s = s.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.slice(3, -3).replace(/^[a-zA-Z]+\n/, '');
    codeBlocks.push(`<pre><code>${inner.trim()}</code></pre>`);
    return `§CODE§${codeBlocks.length - 1}§`;
  });

  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold / italic
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Unordered lists — collect consecutive <li> into <ul>
  s = s.replace(/^[ \t]*[-*] (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

  // Paragraphs (blank-line separated non-block lines)
  const ul = [];
  s = s.replace(/<ul>[\s\S]*?<\/ul>/g, (m) => { ul.push(m); return `§UL§${ul.length - 1}§`; });

  s = s
    .split(/\n{2,}/)
    .map((chunk) => {
      chunk = chunk.trim();
      if (!chunk) return '';
      if (/^§(CODE|UL)§/.test(chunk) || /^<(h[1-3]|pre)/.test(chunk)) return chunk;
      return `<p>${chunk.replace(/\n/g, ' ')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  // Restore blocks
  codeBlocks.forEach((b, i) => { s = s.replace(`§CODE§${i}§`, b); });
  ul.forEach((b, i) => { s = s.replace(`§UL§${i}§`, b); });

  return s;
}

// ─── UI Renderers ────────────────────────────────────────────────────────────

function renderWelcome() {
  const meta = MODES[state.currentMode];
  const container = $('chat-messages-container');
  container.innerHTML = '';

  const card = el('div', 'welcome-card');
  card.innerHTML = `
    <div class="welcome-icon">${meta.welcomeIcon}</div>
    <h2>${meta.title}</h2>
    <p>Pick a quick prompt or type your own question below.</p>
    <div class="suggestions-grid"></div>
  `;

  const grid = card.querySelector('.suggestions-grid');
  meta.suggestions.forEach(({ label, text }) => {
    const item = el('div', 'suggestion-item');
    item.innerHTML = `<span class="suggestion-label">${label}</span><span class="suggestion-text">"${text}"</span>`;
    item.addEventListener('click', () => {
      const ta = $('user-input');
      ta.value = text;
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    });
    grid.appendChild(item);
  });

  container.appendChild(card);
}

function renderMessages() {
  const history = state.chatHistories[state.currentMode];
  if (!history.length) { renderWelcome(); return; }

  const container = $('chat-messages-container');
  container.innerHTML = '';

  history.forEach(({ role, content, timestamp }) => {
    const isUser = role === 'user';
    const modeKey = state.currentMode;
    const avatar = isUser ? '👤' : modeKey === 'ra' ? '🧬' : modeKey === 'ta' ? '🎓' : '📝';
    const bodyHTML = isUser ? `<p>${escapeHTML(content)}</p>` : parseMarkdown(content);

    const div = el('div', `message ${role}`);
    div.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-bubble">
        <div class="markdown-body">${bodyHTML}</div>
        <span class="message-meta">${timestamp}</span>
      </div>
    `;
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
}

function renderTrace() {
  const history = state.traceHistories[state.currentMode];
  const panel = $('thought-tracer-panel');
  const content = $('tracer-content');

  if (!history.length) {
    panel.classList.add('hidden');
    content.innerHTML = '<p class="tracer-placeholder">Agent trace will appear here...</p>';
    return;
  }

  panel.classList.remove('hidden');
  content.innerHTML = '';

  history.forEach(({ icon, title, body, ts }) => {
    const step = el('div', 'tracer-step');
    step.innerHTML = `
      <span class="tracer-step-meta">${icon} [${ts}] ${escapeHTML(title)}</span>
      <div class="tracer-step-content">${escapeHTML(body || '')}</div>
    `;
    content.appendChild(step);
  });

  content.scrollTop = content.scrollHeight;
}

function addTraceStep(icon, title, body = '') {
  state.traceHistories[state.currentMode].push({
    icon, title, body,
    ts: new Date().toLocaleTimeString(),
  });
}

// ─── Mode Switching ──────────────────────────────────────────────────────────

function switchMode(modeKey) {
  if (state.isProcessing || modeKey === state.currentMode) return;
  state.currentMode = modeKey;

  // Sidebar active state
  document.querySelectorAll('.mode-item').forEach((el) => el.classList.remove('active'));
  $(`mode-${modeKey}`).classList.add('active');

  // Header
  const meta = MODES[modeKey];
  const badge = $('active-mode-badge');
  badge.textContent = meta.badge;
  badge.style.background = meta.badgeStyle.bg;
  badge.style.color = meta.badgeStyle.color;
  badge.style.borderColor = meta.badgeStyle.color;
  $('active-mode-title').textContent = meta.title;
  $('active-mode-desc').textContent = meta.desc;

  // Input
  const ta = $('user-input');
  ta.placeholder = meta.placeholder;
  ta.value = '';
  ta.style.height = 'auto';
  $('char-counter').textContent = '0 characters';

  renderMessages();
  renderTrace();
}

// ─── Backend Health ───────────────────────────────────────────────────────────

async function checkBackendHealth() {
  const dot = $('api-status-dot');
  const text = $('api-status-text');
  dot.className = 'status-indicator offline';
  text.className = 'status-text';
  text.textContent = 'Checking...';

  try {
    await checkHealth();
    dot.className = 'status-indicator online';
    text.className = 'status-text online';
    text.textContent = 'Online';
  } catch {
    dot.className = 'status-indicator offline';
    text.className = 'status-text offline';
    text.textContent = 'Offline';
  }
}

// ─── PDF Ingestion ───────────────────────────────────────────────────────────

async function handleIndexPDF() {
  const btn = $('index-pdf-btn');
  const spinner = $('index-spinner');
  const badge = $('pdf-status');

  btn.disabled = true;
  spinner.classList.remove('hidden');
  badge.textContent = 'Indexing...';
  badge.className = 'status-badge';

  try {
    await embedPDF();
    badge.textContent = 'Indexed';
    badge.className = 'status-badge indexed';
    alert('✅ Syllabus PDF embedded successfully! ChromaDB initialized.');
  } catch (err) {
    badge.textContent = 'Failed';
    badge.className = 'status-badge';
    alert(`❌ Indexing failed.\n\nMake sure the backend is running at https://research-teaching-service-api-952306581103.asia-south1.run.app\n\n${err.message}`);
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
}

// ─── Query Submission ────────────────────────────────────────────────────────

async function sendQuery() {
  const ta = $('user-input');
  const query = ta.value.trim();
  if (!query || state.isProcessing) return;

  state.isProcessing = true;
  const sendBtn = $('send-btn');
  sendBtn.disabled = ta.disabled = true;

  // Push user message
  state.chatHistories[state.currentMode].push({
    role: 'user', content: query,
    timestamp: new Date().toLocaleTimeString(),
  });
  renderMessages();

  // Loading bubble
  const container = $('chat-messages-container');
  const loadingDiv = el('div', 'message ai loading', `
    <div class="message-avatar">⚙️</div>
    <div class="message-bubble"><div class="dot-flashing"></div></div>
  `);
  loadingDiv.id = 'loading-msg';
  container.appendChild(loadingDiv);
  container.scrollTop = container.scrollHeight;

  // Reset & open trace panel
  state.traceHistories[state.currentMode] = [];
  const panel = $('thought-tracer-panel');
  panel.classList.remove('hidden', 'collapsed');
  $('tracer-arrow').textContent = '▼';
  $('tracer-content').innerHTML = '<p class="tracer-placeholder">Initialising agent graph...</p>';

  addTraceStep('⚙️', 'Graph Workflow Initialised', `Query: "${query}"`);
  addTraceStep('🌐', 'Sending request to backend', `GET ${MODE_FETCH[state.currentMode].name}`);
  renderTrace();

  try {
    const fetchFn = MODE_FETCH[state.currentMode];
    const data = await fetchFn(query);

    $('loading-msg')?.remove();

    const workflow = data['Workflow Response'];
    if (workflow && Array.isArray(workflow.messages)) {
      parseLangGraphResponse(workflow);
    } else {
      const fallback = typeof workflow === 'string' ? workflow : JSON.stringify(data, null, 2);
      state.chatHistories[state.currentMode].push({
        role: 'ai', content: fallback,
        timestamp: new Date().toLocaleTimeString(),
      });
      addTraceStep('⚠️', 'Unexpected response shape', 'Could not find messages array in Workflow Response.');
    }
  } catch (err) {
    $('loading-msg')?.remove();
    state.chatHistories[state.currentMode].push({
      role: 'ai',
      content: `❌ **Error connecting to backend**\n\nCould not reach \`https://research-teaching-service-api-952306581103.asia-south1.run.app \`. Make sure FastAPI is running.\n\n*Details:* ${err.message}`,
      timestamp: new Date().toLocaleTimeString(),
    });
    addTraceStep('❌', 'Request failed', err.stack || err.message);
  } finally {
    state.isProcessing = false;
    sendBtn.disabled = ta.disabled = false;
    ta.value = '';
    ta.style.height = 'auto';
    $('char-counter').textContent = '0 characters';
    renderMessages();
    renderTrace();
  }
}

// ─── LangGraph Response Parser ───────────────────────────────────────────────

function parseLangGraphResponse(workflow) {
  const { messages, llm_calls } = workflow;
  addTraceStep('✅', 'Graph execution complete', `Total LLM calls: ${llm_calls ?? 'N/A'}`);

  let finalContent = '';

  messages.forEach((msg) => {
    const type = msg.type || (Array.isArray(msg.lc_id) ? msg.lc_id[2] : '');
    const content = msg.content || '';
    const toolCalls = msg.tool_calls || [];

    if (type === 'ai' || type === 'AIMessage') {
      if (toolCalls.length) {
        toolCalls.forEach((tc) => {
          addTraceStep('🤖', `Agent requested tool: "${tc.name}"`,
            typeof tc.args === 'object' ? JSON.stringify(tc.args, null, 2) : String(tc.args));
        });
      }
      if (content) finalContent = content;
    } else if (type === 'tool' || type === 'ToolMessage') {
      const name = msg.name || `tool (id=${msg.tool_call_id})`;
      addTraceStep('📥', `Tool "${name}" responded`, content);
    }
  });

  if (!finalContent) {
    const last = messages[messages.length - 1];
    finalContent = last?.content || 'No response generated.';
  }

  state.chatHistories[state.currentMode].push({
    role: 'ai', content: finalContent,
    timestamp: new Date().toLocaleTimeString(),
  });
}

// ─── Event Wiring ────────────────────────────────────────────────────────────

function init() {
  // Mode buttons
  document.querySelectorAll('.mode-item').forEach((item) => {
    item.addEventListener('click', () => switchMode(item.dataset.mode));
  });

  // Send button + Enter key
  $('send-btn').addEventListener('click', sendQuery);
  $('user-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery(); }
  });

  // Auto-grow textarea + char counter
  $('user-input').addEventListener('input', () => {
    const ta = $('user-input');
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    $('char-counter').textContent = `${ta.value.length} characters`;
  });

  // PDF indexer
  $('index-pdf-btn').addEventListener('click', handleIndexPDF);

  // Connection refresh
  $('refresh-btn').addEventListener('click', checkBackendHealth);

  // Tracer collapse toggle
  $('tracer-toggle').addEventListener('click', () => {
    const panel = $('thought-tracer-panel');
    panel.classList.toggle('collapsed');
    $('tracer-arrow').textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
  });

  // Initial render
  checkBackendHealth();
  switchMode('ra');
}

// Kick off once DOM is ready
document.addEventListener('DOMContentLoaded', init);
