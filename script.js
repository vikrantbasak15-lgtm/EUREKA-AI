/* ═══════════════════════════════════════════
   EUREKA AI — script.js
   BYOK · Streaming · Built with 💜
═══════════════════════════════════════════ */

/* ── CONFIG ── */
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const KKEY   = "eureka_api_key";   // stored per-browser, never in code
const KMODEL = "eureka_model";
const VK     = "eureka_voice";
const MAXM   = 16;

const MODEL_REGISTRY = [
  { id:"deepseek/deepseek-chat-v3-0324:free", name:"DeepSeek V3",  desc:"Free · sharp reasoning",  badge:"FREE" },
  { id:"meta-llama/llama-3.3-70b-instruct",   name:"Llama 3.3 70B", desc:"Meta's open flagship",   badge:"FREE" },
  { id:"openai/gpt-4o-mini",                  name:"GPT-4o mini",   desc:"Fast · reliable OpenAI", badge:"PRO"  },
  { id:"anthropic/claude-3.5-haiku",          name:"Claude 3.5 Haiku", desc:"Fast · great writing", badge:"PRO"  },
  { id:"google/gemini-2.0-flash-001",         name:"Gemini 2.0 Flash", desc:"Google · very fast",  badge:"FREE" }
];
const FALLBACKS = ["deepseek/deepseek-chat-v3-0324:free","meta-llama/llama-3.3-70b-instruct","openai/gpt-4o-mini"];
const modelPretty = id => (MODEL_REGISTRY.find(m => m.id === id) || {}).name || id;

/* ── SYSTEM PROMPT ── */
const SYS = `You are EUREKA AI, a brilliant, insightful, and honest AI assistant.
You help users discover clarity through sharp reasoning, creative thinking, and precise communication.
Respond clearly and use markdown formatting when appropriate — code blocks, bullet lists, bold text, headers.
You remember important facts the user shares (name, projects, preferences, interests).
Be concise when brevity is appropriate, and thorough when depth is needed.
Never break character. You are EUREKA AI — curious, intelligent, and genuinely helpful.
Your tagline is "Think Differently."`;
const CODE_SYS = `You are EUREKA AI in CODE MODE — an elite, precise coding assistant. Rules:
1. ALWAYS wrap code in fenced code blocks with the correct language tag (e.g. \`\`\`python, \`\`\`javascript, \`\`\`html etc.)
2. Be concise and technical. Skip pleasantries. Get straight to the code.
3. After every code block, add a brief "What this does:" explanation in 1-2 sentences.
4. If you spot a bug or a better approach, point it out directly.
5. If the question is ambiguous, state your assumption then write the code.
6. Never say "certainly" or "of course". Just write the code.
7. Use modern best practices and clean, readable code always.`;

/* ── CONVERSATION STARTERS ── */
const STARTERS = [
  { i:"🎓", t:"Explain photosynthesis like I'm 12" },
  { i:"🧠", t:"Teach me the basics of machine learning" },
  { i:"📝", t:"Summarize the French Revolution in 5 key points" },
  { i:"💻", t:"Help me debug my code" },
];

/* ── DOM REFS ── */
const $  = id => document.getElementById(id);
const intro = $("intro"), app = $("app"), cc = $("chat-container");
const ui = $("user-input"), sb = $("send-btn"), mic = $("mic-btn"), miclbl = $("miclbl");
const ab = $("attach-btn"), npb = $("new-project-btn"), pl = $("projects-list");
const ct = $("chat-title"), fi = $("file-input"), fb = $("fbadge");
const jwf = $("jw-font"), jws = $("jw-size"), jwe = $("jw-editor");
const modal = $("modal"), mb = $("modal-body"), mc = $("modal-close");
const vt = $("voice-toggle"), homeScreen = $("home-screen");
const signupOverlay = $("signup-overlay"), loginOverlay = $("login-overlay");
const sbAvatar = $("sb-avatar"), sbName = $("sb-name"), sbEmail = $("sb-email");
const logoutBtn = $("logout-btn");
const onbOverlay = $("onb-overlay"), onbMsg = $("onb-msg");
const toastEl = $("toast"), scrollBtn = $("scroll-btn");
const convSearch = $("conv-search");

/* ── STATE ── */
let af = null;
let ve = localStorage.getItem(VK) !== "off";
let busy = false, generating = false, activeCtrl = null;
let CU = "";
let debateMode = false, debateTopic = "", debateMem = [];
let codeMode = false, sidebarHidden = false;
let toastTimer = null;

/* ═══════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════ */
const uid  = () => "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc  = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const relt = ts => {
  const d = new Date(ts), n = new Date();
  return d.toDateString() === n.toDateString()
    ? d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })
    : d.toLocaleDateString([], { month:"short", day:"numeric" });
};
function grow(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 150) + "px"; }
const scroll = (smooth) => { if (smooth) cc.scrollTo({ top: cc.scrollHeight, behavior:"smooth" }); else cc.scrollTop = cc.scrollHeight; };

function showToast(msg, ms = 2200) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

/* Sanitized markdown → HTML (XSS-safe) */
function sanitize(md) {
  if (typeof marked === "undefined") return esc(md).replace(/\n/g, "<br>");
  let html;
  try { html = marked.parse(String(md || "")); }
  catch(e) { return esc(md).replace(/\n/g, "<br>"); }
  if (typeof DOMPurify !== "undefined") {
    try { html = DOMPurify.sanitize(html, { USE_PROFILES:{ html:true } }); } catch(e) {}
  }
  return html;
}

/* SHA-256 hex digest */
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ═══════════════════════════════════════════
   API LAYER (OpenRouter, BYOK)
═══════════════════════════════════════════ */
const getKey   = () => localStorage.getItem(KKEY) || "";
const getModel = () => localStorage.getItem(KMODEL) || "";
const hasSetup = () => !!(getKey() && getModel());

function orHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + getKey(),
    "HTTP-Referer": location.origin || location.href,
    "X-Title": "EUREKA AI"
  };
}

async function orValidateKey(key) {
  try {
    const res = await fetch(OR_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":"Bearer " + key.trim(), "HTTP-Referer": location.origin || location.href, "X-Title":"EUREKA AI" },
      body: JSON.stringify({ model: MODEL_REGISTRY[0].id, max_tokens: 1, messages: [{ role:"user", content:"ping" }] })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.error) return { ok:true };
    return { ok:false, msg: (data.error && data.error.message) || ("HTTP " + res.status) };
  } catch(e) {
    return { ok:false, msg:"Network error — check your connection." };
  }
}

/* Single-shot call with automatic fallback models */
async function chatOnce(body, extraHeaders = {}) {
  const modelToTry = body.model || getModel();
  const tryModel = async (m) => {
    const res = await fetch(OR_URL, { method:"POST", headers: Object.assign(orHeaders(), extraHeaders), body: JSON.stringify(Object.assign({}, body, { model:m })) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };
  let attempt = await tryModel(modelToTry);
  if (attempt.res.ok && !attempt.data.error) return attempt.data;
  for (const fb of FALLBACKS) {
    if (fb === modelToTry) continue;
    const fall = await tryModel(fb);
    if (fall.res.ok && !fall.data.error) { showToast("Switched to " + modelPretty(fb) + " (fallback)"); return fall.data; }
  }
  return attempt.data;
}

/* Streaming call (SSE). onDelta receives the full text so far. */
async function chatStream(body, onDelta, signal) {
  const res = await fetch(OR_URL, {
    method: "POST", headers: orHeaders(), signal,
    body: JSON.stringify(Object.assign({}, body, { stream:true }))
  });
  if (!res.ok || !res.body) {
    let msg = "HTTP " + res.status;
    try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch(e) {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream:true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) { out += delta; onDelta(out); }
      } catch(e) {}
    }
  }
  return out;
}

