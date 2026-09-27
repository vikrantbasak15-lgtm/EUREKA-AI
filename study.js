/* ═══════════════════════════════════════════
   EUREKA AI — study.js
   Study suite: tutor mode, flashcards, quiz, exam planner, focus timer
   Depends on script.js helpers: $, esc, sanitize, fixLinks, chatOnce,
   getModel, uk(), ct, cc, app, showToast, studyBusy, parseModelJSON, collectChatText
═══════════════════════════════════════════ */

/* ── STUDY MODE (tutor persona for normal chat) ── */
const STUDY_SYS = `You are EUREKA AI in STUDY MODE — a patient, expert tutor. The student's name is __NAME__. Follow Socratic tutoring best practices:
1. Diagnose first: if a question is vague, ask ONE clarifying question before answering.
2. Build from foundations: start where the student likely is, then layer up. Define jargon the moment it appears.
3. Use at least one concrete analogy or real-world example per explanation.
4. Break complex answers into numbered steps or short sections. Prefer clarity over completeness.
5. End every substantial explanation with one quick check-for-understanding question (don't answer it yourself).
6. If the student is wrong, never just give the answer — point at the specific flaw and guide them to fix it.
7. Keep a warm but focused tone. Celebrate progress briefly. No fluff.
You never break character and you never do the student's graded work for them — you teach toward understanding.`;

let studyMode = false;

function toggleStudyMode() {
  studyMode = !studyMode;
  $("study-mode-btn").classList.toggle("active", studyMode);
  $("study-mode-label").textContent = studyMode ? "Study Mode ON" : "Study Mode";
  app.classList.toggle("study-mode-active", studyMode);
  showToast(studyMode ? "🎓 Study Mode on — I'll tutor, not just answer" : "Study Mode off");
}
$("study-mode-btn").onclick = toggleStudyMode;

/* Patch buildSys so chat respects Study Mode (defined after script.js loads) */
const _buildSys = buildSys;
buildSys = function() {
  let s = _buildSys();
  if (studyMode && !codeMode) s = STUDY_SYS.replace("__NAME__", CU || "friend") + "\n" + s;
  return s;
};

