// Interval Timer Logic
(() => {
  const $ = id => document.getElementById(id);

  const bigTime = $("bigTime");
  const subLine = $("subLine");
  const btnPlay = $("btnPlay");
  const playIcon = $("playIcon");
  const btnResetAll = $("btnResetAll");
  const btnMute = $("btnMute");

  const valWork = $("valWork");
  const valRest = $("valRest");
  const valEx = $("valEx");
  const valRounds = $("valRounds");
  const valReset = $("valReset");

  let settings = {
    work: 60,
    rest: 0,
    exercises: 5,
    rounds: 6,
    roundReset: 45
  };

  let running = false;
  let muted = false;
  let phase = "WORK";
  let round = 1;
  let exercise = 1;
  let remaining = settings.work;
  let timer = null;

  const fmt = s => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  function updateUI() {
    bigTime.textContent = fmt(remaining);
    subLine.textContent = `${phase} | Round ${round}/${settings.rounds} | Ex ${exercise}/${settings.exercises}`;
  }

  function beep() {
    if (muted) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 150);
  }

  function nextPhase() {
    beep();

    if (phase === "WORK") {
      if (settings.rest > 0) {
        phase = "REST";
        remaining = settings.rest;
      } else {
        nextExercise();
      }
    } else if (phase === "REST") {
      nextExercise();
    } else if (phase === "RESET") {
      round++;
      exercise = 1;
      phase = "WORK";
      remaining = settings.work;
    }
  }

  function nextExercise() {
    if (exercise < settings.exercises) {
      exercise++;
      phase = "WORK";
      remaining = settings.work;
    } else if (round < settings.rounds) {
      phase = "RESET";
      remaining = settings.roundReset;
    } else {
      stop();
      phase = "DONE";
      subLine.textContent = "Done 🎉";
    }
  }

  function tick() {
    if (!running) return;
    remaining--;
    if (remaining <= 0) nextPhase();
    updateUI();
  }

  function start() {
    if (running) return;
    running = true;
    playIcon.textContent = "⏸";
    timer = setInterval(tick, 1000);
  }

  function stop() {
    running = false;
    playIcon.textContent = "▶";
    clearInterval(timer);
  }

  btnPlay.onclick = () => running ? stop() : start();

  btnResetAll.onclick = () => {
    stop();
    phase = "WORK";
    round = 1;
    exercise = 1;
    remaining = settings.work;
    updateUI();
  };

  btnMute.onclick = () => {
    muted = !muted;
    btnMute.textContent = muted ? "Sound: Off" : "Sound: On";
  };

  updateUI();
})();