/* ═══════════════════════════════════════════
   ONBOARDING — key → model → go
═══════════════════════════════════════════ */
function onbStep(n) {
  ["onb-step-key","onb-step-model","onb-step-done"].forEach((id, i) => {
    const el = $(id); if (el) el.classList.toggle("hidden", i !== n - 1);
  });
  const dots = document.querySelectorAll(".onb-dot");
  dots.forEach((d, i) => d.classList.toggle("active", i < n));
}
function openOnboarding() {
  onbOverlay.classList.remove("hidden");
  onbStep(1);
  onbMsg.textContent = ""; onbMsg.className = "auth-msg";
  setTimeout(() => $("onb-key").focus(), 60);
}
function completeOnboarding() {
  onbOverlay.classList.add("hidden");
  updateModelBadge();
  showToast("You're all set · " + modelPretty(getModel()));
}
$("onb-key-btn").onclick = async () => {
  const key = $("onb-key").value.trim();
  onbMsg.className = "auth-msg"; onbMsg.textContent = "";
  if (!/^sk-or-/.test(key)) { onbMsg.className = "auth-msg err"; onbMsg.textContent = "That doesn't look like an OpenRouter key (should start with sk-or-)."; return; }
  const btn = $("onb-key-btn");
  btn.disabled = true; btn.textContent = "Verifying…";
  const r = await orValidateKey(key);
  btn.disabled = false; btn.textContent = "Verify & continue";
  if (!r.ok) { onbMsg.className = "auth-msg err"; onbMsg.textContent = "Key rejected: " + r.msg; return; }
  localStorage.setItem(KKEY, key);
  onbMsg.className = "auth-msg ok"; onbMsg.textContent = "Key verified ✓";
  setTimeout(() => { onbStep(2); renderOnbModels(); }, 350);
};
function renderOnbModels() {
  const wrap = $("onb-models");
  const cur = getModel();
  wrap.innerHTML = MODEL_REGISTRY.map(m => `
    <div class="mcard${m.id === cur ? " selected" : ""}" data-id="${esc(m.id)}">
      <div class="mcard-top"><span class="mcard-name">${esc(m.name)}</span><span class="mcard-badge${m.badge === "FREE" ? " free" : ""}">${m.badge}</span></div>
      <div class="mcard-desc">${esc(m.desc)}</div>
    </div>`).join("");
  wrap.querySelectorAll(".mcard").forEach(c => {
    c.onclick = () => {
      wrap.querySelectorAll(".mcard").forEach(x => x.classList.remove("selected"));
      c.classList.add("selected");
      localStorage.setItem(KMODEL, c.dataset.id);
      $("onb-custom-model").value = "";
    };
  });
}
$("onb-custom-model").addEventListener("input", e => {
  const v = e.target.value.trim();
  if (v) { document.querySelectorAll("#onb-models .mcard").forEach(x => x.classList.remove("selected")); localStorage.removeItem(KMODEL); }
});
$("onb-model-btn").onclick = () => {
  const custom = $("onb-custom-model").value.trim();
  if (custom) localStorage.setItem(KMODEL, custom);
  if (!getModel()) { showToast("Pick a model to continue"); return; }
  onbStep(3);
  setTimeout(completeOnboarding, 900);
};
$("onb-get-key").onclick = () => window.open("https://openrouter.ai/keys", "_blank", "noopener");
$("onb-key").addEventListener("keydown", e => { if (e.key === "Enter") $("onb-key-btn").click(); });
$("onb-custom-model").addEventListener("keydown", e => { if (e.key === "Enter") $("onb-model-btn").click(); });
onbOverlay.onclick = e => { if (e.target === onbOverlay && hasSetup()) onbOverlay.classList.add("hidden"); };

/* ═══════════════════════════════════════════
   SETTINGS MODAL
═══════════════════════════════════════════ */
function openSettings() {
  $("set-key-now").textContent = getKey() ? getKey().slice(0, 12) + "••••••••" : "No key set";
  $("set-key").value = "";
  $("set-model-custom").value = "";
  const sel = $("set-model");
  sel.innerHTML = MODEL_REGISTRY.map(m => `<option value="${esc(m.id)}"${m.id === getModel() ? " selected" : ""}>${esc(m.name)} — ${esc(m.desc)}</option>`).join("")
    + (getModel() && !MODEL_REGISTRY.some(m => m.id === getModel()) ? `<option value="${esc(getModel())}" selected>${esc(getModel())} (custom)</option>` : "");
  sel.value = getModel();
  $("set-voice").checked = ve;
  $("settings-modal").classList.remove("hidden");
}
$("settings-btn").onclick = openSettings;
$("settings-close").onclick = () => $("settings-modal").classList.add("hidden");
$("settings-modal").onclick = e => { if (e.target === $("settings-modal")) $("settings-modal").classList.add("hidden"); };
$("set-model").addEventListener("change", () => { $("set-model-custom").value = ""; });
$("set-save").onclick = () => {
  const newKey = $("set-key").value.trim();
  const custom = $("set-model-custom").value.trim();
  if (newKey) {
    if (!/^sk-or-/.test(newKey)) { showToast("Invalid key format (sk-or-…)"); return; }
    localStorage.setItem(KKEY, newKey);
  }
  if (custom) localStorage.setItem(KMODEL, custom);
  else localStorage.setItem(KMODEL, $("set-model").value);
  ve = $("set-voice").checked;
  localStorage.setItem(VK, ve ? "on" : "off");
  syncVoice(); updateModelBadge();
  $("settings-modal").classList.add("hidden");
  showToast("Settings saved ✓");
};

/* ═══════════════════════════════════════════
   PER-USER STORAGE
═══════════════════════════════════════════ */
const uk      = key => `eureka_u_${CU}_${key}`;
const getP    = ()   => JSON.parse(localStorage.getItem(uk("proj")) || "[]");
const saveP   = p    => localStorage.setItem(uk("proj"), JSON.stringify(p));
const getCur  = ()   => localStorage.getItem(uk("cur"));
const setCur  = id   => localStorage.setItem(uk("cur"), id);
const getMem  = ()   => JSON.parse(localStorage.getItem(uk("mem")) || "[]");
const saveMem = m    => localStorage.setItem(uk("mem"), JSON.stringify(m));

function pushMem(role, content) {
  let m = getMem();
  m.push({ role, content });
  if (m.length > MAXM) m = m.slice(-MAXM);
  saveMem(m);
}

function loadNotes() {
  try {
    const d = JSON.parse(localStorage.getItem(uk("notes")) || "{}");
    if (d.html) jwe.innerHTML = d.html;
    if (d.font) jwf.value = d.font;
    if (d.size) jws.value = d.size;
    applyNote();
  } catch(e) {}
}
function saveNotes() {
  localStorage.setItem(uk("notes"), JSON.stringify({ html: jwe.innerHTML, font: jwf.value, size: jws.value }));
}

/* ═══════════════════════════════════════════
   PROJECTS / CONVERSATIONS (+ search)
═══════════════════════════════════════════ */
function textOf(html) {
  const t = document.createElement("div");
  t.innerHTML = html || "";
  return (t.innerText || t.textContent || "").toLowerCase();
}
function renderProjs() {
  const q = (convSearch && convSearch.value || "").trim().toLowerCase();
  const all = getP(), cur = getCur();
  const list = q ? all.filter(p => p.title.toLowerCase().includes(q) || textOf(p.content).includes(q)) : all;
  pl.innerHTML = "";
  if (!all.length) { pl.innerHTML = `<div class="eml">No conversations yet</div>`; return; }
  if (!list.length) { pl.innerHTML = `<div class="eml">No matches for "${esc(q)}"</div>`; return; }
  list.forEach(pr => {
    const d = document.createElement("div");
    d.className = "ci" + (pr.id === cur ? " active" : "");
    d.innerHTML = `<div class="cdot"></div><div class="cmeta"><div class="cname">${esc(pr.title)}</div><div class="ctime">${relt(pr.created)}</div></div><div class="cbtns"><button class="cbtn rb" title="Rename">✎</button><button class="cbtn db" title="Delete">✕</button></div>`;
    d.querySelector(".rb").onclick = e => {
      e.stopPropagation();
      const t = prompt("Rename:", pr.title);
      if (!t?.trim()) return;
      const ps = getP(), i = ps.findIndex(x => x.id === pr.id);
      if (i !== -1) { ps[i].title = t.trim(); saveP(ps); }
      renderProjs();
      if (pr.id === getCur()) ct.textContent = t.trim();
    };
    d.querySelector(".db").onclick = e => {
      e.stopPropagation();
      if (!confirm("Delete this conversation?")) return;
      const ps = getP().filter(x => x.id !== pr.id);
      saveP(ps);
      if (pr.id === getCur()) { if (ps.length) setCur(ps[0].id); else newConv(); }
      renderProjs(); loadChat();
    };
    d.onclick = () => { setCur(pr.id); loadChat(); renderProjs(); };
    pl.appendChild(d);
  });
}
if (convSearch) {
  convSearch.addEventListener("input", renderProjs);
  convSearch.addEventListener("keydown", e => { if (e.key === "Escape") { convSearch.value = ""; renderProjs(); convSearch.blur(); } });
}

