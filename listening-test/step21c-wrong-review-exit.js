// Step21e: 오답 다시 풀기 중간 종료 → 현재까지 맞힌 문항 차감 후 진단 보고서 이동
// 목적:
// 1) 인증 화면에서는 무거운 감시/반복 실행을 하지 않는다.
// 2) 오답 다시 풀기 화면에서만 "진단으로 돌아가기" 버튼을 보인다.
// 3) 현재까지 맞힌 문항만 오답풀이 진행 상황에 반영하고 기존 진단 보고서로 돌아간다.
// 4) document.body 전체 감시와 setInterval 반복 감시는 사용하지 않는다.

(function () {
  "use strict";

  const BUTTON_ID = "wrong-review-exit-btn";
  const DIAGNOSIS_BASE_URL = "../listening-diagnosis/index.html";

  let updatePending = false;
  let lastVisible = null;
  let observer = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function getUrlParams() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (error) {
      return new URLSearchParams();
    }
  }

  function getVersionParam() {
    const params = getUrlParams();
    return params.get("v") || "step21e-wrong-review-progress";
  }

  function isWrongReviewUrl() {
    const params = getUrlParams();
    const review = String(params.get("review") || "").toLowerCase();
    const mode = String(params.get("mode") || "").toLowerCase();

    return review === "wrong" ||
      review === "wrong-review" ||
      review === "incorrect-review" ||
      mode === "wrong" ||
      mode === "wrong-review" ||
      mode === "incorrect-review";
  }

  function isTestVisible() {
    const testScreen = $("#test-screen");
    return !!testScreen && !testScreen.hidden;
  }

  function isWrongReviewScreen() {
    const title = $("#test-header-title")?.textContent || "";
    const instruction = $("#section-instruction")?.textContent || "";

    return /오답|다시\s*풀기/.test(title) || /오답/.test(instruction);
  }

  function shouldShowExitButton() {
    return isTestVisible() && (isWrongReviewUrl() || isWrongReviewScreen());
  }

  function ensureExitButton() {
    const layout = $(".bottom-layout");
    if (!layout) return null;

    let btn = document.getElementById(BUTTON_ID);
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.className = "wrong-review-exit-btn";
    btn.textContent = "진단으로 돌아가기";
    btn.setAttribute("aria-label", "오답 다시 풀기를 중간 종료하고 진단 보고서로 돌아가기");
    btn.hidden = true;
    btn.disabled = true;
    btn.setAttribute("aria-hidden", "true");

    const submitBtn = $("#submit-test-btn");
    if (submitBtn && submitBtn.parentNode === layout) {
      layout.insertBefore(btn, submitBtn);
    } else {
      layout.appendChild(btn);
    }

    btn.addEventListener("click", handleExitClick);
    return btn;
  }

  function setClassFlag(el, className, enabled) {
    if (!el) return;
    const hasClass = el.classList.contains(className);
    if (enabled && !hasClass) el.classList.add(className);
    if (!enabled && hasClass) el.classList.remove(className);
  }

  function setExitButtonVisible(visible) {
    const layout = $(".bottom-layout");
    const btn = ensureExitButton();

    setClassFlag(document.body, "wrong-review-active", visible);
    setClassFlag(layout, "wrong-review-active", visible);

    if (!btn) {
      lastVisible = visible;
      return;
    }

    if (btn.hidden === visible) btn.hidden = !visible;
    if (btn.disabled === visible) btn.disabled = !visible;

    const ariaHidden = visible ? "false" : "true";
    if (btn.getAttribute("aria-hidden") !== ariaHidden) {
      btn.setAttribute("aria-hidden", ariaHidden);
    }

    lastVisible = visible;
  }

  function updateExitButton() {
    const visible = shouldShowExitButton();

    // 같은 상태면 DOM 쓰기를 반복하지 않는다.
    // 단, 버튼이 아직 생성되지 않은 경우에는 한 번 더 보정한다.
    if (visible === lastVisible && document.getElementById(BUTTON_ID)) return;

    setExitButtonVisible(visible);
  }

  function scheduleUpdateExitButton() {
    if (updatePending) return;

    updatePending = true;
    window.requestAnimationFrame(() => {
      updatePending = false;
      updateExitButton();
    });
  }

  function stopAudioIfPossible() {
    try {
      if (typeof AudioController !== "undefined" && typeof AudioController.stopForSubmit === "function") {
        AudioController.stopForSubmit();
      }
    } catch (error) {
      console.warn("[step21d] audio stop skipped:", error);
    }
  }

  function buildDiagnosisUrl() {
    const version = encodeURIComponent(getVersionParam());
    return `${DIAGNOSIS_BASE_URL}?auto=1&review=cancel&v=${version}`;
  }

  function handleExitClick(event) {
    event.preventDefault();
    event.stopPropagation();

    updateExitButton();

    if (!shouldShowExitButton()) return;

    const ok = window.confirm(
      "오답 다시 풀기를 중간 종료하고 진단 보고서로 돌아가시겠습니까?\n\n" +
      "현재까지 정답으로 맞힌 문항은 오답풀이 목록에서 차감됩니다.\n" +
      "틀린 문항과 미응답 문항은 다음 오답풀이에 다시 남습니다."
    );

    if (!ok) return;

    const diagnosisUrl = buildDiagnosisUrl();
    window.__TOPIK1_WRONG_REVIEW_EXIT_HANDLED__ = false;

    try {
      window.dispatchEvent(new CustomEvent("topik1:wrongReviewExitToDiagnosis", {
        detail: { diagnosisUrl }
      }));
    } catch (error) {
      console.warn("[step21e] exit event dispatch failed:", error);
    }

    // listening-test.js가 아직 Step48 처리를 못 받은 구버전일 경우의 안전장치.
    window.setTimeout(() => {
      if (window.__TOPIK1_WRONG_REVIEW_EXIT_HANDLED__) return;
      stopAudioIfPossible();
      window.location.href = diagnosisUrl;
    }, 250);
  }

  function observeTarget(target, options) {
    if (!target || !observer) return;
    observer.observe(target, options);
  }

  function initObservers() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(scheduleUpdateExitButton);

    // document.body 전체 감시는 하지 않는다.
    // 화면 전환에 필요한 최소 요소만 감시한다.
    observeTarget($("#test-screen"), {
      attributes: true,
      attributeFilter: ["hidden", "class", "style"]
    });

    observeTarget($("#test-header-title"), {
      childList: true,
      characterData: true,
      subtree: true
    });

    observeTarget($("#section-instruction"), {
      childList: true,
      characterData: true,
      subtree: true
    });

    observeTarget($("#current-question-label"), {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function init() {
    ensureExitButton();
    updateExitButton();
    initObservers();

    window.addEventListener("pageshow", scheduleUpdateExitButton);
    window.addEventListener("resize", scheduleUpdateExitButton);

    // 비동기 시험 시작 직후 한 번만 보정한다. 반복 setInterval은 사용하지 않는다.
    window.setTimeout(scheduleUpdateExitButton, 0);
    window.setTimeout(scheduleUpdateExitButton, 500);
    window.setTimeout(scheduleUpdateExitButton, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