/* ── SHARED HELPERS ── */
function collectChatText(max) {
  const parts = [];
  cc.querySelectorAll(".mr .mb").forEach(el => {
    const t = (el.innerText || el.textContent || "").trim();
    if (t && t.length > 1) parts.push(t);
  });
  return parts.join("\n\n").slice(0, max || 9000);
}
function parseModelJSON(text) {
  if (!text) return null;
  const stripped = String(text).replace(/```(?:json)?/g, "").trim();
  const firstObj = Math.min(...["{", "["].map(c => { const i = stripped.indexOf(c); return i === -1 ? Infinity : i; }));
  const lastObj  = Math.max(stripped.lastIndexOf("}"), stripped.lastIndexOf("]"));
  if (firstObj === Infinity || lastObj === -1) return null;
  const slice = stripped.slice(firstObj, lastObj + 1);
  try { return JSON.parse(slice); } catch(e) {}
  try { return JSON.parse(stripped); } catch(e) { return null; }
}
function studyBusy(btn, on, label) {
  btn.disabled = on;
  if (on) { btn.dataset.orig = btn.textContent; btn.textContent = label; }
  else if (btn.dataset.orig) btn.textContent = btn.dataset.orig;
}

/* Reusable source selector: one function, per-tool state */
function makeSourcePicker(prefix) {
  const st = { src: "topic", level: "beginner" };
  const attr  = prefix === "plan" ? "level" : prefix === "quiz" ? "quiz-s" : "s";
  const prop  = prefix === "plan" ? "level" : prefix === "quiz" ? "quizS" : "s";
  const root  = "#" + prefix + "-modal";
  document.querySelectorAll(root + " [data-" + attr + "]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(root + " [data-" + attr + "]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      st[prop] = btn.dataset[attr];
      syncSrcFields();
    };
  });
  function syncSrcFields() {
    if (prefix === "plan") return;
    $(prefix + "-topic-field").classList.toggle("hidden", st.src !== "topic");
    $(prefix + "-notes-field").classList.toggle("hidden", st.src !== "notes");
    $(prefix + "-chat-field").classList.toggle("hidden", st.src !== "chat");
  }
  syncSrcFields();
  return st;
}

/* ═══════════════════════════════════════════
   FLASHCARDS
═══════════════════════════════════════════ */
let fcState  = makeSourcePicker("fc");
let fcDecks  = [];
let fcActive = null;   // {name, cards:[{f,b}], i, known:Set}

function fcLoad() {
  try { fcDecks = JSON.parse(localStorage.getItem(uk("decks")) || "[]"); }
  catch(e) { fcDecks = []; }
  fcRenderDecks();
}
function fcSave() { localStorage.setItem(uk("decks"), JSON.stringify(fcDecks)); }

function fcRenderDecks() {
  const wrap = $("fc-decks");
  if (!fcDecks.length) { wrap.innerHTML = '<div class="fc-deck-empty">No decks yet — generate your first one above.</div>'; return; }
  wrap.innerHTML = fcDecks.map((d, i) => `
    <div class="fc-deck" data-i="${i}">
      <div class="fc-deck-main"><div class="fc-deck-name">${esc(d.name)}</div><div class="fc-deck-meta">${d.cards.length} cards · ${(d.known || []).length} mastered</div></div>
      <button class="fc-deck-del" title="Delete deck">✕</button>
    </div>`).join("");
  wrap.querySelectorAll(".fc-deck").forEach(el => {
    el.querySelector(".fc-deck-del").onclick = e => {
      e.stopPropagation();
      if (!confirm("Delete this deck?")) return;
      fcDecks.splice(+el.dataset.i, 1); fcSave(); fcRenderDecks();
    };
    el.onclick = () => fcStudy(fcDecks[+el.dataset.i]);
  });
}

$("fc-btn").onclick = () => { fcLoad(); $("fc-modal").classList.remove("hidden"); setTimeout(() => $("fc-topic").focus(), 80); };
$("fc-close").onclick = () => $("fc-modal").classList.add("hidden");
$("fc-modal").onclick = e => { if (e.target.id === "fc-modal") $("fc-modal").classList.add("hidden"); };
$("fc-notes").addEventListener("input", () => { $("fc-chars").textContent = $("fc-notes").value.length; });
document.querySelectorAll("#fc-modal .fc-num").forEach(b => {
  b.onclick = () => { document.querySelectorAll("#fc-modal .fc-num").forEach(x => x.classList.remove("active")); b.classList.add("active"); };
});

$("fc-generate").onclick = async () => {
  const n = parseInt(document.querySelector("#fc-modal .fc-num.active").dataset.n);
  let source, label;
  if (fcState.src === "topic") {
    source = $("fc-topic").value.trim();
    if (!source) { $("fc-topic").focus(); return; }
    label = source;
  } else if (fcState.src === "notes") {
    source = $("fc-notes").value.trim();
    if (!source) { $("fc-notes").focus(); return; }
    label = "these notes";
  } else {
    source = collectChatText();
    if (!source) { showToast("This conversation is empty"); return; }
    label = (ct.textContent || "this chat").slice(0, 40);
  }
  const btn = $("fc-generate");
  studyBusy(btn, true, "🃏 Generating…");
  try {
    const data = await chatOnce({
      model: getModel(),
      max_tokens: 2500,
      messages: [
        { role: "system", content: "You are an expert study-materials generator. Output ONLY valid JSON — no markdown fences, no commentary." },
        { role: "user", content: 'Create exactly ' + n + ' flashcards for a student from this source: "' + label + '".\n\nSOURCE MATERIAL:\n' + source.slice(0, 7000) + '\n\nRules: front = a precise question or term; back = a complete but tight answer (max 40 words). Cover the source evenly, easiest to hardest. Respond with ONLY this JSON: {"name": "short deck name (max 30 chars)", "cards": [{"f": "front", "b": "back"}]}' }
      ]
    }, { "X-Title": "EUREKA Flashcards" });
    if (data?.error) throw new Error((data.error && data.error.message) || "API error");
    const parsed = parseModelJSON(data?.choices?.[0]?.message?.content);
    if (!parsed || !Array.isArray(parsed.cards) || !parsed.cards.length) throw new Error("Could not parse the deck — try again");
    const deck = {
      name: String(parsed.name || label).slice(0, 40),
      cards: parsed.cards.slice(0, n).map(c => ({ f: String(c.f || ""), b: String(c.b || "") })).filter(c => c.f && c.b),
      known: []
    };
    if (!deck.cards.length) throw new Error("Deck came back empty — try again");
    fcDecks.unshift(deck); fcSave(); fcRenderDecks();
    $("fc-topic").value = "";
    showToast("Deck saved ✓");
    fcStudy(deck);
  } catch(e) {
    showToast("⚠️ " + (e.message || "Generation failed"));
  }
  studyBusy(btn, false);
};

function fcStudy(deck) {
  fcActive = { name: deck.name, cards: deck.cards.slice(), known: new Set(deck.known || []), i: 0 };
  $("fc-setup").classList.add("hidden");
  $("fc-study").classList.remove("hidden");
  $("fc-deckname").textContent = deck.name;
  fcPaint();
}
function fcPaint() {
  const a = fcActive, c = a.cards[a.i];
  $("fc-card").classList.remove("flipped");
  $("fc-front-text").textContent = c.f;
  $("fc-back-text").textContent = c.b;
  $("fc-progress").style.width = (a.i / a.cards.length * 100) + "%";
  $("fc-progress-text").textContent = "Card " + (a.i + 1) + " / " + a.cards.length + " · ✓ " + a.known.size + " mastered";
}
$("fc-card").onclick = () => $("fc-card").classList.toggle("flipped");
$("fc-prev").onclick = () => { if (fcActive.i > 0) { fcActive.i--; fcPaint(); } };
$("fc-next").onclick = () => {
  const a = fcActive;
  if (a.i < a.cards.length - 1) { a.i++; fcPaint(); }
  else fcFinishDeck();
};
$("fc-know").onclick = () => {
  const a = fcActive;
  a.known.add(a.i);
  const stored = fcDecks.find(d => d.name === a.name);
  if (stored) { stored.known = [...a.known]; fcSave(); }
  if (a.known.size === a.cards.length) { fcFinishDeck(); return; }
  $("fc-next").click();
};
function fcFinishDeck() {
  const a = fcActive;
  const pct = Math.round(a.known.size / a.cards.length * 100);
  showToast("🎉 Deck done — " + a.known.size + "/" + a.cards.length + " mastered (" + pct + "%)");
  $("fc-progress").style.width = "100%";
  $("fc-progress-text").textContent = "✓ " + a.known.size + " / " + a.cards.length + " mastered";
}
$("fc-exit-study").onclick = () => {
  $("fc-study").classList.add("hidden");
  $("fc-setup").classList.remove("hidden");
  fcRenderDecks();
};

/* ═══════════════════════════════════════════
   QUIZ
═══════════════════════════════════════════ */
let quizState = makeSourcePicker("quiz");
let quiz = null;   // {qs:[{q,o,a,why}], i, score, answered}

function quizBestKey() { return uk("quizbest"); }
function quizShowBest() {
  const raw = localStorage.getItem(quizBestKey());
  $("quiz-best").textContent = raw ? "🏆 Best score: " + raw : "";
}

$("quiz-btn").onclick = () => {
  $("quiz-modal").classList.remove("hidden");
  $("quiz-setup").classList.remove("hidden");
  $("quiz-run").classList.add("hidden");
  $("quiz-result").classList.add("hidden");
  quizShowBest();
  setTimeout(() => $("quiz-topic").focus(), 80);
};
$("quiz-close").onclick = () => $("quiz-modal").classList.add("hidden");
$("quiz-modal").onclick = e => { if (e.target.id === "quiz-modal") $("quiz-modal").classList.add("hidden"); };
$("quiz-notes").addEventListener("input", () => { $("quiz-chars").textContent = $("quiz-notes").value.length; });
document.querySelectorAll("#quiz-modal .fc-num").forEach(b => {
  b.onclick = () => { document.querySelectorAll("#quiz-modal .fc-num").forEach(x => x.classList.remove("active")); b.classList.add("active"); };
});

$("quiz-generate").onclick = async () => {
  const n = parseInt(document.querySelector("#quiz-modal .fc-num.active").dataset.qn);
  let source, label;
  if (quizState.src === "topic") {
    source = $("quiz-topic").value.trim();
    if (!source) { $("quiz-topic").focus(); return; }
    label = source;
  } else if (quizState.src === "notes") {
    source = $("quiz-notes").value.trim();
    if (!source) { $("quiz-notes").focus(); return; }
    label = "these notes";
  } else {
    source = collectChatText();
    if (!source) { showToast("This conversation is empty"); return; }
    label = "this conversation";
  }
  const btn = $("quiz-generate");
  studyBusy(btn, true, "✅ Writing questions…");
  try {
    const data = await chatOnce({
      model: getModel(),
      max_tokens: 2800,
      messages: [
        { role: "system", content: "You are an expert exam writer. Output ONLY valid JSON — no markdown fences, no commentary." },
        { role: "user", content: 'Write a ' + n + '-question multiple-choice quiz from: "' + label + '".\n\nSOURCE MATERIAL:\n' + source.slice(0, 7000) + '\n\nRules: one clearly correct answer per question; 4 options each; distractors plausible; test understanding, not trivia; "why" = 1-2 sentence explanation of the correct answer. Respond with ONLY this JSON: {"qs": [{"q": "question", "o": ["A","B","C","D"], "a": 0, "why": "explanation"}]} where "a" is the 0-based index of the correct option.' }
      ]
    }, { "X-Title": "EUREKA Quiz" });
    if (data?.error) throw new Error((data.error && data.error.message) || "API error");
    const parsed = parseModelJSON(data?.choices?.[0]?.message?.content);
    if (!parsed || !Array.isArray(parsed.qs) || !parsed.qs.length) throw new Error("Could not parse the quiz — try again");
    const qs = parsed.qs.filter(q => q && Array.isArray(q.o) && q.o.length >= 2 && typeof q.a === "number").slice(0, n);
    if (!qs.length) throw new Error("Quiz came back empty — try again");
    quiz = { qs, i: 0, score: 0, answered: false };
    $("quiz-setup").classList.add("hidden");
    $("quiz-result").classList.add("hidden");
    $("quiz-run").classList.remove("hidden");
    quizPaint();
  } catch(e) {
    showToast("⚠️ " + (e.message || "Quiz generation failed"));
  }
  studyBusy(btn, false);
};

function quizPaint() {
  const q = quiz.qs[quiz.i];
  quiz.answered = false;
  $("quiz-qnum").textContent = "Question " + (quiz.i + 1) + " of " + quiz.qs.length;
  $("quiz-progress").style.width = (quiz.i / quiz.qs.length * 100) + "%";
  $("quiz-score-chip").textContent = quiz.score + "/" + quiz.qs.length;
  $("quiz-q").textContent = q.q;
  $("quiz-expl").classList.add("hidden");
  $("quiz-next").style.display = "none";
  const opts = $("quiz-opts");
  opts.innerHTML = "";
  q.o.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "quiz-opt";
    b.innerHTML = '<span class="quiz-letter">' + "ABCDEFGH"[i] + '</span><span class="quiz-opttext"></span>';
    b.querySelector(".quiz-opttext").textContent = opt;
    b.onclick = () => quizAnswer(i);
    opts.appendChild(b);
  });
}
function quizAnswer(i) {
  if (quiz.answered) return;
  quiz.answered = true;
  const q = quiz.qs[quiz.i];
  $("quiz-opts").querySelectorAll(".quiz-opt").forEach((b, j) => {
    b.classList.add(j === q.a ? "correct" : (j === i ? "wrong" : "dim"));
    b.onclick = null;
  });
  if (i === q.a) quiz.score++;
  $("quiz-score-chip").textContent = quiz.score + "/" + quiz.qs.length;
  const ex = $("quiz-expl");
  ex.innerHTML = "<strong>" + (i === q.a ? "✅ Correct!" : "❌ Not quite.") + "</strong> ";
  ex.appendChild(document.createTextNode(q.why || ""));
  ex.classList.remove("hidden");
  const next = $("quiz-next");
  next.textContent = quiz.i === quiz.qs.length - 1 ? "See results →" : "Next →";
  next.style.display = "block";
}
$("quiz-next").onclick = () => {
  if (quiz.i < quiz.qs.length - 1) { quiz.i++; quizPaint(); }
  else quizFinish();
};
function quizFinish() {
  $("quiz-run").classList.add("hidden");
  $("quiz-result").classList.remove("hidden");
  const s = quiz.score, n = quiz.qs.length, pct = Math.round(s / n * 100);
  $("quiz-result-score").textContent = s + "/" + n;
  let msg, sub;
  if (pct === 100)    { msg = "Flawless. 🧠";     sub = "You own this material. Teach it to someone to lock it in."; }
  else if (pct >= 80) { msg = "Strong work! 💪";  sub = "Solid grasp — skim what you missed and you're exam-ready."; }
  else if (pct >= 60) { msg = "Getting there 📈"; sub = "Review the explanations, then run it again."; }
  else                { msg = "Time to review 📚"; sub = "Head back to your notes, then retake this quiz."; }
  $("quiz-result-msg").textContent = msg;
  $("quiz-result-sub").textContent = sub + " (" + pct + "%)";
  const key = quizBestKey();
  const prevRaw = localStorage.getItem(key);
  const prevScore = prevRaw ? parseInt(String(prevRaw).split("/")[0] || "0") : -1;
  if (!prevRaw || s > prevScore) {
    localStorage.setItem(key, s + "/" + n);
    $("quiz-result-sub").textContent += " · 🏆 New best!";
  }
  quizShowBest();
}
$("quiz-again").onclick = () => { $("quiz-result").classList.add("hidden"); $("quiz-setup").classList.remove("hidden"); };
$("quiz-done").onclick  = () => $("quiz-modal").classList.add("hidden");

/* ═══════════════════════════════════════════
   EXAM PLANNER
═══════════════════════════════════════════ */
let planState = makeSourcePicker("plan");

$("plan-btn").onclick = () => { $("plan-modal").classList.remove("hidden"); planRenderExisting(); setTimeout(() => $("plan-subject").focus(), 80); };
$("plan-close").onclick = () => $("plan-modal").classList.add("hidden");
$("plan-modal").onclick = e => { if (e.target.id === "plan-modal") $("plan-modal").classList.add("hidden"); };

function planRenderExisting() {
  const raw = localStorage.getItem(uk("plan"));
  $("plan-existing").innerHTML = raw
    ? '<div class="plan-saved">📌 Saved plan: <a id="plan-open-saved">' + esc(raw.split("||")[0].slice(0, 60)) + "</a></div>"
    : "";
  const link = document.getElementById("plan-open-saved");
  if (link) link.onclick = () => planShow(raw.split("||")[1]);
}

$("plan-generate").onclick = async () => {
  const subject = $("plan-subject").value.trim();
  const date    = $("plan-date").value;
  const mins    = Math.max(15, Math.min(480, parseInt($("plan-mins").value) || 60));
  const topics  = $("plan-topics").value.trim();
  if (!subject) { $("plan-subject").focus(); return; }
  if (!date)    { $("plan-date").focus(); return; }
  const days = Math.max(1, Math.ceil((new Date(date + "T23:59:59") - new Date()) / 86400000));
  if (days > 365) { showToast("That exam is over a year away 😅"); return; }
  const btn = $("plan-generate");
  studyBusy(btn, true, "📅 Building…");
  try {
    const data = await chatOnce({
      model: getModel(),
      max_tokens: 1600,
      messages: [
        { role: "system", content: "You are an expert study coach. Write practical, specific day-by-day study plans. Use markdown. No preamble, no closing pep talk." },
        { role: "user", content: "Exam: " + subject + "\nDays available: " + days + "\nStudy time: " + mins + " minutes per day\nCurrent level: " + planState.level + "\n" + (topics ? "Topics to cover: " + topics : "Choose the standard high-yield topics for this exam yourself.") + "\n\nWrite a day-by-day plan (Day 1 to Day " + days + "). For each day give: a bolded day header with the date (" + new Date().toDateString().slice(4) + " start), 2-4 bullet tasks with time estimates summing to about " + mins + " min, and which topics to review vs learn fresh. Build in spaced review of earlier days every 3-4 days, and keep the final 2 days for full review and a mock test. If days > 21, group them into phases instead of listing every single day." }
      ]
    }, { "X-Title": "EUREKA Exam Planner" });
    if (data?.error) throw new Error((data.error && data.error.message) || "API error");
    const md = data?.choices?.[0]?.message?.content;
    if (!md) throw new Error("Empty response — try again");
    localStorage.setItem(uk("plan"), subject.slice(0, 80) + "||" + md);
    planShow(md, subject);
  } catch(e) {
    showToast("⚠️ " + (e.message || "Planning failed"));
  }
  studyBusy(btn, false);
};

function planShow(md, subject) {
  $("plan-setup").classList.add("hidden");
  $("plan-result").classList.remove("hidden");
  $("plan-result-subject").textContent = subject || (localStorage.getItem(uk("plan")) || "||").split("||")[0];
  $("plan-result-content").innerHTML = sanitize(md);
  fixLinks($("plan-result-content"));
  $("plan-copy").style.display = "inline-block";
}
$("plan-copy").onclick = () => {
  navigator.clipboard.writeText($("plan-result-content").innerText).then(() => showToast("Plan copied ✓"));
};
$("plan-again").onclick = () => { $("plan-result").classList.add("hidden"); $("plan-setup").classList.remove("hidden"); };
$("plan-done").onclick  = () => $("plan-modal").classList.add("hidden");

/* ═══════════════════════════════════════════
   FOCUS TIMER (Pomodoro)
═══════════════════════════════════════════ */
const FOCUS_KEY = "eureka_focus";
let timer = null;        // {total, left, iv}
let timerOpen = false;

function todayFocus() {
  const t = new Date().toDateString();
  try {
    const d = JSON.parse(localStorage.getItem(FOCUS_KEY) || "{}");
    if (d.day !== t) return { day: t, sessions: 0, secs: 0 };
    return d;
  } catch(e) { return { day: new Date().toDateString(), sessions: 0, secs: 0 }; }
}
function bumpFocus(secs) {
  const d = todayFocus();
  d.secs = (d.secs || 0) + secs;
  localStorage.setItem(FOCUS_KEY, JSON.stringify(d));
}

$("timer-btn").onclick = () => {
  if (timerOpen) { closeTimerPanel(); return; }
  timerOpen = true;
  $("timer-btn-label").textContent = "Close Timer ⏱️";
  $("timer-btn").classList.add("active");
  const el = document.createElement("div");
  el.id = "timer-panel";
  const d = todayFocus();
  el.innerHTML = `
    <div class="tmr-label">Session length</div>
    <div class="tmr-presets">
      <button data-m="25" class="active">25m</button>
      <button data-m="50">50m</button>
      <button data-m="15">15m</button>
      <button data-m="5">5m</button>
    </div>
    <button class="tmr-start" id="tmr-start">▶ Start focus session</button>
    <div class="tmr-today">Today: <strong>${d.sessions}</strong> session${d.sessions === 1 ? "" : "s"} · ${Math.round((d.secs || 0) / 60)} min focused</div>
  `;
  const anchor = document.querySelector(".sbn");
  if (anchor) anchor.insertAdjacentElement("afterend", el);
  el.querySelectorAll(".tmr-presets button").forEach(b => {
    b.onclick = () => { el.querySelectorAll(".tmr-presets button").forEach(x => x.classList.remove("active")); b.classList.add("active"); };
  });
  $("tmr-start").onclick = () => timerStart(parseInt(el.querySelector(".tmr-presets .active").dataset.m));
};
function closeTimerPanel() {
  timerOpen = false;
  $("timer-btn-label").textContent = "Focus Timer ⏱️";
  $("timer-btn").classList.remove("active");
  const el = document.getElementById("timer-panel");
  if (el) el.remove();
}
function timerStart(mins) {
  timerStop(true);
  timer = { total: mins * 60, left: mins * 60, iv: null };
  $("timer-bar").classList.remove("hidden");
  $("timer-state").textContent = "Focus · " + mins + " min";
  $("timer-pause").textContent = "⏸";
  timerPaint();
  timer.iv = setInterval(timerTick, 1000);
  closeTimerPanel();
  showToast("⏱️ " + mins + " min focus session started — phone down, books open");
}
function timerPaint() {
  const m = Math.floor(timer.left / 60), s = timer.left % 60;
  $("timer-time").textContent = m + ":" + String(s).padStart(2, "0");
}
function timerTick() {
  timer.left--;
  bumpFocus(1);
  timerPaint();
  if (timer.left <= 0) timerFinish();
}
function timerFinish() {
  clearInterval(timer.iv);
  timer.iv = null;
  const d = todayFocus();
  d.sessions = (d.sessions || 0) + 1;
  localStorage.setItem(FOCUS_KEY, JSON.stringify(d));
  $("timer-state").textContent = "Session complete ✓";
  $("timer-time").textContent = "0:00";
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Session complete. Take a five minute break, you earned it.");
    speechSynthesis.speak(u);
  } catch(e) {}
  showToast("🎉 Session done — " + d.sessions + " today. Take a 5 min break.");
  setTimeout(() => { if (timer && timer.iv === null) timerStop(true); }, 4000);
}
function timerStop(silent) {
  if (timer && timer.iv) clearInterval(timer.iv);
  timer = null;
  $("timer-bar").classList.add("hidden");
  if (!silent) {
    closeTimerPanel();
    const d = todayFocus();
    showToast("Timer cleared · " + Math.round((d.secs || 0) / 60) + " min focused today");
  }
}
$("timer-pause").onclick = () => {
  if (!timer) return;
  if (timer.iv) {
    clearInterval(timer.iv); timer.iv = null;
    $("timer-state").textContent = "Paused";
    $("timer-pause").textContent = "▶";
  } else {
    timer.iv = setInterval(timerTick, 1000);
    $("timer-state").textContent = "Focus · running";
    $("timer-pause").textContent = "⏸";
  }
};
$("timer-stop").onclick = () => timerStop(false);