function loadChat() {
  const ps = getP(), id = getCur(), pr = ps.find(x => x.id === id);
  cc.innerHTML = pr ? pr.content : "";
  ct.textContent = pr ? pr.title : "EUREKA AI";
  if (!cc.innerHTML.trim()) showEmpty();
  else addCopyButtons();
  scroll();
  updateScrollBtn();
}
function saveChat() {
  const ps = getP(), id = getCur(), i = ps.findIndex(x => x.id === id);
  if (i !== -1) { ps[i].content = cc.innerHTML; saveP(ps); }
}
function newConv(title) {
  const id = uid(), ps = getP(), t = title || "New conversation";
  ps.unshift({ id, title: t, created: Date.now(), content: "" });
  saveP(ps); setCur(id);
  renderProjs(); cc.innerHTML = ""; ct.textContent = t; showEmpty();
}

/* ═══════════════════════════════════════════
   EMPTY STATE
═══════════════════════════════════════════ */
const BAV = () => `<div class="bav"><svg viewBox="0 0 32 32"><path d="M16 4a9 9 0 0 1 5.5 16.1l-.5.4V22a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-1.5l-.5-.4A9 9 0 0 1 16 4zm-3 20h6v1.5A.5.5 0 0 1 18.5 26h-5a.5.5 0 0 1-.5-.5V24zm0-3h6v1h-6v-1zm3-13a5 5 0 1 0 0 10A5 5 0 0 0 16 8zm0 2a3 3 0 0 1 0 6 3 3 0 0 1 0-6z"/></svg></div>`;

function showEmpty() {
  cc.innerHTML = "";
  const el = document.createElement("div");
  el.className = "es"; el.id = "es";
  el.innerHTML = `
    <div class="esico"><svg viewBox="0 0 32 32"><path d="M16 4a9 9 0 0 1 5.5 16.1l-.5.4V22a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-1.5l-.5-.4A9 9 0 0 1 16 4zm-3 20h6v1.5A.5.5 0 0 1 18.5 26h-5a.5.5 0 0 1-.5-.5V24zm0-3h6v1h-6v-1zm3-13a5 5 0 1 0 0 10A5 5 0 0 0 16 8zm0 2a3 3 0 0 1 0 6 3 3 0 0 1 0-6z"/></svg></div>
    <div class="esh">Your Eureka moment awaits</div>
    <div class="esp">Ask EUREKA AI anything — from deep analysis to quick ideas, I'm here to help you think differently.</div>
    <div class="sg">${STARTERS.map(s => `<div class="sc" data-p="${esc(s.t)}"><div class="sci">${s.i}</div><div class="sct">${esc(s.t)}</div></div>`).join("")}</div>
  `;
  cc.appendChild(el);
  el.querySelectorAll(".sc").forEach(c => { c.onclick = () => { ui.value = c.dataset.p; grow(ui); ui.focus(); }; });
}

