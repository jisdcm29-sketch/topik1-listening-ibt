// TOPIK I 듣기 오답풀이 진행 반영 패치
// Step10 cache/logic fix: 오답 다시 풀기에서 맞힌 문항은 진단 보고서의 오답/미응답 목록과 남은 문항 수에서 제외한다.
// listening-test 실행 로직은 건드리지 않고, diagnosis 화면의 표시와 버튼 상태만 안전하게 보정한다.

(function () {
  "use strict";

  const RESULT_STORAGE_KEY = "topik1-listening-result-latest";
  const WRONG_REVIEW_STORAGE_KEY = "topik1-listening-wrong-review-latest";
  const WRONG_REVIEW_PROGRESS_STORAGE_KEY = "topik1-listening-wrong-review-progress";

  function loadJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("[wrong-review-progress-fix] load failed:", key, error);
      return null;
    }
  }

  function isWrongOrUnanswered(item) {
    return item && (item.student_answer === null || item.student_answer === undefined || item.is_correct === false);
  }

  function questionNumberOf(item) {
    const value = Number(item && item.question_number);
    return Number.isFinite(value) ? value : null;
  }

  function isReviewForOriginal(reviewResult, originalResult) {
    if (!reviewResult || !originalResult) return false;
    if (String(reviewResult.generated_exam_mode || "") !== "wrong-review") return false;

    // 가장 안전한 연결값: 원시험 제출 시각
    if (reviewResult.review_source_submitted_at && originalResult.submitted_at) {
      return String(reviewResult.review_source_submitted_at) === String(originalResult.submitted_at);
    }

    // 구버전 결과에 submitted_at 연결값이 없을 때를 대비한 보조 조건
    const sameStudent =
      String(reviewResult.student_name || "") === String(originalResult.student_name || "") &&
      String(reviewResult.student_phone || "") === String(originalResult.student_phone || "");
    const sameSource =
      !reviewResult.review_source_test_name ||
      !originalResult.test_name ||
      String(reviewResult.review_source_test_name) === String(originalResult.test_name);

    return sameStudent && sameSource;
  }

  function isProgressForOriginal(progress, originalResult) {
    if (!progress || !originalResult) return false;
    if (!progress.source_submitted_at || !originalResult.submitted_at) return false;
    return String(progress.source_submitted_at) === String(originalResult.submitted_at);
  }

  function loadProgressForOriginal(originalResult) {
    const progress = loadJson(WRONG_REVIEW_PROGRESS_STORAGE_KEY);
    return isProgressForOriginal(progress, originalResult) ? progress : null;
  }

  function getRemainingReviewItems(originalResult, reviewResult) {
    const originalWrongItems = (originalResult && Array.isArray(originalResult.items) ? originalResult.items : [])
      .filter(isWrongOrUnanswered);
    const originalWrongMap = new Map(originalWrongItems.map((item) => [questionNumberOf(item), item]));

    const progress = loadProgressForOriginal(originalResult);
    if (progress) {
      const remainingNumberSet = new Set((progress.remaining_question_numbers || []).map(Number).filter(Number.isFinite));
      const correctedNumbers = (progress.corrected_question_numbers || []).map(Number).filter(Number.isFinite);
      const remainingItems = Array.from(remainingNumberSet)
        .sort((a, b) => a - b)
        .map((q) => originalWrongMap.get(q))
        .filter(Boolean);

      return {
        applied: true,
        originalWrongItems,
        remainingItems,
        correctedNumbers,
        remainingNumbers: Array.from(remainingNumberSet),
      };
    }

    if (!isReviewForOriginal(reviewResult, originalResult)) {
      return {
        applied: false,
        originalWrongItems,
        remainingItems: originalWrongItems,
        correctedNumbers: [],
        remainingNumbers: originalWrongItems.map(questionNumberOf).filter(Boolean),
      };
    }

    const reviewItems = Array.isArray(reviewResult.items) ? reviewResult.items : [];
    const remainingItems = reviewItems.filter(isWrongOrUnanswered);
    const remainingNumberSet = new Set(remainingItems.map(questionNumberOf).filter(Boolean));

    const correctedNumbers = originalWrongItems
      .map(questionNumberOf)
      .filter((q) => q && !remainingNumberSet.has(q));

    return {
      applied: true,
      originalWrongItems,
      remainingItems,
      correctedNumbers,
      remainingNumbers: Array.from(remainingNumberSet),
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function optionText(item, value) {
    if (value === null || value === undefined || value === "") return "미응답";
    const option = (item.options || []).find((op) => String(op.choice ?? op.value) === String(value));
    if (option) return `${option.choice ?? option.value}. ${option.text || ""}`.trim();
    return String(value);
  }

  function sourceText(item) {
    const round = item.source_round || item.generated_source_round || item.sourceRound || "";
    const originalNo = item.original_question_number || item.source_question_number || item.question_number || "";
    if (round && originalNo) return `${round}회 원문항 ${originalNo}번`;
    if (originalNo) return `원문항 ${originalNo}번`;
    return "출처 정보 없음";
  }

  function buildWrongCard(item) {
    const q = questionNumberOf(item) || "";
    return `
      <div class="wrong-item-card" data-wrong-review-progress="remaining" data-question-number="${escapeHtml(q)}">
        <div class="wrong-item-head">
          <strong>${escapeHtml(q)}번</strong>
          <span>${escapeHtml(item.category || item.type || "")}</span>
        </div>
        <p><strong>출처:</strong> ${escapeHtml(sourceText(item))}</p>
        <p><strong>내 답</strong> ${escapeHtml(optionText(item, item.student_answer))}</p>
        <p><strong>정답</strong> ${escapeHtml(optionText(item, item.correct_answer))}</p>
      </div>
    `;
  }

  function buildUnansweredCard(item) {
    const q = questionNumberOf(item) || "";
    return `
      <div class="wrong-item-card" data-wrong-review-progress="remaining" data-question-number="${escapeHtml(q)}">
        <div class="wrong-item-head">
          <strong>${escapeHtml(q)}번</strong>
          <span>${escapeHtml(item.category || item.type || "")}</span>
        </div>
        <p><strong>출처:</strong> ${escapeHtml(sourceText(item))}</p>
        <p>아직 답을 선택하지 않은 문항입니다.</p>
      </div>
    `;
  }

  function findSectionByHeading(root, headingText) {
    const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4"));
    const heading = headings.find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === headingText);
    return heading ? heading.closest("section") : null;
  }

  function replaceSectionContent(section, title, bodyHtml) {
    if (!section) return false;
    section.innerHTML = `<h2>${escapeHtml(title)}</h2>${bodyHtml}`;
    section.setAttribute("data-wrong-review-progress-fix", "applied");
    return true;
  }

  function updateWrongSections(root, progress) {
    if (!progress.applied) return;

    const remainingWrong = progress.remainingItems.filter((item) => item.student_answer !== null && item.student_answer !== undefined);
    const remainingUnanswered = progress.remainingItems.filter((item) => item.student_answer === null || item.student_answer === undefined);

    const wrongSection = findSectionByHeading(root, "오답 문항");
    const unansweredSection = findSectionByHeading(root, "미응답 문항");

    const wrongBody = remainingWrong.length
      ? `<div class="wrong-review-progress-note">${progress.correctedNumbers.length}문항은 오답풀이에서 정답 처리되어 목록에서 제외되었습니다.</div>` +
        remainingWrong.map(buildWrongCard).join("")
      : `<p class="empty-message">오답풀이에서 정답 처리되어 남은 오답 문항이 없습니다.</p>`;

    const unansweredBody = remainingUnanswered.length
      ? remainingUnanswered.map(buildUnansweredCard).join("")
      : `<p class="empty-message">남은 미응답 문항이 없습니다.</p>`;

    replaceSectionContent(wrongSection, "오답 문항", wrongBody);
    replaceSectionContent(unansweredSection, "미응답 문항", unansweredBody);
  }

  function updateWrongReviewButton(progress) {
    const btn = document.getElementById("wrong-review-btn");
    if (!btn || !progress.applied) return;

    const remaining = progress.remainingItems.length;
    if (remaining > 0) {
      btn.textContent = `오답 다시 풀기 (${remaining}문항 남음)`;
      btn.disabled = false;
      btn.title = `오답풀이에서 맞힌 문항을 제외하고 ${remaining}문항이 남았습니다.`;
    } else {
      btn.textContent = "오답 다시 풀기 (남은 오답 0문항)";
      btn.disabled = true;
      btn.title = "오답풀이에서 모든 문항을 정답 처리했습니다.";
    }
  }

  function updateManagementLine(root, progress) {
    if (!progress.applied) return;

    const remaining = progress.remainingNumbers.slice().sort((a, b) => a - b);
    const text = remaining.length
      ? `오답·미응답 관리: ${remaining.map((q) => `${q}번`).join(", ")} 문항을 오답 다시 풀기로 먼저 복습하세요.`
      : "오답·미응답 관리: 오답풀이에서 모든 문항을 정답 처리했습니다.";

    const candidates = Array.from(root.querySelectorAll("p,div,td,span"));
    const target = candidates.find((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      return t.startsWith("오답·미응답 관리:");
    });

    if (target) {
      target.textContent = text;
      target.setAttribute("data-wrong-review-progress-fix", "applied");
    }
  }

  function addProgressNotice(root, progress) {
    if (!progress.applied || root.querySelector("[data-wrong-review-progress-notice='applied']")) return;

    const firstCard = root.querySelector(".report-card");
    if (!firstCard) return;

    const box = document.createElement("div");
    box.setAttribute("data-wrong-review-progress-notice", "applied");
    box.style.border = "1px solid #b8d7ff";
    box.style.borderRadius = "10px";
    box.style.padding = "10px 12px";
    box.style.margin = "12px 0";
    box.style.background = "#f4f9ff";

    const correctedText = progress.correctedNumbers.length
      ? progress.correctedNumbers.slice().sort((a, b) => a - b).map((q) => `${q}번`).join(", ")
      : "없음";

    const remainingText = progress.remainingNumbers.length
      ? progress.remainingNumbers.slice().sort((a, b) => a - b).map((q) => `${q}번`).join(", ")
      : "없음";

    box.innerHTML = `
      <strong>오답풀이 진행 반영</strong><br>
      정답 처리되어 제외된 문항: ${escapeHtml(correctedText)}<br>
      남은 오답·미응답 문항: ${escapeHtml(remainingText)}
    `;

    const infoHeading = Array.from(root.querySelectorAll("h2")).find((h) => (h.textContent || "").trim() === "시험 정보");
    if (infoHeading && infoHeading.closest("section")) {
      infoHeading.closest("section").insertAdjacentElement("beforebegin", box);
    } else {
      firstCard.insertBefore(box, firstCard.firstChild ? firstCard.firstChild.nextSibling : null);
    }
  }

  function applyWrongReviewProgressFix() {
    const root = document.getElementById("diagnosis-root");
    if (!root) return;

    const originalResult = loadJson(RESULT_STORAGE_KEY);
    const reviewResult = loadJson(WRONG_REVIEW_STORAGE_KEY);
    if (!originalResult || !Array.isArray(originalResult.items)) return;

    const progress = getRemainingReviewItems(originalResult, reviewResult);
    if (!progress.applied) return;

    updateWrongSections(root, progress);
    updateWrongReviewButton(progress);
    updateManagementLine(root, progress);
    addProgressNotice(root, progress);

    console.info("[wrong-review-progress-fix] applied", {
      corrected: progress.correctedNumbers,
      remaining: progress.remainingNumbers,
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // listening-diagnosis.js와 diagnosis-priority-fix.js가 렌더링을 끝낸 뒤 여러 번 안전하게 보정한다.
    setTimeout(applyWrongReviewProgressFix, 50);
    setTimeout(applyWrongReviewProgressFix, 250);
    setTimeout(applyWrongReviewProgressFix, 800);
  });
})();
