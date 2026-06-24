// TOPIK I 듣기 진단 보고서 우선 복습 구간 보정 패치
// Step13: 학습 처방의 "우선 복습 구간"이 실제 약점 1~3순위와 일치하도록 보정한다.
// Step14: 우선 복습 구간 보정도 최초 제출 결과만 기준으로 적용한다.
// 기존 listening-diagnosis.js는 건드리지 않고, 렌더링 후 DOM 텍스트만 안전하게 교정한다.

(function () {
  "use strict";

  const RESULT_STORAGE_KEY = "topik1-listening-result-latest";
  const WRONG_REVIEW_STORAGE_KEY = "topik1-listening-wrong-review-latest";
  const WRONG_REVIEW_PROGRESS_STORAGE_KEY = "topik1-listening-wrong-review-progress";

  const TYPE_META = [
    {
      match: ["알맞은 대답", "answer_response", "basic_response"],
      typeLabel: "알맞은 대답 고르기",
      fullGroup: "1~4번 알맞은 대답",
      levelGroup: "1~2번 알맞은 대답",
    },
    {
      match: ["이어지는 말", "following_response"],
      typeLabel: "이어지는 말 고르기",
      fullGroup: "5~6번 이어지는 말",
      levelGroup: "3~4번 이어지는 말",
    },
    {
      match: ["장소", "place_identification"],
      typeLabel: "장소 파악하기",
      fullGroup: "7~10번 장소 파악",
      levelGroup: "5~6번 장소 파악",
    },
    {
      match: ["화제", "topic_identification"],
      typeLabel: "화제 파악하기",
      fullGroup: "11~14번 화제 파악",
      levelGroup: "7~8번 화제 파악",
    },
    {
      match: ["그림", "picture_choice"],
      typeLabel: "알맞은 그림 고르기",
      fullGroup: "15~16번 그림 고르기",
      levelGroup: "9~10번 그림 고르기",
    },
    {
      match: ["내용 일치", "same_content"],
      typeLabel: "내용 일치 고르기",
      fullGroup: "17~21번 내용 일치",
      levelGroup: "11~12번 내용 일치",
    },
    {
      match: ["중심 생각", "main_thought"],
      typeLabel: "중심 생각 고르기",
      fullGroup: "22~24번 중심 생각",
      levelGroup: "13~14번 중심 생각",
    },
    {
      match: ["긴 대화", "long_listening_set"],
      typeLabel: "긴 대화 듣고 두 문제 풀기",
      fullGroup: "25~30번 긴 대화 세트",
      levelGroup: "15~16번 긴 대화 세트",
    },
  ];

  function loadResult() {
    try {
      const raw = localStorage.getItem(RESULT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("[diagnosis-priority-fix] result load failed:", error);
      return null;
    }
  }

  function loadJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function isProgressForOriginal(progress, originalResult) {
    if (!progress || !originalResult) return false;
    if (!progress.source_submitted_at || !originalResult.submitted_at) return false;
    return String(progress.source_submitted_at) === String(originalResult.submitted_at);
  }

  function isReviewForOriginal(reviewResult, originalResult) {
    if (!reviewResult || !originalResult) return false;
    if (String(reviewResult.generated_exam_mode || "") !== "wrong-review") return false;
    if (!reviewResult.review_source_submitted_at || !originalResult.submitted_at) return false;
    return String(reviewResult.review_source_submitted_at) === String(originalResult.submitted_at);
  }

  function getCorrectedQuestionNumberSet(originalResult) {
    const originalWrongSet = new Set((originalResult?.items || [])
      .filter((item) => item.student_answer === null || item.is_correct === false)
      .map((item) => Number(item.question_number))
      .filter(Number.isFinite));

    if (!originalWrongSet.size) return new Set();

    const progress = loadJson(WRONG_REVIEW_PROGRESS_STORAGE_KEY);
    if (isProgressForOriginal(progress, originalResult)) {
      const corrected = new Set((progress.corrected_question_numbers || [])
        .map(Number)
        .filter((q) => Number.isFinite(q) && originalWrongSet.has(q)));
      if (corrected.size) return corrected;

      const remaining = new Set((progress.remaining_question_numbers || [])
        .map(Number)
        .filter((q) => Number.isFinite(q) && originalWrongSet.has(q)));
      return new Set([...originalWrongSet].filter((q) => !remaining.has(q)));
    }

    const reviewResult = loadJson(WRONG_REVIEW_STORAGE_KEY);
    if (!isReviewForOriginal(reviewResult, originalResult)) return new Set();

    return new Set((reviewResult.items || [])
      .filter((item) => item.student_answer !== null && item.student_answer !== undefined && item.is_correct === true)
      .map((item) => Number(item.question_number))
      .filter((q) => Number.isFinite(q) && originalWrongSet.has(q)));
  }

  function buildWrongReviewAdjustedAnalysisResult(originalResult) {
    // Step14: 진단 보정은 최초 제출 결과만 기준으로 적용한다.
    return originalResult;
  }

  function isLevelTestResult(result) {
    const mode = String(result?.generated_exam_mode || "").toLowerCase();
    const name = String(result?.test_name || result?.generated_exam_label || "").toLowerCase();
    const scope = String(result?.test_scope || "").toLowerCase();
    return mode.includes("level") || name.includes("레벨") || scope.includes("level");
  }

  function normalizeTypeKey(item) {
    const raw = [
      item?.category,
      item?.type,
      item?.diagnostic_area,
    ].filter(Boolean).join(" ");
    const meta = TYPE_META.find((entry) => entry.match.some((token) => raw.includes(token)));
    return meta ? meta.typeLabel : String(item?.category || item?.type || item?.diagnostic_area || "기타");
  }

  function metaForType(typeName) {
    const text = String(typeName || "");
    return TYPE_META.find((entry) => entry.typeLabel === text || entry.match.some((token) => text.includes(token)));
  }

  function getPriorityTypes(result) {
    const map = new Map();

    (result?.items || []).forEach((item) => {
      const typeName = normalizeTypeKey(item);
      if (!map.has(typeName)) {
        map.set(typeName, {
          name: typeName,
          total: 0,
          earned: 0,
          correct: 0,
          itemCount: 0,
          problemCount: 0,
          problemNumbers: [],
        });
      }

      const row = map.get(typeName);
      row.itemCount += 1;
      row.total += Number(item.points || 0);
      row.earned += Number(item.earned_points || 0);
      if (item.is_correct === true) row.correct += 1;

      if (item.student_answer === null || item.is_correct === false) {
        row.problemCount += 1;
        const q = Number(item.question_number);
        if (Number.isFinite(q)) row.problemNumbers.push(q);
      }
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        rate: row.total ? Math.round((row.earned / row.total) * 100) : 0,
      }))
      .filter((row) => row.problemCount > 0)
      .sort((a, b) => {
        if (a.rate !== b.rate) return a.rate - b.rate;
        if (b.problemCount !== a.problemCount) return b.problemCount - a.problemCount;
        return a.name.localeCompare(b.name, "ko");
      })
      .slice(0, 3);
  }

  function priorityGroupText(result, priorityTypes) {
    const isLevel = isLevelTestResult(result);
    return priorityTypes.map((row) => {
      const meta = metaForType(row.name);
      return meta ? (isLevel ? meta.levelGroup : meta.fullGroup) : row.name;
    }).join(", ") || "현재 뚜렷한 약점 구간이 없습니다.";
  }

  function priorityTypeText(priorityTypes) {
    return priorityTypes.map((row) => row.name).join(", ") || "현재 뚜렷한 약점 유형이 없습니다.";
  }

  function findHeading(root, label) {
    const candidates = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,strong,b,dt,div,p,span"));
    return candidates.find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      return text === label;
    });
  }

  function findNextEditableElement(heading) {
    if (!heading) return null;

    let node = heading.nextElementSibling;
    while (node) {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const tag = node.tagName ? node.tagName.toLowerCase() : "";
      if (/^h[1-6]$/.test(tag) || text === "우선 복습 유형" || text === "오답·미응답 관리") {
        return null;
      }
      if (text) return node;
      node = node.nextElementSibling;
    }
    return null;
  }

  function replaceAfterHeading(root, headingText, value) {
    const heading = findHeading(root, headingText);
    const target = findNextEditableElement(heading);
    if (!target) return false;
    target.textContent = value;
    target.setAttribute("data-priority-fix", "applied");
    return true;
  }

  function addFallbackNotice(root, groupText, typeText) {
    const prescriptionHeading = findHeading(root, "학습 처방");
    if (!prescriptionHeading || root.querySelector("[data-priority-fix-fallback='applied']")) return;

    const box = document.createElement("div");
    box.setAttribute("data-priority-fix-fallback", "applied");
    box.style.border = "1px solid #b8d7ff";
    box.style.borderRadius = "10px";
    box.style.padding = "10px 12px";
    box.style.margin = "10px 0";
    box.style.background = "#f4f9ff";
    box.innerHTML = `
      <strong>우선 복습 구간 보정</strong><br>
      ${escapeHtml(groupText)}<br>
      <strong>우선 복습 유형</strong><br>
      ${escapeHtml(typeText)}
    `;
    prescriptionHeading.insertAdjacentElement("afterend", box);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function applyPriorityFix() {
    const root = document.getElementById("diagnosis-root");
    const result = loadResult();
    if (!root || !result || !Array.isArray(result.items)) return;

    const priorityTypes = getPriorityTypes(result);
    if (!priorityTypes.length) return;

    const groupText = priorityGroupText(result, priorityTypes);
    const typeText = priorityTypeText(priorityTypes);

    const groupFixed = replaceAfterHeading(root, "우선 복습 구간", groupText);
    const typeFixed = replaceAfterHeading(root, "우선 복습 유형", typeText);

    if (!groupFixed || !typeFixed) {
      addFallbackNotice(root, groupText, typeText);
    }

    console.info("[diagnosis-priority-fix] applied", { groupText, typeText });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // listening-diagnosis.js의 렌더링이 먼저 끝난 뒤 적용되도록 두 번 보정한다.
    setTimeout(applyPriorityFix, 0);
    setTimeout(applyPriorityFix, 150);
  });
})();
