// TOPIK I 듣기 PBT형 IBT - audio-controller.js
// 하단 고정 오디오 바 전용.
// 시험 중 정지/일시정지/되감기/탐색 기능은 제공하지 않는다.
// 제출 또는 오답풀이 종료 시에만 내부적으로 재생을 정리한다.

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

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
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

      if (startBtn) {
        startBtn.textContent = "재생 완료";
        startBtn.classList.remove("playing");
        startBtn.classList.add("finished");
        startBtn.disabled = true;
      }

      if (typeof callbacks.onTimeUpdate === "function") {
        callbacks.onTimeUpdate({ url: currentUrl, currentTime: duration, duration });
      }

      if (typeof callbacks.onEnded === "function") {
        callbacks.onEnded({ url: currentUrl, duration });
      }
    });

    audioEl.addEventListener("error", () => {
      console.error("[AudioController] audio file error:", currentUrl);
      if (startBtn) {
        startBtn.textContent = "오디오 오류";
        startBtn.disabled = false;
      }
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
      startBtn.addEventListener("click", () => playOnce({ silentFail: false }));
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
    hasStarted = false;

    audioEl.src = currentUrl;
    audioEl.currentTime = 0;
    audioEl.load();

    if (currentTimeEl) currentTimeEl.textContent = "0:00";
    if (durationEl) durationEl.textContent = "0:00";
    if (progressFillEl) progressFillEl.style.width = "0%";

    if (startBtn) {
      startBtn.textContent = currentUrl ? "자동 재생 대기" : "오디오 없음";
      startBtn.classList.remove("playing", "finished");
      startBtn.disabled = !currentUrl;
    }

    if (options.autoPlay && currentUrl) {
      window.setTimeout(() => playOnce({ silentFail: true }), options.autoPlayDelayMs ?? 250);
    }
  }

  async function playOnce(options = {}) {
    if (!audioEl || !currentUrl || hasStarted) return false;

    hasStarted = true;

    if (startBtn) {
      startBtn.textContent = "재생 중";
      startBtn.classList.add("playing");
      startBtn.disabled = true;
    }

    try {
      await audioEl.play();
      return true;
    } catch (error) {
      console.warn("[AudioController] playback failed:", error);
      hasStarted = false;

      if (startBtn) {
        startBtn.textContent = "재생 시작";
        startBtn.classList.remove("playing");
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
    callbacks = {};
    if (startBtn) {
      startBtn.textContent = "제출 완료";
      startBtn.classList.remove("playing");
      startBtn.classList.add("finished");
      startBtn.disabled = true;
    }
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
    stopForSubmit,
    getCurrentTime,
    getDuration
  };
})();
