// Step25B-1: 문항 선택 연습 전용 듣기 대본 보기 - 학습 방법 안내문 제거
// 안전 원칙:
// 1) 핵심 시험 로직(listening-test.js), 오디오 컨트롤러, 타이머 상태를 읽거나 변경하지 않는다.
// 2) 'TOPIK I 듣기 선택 문항 연습' 화면에서만 버튼을 표시한다.
// 3) 대본 데이터는 data/scripts/transcript-*.json에서 별도로 읽는다.
// 4) 대본 열기/닫기는 오디오 재생, 답안 선택, 이전/다음 이동, 제출 상태에 영향을 주지 않는다.
(function () {
  "use strict";

  const VERSION = "step25b1-practice-transcript";
  const MANIFEST_URL = `./data/scripts/transcript-manifest.json?v=${VERSION}`;
  const BAR_ID = "practice-transcript-bar";
  const BUTTON_ID = "practice-transcript-open-btn";
  const OVERLAY_ID = "practice-transcript-overlay";
  const STYLE_ID = "practice-transcript-style";

  const cache = {
    manifest: null,
    transcripts: new Map(),
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
      button.textContent = hasTranscript ? `${round}회 · 대본` : `${round}회`;
      button.title = hasTranscript
        ? `${round}회 듣기 연습 · 대본 탑재`
        : `${round}회 듣기 연습`;
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

  async function getExam(round) {
    if (cache.exams.has(round)) return cache.exams.get(round);
    try {
      const exam = await loadJson(`./data/exams/listening-${encodeURIComponent(round)}.json?v=${VERSION}`);
      cache.exams.set(round, exam);
      return exam;
    } catch (error) {
      console.warn("[Step25B] 정답 선택지 텍스트를 불러오지 못했습니다. 정답 번호만 표시합니다.", error);
      cache.exams.set(round, null);
      return null;
    }
  }

  function ensureStyle() {
    if ($(`#${STYLE_ID}`)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BAR_ID}[hidden], #${OVERLAY_ID}[hidden] { display: none !important; }

      #${BAR_ID} {
        width: min(100%, 1160px);
        margin: 8px auto 10px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
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
        padding: 18px 28px;
        background: #176fdb;
        color: #ffffff;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
      }

      #${OVERLAY_ID} .pt-head h2 {
        margin: 0;
        font-size: clamp(23px, 2.3vw, 36px);
        line-height: 1.2;
        font-weight: 900;
      }

      #${OVERLAY_ID} .pt-head p {
        margin: 6px 0 0;
        font-size: clamp(13px, 1.1vw, 17px);
        line-height: 1.35;
        opacity: 0.95;
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
        padding: 24px 24px 34px;
      }

      #${OVERLAY_ID} .pt-sheet {
        width: min(1180px, 100%);
        min-height: calc(100% - 8px);
        margin: 0 auto;
        padding: clamp(24px, 3vw, 46px);
        box-sizing: border-box;
        border: 1px solid #d6e3f5;
        border-radius: 22px;
        background: #ffffff;
        box-shadow: 0 14px 40px rgba(32, 68, 120, 0.10);
      }

      #${OVERLAY_ID} .pt-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        align-items: center;
        margin: 0 0 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid #e2eaf5;
        color: #5b6b82;
        font-size: 15px;
        font-weight: 800;
      }

      #${OVERLAY_ID} .pt-dialogue {
        display: grid;
        gap: 16px;
      }

      #${OVERLAY_ID} .pt-line {
        display: grid;
        grid-template-columns: 86px minmax(0, 1fr);
        gap: 18px;
        align-items: start;
        padding: 18px 20px;
        border-radius: 16px;
        background: #f8fbff;
        border: 1px solid #dfeaf8;
      }

      #${OVERLAY_ID} .pt-speaker {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 6px 10px;
        border-radius: 10px;
        background: #e7f1ff;
        color: #155fb5;
        font-size: 17px;
        font-weight: 900;
        white-space: nowrap;
      }

      #${OVERLAY_ID} .pt-text {
        margin: 0;
        font-size: clamp(24px, 2.15vw, 34px);
        line-height: 1.72;
        letter-spacing: -0.02em;
        font-weight: 700;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }


      #${OVERLAY_ID} .pt-answer-footer {
        flex: 0 0 auto;
        position: sticky;
        bottom: 0;
        z-index: 2;
        padding: 14px 24px 16px;
        background: rgba(239, 246, 255, 0.97);
        border-top: 2px solid #c9dcf5;
        box-shadow: 0 -3px 16px rgba(15, 23, 42, 0.08);
        backdrop-filter: blur(8px);
      }

      #${OVERLAY_ID} .pt-answer-inner {
        width: min(1180px, 100%);
        margin: 0 auto;
        display: grid;
        gap: 8px;
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
        #${OVERLAY_ID} .pt-head { padding: 14px 14px; gap: 10px; }
        #${OVERLAY_ID} .pt-close { min-width: 76px; min-height: 42px; padding: 7px 10px; font-size: 15px; }
        #${OVERLAY_ID} .pt-body { padding: 12px 10px 22px; }
        #${OVERLAY_ID} .pt-sheet { padding: 20px 14px; border-radius: 14px; }
        #${OVERLAY_ID} .pt-line { grid-template-columns: 62px minmax(0,1fr); gap: 10px; padding: 14px 12px; }
        #${OVERLAY_ID} .pt-speaker { min-height: 32px; font-size: 14px; }
        #${OVERLAY_ID} .pt-text { font-size: 21px; line-height: 1.62; }
        #${OVERLAY_ID} .pt-answer-footer { padding: 11px 12px 12px; }
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
        <div>
          <h2 id="practice-transcript-title">듣기 대본</h2>
          <p>먼저 듣기를 충분히 한 뒤 대본을 읽고, 직접 번역하거나 내용을 정리해 보세요.</p>
        </div>
        <button type="button" class="pt-close" id="practice-transcript-close-btn">대본 닫기</button>
      </header>
      <div class="pt-body" id="practice-transcript-body"></div>
      <footer class="pt-answer-footer">
        <div class="pt-answer-inner" id="practice-transcript-answers">
          <div class="pt-answer-title">정답</div>
          <div class="pt-answer-row">불러오는 중입니다.</div>
        </div>
      </footer>
    `;
    document.body.appendChild(overlay);

    $("#practice-transcript-close-btn")?.addEventListener("click", closeOverlay);
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

  function circled(number) {
    return ({1:"①",2:"②",3:"③",4:"④"})[Number(number)] || String(number || "-");
  }

  function formatQuestionLabel(questions) {
    const list = (questions || []).map(Number).filter(Number.isFinite);
    if (!list.length) return "";
    if (list.length === 1) return `${list[0]}번`;
    return `${list[0]}~${list[list.length - 1]}번`;
  }

  async function resolveAnswerRows(round, transcript, entry) {
    const exam = await getExam(round);
    const items = Array.isArray(exam?.items) ? exam.items : [];

    return (entry.questions || []).map((q) => {
      const questionNumber = Number(q);
      const item = items.find((candidate) =>
        Number(candidate?.original_question_number || candidate?.question_number) === questionNumber
      );
      const correct = Number(transcript?.answers?.[String(questionNumber)] || item?.correct_answer || 0);
      const option = Array.isArray(item?.options)
        ? item.options.find((candidate) => Number(candidate?.choice) === correct)
        : null;
      const text = String(option?.text || "").trim();

      return {
        questionNumber,
        correct,
        text
      };
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
    const answers = $("#practice-transcript-answers");
    const title = $("#practice-transcript-title");
    if (!overlay || !body || !answers || !title) return;

    overlay.hidden = false;
    title.textContent = `${source.round}회 TOPIK I 듣기 대본`;
    body.innerHTML = `<div class="pt-loading">대본을 불러오는 중입니다.</div>`;
    answers.innerHTML = `<div class="pt-answer-title">정답</div><div class="pt-answer-row">불러오는 중입니다.</div>`;
    $("#practice-transcript-close-btn")?.focus();

    try {
      const transcript = await getTranscript(source.round);
      if (!transcript) throw new Error(`${source.round}회 대본이 아직 등록되지 않았습니다.`);

      const entryId = transcript?.question_index?.[String(source.question)];
      const entry = entryId ? transcript?.entries?.[entryId] : null;
      if (!entry) throw new Error(`${source.round}회 ${source.question}번 대본을 찾지 못했습니다.`);

      const qLabel = formatQuestionLabel(entry.questions);
      title.textContent = `${source.round}회 TOPIK I 듣기 대본 · ${qLabel}`;

      const linesHtml = (entry.lines || []).map((line) => `
        <div class="pt-line">
          <span class="pt-speaker">${escapeHtml(line.speaker || "대본")}</span>
          <p class="pt-text">${escapeHtml(line.text || "")}</p>
        </div>
      `).join("");

      body.innerHTML = `
        <article class="pt-sheet">
          <div class="pt-meta">
            <span>${escapeHtml(source.round)}회</span>
            <span>·</span>
            <span>${escapeHtml(qLabel)}</span>
            ${entry.track ? `<span>·</span><span>${escapeHtml(entry.track)}</span>` : ""}
          </div>
          <div class="pt-dialogue">${linesHtml}</div>
        </article>
      `;

      const rows = await resolveAnswerRows(source.round, transcript, entry);
      const rowsHtml = rows.map((row) => `
        <div class="pt-answer-row">
          <span class="pt-answer-number">${row.questionNumber}번 ${circled(row.correct)}</span>
          ${row.text ? `<span>${escapeHtml(row.text)}</span>` : `<span>정답 ${circled(row.correct)}</span>`}
        </div>
      `).join("");

      answers.innerHTML = `
        <div class="pt-answer-title">정답 확인</div>
        ${rowsHtml || `<div class="pt-answer-row">정답 정보를 불러오지 못했습니다.</div>`}
      `;
    } catch (error) {
      console.error("[Step25B] 대본 표시 실패", error);
      body.innerHTML = `<div class="pt-error">${escapeHtml(error?.message || "대본을 표시하지 못했습니다.")}</div>`;
      answers.innerHTML = `<div class="pt-answer-title">정답</div><div class="pt-answer-row">표시할 수 없습니다.</div>`;
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
      console.warn("[Step25B] 대본 목록을 불러오지 못했습니다.", error);
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
