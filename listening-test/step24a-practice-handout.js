// Step24A: 문항 선택 연습 -> 학생용 유인물 출력 연결
// 핵심 시험 로직(listening-test.js)은 수정하지 않고 DOM의 현재 선택 상태만 읽는다.
(function () {
  "use strict";

  const PRINT_PAGE = "../listening-practice-print/index.html";
  const WRAP_ID = "question-practice-handout-wrap";
  const BUTTON_ID = "question-practice-handout-btn";
  const STYLE_ID = "step24a-practice-handout-style";

  function $(selector) {
    return document.querySelector(selector);
  }

  function inferRoundFromExamId(examId) {
    const text = String(examId || "");
    const direct = text.match(/(?:^|-)listening-(\d{2,4})(?:-|$)/i);
    if (direct) return direct[1];
    const fallback = text.match(/(?:^|[^0-9])(\d{2,4})(?:[^0-9]|$)/);
    return fallback ? fallback[1] : "";
  }

  function getSelection() {
    const rangeButton = $("[data-question-practice-range].active");
    const roundButtons = Array.from(document.querySelectorAll("[data-question-practice-exam-id].active"));

    const range = String(rangeButton?.dataset?.questionPracticeRange || "").trim();
    const examIds = roundButtons
      .map((btn) => String(btn.dataset.questionPracticeExamId || "").trim())
      .filter(Boolean);
    const rounds = [...new Set(examIds.map(inferRoundFromExamId).filter(Boolean))];
    const typeLabel = String(rangeButton?.textContent || "").trim();

    return {
      range,
      examIds,
      rounds,
      typeLabel,
      ready: !!range && examIds.length > 0
    };
  }

  function ensureStyle() {
    if ($("#" + STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${WRAP_ID} {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #d8e4f6;
      }
      #${BUTTON_ID} {
        width: 100%;
        min-height: 42px;
        padding: 9px 12px;
        border: 2px solid #1d73e8;
        border-radius: 9px;
        background: #ffffff;
        color: #0b4fa8;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
      }
      #${BUTTON_ID}:hover:not(:disabled) {
        background: #eef6ff;
      }
      #${BUTTON_ID}:disabled {
        cursor: not-allowed;
        opacity: 0.48;
        background: #f4f6f9;
      }
      #${WRAP_ID} .question-practice-handout-note {
        margin: 6px 2px 0;
        color: #617089;
        font-size: 12px;
        line-height: 1.35;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    const panel = $("#question-practice-panel");
    const status = $("#question-practice-status");
    if (!panel || !status) return null;

    let wrap = $("#" + WRAP_ID);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = WRAP_ID;
      wrap.innerHTML = `
        <button id="${BUTTON_ID}" type="button" disabled>선택한 문항 학생용 유인물 출력</button>
        <p class="question-practice-handout-note">선택한 회차와 유형을 출력 화면에 자동으로 적용합니다.</p>
      `;
      status.insertAdjacentElement("afterend", wrap);

      $("#" + BUTTON_ID)?.addEventListener("click", openSelectedHandout);
    }

    return wrap;
  }

  function updateUi() {
    ensureStyle();
    ensureUi();

    const button = $("#" + BUTTON_ID);
    if (!button) return;

    const selection = getSelection();
    button.disabled = !selection.ready;
    button.setAttribute("aria-disabled", button.disabled ? "true" : "false");

    if (selection.ready) {
      const roundCount = selection.examIds.length;
      button.textContent = `선택한 문항 학생용 유인물 출력 (${roundCount}개 회차)`;
      button.title = `${selection.typeLabel || selection.range} · ${roundCount}개 회차`;
    } else {
      button.textContent = "선택한 문항 학생용 유인물 출력";
      button.title = "회차와 유형을 먼저 선택하세요.";
    }
  }

  function openSelectedHandout() {
    const selection = getSelection();
    if (!selection.ready) {
      alert("유인물로 출력할 회차와 유형을 먼저 선택하세요.");
      updateUi();
      return;
    }

    const params = new URLSearchParams();
    params.set("from", "question-practice");
    params.set("range", selection.range);
    params.set("exam_ids", selection.examIds.join(","));
    if (selection.rounds.length) params.set("rounds", selection.rounds.join(","));
    params.set("type_label", selection.typeLabel || selection.range);
    params.set("title", `TOPIK I 듣기 ${selection.typeLabel || selection.range} 연습`);
    params.set("student", "1");
    params.set("auto", "1");
    params.set("v", "step24a");

    const url = `${PRINT_PAGE}?${params.toString()}`;
    const child = window.open(url, "_blank");
    if (child) {
      try { child.opener = null; } catch { /* ignore */ }
    } else {
      window.location.href = url;
    }
  }

  function init() {
    ensureStyle();
    ensureUi();
    updateUi();

    const panel = $("#question-practice-panel");
    if (panel) {
      const observer = new MutationObserver(() => {
        window.requestAnimationFrame(updateUi);
      });
      observer.observe(panel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-pressed", "disabled"]
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target?.closest?.("[data-question-practice-range], [data-question-practice-exam-id], #question-practice-clear-btn");
      if (!target) return;
      window.setTimeout(updateUi, 0);
    }, true);

    window.addEventListener("pageshow", updateUi);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
