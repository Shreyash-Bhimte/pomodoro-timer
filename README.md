# Pomodoro Timer

A minimal, distraction-free Pomodoro timer. No frameworks, no dependencies,
no audio files — just HTML, CSS, and vanilla JavaScript.

**Live demo:** https://shreyash-bhimte.github.io/pomodoro-timer

---

## Features

- 25 / 5 / 15 minute work and break cycle
- Auto-switches mode when session ends
- Long break automatically triggered after every 4 Pomodoros
- Session progress shown as four fillable dots
- Soft beep on session end — generated with Web Audio API, no audio file
- Browser tab title updates live: `24:59 — Work`
- Warm → cool colour theme switches automatically with mode
- Custom durations saved to localStorage — persist across sessions
- Spacebar shortcut to start / pause
- Mobile responsive

## What I learned building this

- **`setInterval` drift** — naive tick-counting drifts over time; solution
  is to snapshot `Date.now()` on start and measure elapsed time on each tick
- **State machines** — modelling timer states (`idle` / `running` / `paused`
  / `finished`) explicitly instead of scattered boolean flags
- **CSS variables + data attributes** — one `body[data-mode]` change updates
  the entire colour theme via the cascade, no JS touching individual elements
- **Web Audio API** — `AudioContext → OscillatorNode → GainNode → destination`
  chain; gain envelope to avoid click/pop artefacts
- **`document.title`** — simple but effective background-tab UX

## Tech

Pure HTML · CSS Variables · Vanilla JS · Web Audio API · localStorage · GitHub Pages


| Project | Live | Concepts |
|---|---|---|
| Weather App | https://shreyash-bhimte.github.io/weather-app | fetch API, async/await, DOM manipulation |
| Todo App | (your live URL here) | state management, render pattern, localStorage, event delegation |
| Pomodoro Timer | https://shreyash-bhimte.github.io/pomodoro-timer | setInterval, state machines, Web Audio API, CSS variables |