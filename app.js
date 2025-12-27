(() => {
  const $ = (id) => document.getElementById(id);

  /* ---------- Elements ---------- */
  const screenSetup = $("screenSetup");
  const screenReady = $("screenReady");
  const screenRun   = $("screenRun");

  const totalTimeEl = $("totalTime");
  const btnStart    = $("btnStart");

  const workSecEl   = $("workSec");
  const restSecEl   = $("restSec");
  const exercisesEl= $("exercises");
  const roundsEl   = $("rounds");
  const roundResetEl = $("roundResetSec");

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
  let voiceOn = true;
  let pauseOnBlur = false;

  /* ---------- State ---------- */
  let timeline = [];
  let index = 0;
  let warned30 = false;
  let remaining = 0;
  let totalRemaining = 0;
  let timer = null;
  // Keep screen awake (where supported)
let wakeLock = null;

async function requestWakeLock() {
  try {
    if (!("wakeLock" in navigator)) return;
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } catch {}
  wakeLock = null;
}
  let paused = false;
  let spoken = new Set();
  // 30-second warning sound
let audioCtx = null;
let warned30 = false;

function play30Beep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sawtooth";   // 강한 소리
    osc.frequency.value = 880;
    gain.gain.value = 0.6;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    setTimeout(() => osc.stop(), 600);
  } catch {}
}

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

  function buildTimeline() {
    timeline = [];
    const work = +workSecEl.value;
    const rest = +restSecEl.value;
    const ex   = +exercisesEl.value;
    const rounds = +roundsEl.value;
    const reset = +roundResetEl.value;

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

  function updateDots(el, current, total) {
    el.innerHTML = "";
    for (let i=1;i<=total;i++){
      const d = document.createElement("div");
      d.className = "dot" + (i===current ? " on":"");
      el.appendChild(d);
    }
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
    ringLabel.textContent = item.type;
    runTimeEl.textContent = fmt(remaining);

    if (item.round) {
      updateDots(dotsRound, item.round, +roundsEl.value);
    }
    if (item.exercise) {
      updateDots(dotsExercise, item.exercise, +exercisesEl.value);
    }
  }

  function updateRing(ringEl, total, left) {
    const C = 314;
    const pct = left / total;
    ringEl.style.strokeDashoffset = C * (1 - pct);
  }

  function tick() {
    if (paused) return;

    remaining--;
    totalRemaining--;
    remainingTotalEl.textContent = fmt(totalRemaining);
    // 30초 남았을 때 한 번만 알림음
if (remaining === 30 && !warned30) {
  warned30 = true;
  playBeep();
}

    if (remaining <= 3 && remaining > 0 && !spoken.has(remaining)) {
      spoken.add(remaining);
      if (remaining === 3) speak("Three");
      if (remaining === 2) speak("Two");
      if (remaining === 1) speak("One");
    }

    if (remaining <= 0) {
      index++;
      spoken.clear();
      if (index >= timeline.length) {
  stop();
  showScreen(screenSetup);

  remainingTotalEl.textContent = "🎉 COMPLETE!";

  document.body.className = "";
  return;
}
      startItem();
      return;
    }

    const item = timeline[index];
    if (item.type === "READY") {
      readyTimeEl.textContent = fmt(remaining);
      updateRing(readyRing, item.seconds, remaining);
    } else {
      runTimeEl.textContent = fmt(remaining);
      updateRing(runRing, item.seconds, remaining);
    }
  }

  function startItem() {
    const item = timeline[index];
    remaining = item.seconds;
    setPhaseUI(item);
    remainingTotalEl.textContent = fmt(totalRemaining);
  }

  function start() {
    warmUpVoice();
    buildTimeline();
    calcTotal();
    index = 0;
    spoken.clear();
    warned30 = false;
    paused = false;
    startItem();
    
    requestWakeLock();
    
    timer = setInterval(tick, 1000);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    
    releaseWakeLock();
  }

function playBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "square";
  osc.frequency.value = 1000;
  gain.gain.value = 0.6;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  setTimeout(() => osc.stop(), 500);
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
  };

  pauseOnBlurEl.onchange = () => {
    pauseOnBlur = pauseOnBlurEl.checked;
  };

  document.addEventListener("visibilitychange", () => {
    if (pauseOnBlur && document.hidden) paused = true;
  });

  /* ---------- Init ---------- */
  showScreen(screenSetup);
})();
