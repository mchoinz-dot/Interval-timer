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

  const countOverlay    = $("countOverlay");
  const countOverlayNum = $("countOverlayNum");

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

  let isComplete = false;
  let lastTotalText = "";
  let paused = false;

  let spoken = new Set();
  let warned30 = false;

  // Wake Lock
  let wakeLock = null;

  // Audio
  let audioCtx = null;

  /* ---------- Helpers ---------- */
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  };

  function showScreen(el) {
    [screenSetup, screenReady, screenRun].forEach(s =>
      s.classList.remove("screen--active")
    );
    el.classList.add("screen--active");
  }

  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume?.();
    } catch {}
  }

  function playBeep(freq = 880, duration = 180) {
    try {
      ensureAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.7;

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      setTimeout(() => { try { osc.stop(); } catch {} }, duration);
    } catch {}
  }

  /* ---------- Overlay ---------- */
  function showOverlayNumber(n) {
    if (!countOverlay || !countOverlayNum) return;

    countOverlayNum.classList.remove("count-3","count-2","count-1");
    countOverlayNum.textContent = String(n);
    countOverlayNum.classList.add(`count-${n}`);

    countOverlay.classList.remove("hidden");
  }

  function hideOverlay() {
    if (!countOverlay) return;
    countOverlay.classList.add("hidden");
  }

  /* ---------- Wake Lock ---------- */
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

  /* ---------- Timeline ---------- */
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
    if (isComplete) return;
    totalRemaining = timeline.reduce((a,b)=>a+b.seconds,0);
    const t = fmt(totalRemaining);
    totalTimeEl.textContent = t;
    lastTotalText = t;
  }

  function updateRing(ringEl, total, left) {
    const C = 314;
    const pct = total > 0 ? left / total : 0;
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

  function setPhaseUI(item) {
    document.body.className = item.type.toLowerCase();

    if (item.type === "READY") {
      showScreen(screenReady);
      readyTimeEl.textContent = fmt(remaining);
      updateRing(readyRing, item.seconds, remaining);
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
    hideOverlay();
    setPhaseUI(item);
  }

  function finishAll() {
    stop();
    isComplete = true;
    showScreen(screenSetup);
    totalTimeEl.textContent = "🎉 COMPLETE!";
    document.body.className = "";
  }

  function tick() {
    if (paused) return;

    remaining--;
    totalRemaining--;
    remainingTotalEl.textContent = fmt(Math.max(totalRemaining, 0));

    const item = timeline[index];

    // 30-second warning
    if (item && item.type !== "READY" && remaining === 30 && !warned30) {
      warned30 = true;
      playBeep(600, 400);
    }

    // 3,2,1 beep + overlay (skip RESET)
    if (item && item.type !== "RESET" && remaining <= 3 && remaining > 0 && !spoken.has(remaining)) {
      spoken.add(remaining);
      showOverlayNumber(remaining);
      playBeep(remaining === 1 ? 520 : 720, 180);
      setTimeout(hideOverlay, 220);
    }

    if (remaining <= 0) {
      index++;
      if (index >= timeline.length) {
        finishAll();
        return;
      }
      startItem();
      return;
    }

    if (item.type === "READY") {
      readyTimeEl.textContent = fmt(remaining);
      updateRing(readyRing, item.seconds, remaining);
    } else {
      runTimeEl.textContent = fmt(remaining);
      updateRing(runRing, item.seconds, remaining);
    }
  }

  function start() {
    isComplete = false;
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
  btnStart.onclick = start;

  btnPauseReady.onclick = btnPauseRun.onclick = () => {
    paused = !paused;
  };

  btnSkipReady.onclick = btnSkipRun.onclick = () => {
    remaining = 0;
  };

  btnSound.onclick = btnSound2.onclick = () => {
    voiceOn = !voiceOn;
    btnSound.textContent = btnSound2.textContent = voiceOn ? "🔊" : "🔇";
  };

  pauseOnBlurEl.onchange = () => {
    pauseOnBlur = pauseOnBlurEl.checked;
  };

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && timer) requestWakeLock();
    if (pauseOnBlur && document.hidden) paused = true;
  });

  // COMPLETE 화면 터치 → 원상복구
  document.addEventListener("pointerdown", () => {
    if (!isComplete) return;
    isComplete = false;
    if (lastTotalText) totalTimeEl.textContent = lastTotalText;
    else { buildTimeline(); calcTotal(); }
  });

  /* ---------- Init ---------- */
  showScreen(screenSetup);
})();
