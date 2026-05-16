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


/* ── 7. CONTROLS ─────────────────────────────────────────────── */

els.startPauseBtn.addEventListener('click', () => {
  if (app.timerState === STATE.RUNNING) {
    pauseTimer();
  } else {
    startTimer(); // covers IDLE and PAUSED
  }
});

els.resetBtn.addEventListener('click', resetTimer);


/* ── 8. INIT ─────────────────────────────────────────────────── */

render(); // draw initial state on page load