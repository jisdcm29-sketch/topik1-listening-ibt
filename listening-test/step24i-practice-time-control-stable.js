// Step24I: Step24H 문항 선택 연습 시간 제어 안정화
// 원인: Step24H의 MutationObserver가 자신이 만든 DOM/속성 변경을 다시 감지하여
//       requestAnimationFrame -> DOM 변경 -> MutationObserver가 반복되는 루프를 만들 수 있었다.
// 해결: MutationObserver/전역 click 감시를 제거하고, 필요한 이벤트만 직접 사용한다.
(function () {
  "use strict";

  const STORAGE_KEY = "topik1-question-practice-timer-mode";
  const VALID_MODES = new Set(["auto", "60", "90", "unlimited"]);

  function $(selector) {
    return document.querySelector(selector);
  }

  function readMode() {
    try {
      const saved = String(localStorage.getItem(STORAGE_KEY) || "auto");
      return VALID_MODES.has(saved) ? saved : "auto";
    } catch {
      return "auto";
    }
  }

  function saveMode(mode) {
    const normalized = VALID_MODES.has(String(mode || "")) ? String(mode) : "auto";
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // localStorage 사용 불가 시 현재 화면에서만 동작한다.
    }
    return normalized;
  }

  function modeLabel(mode) {
    if (mode === "60") return "60분";
    if (mode === "90") return "90분";
    if (mode === "unlimited") return "제한 없음";
    return "자동";
  }

  function getStartConfig() {
    const mode = readMode();
    if (mode === "60") return { mode, minutes: 60, unlimited: false };
    if (mode === "90") return { mode, minutes: 90, unlimited: false };
    if (mode === "unlimited") return { mode, minutes: null, unlimited: true };
    return { mode: "auto", minutes: null, unlimited: false };
  }

  // listening-test.js가 시험 시작 설정을 읽을 때 사용하는 공개 인터페이스.
  window.TOPIK1PracticeTimer = {
    getStartConfig,
    getMode: readMode,
    setMode(mode) {
      const saved = saveMode(mode);
      updateStartControl();
      return saved;
    }
  };

  function ensureStartControl() {
    const panel = $("#question-practice-panel");
    if (!panel) return;

    let control = $("#step24h-practice-time-start");
    if (!control) {
      control = document.createElement("div");
      control.id = "step24h-practice-time-start";
      control.className = "step24h-practice-time-start";
      control.setAttribute("aria-label", "문항 연습 전체 시간 선택");
      control.innerHTML = `
        <strong class="step24h-time-title">전체 시간</strong>
        <div class="step24h-time-mode-buttons">
          <button type="button" data-step24h-time-mode="auto">자동</button>
          <button type="button" data-step24h-time-mode="60">60분</button>
          <button type="button" data-step24h-time-mode="90">90분</button>
          <button type="button" data-step24h-time-mode="unlimited">제한 없음</button>
        </div>
        <span class="step24h-time-note">문항 연습에만 적용</span>
      `;

      const quickGrid = panel.querySelector(".question-practice-quick-grid");
      if (quickGrid) panel.insertBefore(control, quickGrid);
      else panel.appendChild(control);

      control.querySelectorAll("[data-step24h-time-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          saveMode(btn.dataset.step24hTimeMode || "auto");
          updateStartControl();
        });
      });
    }

    updateStartControl();
  }

  function updateStartControl() {
    const control = $("#step24h-practice-time-start");
    if (!control) return;

    const mode = readMode();
    control.querySelectorAll("[data-step24h-time-mode]").forEach((btn) => {
      const active = btn.dataset.step24hTimeMode === mode;
      if (btn.classList.contains("active") !== active) {
        btn.classList.toggle("active", active);
      }
      const nextPressed = active ? "true" : "false";
      if (btn.getAttribute("aria-pressed") !== nextPressed) {
        btn.setAttribute("aria-pressed", nextPressed);
      }
    });

    control.dataset.mode = mode;
    control.title = `문항 연습 전체 시간: ${modeLabel(mode)}`;
  }

  function isPracticeTestVisible() {
    const screen = $("#test-screen");
    if (!screen || screen.hidden) return false;
    const title = String($("#test-header-title")?.textContent || "").trim();
    return title.includes("선택 문항 연습") || title.includes("문항 선택 연습");
  }

  function timerApi() {
    try {
      if (window.ListeningTestApp) return window.ListeningTestApp;
    } catch {
      // ignore
    }

    try {
      return typeof ListeningTestApp !== "undefined" ? ListeningTestApp : null;
    } catch {
      return null;
    }
  }

  function timerSnapshot() {
    try {
      return timerApi()?.getExamTimerSnapshot?.() || null;
    } catch {
      return null;
    }
  }

  function resetNormalTimerBox() {
    const box = $(".remain-time-box");
    if (!box) return;

    box.classList.remove("step24h-practice-live", "step24h-timer-paused", "step24h-timer-unlimited");
    box.removeAttribute("title");

    const label = box.querySelector("span");
    if (label && (label.textContent === "수업용" || label.textContent.includes("정지"))) {
      label.textContent = "남은 시간";
    }

    const old = $("#step24h-live-time-actions");
    if (old) old.remove();
  }

  function ensureLiveControls() {
    const box = $(".remain-time-box");
    if (!box) return;

    if (!isPracticeTestVisible()) {
      resetNormalTimerBox();
      return;
    }

    box.classList.add("step24h-practice-live");

    let actions = $("#step24h-live-time-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.id = "step24h-live-time-actions";
      actions.className = "step24h-live-time-actions";
      actions.innerHTML = `
        <button type="button" id="step24h-timer-pause-btn">시간 정지</button>
        <button type="button" id="step24h-timer-add-btn">+10분</button>
      `;
      box.appendChild(actions);

      $("#step24h-timer-pause-btn")?.addEventListener("click", () => {
        const api = timerApi();
        const snap = timerSnapshot();
        if (!api || !snap || snap.unlimited) return;

        if (snap.paused) api.resumePracticeExamTimer?.();
        else api.pausePracticeExamTimer?.();

        updateLiveControls();
      });

      $("#step24h-timer-add-btn")?.addEventListener("click", () => {
        const api = timerApi();
        if (!api) return;
        api.addPracticeExamTime?.(600);
        updateLiveControls();
      });
    }

    updateLiveControls();
  }

  function updateLiveControls() {
    if (!isPracticeTestVisible()) return;

    const box = $(".remain-time-box");
    const label = box?.querySelector("span");
    const pauseBtn = $("#step24h-timer-pause-btn");
    const addBtn = $("#step24h-timer-add-btn");
    const snap = timerSnapshot();
    if (!box || !snap) return;

    box.classList.toggle("step24h-timer-paused", !!snap.paused);
    box.classList.toggle("step24h-timer-unlimited", !!snap.unlimited);

    if (snap.unlimited) {
      if (label) label.textContent = "수업용";
      const remain = $("#remain-time");
      if (remain) remain.textContent = "제한 없음";
      if (pauseBtn) pauseBtn.hidden = true;
      if (addBtn) addBtn.hidden = true;
      box.title = "문항 연습 수업용: 자동 종료 없음";
      return;
    }

    if (label) label.textContent = snap.paused ? "남은 시간 · 정지" : "남은 시간";
    if (pauseBtn) {
      pauseBtn.hidden = false;
      pauseBtn.textContent = snap.paused ? "시간 계속" : "시간 정지";
      pauseBtn.classList.toggle("active", !!snap.paused);
    }
    if (addBtn) addBtn.hidden = false;

    box.title = snap.paused
      ? "전체 시험 시간만 정지됨 — 오디오와는 별도입니다."
      : "문항 연습 전체 시간 제어";
  }

  function init() {
    // 첫 화면 컨트롤은 DOM이 준비된 뒤 한 번만 만든다.
    ensureStartControl();

    // 시험 시작 시 prepareTestScreen -> startOverallExamTimer 순서로 진행되며,
    // startOverallExamTimer가 topik1:examTimerChange를 발생시키므로 이 이벤트만으로 충분하다.
    window.addEventListener("topik1:examTimerChange", () => {
      ensureLiveControls();
      updateLiveControls();
    });

    // 브라우저/실행 순서 차이에 대비한 제한된 보조 확인.
    const startBtn = $("#start-test-btn");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        window.setTimeout(ensureLiveControls, 0);
        window.setTimeout(ensureLiveControls, 250);
      });
    }

    window.addEventListener("pageshow", () => {
      ensureStartControl();
      if (isPracticeTestVisible()) ensureLiveControls();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
