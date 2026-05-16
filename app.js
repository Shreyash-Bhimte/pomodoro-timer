/* ============================================================
   POMODORO TIMER — app.js
   Commit 5: Timer logic — countdown, start/pause/reset, display
   Commit 6: Tab title + mode switching
   Commit 7: Pomodoro counter + auto long break
   Commit 8: Web Audio API beep
   Commit 9: Custom durations + localStorage
   ============================================================ */


/* ── 1. STATE MACHINE CONSTANTS ──────────────────────────────── */

const STATE = {
  IDLE:     'idle',
  RUNNING:  'running',
  PAUSED:   'paused',
  FINISHED: 'finished',
};

const MODE = {
  WORK:        'work',
  SHORT_BREAK: 'short-break',
  LONG_BREAK:  'long-break',
};


/* ── 2. APP STATE ────────────────────────────────────────────── */

const app = {
  // Timer state machine
  timerState: STATE.IDLE,
  mode:       MODE.WORK,

  // Durations in seconds (defaults — overridden by localStorage in Commit 9)
  durations: {
    [MODE.WORK]:        25 * 60,
    [MODE.SHORT_BREAK]:  5 * 60,
    [MODE.LONG_BREAK]:  15 * 60,
  },

  // Countdown tracking
  secondsLeft:  25 * 60,
  startTime:    null,     // Date.now() snapshot when timer started/resumed
  startSeconds: null,     // secondsLeft value at the moment of start/resume

  // Interval handle
  intervalId: null,

  // Session tracking (Commit 7)
  pomodorosCompleted: 0,
};


/* ── 3. DOM REFERENCES ───────────────────────────────────────── */

const els = {
  timerDisplay:      document.getElementById('timerDisplay'),
  modeLabel:         document.getElementById('modeLabel'),
  startPauseBtn:     document.getElementById('startPauseBtn'),
  resetBtn:          document.getElementById('resetBtn'),
  sessionDots:       document.getElementById('sessionDots'),
  workDuration:      document.getElementById('workDuration'),
  shortBreakDuration:document.getElementById('shortBreakDuration'),
  longBreakDuration: document.getElementById('longBreakDuration'),
  applySettingsBtn:  document.getElementById('applySettingsBtn'),
};


/* ── 4. FORMAT HELPERS ───────────────────────────────────────── */

function formatTime(totalSeconds) {
  // Clamp to zero — elapsed calc can occasionally produce -1 on slow ticks
  const s = Math.max(0, totalSeconds);
  const mins = Math.floor(s / 60).toString().padStart(2, '0');
  const secs = (s % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function getModeName(mode) {
  return {
    [MODE.WORK]:        'Work',
    [MODE.SHORT_BREAK]: 'Short Break',
    [MODE.LONG_BREAK]:  'Long Break',
  }[mode];
}

/* ── LOCALSTORAGE ────────────────────────────────────────────── */

const STORAGE_KEY = 'pomodoro-durations';

function saveDurations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.durations));
}

function loadDurations() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return; // no saved prefs yet — keep defaults

  try {
    const parsed = JSON.parse(saved);
    // Validate each value — guard against corrupted storage
    if (parsed[MODE.WORK]        > 0) app.durations[MODE.WORK]        = parsed[MODE.WORK];
    if (parsed[MODE.SHORT_BREAK] > 0) app.durations[MODE.SHORT_BREAK] = parsed[MODE.SHORT_BREAK];
    if (parsed[MODE.LONG_BREAK]  > 0) app.durations[MODE.LONG_BREAK]  = parsed[MODE.LONG_BREAK];
  } catch {
    // Corrupted JSON — silently ignore, keep defaults
  }
}

/* ── AUDIO ───────────────────────────────────────────────────── */

function playBeep() {
  // AudioContext must be created in response to a user gesture.
  // By the time this runs, the user has already clicked Start —
  // so we're safe. We create a fresh context each time; it's
  // lightweight and avoids managing context lifecycle.
  const ctx        = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain       = ctx.createGain();

  // Wire the signal chain: oscillator → gain → speakers
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  // Tone character — sine wave at 660 Hz (soft, clear, not harsh)
  oscillator.type      = 'sine';
  oscillator.frequency.value = 660;

  // Envelope — schedule gain changes on the audio clock, not JS clock
  // ctx.currentTime is the audio context's own high-precision timestamp
  const now     = ctx.currentTime;
  const fadeIn  = 0.01;   // 10ms ramp up — avoids click
  const hold    = 0.25;   // 250ms at full volume
  const fadeOut = 0.15;   // 150ms ramp down — soft tail

  gain.gain.setValueAtTime(0, now);                          // start at silence
  gain.gain.linearRampToValueAtTime(0.4, now + fadeIn);     // ramp to 40% volume
  gain.gain.setValueAtTime(0.4, now + fadeIn + hold);        // hold
  gain.gain.linearRampToValueAtTime(0, now + fadeIn + hold + fadeOut); // fade out

  // Start and stop the oscillator on the same audio timeline
  oscillator.start(now);
  oscillator.stop(now + fadeIn + hold + fadeOut + 0.05);    // tiny buffer after fade

  // Clean up — close the context after the sound is done
  oscillator.onended = () => ctx.close();
}

/* ── 5. RENDER ───────────────────────────────────────────────── */
/*
  Single render function — one call updates everything visual.
  This is the "render pattern" you learned in the Todo app, applied here.
  State lives in `app`. DOM is just a reflection of that state.
*/

