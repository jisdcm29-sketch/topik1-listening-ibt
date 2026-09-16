// Step24A: 문항 선택 연습에서 전달된 회차/유형을 기존 출력 도구에 자동 적용한다.
// 기존 listening-practice-print.js는 수정하지 않는다.
(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  if (params.get("from") !== "question-practice") return;

  const MANIFEST_URL = "../listening-test/data/exam-manifest.json";
  const AUTO_PREVIEW_TIMEOUT_MS = 12000;

  function $(selector) {
    return document.querySelector(selector);
  }

  function parseCsv(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseRange(value) {
    const match = String(value || "").match(/^(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    const a = Math.max(1, Math.min(30, Number(match[1])));
    const b = Math.max(1, Math.min(30, Number(match[2])));
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }

  function inferRoundFromExamId(examId) {
    const text = String(examId || "");
    const direct = text.match(/(?:^|-)listening-(\d{2,4})(?:-|$)/i);
    if (direct) return direct[1];
    const fallback = text.match(/(?:^|[^0-9])(\d{2,4})(?:[^0-9]|$)/);
    return fallback ? fallback[1] : "";
  }

  async function resolveRounds(examIds, fallbackRounds) {
    const rounds = new Set((fallbackRounds || []).map(String).filter(Boolean));
    examIds.forEach((id) => {
      const guessed = inferRoundFromExamId(id);
      if (guessed) rounds.add(guessed);
    });

    try {
      const response = await fetch(`${MANIFEST_URL}?v=step24a`, { cache: "no-store" });
      if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
      const manifest = await response.json();
      const wanted = new Set(examIds.map(String));
      (manifest.exams || []).forEach((exam) => {
        if (!wanted.has(String(exam.id || ""))) return;
        const round = String(exam.source_round || "").trim();
        if (round) rounds.add(round);
      });
    } catch (error) {
      console.warn("[Step24A] 회차 manifest 보정 생략:", error);
    }

    return [...rounds];
  }

  function waitForRoundInputs() {
    return new Promise((resolve, reject) => {
      const started = Date.now();

      const check = () => {
        const inputs = Array.from(document.querySelectorAll('input[name="round"]'));
        if (inputs.length) {
          resolve(inputs);
          return;
        }

        if (Date.now() - started >= AUTO_PREVIEW_TIMEOUT_MS) {
          reject(new Error("출력 도구의 회차 목록을 불러오는 시간이 초과되었습니다."));
          return;
        }

        window.setTimeout(check, 100);
      };

      check();
    });
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = String(value);
  }

  function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
  }

  function setBridgeNotice(message, isError = false) {
    let notice = $("#step24a-bridge-notice");
    const control = $(".control-panel");
    if (!control) return;

    if (!notice) {
      notice = document.createElement("section");
      notice.id = "step24a-bridge-notice";
      notice.className = "panel-card no-print";
      control.insertBefore(notice, control.firstChild);
    }

    notice.style.border = isError ? "2px solid #dc2626" : "2px solid #2563eb";
    notice.style.background = isError ? "#fff1f2" : "#eff6ff";
    notice.innerHTML = `<strong>${isError ? "자동 적용 확인 필요" : "문항 선택 연습에서 가져옴"}</strong><p style="margin:6px 0 0;line-height:1.45;">${escapeHtml(message)}</p>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function applySelection() {
    const range = parseRange(params.get("range"));
    const examIds = parseCsv(params.get("exam_ids"));
    const fallbackRounds = parseCsv(params.get("rounds"));
    const typeLabel = String(params.get("type_label") || params.get("range") || "선택 문항").trim();
    const title = String(params.get("title") || `TOPIK I 듣기 ${typeLabel} 연습`).trim();

    if (!range) {
      setBridgeNotice("전달된 문항 범위를 확인할 수 없습니다. 왼쪽에서 범위를 직접 선택해 주세요.", true);
      return;
    }

    setValue("start-number", range.start);
    setValue("end-number", range.end);
    setValue("max-count", 0);
    setValue("sort-order", "round-question");
    setValue("sheet-title", title);

    // 학생 배부용 기본값: 정답/출처/오디오 내부 참조는 숨긴다.
    // 사용자가 출력 화면에서 다시 켤 수 있다.
    setChecked("show-source", false);
    setChecked("include-audio-ref", false);
    setChecked("show-answer-inline", false);
    setChecked("include-answer-key", false);

    try {
      const roundInputs = await waitForRoundInputs();
      const resolvedRounds = await resolveRounds(examIds, fallbackRounds);
      const wanted = new Set(resolvedRounds.map(String));

      roundInputs.forEach((input) => {
        input.checked = wanted.has(String(input.value));
      });

      const matched = roundInputs.filter((input) => input.checked).map((input) => input.value);
      if (!matched.length) {
        roundInputs.forEach((input) => { input.checked = false; });
        setBridgeNotice(`선택 회차를 자동으로 찾지 못했습니다. 문항 범위 ${range.start}~${range.end}는 적용했으며, 왼쪽에서 회차를 직접 선택해 주세요.`, true);
        return;
      }

      setBridgeNotice(`${matched.join(", ")}회 · ${typeLabel} · 학생용 유인물 설정을 자동 적용했습니다.`);

      if (params.get("auto") === "1") {
        window.setTimeout(() => {
          const previewButton = $("#build-preview");
          if (previewButton && !previewButton.disabled) previewButton.click();
        }, 50);
      }
    } catch (error) {
      console.error("[Step24A] 출력 선택 자동 적용 실패:", error);
      setBridgeNotice(`${error.message || error} 문항 범위 ${range.start}~${range.end}는 적용했습니다. 회차를 직접 선택해 주세요.`, true);
    }
  }

  function init() {
    applySelection();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