/* ═══════════════════════════════════════════
   MESSAGES
═══════════════════════════════════════════ */
function addMsg(text, who, md) {
  const es = document.getElementById("es"); if (es) es.remove();
  const row = document.createElement("div");
  row.className = "mr " + who;
  const html = who === "bot" ? sanitize(md ? text : esc(text).replace(/\n/g, "<br>")) : esc(text).replace(/\n/g, "<br>");
  row.innerHTML = who === "bot" ? `${BAV()}<div class="mb">${html}</div>` : `<div class="mb">${html}</div>`;
  fixLinks(row);
  cc.appendChild(row); scroll(); saveChat();
  return row;
}
function fixLinks(scope) {
  (scope || cc).querySelectorAll(".mb a").forEach(a => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
}
function showTyping() {
  if (document.getElementById("ty")) return;
  const r = document.createElement("div");
  r.id = "ty"; r.className = "tr2";
  r.innerHTML = `${BAV()}<div class="tb2"><div class="td"></div><div class="td"></div><div class="td"></div></div>`;
  cc.appendChild(r); scroll();
}
function hideTyping() { const t = document.getElementById("ty"); if (t) t.remove(); }

/* ═══════════════════════════════════════════
   SEND + STREAMING + STOP + REGENERATE
═══════════════════════════════════════════ */
function buildSys() {
  let s = SYS + `\nToday is ${new Date().toLocaleDateString([], { weekday:"long", year:"numeric", month:"long", day:"numeric" })}.`;
  if (codeMode) s = CODE_SYS;
  return s;
}
function updateSendBtn() {
  sb.classList.toggle("stop", generating);
  sb.title = generating ? "Stop generating" : "Send";
  sb.innerHTML = generating
    ? `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="#fff"/></svg>`
    : `<svg viewBox="0 0 24 24"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/></svg>`;
}

function ensureStreamRow() {
  let row = document.getElementById("stream-row");
  if (!row) {
    hideTyping();
    const es = document.getElementById("es"); if (es) es.remove();
    row = document.createElement("div");
    row.id = "stream-row";
    row.className = "mr bot" + (debateMode ? " debate-bot-msg" : "");
    const bubbleCls = debateMode ? "mb debate-mb-bot" : "mb";
    const avatar = debateMode
      ? `<div class="bav debate-bav"><svg viewBox="0 0 24 24" fill="white" style="width:14px;height:14px"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg></div>`
      : BAV();
    row.innerHTML = `${avatar}<div class="${bubbleCls}"></div>`;
    cc.appendChild(row);
  }
  return row;
}
function paintStream(text) {
  const row = ensureStreamRow();
  const bubble = row.querySelector(".mb");
  bubble.innerHTML = sanitize(text) + '<span class="stream-caret"></span>';
  const nearBottom = cc.scrollHeight - cc.scrollTop - cc.clientHeight < 200;
  if (nearBottom) scroll();
}
function finishStreamRow(text) {
  const row = document.getElementById("stream-row");
  if (!row) {                       // model streamed nothing — render the full reply normally
    if (text) addMsg(text, "bot", true);
    return;
  }
  row.removeAttribute("id");
  const bubble = row.querySelector(".mb");
  bubble.innerHTML = sanitize(text);
  fixLinks(row);
  addCopyButtons(row);
}

async function generate(uc) {
  busy = generating = true; updateSendBtn();   // button stays enabled so it can act as Stop
  showTyping();
  const ctrl = new AbortController(); activeCtrl = ctrl;
  let stopped = false, partial = "";
  try {
    const history = debateMode ? debateMem.slice() : getMem();
    const body = { model: getModel(), max_tokens: 2048, messages: [{ role:"system", content: buildSys() }, ...history] };
    if (uc) body.messages.push({ role:"user", content: uc });
    try {
      partial = await chatStream(body, full => { partial = full; paintStream(full); }, ctrl.signal);
    } catch(err) {
      if (err.name === "AbortError") stopped = true;
      else throw err;
    }
    hideTyping();
    const reply = (partial || "").trim();
    if (!reply) throw new Error("empty");
    finishStreamRow(reply);
    if (stopped) {
      const row = cc.querySelector(".mr.bot:last-child .mb");
      if (row) row.insertAdjacentHTML("beforeend", `<div class="stopped-note">⏹ Stopped</div>`);
    }
    if (debateMode) {
      if (uc) debateMem.push({ role:"user", content: uc });
      debateMem.push({ role:"assistant", content: reply });
      if (debateMem.length > 24) debateMem = debateMem.slice(-24);
    } else {
      if (uc) { pushMem("user", uc); }
      pushMem("assistant", reply);
    }
    scroll(); saveChat();
  } catch(err) {
    hideTyping();
    const row = document.getElementById("stream-row");
    if (row && partial.trim()) {
      finishStreamRow(partial.trim());
      const bubble = row.querySelector(".mb");
      if (bubble) bubble.insertAdjacentHTML("beforeend", '<div class="stopped-note">⏹ Stopped</div>');
    } else if (stopped) {
      if (row) row.remove();
      if (uc && debateMode) debateMem.push({ role:"user", content: uc });   // keep bubble/memory in sync
    } else {
      if (row) row.remove();
      addMsg("⚠️ " + (err.message === "empty" ? "The model returned an empty response. Try again or switch models in Settings." : ("Connection problem: " + err.message)), "bot", false);
    }
  }
  activeCtrl = null;
  busy = generating = false; updateSendBtn();
}

function stopGenerate() { if (activeCtrl) activeCtrl.abort(); }

async function send() {
  if (generating) { stopGenerate(); return; }
  if (busy) return;
  const txt = ui.value.trim();
  if (!txt && !af) return;

  let uc = txt, dt = txt || "(File only)";
  if (af) {
    uc = `I've attached: "${af.name}" (${af.size} bytes).\n\nContent:\n\`\`\`\n${af.content.slice(0, 8000)}\n\`\`\`\n\n${txt ? "My question: " + txt : "Please analyze this file."}`;
    dt = txt ? `📎 ${af.name}\n\n${txt}` : `📎 ${af.name}`;
    af = null; fi.value = ""; fb.textContent = ""; fb.classList.remove("show");
  }

  /* Auto-title from first message */
  const ps = getP(), id = getCur(), pi = ps.findIndex(x => x.id === id);
  if (pi !== -1 && ps[pi].title === "New conversation" && txt.length > 3) {
    const t2 = txt.slice(0, 42) + (txt.length > 42 ? "…" : "");
    ps[pi].title = t2; saveP(ps); ct.textContent = t2; renderProjs();
  }

  addMsg(dt, "user");
  ui.value = ""; ui.style.height = "auto";

  /* Image generation shortcut */
  if (!af && isImageRequest(txt)) {
    const imgPrompt = extractImgPrompt(txt);
    await generateImage(imgPrompt);
    return;
  }

  await generate(uc);
}

function regenerate() {
  if (busy || generating) return;
  if (debateMode) { showToast("Regenerate is off during a debate"); return; }
  const m = getMem();
  if (!m.length || m[m.length-1].role !== "assistant") { showToast("Nothing to regenerate yet"); return; }
  m.pop(); saveMem(m);
  const rows = cc.querySelectorAll(".mr.bot");
  if (rows.length) rows[rows.length-1].remove();
  generate(null);
}
$("regen-btn").onclick = regenerate;
updateSendBtn();

/* ═══════════════════════════════════════════
   IMAGE GENERATION
═══════════════════════════════════════════ */
const IMG_RE = /^(?:please\s+)?(?:generate|create|draw|make|paint|render|show me|give me|produce)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting)\s+(?:of\s+|showing\s+|depicting\s+)?(.+)/i;
function isImageRequest(txt) { return IMG_RE.test(txt.trim()); }
function extractImgPrompt(txt) {
  const m = txt.trim().match(IMG_RE);
  return m ? m[1].trim() : txt.trim();
}
async function generateImage(prompt) {
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  const src = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&seed=${seed}&nologo=true`;
  hideTyping();
  const es = document.getElementById("es"); if (es) es.remove();
  const row = document.createElement("div");
  row.className = "mr bot";
  const placeholder = `<div style="width:260px;height:260px;border-radius:12px;background:var(--bbg);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;border:1px solid var(--border)">Generating image…</div>`;
  row.innerHTML = `${BAV()}<div class="mb"><div id="imgblock">${placeholder}<div style="font-size:11px;color:var(--muted);margin-top:6px;">🎨 "${esc(prompt)}"</div></div></div>`;
  cc.appendChild(row); scroll();
  const img = new Image();
  img.onload = () => {
    const block = document.getElementById("imgblock");
    if (block) {
      block.innerHTML = `<img src="${src}" alt="${esc(prompt)}" style="max-width:100%;border-radius:12px;display:block;" /><div style="font-size:11px;color:var(--muted);margin-top:6px;">🎨 "${esc(prompt)}"</div>`;
    }
    saveChat(); scroll();
  };
  img.onerror = () => {
    const block = document.getElementById("imgblock");
    if (block) block.innerHTML = `<div style="color:var(--muted);font-size:13px;">❌ Image generation failed. Try a different prompt.</div>`;
  };
  img.src = src;
}

/* ═══════════════════════════════════════════
   VOICE
═══════════════════════════════════════════ */
function speak(text) {
  if (!ve) return;
  try {
    speechSynthesis.cancel();
    const plain = text.replace(/```[\s\S]*?```/g, " code block omitted. ").replace(/[#*`_~>|]/g, "").slice(0, 700);
    const u = new SpeechSynthesisUtterance(plain);
    const vs = speechSynthesis.getVoices();
    const v = vs.find(x => /female/i.test(x.name)) || vs[0];
    if (v) u.voice = v;
    u.pitch = 0.9; u.rate = 0.95;
    speechSynthesis.speak(u);
  } catch(e) {}
}
function syncVoice() {
  vt.classList.toggle("on", ve);
  vt.title = ve ? "Voice on (click to mute)" : "Voice off (click to enable)";
}
vt.onclick = () => { ve = !ve; localStorage.setItem(VK, ve ? "on" : "off"); if (!ve) speechSynthesis.cancel(); syncVoice(); };

/* ═══════════════════════════════════════════
   FILE ATTACHMENT
═══════════════════════════════════════════ */
fi.addEventListener("change", () => {
  const f = fi.files[0];
  if (!f) { af = null; fb.textContent = ""; fb.classList.remove("show"); return; }
  const r = new FileReader();
  r.onload = e => { af = { name: f.name, content: e.target.result, size: f.size }; fb.textContent = `📎 ${f.name}`; fb.classList.add("show"); };
  r.readAsText(f);
});
ab.onclick = () => fi.click();

/* ═══════════════════════════════════════════
   NOTES (SCRATCH PAD)
═══════════════════════════════════════════ */
function applyNote() { jwe.style.fontFamily = jwf.value; jwe.style.fontSize = jws.value; }
jwf.onchange = () => { applyNote(); saveNotes(); };
jws.onchange = () => { applyNote(); saveNotes(); };
jwe.oninput  = saveNotes;

/* ═══════════════════════════════════════════
   INPUT EVENTS + SHORTCUTS
═══════════════════════════════════════════ */
ui.addEventListener("input",   () => grow(ui));
ui.addEventListener("keydown", e  => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
sb.onclick  = send;
npb.onclick = () => newConv();
mc.onclick  = () => modal.classList.add("hidden");
modal.onclick = e => { if (e.target === modal) modal.classList.add("hidden"); };

document.addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
  const appOpen = homeScreen.classList.contains("hidden");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && appOpen) { e.preventDefault(); if (convSearch) convSearch.focus(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newConv(); }
  if (e.key === "Escape") {
    [modal, signupOverlay, loginOverlay, $("roast-modal"), $("da-modal"), $("da-result-modal"), $("debate-modal"), $("genz-modal"), $("settings-modal"), $("export-menu"), $("fc-modal"), $("quiz-modal"), $("plan-modal")].forEach(el => { if (el) el.classList.add("hidden"); });
    if (onbOverlay && hasSetup()) onbOverlay.classList.add("hidden");
  }
});

