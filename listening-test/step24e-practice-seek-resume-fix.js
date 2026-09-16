// Step24E: 문항 선택 연습 - 일시정지 후 탐색 위치에서 정확히 계속 듣기
// 목적:
// 1) Step23D의 진행 막대 탐색/보기 표시와 Step23F의 짧은 음량 완화는 그대로 둔다.
// 2) 사용자가 일시정지한 뒤 진행 막대를 옮긴 경우, 실제 audio.currentTime을 그 위치에 고정한다.
// 3) [계속 듣기]를 누르면 0초로 돌아가지 않고 마지막 탐색 위치가 확정된 뒤 재생한다.
// 4) 재생 중 탐색이 기존 로직에서 자동 재개되지 못한 경우에도 한 번만 안전하게 보완한다.
// 5) 문항 선택 연습에서만 작동한다. 일반 실전시험/레벨테스트에는 개입하지 않는다.
(function () {
  "use strict";

  const state = {
    dragging: false,
    pointerId: null,
    desiredTime: null,
    wasPlayingBeforeSeek: false,
    heldTime: null,
    sourceKey: "",
    verifyToken: 0,
    resumeToken: 0,
    autoResumeTimer: null,
    repairingPlayback: false,
    lastManualResumeAt: 0
  };

  function $(selector) {
    return document.querySelector(selector);
  }

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

  function getAudio() {
    return $("#exam-audio");
  }

  function getProgress() {
    return $(".audio-progress.practice-seek-enabled") || $(".audio-progress");
  }

  function getSourceKey(audio) {
    return String(audio?.currentSrc || audio?.src || "");
  }

  function clearAutoResumeTimer() {
    if (state.autoResumeTimer) {
      clearTimeout(state.autoResumeTimer);
      state.autoResumeTimer = null;
    }
  }

  function clearHeldPosition() {
    state.heldTime = null;
    state.desiredTime = null;
    state.wasPlayingBeforeSeek = false;
    state.verifyToken += 1;
    state.resumeToken += 1;
    state.repairingPlayback = false;
    clearAutoResumeTimer();
  }

  function resetForNewAudio() {
    state.dragging = false;
    state.pointerId = null;
    state.sourceKey = getSourceKey(getAudio());
    clearHeldPosition();
  }

  function durationOf(audio) {
    const value = Number(audio?.duration || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function safeTarget(audio, value) {
    const duration = durationOf(audio);
    if (!duration) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
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

  function nearTarget(audio, target, tolerance = 0.85) {
    if (!audio || target === null || target === undefined) return false;
    const current = Number(audio.currentTime || 0);
    return Number.isFinite(current) && Math.abs(current - Number(target)) <= tolerance;
  }

  function writeCurrentTime(audio, target) {
    const safe = safeTarget(audio, target);
    if (!audio || safe === null) return false;
    try {
      audio.currentTime = safe;
      return true;
    } catch (error) {
      console.warn("[Step24E] currentTime write failed:", error);
      return false;
    }
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function settleAtTarget(target, token, maxMs = 2600) {
    const audio = getAudio();
    if (!audio || !isQuestionPracticeMode()) return false;

    const safe = safeTarget(audio, target);
    if (safe === null) return false;

    const sourceAtStart = getSourceKey(audio);
    const startedAt = Date.now();
    let stable = 0;
    let lastWriteAt = 0;

    while (Date.now() - startedAt < maxMs) {
      if (token !== state.verifyToken && token !== state.resumeToken) return false;
      if (!isQuestionPracticeMode()) return false;
      if (getSourceKey(audio) !== sourceAtStart) return false;

      if (nearTarget(audio, safe, 0.75) && !audio.seeking) {
        stable += 1;
        if (stable >= 2) return true;
      } else {
        stable = 0;
      }

      if (!audio.seeking && Date.now() - lastWriteAt >= 260) {
        writeCurrentTime(audio, safe);
        lastWriteAt = Date.now();
      }

      await wait(70);
    }

    return nearTarget(audio, safe, 1.25);
  }

  async function lockPausedSeek(target) {
    const audio = getAudio();
    if (!audio || !isQuestionPracticeMode()) return false;

    const safe = safeTarget(audio, target);
    if (safe === null) return false;

    state.heldTime = safe;
    state.sourceKey = getSourceKey(audio);
    state.verifyToken += 1;
    const token = state.verifyToken;

    try {
      if (!audio.paused && !audio.ended) audio.pause();
    } catch { /* ignore */ }

    writeCurrentTime(audio, safe);
    const ok = await settleAtTarget(safe, token, 3000);

    if (token !== state.verifyToken || getSourceKey(audio) !== state.sourceKey) return false;
    if (ok) state.heldTime = safe;
    return ok;
  }

  async function resumeFromHeldPosition(options = {}) {
    const audio = getAudio();
    if (!audio || !isQuestionPracticeMode()) return false;

    const target = safeTarget(audio, state.heldTime);
    if (target === null) return false;

    state.resumeToken += 1;
    const token = state.resumeToken;
    state.lastManualResumeAt = Date.now();

    try {
      if (!audio.paused && !audio.ended) audio.pause();
    } catch { /* ignore */ }

    // 재생 버튼을 누르기 전에 반드시 실제 media currentTime부터 확정한다.
    writeCurrentTime(audio, target);
    const settled = await settleAtTarget(target, token, 3200);
    if (token !== state.resumeToken || !isQuestionPracticeMode()) return false;

    if (!settled) {
      console.warn("[Step24E] resume target did not fully settle; retrying once", {
        target,
        currentTime: audio.currentTime,
        readyState: audio.readyState,
        seeking: audio.seeking
      });
      writeCurrentTime(audio, target);
      await wait(140);
    }

    try {
      let resumed = false;
      if (typeof AudioController !== "undefined" && typeof AudioController.resumeForPractice === "function") {
        resumed = await AudioController.resumeForPractice();
      } else {
        await audio.play();
        resumed = true;
      }

      if (!resumed) return false;

      // playing 직후 브라우저가 0초로 되돌리는 경우를 한 번 더 확인한다.
      await wait(110);
      if (token !== state.resumeToken) return false;

      if (target > 1.5 && Number(audio.currentTime || 0) < Math.max(0.5, target - 1.5)) {
        if (!state.repairingPlayback) {
          state.repairingPlayback = true;
          try { audio.pause(); } catch { /* ignore */ }
          writeCurrentTime(audio, target);
          await settleAtTarget(target, token, 1800);
          if (typeof AudioController !== "undefined" && typeof AudioController.resumeForPractice === "function") {
            await AudioController.resumeForPractice();
          } else {
            await audio.play();
          }
          state.repairingPlayback = false;
        }
      }

      // 목표 위치에서 정상 재생이 시작되면 hold를 해제한다.
      if (nearTarget(audio, target, 1.75) || Number(audio.currentTime || 0) >= target) {
        state.heldTime = null;
      }
      return true;
    } catch (error) {
      state.repairingPlayback = false;
      console.warn("[Step24E] resume from held position failed:", error);
      return false;
    }
  }

  function eventElement(event) {
    const target = event?.target;
    return target && target.nodeType === 1 ? target : target?.parentElement || null;
  }

  function bindSeekMemory() {
    const audio = getAudio();
    if (!audio) return;

    // Step23F/Step23D가 실제 탐색을 처리하기 전에 재생 여부와 목표 위치만 기록한다.
    document.addEventListener("pointerdown", (event) => {
      if (!isQuestionPracticeMode()) return;
      if (event.button !== undefined && event.button !== 0) return;

      const el = eventElement(event);
      if (!el?.closest?.(".audio-progress.practice-seek-enabled")) return;

      const target = targetFromClientX(event.clientX);
      if (target === null) return;

      state.dragging = true;
      state.pointerId = event.pointerId ?? null;
      state.desiredTime = target;
      state.wasPlayingBeforeSeek = !audio.paused && !audio.ended;
      state.sourceKey = getSourceKey(audio);
      clearAutoResumeTimer();
    }, true);

    document.addEventListener("pointermove", (event) => {
      if (!state.dragging || !isQuestionPracticeMode()) return;
      if (state.pointerId !== null && event.pointerId !== undefined && event.pointerId !== state.pointerId) return;
      const target = targetFromClientX(event.clientX);
      if (target !== null) state.desiredTime = target;
    }, true);

    // bubble 단계이므로 Step23D의 pointerup/commitSeek가 먼저 실행된 뒤 보완한다.
    document.addEventListener("pointerup", () => {
      if (!state.dragging || !isQuestionPracticeMode()) return;
      const target = state.desiredTime;
      const wasPlaying = state.wasPlayingBeforeSeek;
      state.dragging = false;
      state.pointerId = null;

      if (target === null) return;
      state.heldTime = target;
      state.sourceKey = getSourceKey(audio);

      // Step23D가 먼저 currentTime을 처리할 시간을 준 뒤 실제 위치를 확인한다.
      window.setTimeout(async () => {
        if (!isQuestionPracticeMode() || getSourceKey(audio) !== state.sourceKey) return;
        await lockPausedSeek(target);

        if (wasPlaying) {
          // 기존 Step23D의 자동 재개를 우선 기다리고, 실패했을 때만 보완한다.
          clearAutoResumeTimer();
          state.autoResumeTimer = window.setTimeout(() => {
            if (!isQuestionPracticeMode()) return;
            if (state.heldTime === null) return;
            if (audio.paused && !audio.ended) {
              resumeFromHeldPosition({ automatic: true });
            }
          }, 520);
        }
      }, 120);
    }, false);

    document.addEventListener("pointercancel", () => {
      state.dragging = false;
      state.pointerId = null;
    }, false);

    // 일시정지 후 탐색한 경우의 핵심 처리:
    // AudioController의 일반 click handler까지 보내지 않고, 목표 위치가 확정된 뒤 직접 resume한다.
    document.addEventListener("click", (event) => {
      if (!isQuestionPracticeMode() || state.heldTime === null) return;

      const el = eventElement(event);
      const button = el?.closest?.("#audio-start-btn.pause-enabled");
      if (!button || button.disabled || !audio.paused || audio.ended) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      resumeFromHeldPosition({ automatic: false });
    }, true);

    audio.addEventListener("playing", () => {
      if (!isQuestionPracticeMode() || state.heldTime === null) return;
      const target = state.heldTime;
      const current = Number(audio.currentTime || 0);

      if (target !== null && (Math.abs(current - target) <= 1.75 || current >= target)) {
        state.heldTime = null;
        clearAutoResumeTimer();
      }
    });

    // 재생 중 실제 시간이 목표 위치를 통과하면 더 이상 hold가 필요 없다.
    audio.addEventListener("timeupdate", () => {
      if (state.heldTime === null || audio.paused) return;
      const current = Number(audio.currentTime || 0);
      if (Number.isFinite(current) && current >= state.heldTime - 0.35) {
        state.heldTime = null;
        clearAutoResumeTimer();
      }
    });

    // 새 문항/새 음원이 들어오면 이전 목표 위치를 절대로 넘기지 않는다.
    ["loadstart", "emptied", "ended", "error"].forEach((eventName) => {
      audio.addEventListener(eventName, resetForNewAudio);
    });

    ["#dev-prev-btn", "#dev-next-btn"].forEach((selector) => {
      $(selector)?.addEventListener("click", clearHeldPosition, true);
    });

    window.addEventListener("pagehide", clearHeldPosition);
  }

  function initStep24EPracticeSeekResumeFix() {
    bindSeekMemory();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStep24EPracticeSeekResumeFix);
  } else {
    initStep24EPracticeSeekResumeFix();
  }
})();
