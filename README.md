<div align="center">

# 💡 EUREKA AI

### Your AI study copilot — think differently.

**Tutor mode · Flashcards · Quizzes · Exam planner · Focus timer**

`Vanilla JS` · `No build step` · `Bring your own key` · `Local-first` · `PWA`

</div>

---

## ✨ What is this?

EUREKA AI is a **lightweight, privacy-friendly AI study assistant** that runs entirely in your browser.
No backend. No tracking. No subscriptions. You bring your own [OpenRouter](https://openrouter.ai) API key, pick any model you like, and everything else — your chats, decks, scores, notes — stays **on your device**.

## 🎓 Study tools

| Tool | What it does |
|---|---|
| 🎓 **Study Mode** | Turns the chat into a Socratic tutor — builds from foundations, uses analogies, and checks your understanding instead of just dumping answers |
| 🃏 **Flashcards** | Generate a deck from a topic, your notes, or the current chat. Flip cards, track mastered cards, decks are saved per account |
| ✅ **Quiz Me** | Auto-generated multiple-choice quizzes with instant feedback, explanations for every answer, and best-score tracking |
| 📅 **Exam Planner** | Give it a subject + exam date + minutes/day → get a day-by-day plan with spaced review and mock tests |
| ⏱️ **Focus Timer** | Built-in Pomodoro (25/50/15/5) with daily session and focus-minute tracking |

Plus the classics: **Code Mode**, 🔥 **Roast my chats**, ⚔️ **Debate me**, 😈 **Devil's Advocate**, ✨ **Gen-Z Converter**, 🎨 image generation, and 🎤 voice in/out.

## 🚀 Quick start

No build step, no dependencies to install.

```bash
git clone https://github.com/YOUR_USERNAME/eureka-ai.git
cd eureka-ai
```

Then just open `index.html` in your browser — or serve it locally (recommended so the mic and service worker work):

```bash
# any one of these
npx serve .
python -m http.server 8080
```

> **Live demo:** fork the repo → Settings → Pages → deploy from `main` branch. Done, free hosting.

## 🔑 Getting an API key

1. Create a free account at [openrouter.ai](https://openrouter.ai)
2. Go to [openrouter.ai/keys](https://openrouter.ai/keys) → **Create key**
3. Paste it into EUREKA on first launch — it's verified instantly

The app ships with several one-click model presets (DeepSeek V3, Llama 3.3 70B, GPT-4o mini, Claude 3.5 Haiku, Gemini 2.0 Flash) — or type **any** OpenRouter model ID. Free models are available, so the whole thing can run at $0.

## 🔒 Privacy

- 🔐 **Your key never leaves your device** except to call OpenRouter directly — it's stored in `localStorage`, never in code, never sent anywhere else
- 📦 **Local-first storage** — conversations, decks, quiz scores and notes live in your browser, per account
- 🛡️ **Hardened by default** — responses are sanitized against XSS, passwords are salted + hashed (SHA-256), streaming is aborted client-side when you hit stop
- 🚫 **No analytics, no cookies, no telemetry**

> Browser-based storage means clearing site data wipes accounts. Export chats (📝 Markdown / 📄 TXT) from the topbar to keep backups.

## 🧩 Features at a glance

- ⚡ **Streaming responses** with a blinking caret — and a **Stop** button mid-generation
- 🔁 **Regenerate** any answer, with automatic model fallback if one fails
- 🔍 **Search** across all conversations (`Ctrl/⌘ + K`)
- 📎 **File understanding** — attach code, text, JSON, CSV
- 📝 **Scratch pad** with font/size options
- 📤 **Export** chats as Markdown or plain text
- ⌨️ **Shortcuts** — `⌘K` search, `⌘⇧O` new chat, `Esc` closes modals
- 📱 **Installable PWA** — works offline after first load
- 🌙 Sleek dark UI, fully responsive down to phones

## 🛠️ Tech stack

- **Frontend:** Vanilla HTML + CSS + JavaScript — zero frameworks, zero build tools
- **AI:** [OpenRouter](https://openrouter.ai) API (BYOK, streaming via SSE)
- **Markdown:** [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify)
- **Images:** [Pollinations.ai](https://pollinations.ai) (free, keyless)
- **Icons/font:** inline SVG + Google Fonts (Plus Jakarta Sans, Fira Code)

```
eureka-ai/
├── index.html      # single-page app shell
├── style.css       # all styling (dark theme, responsive)
├── script.js       # core: chat, auth, streaming, tools, PWA
├── study.js        # study suite: tutor, flashcards, quiz, planner, timer
├── manifest.json   # PWA manifest
└── icon.svg        # app icon
```

## 🗺️ Roadmap

- [ ] Study dashboard (mastery %, quiz average, weekly focus stats)
- [ ] Spaced repetition for flashcards
- [ ] PDF / slide upload as a source
- [ ] Light theme
- [ ] Multi-language UI

## 🤝 Contributing

PRs are welcome! Since there's no build step, contributing is easy: fork → edit → open a PR. Please keep the vanilla-JS, no-dependency philosophy.

## 📄 License

MIT — do whatever you like, attribution appreciated.

---

<div align="center">

**Built with 💜 and vanilla JavaScript**

⭐ Star the repo if EUREKA helped you pass an exam!

</div>
