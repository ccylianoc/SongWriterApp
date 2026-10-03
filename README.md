# 🎸 Songwriter Studio

A lightweight, offline-first songwriting app that runs in your browser on **phone and PC**. Write lyrics, add chords and guitar tabs, record melody ideas, and keep every song's key, scale, and tempo — all in one place.

Built with plain HTML, CSS, and JavaScript. No server, no accounts, no install required.

## ✨ Features

- **Lyrics editor** with numbered lines, section labels (`[Verse]`, `[Chorus]`…), and bold/italic
- **Chord support** — insert chords above words, with validation and auto-capitalization
- **Smart paste** — paste chords, tabs, and lyrics from anywhere (Ultimate Guitar, Chordify, etc.) and it converts automatically, keeping chords aligned over the right words
- **Floating chords** — chord-only lines (like intros) render as spaced-out chords
- **Guitar & bass tabs** — insert and edit tab blocks inline
- **Per-project settings** — each song remembers its own **key, scale, and BPM**; new songs default to C major, natural, 100 BPM
- **Scale & chord explorer** — pick any mode/scale and see triads, sevenths, and borrowed chords
- **Transpose** — shift the whole song up or down by semitone
- **Recordings** — record or upload melody ideas right in the editor
- **Viewing mode** — lock lyrics and disable editing for a clean read
- **Print / Save as PDF** — clean layout for printing or sharing
- **Themes** — light, dark, and mono (light/dark) with a custom base color
- **Library** — save multiple songs, open, rename, or delete them
- **Keyboard shortcuts** — remappable (insert tab, add chord, save, bold, italic)
- **PWA-ready** — installable and usable offline

## 🚀 Getting started

1. Clone or download this repo.
2. Open `index.html` in any modern browser — no build step, no dependencies.
3. Start writing!

> **Phone users:** to install it as an app, open the hosted page and choose **"Add to Home Screen"** (or your browser's install option).

## 🖥️ Running locally

Just open `index.html` in your browser. That's it.

To serve it (recommended for the best experience):

```bash
# with Python
python -m http.server

# or with Node
npx serve
```

## 📦 Saving & sharing songs

- **Save** downloads the current song as an `.html` file.
- Friends can open that file in any browser, or send each other their saved files to share projects.
- Your songs are also stored locally in your browser (per device) via `localStorage`.

## 🧩 Project structure

```
├── index.html      # App markup
├── style.css       # Styling & themes
└── main.js         # App logic
```

## 🗺️ Roadmap

- [ ] Cloud sync / account system
- [ ] Song sharing between users
- [ ] Native desktop build (Tauri)
- [ ] Mobile app build (Capacitor)

## 📄 License

**All rights reserved.** This project is shared for personal use among friends only. You may **view and use** the app, but you may **not** copy, modify, distribute, or republish the code without written permission from the author.