function render() {
  // Timer display
  els.timerDisplay.textContent = formatTime(app.secondsLeft);

  // Mode label
  els.modeLabel.textContent = getModeName(app.mode);

  // Start/Pause button label
  els.startPauseBtn.textContent =
    app.timerState === STATE.RUNNING ? 'Pause' :
    app.timerState === STATE.PAUSED  ? 'Resume' :
    'Start';

  // Body data attributes — drives ALL CSS (theme + state visibility)
  document.body.dataset.state = app.timerState;
  document.body.dataset.mode  = app.mode;

   // ── TAB TITLE (new) ──────────────────────────────────────────
  document.title = `${formatTime(app.secondsLeft)} — ${getModeName(app.mode)}`;

  // ── SESSION DOTS ─────────────────────────────────────────────
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('active', i < app.pomodorosCompleted);
  });
}


/* ── 6. TIMER CORE ───────────────────────────────────────────── */

function tick() {
  // Measure real elapsed time against wall clock — not tick count
  const elapsed = Math.floor((Date.now() - app.startTime) / 1000);
  app.secondsLeft = app.startSeconds - elapsed;

  if (app.secondsLeft <= 0) {
    app.secondsLeft = 0;
    render();
    handleSessionEnd();
    return;
  }

  render();
}

function startTimer() {
  if (app.timerState === STATE.RUNNING) return; // guard against double-start

  // Snapshot the wall clock and current seconds at the moment of start/resume
  app.startTime    = Date.now();
  app.startSeconds = app.secondsLeft;

  app.timerState = STATE.RUNNING;

  // 500ms interval — catches drift fast, never visually skips a second
  app.intervalId = setInterval(tick, 500);

  render();
}

function pauseTimer() {
  if (app.timerState !== STATE.RUNNING) return;

  clearInterval(app.intervalId);
  app.intervalId = null;
  app.timerState = STATE.PAUSED;
  // secondsLeft is already accurate from last tick — no adjustment needed

  render();
}

function resetTimer() {
  clearInterval(app.intervalId);
  app.intervalId   = null;
  app.timerState   = STATE.IDLE;
  app.pomodorosCompleted = 0; 
  app.secondsLeft  = app.durations[app.mode];
  app.startTime    = null;
  app.startSeconds = null;

  render();
}

function switchMode() {
  if (app.mode === MODE.WORK) {
    // Increment counter — work session just completed
    app.pomodorosCompleted++;

    // After 4 work sessions → long break, then reset counter
    if (app.pomodorosCompleted >= 4) {
      app.mode = MODE.LONG_BREAK;
      app.pomodorosCompleted = 0;
    } else {
      app.mode = MODE.SHORT_BREAK;
    }
  } else {
    // Any break ended → back to work
    app.mode = MODE.WORK;
  }

  app.secondsLeft = app.durations[app.mode];
}

function handleSessionEnd() {
  clearInterval(app.intervalId);
  app.intervalId = null;
  app.timerState = STATE.FINISHED;

  playBeep(); // Play a sound to indicate session end
  
  render(); // flash the 00:00 state briefly

  setTimeout(() => {
    switchMode();                   // transition to next mode
    app.timerState = STATE.IDLE;    // land in idle, ready to start
    render();
  }, 1500);
}

/* ── SETTINGS HANDLER ────────────────────────────────────────── */

function applySettings() {
  // Read input values — convert minutes to seconds
  const newWork       = parseInt(els.workDuration.value, 10);
  const newShortBreak = parseInt(els.shortBreakDuration.value, 10);
  const newLongBreak  = parseInt(els.longBreakDuration.value, 10);

  // Validate — inputs have min/max in HTML but parseInt can still produce NaN
  if (!newWork || !newShortBreak || !newLongBreak) return;

  app.durations[MODE.WORK]        = newWork        * 60;
  app.durations[MODE.SHORT_BREAK] = newShortBreak  * 60;
  app.durations[MODE.LONG_BREAK]  = newLongBreak   * 60;

  saveDurations();
  document.getElementById('settingsPanel').removeAttribute('open'); // close panel

  // Only update display if timer is idle — don't interrupt active session
  if (app.timerState === STATE.IDLE) {
    app.secondsLeft = app.durations[app.mode];
    render();
  }
}

els.applySettingsBtn.addEventListener('click', applySettings);

/* ── 7. CONTROLS ─────────────────────────────────────────────── */

els.startPauseBtn.addEventListener('click', () => {
  if (app.timerState === STATE.RUNNING) {
    pauseTimer();
  } else {
    startTimer(); // covers IDLE and PAUSED
  }
});

els.resetBtn.addEventListener('click', resetTimer);

/* ── KEYBOARD SHORTCUT ───────────────────────────────────────── */

document.addEventListener('keydown', (e) => {
  // Spacebar — start or pause, but not when user is typing in settings inputs
  if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
    e.preventDefault(); // prevent page scroll on spacebar
    els.startPauseBtn.click();
  }
});

/* ── 8. INIT ─────────────────────────────────────────────────── */

function init() {
  // Load saved durations from localStorage (if any)
  loadDurations();

  // Sync secondsLeft to the (possibly loaded) work duration
  app.secondsLeft = app.durations[app.mode];

  // Sync input fields to match loaded values — so settings panel
  // shows the actual current durations, not hardcoded HTML defaults
  els.workDuration.value       = app.durations[MODE.WORK]        / 60;
  els.shortBreakDuration.value = app.durations[MODE.SHORT_BREAK] / 60;
  els.longBreakDuration.value  = app.durations[MODE.LONG_BREAK]  / 60;

  render();
}

init();