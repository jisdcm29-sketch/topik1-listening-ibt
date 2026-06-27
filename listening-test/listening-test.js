// TOPIK I 듣기 PBT형 IBT - listening-test.js
// 시험 실행 전용. 특정 회차 파일명, 정답, 이미지 파일명을 직접 쓰지 않는다.
// Step36: 30문항 랜덤 + 레벨테스트 랜덤 16문항 생성 지원. 보기 듣기 동행 유지.
// Step10 wrong-review: 오답풀이 정답 문항 누적 차감 + 캐시 우회 적용.
// Step43: 랜덤 <보기> 표시는 출력 번호가 아니라 원문항 show_example/source_example_block 기준으로만 처리.
// Step44: 첫 화면 시험지 목록 접기/펼치기 방식 적용.
// Step45: 인증 완료/재인증, 이름/전화번호 입력, 시험 시작 버튼 활성화 로직 복구.
// Step46: 이름 입력 후 전화번호 입력칸 포커스/입력 불가 현상 방지.

const ListeningTestApp = (() => {
  const RANDOM_FULL_EXAM_ID = "topik1-listening-random-full-30";
  const RANDOM_LEVEL_TEST_ID = "topik1-listening-random-level-test-16";
  const RANDOM_TEMPLATE_URL = "./data/bank/exam-template.json";
  const RANDOM_BANK_URL = "./data/bank/question-bank.json";
  const RANDOM_USAGE_STORAGE_KEY = "topik1-listening-random-usage-counts";
  const RANDOM_EXAM_STORAGE_KEY = "topik1-listening-random-exam-latest";
  const WRONG_REVIEW_PROGRESS_STORAGE_KEY = "topik1-listening-wrong-review-progress";
  const AUTH_STATUS_STORAGE_KEY = "topik1-listening-auth-ok";

  const state = {
    manifest: null,
    visibleExams: [],
    selectedExamMeta: null,
    selectedTestType: "full",
    selectedExamMode: "fixed",
    examListExpanded: false,
    exam: null,
    answerKey: null,
    renderIndex: 0,
    answers: {},
    student: {},
    isDevMode: false,
    isWrongReviewMode: false,
    reviewSourceResult: null,
    authOk: false,
    phaseSchedule: null,
    examTimer: null,
    submitted: false,
    latestResult: null,
    activeRenderSequence: null,
    activeQuestionNumbers: null
  };

  const $ = (selector) => document.querySelector(selector);

  function init() {
    const params = new URLSearchParams(window.location.search);
    state.isDevMode = params.get("mode") === "dev";
    state.isWrongReviewMode = params.get("review") === "wrong" || params.get("mode") === "wrong";

    AudioController.init();

    const devPanel = $("#dev-nav-panel");
    if (devPanel && state.isDevMode) devPanel.hidden = false;

    bindEvents();
    restoreAuthState();
    enableStudentInputs();
    updateStartButton();

    window.addEventListener("pageshow", () => {
      enableStudentInputs();
      updateStartButton();
    });

    loadManifest();
  }

  function bindEvents() {
    $("#auth-check-btn")?.addEventListener("click", () => {
      if (state.authOk) {
        resetAuthState();
        focusAuthInput();
        return;
      }

      const code = $("#auth-code")?.value?.trim();

      if (!code) {
        alert("인증 비밀번호를 입력하세요.");
        focusAuthInput();
        return;
      }

      state.authOk = true;
      saveAuthState();
      setAuthUi(true);
      refreshSelectedExamLabel();
      enableStudentInputs();
      updateStartButton();
      focusStudentNameIfEmpty();
    });

    bindStudentInputEvents();

    document.querySelectorAll("[data-test-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedTestType = btn.dataset.testType || "full";
        setActiveChoice("[data-test-type]", btn);
        renderFilteredExamList();
      });
    });

    document.querySelectorAll("[data-exam-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedExamMode = btn.dataset.examMode || "fixed";
        setActiveChoice("[data-exam-mode]", btn);
        renderFilteredExamList();
      });
    });

    $("#exam-list-toggle-btn")?.addEventListener("click", toggleExamList);

    $("#start-test-btn")?.addEventListener("click", startSelectedExam);
    $("#submit-test-btn")?.addEventListener("click", () => submitTest({ manual: true, reason: state.isWrongReviewMode ? "wrong_review_manual" : "manual" }));

    $("#download-result-btn")?.addEventListener("click", () => {
      if (!state.latestResult) return;
      ResultBuilder.downloadJson(state.latestResult, makeResultFilename(state.latestResult));
    });

    $("#open-diagnosis-btn")?.addEventListener("click", () => {
      const version = new URLSearchParams(window.location.search).get("v") || "step11-wrongreview-actualfix";
      window.location.href = `../listening-diagnosis/index.html?auto=1&v=${encodeURIComponent(version)}`;
    });

    $("#wrong-review-btn")?.addEventListener("click", () => {
      window.location.href = "./index.html?review=wrong&v=step11-wrongreview-actualfix";
    });

    $("#dev-prev-btn")?.addEventListener("click", () => moveRenderUnit(-1, { manual: true }));
    $("#dev-next-btn")?.addEventListener("click", () => moveRenderUnit(1, { manual: true }));
    $("#dev-rerender-btn")?.addEventListener("click", () => renderCurrentUnit({ autoPlay: false }));
  }

  function bindStudentInputEvents() {
    const nameInput = $("#student-name");
    const phoneInput = $("#student-phone");

    ["#student-name", "#student-phone"].forEach((selector) => {
      const input = $(selector);
      if (!input) return;

      forceEditableStudentInput(input);

      ["input", "change", "keyup", "blur", "compositionend"].forEach((eventName) => {
        input.addEventListener(eventName, () => {
          forceEditableStudentInput(input);
          updateStartButton();
        });
      });

      ["pointerdown", "mousedown", "click", "focus", "touchstart"].forEach((eventName) => {
        input.addEventListener(eventName, () => {
          forceEditableStudentInput(input);
        }, true);
      });

      input.addEventListener("paste", () => {
        forceEditableStudentInput(input);
        window.setTimeout(updateStartButton, 0);
      });
    });

    if (nameInput && phoneInput) {
      nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          forceEditableStudentInput(phoneInput);
          phoneInput.focus();
          phoneInput.select?.();
        }
      });
    }

    if (phoneInput) {
      phoneInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          updateStartButton();
          const startBtn = $("#start-test-btn");
          if (startBtn && !startBtn.disabled) startBtn.focus();
        }
      });
    }

    window.setTimeout(enableStudentInputs, 0);
  }

  function enableStudentInputs() {
    ["#student-name", "#student-phone"].forEach((selector) => {
      const input = $(selector);
      if (!input) return;
      forceEditableStudentInput(input);
    });
  }

  function forceEditableStudentInput(input) {
    if (!input) return;
    input.disabled = false;
    input.readOnly = false;
    input.removeAttribute("disabled");
    input.removeAttribute("readonly");
    input.setAttribute("aria-disabled", "false");
    input.style.pointerEvents = "auto";
    input.style.userSelect = "text";
    input.style.webkitUserSelect = "text";
    input.style.opacity = "1";
    input.style.backgroundColor = "#fff";
  }

  function focusAuthInput() {
    const input = $("#auth-code");
    if (input) {
      input.focus();
      input.select?.();
    }
  }

  function focusStudentNameIfEmpty() {
    const nameInput = $("#student-name");
    if (nameInput && !nameInput.value.trim()) {
      nameInput.focus();
    }
  }

  function refreshSelectedExamLabel() {
    const label = $("#selected-exam-label");
    if (!label) return;

    if (state.selectedExamMeta) {
      label.textContent = `${state.selectedExamMeta.label} 선택됨${state.authOk ? " / 인증 완료" : ""}`;
    } else {
      label.textContent = buildNoExamMessage();
    }
  }

  function clearAuthState() {
    try {
      sessionStorage.removeItem(AUTH_STATUS_STORAGE_KEY);
    } catch (error) {
      console.warn("[clearAuthState]", error);
    }
  }

  function resetAuthState() {
    state.authOk = false;
    clearAuthState();
    setAuthUi(false);
    refreshSelectedExamLabel();
    updateStartButton();
  }



  function saveAuthState() {
    try {
      sessionStorage.setItem(AUTH_STATUS_STORAGE_KEY, "1");
    } catch (error) {
      console.warn("[saveAuthState]", error);
    }
  }

  function restoreAuthState() {
    let stored = false;
    try {
      stored = sessionStorage.getItem(AUTH_STATUS_STORAGE_KEY) === "1";
    } catch (error) {
      stored = false;
    }

    if (stored) {
      state.authOk = true;
      setAuthUi(true);
      updateStartButton();
    } else {
      setAuthUi(false);
    }
  }

  function setAuthUi(authenticated) {
    const input = $("#auth-code");
    const btn = $("#auth-check-btn");
    const status = $("#auth-status");

    if (input) {
      input.disabled = false;
      input.readOnly = !!authenticated;
      input.classList.toggle("auth-ok", !!authenticated);

      if (authenticated) {
        input.value = "";
        input.placeholder = "인증 완료됨";
        input.setAttribute("aria-label", "인증 완료됨. 다시 인증하려면 인증 다시 하기 버튼을 누르세요.");
      } else {
        input.value = "";
        input.placeholder = "인증 비밀번호 입력";
        input.removeAttribute("aria-label");
      }
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = authenticated ? "인증 다시 하기" : "인증 확인";
      btn.classList.toggle("active", !!authenticated);
      btn.classList.toggle("auth-reset-mode", !!authenticated);
      btn.setAttribute("aria-pressed", authenticated ? "true" : "false");
    }

    if (status) {
      status.textContent = authenticated
        ? "인증 완료: 이름과 전화번호를 입력한 뒤 시험을 시작하세요."
        : "인증 전입니다.";
      status.classList.toggle("ok", !!authenticated);
    }

    enableStudentInputs();
    window.setTimeout(enableStudentInputs, 0);
  }

  async function loadManifest() {
    try {
      const res = await fetch("./data/exam-manifest.json", { cache: "no-store" });

      if (!res.ok) throw new Error(`manifest load failed: ${res.status}`);

      state.manifest = await res.json();

      state.visibleExams = (state.manifest.exams || []).filter((exam) => exam.enabled && exam.student_visible);

      renderFilteredExamList();

      if (state.isWrongReviewMode) {
        startWrongReviewFromLatest();
      }
    } catch (error) {
      console.error("[loadManifest]", error);

      const list = $("#exam-list");

      if (list) {
        list.innerHTML = `<button type="button" class="exam-select-btn" disabled>시험 목록을 불러오지 못했습니다.</button>`;
      }

      alert("시험 목록 파일(exam-manifest.json)을 불러오지 못했습니다. data 폴더에 파일이 있는지 확인하세요.");
    }
  }

  function setActiveChoice(selector, activeBtn) {
    document.querySelectorAll(selector).forEach((btn) => {
      btn.classList.toggle("active", btn === activeBtn);
    });
  }

  function renderFilteredExamList() {
    const filtered = getFilteredVisibleExams();

    state.selectedExamMeta = null;

    renderExamList(filtered);

    const defaultExam = pickDefaultExam(filtered);

    if (defaultExam) {
      selectExam(defaultExam.id);
    } else {
      const label = $("#selected-exam-label");
      if (label) {
        label.textContent = buildNoExamMessage();
      }
      updateStartButton();
    }
  }

  function getFilteredVisibleExams() {
    if (state.selectedExamMode === "random") {
      if (state.selectedTestType === "full") {
        return [getRandomFullExamMeta()];
      }

      if (state.selectedTestType === "level-test") {
        return [getRandomLevelTestMeta()];
      }

      return [];
    }

    return (state.visibleExams || []).filter((exam) => {
      const examType = inferExamType(exam);
      const examMode = inferExamMode(exam);

      if (examType !== state.selectedTestType) return false;

      return examMode !== "random";
    });
  }

  function pickDefaultExam(exams) {
    if (!exams?.length) return null;

    const defaultId = state.manifest?.default_exam_id;
    const defaultExam = exams.find((exam) => exam.id === defaultId);

    return defaultExam || exams[0];
  }

  function getRandomFullExamMeta(seed = "") {
    return {
      id: RANDOM_FULL_EXAM_ID,
      source_round: seed || "random",
      level: "TOPIK I",
      section: "listening",
      exam_type: "full",
      exam_mode: "random",
      generated_exam_mode: "random",
      short_label: "랜덤",
      label: "TOPIK I 듣기 랜덤 시험지 30문항",
      enabled: true,
      student_visible: true,
      random_generator: {
        template_file: RANDOM_TEMPLATE_URL,
        question_pool_file: RANDOM_BANK_URL
      }
    };
  }

  function getRandomLevelTestMeta(seed = "") {
    return {
      id: RANDOM_LEVEL_TEST_ID,
      source_round: seed || "random-level-test",
      level: "TOPIK I",
      section: "listening",
      exam_type: "level-test",
      exam_mode: "random",
      generated_exam_mode: "random-level-test",
      short_label: "랜덤 레벨테스트",
      label: "TOPIK I 듣기 랜덤 레벨테스트 16문항",
      enabled: true,
      student_visible: true,
      random_generator: {
        template_file: RANDOM_TEMPLATE_URL,
        question_pool_file: RANDOM_BANK_URL,
        template_profile: "level_test_random_template"
      }
    };
  }

  function getRandomExamMetaForExam(examOrResult = {}) {
    const name = String(examOrResult.title || examOrResult.test_name || examOrResult.generated_exam_label || "").toLowerCase();
    const type = String(examOrResult.exam_type || "").toLowerCase();
    const scope = String(examOrResult.test_scope || "").toLowerCase();
    const total = Number(examOrResult.total_questions || 0);

    if (type.includes("level") || name.includes("레벨") || scope.includes("level") || total === 16) {
      return getRandomLevelTestMeta(String(examOrResult.generated_exam_round || examOrResult.source_round || "random-level-test"));
    }

    return getRandomFullExamMeta(String(examOrResult.generated_exam_round || examOrResult.source_round || "random"));
  }

  function getExamMetaById(examId) {
    if (examId === RANDOM_FULL_EXAM_ID || String(examId || "").startsWith(`${RANDOM_FULL_EXAM_ID}-`)) {
      return getRandomFullExamMeta();
    }

    if (examId === RANDOM_LEVEL_TEST_ID || String(examId || "").startsWith(`${RANDOM_LEVEL_TEST_ID}-`)) {
      return getRandomLevelTestMeta();
    }

    return (state.manifest?.exams || []).find((item) => item.id === examId);
  }

  function inferExamType(exam) {
    if (exam?.exam_type) return exam.exam_type;

    const id = String(exam?.id || "").toLowerCase();
    const label = String(exam?.label || "").toLowerCase();

    if (id.includes("level") || label.includes("레벨") || label.includes("level")) {
      return "level-test";
    }

    return "full";
  }

  function inferExamMode(exam) {
    const raw = String(exam?.exam_mode || exam?.generated_exam_mode || exam?.mode || "").toLowerCase();
    const id = String(exam?.id || "").toLowerCase();
    const label = String(exam?.label || "").toLowerCase();

    if (raw.includes("random") || id.includes("random") || label.includes("랜덤") || label.includes("random")) {
      return "random";
    }

    return "fixed";
  }

  function buildNoExamMessage() {
    if (state.selectedExamMode === "random") {
      if (state.selectedTestType === "level-test") {
        return "랜덤 레벨테스트를 생성할 수 없습니다. question-bank.json과 exam-template.json의 level_test_random_template을 확인하세요.";
      }

      return "랜덤 시험지를 생성할 수 없습니다. question-bank.json과 exam-template.json을 확인하세요.";
    }

    if (state.selectedTestType === "level-test") {
      return "manifest에 표시 가능한 레벨테스트가 없습니다.";
    }

    return "manifest에 표시 가능한 30문항 실전시험이 없습니다.";
  }

  function toggleExamList() {
    setExamListExpanded(!state.examListExpanded);
  }

  function setExamListExpanded(expanded) {
    state.examListExpanded = !!expanded;

    const list = $("#exam-list");
    const btn = $("#exam-list-toggle-btn");

    const hasSelectableItems = !!list?.querySelector?.("[data-exam-id]");

    if (list) {
      list.classList.toggle("collapsed", !state.examListExpanded);
      list.classList.toggle("expanded", state.examListExpanded);
    }

    if (btn) {
      btn.disabled = !hasSelectableItems;
      btn.setAttribute("aria-expanded", state.examListExpanded ? "true" : "false");

      const selected = state.selectedExamMeta;
      const shortLabel = selected ? (selected.short_label || selected.display_label || selected.label || "선택됨") : "";

      if (!hasSelectableItems) {
        btn.textContent = "시험지 선택 불가";
      } else if (state.examListExpanded) {
        btn.textContent = "시험지 선택 닫기";
      } else {
        btn.textContent = shortLabel ? `시험지 선택 (${shortLabel})` : "시험지 선택";
      }
    }
  }

  function renderExamList(exams) {
    const list = $("#exam-list");

    if (!list) return;

    if (!exams.length) {
      list.innerHTML = `<button type="button" class="exam-select-btn" disabled>${escapeHtml(buildNoExamMessage())}</button>`;
      setExamListExpanded(false);
      return;
    }

    list.innerHTML = exams.map((exam) => `
      <button type="button" class="exam-select-btn" data-exam-id="${exam.id}">
        ${escapeHtml(exam.label)}
      </button>
    `).join("");

    list.querySelectorAll("[data-exam-id]").forEach((btn) => {
      btn.addEventListener("click", () => selectExam(btn.dataset.examId));
    });

    setExamListExpanded(false);
  }

  function selectExam(examId) {
    const exam = getExamMetaById(examId);

    if (!exam) return;

    state.selectedExamMeta = exam;

    document.querySelectorAll(".exam-select-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.examId === examId);
    });

    refreshSelectedExamLabel();

    setExamListExpanded(false);
    updateStartButton();
  }

  function updateStartButton() {
    enableStudentInputs();

    const btn = $("#start-test-btn");

    if (!btn) return;

    const nameValue = $("#student-name")?.value?.trim() || "";
    const phoneValue = $("#student-phone")?.value?.trim() || "";
    const hasExam = !!state.selectedExamMeta;
    const hasName = nameValue.length > 0;
    const hasPhone = phoneValue.length > 0;
    const ready = hasExam && hasName && hasPhone && state.authOk;

    btn.disabled = !ready;
    btn.setAttribute("aria-disabled", ready ? "false" : "true");

    if (ready) {
      btn.title = "시험을 시작할 수 있습니다.";
    } else if (!state.authOk) {
      btn.title = "인증을 먼저 완료하세요.";
    } else if (!hasExam) {
      btn.title = "시험지를 선택하세요.";
    } else if (!hasName || !hasPhone) {
      btn.title = "응시자 이름과 전화번호를 입력하세요.";
    }
  }

  async function startSelectedExam() {
    enableStudentInputs();

    if (!state.authOk) {
      alert("인증을 먼저 완료하세요.");
      focusAuthInput();
      updateStartButton();
      return;
    }

    if (!state.selectedExamMeta) {
      alert("시험지를 선택하세요.");
      updateStartButton();
      return;
    }

    const nameValue = $("#student-name")?.value?.trim() || "";
    const phoneValue = $("#student-phone")?.value?.trim() || "";

    if (!nameValue || !phoneValue) {
      alert("응시자 이름과 전화번호를 입력하세요.");
      if (!nameValue) $("#student-name")?.focus();
      else $("#student-phone")?.focus();
      updateStartButton();
      return;
    }

    try {
      await loadExamAndAnswerKey(state.selectedExamMeta);

      state.renderIndex = 0;
      state.answers = {};
      state.submitted = false;
      state.latestResult = null;
      state.isWrongReviewMode = false;
      state.activeRenderSequence = null;
      state.activeQuestionNumbers = null;
      state.student = {
        name: nameValue,
        phone: phoneValue,
        started_at: new Date().toISOString()
      };

      prepareTestScreen({
        title: inferExamMode(state.selectedExamMeta) === "random" && state.selectedTestType === "level-test"
          ? "TOPIK I 듣기 랜덤 레벨테스트"
          : inferExamMode(state.selectedExamMeta) === "random"
            ? "TOPIK I 듣기 랜덤 시험지"
            : state.selectedTestType === "level-test"
              ? "TOPIK I 듣기 레벨테스트"
              : "TOPIK I 듣기 PBT형 IBT",
        totalLabel: String(state.exam.total_questions || state.exam.items.length || 0),
        submitLabel: "제출",
        timeMinutes: Number(state.exam.time_limit_minutes || (state.selectedTestType === "level-test" ? 20 : 40))
      });

      startOverallExamTimer(Number(state.exam.time_limit_minutes || (state.selectedTestType === "level-test" ? 20 : 40)));
      renderCurrentUnit({ autoPlay: true });
    } catch (error) {
      console.error("[startSelectedExam]", error);
      alert("시험 파일 또는 정답표를 불러오지 못했습니다. exam-manifest.json의 file / answer_key_file 경로를 확인하세요.");
    }
  }

  async function startWrongReviewFromLatest() {
    try {
      const latest = ResultBuilder.loadFromLocalStorage(ResultBuilder.RESULT_STORAGE_KEY);
      if (!latest) {
        alert("저장된 결과가 없습니다. 먼저 시험을 제출해 주세요.");
        return;
      }

      const wrongQuestions = getRemainingWrongQuestionNumbers(latest);

      if (!wrongQuestions.length) {
        alert("남은 오답 또는 미응답 문항이 없습니다.");
        window.location.href = "../listening-diagnosis/index.html?auto=1&review=done&v=step11-wrongreview-actualfix";
        return;
      }

      const meta = findExamMetaForResult(latest) || state.selectedExamMeta;
      if (!meta) throw new Error("exam meta not found");

      state.selectedExamMeta = meta;
      state.isWrongReviewMode = true;
      state.reviewSourceResult = latest;
      await loadExamAndAnswerKey(meta);

      state.renderIndex = 0;
      state.answers = {};
      state.submitted = false;
      state.latestResult = null;
      state.activeQuestionNumbers = wrongQuestions;
      state.activeRenderSequence = buildWrongReviewSequence(wrongQuestions);
      state.student = {
        name: latest.student_name || "",
        phone: latest.student_phone || "",
        started_at: new Date().toISOString()
      };

      prepareTestScreen({
        title: "TOPIK I 듣기 오답 다시 풀기",
        totalLabel: String(wrongQuestions.length),
        submitLabel: "오답풀이 종료",
        timeMinutes: Math.max(5, Math.ceil(wrongQuestions.length * 1.5))
      });

      startOverallExamTimer(Math.max(5, Math.ceil(wrongQuestions.length * 1.5)));
      renderCurrentUnit({ autoPlay: true });
    } catch (error) {
      console.error("[startWrongReviewFromLatest]", error);
      alert("오답풀이를 시작하지 못했습니다. localStorage 결과와 시험 파일을 확인하세요.");
    }
  }

  function getRemainingWrongQuestionNumbers(originalResult) {
    const originalWrongQuestions = uniqueQuestionNumbers((originalResult?.items || [])
      .filter((item) => item.student_answer === null || item.is_correct === false)
      .map((item) => Number(item.question_number)));

    const correctedSet = new Set();

    const progress = loadWrongReviewProgressForOriginal(originalResult);
    if (progress?.corrected_question_numbers?.length) {
      progress.corrected_question_numbers.forEach((q) => {
        const n = Number(q);
        if (Number.isFinite(n)) correctedSet.add(n);
      });
    }

    const reviewResult = ResultBuilder.loadFromLocalStorage(ResultBuilder.WRONG_REVIEW_STORAGE_KEY);
    if (isReviewResultForOriginal(reviewResult, originalResult)) {
      (reviewResult.items || []).forEach((item) => {
        const q = Number(item.question_number);
        if (!Number.isFinite(q)) return;
        if (item.student_answer !== null && item.student_answer !== undefined && item.is_correct === true) {
          correctedSet.add(q);
        }
      });
    }

    return originalWrongQuestions.filter((q) => !correctedSet.has(Number(q)));
  }

  function isReviewResultForOriginal(reviewResult, originalResult) {
    if (!reviewResult || !originalResult) return false;

    if (reviewResult.generated_exam_mode !== "wrong-review") return false;

    // Step25c:
    // 오답풀이 결과는 반드시 현재 진단 보고서의 원시험 submitted_at과 연결되어야 한다.
    // 이전 시험 또는 이전 레벨테스트의 오답풀이 결과를 같은 응시자/회차라는 이유로 재사용하면
    // "13문항 오답인데 2문항 남음" 같은 오류가 생긴다.
    if (!reviewResult.review_source_submitted_at || !originalResult.submitted_at) {
      return false;
    }

    return String(reviewResult.review_source_submitted_at) === String(originalResult.submitted_at);
  }

  function findExamMetaForResult(result) {
    const mode = String(result?.generated_exam_mode || "").toLowerCase();
    const label = String(result?.generated_exam_label || result?.test_name || "").toLowerCase();

    if (mode.includes("random") || label.includes("랜덤") || label.includes("random")) {
      return getRandomExamMetaForExam(result);
    }

    const round = String(result?.generated_exam_round || "");
    return (state.manifest?.exams || []).find((exam) =>
      exam.enabled && exam.student_visible &&
      (String(exam.source_round || "") === round || String(exam.label || "") === String(result?.generated_exam_label || ""))
    );
  }

  function buildWrongReviewSequence(wrongQuestions) {
    const wrongSet = new Set(wrongQuestions.map(Number));
    const original = state.exam?.render_sequence?.length ? state.exam.render_sequence : getDefaultRenderSequence();
    const usedUnitIds = new Set();

    return original.filter((unit) => {
      const qs = (unit.question_numbers || []).map(Number);
      const include = qs.some((q) => wrongSet.has(q));
      if (!include) return false;
      if (usedUnitIds.has(unit.unit_id)) return false;
      usedUnitIds.add(unit.unit_id);
      return true;
    });
  }

  function isRandomExamMeta(meta) {
    return inferExamMode(meta) === "random" || !!meta?.random_generator;
  }

  function isRandomLevelTestMeta(meta) {
    const type = String(meta?.exam_type || "").toLowerCase();
    const mode = String(meta?.generated_exam_mode || meta?.exam_mode || "").toLowerCase();
    const id = String(meta?.id || "").toLowerCase();
    const label = String(meta?.label || "").toLowerCase();

    return type.includes("level") ||
      mode.includes("level") ||
      id.includes("level") ||
      label.includes("레벨") ||
      label.includes("level");
  }

  async function loadRandomExamAndAnswerKey(meta) {
    if (state.isWrongReviewMode) {
      const stored = loadStoredRandomExamPayload(state.reviewSourceResult);

      if (!stored?.exam || !stored?.answerKey) {
        throw new Error("stored random exam payload not found");
      }

      const [template, bank] = await Promise.all([
        loadJson(RANDOM_TEMPLATE_URL).catch((error) => {
          console.warn("[wrong-review] random template load failed:", error);
          return null;
        }),
        loadJson(RANDOM_BANK_URL).catch((error) => {
          console.warn("[wrong-review] random bank load failed:", error);
          return null;
        })
      ]);

      normalizeRandomExamExamples(stored.exam, template, bank);

      state.exam = stored.exam;
      state.answerKey = stored.answerKey;
      saveStoredRandomExamPayload({
        generated_exam_round: stored.generated_exam_round || stored.exam?.generated_exam_round || "",
        exam: stored.exam,
        answerKey: stored.answerKey
      });

      const storedMeta = getRandomExamMetaForExam(stored.exam);
      state.selectedExamMeta = {
        ...storedMeta,
        id: stored.exam.id || storedMeta.id,
        label: stored.exam.title || storedMeta.label,
        source_round: stored.generated_exam_round || stored.exam.generated_exam_round || storedMeta.source_round,
        generated_exam_round: stored.generated_exam_round || stored.exam.generated_exam_round || storedMeta.source_round,
        generated_exam_label: stored.exam.title || storedMeta.label
      };
      return;
    }

    const [template, bank] = await Promise.all([
      loadJson(meta?.random_generator?.template_file || RANDOM_TEMPLATE_URL),
      loadJson(meta?.random_generator?.question_pool_file || RANDOM_BANK_URL)
    ]);

    const generated = isRandomLevelTestMeta(meta)
      ? buildRandomLevelTestAndAnswerKey(template, bank)
      : buildRandomExamAndAnswerKey(template, bank);
    const generatedMeta = getRandomExamMetaForExam(generated.exam);
    state.exam = generated.exam;
    state.answerKey = generated.answerKey;
    state.selectedExamMeta = {
      ...generatedMeta,
      id: generated.exam.id,
      label: generated.exam.title,
      source_round: generated.exam.generated_exam_round,
      generated_exam_round: generated.exam.generated_exam_round,
      generated_exam_label: generated.exam.title
    };

    saveStoredRandomExamPayload(generated);
  }

  function buildRandomExamAndAnswerKey(template, bank) {
    if (!template?.slot_templates?.length || !template?.set_slot_templates?.length) {
      throw new Error("exam-template.json의 slot_templates 또는 set_slot_templates가 없습니다.");
    }

    if (!bank?.single_questions?.length || !bank?.long_listening_sets?.length) {
      throw new Error("question-bank.json의 single_questions 또는 long_listening_sets가 없습니다.");
    }

    const seed = createRandomSeed();
    const examId = `${RANDOM_FULL_EXAM_ID}-${seed}`;
    const usageCounts = loadRandomUsageCounts();
    const context = {
      seed,
      examId,
      usedBankIds: new Set(),
      usedSetIds: new Set(),
      usedOriginalPositionKeys: new Set(),
      usageIds: [],
      selectionTrace: []
    };

    const outputItems = [];
    const answers = [];
    const renderSequence = [];

    const sortedSlots = [...template.slot_templates].sort((a, b) => Number(a.output_question_number) - Number(b.output_question_number));

    sortedSlots.forEach((slot) => {
      const selected = selectSingleQuestionForSlot(slot, bank, usageCounts, context);
      const item = makeRandomSingleOutputItem(selected, slot, template, examId);
      outputItems.push(item);
      answers.push(makeAnswerKeyItem(item, selected));
      renderSequence.push({
        unit_id: `Q${String(item.question_number).padStart(3, "0")}`,
        unit_type: "single_question",
        question_numbers: [item.question_number],
        layout: item.layout || "single",
        audio_url: item.audio_url
      });
    });

    const sortedSetSlots = [...template.set_slot_templates].sort((a, b) => Number(a.output_question_numbers?.[0] || 0) - Number(b.output_question_numbers?.[0] || 0));

    sortedSetSlots.forEach((slot) => {
      const selectedSet = selectLongSetForSlot(slot, bank, usageCounts, context);
      const setOutput = makeRandomSetOutputItems(selectedSet, slot, examId);
      outputItems.push(...setOutput.items);
      answers.push(...setOutput.items.map((item, index) => makeAnswerKeyItem(item, selectedSet.items[index])));
      renderSequence.push(setOutput.renderUnit);
    });

    outputItems.sort((a, b) => Number(a.question_number) - Number(b.question_number));
    answers.sort((a, b) => Number(a.question_number) - Number(b.question_number));

    const totalPoints = outputItems.reduce((sum, item) => sum + Number(item.points || 0), 0);
    if (outputItems.length !== 30 || totalPoints !== 100) {
      throw new Error(`랜덤 시험지 생성 검증 실패: ${outputItems.length}문항 / ${totalPoints}점`);
    }

    updateRandomUsageCounts(context.usageIds);

    const sourceRounds = [...new Set(outputItems.map((item) => String(item.source_round || "")).filter(Boolean))].sort();
    const exampleBlocks = getRandomExampleBlocks(template, outputItems);

    const exam = {
      id: examId,
      title: "TOPIK I 듣기 랜덤 시험지 30문항",
      source_round: "random",
      level: "TOPIK I",
      section: "listening",
      exam_type: "full",
      exam_mode: "random",
      generated_exam_mode: "random",
      generated_exam_round: seed,
      generated_exam_label: "TOPIK I 듣기 랜덤 시험지 30문항",
      test_scope: "TOPIK I 듣기 1~30번 랜덤 출제",
      total_questions: 30,
      total_possible_points: 100,
      time_limit_minutes: Number(template.time_limit_minutes || 40),
      guide_audio_url: "",
      audio_base_dir: "",
      image_base_dir: "",
      timing_policy: template.timing_policy || {
        default_single_question: { wait_seconds: 2, solving_seconds: 5 },
        default_picture_choice: { wait_seconds: 3, solving_seconds: 7 },
        default_long_set: { wait_seconds: 3, solving_seconds: 10 }
      },
      groups: template.group_templates || [],
      example_blocks: exampleBlocks,
      render_sequence: renderSequence,
      items: outputItems,
      random_generation: {
        seed,
        generated_at: new Date().toISOString(),
        source_bank_id: bank.bank_id || "",
        source_bank_version: bank.version || "",
        source_rounds: sourceRounds,
        template_id: template.template_id || "",
        selection_trace: context.selectionTrace
      },
      data_status: {
        status: "generated_in_browser_from_question_bank",
        source: "question-bank.json + exam-template.json",
        level_test_used_as_pool: false,
        note: "랜덤 시험지는 문제은행과 슬롯 템플릿으로 브라우저에서 생성되었습니다."
      }
    };

    const answerKey = {
      exam_id: examId,
      source_round: "random",
      level: "TOPIK I",
      section: "listening",
      exam_type: "full",
      generated_exam_mode: "random",
      generated_exam_round: seed,
      total_questions: 30,
      total_possible_points: 100,
      source_bank_version: bank.version || "",
      answers,
      random_generation: {
        seed,
        source_rounds: sourceRounds,
        created_from: ["./data/bank/question-bank.json", "./data/bank/exam-template.json"]
      }
    };

    return { exam, answerKey, generated_exam_round: seed };
  }

  function buildRandomLevelTestAndAnswerKey(template, bank) {
    const profile = getRandomLevelTestTemplate(template);

    if (!profile?.slot_templates?.length || !profile?.set_slot_templates?.length) {
      throw new Error("exam-template.json의 level_test_random_template.slot_templates 또는 set_slot_templates가 없습니다.");
    }

    if (!bank?.single_questions?.length || !bank?.long_listening_sets?.length) {
      throw new Error("question-bank.json의 single_questions 또는 long_listening_sets가 없습니다.");
    }

    const seed = createRandomSeed();
    const examId = `${RANDOM_LEVEL_TEST_ID}-${seed}`;
    const usageCounts = loadRandomUsageCounts();
    const context = {
      seed,
      examId,
      usedBankIds: new Set(),
      usedSetIds: new Set(),
      usedOriginalPositionKeys: new Set(),
      usageIds: [],
      selectionTrace: []
    };

    const outputItems = [];
    const answers = [];
    const renderSequence = [];

    const profileTemplate = {
      ...template,
      group_templates: profile.group_templates || template.group_templates || []
    };

    const sortedSlots = [...profile.slot_templates].sort((a, b) => Number(a.output_question_number) - Number(b.output_question_number));

    sortedSlots.forEach((slot) => {
      const selected = selectSingleQuestionForSlot(slot, bank, usageCounts, context);
      const item = makeRandomSingleOutputItem(selected, slot, profileTemplate, examId);
      outputItems.push(item);
      answers.push(makeAnswerKeyItem(item, selected));
      renderSequence.push({
        unit_id: `Q${String(item.question_number).padStart(3, "0")}`,
        unit_type: "single_question",
        question_numbers: [item.question_number],
        layout: item.layout || "single",
        audio_url: item.audio_url
      });
    });

    const sortedSetSlots = [...profile.set_slot_templates].sort((a, b) => Number(a.output_question_numbers?.[0] || 0) - Number(b.output_question_numbers?.[0] || 0));

    sortedSetSlots.forEach((slot) => {
      const selectedSet = selectLongSetForSlot(slot, bank, usageCounts, context);
      const setOutput = makeRandomSetOutputItems(selectedSet, slot, examId);
      outputItems.push(...setOutput.items);
      answers.push(...setOutput.items.map((item, index) => makeAnswerKeyItem(item, selectedSet.items[index])));
      renderSequence.push(setOutput.renderUnit);
    });

    outputItems.sort((a, b) => Number(a.question_number) - Number(b.question_number));
    answers.sort((a, b) => Number(a.question_number) - Number(b.question_number));

    const totalPoints = outputItems.reduce((sum, item) => sum + Number(item.points || 0), 0);
    if (outputItems.length !== 16 || totalPoints <= 0) {
      throw new Error(`랜덤 레벨테스트 생성 검증 실패: ${outputItems.length}문항 / ${totalPoints}점`);
    }

    updateRandomUsageCounts(context.usageIds);

    const sourceRounds = [...new Set(outputItems.map((item) => String(item.source_round || "")).filter(Boolean))].sort();
    const exampleBlocks = getRandomExampleBlocks(profileTemplate, outputItems);

    const exam = {
      id: examId,
      title: "TOPIK I 듣기 랜덤 레벨테스트 16문항",
      source_round: "random-level-test",
      level: "TOPIK I",
      section: "listening",
      exam_type: "level-test",
      exam_mode: "random",
      generated_exam_mode: "random-level-test",
      generated_exam_round: seed,
      generated_exam_label: "TOPIK I 듣기 랜덤 레벨테스트 16문항",
      test_scope: "TOPIK I 듣기 8개 대표 유형 랜덤 레벨테스트 16문항",
      total_questions: 16,
      total_possible_points: totalPoints,
      time_limit_minutes: Number(profile.time_limit_minutes || 20),
      guide_audio_url: "",
      audio_base_dir: "",
      image_base_dir: "",
      timing_policy: profile.timing_policy || template.timing_policy || {
        default_single_question: { wait_seconds: 2, solving_seconds: 5 },
        default_picture_choice: { wait_seconds: 3, solving_seconds: 7 },
        default_long_set: { wait_seconds: 3, solving_seconds: 10 }
      },
      groups: profile.group_templates || [],
      example_blocks: exampleBlocks,
      render_sequence: renderSequence,
      items: outputItems,
      random_generation: {
        seed,
        generated_at: new Date().toISOString(),
        source_bank_id: bank.bank_id || "",
        source_bank_version: bank.version || "",
        source_rounds: sourceRounds,
        template_id: profile.template_id || "topik1-listening-random-level-test-16-template",
        selection_trace: context.selectionTrace,
        level_test_random: true
      },
      data_status: {
        status: "generated_in_browser_from_question_bank",
        source: "question-bank.json + exam-template.json level_test_random_template",
        level_test_used_as_pool: false,
        note: "랜덤 레벨테스트는 고정 level-test 파일이 아니라 30문항 원본 문제은행에서 유형별로 선별되었습니다."
      }
    };

    const answerKey = {
      exam_id: examId,
      source_round: "random-level-test",
      level: "TOPIK I",
      section: "listening",
      exam_type: "level-test",
      generated_exam_mode: "random-level-test",
      generated_exam_round: seed,
      total_questions: 16,
      total_possible_points: totalPoints,
      source_bank_version: bank.version || "",
      answers,
      random_generation: {
        seed,
        source_rounds: sourceRounds,
        level_test_random: true,
        created_from: ["./data/bank/question-bank.json", "./data/bank/exam-template.json#level_test_random_template"]
      }
    };

    return { exam, answerKey, generated_exam_round: seed };
  }

  function getRandomLevelTestTemplate(template) {
    if (template?.level_test_random_template) return template.level_test_random_template;
    throw new Error("exam-template.json에 level_test_random_template이 없습니다.");
  }

  function selectSingleQuestionForSlot(slot, bank, usageCounts, context) {
    const candidates = (bank.single_questions || []).filter((candidate) =>
      candidate.random_eligible !== false &&
      matchesCandidateFilter(candidate, slot.candidate_filter || {})
    );

    const selected = chooseBalancedCandidate(candidates, {
      usageCounts,
      usedIds: context.usedBankIds,
      usedOriginalPositionKeys: context.usedOriginalPositionKeys,
      getId: (candidate) => candidate.bank_id,
      getOriginalPositionKey: (candidate) => `${slot.slot_type}:${Number(candidate.source_question_number || candidate.original_question_number || candidate.question_number)}`
    });

    if (!selected) {
      throw new Error(`랜덤 단일 문항 후보 부족: slot ${slot.output_question_number} / ${slot.slot_type}`);
    }

    const bankId = selected.bank_id;
    const positionKey = `${slot.slot_type}:${Number(selected.source_question_number || selected.original_question_number || selected.question_number)}`;

    context.usedBankIds.add(bankId);
    context.usedOriginalPositionKeys.add(positionKey);
    context.usageIds.push(bankId);
    context.selectionTrace.push({
      output_question_number: Number(slot.output_question_number),
      selected_bank_id: bankId,
      source_round: selected.source_round,
      original_question_number: Number(selected.source_question_number || selected.original_question_number || selected.question_number),
      type: selected.type,
      points: Number(selected.points || 0),
      source_example_id: selected.example_id || null,
      example_pairing_required: hasSourceExampleAudio(selected)
    });

    return selected;
  }

  function selectLongSetForSlot(slot, bank, usageCounts, context) {
    const candidates = (bank.long_listening_sets || []).filter((candidate) =>
      candidate.random_eligible !== false &&
      matchesCandidateFilter(candidate, slot.candidate_filter || {})
    );

    const selected = chooseBalancedCandidate(candidates, {
      usageCounts,
      usedIds: context.usedSetIds,
      usedOriginalPositionKeys: context.usedOriginalPositionKeys,
      getId: (candidate) => candidate.bank_set_id,
      getOriginalPositionKey: (candidate) => `${slot.slot_type}:${(candidate.target_original_question_numbers || candidate.target_slots || []).map(Number).join("-")}`
    });

    if (!selected) {
      throw new Error(`랜덤 긴 대화 세트 후보 부족: ${slot.slot_group_id}`);
    }

    const setId = selected.bank_set_id;
    const positionKey = `${slot.slot_type}:${(selected.target_original_question_numbers || selected.target_slots || []).map(Number).join("-")}`;

    context.usedSetIds.add(setId);
    context.usedOriginalPositionKeys.add(positionKey);
    context.usageIds.push(setId);
    context.selectionTrace.push({
      output_question_numbers: (slot.output_question_numbers || []).map(Number),
      selected_bank_set_id: setId,
      source_round: selected.source_round,
      original_question_numbers: (selected.target_original_question_numbers || selected.target_slots || []).map(Number),
      type: "long_listening_set",
      points: selected.points_total || 0
    });

    return selected;
  }

  function chooseBalancedCandidate(candidates, options) {
    const {
      usageCounts,
      usedIds,
      usedOriginalPositionKeys,
      getId,
      getOriginalPositionKey
    } = options;

    const usable = candidates.filter((candidate) => {
      const id = getId(candidate);
      return id && !usedIds.has(id);
    });

    if (!usable.length) return null;

    const preferred = usable.filter((candidate) => {
      const key = getOriginalPositionKey(candidate);
      return key && !usedOriginalPositionKeys.has(key);
    });

    const pool = preferred.length ? preferred : usable;
    const minUsage = Math.min(...pool.map((candidate) => Number(usageCounts[getId(candidate)] || 0)));
    const leastUsed = pool.filter((candidate) => Number(usageCounts[getId(candidate)] || 0) === minUsage);

    return randomChoice(leastUsed);
  }

  function matchesCandidateFilter(candidate, filter) {
    return Object.entries(filter || {}).every(([key, expected]) => {
      if (key === "points_pattern") {
        const pattern = getCandidatePointsPattern(candidate);
        return JSON.stringify(pattern) === JSON.stringify(expected);
      }

      if (key === "points") {
        return Number(candidate.points) === Number(expected);
      }

      return String(candidate[key]) === String(expected);
    });
  }

  function getCandidatePointsPattern(candidate) {
    if (Array.isArray(candidate.points)) {
      return candidate.points.map(Number);
    }

    if (Array.isArray(candidate.correct_answers)) {
      return candidate.correct_answers.map((answer) => Number(answer.points));
    }

    if (Array.isArray(candidate.items)) {
      return candidate.items.map((item) => Number(item.points));
    }

    return [];
  }

  function makeRandomSingleOutputItem(sourceItem, slot, template, examId) {
    const outputQuestionNumber = Number(slot.output_question_number);
    const item = deepClone(sourceItem);
    const slotType = slot.slot_type || sourceItem.type || "";
    const sourceExampleBlock = getSourceExampleBlock(sourceItem, template);

    // Step43:
    // 랜덤 시험의 <보기>는 출력 번호(예: 랜덤 7번)가 아니라
    // 선택된 원문항 자체가 <보기>를 가진 경우에만 함께 표시한다.
    // 예: 83회 원문항 9번이 랜덤 7번 자리에 와도 83회 원문항 9번은 <보기>가 없으므로 표시하지 않는다.
    const showExample = hasSourceExampleAudio(sourceItem) && !!sourceExampleBlock;
    const exampleId = showExample ? sourceExampleBlock.id : null;

    item.id = `${examId}-Q${String(outputQuestionNumber).padStart(3, "0")}`;
    item.question_number = outputQuestionNumber;
    item.original_question_number = Number(sourceItem.source_question_number || sourceItem.original_question_number || sourceItem.question_number);
    item.source_question_number = Number(sourceItem.source_question_number || sourceItem.original_question_number || sourceItem.question_number);
    item.output_question_number = outputQuestionNumber;
    item.source_bank_id = sourceItem.bank_id || "";
    item.random_source_bank_id = sourceItem.bank_id || "";
    item.random_source_exam_id = sourceItem.source_exam_id || "";
    item.random_source_exam_title = sourceItem.source_exam_title || "";
    item.instruction = slot.instruction || sourceItem.instruction || "";
    item.category = slot.category || sourceItem.category || "";
    item.diagnostic_area = slot.diagnostic_area || sourceItem.diagnostic_area || "";
    item.type = slotType || sourceItem.type || "";
    item.layout = slot.layout || sourceItem.layout || "single";
    item.points = Number(slot.points || sourceItem.points || 0);
    item.correct_answer = Number(sourceItem.correct_answer);
    item.show_example = showExample;
    item.example_id = exampleId;
    item.example_audio_included = showExample;
    item.random_example_pairing_required = showExample;
    if (showExample) {
      item.random_example_block = sourceExampleBlock;
    } else {
      delete item.random_example_block;
    }
    item.student_visible_dialogue = false;
    item.generated_from_random_bank = true;

    return item;
  }

  function makeRandomSetOutputItems(sourceSet, slot, examId) {
    const outputNumbers = (slot.output_question_numbers || []).map(Number);
    const sourceItems = [...(sourceSet.items || [])].sort((a, b) =>
      Number(a.source_question_number || a.original_question_number || a.question_number) -
      Number(b.source_question_number || b.original_question_number || b.question_number)
    );

    if (sourceItems.length !== outputNumbers.length) {
      throw new Error(`긴 대화 세트 문항 수 불일치: ${sourceSet.bank_set_id}`);
    }

    const randomSetId = `${examId}-${slot.slot_group_id}`;
    const audioUrl = sourceSet.primary_audio_url || sourceSet.audio_url || sourceItems[0]?.audio_url || "";
    const audioGroupId = `RANDOM_${slot.slot_group_id}_${sourceSet.bank_set_id}`;

    const items = sourceItems.map((sourceItem, index) => {
      const outputQuestionNumber = outputNumbers[index];
      const item = deepClone(sourceItem);

      item.id = `${examId}-Q${String(outputQuestionNumber).padStart(3, "0")}`;
      item.question_number = outputQuestionNumber;
      item.original_question_number = Number(sourceItem.source_question_number || sourceItem.original_question_number || sourceItem.question_number);
      item.source_question_number = Number(sourceItem.source_question_number || sourceItem.original_question_number || sourceItem.question_number);
      item.output_question_number = outputQuestionNumber;
      item.source_bank_id = sourceItem.bank_id || "";
      item.random_source_bank_id = sourceItem.bank_id || "";
      item.random_source_set_id = sourceSet.bank_set_id || "";
      item.random_source_exam_id = sourceItem.source_exam_id || sourceSet.source_exam_id || "";
      item.random_source_exam_title = sourceItem.source_exam_title || sourceSet.source_exam_title || "";
      item.instruction = slot.instruction || sourceItem.instruction || "";
      item.category = slot.category || sourceItem.category || sourceSet.category || "";
      item.diagnostic_area = slot.diagnostic_area || sourceItem.diagnostic_area || sourceSet.diagnostic_area || "";
      item.type = "long_listening_set";
      item.layout = "side_by_side_set";
      item.points = Number((slot.points || [])[index] || sourceItem.points || 0);
      item.correct_answer = Number(sourceItem.correct_answer);
      item.audio_url = audioUrl;
      item.primary_audio_url = audioUrl;
      item.set_id = randomSetId;
      item.source_set_id = sourceSet.bank_set_id || "";
      item.audio_group_id = audioGroupId;
      item.audio_group_numbers = outputNumbers;
      item.shared_audio_total = outputNumbers.length;
      item.shared_audio_index = index + 1;
      item.show_example = false;
      item.example_id = null;
      item.example_audio_included = false;
      item.student_visible_dialogue = false;
      item.generated_from_random_bank = true;

      return item;
    });

    return {
      items,
      renderUnit: {
        unit_id: slot.slot_group_id || `SET_${outputNumbers.join("_")}`,
        unit_type: "question_set",
        question_numbers: outputNumbers,
        layout: slot.layout || "side_by_side",
        audio_url: audioUrl,
        audio_group_id: audioGroupId
      }
    };
  }

  function makeAnswerKeyItem(outputItem, sourceItem) {
    return {
      question_number: Number(outputItem.question_number),
      correct_answer: Number(outputItem.correct_answer ?? sourceItem?.correct_answer),
      points: Number(outputItem.points || sourceItem?.points || 0),
      source_round: outputItem.source_round || sourceItem?.source_round || "",
      original_question_number: Number(outputItem.original_question_number || sourceItem?.original_question_number || sourceItem?.question_number || 0),
      source_bank_id: outputItem.source_bank_id || sourceItem?.bank_id || "",
      source_set_id: outputItem.source_set_id || ""
    };
  }

  function shouldShowExampleForOutputSlot(template, outputQuestionNumber, slotType) {
    const groups = template?.group_templates || template?.groups || [];
    const hasExampleBlock = (template?.default_example_blocks || []).some((block) => block.slot_type === slotType);

    if (!hasExampleBlock) return false;

    return groups.some((group) =>
      group.slot_type === slotType &&
      Array.isArray(group.range) &&
      Number(group.range[0]) === Number(outputQuestionNumber)
    );
  }

  function getExampleIdForSlotType(template, slotType) {
    const example = (template.default_example_blocks || []).find((block) => block.slot_type === slotType);
    return example?.id || null;
  }

  function getDefaultExampleBlockForSlotType(template, slotType, sourceItem = {}) {
    const example = (template?.default_example_blocks || []).find((block) => block.slot_type === slotType);
    if (!example) return null;

    const copy = deepClone(example);
    copy.source_round = sourceItem.source_round || "";
    copy.source_example_id = example.id;
    copy.source_question_number = sourceItem.source_question_number || sourceItem.original_question_number || sourceItem.question_number || "";
    copy.random_example_pairing = true;
    copy.random_example_fallback = true;
    return copy;
  }

  function normalizeRandomExamExamples(exam, template, bank) {
    if (!exam || !template) return exam;

    const effectiveTemplate = {
      ...template,
      group_templates: exam.groups || template.group_templates || []
    };

    const bankSingleById = new Map();
    (bank?.single_questions || []).forEach((question) => {
      if (question?.bank_id) bankSingleById.set(String(question.bank_id), question);
    });

    const blocksById = new Map();

    (exam.items || []).forEach((item) => {
      const bankItem = item.source_bank_id ? bankSingleById.get(String(item.source_bank_id)) : null;

      // Step43:
      // 저장된 랜덤 시험/오답풀이를 다시 열 때도 출력 번호 기준으로 <보기>를 복원하지 않는다.
      // 반드시 원천 bank 문항이 show_example/example_id/source_example_block을 가진 경우에만 표시한다.
      const sourceBlock = bankItem ? getSourceExampleBlock(bankItem, effectiveTemplate) : getSourceExampleBlock(item, effectiveTemplate);
      const sourceAllowsExample = bankItem
        ? hasSourceExampleAudio(bankItem)
        : hasSourceExampleAudio(item) && !!(item.source_example_block || item.example_block) && !item.random_example_block?.random_example_fallback;

      if (!sourceAllowsExample || !sourceBlock?.id) {
        item.show_example = false;
        item.example_id = null;
        item.example_audio_included = false;
        item.random_example_pairing_required = false;
        delete item.random_example_block;
        return;
      }

      const copy = deepClone(sourceBlock);
      item.show_example = true;
      item.example_id = copy.id;
      item.example_audio_included = true;
      item.random_example_pairing_required = true;
      item.random_example_block = copy;
      blocksById.set(String(copy.id), copy);
    });

    exam.example_blocks = Array.from(blocksById.values());
    return exam;
  }

  function getRandomExampleBlocks(template, outputItems = []) {
    const blocksById = new Map();

    (outputItems || []).forEach((item) => {
      if (!item?.show_example || !item.random_example_block?.id) return;

      const block = deepClone(item.random_example_block);
      delete block.slot_type;
      blocksById.set(block.id, block);
    });

    return Array.from(blocksById.values());
  }

  function hasSourceExampleAudio(sourceItem) {
    return sourceItem?.random_example_pairing_required === true ||
      sourceItem?.example_audio_included === true ||
      (sourceItem?.show_example === true && !!sourceItem?.example_id);
  }

  function getSourceExampleBlock(sourceItem, template) {
    if (!sourceItem) return null;

    const embedded = sourceItem.example_block || sourceItem.random_example_block || sourceItem.source_example_block;
    if (embedded?.id) {
      return deepClone(embedded);
    }

    const exampleId = sourceItem.example_id;
    if (!exampleId) return null;

    const exactTemplateBlock = (template.default_example_blocks || []).find((block) => block.id === exampleId);
    if (exactTemplateBlock) {
      const copy = deepClone(exactTemplateBlock);
      copy.source_round = sourceItem.source_round || "";
      copy.source_example_id = exampleId;
      copy.source_question_number = sourceItem.source_question_number || sourceItem.original_question_number || sourceItem.question_number;
      copy.random_example_pairing = true;
      return copy;
    }

    return null;
  }

  function createRandomSeed() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const r = Math.floor(randomNumber() * 1000000).toString(36).padStart(4, "0");
    return `random-${y}${m}${d}-${h}${min}${s}-${r}`;
  }

  function randomChoice(items) {
    if (!items?.length) return null;
    return items[Math.floor(randomNumber() * items.length)];
  }

  function randomNumber() {
    if (window.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] / 4294967296;
    }

    return Math.random();
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function loadRandomUsageCounts() {
    try {
      return JSON.parse(localStorage.getItem(RANDOM_USAGE_STORAGE_KEY) || "{}") || {};
    } catch (error) {
      console.warn("[loadRandomUsageCounts] failed:", error);
      return {};
    }
  }

  function updateRandomUsageCounts(usageIds) {
    try {
      const counts = loadRandomUsageCounts();
      (usageIds || []).forEach((id) => {
        if (!id) return;
        counts[id] = Number(counts[id] || 0) + 1;
      });
      localStorage.setItem(RANDOM_USAGE_STORAGE_KEY, JSON.stringify(counts));
    } catch (error) {
      console.warn("[updateRandomUsageCounts] failed:", error);
    }
  }

  function saveStoredRandomExamPayload(generated) {
    try {
      localStorage.setItem(RANDOM_EXAM_STORAGE_KEY, JSON.stringify({
        generated_exam_round: generated.generated_exam_round || generated.exam?.generated_exam_round || "",
        exam: generated.exam,
        answerKey: generated.answerKey,
        saved_at: new Date().toISOString()
      }));
    } catch (error) {
      console.warn("[saveStoredRandomExamPayload] failed:", error);
    }
  }

  function loadStoredRandomExamPayload(result) {
    try {
      const payload = JSON.parse(localStorage.getItem(RANDOM_EXAM_STORAGE_KEY) || "null");
      if (!payload?.exam || !payload?.answerKey) return null;

      const resultRound = String(result?.generated_exam_round || "");
      const payloadRound = String(payload.generated_exam_round || payload.exam?.generated_exam_round || "");

      if (resultRound && payloadRound && resultRound !== payloadRound) {
        return null;
      }

      return payload;
    } catch (error) {
      console.warn("[loadStoredRandomExamPayload] failed:", error);
      return null;
    }
  }

  async function loadExamAndAnswerKey(meta) {
    // Step32 원칙:
    // 고정 시험과 레벨테스트는 manifest의 file / answer_key_file에서 불러온다.
    // 랜덤 시험지는 question-bank.json과 exam-template.json을 읽어 브라우저에서 생성한다.
    // 특정 회차 문항 번호, 정답, 오디오 파일명, 이미지 파일명을 JS에 직접 넣지 않는다.
    if (isRandomExamMeta(meta)) {
      await loadRandomExamAndAnswerKey(meta);
      return;
    }

    const [exam, answerKey] = await Promise.all([
      loadJson(meta.file),
      loadJson(meta.answer_key_file)
    ]);

    if (!exam || !Array.isArray(exam.items) || !exam.items.length) {
      throw new Error("exam JSON has no items");
    }

    state.exam = exam;
    state.answerKey = answerKey;
  }


  async function loadJson(url) {
    if (!url) throw new Error("JSON URL is missing.");

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`JSON load failed: ${res.status} ${url}`);
    }

    return res.json();
  }

  function prepareTestScreen({ title, totalLabel, submitLabel, timeMinutes }) {
    $("#login-screen").hidden = true;
    $("#result-screen").hidden = true;
    $("#test-screen").hidden = false;
    $("#header-student-name").textContent = state.student.name || "-";
    $("#test-header-title").textContent = title;
    $("#total-question-label").textContent = totalLabel;

    const submitBtn = $("#submit-test-btn");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }

    setRemainingTime(timeMinutes * 60);
  }

  function getDefaultRenderSequence() {
    return (state.exam?.items || []).map((item) => ({
      unit_id: `Q${String(item.question_number).padStart(3, "0")}`,
      unit_type: "single_question",
      question_numbers: [item.question_number],
      layout: item.layout || "single",
      audio_url: item.audio_url
    }));
  }

  function getRenderSequence() {
    if (state.activeRenderSequence?.length) return state.activeRenderSequence;
    if (state.exam?.render_sequence?.length) return state.exam.render_sequence;
    return getDefaultRenderSequence();
  }

  function getItem(questionNumber) {
    return (state.exam.items || []).find((item) => Number(item.question_number) === Number(questionNumber));
  }

  function renderCurrentUnit(options = {}) {
    if (state.submitted) return;

    const seq = getRenderSequence();
    const unit = seq[state.renderIndex];
    const content = $("#question-content");

    if (!unit || !content) return;

    const questionNumbers = unit.question_numbers || [];
    const firstQuestion = questionNumbers[0];
    const firstItem = getItem(firstQuestion);

    $("#current-question-label").textContent =
      state.isWrongReviewMode
        ? `${state.renderIndex + 1}`
        : questionNumbers.length > 1
          ? `${questionNumbers[0]}-${questionNumbers[questionNumbers.length - 1]}`
          : String(firstQuestion);

    $("#section-instruction").textContent = firstItem?.instruction || "문제를 듣고 알맞은 답을 고르십시오.";

    resetTimersBeforeAudioLoad();

    try {
      if (unit.unit_type === "question_set" || unit.layout === "side_by_side") {
        renderSideBySideSet(unit);
      } else {
        renderSingleQuestion(firstItem);
      }

      loadUnitAudio(unit, firstItem, { autoPlay: options.autoPlay !== false });
    } catch (error) {
      console.error("[renderCurrentUnit]", error);
      content.innerHTML = `<div class="empty-question">문항 표시 중 오류가 발생했습니다. Console을 확인하세요.</div>`;
    }
  }

  function resetTimersBeforeAudioLoad() {
    state.phaseSchedule = null;
    setPhaseText("#phase-wait", "00:00:00");
    setPhaseText("#phase-listening", "00:00:00");
    setPhaseText("#phase-solving", "00:00:00");
    setActivePhase(null);
  }

  function loadUnitAudio(unit, item, options = {}) {
    const audioUrl = unit.audio_url || item?.audio_url || "";

    AudioController.load(audioUrl, {
      autoPlay: options.autoPlay !== false,
      autoPlayDelayMs: 250,
      onLoadedMetadata: ({ duration }) => {
        buildPhaseSchedule(unit, item, duration);
        updateTimerDisplay(0, duration);
      },
      onTimeUpdate: ({ currentTime, duration }) => {
        updateTimerDisplay(currentTime, duration);
      },
      onEnded: ({ duration }) => {
        updateTimerDisplay(duration, duration);
        moveRenderUnit(1, { auto: true, reason: "audio_ended" });
      },
      onError: () => {
        setActivePhase(null);
      }
    });
  }

  function buildPhaseSchedule(unit, item, duration) {
    const policy = selectTimingPolicy(unit, item);

    let waitSeconds = Number(policy.wait_seconds ?? 2);
    let solvingSeconds = Number(policy.solving_seconds ?? 5);

    if (!Number.isFinite(duration) || duration <= 0) duration = waitSeconds + solvingSeconds;

    waitSeconds = Math.max(0, Math.min(waitSeconds, duration));
    const remainingAfterWait = Math.max(0, duration - waitSeconds);
    solvingSeconds = Math.max(0, Math.min(solvingSeconds, remainingAfterWait));
    const listeningSeconds = Math.max(0, duration - waitSeconds - solvingSeconds);

    state.phaseSchedule = {
      duration,
      waitSeconds,
      listeningSeconds,
      solvingSeconds,
      waitEnd: waitSeconds,
      listeningEnd: waitSeconds + listeningSeconds,
      solvingEnd: duration
    };
  }

  function selectTimingPolicy(unit, item) {
    const timing = state.exam?.timing_policy || {};

    if (unit?.unit_type === "question_set" || item?.type === "long_listening_set" || item?.layout === "side_by_side_set") {
      return timing.default_long_set || { wait_seconds: 3, solving_seconds: 10 };
    }

    if (item?.type === "picture_choice" || item?.layout === "image_grid_2x2") {
      return timing.default_picture_choice || { wait_seconds: 3, solving_seconds: 7 };
    }

    return timing.default_single_question || { wait_seconds: 2, solving_seconds: 5 };
  }

  function updateTimerDisplay(currentTime, duration) {
    if (!state.phaseSchedule) buildPhaseSchedule(null, null, duration);

    const schedule = state.phaseSchedule;
    const t = Math.max(0, Math.min(currentTime || 0, schedule.duration || duration || 0));

    const waitRemaining = Math.max(0, schedule.waitEnd - t);
    const listeningRemaining = t < schedule.waitEnd ? schedule.listeningSeconds : Math.max(0, schedule.listeningEnd - t);
    const solvingRemaining = t < schedule.listeningEnd ? schedule.solvingSeconds : Math.max(0, schedule.solvingEnd - t);

    setPhaseText("#phase-wait", formatHMS(waitRemaining));
    setPhaseText("#phase-listening", formatHMS(listeningRemaining));
    setPhaseText("#phase-solving", formatHMS(solvingRemaining));

    if (t < schedule.waitEnd) setActivePhase("wait");
    else if (t < schedule.listeningEnd) setActivePhase("listening");
    else if (t < schedule.solvingEnd) setActivePhase("solving");
    else setActivePhase(null);
  }

  function setPhaseText(selector, value) {
    const box = $(selector);
    if (!box) return;
    const strong = box.querySelector("strong");
    if (strong) strong.textContent = value;
  }

  function setActivePhase(phaseName) {
    const map = { wait: "#phase-wait", listening: "#phase-listening", solving: "#phase-solving" };
    Object.values(map).forEach((selector) => {
      const el = $(selector);
      if (el) el.classList.remove("active");
    });
    if (phaseName && map[phaseName]) {
      const activeEl = $(map[phaseName]);
      if (activeEl) activeEl.classList.add("active");
    }
  }

  function startOverallExamTimer(minutes = 40) {
    const totalSeconds = Math.max(1, Math.round(Number(minutes || 40) * 60));

    if (state.examTimer?.intervalId) clearInterval(state.examTimer.intervalId);

    state.examTimer = { totalSeconds, startedAtMs: Date.now(), intervalId: null, isFinished: false };
    setRemainingTime(totalSeconds);

    state.examTimer.intervalId = window.setInterval(() => {
      if (!state.examTimer || state.examTimer.isFinished || state.submitted) return;

      const elapsedSeconds = Math.floor((Date.now() - state.examTimer.startedAtMs) / 1000);
      const remainingSeconds = Math.max(0, state.examTimer.totalSeconds - elapsedSeconds);

      setRemainingTime(remainingSeconds);

      if (remainingSeconds <= 0) {
        state.examTimer.isFinished = true;
        clearInterval(state.examTimer.intervalId);
        state.examTimer.intervalId = null;
        submitTest({ manual: false, reason: state.isWrongReviewMode ? "wrong_review_time_up" : "time_up" });
      }
    }, 250);
  }

  function setRemainingTime(seconds) {
    const el = $("#remain-time");
    if (el) el.textContent = formatHMS(seconds);
  }

  function formatHMS(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.ceil(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function renderExampleIfNeeded(item) {
    if (!item?.show_example || !item.example_id) return "";

    const ex = (state.exam.example_blocks || []).find((block) => block.id === item.example_id) ||
      item.random_example_block ||
      item.example_block ||
      item.source_example_block;
    if (!ex) return "";

    const correctAnswer = Number(ex.example_correct_answer);

    return `
      <article class="example-card">
        <div class="example-title-row">
          <h3>${escapeHtml(ex.label)}</h3>
        </div>
        <div class="dialogue-box">
          ${(ex.dialogue || []).map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        </div>
        <div class="option-list">
          ${(ex.options || []).map((opt) => {
            const isCorrect = Number(opt.choice) === correctAnswer;
            return `
              <div class="option-btn example-option ${isCorrect ? "correct-example" : ""}">
                <span class="option-number">${opt.choice}</span>
                <span>${escapeHtml(opt.text || "")}</span>
              </div>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }

  function renderSingleQuestion(item) {
    const content = $("#question-content");
    if (!content || !item) return;

    const exampleHtml = renderExampleIfNeeded(item);
    const card = renderQuestionCard(item);

    content.innerHTML = exampleHtml
      ? `<div class="question-two-column">${exampleHtml}${card}</div>`
      : `<div class="question-one-column">${card}</div>`;

    bindOptionEvents(content);
  }

  function renderSideBySideSet(unit) {
    const content = $("#question-content");
    if (!content) return;

    const cards = (unit.question_numbers || []).map((q) => renderQuestionCard(getItem(q))).join("");
    content.innerHTML = `<div class="question-two-column">${cards}</div>`;
    bindOptionEvents(content);
  }

  function renderQuestionCard(item) {
    if (!item) return `<article class="question-card"><h3>문항 데이터 없음</h3></article>`;

    // 오답풀이 화면에서는 이전 답/정답 힌트를 표시하지 않는다.
    // 보기 유형 문항은 일반 시험 화면처럼 <보기>를 함께 표시한다.
    const reviewHint = "";

    const imageChoices = item.image_choices?.length
      ? `
        <div class="image-choice-grid">
          ${item.image_choices.map((img) => `
            <button type="button" class="image-choice-btn" data-question-number="${item.question_number}" data-choice="${img.choice}">
              <img src="${img.image_url}" alt="${item.question_number}번 선택지 ${img.choice}" />
            </button>
          `).join("")}
        </div>
      `
      : "";

    const textOptions = !item.image_choices?.length
      ? `
        <div class="option-list">
          ${(item.options || []).map((opt) => `
            <button type="button" class="option-btn" data-question-number="${item.question_number}" data-choice="${opt.choice}">
              <span class="option-number">${opt.choice}</span>
              <span>${escapeHtml(opt.text || "")}</span>
            </button>
          `).join("")}
        </div>
      `
      : "";

    return `
      <article class="question-card student-question-card" data-student-dialogue-visible="false">
        <h3>${item.question_number}. ${escapeHtml(item.question || "문항 데이터 준비 중입니다.")}</h3>
        ${reviewHint}
        ${imageChoices}
        ${textOptions}
      </article>
    `;
  }

  function findOriginalResultItem(questionNumber) {
    return (state.reviewSourceResult?.items || []).find((item) => Number(item.question_number) === Number(questionNumber));
  }

  function bindOptionEvents(root) {
    root.querySelectorAll("[data-question-number][data-choice]").forEach((btn) => {
      const q = Number(btn.dataset.questionNumber);
      const choice = Number(btn.dataset.choice);

      if (state.answers[q] === choice) btn.classList.add("selected");

      btn.addEventListener("click", () => {
        if (state.submitted) return;

        state.answers[q] = choice;

        root.querySelectorAll(`[data-question-number="${q}"]`).forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");

        localStorage.setItem(state.isWrongReviewMode ? "topik1-listening-wrong-review-draft-answers" : "topik1-listening-draft-answers", JSON.stringify(state.answers));
      });
    });
  }

  function moveRenderUnit(delta, options = {}) {
    if (state.submitted) return;

    const seq = getRenderSequence();
    const next = state.renderIndex + delta;

    if (next < 0) return;

    if (next >= seq.length) {
      submitTest({
        manual: false,
        reason: state.isWrongReviewMode ? "wrong_review_finished" : "last_audio_ended"
      });
      return;
    }

    state.renderIndex = next;
    renderCurrentUnit({ autoPlay: true });
  }

  function submitTest(options = {}) {
    if (state.submitted) return;

    const unansweredCount = getUnansweredCount();

    if (options.manual && unansweredCount > 0) {
      const ok = window.confirm(`아직 ${unansweredCount}문항을 풀지 않았습니다. 그래도 제출하시겠습니까?`);
      if (!ok) return;
    }

    if (options.manual && unansweredCount === 0) {
      const ok = window.confirm(state.isWrongReviewMode ? "오답풀이를 종료하시겠습니까?" : "답안을 제출하시겠습니까?");
      if (!ok) return;
    }

    state.submitted = true;

    if (state.examTimer?.intervalId) {
      clearInterval(state.examTimer.intervalId);
      state.examTimer.intervalId = null;
    }

    if (typeof AudioController.stopForSubmit === "function") {
      AudioController.stopForSubmit();
    }

    const effectiveExam = state.isWrongReviewMode ? buildReviewExamForResult() : state.exam;

    const result = ResultBuilder.buildResult({
      exam: effectiveExam,
      answerKey: state.answerKey,
      answers: state.answers,
      student: state.student,
      examMeta: state.selectedExamMeta,
      override: state.isWrongReviewMode
        ? {
            test_name: "TOPIK I 듣기 오답 다시 풀기",
            test_scope: "오답 및 미응답 문항",
            generated_exam_mode: "wrong-review",
            generated_exam_label: "TOPIK I 듣기 오답 다시 풀기",
            time_limit_minutes: Math.max(5, Math.ceil((effectiveExam.items || []).length * 1.5)),
            total_questions: (effectiveExam.items || []).length
          }
        : {}
    });

    if (state.isWrongReviewMode && state.reviewSourceResult) {
      result.generated_exam_mode = "wrong-review";
      result.exam_type = "wrong-review";
      result.generated_exam_label = "TOPIK I 듣기 오답 다시 풀기";
      result.test_name = "TOPIK I 듣기 오답 다시 풀기";
      result.test_scope = "오답 및 미응답 문항";
      result.review_source_submitted_at = state.reviewSourceResult.submitted_at || "";
      result.review_source_test_name = state.reviewSourceResult.test_name || "";
      result.review_source_round = state.reviewSourceResult.generated_exam_round || "";

      const progress = updateWrongReviewProgress(state.reviewSourceResult, result);
      result.review_original_wrong_count = progress.original_wrong_numbers.length;
      result.review_remaining_wrong_count = progress.remaining_question_numbers.length;
      result.review_corrected_count = progress.corrected_question_numbers.length;
      result.review_corrected_question_numbers = progress.corrected_question_numbers;
      result.review_remaining_question_numbers = progress.remaining_question_numbers;
    }

    state.latestResult = result;

    if (!state.isWrongReviewMode) {
      // Step25c:
      // 새 30문항 시험 또는 새 레벨테스트가 제출되면 이전 오답풀이 결과는 더 이상 현재 결과와 연결되면 안 된다.
      // 진단 보고서 본문은 새 result 기준으로 유지하고, 오답풀이 버튼 수는 새 result의 오답 수에서 다시 시작한다.
      clearWrongReviewStorageForNewOriginalResult();
    }

    const storageKey = state.isWrongReviewMode ? ResultBuilder.WRONG_REVIEW_STORAGE_KEY : ResultBuilder.RESULT_STORAGE_KEY;
    ResultBuilder.saveToLocalStorage(result, storageKey);

    const submitBtn = $("#submit-test-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "제출 완료";
    }

    if (state.isWrongReviewMode) {
      // 오답풀이 결과는 별도 key에 저장하고, 원래 진단 보고서 화면으로 돌아간다.
      // 진단 보고서는 기존 topik1-listening-result-latest를 기준으로 유지한다.
      window.location.href = "../listening-diagnosis/index.html?auto=1&review=done&v=step11-wrongreview-actualfix";
      return;
    }

    renderResultSummary(result, options.reason || "manual");
  }

  function buildReviewExamForResult() {
    const qSet = new Set((state.activeQuestionNumbers || []).map(Number));
    return {
      ...state.exam,
      title: "TOPIK I 듣기 오답 다시 풀기",
      exam_type: "wrong-review",
      exam_mode: "wrong-review",
      generated_exam_mode: "wrong-review",
      generated_exam_label: "TOPIK I 듣기 오답 다시 풀기",
      random_generation: null,
      test_scope: "오답 및 미응답 문항",
      total_questions: qSet.size,
      total_possible_points: (state.exam.items || []).filter((item) => qSet.has(Number(item.question_number))).reduce((sum, item) => sum + Number(item.points || 0), 0),
      items: (state.exam.items || []).filter((item) => qSet.has(Number(item.question_number)))
    };
  }

  function isLevelTestResult(result) {
    const mode = String(result?.generated_exam_mode || "").toLowerCase();
    const name = String(result?.test_name || result?.generated_exam_label || "").toLowerCase();
    const scope = String(result?.test_scope || "").toLowerCase();
    return mode.includes("level") || name.includes("레벨") || scope.includes("level");
  }

  function getScore100(result) {
    const score = Number(result?.section_score_100);
    if (Number.isFinite(score)) {
      return Math.round(score);
    }

    const total = Number(result?.total_possible_points || 0);
    const earned = Number(result?.earned_points || 0);
    if (total > 0) {
      return Math.round((earned / total) * 100);
    }

    return 0;
  }

  function getTopik1ExpectedGradeFrom100(score100) {
    const score = Number(score100 || 0);

    if (score >= 70) {
      return {
        grade: "TOPIK I 2급 가능권",
        range: "70~100점",
        next: "읽기와 합산 점수 안정화"
      };
    }

    if (score >= 40) {
      return {
        grade: "TOPIK I 1급 가능권",
        range: "40~69점",
        next: "70점 이상, 2급 가능권"
      };
    }

    return {
      grade: "TOPIK I 1급 미도달 가능성",
      range: "0~39점",
      next: "40점 이상, 1급 가능권"
    };
  }

  function buildScoreTextForSummary(result) {
    if (isLevelTestResult(result)) {
      return `${getScore100(result)} / 100`;
    }

    return `${result.earned_points} / ${result.total_possible_points || 100}`;
  }

  function renderResultSummary(result, reason) {
    $("#test-screen").hidden = true;
    $("#login-screen").hidden = true;
    $("#result-screen").hidden = false;

    const summary = $("#result-summary");
    if (summary) {
      const isLevel = isLevelTestResult(result);
      const score100 = getScore100(result);
      const gradeInfo = getTopik1ExpectedGradeFrom100(score100);

      summary.innerHTML = `
        <div class="summary-box"><span>응시자</span><strong>${escapeHtml(result.student_name || "-")}</strong></div>
        <div class="summary-box"><span>${isLevel ? "100점 환산" : "듣기 점수"}</span><strong>${escapeHtml(buildScoreTextForSummary(result))}</strong></div>
        <div class="summary-box"><span>정답 수</span><strong>${result.correct_count} / ${result.total_questions}</strong></div>
        <div class="summary-box"><span>${isLevel ? "예상 판정" : "미응답"}</span><strong>${isLevel ? escapeHtml(gradeInfo.grade) : result.unanswered_count}</strong></div>
      `;
    }

    const mode = $("#summary-exam-mode");
    if (mode) {
      if (isLevelTestResult(result)) {
        const score100 = getScore100(result);
        const gradeInfo = getTopik1ExpectedGradeFrom100(score100);
        mode.textContent = `${result.generated_exam_label || result.test_name || "-"} / 100점 환산 ${score100}점 / ${gradeInfo.grade}`;
      } else {
        mode.textContent = result.generated_exam_label || result.test_name || "-";
      }
    }

    // 결과 요약 화면은 간단한 확인 화면으로만 사용한다.
    // 세부 레벨 진단, 오답풀이, PDF 저장은 listening-diagnosis에서 담당한다.
    const resultTitle = document.querySelector("#result-screen h1");
    if (resultTitle) {
      const isLevelTest = String(result.generated_exam_mode || "").includes("level") ||
        String(result.generated_exam_label || "").includes("레벨") ||
        String(result.test_name || "").includes("레벨");
      const isRandomTest = String(result.generated_exam_mode || "").includes("random") ||
        String(result.generated_exam_label || "").includes("랜덤") ||
        String(result.test_name || "").includes("랜덤");
      resultTitle.textContent = isLevelTest
        ? "TOPIK I 듣기 레벨테스트 결과 요약"
        : isRandomTest
          ? "TOPIK I 듣기 랜덤 결과 요약"
          : "TOPIK I 듣기 결과 요약";
    }

    const wrongBtn = $("#wrong-review-btn");
    if (wrongBtn) {
      wrongBtn.hidden = true;
      wrongBtn.disabled = true;
    }

    const downloadBtn = $("#download-result-btn");
    if (downloadBtn) {
      downloadBtn.hidden = true;
      downloadBtn.disabled = true;
    }

    const diagnosisBtn = $("#open-diagnosis-btn");
    if (diagnosisBtn) {
      diagnosisBtn.hidden = false;
      diagnosisBtn.textContent = "진단 보고서 보기";
    }

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function hasWrongOrUnanswered(result) {
    return (result.items || []).some((item) => item.student_answer === null || item.is_correct === false);
  }

  function clearWrongReviewStorageForNewOriginalResult() {
    try {
      localStorage.removeItem(ResultBuilder.WRONG_REVIEW_STORAGE_KEY);
      localStorage.removeItem(WRONG_REVIEW_PROGRESS_STORAGE_KEY);
      localStorage.removeItem("topik1-listening-wrong-review-draft-answers");
    } catch (error) {
      console.warn("[clearWrongReviewStorageForNewOriginalResult] failed:", error);
    }
  }

  function uniqueQuestionNumbers(numbers) {
    const seen = new Set();
    return (numbers || [])
      .map((q) => Number(q))
      .filter((q) => {
        if (!Number.isFinite(q) || seen.has(q)) return false;
        seen.add(q);
        return true;
      });
  }

  function getOriginalWrongQuestionNumbers(originalResult) {
    return uniqueQuestionNumbers((originalResult?.items || [])
      .filter((item) => item.student_answer === null || item.is_correct === false)
      .map((item) => Number(item.question_number)));
  }

  function loadWrongReviewProgressForOriginal(originalResult) {
    try {
      const progress = JSON.parse(localStorage.getItem(WRONG_REVIEW_PROGRESS_STORAGE_KEY) || "null");
      if (!isWrongReviewProgressForOriginal(progress, originalResult)) return null;
      return progress;
    } catch (error) {
      console.warn("[loadWrongReviewProgressForOriginal] failed:", error);
      return null;
    }
  }

  function isWrongReviewProgressForOriginal(progress, originalResult) {
    if (!progress || !originalResult) return false;
    if (!progress.source_submitted_at || !originalResult.submitted_at) return false;
    return String(progress.source_submitted_at) === String(originalResult.submitted_at);
  }

  function updateWrongReviewProgress(originalResult, reviewResult) {
    const originalWrongNumbers = getOriginalWrongQuestionNumbers(originalResult);
    const existing = loadWrongReviewProgressForOriginal(originalResult);
    const correctedSet = new Set((existing?.corrected_question_numbers || []).map(Number).filter(Number.isFinite));

    (reviewResult?.items || []).forEach((item) => {
      const q = Number(item.question_number);
      if (!Number.isFinite(q)) return;
      if (item.student_answer !== null && item.student_answer !== undefined && item.is_correct === true) {
        correctedSet.add(q);
      }
    });

    const correctedQuestionNumbers = originalWrongNumbers
      .filter((q) => correctedSet.has(Number(q)))
      .sort((a, b) => a - b);
    const remainingQuestionNumbers = originalWrongNumbers
      .filter((q) => !correctedSet.has(Number(q)))
      .sort((a, b) => a - b);

    const progress = {
      source_submitted_at: originalResult.submitted_at || "",
      source_test_name: originalResult.test_name || "",
      source_generated_exam_round: originalResult.generated_exam_round || "",
      source_generated_exam_label: originalResult.generated_exam_label || "",
      student_name: originalResult.student_name || "",
      student_phone: originalResult.student_phone || "",
      original_wrong_numbers: originalWrongNumbers,
      corrected_question_numbers: correctedQuestionNumbers,
      remaining_question_numbers: remainingQuestionNumbers,
      corrected_count: correctedQuestionNumbers.length,
      remaining_count: remainingQuestionNumbers.length,
      updated_at: new Date().toISOString()
    };

    try {
      localStorage.setItem(WRONG_REVIEW_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } catch (error) {
      console.warn("[updateWrongReviewProgress] failed:", error);
    }

    return progress;
  }

  function countWrongOrUnanswered(result) {
    return (result?.items || []).filter((item) => item.student_answer === null || item.is_correct === false).length;
  }

  function getUnansweredCount() {
    const target = state.activeQuestionNumbers || (state.exam?.items || []).map((item) => item.question_number);
    const answered = target.filter((q) => state.answers[q] !== undefined && state.answers[q] !== null).length;
    return Math.max(0, target.length - answered);
  }

  function makeResultFilename(result) {
    const round = result?.generated_exam_round || "exam";
    const name = (result?.student_name || "student").replace(/[\\/:*?"<>|\s]+/g, "_");
    const suffix = state.isWrongReviewMode || result?.generated_exam_mode === "wrong-review" ? "wrong-review" : "result";
    return `${suffix}-${round}-${name}.json`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", ListeningTestApp.init);