/* ═══════════════════════════════════════════
   SCROLL-TO-BOTTOM
═══════════════════════════════════════════ */
function updateScrollBtn() {
  const far = cc.scrollHeight - cc.scrollTop - cc.clientHeight > 160;
  scrollBtn.classList.toggle("show", far && cc.querySelector(".mr"));
}
cc.addEventListener("scroll", updateScrollBtn);
scrollBtn.onclick = () => scroll(true);

/* ═══════════════════════════════════════════
   EXPORT CHAT
═══════════════════════════════════════════ */
function buildExportText() {
  const title = ct.textContent || "EUREKA AI conversation";
  const lines = [`# ${title}`, ``, `_Exported from EUREKA AI · ${new Date().toLocaleString()}_`, ``];
  cc.querySelectorAll(".mr").forEach(row => {
    const el = row.querySelector(".mb");
    if (!el) return;
    const t = (el.innerText || el.textContent || "").trim();
    if (!t) return;
    lines.push(row.classList.contains("user") ? `**🧑 You:**` : `**🤖 EUREKA AI:**`);
    lines.push(t, ``);
  });
  return lines.join("\n");
}
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("export-btn").onclick = e => {
  e.stopPropagation();
  const menu = $("export-menu");
  const r = $("export-btn").getBoundingClientRect();
  menu.style.top = (r.bottom + 6) + "px";
  menu.style.left = Math.max(8, r.right - 150) + "px";
  menu.classList.toggle("hidden");
};
document.addEventListener("click", e => {
  const menu = $("export-menu");
  if (menu && !menu.classList.contains("hidden") && !menu.contains(e.target)) menu.classList.add("hidden");
});
$("export-md").onclick = () => {
  $("export-menu").classList.add("hidden");
  download((ct.textContent || "eureka-chat").replace(/[^\w\- ]+/g, "").slice(0, 40) + ".md", buildExportText(), "text/markdown");
  showToast("Exported as Markdown ✓");
};
$("export-txt").onclick = () => {
  $("export-menu").classList.add("hidden");
  download((ct.textContent || "eureka-chat").replace(/[^\w\- ]+/g, "").slice(0, 40) + ".txt", buildExportText(), "text/plain");
  showToast("Exported as text ✓");
};

/* ═══════════════════════════════════════════
   MIC / VOICE INPUT
═══════════════════════════════════════════ */
mic.onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast("Voice input not supported in this browser. Try Chrome."); return; }
  const rec = new SR();
  rec.lang = "en-US"; rec.continuous = false; rec.interimResults = false;
  miclbl.textContent = "Listening…";
  mic.querySelector("svg").style.stroke = "var(--acc)";
  mic.style.animation = "micPulse 1s infinite";
  rec.onresult = e => { ui.value = e.results[0][0].transcript; grow(ui); };
  rec.onerror  = () => {};
  rec.onend    = () => { miclbl.textContent = "Voice input"; mic.querySelector("svg").style.stroke = ""; mic.style.animation = ""; };
  rec.start();
};

/* ═══════════════════════════════════════════
   ROAST MODE
═══════════════════════════════════════════ */
function buildRoastContext() {
  const ps = getP();
  const lines = [];
  ps.forEach(pr => {
    if (!pr.content) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = pr.content;
    tmp.querySelectorAll(".mr.user .mb").forEach(el => {
      const t = (el.innerText || el.textContent || "").trim();
      if (t && t.length > 1) lines.push(t);
    });
  });
  return lines;
}
function roastShow(loading, text, again) {
  $("roast-loading").style.display = loading ? "flex" : "none";
  $("roast-text").style.display    = text   ? "block" : "none";
  $("roast-again").style.display   = again  ? "block" : "none";
}
function roastSetText(html) { $("roast-text").innerHTML = html; }

async function runRoast() {
  $("roast-modal").classList.remove("hidden");
  roastShow(true, false, false);
  roastSetText("");
  const msgs = buildRoastContext();
  if (!msgs.length) {
    roastShow(false, true, true);
    roastSetText("<p>You haven't said anything yet.</p><p>EUREKA can't roast someone who doesn't exist. Go have a real conversation first. 💀</p>");
    return;
  }
  const sample = msgs.slice(-25).join("\n- ");
  const roastSys = `You are EUREKA AI in Roast Mode. You are given the user's actual chat messages. Deliver a SAVAGE, PERSONAL, HILARIOUS roast based specifically on what they said. Be brutally specific — call out their topics, their lazy questions, their patterns. Use Gen Z humor. End with one devastating italic one-liner. Under 160 words. 3 short paragraphs. No headers. Make it hurt (but funny).`;
  try {
    const data = await chatOnce({ model: getModel(), max_tokens: 300, messages: [ { role:"system", content: roastSys }, { role:"user", content: "My messages to you:\n- " + sample + "\n\nNow roast me. Personal. Savage. Funny." } ] }, { "X-Title": "EUREKA Roast Mode" });
    if (data?.error) {
      roastShow(false, true, true);
      roastSetText("<p>API error. EUREKA is technically unable to roast you right now.</p><p style='font-size:11px;opacity:.5'>" + esc(String(data.error?.message || JSON.stringify(data.error)).slice(0,120)) + "</p>");
      return;
    }
    const roast = data?.choices?.[0]?.message?.content;
    if (!roast) {
      roastShow(false, true, true);
      roastSetText("<p>EUREKA got tongue-tied. The roast was too devastating to render. Try again.</p>");
      return;
    }
    const paras = roast.split(/\n+/).filter(l => l.trim()).map((p, i, arr) =>
      i === arr.length - 1
        ? `<p style="color:#fb923c;font-style:italic;font-weight:700">${esc(p)}</p>`
        : `<p>${esc(p)}</p>`
    ).join("");
    roastShow(false, true, true);
    roastSetText(paras);
  } catch(e) {
    roastShow(false, true, true);
    roastSetText("<p>Network error. Check your internet connection and try again.</p>");
  }
}
$("roast-btn").onclick  = runRoast;
$("roast-close").onclick = () => $("roast-modal").classList.add("hidden");
$("roast-again").onclick = runRoast;
$("roast-modal").onclick  = e => { if (e.target.id === "roast-modal") $("roast-modal").classList.add("hidden"); };

