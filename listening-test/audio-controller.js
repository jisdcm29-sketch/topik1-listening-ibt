// TOPIK I 듣기 PBT형 IBT - audio-controller.js
// 하단 고정 오디오 바 전용.
// 실전시험/레벨테스트에서는 정지/일시정지/되감기/탐색 기능을 제공하지 않는다.
// Step22e: 문항 선택 연습 모드에서만 일시정지/계속 듣기 기능을 허용한다.
// 제출 또는 오답풀이 종료 시에는 내부적으로 재생을 정리한다.

const AudioController = (() => {
  let audioEl;
  let startBtn;
  let currentTimeEl;
  let durationEl;
  let progressFillEl;
  let volumeSliderEl;

  let currentUrl = "";
  let hasStarted = false;
  let callbacks = {};
  let allowPause = false;
  let isPaused = false;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }


  function getVisibleQuestionMaxNumber() {
    const label = document.querySelector("#current-question-label")?.textContent || "";
    const nums = String(label)
      .match(/\d+/g)
      ?.map((value) => Number(value))
      .filter((value) => Number.isFinite(value)) || [];

    return nums.length ? Math.max(...nums) : 0;
  }

  function getVisibleTotalQuestionNumber() {
    const label = document.querySelector("#total-question-label")?.textContent || "";
    const match = String(label).match(/\d+/);
    const total = match ? Number(match[0]) : 0;
    return Number.isFinite(total) ? total : 0;
  }

  function shouldSuppressEndedCallbackOnFinalScreen() {
    const testScreen = document.querySelector("#test-screen");
    if (!testScreen || testScreen.hidden) return false;

    const currentMax = getVisibleQuestionMaxNumber();
    const total = getVisibleTotalQuestionNumber();

    return total > 0 && currentMax >= total;
  }

  function setStartButtonState(mode) {
    if (!startBtn) return;

    startBtn.classList.remove("playing", "finished", "paused", "pause-enabled");

    if (allowPause && currentUrl) {
      startBtn.classList.add("pause-enabled");
    }

    if (mode === "playing") {
      startBtn.textContent = allowPause ? "일시정지" : "재생 중";
      startBtn.classList.add("playing");
      startBtn.disabled = !allowPause;
      return;
    }

    if (mode === "paused") {
      startBtn.textContent = "계속 듣기";
      startBtn.classList.add("paused");
      startBtn.disabled = false;
      return;
    }

    if (mode === "finished") {
      startBtn.textContent = "재생 완료";
      startBtn.classList.add("finished");
      startBtn.disabled = true;
      return;
    }

    if (mode === "error") {
      startBtn.textContent = "오디오 오류";
      startBtn.disabled = false;
      return;
    }

    if (mode === "submitted") {
      startBtn.textContent = "제출 완료";
      startBtn.classList.add("finished");
      startBtn.disabled = true;
      return;
    }

    if (mode === "ready") {
      startBtn.textContent = currentUrl ? "자동 재생 대기" : "오디오 없음";
      startBtn.disabled = !currentUrl;
    }
  }

  async function handleStartButtonClick() {
    if (allowPause && hasStarted && audioEl && !audioEl.ended) {
      return togglePracticePause();
    }

    return playOnce({ silentFail: false });
  }

  function pauseForPractice() {
    if (!allowPause || !audioEl || !currentUrl || !hasStarted || audioEl.ended) return false;

    try {
      audioEl.pause();
      isPaused = true;
      setStartButtonState("paused");
      return true;
    } catch (error) {
      console.warn("[AudioController] pauseForPractice failed:", error);
      return false;
    }
  }

  async function resumeForPractice() {
    if (!allowPause || !audioEl || !currentUrl || !hasStarted || audioEl.ended) return false;

    try {
      await audioEl.play();
      isPaused = false;
      setStartButtonState("playing");
      return true;
    } catch (error) {
      console.warn("[AudioController] resumeForPractice failed:", error);
      setStartButtonState("paused");
      alert("오디오를 다시 재생할 수 없습니다. 브라우저 권한과 파일 경로를 확인하세요.");
      return false;
    }
  }

  function togglePracticePause() {
    if (!allowPause) return false;
    if (!audioEl || !currentUrl || !hasStarted || audioEl.ended) return false;

    if (isPaused || audioEl.paused) {
      return resumeForPractice();
    }

    return pauseForPractice();
  }


  function init(selectors = {}) {
    audioEl = document.querySelector(selectors.audio || "#exam-audio");
    startBtn = document.querySelector(selectors.startBtn || "#audio-start-btn");
    currentTimeEl = document.querySelector(selectors.currentTime || "#audio-current-time");
    durationEl = document.querySelector(selectors.duration || "#audio-duration");
    progressFillEl = document.querySelector(selectors.progressFill || "#audio-progress-fill");
    volumeSliderEl = document.querySelector(selectors.volume || "#audio-volume-slider");

    if (!audioEl) {
      console.error("[AudioController] audio element not found.");
      return;
    }

    audioEl.controls = false;

    audioEl.addEventListener("loadedmetadata", () => {
      const duration = getDuration();
      if (durationEl) durationEl.textContent = formatTime(duration);
      if (typeof callbacks.onLoadedMetadata === "function") {
        callbacks.onLoadedMetadata({ url: currentUrl, duration });
      }
    });

    audioEl.addEventListener("timeupdate", () => {
      const currentTime = getCurrentTime();
      const duration = getDuration();

      if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);

      if (progressFillEl && duration) {
        const percent = Math.min(100, Math.max(0, (currentTime / duration) * 100));
        progressFillEl.style.width = `${percent}%`;
      }

      if (typeof callbacks.onTimeUpdate === "function") {
        callbacks.onTimeUpdate({ url: currentUrl, currentTime, duration });
      }
    });

    audioEl.addEventListener("ended", () => {
      const duration = getDuration();

      hasStarted = false;
      isPaused = false;

      setStartButtonState("finished");

      if (typeof callbacks.onTimeUpdate === "function") {
        callbacks.onTimeUpdate({ url: currentUrl, currentTime: duration, duration });
      }

      if (typeof callbacks.onEnded === "function") {
        if (shouldSuppressEndedCallbackOnFinalScreen()) {
          // Step18: 마지막 화면에서는 자동 제출하지 않고 학생이 제출 버튼을 누르게 한다.
          return;
        }
        callbacks.onEnded({ url: currentUrl, duration });
      }
    });

    audioEl.addEventListener("error", () => {
      console.error("[AudioController] audio file error:", currentUrl);
      hasStarted = false;
      isPaused = false;
      setStartButtonState("error");
      if (typeof callbacks.onError === "function") {
        callbacks.onError({ url: currentUrl });
      }
    });

    if (volumeSliderEl) {
      volumeSliderEl.addEventListener("input", () => {
        audioEl.volume = Number(volumeSliderEl.value);
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", () => handleStartButtonClick());
    }
  }

  function load(audioUrl, options = {}) {
    if (!audioEl) return;

    currentUrl = audioUrl || "";
    callbacks = {
      onLoadedMetadata: options.onLoadedMetadata || null,
      onTimeUpdate: options.onTimeUpdate || null,
      onEnded: options.onEnded || null,
      onError: options.onError || null
    };
    allowPause = options.allowPause === true;
    hasStarted = false;
    isPaused = false;

    audioEl.src = currentUrl;
    audioEl.currentTime = 0;
    audioEl.load();

    if (currentTimeEl) currentTimeEl.textContent = "0:00";
    if (durationEl) durationEl.textContent = "0:00";
    if (progressFillEl) progressFillEl.style.width = "0%";

    setStartButtonState("ready");

    if (options.autoPlay && currentUrl) {
      window.setTimeout(() => playOnce({ silentFail: true }), options.autoPlayDelayMs ?? 250);
    }
  }

  async function playOnce(options = {}) {
    if (!audioEl || !currentUrl) return false;

    if (hasStarted) {
      if (allowPause && isPaused) return resumeForPractice();
      return false;
    }

    hasStarted = true;
    isPaused = false;
    setStartButtonState("playing");

    try {
      await audioEl.play();
      return true;
    } catch (error) {
      console.warn("[AudioController] playback failed:", error);
      hasStarted = false;

      isPaused = false;
      if (startBtn) {
        startBtn.textContent = "재생 시작";
        startBtn.classList.remove("playing", "paused");
        startBtn.disabled = false;
      }

      if (!options.silentFail) {
        alert("오디오를 재생할 수 없습니다. 파일 경로와 브라우저 권한을 확인하세요.");
      }

      return false;
    }
  }

  function stopForSubmit() {
    if (!audioEl) return;
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch (error) {
      console.warn("[AudioController] stopForSubmit failed:", error);
    }
    hasStarted = false;
    isPaused = false;
    allowPause = false;
    callbacks = {};
    setStartButtonState("submitted");
  }

  function getCurrentTime() {
    return audioEl && Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
  }

  function getDuration() {
    return audioEl && Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
  }

  return {
    init,
    load,
    playOnce,
    pauseForPractice,
    resumeForPractice,
    togglePracticePause,
    stopForSubmit,
    getCurrentTime,
    getDuration
  };
})();
