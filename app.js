(() => {
  const $ = (id) => document.getElementById(id);

  /* ---------- Elements ---------- */
  const screenSetup = $("screenSetup");
  const screenReady = $("screenReady");
  const screenRun   = $("screenRun");

  const totalTimeEl = $("totalTime");
  const btnStart    = $("btnStart");

  const workSecEl     = $("workSec");
  const restSecEl     = $("restSec");
  const exercisesEl   = $("exercises");
  const roundsEl      = $("rounds");
  const roundResetEl  = $("roundResetSec");

  const pauseOnBlurEl = $("pauseOnBlur");

  const readyTimeEl = $("readyTime");
  const readyRing   = $("readyRing");

  const phaseTitle  = $("phaseTitle");
  const ringLabel   = $("ringLabel");
  const runTimeEl   = $("runTime");
  const runRing     = $("runRing");
  const remainingTotalEl = $("remainingTotal");

  const dotsExercise = $("dotsExercise");
  const dotsRound    = $("dotsRound");

  const btnPauseReady = $("btnPauseReady");
  const btnSkipReady  = $("btnSkipReady");
  const btnPauseRun   = $("btnPauseRun");
  const btnSkipRun    = $("btnSkipRun");

  const btnSound  = $("btnSound");
  const btnSound2 = $("btnSound2");

  /* ---------- Settings ---------- */
  const READY_SECONDS = 10;

  /* ---------- State ---------- */
  let voiceOn = true;
  let pauseOnBlur = false;

  let timeline = [];
  let index = 0;
  let remaining = 0;
  let totalRemaining = 0;
  let timer = null;
  let paused = false;

  let spoken = new Set();
  let warned30 = false;

  // Wake Lock
  let wakeLock = null;

  // Audio context reuse (beep)
  let audioCtx = null;

  /* ---------- Helpers ---------- */
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  };

  function showScreen(el) {
    [screenSetup, screenReady, screenRun].forEach(s => s.classList.remove("screen--active"));
    el.classList.add("screen--active");
  }

  function speak(text) {
    if (!voiceOn) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function warmUpVoice() {
    try {
      const u = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    } catch {}
  }

  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume?.();
    } catch {}
  }

  function play30Beep() {
    try {
      ensureAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sawtooth";
      osc.frequency.value = 880;
      gain.gain.value = 0.6;

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      setTimeout(() => {
        try { osc.stop(); } catch {}
      }, 600);
    } catch {}
  }

  async function requestWakeLock() {
    try {
      if (!("wakeLock" in navigator)) return;
      wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLock) await wakeLock.release();
    } catch {}
    wakeLock = null;
  }

  function updateRing(ringEl, total, left) {
    const C = 314;
    const pct = total > 0 ? (left / total) : 0;
    ringEl.style.strokeDashoffset = C * (1 - pct);
  }

  function updateDots(el, current, total) {
    el.innerHTML = "";
    for (let i=1; i<=total; i++){
      const d = document.createElement("div");
      d.className = "dot" + (i===current ? " on":"");
      el.appendChild(d);
    }
  }

  function buildTimeline() {
    timeline = [];
    const work   = +workSecEl.value;
    const rest   = +restSecEl.value;
    const ex     = +exercisesEl.value;
    const rounds = +roundsEl.value;
    const reset  = +roundResetEl.value;

    timeline.push({ type:"READY", seconds: READY_SECONDS });

    for (let r=1; r<=rounds; r++) {
      for (let e=1; e<=ex; e++) {
        timeline.push({ type:"WORK", seconds: work, round:r, exercise:e });

        if (rest > 0 && e < ex) {
          timeline.push({ type:"REST", seconds: rest, round:r, exercise:e });
        }
      }
      if (reset > 0 && r < rounds) {
        timeline.push({ type:"RESET", seconds: reset, round:r });
      }
    }
  }

  function calcTotal() {
    totalRemaining = timeline.reduce((a,b)=>a+b.seconds,0);
    totalTimeEl.textContent = fmt(totalRemaining);
  }

  function setPhaseUI(item) {
    document.body.className = "";
    document.body.classList.add(item.type.toLowerCase());

    if (item.type === "READY") {
      readyTimeEl.textContent = fmt(remaining);
      updateRing(readyRing, item.seconds, remaining);
      showScreen(screenReady);
      return;
    }

    showScreen(screenRun);
    phaseTitle.textContent = item.type;
    ringLabel.textContent  = item.type;
    runTimeEl.textContent  = fmt(remaining);

    if (item.round) updateDots(dotsRound, item.round, +roundsEl.value);
    if (item.exercise) updateDots(dotsExercise, item.exercise, +exercisesEl.value);

    remainingTotalEl.textContent = fmt(totalRemaining);
  }

  function startItem() {
    const item = timeline[index];
    remaining = item.seconds;

    spoken.clear();
    warned30 = false;

    setPhaseUI(item);
  }

  function finishAll() {
    stop();
    showScreen(screenSetup);
    remainingTotalEl.textContent = "🎉 COMPLETE!";
    document.body.className = "";
  }

  function tick() {
    if (paused) return;

    remaining--;
    totalRemaining--;
    remainingTotalEl.textContent = fmt(Math.max(totalRemaining, 0));

    const item = timeline[index];

    // 30-second beep once per item (skip READY)
    if (item && item.type !== "READY" && remaining === 30 && !warned30) {
      warned30 = true;
      play30Beep();
    }

    // 3,2,1 voice
    if (remaining <= 3 && remaining > 0 && !spoken.has(remaining)) {
      spoken.add(remaining);
      if (remaining === 3) speak("Three");
      if (remaining === 2) speak("Two");
      if (remaining === 1) speak("One");
    }

    // move to next item
    if (remaining <= 0) {
      index++;
      if (index >= timeline.length) {
        finishAll();
        return;
      }
      startItem();
      return;
    }

    // update UI
    if (item.type === "READY") {
      readyTimeEl.textContent = fmt(remaining);
      updateRing(readyRing, item.seconds, remaining);
    } else {
      runTimeEl.textContent = fmt(remaining);
      updateRing(runRing, item.seconds, remaining);
    }
  }

  function start() {
    // unlock speech + audio on user gesture
    warmUpVoice();
    ensureAudio();

    buildTimeline();
    calcTotal();

    index = 0;
    paused = false;

    startItem();
    requestWakeLock();

    timer = setInterval(tick, 1000);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    releaseWakeLock();
  }

  /* ---------- Events ---------- */
  btnStart.onclick = () => start();

  btnPauseReady.onclick = btnPauseRun.onclick = () => {
    paused = !paused;
  };

  btnSkipReady.onclick = btnSkipRun.onclick = () => {
    remaining = 0;
  };

  btnSound.onclick = btnSound2.onclick = () => {
    voiceOn = !voiceOn;
    btnSound.textContent = btnSound2.textContent = voiceOn ? "🔊" : "🔇";
    if (voiceOn) {
      warmUpVoice();
      ensureAudio();
    }
  };

  pauseOnBlurEl.onchange = () => {
    pauseOnBlur = pauseOnBlurEl.checked;
  };

  document.addEventListener("visibilitychange", () => {
    // some browsers drop wake lock; reacquire when visible again
    if (!document.hidden && timer) requestWakeLock();
    if (pauseOnBlur && document.hidden) paused = true;
  });

  /* ---------- Init ---------- */
  showScreen(screenSetup);
})();
