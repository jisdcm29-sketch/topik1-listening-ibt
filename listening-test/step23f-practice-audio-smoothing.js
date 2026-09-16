// Step23F: 문항 선택 연습 전용 오디오 전환 완화
// 목적:
// 1) 기존 Step23D 탐색/보기 표시 로직은 수정하지 않는다.
// 2) 문항 선택 연습에서 seek 또는 일시정지/계속 듣기 전환 시에만 잠깐 무음 처리한다.
// 3) 재생이 실제로 시작된 뒤 아주 짧게 원래 음량으로 복원하여 MP3 seek 경계의 팝/삑 소리를 줄인다.
// 4) 30문항 실전시험/레벨테스트에는 적용하지 않는다.
(function () {
  "use strict";

  function $(selector) {
    return document.querySelector(selector);
  }

  function clampVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  }

  function isTestVisible() {
    const screen = $("#test-screen");
    return !!screen && !screen.hidden;
  }

  function isQuestionPracticeMode() {
    if (!isTestVisible()) return false;

    const title = String($("#test-header-title")?.textContent || "").trim();
    if (title.includes("선택 문항 연습") || title.includes("문항 선택 연습")) {
      return true;
    }

    return !!$("#audio-start-btn.pause-enabled");
  }

  const smoothing = {
    active: false,
    reason: "",
    expectedResume: false,
    targetVolume: 1,
    safetyTimer: null,
    fadeRaf: 0,
    fadeToken: 0
  };

  function clearSafetyTimer() {
    if (smoothing.safetyTimer) {
      clearTimeout(smoothing.safetyTimer);
      smoothing.safetyTimer = null;
    }
  }

  function cancelFade() {
    smoothing.fadeToken += 1;
    if (smoothing.fadeRaf) {
      cancelAnimationFrame(smoothing.fadeRaf);
      smoothing.fadeRaf = 0;
    }
  }

  function readDesiredVolume(audio) {
    const slider = $("#audio-volume-slider");
    const sliderValue = Number(slider?.value);
    if (Number.isFinite(sliderValue)) return clampVolume(sliderValue);
    return clampVolume(audio?.volume);
  }

  function restoreNow() {
    const audio = $("#exam-audio");
    cancelFade();
    clearSafetyTimer();

    if (audio) {
      try {
        audio.volume = clampVolume(smoothing.targetVolume);
      } catch (error) {
        console.warn("[Step23F] volume restore skipped:", error);
      }
    }

    smoothing.active = false;
    smoothing.reason = "";
    smoothing.expectedResume = false;
  }

  function beginSoftTransition(reason, expectedResume) {
    if (!isQuestionPracticeMode()) return false;

    const audio = $("#exam-audio");
    if (!audio) return false;

    cancelFade();
    clearSafetyTimer();

    smoothing.active = true;
    smoothing.reason = String(reason || "transition");
    smoothing.expectedResume = !!expectedResume;
    smoothing.targetVolume = readDesiredVolume(audio);

    // 현재 음량 슬라이더 값은 그대로 두고 실제 audio 요소만 잠깐 mute한다.
    // Step23D의 currentTime/seek 로직에는 전혀 손대지 않는다.
    try {
      audio.volume = 0;
    } catch (error) {
      console.warn("[Step23F] temporary mute skipped:", error);
    }

    // 어떤 브라우저 이벤트가 누락되어도 무음 상태가 남지 않도록 안전 복구한다.
    smoothing.safetyTimer = window.setTimeout(() => {
      if (smoothing.active) restoreNow();
    }, 9000);

    return true;
  }

  function fadeBackIn() {
    if (!smoothing.active || !smoothing.expectedResume || !isQuestionPracticeMode()) {
      if (smoothing.active && !smoothing.expectedResume) restoreNow();
      return;
    }

    const audio = $("#exam-audio");
    if (!audio) {
      restoreNow();
      return;
    }

    if (audio.paused || audio.ended) {
      // 자동 재개를 기다리는 중이면 mute 상태를 유지한다.
      return;
    }

    cancelFade();
    clearSafetyTimer();

    const target = clampVolume(smoothing.targetVolume);
    const durationMs = 140;
    const startAt = performance.now();
    const token = smoothing.fadeToken;

    try { audio.volume = 0; } catch { /* ignore */ }

    const tick = (now) => {
      if (token !== smoothing.fadeToken || !smoothing.active) return;

      if (!isQuestionPracticeMode()) {
        restoreNow();
        return;
      }

      if (audio.paused || audio.ended) {
        restoreNow();
        return;
      }

      const ratio = Math.max(0, Math.min(1, (now - startAt) / durationMs));
      try {
        audio.volume = target * ratio;
      } catch (error) {
        console.warn("[Step23F] fade-in skipped:", error);
        restoreNow();
        return;
      }

      if (ratio >= 1) {
        audio.volume = target;
        smoothing.active = false;
        smoothing.reason = "";
        smoothing.expectedResume = false;
        smoothing.fadeRaf = 0;
        return;
      }

      smoothing.fadeRaf = requestAnimationFrame(tick);
    };

    smoothing.fadeRaf = requestAnimationFrame(tick);
  }

  function eventElement(event) {
    const target = event?.target;
    return target && target.nodeType === 1 ? target : target?.parentElement || null;
  }

  function bindPracticeSmoothing() {
    const audio = $("#exam-audio");
    const slider = $("#audio-volume-slider");
    if (!audio) return;

    // Step23D의 pointerdown보다 먼저 실행되도록 document capture 단계에서 mute한다.
    document.addEventListener("pointerdown", (event) => {
      if (!isQuestionPracticeMode()) return;
      if (event.button !== undefined && event.button !== 0) return;

      const el = eventElement(event);
      const progress = el?.closest?.(".audio-progress.practice-seek-enabled");
      if (!progress) return;

      const wasPlaying = !audio.paused && !audio.ended;
      beginSoftTransition("seek", wasPlaying);
    }, true);

    // 키보드 탐색(Home/End/좌우 화살표)도 동일하게 처리한다.
    document.addEventListener("keydown", (event) => {
      if (!isQuestionPracticeMode()) return;
      const el = eventElement(event);
      if (!el?.closest?.(".audio-progress.practice-seek-enabled")) return;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

      const wasPlaying = !audio.paused && !audio.ended;
      beginSoftTransition("seek", wasPlaying);
    }, true);

    // 문항 연습의 일시정지/계속 듣기 자체에서도 짧은 전환음을 억제한다.
    document.addEventListener("click", (event) => {
      if (!isQuestionPracticeMode()) return;
      const el = eventElement(event);
      const btn = el?.closest?.("#audio-start-btn.pause-enabled");
      if (!btn || btn.disabled) return;

      if (audio.paused) {
        // 계속 듣기: 실제 play/playing 이벤트 전까지 mute 유지 후 fade-in.
        beginSoftTransition("manual-resume", true);
      } else if (!audio.ended) {
        // 일시정지: 정지 순간만 mute하고 pause 이벤트에서 원래 음량 복구.
        beginSoftTransition("manual-pause", false);
      }
    }, true);

    audio.addEventListener("seeking", () => {
      if (!smoothing.active || !isQuestionPracticeMode()) return;
      try { audio.volume = 0; } catch { /* ignore */ }
    });

    audio.addEventListener("seeked", () => {
      if (!smoothing.active || smoothing.reason !== "seek") return;

      if (!smoothing.expectedResume) {
        // 원래부터 일시정지 상태에서 위치만 옮긴 경우에는 그대로 멈춘 채 음량 값만 복원한다.
        restoreNow();
      }
      // 원래 재생 중이었다면 Step23D가 seek 안정화를 확인하고 resume할 때까지 mute를 유지한다.
    });

    audio.addEventListener("play", () => {
      if (!smoothing.active || !smoothing.expectedResume || !isQuestionPracticeMode()) return;
      try { audio.volume = 0; } catch { /* ignore */ }
    });

    audio.addEventListener("playing", () => {
      if (!smoothing.active || !smoothing.expectedResume || !isQuestionPracticeMode()) return;
      fadeBackIn();
    });

    audio.addEventListener("pause", () => {
      if (!smoothing.active) return;
      if (smoothing.reason === "manual-pause") {
        restoreNow();
      }
    });

    // 문항 이동/새 음원 로드 시 mute 상태가 다음 음원으로 넘어가지 않게 즉시 복구한다.
    ["loadstart", "emptied", "ended", "error"].forEach((eventName) => {
      audio.addEventListener(eventName, () => {
        if (smoothing.active) restoreNow();
      });
    });

    if (slider) {
      slider.addEventListener("input", () => {
        if (!smoothing.active) return;
        smoothing.targetVolume = clampVolume(slider.value);
        // AudioController가 먼저 slider 값을 audio.volume에 써도 전환 중에는 mute를 유지한다.
        try { audio.volume = 0; } catch { /* ignore */ }
      });
    }

    window.addEventListener("pagehide", restoreNow);
  }

  function initStep23FAudioSmoothing() {
    bindPracticeSmoothing();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStep23FAudioSmoothing);
  } else {
    initStep23FAudioSmoothing();
  }
})();
