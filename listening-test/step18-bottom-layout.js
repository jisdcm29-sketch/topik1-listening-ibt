// Step18: TOPIK II 듣기형 하단 네비게이션 보정
// listening-test.js 내부 state를 직접 건드리지 않고, 화면에 표시된 문항 번호 기준으로 버튼 상태만 관리한다.
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
  }

  function bindSafetyHandlers() {
    const nextBtn = $("#dev-next-btn");
    if (nextBtn) {
      nextBtn.addEventListener("click", (event) => {
        updateBottomControls();
        if (nextBtn.disabled) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }

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

  function initStep18BottomLayout() {
    bindSafetyHandlers();
    updateBottomControls();

    const watchTargets = [
      $("#test-screen"),
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
    document.addEventListener("DOMContentLoaded", initStep18BottomLayout);
  } else {
    initStep18BottomLayout();
  }
})();
