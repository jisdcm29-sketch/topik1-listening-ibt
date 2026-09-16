// Step24M: 문항 선택 연습 - 이동 후 수동 계속 듣기 안정화
(function () {
  "use strict";

  function $(selector) { return document.querySelector(selector); }

  function isTestVisible() {
    const screen = $("#test-screen");
    return !!screen && !screen.hidden;
  }

  function isQuestionPracticeMode() {
    if (!isTestVisible()) return false;
    const title = String($("#test-header-title")?.textContent || "").trim();
    if (title.includes("선택 문항 연습") || title.includes("문항 선택 연습")) return true;
    return !!$("#audio-start-btn.pause-enabled");
  }

  function getAudio() { return $("#exam-audio"); }
  function getProgress() { return $(".audio-progress"); }
  function getSourceKey(audio) { return String(audio?.currentSrc || audio?.src || ""); }

  function durationOf(audio) {
    const value = Number(audio?.duration || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function safeTarget(audio, value) {
    const duration = durationOf(audio);
    const n = Number(value);
    if (!duration || !Number.isFinite(n)) return null;
    return Math.max(0, Math.min(Math.max(0, duration - 0.25), n));
  }

  function targetFromClientX(clientX) {
    const audio = getAudio();
    const progress = getProgress();
    if (!audio || !progress || !isQuestionPracticeMode()) return null;

    const duration = durationOf(audio);
    const rect = progress.getBoundingClientRect();
    if (!duration || !rect.width) return null;

    const ratio = Math.max(0, Math.min(1, (Number(clientX) - rect.left) / rect.width));
    return safeTarget(audio, duration * ratio);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function paintTarget(target) {
    const audio = getAudio();
    const progress = getProgress();
    if (!audio || !progress) return;

    const duration = durationOf(audio);
    const safe = safeTarget(audio, target);
    if (!duration || safe === null) return;

    const fill = $("#audio-progress-fill");
    const current = $("#audio-current-time");

    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (safe / duration) * 100))}%`;
    if (current) current.textContent = formatTime(safe);

    progress.setAttribute("aria-valuemax", String(Math.round(duration)));
    progress.setAttribute("aria-valuenow", String(Math.round(safe)));
    progress.setAttribute("aria-valuetext", `${formatTime(safe)} / ${formatTime(duration)}`);
  }

  const state = {
    dragging: false,
    pointerId: null,
    target: null,
    heldTarget: null,
    sourceKey: "",
    settleTimers: []
  };

  function clearSettleTimers() {
    state.settleTimers.forEach((timer) => window.clearTimeout(timer));
    state.settleTimers = [];
  }

  function clearHeldTarget() {
    clearSettleTimers();
    state.dragging = false;
    state.pointerId = null;
    state.target = null;
    state.heldTarget = null;
    state.sourceKey = "";
    getProgress()?.classList.remove("practice-seek-waiting");
  }

  function writeTarget(audio, target) {
    const safe = safeTarget(audio, target);
    if (!audio || safe === null) return false;

    try {
      audio.preload = "auto";
      audio.setAttribute("preload", "auto");
      audio.currentTime = safe;
      paintTarget(safe);
      return true;
    } catch (error) {
      console.warn("[Step24M] currentTime write failed:", error);
      return false;
    }
  }

  function pauseForManualSeek(audio) {
    try {
      if (typeof AudioController !== "undefined" &&
          typeof AudioController.pauseForPractice === "function") {
        const ok = AudioController.pauseForPractice();
        if (ok) return true;
      }
    } catch (error) {
      console.warn("[Step24M] AudioController pause failed:", error);
    }

    try {
      audio.pause();
      return true;
    } catch (error) {
      console.warn("[Step24M] native pause failed:", error);
      return false;
    }
  }

  function schedulePausedSettle(audio, target, sourceAtStart) {
    clearSettleTimers();

    [100, 360, 900, 1600].forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (!isQuestionPracticeMode()) return;
        if (state.heldTarget === null) return;
        if (getSourceKey(audio) !== sourceAtStart) return;
        if (!audio.paused || audio.ended) return;

        const current = Number(audio.currentTime || 0);
        const far = !Number.isFinite(current) || Math.abs(current - target) > 0.75;

        if (far && !audio.seeking) writeTarget(audio, target);
        else paintTarget(target);
      }, delay);

      state.settleTimers.push(timer);
    });
  }

  function commitPausedSeek(target) {
    const audio = getAudio();
    if (!audio || !isQuestionPracticeMode()) return;

    const safe = safeTarget(audio, target);
    if (safe === null) return;

    pauseForManualSeek(audio);

    state.heldTarget = safe;
    state.sourceKey = getSourceKey(audio);
    getProgress()?.classList.add("practice-seek-waiting");

    writeTarget(audio, safe);
    schedulePausedSettle(audio, safe, state.sourceKey);
  }

  function beginPointerSeek(event) {
    if (!isQuestionPracticeMode()) return;
    if (event.button !== undefined && event.button !== 0) return;

    const audio = getAudio();
    const progress = getProgress();
    if (!audio || !progress) return;

    const target = targetFromClientX(event.clientX);
    if (target === null) return;

    event.preventDefault();

    clearSettleTimers();
    state.dragging = true;
    state.pointerId = event.pointerId ?? null;
    state.target = target;

    pauseForManualSeek(audio);
    paintTarget(target);

    try { progress.setPointerCapture?.(event.pointerId); } catch {}
  }

  function updatePointerSeek(event) {
    if (!state.dragging || !isQuestionPracticeMode()) return;
    if (state.pointerId !== null &&
        event.pointerId !== undefined &&
        event.pointerId !== state.pointerId) return;

    const target = targetFromClientX(event.clientX);
    if (target === null) return;

    event.preventDefault();
    state.target = target;
    paintTarget(target);
  }

  function finishPointerSeek(event) {
    if (!state.dragging || !isQuestionPracticeMode()) return;

    const progress = getProgress();
    try { progress?.releasePointerCapture?.(event.pointerId); } catch {}

    const target = state.target;
    state.dragging = false;
    state.pointerId = null;
    state.target = null;

    if (target === null) return;
    commitPausedSeek(target);
  }

  function cancelPointerSeek() {
    if (!state.dragging) return;
    state.dragging = false;
    state.pointerId = null;
    state.target = null;
  }

  function keyboardSeek(event) {
    if (!isQuestionPracticeMode()) return;

    const audio = getAudio();
    const progress = getProgress();
    if (!audio || !progress || document.activeElement !== progress) return;

    const duration = durationOf(audio);
    if (!duration) return;

    const step = event.shiftKey ? 10 : 5;
    const current = Number(audio.currentTime || 0);
    let target = null;

    if (event.key === "ArrowLeft") target = current - step;
    else if (event.key === "ArrowRight") target = current + step;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = duration - 0.25;
    else return;

    event.preventDefault();

    const safe = safeTarget(audio, target);
    if (safe === null) return;

    paintTarget(safe);
    commitPausedSeek(safe);
  }

  function reassertBeforeContinue(event) {
    if (!isQuestionPracticeMode() || state.heldTarget === null) return;

    const eventTarget = event?.target;
    const el = eventTarget && eventTarget.nodeType === 1
      ? eventTarget
      : eventTarget?.parentElement;

    const button = el?.closest?.("#audio-start-btn.pause-enabled");
    if (!button || button.disabled) return;

    const audio = getAudio();
    if (!audio || !audio.paused || audio.ended) return;

    if (state.sourceKey && getSourceKey(audio) !== state.sourceKey) {
      clearHeldTarget();
      return;
    }

    // 이벤트를 막지 않는다. 목표 위치만 다시 확정하고,
    // 기존 AudioController가 같은 클릭에서 play()를 실행하게 한다.
    writeTarget(audio, state.heldTarget);
  }

  function handlePlaybackProgress() {
    const audio = getAudio();
    if (!audio || state.heldTarget === null || !isQuestionPracticeMode()) return;

    if (state.sourceKey && getSourceKey(audio) !== state.sourceKey) {
      clearHeldTarget();
      return;
    }

    if (!audio.paused && !audio.ended) {
      const current = Number(audio.currentTime || 0);
      if (Number.isFinite(current) && current >= state.heldTarget - 0.60) {
        clearSettleTimers();
        state.heldTarget = null;
        getProgress()?.classList.remove("practice-seek-waiting");
      }
    } else {
      paintTarget(state.heldTarget);
    }
  }

  function resetForNewAudio() { clearHeldTarget(); }

  function bind() {
    const progress = getProgress();
    const audio = getAudio();
    if (!progress || !audio) return;

    progress.addEventListener("pointerdown", beginPointerSeek);
    progress.addEventListener("pointermove", updatePointerSeek);
    progress.addEventListener("pointerup", finishPointerSeek);
    progress.addEventListener("pointercancel", cancelPointerSeek);
    progress.addEventListener("keydown", keyboardSeek);

    document.addEventListener("click", reassertBeforeContinue, true);

    ["seeked", "timeupdate", "playing"].forEach((eventName) => {
      audio.addEventListener(eventName, handlePlaybackProgress);
    });

    ["loadstart", "emptied", "ended", "error"].forEach((eventName) => {
      audio.addEventListener(eventName, resetForNewAudio);
    });

    ["#dev-prev-btn", "#dev-next-btn"].forEach((selector) => {
      $(selector)?.addEventListener("click", resetForNewAudio, true);
    });

    window.addEventListener("pagehide", resetForNewAudio);
  }

  function init() { bind(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
