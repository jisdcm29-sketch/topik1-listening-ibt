// Step27E: Teacher / student control gate - layout + automatic student timer fix
// Teacher phone: 12345678
// Student goals:
// 1) Keep the same bottom audio/navigation layout as teacher mode.
// 2) Previous button stays in its original position but cannot be used.
// 3) Audio cannot be paused/resumed after playback starts.
// 4) Audio progress bar keeps its original appearance but cannot be seeked.
// 5) Transcript is teacher-only.
// 6) Student question-practice timer always uses the exam's automatic calculated time.
//    The teacher's saved 60/90/unlimited classroom setting is not changed.
(() => {
  "use strict";

  const VERSION = "step27e-20260918";
  const TEACHER_PHONE = "12345678";
  const ACTIVE_PHONE_KEY = "topik1-listening-active-phone-step27e";

  function $(selector) {
    return document.querySelector(selector);
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function testVisible() {
    const screen = $("#test-screen");
    return !!screen && !screen.hidden;
  }

  function currentPhone() {
    const inputPhone = normalizePhone($("#student-phone")?.value || "");
    if (inputPhone) return inputPhone;

    try {
      const saved = normalizePhone(sessionStorage.getItem(ACTIVE_PHONE_KEY) || "");
      if (saved) return saved;
    } catch {}

    try {
      const latest = JSON.parse(localStorage.getItem("topik1-listening-result-latest") || "null");
      const storedPhone = normalizePhone(latest?.student_phone || "");
      if (storedPhone) return storedPhone;
    } catch {}

    return "";
  }

  function rememberPhoneFromLogin() {
    const phone = normalizePhone($("#student-phone")?.value || "");
    if (!phone) return "";
    try {
      sessionStorage.setItem(ACTIVE_PHONE_KEY, phone);
    } catch {}
    return phone;
  }

  function isTeacher() {
    return currentPhone() === TEACHER_PHONE;
  }

  function isQuestionPractice() {
    if (!testVisible()) return false;
    const title = String($("#test-header-title")?.textContent || "").trim();
    return title.includes("선택 문항 연습") || title.includes("문항 선택 연습");
  }

  // Student practice time policy:
  // listening-test.js already calculates question-practice time as:
  // max(5, ceil(questionCount * 1.5)) minutes.
  // Step24I can override it with a saved teacher classroom setting (60/90/unlimited).
  // For students only, force "auto" at read time without modifying the saved teacher setting.
  function installRoleAwarePracticeTimerPolicy() {
    const api = window.TOPIK1PracticeTimer;
    if (!api || api.__step27eRoleAwareTimer === true) return;

    const originalGetStartConfig =
      typeof api.getStartConfig === "function"
        ? api.getStartConfig.bind(api)
        : null;

    if (!originalGetStartConfig) return;

    api.getStartConfig = function () {
      if (currentPhone() && !isTeacher()) {
        return {
          mode: "auto",
          minutes: null,
          unlimited: false
        };
      }
      return originalGetStartConfig();
    };

    api.__step27eRoleAwareTimer = true;
    api.__step27eOriginalGetStartConfig = originalGetStartConfig;
  }

  function closeTranscriptForStudent() {
    const bar = $("#practice-transcript-bar");
    const overlay = $("#practice-transcript-overlay");

    if (bar) {
      bar.hidden = true;
      bar.setAttribute("aria-hidden", "true");
    }

    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  // IMPORTANT: Do not hide/remove the previous button.
  // The bottom-layout CSS reserves a fixed grid column for it.
  // Hiding it changes the structure and caused the distorted student bar.
  function lockPreviousForStudent() {
    const prev = $("#dev-prev-btn");
    if (!prev) return;

    prev.dataset.step27eStudentLocked = "true";
    prev.hidden = false;
    prev.disabled = true;
    prev.setAttribute("aria-disabled", "true");
    prev.removeAttribute("aria-hidden");
    prev.tabIndex = -1;
    prev.title = "학생 모드에서는 이전 문항으로 돌아갈 수 없습니다.";
  }

  function restorePreviousForTeacher() {
    const prev = $("#dev-prev-btn");
    if (!prev || prev.dataset.step27eStudentLocked !== "true") return;

    delete prev.dataset.step27eStudentLocked;
    prev.hidden = false;
    prev.removeAttribute("aria-hidden");
    prev.tabIndex = 0;
    prev.title = "";

    const label = String($("#current-question-label")?.textContent || "0");
    const nums = label.match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
    const currentMax = nums.length ? Math.max(...nums) : 0;
    prev.disabled = currentMax <= 1;
    prev.setAttribute("aria-disabled", prev.disabled ? "true" : "false");
  }

  // Keep all original visual classes so the progress bar/knob looks exactly
  // like teacher mode. Only interaction is disabled.
  function lockPracticeSeekForStudent() {
    const progress = $(".audio-progress");
    if (!progress) return;

    progress.dataset.step27eStudentLocked = "true";
    progress.style.pointerEvents = "none";
    progress.style.cursor = "default";
    progress.removeAttribute("tabindex");
    progress.setAttribute("aria-disabled", "true");
  }

  function restorePracticeSeekForTeacher() {
    const progress = $(".audio-progress");
    if (!progress || progress.dataset.step27eStudentLocked !== "true") return;

    delete progress.dataset.step27eStudentLocked;
    progress.style.pointerEvents = "";
    progress.style.cursor = "";
    progress.removeAttribute("aria-disabled");
  }

  // Keep the original audio button in the same grid cell.
  // Before playback starts, a recovery click is still allowed in case browser
  // autoplay is blocked. Once playback has started, pause/resume is disabled.
  function lockAudioPauseForStudent() {
    if (!isQuestionPractice()) return;

    const btn = $("#audio-start-btn");
    const audio = $("#exam-audio");
    if (!btn || !audio) return;

    const hasPlaybackStarted =
      (!audio.paused && !audio.ended) ||
      btn.classList.contains("playing") ||
      btn.classList.contains("paused") ||
      Number(audio.currentTime || 0) > 0.05;

    if (!hasPlaybackStarted) {
      btn.dataset.step27eStudentLocked = "false";
      return;
    }

    btn.dataset.step27eStudentLocked = "true";

    // Do not remove pause-enabled/playing classes; those classes are part of
    // the existing visual layout. Only disable the action.
    if (!audio.ended) {
      btn.textContent = "재생 중";
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.title = "학생 모드에서는 재생 중 일시정지할 수 없습니다.";
    }
  }

  function restoreAudioControlForTeacher() {
    const btn = $("#audio-start-btn");
    if (!btn || btn.dataset.step27eStudentLocked !== "true") return;

    delete btn.dataset.step27eStudentLocked;
    btn.removeAttribute("aria-disabled");
    btn.title = "";
    // AudioController owns the actual text/state and will refresh it on its
    // next audio event. We intentionally do not force playback state here.
  }

  function lockTeacherOnlyTimerActionsForStudent() {
    const actions = $("#step24h-live-time-actions");
    if (!actions) return;

    actions.dataset.step27eStudentLocked = "true";
    actions.hidden = true;
    actions.setAttribute("aria-hidden", "true");
  }

  function restoreTeacherTimerActions() {
    const actions = $("#step24h-live-time-actions");
    if (!actions || actions.dataset.step27eStudentLocked !== "true") return;

    delete actions.dataset.step27eStudentLocked;
    actions.hidden = false;
    actions.removeAttribute("aria-hidden");
  }

  function applyMode() {
    installRoleAwarePracticeTimerPolicy();

    const body = document.body;
    if (!body) return;

    if (!testVisible()) {
      body.classList.remove("step27e-teacher-mode", "step27e-student-mode");
      return;
    }

    const teacher = isTeacher();

    body.classList.toggle("step27e-teacher-mode", teacher);
    body.classList.toggle("step27e-student-mode", !teacher);

    if (teacher) {
      restorePreviousForTeacher();
      restorePracticeSeekForTeacher();
      restoreAudioControlForTeacher();
      restoreTeacherTimerActions();
      return;
    }

    closeTranscriptForStudent();
    lockPreviousForStudent();

    if (isQuestionPractice()) {
      lockPracticeSeekForStudent();
      lockAudioPauseForStudent();
      lockTeacherOnlyTimerActionsForStudent();
    }
  }

  function blockRestrictedInteraction(event) {
    if (!testVisible() || isTeacher()) return;

    const target = event.target?.nodeType === 1
      ? event.target
      : event.target?.parentElement;

    if (!target?.closest) return;

    if (target.closest("#practice-transcript-open-btn, #practice-transcript-overlay")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeTranscriptForStudent();
      return;
    }

    if (target.closest("#dev-prev-btn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      lockPreviousForStudent();
      return;
    }

    if (isQuestionPractice() && target.closest(".audio-progress")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (isQuestionPractice() && target.closest("#step24h-live-time-actions")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (isQuestionPractice() && target.closest("#audio-start-btn")) {
      const btn = $("#audio-start-btn");
      const audio = $("#exam-audio");
      if (!btn || !audio) return;

      const isPauseOrResumeAction =
        !audio.paused ||
        btn.classList.contains("playing") ||
        btn.classList.contains("paused") ||
        Number(audio.currentTime || 0) > 0.05;

      // Allow a first manual play only when autoplay did not start.
      if (isPauseOrResumeAction) {
        event.preventDefault();
        event.stopImmediatePropagation();
        lockAudioPauseForStudent();
      }
    }
  }

  function injectStyle() {
    if ($("#step27e-teacher-student-style")) return;

    // Remove the previous Step27D injected style if a stale page happened to
    // contain it. A normal reload will not have it, but this makes testing safer.
    $("#step27d-teacher-student-style")?.remove();

    const style = document.createElement("style");
    style.id = "step27e-teacher-student-style";
    style.textContent = `
      /* Transcript is teacher-only. */
      body.step27e-student-mode #practice-transcript-bar,
      body.step27e-student-mode #practice-transcript-overlay,
      body.step27e-student-mode #step24h-live-time-actions {
        display: none !important;
      }

      /* Preserve the teacher bottom-bar geometry. Previous remains in-grid. */
      body.step27e-student-mode #dev-prev-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        opacity: 0.45 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
      }

      /* Preserve the existing progress bar and knob appearance; only disable input. */
      body.step27e-student-mode .audio-progress {
        cursor: default !important;
      }

      body.step27e-student-mode #audio-start-btn[data-step27e-student-locked="true"] {
        cursor: default !important;
        opacity: 1 !important;
      }

      /* When teacher-only time buttons are hidden, avoid an empty third grid column. */
      body.step27e-student-mode .remain-time-box.step24h-practice-live {
        grid-template-columns: auto auto !important;
        min-width: 230px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyle();
    installRoleAwarePracticeTimerPolicy();

    // Capture the phone and install the timer policy BEFORE listening-test.js
    // handles the start click and reads TOPIK1PracticeTimer.getStartConfig().
    $("#start-test-btn")?.addEventListener("click", () => {
      rememberPhoneFromLogin();
      installRoleAwarePracticeTimerPolicy();

      window.setTimeout(applyMode, 0);
      window.setTimeout(applyMode, 120);
      window.setTimeout(applyMode, 350);
      window.setTimeout(applyMode, 800);
    }, true);

    document.addEventListener("click", blockRestrictedInteraction, true);
    document.addEventListener("pointerdown", blockRestrictedInteraction, true);

    document.addEventListener("keydown", (event) => {
      if (!testVisible() || isTeacher()) return;

      if (event.target?.closest?.("#dev-prev-btn")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (isQuestionPractice()) {
        const progress = $(".audio-progress");
        if (progress && document.activeElement === progress) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    }, true);

    window.addEventListener("pageshow", applyMode);
    window.addEventListener("topik1:examTimerChange", applyMode);

    // Existing scripts refresh navigation/audio states dynamically.
    // Re-assert restrictions without changing their visual layout.
    window.setInterval(applyMode, 180);

    applyMode();
  }

  window.TOPIK1RoleGate = {
    version: VERSION,
    teacherPhone: TEACHER_PHONE,
    getPhone: currentPhone,
    isTeacher,
    apply: applyMode
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
