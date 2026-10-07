// Step29E: developer-only Mongolian translation for question + existing answer choices.
// - Teacher/developer phone only: 12345678
// - Question Mongolian appears directly below the Korean question when "질문 보기" is open.
// - "선택지 몽골어 보기" is visible only while the question panel is open.
// - Choice Mongolian is inserted directly under each EXISTING Korean choice.
// - No duplicate choice list/section is created.
// - Does not modify scoring, timer, audio, navigation, or result data.
(() => {
  "use strict";

  const VERSION = "step29f-transcript-font-match-20261007";
  const DEVELOPER_PHONE = "12345678";
  const ENDPOINT = window.TOPIK1ResultLogger?.endpoint ||
    "https://script.google.com/macros/s/AKfycbwhl9RJdfqwSPjoQp2_ysrIzT3V5XojfPoXHdvLCdgdL1FymhW6u-BgyHMZIg3SbrRg/exec";
  const BUTTON_ID = "choice-mn-open-btn";
  const QUESTION_TOGGLE_ID = "practice-transcript-question-toggle";
  const QUESTION_DETAILS_ID = "practice-transcript-question-details";
  const QUESTION_MN_CLASS = "choice-mn-question-translation";
  const OPTION_MN_CLASS = "choice-mn-option-translation";
  const STYLE_ID = "choice-mn-style";
  const CACHE_KEY = "topik1-listening-choice-mn-cache-v1";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isTeacher() {
    try {
      if (window.TOPIK1RoleGate?.isTeacher) return !!window.TOPIK1RoleGate.isTeacher();
    } catch (error) {}
    return normalizePhone($("#student-phone")?.value || "") === DEVELOPER_PHONE;
  }

  function isQuestionPanelVisible() {
    const questionDetails = $(`#${QUESTION_DETAILS_ID}`);
    return !!questionDetails && questionDetails.hidden === false;
  }

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveCache(cache) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache || {})); } catch (error) {}
  }

  function injectStyle() {
    if ($(`#${STYLE_ID}`)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}[hidden], .${QUESTION_MN_CLASS}[hidden], .${OPTION_MN_CLASS}[hidden] { display: none !important; }
      #${BUTTON_ID} {
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
      #${BUTTON_ID}:hover:not(:disabled) { background: #eef6ff; }
      #${BUTTON_ID}:focus-visible { outline: 3px solid rgba(37, 99, 235, 0.30); outline-offset: 2px; }
      #${BUTTON_ID}:disabled { opacity: 0.55; cursor: wait; }

      #${QUESTION_DETAILS_ID} .${QUESTION_MN_CLASS} {
        margin: 6px 0 10px;
        padding: 7px 0 0;
        border-top: 1px dashed #c9d9ee;
        color: #365579;
        font-size: 18px;
        line-height: 1.5;
        font-weight: 700;
      }
      /* Step29F: 선택지 한국어/몽골어 글자 스타일을 듣기 대본과 동일하게 맞춘다. */
      #${QUESTION_DETAILS_ID} .pt-option > div {
        min-width: 0;
        color: #0f172a;
        font-size: clamp(21px, 1.55vw, 27px);
        line-height: 1.38;
        letter-spacing: -0.02em;
        font-weight: 700;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }
      #${QUESTION_DETAILS_ID} .${OPTION_MN_CLASS} {
        margin: 5px 0 0;
        color: #475569;
        font-size: clamp(16px, 1.18vw, 20px);
        line-height: 1.42;
        font-weight: 650;
        letter-spacing: normal;
        word-break: normal;
        overflow-wrap: anywhere;
      }
      body.step27e-student-mode #${BUTTON_ID},
      body.step27e-student-mode .${QUESTION_MN_CLASS},
      body.step27e-student-mode .${OPTION_MN_CLASS} { display: none !important; }
      @media (max-width: 720px) {
        #${BUTTON_ID} { min-width: 128px; min-height: 40px; font-size: 15px; }
        #${QUESTION_DETAILS_ID} .${QUESTION_MN_CLASS} { font-size: 15px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureIntegration() {
    const toggleRow = $("#practice-transcript-overlay .pt-toggle-row");
    if (!toggleRow) return false;

    let button = $(`#${BUTTON_ID}`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = BUTTON_ID;
      button.textContent = "선택지 몽골어 보기";
      button.setAttribute("aria-expanded", "false");
      button.hidden = true;
      toggleRow.appendChild(button);
      button.addEventListener("click", toggleChoiceTranslations);
    }

    const questionToggle = $(`#${QUESTION_TOGGLE_ID}`);
    if (questionToggle && questionToggle.dataset.step29eChoiceMnBound !== "true") {
      questionToggle.dataset.step29eChoiceMnBound = "true";
      questionToggle.addEventListener("click", () => {
        window.requestAnimationFrame(() => {
          if (isQuestionPanelVisible()) {
            ensureQuestionTranslations();
          } else {
            hideChoiceTranslations(true);
          }
          refreshAvailability();
        });
      });
    }

    refreshAvailability();
    return true;
  }

  function getQuestionRows() {
    const details = $(`#${QUESTION_DETAILS_ID}`);
    if (!details || details.hidden) return [];

    return $$(".pt-question-card", details).map((card) => {
      const prompt = $(".pt-question-prompt", card);
      if (!prompt) return null;

      const promptRaw = String(prompt.textContent || "").trim();
      const promptText = promptRaw.replace(/^\s*\d+\s*[.．]\s*/, "").trim();

      const options = $$(".pt-option", card).map((optionRow) => {
        const content = $(":scope > div", optionRow);
        if (!content) return null;

        // Ignore any translation node that this module already inserted.
        const clone = content.cloneNode(true);
        $$("." + OPTION_MN_CLASS, clone).forEach((node) => node.remove());
        const image = $("img", clone);
        const text = String(clone.textContent || "").trim();
        if (!text || (image && !text)) return null;
        return { optionRow, content, text };
      }).filter(Boolean);

      return { card, prompt, promptText, options };
    }).filter(Boolean);
  }

  function hasTextChoices() {
    return getQuestionRows().some((row) => row.options.length > 0);
  }

  function refreshAvailability() {
    const button = $(`#${BUTTON_ID}`);
    if (!button) return;

    const available = isTeacher() && isQuestionPanelVisible() && hasTextChoices();
    button.hidden = !available;

    if (!available) {
      hideChoiceTranslations(true);
    }
  }

  function hideChoiceTranslations(resetButton = false) {
    $$("." + OPTION_MN_CLASS).forEach((node) => { node.hidden = true; });
    const button = $(`#${BUTTON_ID}`);
    if (button && resetButton) {
      button.textContent = "선택지 몽골어 보기";
      button.setAttribute("aria-expanded", "false");
      button.disabled = false;
    }
  }

  function showExistingChoiceTranslations() {
    const nodes = $$("." + OPTION_MN_CLASS);
    if (!nodes.length) return false;
    nodes.forEach((node) => { node.hidden = false; });
    return true;
  }

  function choiceTranslationsVisible() {
    return $$("." + OPTION_MN_CLASS).some((node) => node.hidden === false);
  }

  async function ensureQuestionTranslations() {
    if (!isTeacher() || !isQuestionPanelVisible()) return;
    const rows = getQuestionRows().filter((row) => row.promptText);
    if (!rows.length) return;

    try {
      const cache = await translateTexts(rows.map((row) => row.promptText));
      if (!isQuestionPanelVisible()) return;

      rows.forEach((row) => {
        let node = $(`.${QUESTION_MN_CLASS}`, row.card);
        if (!node) {
          node = document.createElement("p");
          node.className = QUESTION_MN_CLASS;
          node.lang = "mn";
          row.prompt.insertAdjacentElement("afterend", node);
        }
        node.hidden = false;
        node.textContent = cache[row.promptText] || "Орчуулга бэлтгэгдэж байна.";
      });
    } catch (error) {
      console.warn("[Step29E Question MN] translation failed:", error);
    }
  }

  function requestTranslationsJsonp(texts) {
    return new Promise((resolve, reject) => {
      const callback = `__topik1ChoiceMn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      let finished = false;
      const timer = window.setTimeout(() => finish(new Error("translation_timeout")), 15000);

      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callback]; } catch (error) { window[callback] = undefined; }
        script.remove();
      }

      function finish(error, data) {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve(data);
      }

      window[callback] = (data) => finish(null, data);
      script.onerror = () => finish(new Error("translation_network_error"));

      const params = new URLSearchParams({
        action: "translate_options",
        phone: DEVELOPER_PHONE,
        callback,
        texts: JSON.stringify(texts)
      });
      script.src = `${ENDPOINT}?${params.toString()}`;
      document.head.appendChild(script);
    });
  }

  async function translateTexts(texts) {
    const cache = loadCache();
    const unique = [...new Set(texts.map((text) => String(text || "").trim()).filter(Boolean))];
    const missing = unique.filter((text) => !cache[text]);

    if (missing.length) {
      const data = await requestTranslationsJsonp(missing);
      if (!data?.ok || !Array.isArray(data.translations)) {
        throw new Error(data?.error || "translation_failed");
      }
      data.translations.forEach((entry) => {
        const ko = String(entry?.ko || "").trim();
        const mn = String(entry?.mn || "").trim();
        if (ko && mn) cache[ko] = mn;
      });
      saveCache(cache);
    }
    return cache;
  }

  async function toggleChoiceTranslations() {
    if (!isTeacher() || !isQuestionPanelVisible()) return;
    ensureIntegration();

    const rows = getQuestionRows();
    const choices = rows.flatMap((row) => row.options);
    const button = $(`#${BUTTON_ID}`);
    if (!button || !choices.length) return;

    if (choiceTranslationsVisible()) {
      hideChoiceTranslations(false);
      button.textContent = "선택지 몽골어 보기";
      button.setAttribute("aria-expanded", "false");
      return;
    }

    // If nodes already exist, simply show them again. Do not rebuild choices.
    if (showExistingChoiceTranslations()) {
      button.textContent = "선택지 몽골어 숨기기";
      button.setAttribute("aria-expanded", "true");
      return;
    }

    button.disabled = true;
    button.textContent = "선택지 번역 불러오는 중";

    try {
      const cache = await translateTexts(choices.map((choice) => choice.text));
      if (!isQuestionPanelVisible()) return;

      choices.forEach((choice) => {
        let node = $(`.${OPTION_MN_CLASS}`, choice.content);
        if (!node) {
          node = document.createElement("p");
          node.className = OPTION_MN_CLASS;
          node.lang = "mn";
          choice.content.appendChild(node);
        }
        node.textContent = cache[choice.text] || "Орчуулга бэлтгэгдэж байна.";
        node.hidden = false;
      });

      button.textContent = "선택지 몽골어 숨기기";
      button.setAttribute("aria-expanded", "true");
    } catch (error) {
      console.warn("[Step29E Choice MN] translation failed:", error);
      button.textContent = "선택지 몽골어 보기";
      button.setAttribute("aria-expanded", "false");
      window.alert("선택지 번역을 불러오지 못했습니다. Apps Script 배포 상태를 확인해 주세요.");
    } finally {
      button.disabled = false;
    }
  }

  let refreshFrame = 0;
  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = window.requestAnimationFrame(() => {
      refreshFrame = 0;
      ensureIntegration();
      refreshAvailability();
      if (isQuestionPanelVisible()) ensureQuestionTranslations();
    });
  }

  function init() {
    injectStyle();
    ensureIntegration();

    const transcriptBody = $("#practice-transcript-body");
    if (transcriptBody) {
      const observer = new MutationObserver((mutations) => {
        const meaningful = mutations.some((m) => {
          const target = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
          return !target?.closest?.(`.${QUESTION_MN_CLASS}, .${OPTION_MN_CLASS}`);
        });
        if (meaningful) scheduleRefresh();
      });
      observer.observe(transcriptBody, { childList: true, subtree: true });
    }

    $("#practice-transcript-open-btn")?.addEventListener("click", scheduleRefresh);
    $("#student-phone")?.addEventListener("input", scheduleRefresh);
    $("#dev-prev-btn")?.addEventListener("click", scheduleRefresh);
    $("#dev-next-btn")?.addEventListener("click", scheduleRefresh);

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideChoiceTranslations(true);
    });
  }

  window.TOPIK1ChoiceMN = {
    version: VERSION,
    refresh: scheduleRefresh,
    isTeacher
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
