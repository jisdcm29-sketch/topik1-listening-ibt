// Step23d: TOPIK I 듣기 하단 네비게이션 + 문항 선택 연습 전용 안정 탐색/보기 구간 표시
// 목적
// 1) 일반 실전시험/레벨테스트의 기존 재생 규칙은 그대로 유지한다.
// 2) "문항 선택 연습"에서만 오디오 진행 막대를 클릭/드래그하여 원하는 위치로 이동한다.
// 3) <보기>가 있는 긴 음원에서도 탐색 위치가 0초로 되돌아가지 않도록 실제 seek 완료를 확인한 뒤 재생한다.
// 4) <보기> 표시는 화면 진입 즉시 보여 주되, 표시 계산을 위해 다른 MP3를 백그라운드로 읽지 않는다.
// 5) 다음/이전 문항 이동 시 이전 탐색 작업이 새 음원에 영향을 주지 않도록 즉시 취소한다.
(function () {
  "use strict";

  function $(selector) {
    return document.querySelector(selector);
  }

  function parseCurrentMax(label) {
    const nums = String(label || "")
      .match(/\d+/g)
      ?.map((n) => Number(n))
      .filter((n) => Number.isFinite(n)) || [];
    return nums.length ? Math.max(...nums) : 0;
  }

  function getTotalNumber() {
    const total = Number($("#total-question-label")?.textContent?.match(/\d+/)?.[0] || 0);
    return Number.isFinite(total) ? total : 0;
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

  function hasVisibleExample() {
    return isQuestionPracticeMode() && !!$("#question-content .example-card");
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updateBottomControls() {
    const prevBtn = $("#dev-prev-btn");
    const nextBtn = $("#dev-next-btn");
    const submitBtn = $("#submit-test-btn");

    const visible = isTestVisible();
    const currentLabel = $("#current-question-label")?.textContent || "0";
    const currentMax = parseCurrentMax(currentLabel);
    const total = getTotalNumber();

    const ready = visible && total > 0 && currentMax > 0;
    const isFirst = !ready || currentMax <= 1;
    const isLast = ready && currentMax >= total;

    if (prevBtn) {
      prevBtn.disabled = !ready || isFirst;
      prevBtn.setAttribute("aria-disabled", prevBtn.disabled ? "true" : "false");
    }

    if (nextBtn) {
      nextBtn.disabled = !ready || isLast;
      nextBtn.setAttribute("aria-disabled", nextBtn.disabled ? "true" : "false");
    }

    if (submitBtn) {
      const showSubmit = ready && isLast;
      submitBtn.classList.toggle("visible", showSubmit);
      submitBtn.disabled = !showSubmit;
      submitBtn.setAttribute("aria-hidden", showSubmit ? "false" : "true");
    }

    updatePracticeSeekUi();
    updateExampleMarker();
  }

  function pauseCurrentAudioBeforePracticeNavigation() {
    if (!isQuestionPracticeMode()) return;

    cancelPendingSeek({ keepUi: false });

    const audio = $("#exam-audio");
    if (!audio) return;

    try {
      if (!audio.paused && !audio.ended) {
        if (typeof AudioController !== "undefined" && typeof AudioController.pauseForPractice === "function") {
          AudioController.pauseForPractice();
        } else {
          audio.pause();
        }
      }
    } catch (error) {
      console.warn("[Step23d] practice navigation audio pause skipped:", error);
    }
  }

  function bindSafetyHandlers() {
    const prevBtn = $("#dev-prev-btn");
    const nextBtn = $("#dev-next-btn");

    [prevBtn, nextBtn].filter(Boolean).forEach((btn) => {
      btn.addEventListener("click", (event) => {
        updateBottomControls();

        if (isQuestionPracticeMode()) {
          if (btn.disabled) {
            event.preventDefault();
            return;
          }

          pauseCurrentAudioBeforePracticeNavigation();
          return;
        }

        if (btn.disabled) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    });

    const submitBtn = $("#submit-test-btn");
    if (submitBtn) {
      submitBtn.addEventListener("click", (event) => {
        updateBottomControls();
        if (submitBtn.disabled || !submitBtn.classList.contains("visible")) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }
  }

  function ensurePracticeSeekStyle() {
    if ($("#step23d-practice-seek-style")) return;

    $("#step23a-practice-seek-style")?.remove();
    $("#step23b-practice-seek-style")?.remove();
    $("#step23c-practice-seek-style")?.remove();

    const style = document.createElement("style");
    style.id = "step23d-practice-seek-style";
    style.textContent = `
      .audio-progress.practice-seek-enabled {
        cursor: pointer;
        overflow: visible;
        touch-action: none;
        user-select: none;
      }

      .audio-progress.practice-seek-enabled::after {
        content: "";
        position: absolute;
        left: -4px;
        right: -4px;
        top: -10px;
        bottom: -10px;
        border-radius: 999px;
      }

      .audio-progress.practice-seek-enabled:focus-visible {
        outline: 3px solid rgba(20, 118, 232, 0.30);
        outline-offset: 5px;
      }

      .audio-progress.practice-seek-enabled .audio-progress-fill {
        position: relative;
        z-index: 4;
      }

      .audio-progress.practice-seek-enabled .audio-progress-fill::after {
        content: "";
        position: absolute;
        right: -6px;
        top: 50%;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #1476e8;
        transform: translateY(-50%);
        box-shadow: 0 0 0 2px #ffffff;
        pointer-events: none;
        z-index: 5;
      }

      .practice-example-zone {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 0;
        border-radius: 999px 0 0 999px;
        background: rgba(245, 158, 11, 0.42);
        border-right: 3px solid #d97706;
        pointer-events: none !important;
        z-index: 6;
        display: none;
      }

      .practice-example-zone * {
        pointer-events: none !important;
      }

      .practice-example-marker-label {
        position: absolute;
        right: 0;
        top: -31px;
        transform: translateX(50%);
        padding: 3px 7px;
        border: 2px solid #d97706;
        border-radius: 8px;
        background: #fff7ed;
        color: #9a3412;
        font-size: 12px;
        line-height: 1.2;
        font-weight: 900;
        white-space: nowrap;
        box-shadow: 0 2px 5px rgba(0,0,0,.14);
        z-index: 9;
      }

      .practice-example-marker-note {
        position: absolute;
        left: 4px;
        top: 13px;
        padding: 1px 4px;
        border-radius: 5px;
        background: #fff7ed;
        color: #9a3412;
        font-size: 11px;
        font-weight: 900;
        white-space: nowrap;
        z-index: 9;
      }

      .audio-progress.practice-seek-waiting {
        box-shadow: 0 0 0 3px rgba(20, 118, 232, 0.12);
      }
    `;
    document.head.appendChild(style);
  }

  function ensureExampleMarkerElements() {
    const progress = $(".audio-progress");
    if (!progress) return null;

    let zone = $("#practice-example-zone");
    if (!zone) {
      zone = document.createElement("div");
      zone.id = "practice-example-zone";
      zone.className = "practice-example-zone";
      zone.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.id = "practice-example-marker-label";
      label.className = "practice-example-marker-label";
      label.textContent = "<보기> 끝";
      zone.appendChild(label);

      const note = document.createElement("span");
      note.id = "practice-example-marker-note";
      note.className = "practice-example-marker-note";
      note.textContent = "보기";
      zone.appendChild(note);

      progress.appendChild(zone);
    }

    return zone;
  }

  function hideExampleMarker() {
    const zone = $("#practice-example-zone");
    if (!zone) return;
    zone.style.display = "none";
    zone.style.width = "0%";
    zone.removeAttribute("title");
  }

  const EXAMPLE_MARKER_STORAGE_KEY = "topik1-step23c-example-marker-cache";
  const DEFAULT_EXAMPLE_RATIO = 0.64;

  function normalizeAudioCacheKey(url) {
    const text = String(url || "");
    if (!text) return "";
    try {
      const parsed = new URL(text, window.location.href);
      return `${parsed.pathname}${parsed.search || ""}`;
    } catch {
      return text;
    }
  }

  function loadMarkerCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(EXAMPLE_MARKER_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function getCachedExampleEnd(url, duration) {
    const key = normalizeAudioCacheKey(url);
    if (!key) return 0;
    const value = Number(loadMarkerCache()[key] || 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (Number.isFinite(duration) && duration > 0 && value >= duration - 1) return 0;
    return value;
  }

  function showExampleMarkerAt(seconds, duration) {
    const zone = ensureExampleMarkerElements();
    if (!zone) return false;

    const d = Number(duration || 0);
    const t = Number(seconds || 0);
    if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(t) || t <= 0) return false;

    const safeEnd = Math.max(3, Math.min(d - 1, t));
    const percent = Math.max(3, Math.min(92, (safeEnd / d) * 100));
    zone.style.width = `${percent}%`;
    zone.style.display = "block";
    zone.style.opacity = "1";
    zone.title = `<보기> 구간 표시: 약 0:00 ~ ${formatTime(safeEnd)}`;

    const label = $("#practice-example-marker-label");
    if (label) label.textContent = `<보기> 끝 약 ${formatTime(safeEnd)}`;
    return true;
  }

  function updateExampleMarker() {
    if (!isQuestionPracticeMode() || !hasVisibleExample()) {
      hideExampleMarker();
      return;
    }

    const audio = $("#exam-audio");
    const zone = ensureExampleMarkerElements();
    if (!audio || !zone) return;

    const duration = Number(audio.duration || 0);
    const currentUrl = String(audio.currentSrc || audio.src || "");

    if (Number.isFinite(duration) && duration > 0) {
      const cached = getCachedExampleEnd(currentUrl, duration);
      const markerEnd = cached > 0
        ? cached
        : Math.max(3, Math.min(duration - 1, duration * DEFAULT_EXAMPLE_RATIO));
      showExampleMarkerAt(markerEnd, duration);
      return;
    }

    // metadata가 아직 오지 않은 순간에도 처음부터 보기 영역 자체는 보여 준다.
    zone.style.width = `${Math.round(DEFAULT_EXAMPLE_RATIO * 100)}%`;
    zone.style.display = "block";
    zone.style.opacity = "1";
    zone.title = "<보기> 구간 표시 준비 중";
    const label = $("#practice-example-marker-label");
    if (label) label.textContent = "<보기> 끝 위치";
  }

  function updatePracticeSeekUi() {
    const progress = $(".audio-progress");
    const audio = $("#exam-audio");
    if (!progress) return;

    const enabled = isQuestionPracticeMode();
    progress.classList.toggle("practice-seek-enabled", enabled);

    if (audio) {
      if (enabled) {
        // 긴 <보기> 음원에서도 뒤쪽 위치를 빨리 seek할 수 있도록 연습 모드에서만 충분히 버퍼링한다.
        audio.preload = "auto";
        audio.setAttribute("preload", "auto");
      } else {
        audio.preload = "metadata";
        audio.setAttribute("preload", "metadata");
      }
    }

    if (enabled) {
      progress.setAttribute("role", "slider");
      progress.setAttribute("tabindex", "0");
      progress.setAttribute("aria-label", "문항 연습 듣기 위치 이동");
      progress.setAttribute("aria-valuemin", "0");
      ensureExampleMarkerElements();
      updateSeekAriaValues();
    } else {
      progress.removeAttribute("role");
      progress.removeAttribute("tabindex");
      progress.removeAttribute("aria-label");
      progress.removeAttribute("aria-valuemin");
      progress.removeAttribute("aria-valuemax");
      progress.removeAttribute("aria-valuenow");
      progress.removeAttribute("aria-valuetext");
      progress.classList.remove("practice-seek-waiting");
      hideExampleMarker();
    }
  }

  function updateSeekAriaValues(forcedTime = null) {
    const progress = $(".audio-progress");
    const audio = $("#exam-audio");
    if (!progress || !audio || !isQuestionPracticeMode()) return;

    const duration = Number(audio.duration || 0);
    const current = forcedTime === null ? Number(audio.currentTime || 0) : Number(forcedTime || 0);

    if (Number.isFinite(duration) && duration > 0) {
      progress.setAttribute("aria-valuemax", String(Math.round(duration)));
      progress.setAttribute("aria-valuenow", String(Math.round(Math.min(current, duration))));
      progress.setAttribute("aria-valuetext", `${formatTime(current)} / ${formatTime(duration)}`);
    }
  }

  function paintSeekPosition(targetTime) {
    const audio = $("#exam-audio");
    const fill = $("#audio-progress-fill");
    const currentTime = $("#audio-current-time");
    if (!audio) return;

    const duration = Number(audio.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    const safeTime = Math.max(0, Math.min(duration, Number(targetTime || 0)));
    if (fill) {
      fill.style.width = `${Math.min(100, Math.max(0, (safeTime / duration) * 100))}%`;
    }
    if (currentTime) currentTime.textContent = formatTime(safeTime);
    updateSeekAriaValues(safeTime);
  }

  const seekState = {
    dragging: false,
    targetTime: null,
    wasPlaying: false,
    token: 0,
    commitTimer: null,
    timeoutTimer: null,
    stableChecks: 0,
    startedAt: 0,
    lastWriteAt: 0
  };

  function clearSeekTimers() {
    if (seekState.commitTimer) {
      clearTimeout(seekState.commitTimer);
      seekState.commitTimer = null;
    }
    if (seekState.timeoutTimer) {
      clearTimeout(seekState.timeoutTimer);
      seekState.timeoutTimer = null;
    }
  }

  function cancelPendingSeek(options = {}) {
    clearSeekTimers();
    seekState.token += 1;
    seekState.dragging = false;
    seekState.targetTime = null;
    seekState.wasPlaying = false;
    seekState.stableChecks = 0;
    seekState.startedAt = 0;
    seekState.lastWriteAt = 0;
    $(".audio-progress")?.classList.remove("practice-seek-waiting");

    if (!options.keepUi) updateSeekAriaValues();
  }

  function pauseForSeekSession(audio) {
    seekState.wasPlaying = !audio.paused && !audio.ended;
    if (!seekState.wasPlaying) return;

    try {
      if (typeof AudioController !== "undefined" && typeof AudioController.pauseForPractice === "function") {
        const paused = AudioController.pauseForPractice();
        if (!paused) audio.pause();
      } else {
        audio.pause();
      }
    } catch (error) {
      console.warn("[Step23d] pause before seek failed:", error);
      try { audio.pause(); } catch { /* ignore */ }
    }
  }

  function targetTimeFromClientX(clientX) {
    const audio = $("#exam-audio");
    const progress = $(".audio-progress");
    if (!audio || !progress) return null;

    const duration = Number(audio.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return null;

    const rect = progress.getBoundingClientRect();
    if (!rect.width) return null;

    const ratio = Math.max(0, Math.min(1, (Number(clientX) - rect.left) / rect.width));
    const safeMax = Math.max(0, duration - 0.25);
    return Math.min(safeMax, Math.max(0, duration * ratio));
  }

  function writeTargetTime(audio, target) {
    try {
      // fastSeek는 근사 위치로 이동할 수 있어 긴 <보기> 음원에서는 사용하지 않는다.
      // currentTime을 직접 지정해 사용자가 선택한 정확한 위치를 유지한다.
      audio.currentTime = target;
      seekState.lastWriteAt = Date.now();
      return true;
    } catch (error) {
      console.warn("[Step23d] seek write failed:", error);
      return false;
    }
  }

  function finishCommittedSeek(token) {
    if (token !== seekState.token) return;

    const audio = $("#exam-audio");
    const target = seekState.targetTime;
    if (!audio || target === null) return;

    clearSeekTimers();
    paintSeekPosition(target);
    $(".audio-progress")?.classList.remove("practice-seek-waiting");

    const shouldResume = seekState.wasPlaying;
    seekState.targetTime = null;
    seekState.wasPlaying = false;
    seekState.stableChecks = 0;
    seekState.startedAt = 0;
    seekState.lastWriteAt = 0;

    if (!shouldResume) return;

    try {
      if (typeof AudioController !== "undefined" && typeof AudioController.resumeForPractice === "function") {
        Promise.resolve(AudioController.resumeForPractice()).catch(() => {});
      } else {
        audio.play().catch(() => {});
      }
    } catch (error) {
      console.warn("[Step23d] resume after seek failed:", error);
    }
  }

  function verifyAndCommitSeek(token) {
    if (token !== seekState.token) return;

    const audio = $("#exam-audio");
    const target = seekState.targetTime;
    if (!audio || target === null || !isQuestionPracticeMode()) {
      cancelPendingSeek({ keepUi: true });
      return;
    }

    paintSeekPosition(target);

    const now = Number(audio.currentTime || 0);
    const distance = Math.abs(now - target);
    const closeEnough = Number.isFinite(now) && distance <= 0.85;

    if (closeEnough && !audio.seeking) {
      seekState.stableChecks += 1;
    } else {
      seekState.stableChecks = 0;
    }

    // 한 번 맞았다가 바로 0초로 되돌아오는 브라우저가 있어 3회 연속 안정 상태를 확인한다.
    if (seekState.stableChecks >= 3) {
      finishCommittedSeek(token);
      return;
    }

    // 아직 목표 위치가 확정되지 않았으면 paused 상태를 유지한다.
    // 실제 seeking 중에는 currentTime을 반복해서 다시 쓰지 않는다.
    // 반복 쓰기는 긴 MP3에서 seek 자체를 계속 새로 시작시켜 0초로 돌아가는 원인이 될 수 있다.
    const sinceLastWrite = Date.now() - Number(seekState.lastWriteAt || 0);
    if (!closeEnough && !audio.seeking && sinceLastWrite >= 320) {
      writeTargetTime(audio, target);
    }

    const elapsed = Date.now() - seekState.startedAt;
    if (elapsed >= 8000) {
      const finalNow = Number(audio.currentTime || 0);
      if (Math.abs(finalNow - target) <= 1.5) {
        finishCommittedSeek(token);
      } else {
        // 실패 시 잘못된 위치에서 자동 재생하지 않는다. 사용자가 한 번 더 누를 수 있도록 일시정지 상태를 유지한다.
        console.warn("[Step23d] seek did not settle before timeout", {
          target,
          currentTime: finalNow,
          readyState: audio.readyState,
          networkState: audio.networkState,
          seekableLength: audio.seekable?.length || 0
        });
        clearSeekTimers();
        seekState.targetTime = null;
        seekState.wasPlaying = false;
        seekState.stableChecks = 0;
        seekState.startedAt = 0;
        seekState.lastWriteAt = 0;
        $(".audio-progress")?.classList.remove("practice-seek-waiting");
        updateSeekAriaValues();
      }
      return;
    }

    seekState.commitTimer = window.setTimeout(() => verifyAndCommitSeek(token), 90);
  }

  function commitSeek(target) {
    if (!isQuestionPracticeMode()) return;

    const audio = $("#exam-audio");
    if (!audio) return;

    const duration = Number(audio.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    clearSeekTimers();
    seekState.token += 1;
    const token = seekState.token;

    const safeMax = Math.max(0, duration - 0.25);
    seekState.targetTime = Math.max(0, Math.min(safeMax, Number(target || 0)));
    seekState.stableChecks = 0;
    seekState.startedAt = Date.now();
    seekState.lastWriteAt = 0;

    audio.preload = "auto";
    audio.setAttribute("preload", "auto");
    $(".audio-progress")?.classList.add("practice-seek-waiting");
    paintSeekPosition(seekState.targetTime);

    writeTargetTime(audio, seekState.targetTime);
    seekState.commitTimer = window.setTimeout(() => verifyAndCommitSeek(token), 70);
  }

  function beginSeekSession(clientX) {
    if (!isQuestionPracticeMode()) return false;

    const audio = $("#exam-audio");
    if (!audio) return false;

    const target = targetTimeFromClientX(clientX);
    if (target === null) return false;

    cancelPendingSeek({ keepUi: true });
    seekState.dragging = true;
    seekState.targetTime = target;
    pauseForSeekSession(audio);
    paintSeekPosition(target);
    return true;
  }

  function updateSeekSession(clientX) {
    if (!seekState.dragging || !isQuestionPracticeMode()) return false;

    const target = targetTimeFromClientX(clientX);
    if (target === null) return false;

    seekState.targetTime = target;
    paintSeekPosition(target);
    return true;
  }

  function finishSeekSession() {
    if (!seekState.dragging) return;
    seekState.dragging = false;

    const target = seekState.targetTime;
    if (target === null) return;

    // wasPlaying 값은 beginSeekSession에서 기록했으므로 유지한 채 commit한다.
    const wasPlaying = seekState.wasPlaying;
    commitSeek(target);
    seekState.wasPlaying = wasPlaying;
  }

  function seekByKeyboard(deltaOrAbsolute, absolute = false) {
    if (!isQuestionPracticeMode()) return;

    const audio = $("#exam-audio");
    if (!audio) return;

    const duration = Number(audio.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    const current = Number(audio.currentTime || 0);
    const next = absolute ? Number(deltaOrAbsolute) : current + Number(deltaOrAbsolute || 0);
    const safeMax = Math.max(0, duration - 0.25);
    const target = Math.max(0, Math.min(safeMax, next));

    cancelPendingSeek({ keepUi: true });
    pauseForSeekSession(audio);
    const wasPlaying = seekState.wasPlaying;
    commitSeek(target);
    seekState.wasPlaying = wasPlaying;
  }

  function bindPracticeSeek() {
    const progress = $(".audio-progress");
    const audio = $("#exam-audio");
    if (!progress || !audio) return;

    progress.addEventListener("pointerdown", (event) => {
      if (!isQuestionPracticeMode()) return;
      if (event.button !== undefined && event.button !== 0) return;

      event.preventDefault();
      try { progress.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
      beginSeekSession(event.clientX);
    });

    progress.addEventListener("pointermove", (event) => {
      if (!seekState.dragging || !isQuestionPracticeMode()) return;
      event.preventDefault();
      updateSeekSession(event.clientX);
    });

    const finishDrag = (event) => {
      if (!seekState.dragging) return;
      try { progress.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
      finishSeekSession();
    };

    progress.addEventListener("pointerup", finishDrag);
    progress.addEventListener("pointercancel", finishDrag);

    progress.addEventListener("keydown", (event) => {
      if (!isQuestionPracticeMode()) return;

      const duration = Number(audio.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) return;

      const step = event.shiftKey ? 10 : 5;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekByKeyboard(-step, false);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekByKeyboard(step, false);
      } else if (event.key === "Home") {
        event.preventDefault();
        seekByKeyboard(0, true);
      } else if (event.key === "End") {
        event.preventDefault();
        seekByKeyboard(Math.max(0, duration - 0.25), true);
      }
    });

    // AudioController의 timeupdate가 먼저 실행되어도 pending seek 동안에는 사용자가 지정한 위치를 다시 그린다.
    audio.addEventListener("timeupdate", () => {
      if (seekState.targetTime !== null) {
        paintSeekPosition(seekState.targetTime);
      } else {
        updateSeekAriaValues();
      }
    });

    ["seeking", "seeked", "canplay", "loadeddata", "progress"].forEach((eventName) => {
      audio.addEventListener(eventName, () => {
        if (seekState.targetTime === null) return;
        paintSeekPosition(seekState.targetTime);
        const token = seekState.token;
        if (!seekState.commitTimer) {
          seekState.commitTimer = window.setTimeout(() => verifyAndCommitSeek(token), 20);
        }
      });
    });

    audio.addEventListener("loadedmetadata", () => {
      updatePracticeSeekUi();
      updateSeekAriaValues();
      updateExampleMarker();
    });

    ["loadstart", "emptied"].forEach((eventName) => {
      audio.addEventListener(eventName, () => {
        cancelPendingSeek({ keepUi: false });
        updatePracticeSeekUi();
        updateExampleMarker();
      });
    });
  }

  function initStep23dBottomLayout() {
    ensurePracticeSeekStyle();
    bindSafetyHandlers();
    // Step24K: 문항 선택 연습 seek는 단일 컨트롤러가 담당한다.
    // 기존 Step23D의 이중 seek 바인딩은 실행하지 않는다.
    // bindPracticeSeek();
    updateBottomControls();

    const watchTargets = [
      $("#test-screen"),
      $("#test-header-title"),
      $("#audio-start-btn"),
      $("#current-question-label"),
      $("#total-question-label"),
      $("#question-content")
    ].filter(Boolean);

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(updateBottomControls);
    });

    watchTargets.forEach((target) => {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
    });

    window.addEventListener("pageshow", updateBottomControls);
    window.addEventListener("resize", updateBottomControls);
    window.setInterval(updateBottomControls, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStep23dBottomLayout);
  } else {
    initStep23dBottomLayout();
  }
})();