/* ═══════════════════════════════════════════
   DEBATE MODE
═══════════════════════════════════════════ */
function addDebateMsg(text, who) {
  const es = document.getElementById("es"); if (es) es.remove();
  const row = document.createElement("div");
  row.className = "mr " + who + (who === "bot" ? " debate-bot-msg" : " debate-user-msg");
  const html = who === "bot" ? sanitize(text) : esc(text).replace(/\n/g, "<br>");
  const avatar = who === "bot"
    ? `<div class="bav debate-bav"><svg viewBox="0 0 24 24" fill="white" style="width:14px;height:14px"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg></div>`
    : "";
  row.innerHTML = who === "bot"
    ? `${avatar}<div class="mb debate-mb-bot">${html}</div>`
    : `<div class="mb debate-mb-user">${html}</div>`;
  fixLinks(row);
  cc.appendChild(row); scroll(); saveChat();
}
function showDebateBanner(topic) {
  const existing = document.getElementById("debate-banner");
  if (existing) existing.remove();
  const banner = document.createElement("div");
  banner.id = "debate-banner";
  banner.className = "debate-banner";
  banner.innerHTML = `
    <div class="debate-banner-left">
      <span class="debate-banner-icon">⚔️</span>
      <div>
        <div class="debate-banner-label">DEBATE MODE ACTIVE</div>
        <div class="debate-banner-topic">Your stance: <strong>${esc(topic)}</strong></div>
      </div>
    </div>
    <button class="debate-end-btn" id="debate-end-btn">End Debate</button>
  `;
  cc.parentElement.insertBefore(banner, cc);
  $("debate-end-btn").onclick = endDebate;
}
async function startDebate(topic) {
  debateMode  = true;
  debateTopic = topic;
  debateMem   = [];
  $("debate-btn-label").textContent = "End debate ⚔️";
  $("debate-btn").classList.add("debate-active");
  newConv("⚔️ Debate: " + topic.slice(0, 35));
  showDebateBanner(topic);
  const openingSys = `You are EUREKA AI in DEBATE MODE. The user believes: "${topic}". Open the debate by immediately and confidently stating the OPPOSITE position in 2-3 punchy sentences. Be bold. End with a challenge question to the user. Under 80 words.`;
  busy = true; sb.disabled = true; updateSendBtn(); showTyping();
  try {
    const data = await chatOnce({ model: getModel(), max_tokens: 200, messages: [{ role:"system", content: openingSys }, { role:"user", content:"Start the debate." }] }, { "X-Title":"EUREKA Debate" });
    const opening = data?.choices?.[0]?.message?.content || "I disagree. Completely. Want to fight about it?";
    hideTyping(); addDebateMsg(opening, "bot");
    debateMem.push({ role:"assistant", content: opening });
  } catch(e) {
    hideTyping();
    addDebateMsg("I disagree with everything you just said. Come on then — defend your position.", "bot");
  }
  busy = false; sb.disabled = false; updateSendBtn();
}
function endDebate() {
  debateMode  = false;
  debateTopic = "";
  debateMem   = [];
  $("debate-btn-label").textContent = "Debate me ⚔️";
  $("debate-btn").classList.remove("debate-active");
  const banner = document.getElementById("debate-banner");
  if (banner) banner.remove();
  const verdict = document.createElement("div");
  verdict.className = "debate-verdict";
  verdict.innerHTML = `<span>⚔️</span> Debate ended. EUREKA remains unconvinced. As always.`;
  cc.appendChild(verdict); scroll(); saveChat();
}
$("debate-btn").onclick = () => {
  if (debateMode) { endDebate(); return; }
  $("debate-modal").classList.remove("hidden");
  setTimeout(() => $("debate-topic-input").focus(), 80);
};
$("debate-modal-close").onclick = () => $("debate-modal").classList.add("hidden");
$("debate-modal").onclick = e => { if (e.target.id === "debate-modal") $("debate-modal").classList.add("hidden"); };
$("debate-start-btn").onclick = () => {
  const topic = $("debate-topic-input").value.trim();
  if (!topic) { $("debate-topic-input").focus(); return; }
  $("debate-modal").classList.add("hidden");
  $("debate-topic-input").value = "";
  startDebate(topic);
};
$("debate-topic-input").addEventListener("keydown", e => {
  if (e.key === "Enter") $("debate-start-btn").click();
});
document.querySelectorAll(".debate-eg").forEach(btn => {
  btn.onclick = () => { $("debate-topic-input").value = btn.dataset.t; $("debate-topic-input").focus(); };
});

/* ═══════════════════════════════════════════
   CODE MODE
═══════════════════════════════════════════ */
const CODE_SYS_PLACEHOLDER = "Ask a coding question, paste code to debug, or describe what you want to build…";
const NORMAL_PLACEHOLDER   = "Message EUREKA AI…";

function addCopyButtons(scope) {
  (scope || cc).querySelectorAll("pre:not([data-cb])").forEach(pre => {
    pre.setAttribute("data-cb", "1");
    const code = pre.querySelector("code");
    if (!code) return;
    let lang = "";
    code.classList.forEach(cls => { if (cls.startsWith("language-")) lang = cls.replace("language-", ""); });
    const bar = document.createElement("div");
    bar.className = "code-bar";
    bar.innerHTML = `<span class="code-lang">${esc(lang || "code")}</span><button class="copy-btn" title="Copy code">Copy</button>`;
    pre.insertBefore(bar, pre.firstChild);
    bar.querySelector(".copy-btn").onclick = function() {
      const text = code.innerText || code.textContent;
      navigator.clipboard.writeText(text).then(() => {
        this.textContent = "Copied!";
        setTimeout(() => { this.textContent = "Copy"; }, 1500);
      }).catch(() => { this.textContent = "Error"; setTimeout(() => { this.textContent = "Copy"; }, 1500); });
    };
  });
}

function toggleCodeMode() {
  codeMode = !codeMode;
  const btn = $("code-mode-btn"), label = $("code-mode-label"), badge = $("code-mode-badge");
  btn.classList.toggle("active", codeMode);
  badge.classList.toggle("hidden", !codeMode);
  label.textContent = codeMode ? "Code Mode ON" : "Code Mode";
  ui.placeholder    = codeMode ? CODE_SYS_PLACEHOLDER : NORMAL_PLACEHOLDER;
  app.classList.toggle("code-mode-active", codeMode);
  if (codeMode) {
    newConv("💻 Code Session");
    setTimeout(() => {
      const es = document.getElementById("es"); if (es) es.remove();
      const row = document.createElement("div");
      row.className = "mr bot";
      row.innerHTML = `${BAV()}<div class="mb"><div class="code-mode-welcome"><div class="cmw-title">⌨️ Code Mode activated</div><div class="cmw-body">I'll write clean, well-formatted code for every request. Every code block gets a copy button. Just tell me what to build, debug, or explain.</div><div class="cmw-chips"><span>Debug my code</span><span>Write a function</span><span>Explain this snippet</span><span>Best practices</span></div></div></div>`;
      cc.appendChild(row); scroll();
      row.querySelectorAll(".cmw-chips span").forEach(chip => { chip.onclick = () => { ui.value = chip.textContent; grow(ui); ui.focus(); }; });
    }, 100);
  } else {
    ui.placeholder = NORMAL_PLACEHOLDER;
    const ps = getP();
    if (!ps.length) newConv("New conversation");
    else { if (!getCur() || !ps.find(x => x.id === getCur())) setCur(ps[0].id); renderProjs(); loadChat(); }
  }
}
$("code-mode-btn").onclick = toggleCodeMode;

/* ═══════════════════════════════════════════
   DEVIL'S ADVOCATE
═══════════════════════════════════════════ */
const daBtn = $("da-btn"), daModal = $("da-modal"), daClose = $("da-close");
const daInput = $("da-input"), daChars = $("da-chars"), daSubmit = $("da-submit");
const daResultModal = $("da-result-modal"), daResultClose = $("da-result-close");
const daResultText = $("da-result-text"), daLoading = $("da-loading");
const daResultFoot = $("da-result-footer"), daAgain = $("da-again");

