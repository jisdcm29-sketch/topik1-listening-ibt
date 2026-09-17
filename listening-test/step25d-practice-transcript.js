// Step25D: question-practice-only listening transcript viewer with Mongolian translation
// Changes from Step25C-1:
// - Transcript still opens by itself in a compact one-screen-oriented layout.
// - "질문 보기", "정답 보기", "몽골어 번역 보기" are independent toggle buttons.
// - Questions, answers, and Mongolian translation are all hidden by default.
// - Mongolian translation data is loaded from a separate translation JSON only for display.
// Safety principles:
// - Does not modify listening-test.js, audio controller, timer, answers, or navigation state.
// - Runs only on the "TOPIK I 듣기 선택 문항 연습" test screen.
// - Reads transcript/exam JSON only for display.
(function () {
  "use strict";

  const VERSION = "step25d-mn-translation";
  const MANIFEST_URL = `./data/scripts/transcript-manifest.json?v=${VERSION}`;
  const TRANSLATION_MANIFEST_URL = `./data/scripts/translations/translation-manifest.json?v=${VERSION}`;
  const BAR_ID = "practice-transcript-bar";
  const BUTTON_ID = "practice-transcript-open-btn";
  const OVERLAY_ID = "practice-transcript-overlay";
  const STYLE_ID = "practice-transcript-style";
  const QUESTION_TOGGLE_ID = "practice-transcript-question-toggle";
  const QUESTION_DETAILS_ID = "practice-transcript-question-details";
  const ANSWER_TOGGLE_ID = "practice-transcript-answer-toggle";
  const ANSWER_DETAILS_ID = "practice-transcript-answer-details";
  const TRANSLATION_TOGGLE_ID = "practice-transcript-translation-toggle";

  const cache = {
    manifest: null,
    translationManifest: null,
    transcripts: new Map(),
    translations: new Map(),
    exams: new Map()
  };

  let currentSourceKey = "";
  let syncQueued = false;

  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isPracticeScreenActive() {
    const screen = $("#test-screen");
    const title = String($("#test-header-title")?.textContent || "").trim();
    return !!screen && !screen.hidden && title.includes("선택 문항 연습");
  }

  function parseCurrentSource() {
    const content = $("#question-content");
    if (!content) return null;

    const text = String(content.innerText || content.textContent || "");
    const re = /(\d{2,4})\s*회\s*(\d{1,2})(?:\s*[~\-–]\s*(\d{1,2}))?\s*번/g;
    const match = re.exec(text);
    if (!match) return null;

    const round = String(match[1]);
    const startQuestion = Number(match[2]);
    const endQuestion = Number(match[3] || match[2]);
    if (!Number.isFinite(startQuestion) || startQuestion < 1) return null;

    return {
      round,
      question: startQuestion,
      endQuestion,
      key: `${round}:${startQuestion}-${endQuestion}`
    };
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }

  async function getManifest() {
    if (cache.manifest) return cache.manifest;
    cache.manifest = await loadJson(MANIFEST_URL);
    return cache.manifest;
  }

  function inferRoundFromExamId(examId) {
    const text = String(examId || "");
    const match = text.match(/(?:^|-)listening-(\d{2,4})(?:-|$)/i);
    if (match) return match[1];
    const fallback = text.match(/(?:^|[^0-9])(\d{2,4})(?:[^0-9]|$)/);
    return fallback ? fallback[1] : "";
  }

  async function syncPracticeRoundLabels() {
    const buttons = Array.from(document.querySelectorAll("[data-question-practice-exam-id]"));
    if (!buttons.length) return;

    let manifest = null;
    try {
      manifest = await getManifest();
    } catch {
      manifest = null;
    }

    buttons.forEach((button) => {
      const examId = String(button.dataset.questionPracticeExamId || "");
      const round = inferRoundFromExamId(examId);
      if (!round) return;

      if (!button.dataset.originalPracticeLabel) {
        button.dataset.originalPracticeLabel = String(button.textContent || "").trim();
      }

      const hasTranscript = !!manifest?.rounds?.[round];
      button.textContent = button.dataset.originalPracticeLabel || String(button.textContent || "").trim();
      button.title = hasTranscript ? `${round}회 듣기 연습 · 대본 탑재` : `${round}회 듣기 연습`;
      button.setAttribute("aria-label", button.title);
    });
  }

  async function getTranscript(round) {
    if (cache.transcripts.has(round)) return cache.transcripts.get(round);
    const manifest = await getManifest();
    const url = manifest?.rounds?.[round];
    if (!url) return null;
    const data = await loadJson(`${url}${url.includes("?") ? "&" : "?"}v=${VERSION}`);
    cache.transcripts.set(round, data);
    return data;
  }

  async function getTranslationManifest() {
    if (cache.translationManifest) return cache.translationManifest;
    try {
      cache.translationManifest = await loadJson(TRANSLATION_MANIFEST_URL);
      return cache.translationManifest;
    } catch (error) {
      console.warn("[Step25D] 몽골어 번역 목록을 불러오지 못했습니다.", error);
      return null;
    }
  }

  async function getTranslation(round) {
    if (cache.translations.has(round)) return cache.translations.get(round);
    const manifest = await getTranslationManifest();
    const url = manifest?.rounds?.[round];
    if (!url) {
      cache.translations.set(round, null);
      return null;
    }
    try {
      const data = await loadJson(`${url}${url.includes("?") ? "&" : "?"}v=${VERSION}`);
      cache.translations.set(round, data);
      return data;
    } catch (error) {
      console.warn(`[Step25D] ${round}회 몽골어 번역을 불러오지 못했습니다.`, error);
      cache.translations.set(round, null);
      return null;
    }
  }

  async function getExam(round) {
    if (cache.exams.has(round)) return cache.exams.get(round);
    try {
      const exam = await loadJson(`./data/exams/listening-${encodeURIComponent(round)}.json?v=${VERSION}`);
      cache.exams.set(round, exam);
      return exam;
    } catch (error) {
      console.warn("[Step25D] 시험 문항 표시 데이터를 불러오지 못했습니다.", error);
      cache.exams.set(round, null);
      return null;
    }
  }

  function ensureStyle() {
    if ($(`#${STYLE_ID}`)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BAR_ID}[hidden], #${OVERLAY_ID}[hidden], #${QUESTION_DETAILS_ID}[hidden], #${ANSWER_DETAILS_ID}[hidden], #${TRANSLATION_TOGGLE_ID}[hidden], #${OVERLAY_ID} .pt-mn[hidden] { display: none !important; }

      #${BAR_ID} {
        width: min(100%, 1160px);
        margin: 8px auto 10px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }

      #${BUTTON_ID} {
        min-width: 220px;
        min-height: 44px;
        padding: 9px 20px;
        border: 2px solid #1d73e8;
        border-radius: 12px;
        background: #ffffff;
        color: #0b4fa8;
        font-size: 17px;
        font-weight: 900;
        line-height: 1.2;
        cursor: pointer;
        box-shadow: 0 3px 10px rgba(29, 115, 232, 0.10);
      }
      #${BUTTON_ID}:hover:not(:disabled) { background: #eef6ff; }
      #${BUTTON_ID}:focus-visible { outline: 3px solid rgba(37, 99, 235, 0.32); outline-offset: 2px; }
      #${BUTTON_ID}:disabled { opacity: 0.5; cursor: not-allowed; }

      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: flex;
        flex-direction: column;
        background: #f4f8ff;
        color: #0f172a;
        font-family: inherit;
      }

      #${OVERLAY_ID} .pt-head {
        flex: 0 0 auto;
        position: sticky;
        top: 0;
        z-index: 2;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px;
        align-items: center;
        padding: 12px 20px;
        background: #176fdb;
        color: #ffffff;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
      }

      #${OVERLAY_ID} .pt-head h2 {
        margin: 0;
        font-size: clamp(22px, 2vw, 31px);
        line-height: 1.2;
        font-weight: 900;
      }

      #${OVERLAY_ID} .pt-close {
        min-width: 96px;
        min-height: 46px;
        padding: 8px 16px;
        border: 2px solid rgba(255,255,255,0.9);
        border-radius: 12px;
        background: #ffffff;
        color: #1257a8;
        font-size: 17px;
        font-weight: 900;
        cursor: pointer;
      }

      #${OVERLAY_ID} .pt-body {
        flex: 1 1 auto;
        overflow: auto;
        padding: 12px 18px 14px;
      }

      #${OVERLAY_ID} .pt-sheet {
        width: min(1260px, 100%);
        margin: 0 auto;
        padding: 16px 22px 18px;
        box-sizing: border-box;
        border: 1px solid #d6e3f5;
        border-radius: 16px;
        background: #ffffff;
        box-shadow: 0 10px 28px rgba(32, 68, 120, 0.08);
      }

      #${OVERLAY_ID} .pt-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        align-items: center;
        margin: 0 0 10px;
        padding-bottom: 8px;
        border-bottom: 2px solid #e2eaf5;
        color: #5b6b82;
        font-size: 15px;
        font-weight: 800;
      }

      #${OVERLAY_ID} .pt-dialogue {
        display: grid;
        gap: 8px;
      }

      #${OVERLAY_ID} .pt-line {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        padding: 9px 12px;
        border-radius: 11px;
        background: #f8fbff;
        border: 1px solid #dfeaf8;
      }

      #${OVERLAY_ID} .pt-speaker {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 30px;
        padding: 4px 8px;
        border-radius: 8px;
        background: #e7f1ff;
        color: #155fb5;
        font-size: 14px;
        font-weight: 900;
        white-space: nowrap;
      }

      #${OVERLAY_ID} .pt-line-texts {
        min-width: 0;
      }

      #${OVERLAY_ID} .pt-text {
        margin: 0;
        font-size: clamp(21px, 1.55vw, 27px);
        line-height: 1.38;
        letter-spacing: -0.02em;
        font-weight: 700;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }

      #${OVERLAY_ID} .pt-mn {
        margin: 5px 0 0;
        padding-top: 5px;
        border-top: 1px dashed #c9d7ea;
        color: #475569;
        font-size: clamp(16px, 1.18vw, 20px);
        line-height: 1.42;
        font-weight: 650;
        word-break: normal;
        overflow-wrap: anywhere;
      }

      #${OVERLAY_ID} .pt-sheet.pt-density-roomy .pt-text { font-size: clamp(25px, 1.9vw, 31px); line-height: 1.45; }
      #${OVERLAY_ID} .pt-sheet.pt-density-roomy .pt-line { padding: 11px 14px; }
      #${OVERLAY_ID} .pt-sheet.pt-density-compact .pt-text { font-size: clamp(21px, 1.55vw, 27px); line-height: 1.35; }
      #${OVERLAY_ID} .pt-sheet.pt-density-dense .pt-dialogue { gap: 6px; }
      #${OVERLAY_ID} .pt-sheet.pt-density-dense .pt-line { padding: 7px 10px; }
      #${OVERLAY_ID} .pt-sheet.pt-density-dense .pt-text { font-size: clamp(18px, 1.28vw, 22px); line-height: 1.28; }
      #${OVERLAY_ID} .pt-sheet.pt-density-ultra .pt-dialogue { gap: 4px; }
      #${OVERLAY_ID} .pt-sheet.pt-density-ultra .pt-line { grid-template-columns: 60px minmax(0,1fr); gap: 7px; padding: 5px 8px; }
      #${OVERLAY_ID} .pt-sheet.pt-density-ultra .pt-speaker { min-height: 25px; padding: 2px 6px; font-size: 12px; }
      #${OVERLAY_ID} .pt-sheet.pt-density-ultra .pt-text { font-size: clamp(16px, 1.08vw, 19px); line-height: 1.22; }

      #${OVERLAY_ID}.pt-extra-open .pt-body { padding-bottom: 24px; }

      #${OVERLAY_ID} .pt-question-section {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 3px solid #dbe8f8;
      }

      #${OVERLAY_ID} .pt-section-title {
        margin: 0 0 16px;
        color: #154f91;
        font-size: clamp(21px, 1.8vw, 28px);
        line-height: 1.3;
        font-weight: 950;
      }

      #${OVERLAY_ID} .pt-question-list {
        display: grid;
        gap: 18px;
      }

      #${OVERLAY_ID} .pt-question-card {
        padding: 20px 22px;
        border: 2px solid #dbe7f6;
        border-radius: 16px;
        background: #fbfdff;
      }

      #${OVERLAY_ID} .pt-question-prompt {
        margin: 0 0 14px;
        font-size: clamp(20px, 1.75vw, 28px);
        line-height: 1.5;
        font-weight: 900;
        color: #0f2746;
        word-break: keep-all;
      }

      #${OVERLAY_ID} .pt-options {
        display: grid;
        gap: 10px;
      }

      #${OVERLAY_ID} .pt-option {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        padding: 9px 10px;
        border-radius: 10px;
        background: #ffffff;
        border: 1px solid #e0e8f3;
        font-size: clamp(17px, 1.4vw, 22px);
        line-height: 1.5;
        font-weight: 700;
      }

      #${OVERLAY_ID} .pt-option-no {
        color: #176fdb;
        font-weight: 950;
      }

      #${OVERLAY_ID} .pt-option-image {
        display: block;
        max-width: min(100%, 520px);
        max-height: 300px;
        object-fit: contain;
        border-radius: 10px;
      }

      #${OVERLAY_ID} .pt-answer-footer {
        flex: 0 0 auto;
        position: sticky;
        bottom: 0;
        z-index: 2;
        padding: 12px 24px 14px;
        background: rgba(239, 246, 255, 0.98);
        border-top: 2px solid #c9dcf5;
        box-shadow: 0 -3px 16px rgba(15, 23, 42, 0.08);
        backdrop-filter: blur(8px);
      }

      #${OVERLAY_ID} .pt-answer-inner {
        width: min(1260px, 100%);
        margin: 0 auto;
        display: grid;
        gap: 10px;
      }

      #${OVERLAY_ID} .pt-toggle-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
      }

      #${QUESTION_TOGGLE_ID},
      #${ANSWER_TOGGLE_ID},
      #${TRANSLATION_TOGGLE_ID} {
        min-width: 180px;
        min-height: 44px;
        padding: 9px 22px;
        border: 2px solid #176fdb;
        border-radius: 12px;
        background: #ffffff;
        color: #0b4fa8;
        font-size: 17px;
        font-weight: 950;
        cursor: pointer;
      }

      #${QUESTION_TOGGLE_ID}:hover, #${ANSWER_TOGGLE_ID}:hover, #${TRANSLATION_TOGGLE_ID}:hover { background: #eef6ff; }
      #${QUESTION_TOGGLE_ID}:focus-visible, #${ANSWER_TOGGLE_ID}:focus-visible, #${TRANSLATION_TOGGLE_ID}:focus-visible { outline: 3px solid rgba(37, 99, 235, 0.30); outline-offset: 2px; }

      #${ANSWER_DETAILS_ID} {
        display: grid;
        gap: 8px;
        padding-top: 4px;
      }

      #${OVERLAY_ID} .pt-answer-title {
        font-size: 14px;
        font-weight: 900;
        color: #4b5f79;
      }

      #${OVERLAY_ID} .pt-answer-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 9px;
        font-size: clamp(18px, 1.65vw, 25px);
        line-height: 1.4;
        font-weight: 800;
        color: #0f3f7a;
      }

      #${OVERLAY_ID} .pt-answer-number {
        display: inline-flex;
        min-width: 78px;
        color: #b42318;
        font-weight: 950;
      }

      #${OVERLAY_ID} .pt-loading,
      #${OVERLAY_ID} .pt-error {
        padding: 40px 20px;
        text-align: center;
        font-size: 20px;
        font-weight: 800;
      }

      @media (max-width: 720px) {
        #${BAR_ID} { margin: 6px auto 8px; padding: 6px 10px; }
        #${BUTTON_ID} { width: 100%; min-height: 42px; font-size: 15px; }
        #${OVERLAY_ID} .pt-head { padding: 14px; gap: 10px; }
        #${OVERLAY_ID} .pt-close { min-width: 76px; min-height: 42px; padding: 7px 10px; font-size: 15px; }
        #${OVERLAY_ID} .pt-body { padding: 8px 8px 10px; }
        #${OVERLAY_ID} .pt-sheet { padding: 12px 10px; border-radius: 12px; }
        #${OVERLAY_ID} .pt-line { grid-template-columns: 56px minmax(0,1fr); gap: 7px; padding: 7px 8px; }
        #${OVERLAY_ID} .pt-speaker { min-height: 26px; font-size: 12px; }
        #${OVERLAY_ID} .pt-text { font-size: 18px; line-height: 1.32; }
        #${OVERLAY_ID} .pt-question-card { padding: 15px 12px; }
        #${OVERLAY_ID} .pt-option { grid-template-columns: 32px minmax(0,1fr); font-size: 17px; }
        #${OVERLAY_ID} .pt-answer-footer { padding: 10px 12px 11px; }
        #${QUESTION_TOGGLE_ID}, #${ANSWER_TOGGLE_ID}, #${TRANSLATION_TOGGLE_ID} { min-width: 128px; min-height: 40px; font-size: 15px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureBar() {
    let bar = $(`#${BAR_ID}`);
    if (bar) return bar;

    const content = $("#question-content");
    if (!content) return null;

    bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.hidden = true;
    bar.innerHTML = `<button id="${BUTTON_ID}" type="button">듣기 대본 보기</button>`;
    content.insertAdjacentElement("beforebegin", bar);
    $(`#${BUTTON_ID}`)?.addEventListener("click", openCurrentTranscript);
    return bar;
  }

  function ensureOverlay() {
    let overlay = $(`#${OVERLAY_ID}`);
    if (overlay) return overlay;

    overlay = document.createElement("section");
    overlay.id = OVERLAY_ID;
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "듣기 대본");
    overlay.innerHTML = `
      <header class="pt-head">
        <div><h2 id="practice-transcript-title">듣기 대본</h2></div>
        <button type="button" class="pt-close" id="practice-transcript-close-btn">대본 닫기</button>
      </header>
      <div class="pt-body" id="practice-transcript-body"></div>
      <footer class="pt-answer-footer">
        <div class="pt-answer-inner">
          <div class="pt-toggle-row">
            <button type="button" id="${QUESTION_TOGGLE_ID}" aria-expanded="false">질문 보기</button>
            <button type="button" id="${ANSWER_TOGGLE_ID}" aria-expanded="false">정답 보기</button>
            <button type="button" id="${TRANSLATION_TOGGLE_ID}" aria-expanded="false" hidden>몽골어 번역 보기</button>
          </div>
          <div id="${ANSWER_DETAILS_ID}" hidden aria-live="polite"></div>
        </div>
      </footer>
    `;
    document.body.appendChild(overlay);

    $("#practice-transcript-close-btn")?.addEventListener("click", closeOverlay);
    $(`#${QUESTION_TOGGLE_ID}`)?.addEventListener("click", toggleQuestions);
    $(`#${ANSWER_TOGGLE_ID}`)?.addEventListener("click", toggleAnswers);
    $(`#${TRANSLATION_TOGGLE_ID}`)?.addEventListener("click", toggleTranslation);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeOverlay();
    });

    return overlay;
  }

  function closeOverlay() {
    const overlay = $(`#${OVERLAY_ID}`);
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
  }

  function updateOverlayMode() {
    const overlay = $(`#${OVERLAY_ID}`);
    const questions = $(`#${QUESTION_DETAILS_ID}`);
    const answers = $(`#${ANSWER_DETAILS_ID}`);
    if (!overlay) return;
    const translationOpen = Array.from(document.querySelectorAll(`#${OVERLAY_ID} .pt-mn`)).some((node) => !node.hidden);
    const extraOpen = (!!questions && !questions.hidden) || (!!answers && !answers.hidden) || translationOpen;
    overlay.classList.toggle("pt-extra-open", extraOpen);
  }

  function resetExtraVisibility() {
    const questionButton = $(`#${QUESTION_TOGGLE_ID}`);
    const questionDetails = $(`#${QUESTION_DETAILS_ID}`);
    const answerButton = $(`#${ANSWER_TOGGLE_ID}`);
    const answerDetails = $(`#${ANSWER_DETAILS_ID}`);
    const translationButton = $(`#${TRANSLATION_TOGGLE_ID}`);

    if (questionDetails) questionDetails.hidden = true;
    if (answerDetails) answerDetails.hidden = true;
    document.querySelectorAll(`#${OVERLAY_ID} .pt-mn`).forEach((node) => { node.hidden = true; });
    if (questionButton) {
      questionButton.textContent = "질문 보기";
      questionButton.setAttribute("aria-expanded", "false");
    }
    if (answerButton) {
      answerButton.textContent = "정답 보기";
      answerButton.setAttribute("aria-expanded", "false");
    }
    if (translationButton) {
      translationButton.textContent = "몽골어 번역 보기";
      translationButton.setAttribute("aria-expanded", "false");
    }
    updateOverlayMode();
  }

  function toggleQuestions() {
    const button = $(`#${QUESTION_TOGGLE_ID}`);
    const details = $(`#${QUESTION_DETAILS_ID}`);
    if (!button || !details) return;

    const show = details.hidden;
    details.hidden = !show;
    button.textContent = show ? "질문 숨기기" : "질문 보기";
    button.setAttribute("aria-expanded", show ? "true" : "false");
    updateOverlayMode();
    if (show) details.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function toggleAnswers() {
    const button = $(`#${ANSWER_TOGGLE_ID}`);
    const details = $(`#${ANSWER_DETAILS_ID}`);
    if (!button || !details) return;

    const show = details.hidden;
    details.hidden = !show;
    button.textContent = show ? "정답 숨기기" : "정답 보기";
    button.setAttribute("aria-expanded", show ? "true" : "false");
    updateOverlayMode();
  }

  function toggleTranslation() {
    const button = $(`#${TRANSLATION_TOGGLE_ID}`);
    const lines = Array.from(document.querySelectorAll(`#${OVERLAY_ID} .pt-mn`));
    if (!button || !lines.length || button.hidden) return;

    const show = lines.some((node) => node.hidden);
    lines.forEach((node) => { node.hidden = !show; });
    button.textContent = show ? "몽골어 번역 숨기기" : "몽골어 번역 보기";
    button.setAttribute("aria-expanded", show ? "true" : "false");
    updateOverlayMode();
  }

  function circled(number) {
    return ({1:"①",2:"②",3:"③",4:"④"})[Number(number)] || String(number || "-");
  }

  function formatQuestionLabel(questions) {
    const list = (questions || []).map(Number).filter(Number.isFinite);
    if (!list.length) return "";
    if (list.length === 1) return `${list[0]}번`;
    return `${list[0]}~${list[list.length - 1]}번`;
  }

  function findItem(exam, questionNumber) {
    const items = Array.isArray(exam?.items) ? exam.items : [];
    return items.find((candidate) =>
      Number(candidate?.original_question_number || candidate?.question_number) === Number(questionNumber)
    ) || null;
  }

  function questionPrompt(item, questionNumber) {
    const text = String(
      item?.question_display_text ||
      item?.question ||
      item?.prompt ||
      item?.instruction ||
      ""
    ).trim();
    return text ? `${questionNumber}. ${text}` : `${questionNumber}번`;
  }

  function optionImageUrl(exam, option) {
    const direct = String(option?.image_url || option?.image || option?.src || "").trim();
    if (!direct) return "";
    if (/^(?:https?:|data:|blob:|\/)/i.test(direct) || direct.startsWith("./") || direct.startsWith("../")) {
      return direct;
    }
    const base = String(exam?.image_base_dir || "").replace(/\/$/, "");
    return base ? `${base}/${direct}` : direct;
  }

  function renderQuestions(exam, entry) {
    if (!exam) {
      return `<section class="pt-question-section"><h3 class="pt-section-title">질문</h3><div class="pt-question-card">질문 정보를 불러오지 못했습니다.</div></section>`;
    }

    const cards = (entry.questions || []).map((q) => {
      const item = findItem(exam, q);
      if (!item) {
        return `<article class="pt-question-card"><p class="pt-question-prompt">${escapeHtml(q)}번 질문 정보를 찾지 못했습니다.</p></article>`;
      }

      const options = Array.isArray(item.options) ? item.options : [];
      const optionsHtml = options.map((option) => {
        const choice = Number(option?.choice || option?.number || 0);
        const text = String(option?.text || option?.label || "").trim();
        const imageUrl = optionImageUrl(exam, option);
        const content = imageUrl
          ? `<div>${text ? `<div>${escapeHtml(text)}</div>` : ""}<img class="pt-option-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${q}번 ${choice}번 선택지`)}"></div>`
          : `<div>${escapeHtml(text || "선택지")}</div>`;
        return `<div class="pt-option"><span class="pt-option-no">${circled(choice)}</span>${content}</div>`;
      }).join("");

      return `
        <article class="pt-question-card">
          <p class="pt-question-prompt">${escapeHtml(questionPrompt(item, q))}</p>
          ${optionsHtml ? `<div class="pt-options">${optionsHtml}</div>` : ""}
        </article>
      `;
    }).join("");

    return `
      <section class="pt-question-section">
        <h3 class="pt-section-title">질문</h3>
        <div class="pt-question-list">${cards}</div>
      </section>
    `;
  }

  function transcriptDensity(entry) {
    const lines = Array.isArray(entry?.lines) ? entry.lines : [];
    const lineCount = lines.length;
    const charCount = lines.reduce((sum, line) => sum + String(line?.text || "").length, 0);
    if (lineCount >= 8 || charCount >= 620) return "ultra";
    if (lineCount >= 6 || charCount >= 420) return "dense";
    if (lineCount >= 3 || charCount >= 190) return "compact";
    return "roomy";
  }

  function resolveAnswerRows(exam, transcript, entry) {
    return (entry.questions || []).map((q) => {
      const questionNumber = Number(q);
      const item = findItem(exam, questionNumber);
      const correct = Number(transcript?.answers?.[String(questionNumber)] || item?.correct_answer || 0);
      const option = Array.isArray(item?.options)
        ? item.options.find((candidate) => Number(candidate?.choice || candidate?.number) === correct)
        : null;
      const text = String(option?.text || option?.label || "").trim();

      return { questionNumber, correct, text };
    });
  }

  async function openCurrentTranscript() {
    if (!isPracticeScreenActive()) return;

    const source = parseCurrentSource();
    if (!source) {
      alert("현재 문항의 원문항 정보를 찾지 못했습니다.");
      return;
    }

    const overlay = ensureOverlay();
    const body = $("#practice-transcript-body");
    const answerDetails = $(`#${ANSWER_DETAILS_ID}`);
    const title = $("#practice-transcript-title");
    if (!overlay || !body || !answerDetails || !title) return;

    overlay.hidden = false;
    resetExtraVisibility();
    const pendingTranslationButton = $(`#${TRANSLATION_TOGGLE_ID}`);
    if (pendingTranslationButton) {
      pendingTranslationButton.hidden = true;
      pendingTranslationButton.disabled = true;
    }
    title.textContent = `${source.round}회 TOPIK I 듣기 대본`;
    body.innerHTML = `<div class="pt-loading">대본을 불러오는 중입니다.</div>`;
    answerDetails.innerHTML = `<div class="pt-answer-title">정답 확인</div><div class="pt-answer-row">불러오는 중입니다.</div>`;
    $("#practice-transcript-close-btn")?.focus();

    try {
      const [transcript, exam, translation] = await Promise.all([
        getTranscript(source.round),
        getExam(source.round),
        getTranslation(source.round)
      ]);
      if (!transcript) throw new Error(`${source.round}회 대본이 아직 등록되지 않았습니다.`);

      const entryId = transcript?.question_index?.[String(source.question)];
      const entry = entryId ? transcript?.entries?.[entryId] : null;
      if (!entry) throw new Error(`${source.round}회 ${source.question}번 대본을 찾지 못했습니다.`);

      const qLabel = formatQuestionLabel(entry.questions);
      title.textContent = `${source.round}회 TOPIK I 듣기 대본 · ${qLabel}`;

      const translationEntry = translation?.entries?.[entryId] || null;
      const translationLines = Array.isArray(translationEntry?.lines) ? translationEntry.lines : [];
      const linesHtml = (entry.lines || []).map((line, index) => {
        const translationLine = translationLines[index] || null;
        const sourceMatches = String(translationLine?.ko || "").trim() === String(line?.text || "").trim();
        const mn = sourceMatches ? String(translationLine?.mn || "").trim() : "";
        return `
          <div class="pt-line">
            <span class="pt-speaker">${escapeHtml(line.speaker || "대본")}</span>
            <div class="pt-line-texts">
              <p class="pt-text">${escapeHtml(line.text || "")}</p>
              ${mn ? `<p class="pt-mn" lang="mn" hidden>${escapeHtml(mn)}</p>` : ""}
            </div>
          </div>
        `;
      }).join("");

      const density = transcriptDensity(entry);
      body.innerHTML = `
        <article class="pt-sheet pt-density-${density}">
          <div class="pt-meta">
            <span>${escapeHtml(source.round)}회</span>
            <span>·</span>
            <span>${escapeHtml(qLabel)}</span>
            ${entry.track ? `<span>·</span><span>${escapeHtml(entry.track)}</span>` : ""}
          </div>
          <div class="pt-dialogue">${linesHtml}</div>
          <div id="${QUESTION_DETAILS_ID}" hidden>${renderQuestions(exam, entry)}</div>
        </article>
      `;

      const translationButton = $(`#${TRANSLATION_TOGGLE_ID}`);
      const sourceLines = Array.isArray(entry.lines) ? entry.lines : [];
      const hasTranslation = translationLines.length === sourceLines.length && translationLines.every((line, index) =>
        String(line?.ko || "").trim() === String(sourceLines[index]?.text || "").trim() && String(line?.mn || "").trim()
      );
      if (translationButton) {
        translationButton.hidden = !hasTranslation;
        translationButton.disabled = !hasTranslation;
        translationButton.title = hasTranslation ? "한국어 대본 아래에 몽골어 번역을 표시합니다." : "이 문항의 몽골어 번역이 아직 없습니다.";
      }

      const rows = resolveAnswerRows(exam, transcript, entry);
      const rowsHtml = rows.map((row) => `
        <div class="pt-answer-row">
          <span class="pt-answer-number">${row.questionNumber}번 ${circled(row.correct)}</span>
          ${row.text ? `<span>${escapeHtml(row.text)}</span>` : `<span>정답 ${circled(row.correct)}</span>`}
        </div>
      `).join("");

      answerDetails.innerHTML = `
        <div class="pt-answer-title">정답 확인</div>
        ${rowsHtml || `<div class="pt-answer-row">정답 정보를 불러오지 못했습니다.</div>`}
      `;
      resetExtraVisibility();
    } catch (error) {
      console.error("[Step25D] 대본 표시 실패", error);
      body.innerHTML = `<div class="pt-error">${escapeHtml(error?.message || "대본을 표시하지 못했습니다.")}</div>`;
      answerDetails.innerHTML = `<div class="pt-answer-title">정답 확인</div><div class="pt-answer-row">표시할 수 없습니다.</div>`;
      resetExtraVisibility();
    }
  }

  async function syncUi() {
    syncQueued = false;
    ensureStyle();
    await syncPracticeRoundLabels();
    const bar = ensureBar();
    if (!bar) return;

    if (!isPracticeScreenActive()) {
      bar.hidden = true;
      currentSourceKey = "";
      closeOverlay();
      return;
    }

    const source = parseCurrentSource();
    if (!source) {
      bar.hidden = true;
      currentSourceKey = "";
      closeOverlay();
      return;
    }

    if (currentSourceKey && currentSourceKey !== source.key) closeOverlay();
    currentSourceKey = source.key;

    try {
      const manifest = await getManifest();
      const available = !!manifest?.rounds?.[source.round];
      if (!available) {
        bar.hidden = true;
        return;
      }

      bar.hidden = false;
      const button = $(`#${BUTTON_ID}`);
      if (button) {
        button.disabled = false;
        button.textContent = `듣기 대본 보기 · ${source.round}회 ${source.question}번`;
        button.title = "문항 선택 연습 전용 대본입니다. 기존 시험 기능과 독립적으로 표시됩니다.";
      }
    } catch (error) {
      console.warn("[Step25D] 대본 목록을 불러오지 못했습니다.", error);
      bar.hidden = true;
    }
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(syncUi);
  }

  function init() {
    ensureStyle();
    ensureBar();
    ensureOverlay();
    queueSync();

    const content = $("#question-content");
    if (content) {
      const observer = new MutationObserver(queueSync);
      observer.observe(content, { childList: true, subtree: true, characterData: true });
    }

    const practicePanel = $("#question-practice-panel");
    if (practicePanel) {
      const practiceObserver = new MutationObserver(queueSync);
      practiceObserver.observe(practicePanel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-pressed", "disabled"]
      });
    }

    const title = $("#test-header-title");
    if (title) {
      const titleObserver = new MutationObserver(queueSync);
      titleObserver.observe(title, { childList: true, subtree: true, characterData: true });
    }

    const testScreen = $("#test-screen");
    if (testScreen) {
      const screenObserver = new MutationObserver(queueSync);
      screenObserver.observe(testScreen, { attributes: true, attributeFilter: ["hidden"] });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeOverlay();
    });

    window.addEventListener("pageshow", queueSync);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