daInput.addEventListener("input", () => { daChars.textContent = daInput.value.length; });
daBtn.onclick = () => { daModal.classList.remove("hidden"); setTimeout(() => daInput.focus(), 80); };
function closeDAModal()  { daModal.classList.add("hidden"); }
function closeDAResult() { daResultModal.classList.add("hidden"); }
daClose.onclick       = closeDAModal;
daResultClose.onclick = closeDAResult;
daModal.onclick       = e => { if (e.target === daModal) closeDAModal(); };
daResultModal.onclick = e => { if (e.target === daResultModal) closeDAResult(); };
daAgain.onclick = () => {
  closeDAResult();
  daInput.value = ""; daChars.textContent = "0";
  setTimeout(() => { daModal.classList.remove("hidden"); daInput.focus(); }, 150);
};
daSubmit.onclick = async () => {
  const idea = daInput.value.trim();
  if (!idea) { daInput.focus(); return; }
  closeDAModal();
  daResultModal.classList.remove("hidden");
  daLoading.style.display = "flex"; daResultText.style.display = "none"; daResultFoot.style.display = "none";
  daResultText.innerHTML = "";
  const daSys = `You are EUREKA AI in Devil's Advocate mode. The user has shared an idea, plan, or decision. Your job is to be a brutal but intelligent pre-mortem analyst. Find EVERY flaw, blind spot, risk, and failure mode you can. Be specific, sharp, and ruthlessly honest — but constructive. Do NOT be encouraging. Do NOT validate the idea at all. Structure your response exactly like this:

💀 FATAL FLAWS (2-3 things that could kill this entirely)
⚠️ SERIOUS RISKS (2-3 significant problems they haven't thought of)
🤦 BLIND SPOTS (1-2 things they're clearly not seeing)
🔮 MOST LIKELY OUTCOME (one brutal but honest prediction in 1-2 sentences)

Keep each point to 1-2 sharp sentences. Total under 220 words. No softening. No "but on the bright side." Pure devil's advocate.`;
  try {
    const data = await chatOnce({ model: getModel(), max_tokens: 400, messages: [{ role:"system", content: daSys }, { role:"user", content:"My idea/plan: " + idea }] }, { "X-Title":"EUREKA Devils Advocate" });
    if (data?.error) throw new Error((data.error && data.error.message) || "API error");
    const result = data?.choices?.[0]?.message?.content;
    if (!result) { daResultText.innerHTML = `<p class="da-err">No response. Try again.</p>`; }
    else {
      const lines = result.split("\n").filter(l => l.trim());
      let html = "";
      lines.forEach(line => {
        const t = line.trim();
        if (t.startsWith("💀") || t.startsWith("⚠️") || t.startsWith("🤦") || t.startsWith("🔮")) {
          html += `<div class="da-section-head">${esc(t)}</div>`;
        } else if (t.startsWith("-") || t.startsWith("•")) {
          html += `<div class="da-point">${esc(t.slice(1).trim())}</div>`;
        } else if (t) {
          html += `<div class="da-point">${esc(t)}</div>`;
        }
      });
      daResultText.innerHTML = html || `<p>${esc(result)}</p>`;
    }
  } catch(e) {
    daResultText.innerHTML = `<p class="da-err">${esc(e.message || "Network error. Try again.")}</p>`;
  }
  daLoading.style.display = "none"; daResultText.style.display = "block"; daResultFoot.style.display = "block";
};

/* ═══════════════════════════════════════════
   GEN-Z CONVERTER
═══════════════════════════════════════════ */
let genzLevel = 2;
const GENZ_PROMPTS = {
  1: `Lightly rewrite the following text in a casual Gen-Z tone. Use a few modern slang terms naturally (like "lowkey", "ngl", "kinda", "tbh"). Keep it mostly readable and only slightly informal. Do not overdo it.`,
  2: `Rewrite the following text in a solid Gen-Z voice. Use slang like "no cap", "lowkey", "slay", "bussin", "fr fr", "it's giving", "vibe", "mid", "based". Make it feel like a real Gen-Z person wrote it. Natural, not forced.`,
  3: `Rewrite the following text in heavy Gen-Z slang. Go hard — "bestie", "slay", "no cap", "it's giving", "understood the assignment", "main character", "rent free", "ate and left no crumbs", "era", "hits different", "sending me". Make it chaotic but still understandable.`,
  4: `Rewrite the following text in absolute peak Gen-Z. Every sentence should drip with slang. Use: "no cap", "fr fr", "slay", "bussin", "lowkey ate", "understood the assignment", "this is my villain era", "not me", "I'm deceased", "rent free", "hits different", "main character energy", "giving", "delulu", "rizz". Go absolutely unhinged but coherent.`,
  5: `Rewrite the following text in the most extreme, unhinged Gen-Z possible. Think TikTok comment section at 3am. Use every slang term you know — "no cap fr fr", "understood the assignment bestie", "I'm so deceased rn", "this slaps", "we don't talk about that era", "living rent free", "slay queen", "delulu is the solulu", "rizz god", "touch grass", "it's giving main character", "ate and left no crumbs no cap". Make it barely comprehensible to anyone over 25.`
};
const GENZ_LABELS = { 1:"🙂 Mild", 2:"😎 Mid", 3:"🔥 Cooked", 4:"💀 No cap", 5:"🗿 Unalived" };

document.querySelectorAll(".genz-lvl").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".genz-lvl").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    genzLevel = parseInt(btn.dataset.l);
  };
});
$("genz-input").addEventListener("input", () => {
  $("genz-chars").textContent = $("genz-input").value.length;
});
$("genz-btn").onclick = () => {
  $("genz-modal").classList.remove("hidden");
  setTimeout(() => $("genz-input").focus(), 80);
};
$("genz-close").onclick = () => $("genz-modal").classList.add("hidden");
$("genz-modal").onclick = e => { if (e.target.id === "genz-modal") $("genz-modal").classList.add("hidden"); };
$("genz-copy").onclick = function() {
  const text = $("genz-output").innerText;
  navigator.clipboard.writeText(text).then(() => {
    this.textContent = "Copied! ✅";
    setTimeout(() => { this.textContent = "Copy ✨"; }, 1500);
  });
};
$("genz-submit").onclick = async () => {
  const text = $("genz-input").value.trim();
  if (!text) { $("genz-input").focus(); return; }
  const outEl = $("genz-output"), copyBtn = $("genz-copy"), outLbl = $("genz-output-label"), submitBtn = $("genz-submit");
  outEl.innerHTML = '<div class="genz-loading"><div class="roast-dots"><div></div><div></div><div></div></div><div>cooking up the translation fr fr…</div></div>';
  copyBtn.style.display = "none"; submitBtn.disabled = true; outLbl.textContent = "";
  try {
    const data = await chatOnce({ model: getModel(), max_tokens: 500, messages: [{ role:"system", content: GENZ_PROMPTS[genzLevel] + " Return ONLY the rewritten text. No explanations, no quotation marks, no preamble." }, { role:"user", content: text }] }, { "X-Title":"EUREKA GenZ Converter" });
    if (data?.error) throw new Error("api");
    const result = data?.choices?.[0]?.message?.content?.trim();
    if (!result) throw new Error("empty");
    outEl.innerHTML = ""; outEl.textContent = result;
    outLbl.textContent = "— " + GENZ_LABELS[genzLevel];
    copyBtn.style.display = "block";
  } catch(e) {
    outEl.innerHTML = '<div class="genz-placeholder" style="color:#f87171">Translation failed bestie. Check your connection fr.</div>';
  }
  submitBtn.disabled = false;
};
$("genz-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) $("genz-submit").click();
});

/* ═══════════════════════════════════════════
   MOBILE SIDEBAR
═══════════════════════════════════════════ */
const backdrop = $("sidebar-backdrop");
function isMobile() { return window.innerWidth <= 768; }
function openMobileSidebar() {
  $("sidebar").classList.add("mobile-open");
  backdrop.classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeMobileSidebar() {
  $("sidebar").classList.remove("mobile-open");
  backdrop.classList.remove("show");
  document.body.style.overflow = "";
}
backdrop.onclick = closeMobileSidebar;

$("sidebar-toggle-btn").onclick = () => {
  if (isMobile()) {
    const isOpen = $("sidebar").classList.contains("mobile-open");
    if (isOpen) closeMobileSidebar(); else openMobileSidebar();
    return;
  }
  sidebarHidden = !sidebarHidden;
  const sidebar = $("sidebar"), btn = $("sidebar-toggle-btn"), svg = btn.querySelector("svg");
  if (sidebarHidden) {
    sidebar.classList.add("sb-hidden");
    btn.title = "Show sidebar";
    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"/>';
  } else {
    sidebar.classList.remove("sb-hidden");
    btn.title = "Hide sidebar";
    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/>';
  }
};

const origRenderProjs = renderProjs;
renderProjs = function() {
  origRenderProjs();
  if (isMobile()) {
    document.querySelectorAll(".ci").forEach(el => {
      el.addEventListener("click", () => { if (isMobile()) closeMobileSidebar(); });
    });
  }
};
const origNewConv = newConv;
newConv = function(title) {
  origNewConv(title);
  if (isMobile()) closeMobileSidebar();
};
["roast-btn","debate-btn","code-mode-btn","da-btn","genz-btn","fc-btn","quiz-btn","plan-btn","timer-btn","study-mode-btn"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("click", () => { if (isMobile()) closeMobileSidebar(); });
});
window.addEventListener("resize", () => { if (!isMobile()) closeMobileSidebar(); });

/* ═══════════════════════════════════════════
   AUTH SYSTEM (localStorage, SHA-256 + salt)
═══════════════════════════════════════════ */
async function hashPass(pass, salt) {
  return sha256("eureka|" + salt + "|" + pass);
}
function makeSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}
/* Legacy base64 check for accounts made before the upgrade, then migrate */
async function verifyPass(user, pass) {
  if (user.salt && user.hash) return (await hashPass(pass, user.salt)) === user.hash;
  const legacy = btoa(unescape(encodeURIComponent("eureka_" + pass)));
  return legacy === user.hash;
}
async function upgradeUser(uval, user, pass) {
  if (user.salt) return user;
  const salt = makeSalt();
  user.salt = salt;
  user.hash = await hashPass(pass, salt);
  user.v = 2;
  const users = getUsers(); users[uval] = user; saveUsers(users);
  return user;
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem("eureka_users") || "{}"); } catch(e) { return {}; }
}
function saveUsers(u) { localStorage.setItem("eureka_users", JSON.stringify(u)); }

function applyUser(username) {
  sbName.textContent   = username;
  sbEmail.textContent  = modelPretty(getModel());
  sbAvatar.textContent = username.slice(0, 2).toUpperCase();
}
function updateModelBadge() {
  const badge = $("mbadge");
  if (badge) badge.textContent = modelPretty(getModel());
  if (CU) sbEmail.textContent = modelPretty(getModel());
}

async function launchApp(username) {
  CU = username;
  applyUser(username);
  homeScreen.classList.add("hidden");
  signupOverlay.classList.add("hidden");
  loginOverlay.classList.add("hidden");
  if (typeof marked !== "undefined") marked.setOptions({ breaks: true, gfm: true });
  const ps = getP();
  if (!ps.length) newConv("New conversation");
  else {
    if (!getCur() || !ps.find(x => x.id === getCur())) setCur(ps[0].id);
    renderProjs(); loadChat();
  }
  loadNotes(); syncVoice(); updateModelBadge();
  speechSynthesis.onvoiceschanged = () => {};
  const introEl = document.getElementById("intro");
  const finish = () => { app.classList.remove("hidden"); if (!hasSetup()) openOnboarding(); };
  if (introEl) {
    setTimeout(() => {
      introEl.style.opacity = "0";
      setTimeout(() => { introEl.remove(); finish(); }, 550);
    }, 2000);
  } else {
    finish();
  }
}

/* SIGN UP */
$("su-submit").onclick = async () => {
  const uval  = $("su-user").value.trim().toLowerCase().replace(/\s+/g, "");
  const pval  = $("su-pass").value;
  const p2val = $("su-pass2").value;
  const msg = $("su-msg"), btn = $("su-submit");
  msg.className = "auth-msg";

  if (!uval)                        { msg.className="auth-msg err"; msg.textContent="Please enter a username."; return; }
  if (uval.length < 3)              { msg.className="auth-msg err"; msg.textContent="Username must be at least 3 characters."; return; }
  if (!/^[a-z0-9_]+$/.test(uval))   { msg.className="auth-msg err"; msg.textContent="Only letters, numbers, and underscores allowed."; return; }
  if (!pval)                        { msg.className="auth-msg err"; msg.textContent="Please enter a password."; return; }
  if (pval.length < 6)              { msg.className="auth-msg err"; msg.textContent="Password must be at least 6 characters."; return; }
  if (pval !== p2val)               { msg.className="auth-msg err"; msg.textContent="Passwords do not match."; return; }

  const users = getUsers();
  if (users[uval]) {
    msg.className="auth-msg err"; msg.textContent="⚠ Username already taken. Please choose another."; return;
  }
  const salt = makeSalt();
  users[uval] = { salt, hash: await hashPass(pval, salt), created: Date.now(), v: 2 };
  saveUsers(users);
  localStorage.setItem("eureka_session", uval);
  msg.className="auth-msg ok"; msg.textContent="Account created! Welcome to EUREKA AI 💜";
  btn.disabled = true;
  setTimeout(() => launchApp(uval), 600);
};

/* LOG IN */
$("li-submit").onclick = async () => {
  const uval = $("li-user").value.trim().toLowerCase();
  const pval = $("li-pass").value;
  const msg = $("li-msg"), btn = $("li-submit");
  msg.className = "auth-msg";

  if (!uval) { msg.className="auth-msg err"; msg.textContent="Please enter your username."; return; }
  if (!pval) { msg.className="auth-msg err"; msg.textContent="Please enter your password."; return; }

  const users = getUsers();
  const user  = users[uval];
  if (!user || !(await verifyPass(user, pval))) {
    msg.className="auth-msg err"; msg.textContent="Incorrect username or password."; return;
  }
  await upgradeUser(uval, user, pval);
  localStorage.setItem("eureka_session", uval);
  msg.className="auth-msg ok"; msg.textContent="Welcome back! Signing you in…";
  btn.disabled = true;
  setTimeout(() => launchApp(uval), 400);
};

/* Enter key in auth forms */
["su-user","su-pass","su-pass2"].forEach(id => {
  $(id).addEventListener("keydown", e => { if (e.key==="Enter") $("su-submit").click(); });
});
["li-user","li-pass"].forEach(id => {
  $(id).addEventListener("keydown", e => { if (e.key==="Enter") $("li-submit").click(); });
});

/* Overlay open/close */
function openSignup() {
  loginOverlay.classList.add("hidden");
  signupOverlay.classList.remove("hidden");
  setTimeout(() => $("su-user").focus(), 50);
}
function openLogin() {
  signupOverlay.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
  setTimeout(() => $("li-user").focus(), 50);
}
function closeOverlays() {
  signupOverlay.classList.add("hidden");
  loginOverlay.classList.add("hidden");
}
$("nav-login-btn").onclick   = openLogin;
$("nav-signup-btn").onclick  = openSignup;
$("hero-signup-btn").onclick = openSignup;
$("hero-login-btn").onclick  = openLogin;
$("su-to-login").onclick     = openLogin;
$("li-to-signup").onclick    = openSignup;
$("signup-close").onclick    = closeOverlays;
$("login-close").onclick     = closeOverlays;
signupOverlay.onclick = e => { if (e.target===signupOverlay) closeOverlays(); };
loginOverlay.onclick  = e => { if (e.target===loginOverlay)  closeOverlays(); };

/* Logout */
logoutBtn.onclick = () => {
  if (!confirm("Sign out of EUREKA AI?")) return;
  localStorage.removeItem("eureka_session");
  location.reload();
};

/* ═══════════════════════════════════════════
   INIT — Check for saved session
═══════════════════════════════════════════ */
(function init() {
  const session = localStorage.getItem("eureka_session");
  if (session) {
    const users = getUsers();
    if (users[session]) {
      launchApp(session);
      return;
    }
    localStorage.removeItem("eureka_session");
  }
  const introEl = document.getElementById("intro");
  if (introEl) {
    setTimeout(() => {
      introEl.style.opacity = "0";
      setTimeout(() => { introEl.remove(); }, 550);
    }, 2200);
  }
})();

/* ═══════════════════════════════════════════
   SERVICE WORKER — inline blob (no extra file)
═══════════════════════════════════════════ */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const BASE = new URL(".", location.href).href;   // works at domain root AND subfolder deploys
  const swCode = `
const CACHE = "eureka-v2";
const BASE = "${BASE}";
const ASSETS = ["index.html","style.css","script.js","study.js","manifest.json","icon.svg"].map(p => BASE + p);
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(a => c.add(a)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.url.includes("openrouter.ai")) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (e.request.method === "GET" && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(BASE + "index.html")))
  );
});
  `;
  const blob = new Blob([swCode], { type: "application/javascript" });
  const url  = URL.createObjectURL(blob);
  navigator.serviceWorker.register(url)
    .then(() => URL.revokeObjectURL(url))
    .catch(() => {});
}
