// TOPIK I 듣기 진단 보고서
// listening-test가 저장한 result.json(localStorage)을 읽어 분석 보고서만 생성한다.
// Step34c: 랜덤 보고서 출처 표시를 캐시 우회와 오디오 경로 fallback으로 강제 보정한다.
// Step35: 응시자용 보고서 가독성을 위해 랜덤 출처 표를 요약하고 우선 복습 순서를 추가한다.
// Step35c: 랜덤 출처 요약과 우선 복습 순서를 재적용하고 그래프를 PDF용 굵은 막대형으로 개선한다.
// Step35d: 우선 복습 순서의 undefined 표시와 관련 오답 없음 오류를 수정한다.
// Step35f: Step35e의 interpretLevel 누락 런타임 오류를 복구하고, 압축 레이아웃을 안전하게 재적용한다.
// Step35g: PDF 최종 다듬기 - 제목 중복 축소, 학습 처방 위치 조정, 오답 카드 추가 압축.
// Step36b: 랜덤 레벨테스트 PDF에서 표/그래프/강점·약점 섹션이 어색하게 분리되는 문제를 보정한다.
// Step13: 오답풀이 정답 처리 문항을 복습 요약/우선순위/핵심 구간에 일관 반영한다.
// Step14: 진단 보고서는 최초 제출 결과만 기준으로 생성하고, 오답풀이 결과를 보고서 분석에 반영하지 않는다.
// Step15: 진단 보고서 본문은 원시험 기준으로 유지하되, 오답 다시 풀기 버튼의 남은 문항 수만 오답풀이 진행 상태를 반영한다.

const ListeningDiagnosis = (() => {
  const RESULT_STORAGE_KEY = "topik1-listening-result-latest";
  const WRONG_REVIEW_STORAGE_KEY = "topik1-listening-wrong-review-latest";
  const WRONG_REVIEW_PROGRESS_STORAGE_KEY = "topik1-listening-wrong-review-progress";

  const GROUPS = [
    { name: "1~4번 알맞은 대답", range: [1, 4], focus: "기초 응답 표현과 질문-대답 연결", prescription: "짧은 질문을 듣고 핵심 명사와 의문 표현을 먼저 잡는 연습이 필요합니다." },
    { name: "5~6번 이어지는 말", range: [5, 6], focus: "상황에 맞는 후속 발화 선택", prescription: "인사, 사과, 허락, 부탁 등 자주 나오는 기능 표현을 문장 단위로 복습하세요." },
    { name: "7~10번 장소 파악", range: [7, 10], focus: "대화 속 장소 단서 파악", prescription: "물건, 행동, 직업 단서를 듣고 장소를 연결하는 연습을 하세요." },
    { name: "11~14번 화제 파악", range: [11, 14], focus: "짧은 대화의 중심 화제 파악", prescription: "반복되는 명사와 중심 표현을 표시하면서 주제를 고르는 연습이 필요합니다." },
    { name: "15~16번 그림 고르기", range: [15, 16], focus: "상황·행동·대상과 그림 연결", prescription: "누가 무엇을 하는지, 물건의 위치와 행동 변화를 순서대로 듣는 연습을 하세요." },
    { name: "17~21번 내용 일치", range: [17, 21], focus: "세부 정보 일치 여부 판단", prescription: "보기의 날짜, 장소, 인물, 행동을 하나씩 듣기 내용과 대조하세요." },
    { name: "22~24번 중심 생각", range: [22, 24], focus: "화자의 의견과 중심 생각 파악", prescription: "좋다, 필요하다, 하고 싶다, 불편하다 같은 태도 표현을 중심으로 복습하세요." },
    { name: "25~30번 긴 대화 세트", range: [25, 30], focus: "긴 음성의 목적·이유·내용 일치", prescription: "첫 번째 문제는 전체 목적, 두 번째 문제는 세부 내용을 찾는 방식으로 역할을 나누어 들으세요." }
  ];

  const LEVEL_TEST_GROUPS = [
    { name: "1~2번 알맞은 대답", range: [1, 2], focus: "기초 응답 표현과 질문-대답 연결", prescription: "짧은 질문을 듣고 핵심 명사와 의문 표현을 먼저 잡는 연습이 필요합니다." },
    { name: "3~4번 이어지는 말", range: [3, 4], focus: "상황에 맞는 후속 발화 선택", prescription: "인사, 사과, 허락, 부탁 등 자주 나오는 기능 표현을 문장 단위로 복습하세요." },
    { name: "5~6번 장소 파악", range: [5, 6], focus: "대화 속 장소 단서 파악", prescription: "물건, 행동, 직업 단서를 듣고 장소를 연결하는 연습을 하세요." },
    { name: "7~8번 화제 파악", range: [7, 8], focus: "짧은 대화의 중심 화제 파악", prescription: "반복되는 명사와 중심 표현을 표시하면서 주제를 고르는 연습이 필요합니다." },
    { name: "9~10번 그림 고르기", range: [9, 10], focus: "상황·행동·대상과 그림 연결", prescription: "누가 무엇을 하는지, 물건의 위치와 행동 변화를 순서대로 듣는 연습을 하세요." },
    { name: "11~12번 내용 일치", range: [11, 12], focus: "세부 정보 일치 여부 판단", prescription: "보기의 날짜, 장소, 인물, 행동을 하나씩 듣기 내용과 대조하세요." },
    { name: "13~14번 중심 생각", range: [13, 14], focus: "화자의 의견과 중심 생각 파악", prescription: "좋다, 필요하다, 하고 싶다, 불편하다 같은 태도 표현을 중심으로 복습하세요." },
    { name: "15~16번 긴 대화 세트", range: [15, 16], focus: "긴 음성의 목적·이유·내용 일치", prescription: "첫 번째 문제는 전체 목적, 두 번째 문제는 세부 내용을 찾는 방식으로 역할을 나누어 들으세요." }
  ];

  const DIAGNOSTIC_LABELS = {
    basic_response: "기초 응답 표현과 질문-대답 연결",
    following_response: "상황에 맞는 후속 발화 선택",
    place_identification: "장소 단서 파악",
    topic_identification: "짧은 대화의 중심 화제 파악",
    picture_choice: "상황·행동·대상과 그림 연결",
    same_content: "세부 정보 일치 여부 판단",
    main_thought: "화자의 의견과 중심 생각 파악",
    long_listening_set: "긴 음성의 목적·이유·내용 일치"
  };

  function diagnosisLabel(value) {
    return DIAGNOSTIC_LABELS[value] || value || "기타";
  }

  function formatPhone(value) {
    const text = String(value || "").trim();
    return text || "-";
  }

  function isLevelTestResult(result) {
    const mode = String(result?.generated_exam_mode || "").toLowerCase();
    const name = String(result?.test_name || result?.generated_exam_label || "").toLowerCase();
    const scope = String(result?.test_scope || "").toLowerCase();
    return mode.includes("level") || name.includes("레벨") || scope.includes("level");
  }

  function isRandomResult(result) {
    const mode = String(result?.generated_exam_mode || "").toLowerCase();
    const name = String(result?.test_name || result?.generated_exam_label || "").toLowerCase();
    const scope = String(result?.test_scope || "").toLowerCase();
    const round = String(result?.generated_exam_round || "").toLowerCase();

    return mode.includes("random") ||
      name.includes("랜덤") ||
      name.includes("random") ||
      scope.includes("랜덤") ||
      scope.includes("random") ||
      round.startsWith("random-") ||
      !!result?.random_generation ||
      (result?.items || []).some((item) => item.generated_from_random_bank === true || item.source_bank_id || item.random_source_bank_id);
  }

  function getReportTitle(result) {
    if (isLevelTestResult(result) && isRandomResult(result)) return "TOPIK I 듣기 랜덤 레벨테스트 진단 보고서";
    if (isLevelTestResult(result)) return "TOPIK I 듣기 레벨테스트 진단 보고서";
    if (isRandomResult(result)) return "TOPIK I 듣기 랜덤 진단 보고서";
    return "TOPIK I 듣기 진단 보고서";
  }

  function updateDiagnosisPageTitle(result) {
    const title = getReportTitle(result);
    document.title = title;

    const headerTitle = document.querySelector(".diagnosis-header h1");
    if (headerTitle) headerTitle.textContent = title;
  }

  function buildLevelTestNotice(result) {
    if (!isLevelTestResult(result)) return "";

    return `
      <section class="notice-box leveltest-notice">
        <h3>레벨테스트 결과 안내</h3>
        <p>이 결과는 TOPIK I 듣기 30문항 전체 시험 결과가 아니라, 30문항 전체 유형과 난이도 흐름을 고려해 선별한 레벨테스트 결과입니다. 16문항 원점수를 100점 만점으로 환산하여 40점 이상은 1급 가능권, 70점 이상은 2급 가능권으로 참고 판정합니다. 전체 실전 점수는 30문항 시험에서 더 정확하게 확인할 수 있습니다.</p>
      </section>
    `;
  }

  function buildRandomExamNotice(result) {
    if (!isRandomResult(result)) return "";

    const rounds = getRandomSourceRounds(result).map((round) => `${round}회`).join(", ") || "문제은행";
    return `
      <section class="notice-box randomtest-notice">
        <h3>랜덤 출제 안내</h3>
        <p>이 결과는 고정 회차 시험지가 아니라 문제은행에서 유형별 슬롯 구조에 맞춰 생성한 랜덤 시험 결과입니다. 사용된 원천 회차는 ${escapeHtml(rounds)}입니다. 진단 점수와 약점 분석은 현재 생성된 ${Number(result?.total_questions || 0) || (isLevelTestResult(result) ? 16 : 30)}문항 기준으로 계산됩니다.</p>
      </section>
    `;
  }

  function buildRandomExamInfoRows(result) {
    if (!isRandomResult(result)) return "";

    const rounds = getRandomSourceRounds(result).map((round) => `${round}회`).join(", ") || "-";
    const seed = result?.random_generation?.seed || result?.generated_exam_round || "-";

    return `
            <tr><th>랜덤 생성 ID</th><td>${escapeHtml(seed)}</td></tr>
            <tr><th>사용 원천 회차</th><td>${escapeHtml(rounds)}</td></tr>`;
  }

  function getRandomSourceRounds(result) {
    const fromMeta = Array.isArray(result?.random_generation?.source_rounds)
      ? result.random_generation.source_rounds
      : [];
    const fromResult = Array.isArray(result?.random_source_rounds)
      ? result.random_source_rounds
      : [];
    const fromGenerated = Array.isArray(result?.generated_exam_source_rounds)
      ? result.generated_exam_source_rounds
      : [];
    const fromItems = [...new Set((result?.items || []).map((item) => {
      return String(
        item.source_round ||
        extractRoundFromBankId(item.source_bank_id || item.random_source_bank_id || item.source_set_id || item.random_source_set_id || "") ||
        extractRoundFromSourcePath(item.audio_url || item.primary_audio_url || item.image_url || "")
      );
    }).filter(Boolean))];

    return [...new Set([...fromMeta, ...fromResult, ...fromGenerated, ...fromItems].map(String).filter(Boolean))].sort();
  }

  function normalizeResultForDiagnosis(result) {
    if (!result || typeof result !== "object") return result;

    const normalized = {
      ...result,
      items: Array.isArray(result.items) ? result.items.map((item) => ({ ...item })) : []
    };

    if (!isRandomResult(normalized)) {
      return normalized;
    }

    normalized.generated_exam_mode = "random";
    if (!normalized.generated_exam_label) normalized.generated_exam_label = normalized.test_name || "TOPIK I 듣기 랜덤 시험지 30문항";

    applyRandomSelectionTraceToItems(normalized);
    applyBankIdSourceFallbackToItems(normalized);
    applyAudioUrlSourceFallbackToItems(normalized);

    const sourceRounds = getRandomSourceRounds(normalized);
    normalized.random_generation = {
      ...(normalized.random_generation || {}),
      seed: normalized?.random_generation?.seed || normalized.generated_exam_round || "",
      source_rounds: sourceRounds
    };
    normalized.random_source_rounds = sourceRounds;
    normalized.generated_exam_source_rounds = sourceRounds;

    return normalized;
  }

  function applyRandomSelectionTraceToItems(result) {
    const trace = Array.isArray(result?.random_generation?.selection_trace)
      ? result.random_generation.selection_trace
      : [];

    if (!trace.length || !Array.isArray(result.items)) return;

    const traceMap = new Map();

    trace.forEach((entry) => {
      if (entry.output_question_number !== undefined) {
        traceMap.set(Number(entry.output_question_number), {
          source_round: entry.source_round,
          original_question_number: entry.original_question_number,
          source_bank_id: entry.selected_bank_id,
          source_set_id: entry.selected_bank_set_id || ""
        });
      }

      if (Array.isArray(entry.output_question_numbers)) {
        const originals = Array.isArray(entry.original_question_numbers) ? entry.original_question_numbers : [];
        entry.output_question_numbers.forEach((q, index) => {
          traceMap.set(Number(q), {
            source_round: entry.source_round,
            original_question_number: originals[index],
            source_bank_id: "",
            source_set_id: entry.selected_bank_set_id || ""
          });
        });
      }
    });

    result.items.forEach((item) => {
      const source = traceMap.get(Number(item.question_number));
      if (!source) return;

      if (!item.source_round && source.source_round) item.source_round = source.source_round;
      if (!item.original_question_number && source.original_question_number) item.original_question_number = Number(source.original_question_number);
      if (!item.source_question_number && source.original_question_number) item.source_question_number = Number(source.original_question_number);
      if (!item.source_bank_id && source.source_bank_id) item.source_bank_id = source.source_bank_id;
      if (!item.source_set_id && source.source_set_id) item.source_set_id = source.source_set_id;
    });
  }

  function applyBankIdSourceFallbackToItems(result) {
    (result.items || []).forEach((item) => {
      const bankId = item.source_bank_id || item.random_source_bank_id || "";
      const setId = item.source_set_id || item.random_source_set_id || "";

      const roundFromBank = extractRoundFromBankId(bankId) || extractRoundFromBankId(setId);
      if (!item.source_round && roundFromBank) item.source_round = roundFromBank;

      const qFromBank = extractQuestionNumberFromBankId(bankId);
      if (!item.original_question_number && qFromBank) item.original_question_number = qFromBank;
      if (!item.source_question_number && qFromBank) item.source_question_number = qFromBank;
    });
  }

  function applyAudioUrlSourceFallbackToItems(result) {
    (result.items || []).forEach((item) => {
      const sourcePath = item.audio_url || item.primary_audio_url || item.image_url || "";
      const roundFromPath = extractRoundFromSourcePath(sourcePath);
      const qFromPath = extractQuestionNumberFromSourcePath(sourcePath);

      if (!item.source_round && roundFromPath) item.source_round = roundFromPath;

      // 긴 대화 세트의 두 번째 문항은 같은 세트 오디오를 공유할 수 있으므로,
      // 이미 original_question_number가 있으면 덮어쓰지 않는다.
      if (!item.original_question_number && qFromPath) item.original_question_number = qFromPath;
      if (!item.source_question_number && qFromPath) item.source_question_number = qFromPath;
    });
  }

  function extractRoundFromSourcePath(value) {
    const text = String(value || "");
    const match = text.match(/(?:audio|images)\/(\d{2,4})\//i) || text.match(/(?:audio|images)\\(\d{2,4})\\/i) || text.match(/\b(\d{2,4})_L\d{3}/i);
    return match ? match[1] : "";
  }

  function extractQuestionNumberFromSourcePath(value) {
    const text = String(value || "");
    const match = text.match(/_L(\d{3})/i);
    return match ? Number(match[1]) : null;
  }

  function extractRoundFromBankId(value) {
    const match = String(value || "").match(/L(\d{2,4})_/);
    return match ? match[1] : "";
  }

  function extractQuestionNumberFromBankId(value) {
    const match = String(value || "").match(/_Q(\d{1,3})/);
    return match ? Number(match[1]) : null;
  }

  function buildRandomSourceSection(result) {
    if (!isRandomResult(result)) return "";

    const rows = buildSourceRoundRows(result);
    const summaryRows = rows.map((row) => ({
      ...row,
      cells: row.cells.slice(0, 5)
    }));

    const table = summaryRows.length
      ? buildAnalysisTable(summaryRows, ["원천 회차", "문항 수", "정답 수", "점수", "정답률"])
      : `<p class="empty-message">랜덤 시험으로 판정되었지만, 이 저장 결과에는 원천 회차 정보가 충분히 남아 있지 않습니다. 새 랜덤 시험을 한 번 더 제출하면 출처가 자동 저장됩니다.</p>`;

    const rounds = getRandomSourceRounds(result).map((round) => `${round}회`).join(", ") || "문제은행";
    const totalUsed = rows.reduce((sum, row) => sum + Number(row.total || 0), 0) || result.total_questions || 30;

    return `
        <section class="section-block random-source-section">
          <h2>랜덤 출처 요약</h2>
          <p class="section-guide">이번 랜덤 시험은 ${escapeHtml(rounds)} 문항을 유형별 구조에 맞춰 섞어 만든 시험입니다. 원문항 출처는 오답 복습을 위해 오답 문항 카드에만 자세히 표시합니다.</p>
          ${table}
          <div class="student-tip-box">
            <strong>복습 팁</strong>
            <p>위 표는 회차별 출제 비율을 확인하는 용도입니다. 실제 복습은 아래의 <strong>우선 복습 순서</strong>와 <strong>오답 문항</strong>을 기준으로 진행하세요.</p>
            <p>이번 랜덤 시험에는 총 ${totalUsed}문항이 사용되었습니다.</p>
          </div>
        </section>
    `;
  }

  function buildSourceRoundRows(result) {
    const map = new Map();

    (result.items || []).forEach((item) => {
      const round = item.source_round || "미확인";
      if (!map.has(round)) map.set(round, []);
      map.get(round).push(item);
    });

    return Array.from(map.entries()).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([round, items]) => {
      const stat = calcStat(items);
      const used = items
        .map((item) => {
          const original = item.original_question_number || item.source_question_number || "-";
          return `${item.question_number}번←${round}회 ${original}번`;
        })
        .join(", ");

      return {
        cells: [
          `${round}회`,
          `${items.length}문항`,
          `${stat.correct} / ${items.length}`,
          `${stat.earned} / ${stat.total}`,
          `${stat.rate}%`,
          escapeHtml(used)
        ],
        rate: stat.rate,
        total: items.length,
        correct: stat.correct,
        score: `${stat.earned} / ${stat.total}`,
        name: `${round}회`,
        problemCount: stat.problemQuestions.length
      };
    });
  }

  function getSourceInfoText(item) {
    const sourcePath = item?.audio_url || item?.primary_audio_url || item?.image_url || "";
    const roundValue = item?.source_round ||
      extractRoundFromBankId(item?.source_bank_id || item?.random_source_bank_id || item?.source_set_id || item?.random_source_set_id || "") ||
      extractRoundFromSourcePath(sourcePath);
    const originalValue = item?.original_question_number ||
      item?.source_question_number ||
      extractQuestionNumberFromBankId(item?.source_bank_id || item?.random_source_bank_id || "") ||
      extractQuestionNumberFromSourcePath(sourcePath);
    if (!roundValue || !originalValue) return "";
    const round = `${roundValue}회`;
    const original = `${originalValue}번`;
    return `출처: ${round} 원문항 ${original}`;
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
        title: "TOPIK I 2급 가능권",
        range: "70~100점",
        expected: "TOPIK I 듣기 상위 안정권",
        safe: "TOPIK I 2급 가능권",
        next: "읽기와 합산 점수 안정화",
        comment: "레벨테스트 기준으로는 TOPIK I 2급 가능권입니다. 30문항 실전시험에서 긴 대화와 세부 정보 판단을 유지하는지 확인하세요."
      };
    }

    if (score >= 40) {
      return {
        title: "TOPIK I 1급 가능권",
        range: "40~69점",
        expected: "TOPIK I 기본 대화 이해 가능 단계",
        safe: "TOPIK I 1급 가능권",
        next: "70점 이상, 2급 가능권",
        comment: "레벨테스트 기준으로는 TOPIK I 1급 가능권입니다. 내용 일치, 중심 생각, 긴 대화 세트에서 점수를 높이면 2급 가능권으로 올라갈 수 있습니다."
      };
    }

    return {
      title: "TOPIK I 1급 미도달 가능성",
      range: "0~39점",
      expected: "기초 듣기 표현 보완 단계",
      safe: "TOPIK I 1급 안정권 진입 전 준비 단계",
      next: "40점 이상, 1급 가능권",
      comment: "레벨테스트 기준으로는 아직 1급 안정권 전 단계입니다. 짧은 질문과 대답, 장소·화제 단서 파악부터 다시 안정화해야 합니다."
    };
  }

  function getDiagnosisScoreForLevel(result) {
    return isLevelTestResult(result) ? getScore100(result) : Number(result.earned_points || 0);
  }

  function buildScoreCardLabel(result) {
    return isLevelTestResult(result) ? "100점 환산" : "듣기 점수";
  }

  function buildScoreCardValue(result) {
    return isLevelTestResult(result)
      ? `${getScore100(result)}점`
      : `${result.earned_points}점`;
  }

  function buildExpectedGradeCard(result) {
    if (!isLevelTestResult(result)) return "";

    const gradeInfo = getTopik1ExpectedGradeFrom100(getScore100(result));
    return `<div class="summary-box"><span>예상 판정</span><strong>${escapeHtml(gradeInfo.title)}</strong></div>`;
  }

  function buildLevelTestScoreInfoRows(result) {
    if (!isLevelTestResult(result)) return "";

    const score100 = getScore100(result);

    // 예상 판정은 상단 요약 카드와 수준 박스에 이미 표시된다.
    // 시험 정보 표에서는 중복을 줄이고 PDF 페이지 분리를 방지하기 위해 원점수/환산점수만 표시한다.
    return `
            <tr><th>원점수</th><td>${result.earned_points} / ${result.total_possible_points}</td></tr>
            <tr><th>100점 환산</th><td>${score100}점</td></tr>`;
  }

  function init() {
    document.getElementById("print-report-btn")?.addEventListener("click", () => window.print());
    document.getElementById("wrong-review-btn")?.addEventListener("click", () => {
      const result = loadResult();
      const remaining = getRemainingWrongCount(result);
      if (remaining <= 0) {
        alert("남은 오답 또는 미응답 문항이 없습니다.");
        return;
      }
      window.location.href = "../listening-test/index.html?review=wrong&v=step15-wrongreview-button-count";
    });

    const result = loadResult();
    render(result);
  }

  function loadResult() {
    const raw = localStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function render(result) {
    const root = document.getElementById("diagnosis-root");
    if (!root) return;

    if (!result) {
      updateDiagnosisPageTitle({ test_name: "" });
      root.innerHTML = `
        <section class="report-card">
          <h2>저장된 결과가 없습니다.</h2>
          <p>먼저 듣기 시험을 제출한 뒤 진단 보고서를 열어 주세요.</p>
        </section>
      `;
      updateWrongReviewButton(null);
      return;
    }

    result = normalizeResultForDiagnosis(result);
    saveNormalizedRandomResultForPrint(result);

    updateDiagnosisPageTitle(result);
    updateWrongReviewButton(result);

    const diagnosisScore = getDiagnosisScoreForLevel(result);
    const level = isLevelTestResult(result)
      ? getTopik1ExpectedGradeFrom100(diagnosisScore)
      : interpretLevel(diagnosisScore);

    // 진단 보고서는 최초 제출 결과만 기준으로 생성한다.
    // 오답풀이 결과는 진단 점수, 약점 분석, 핵심 구간, 학습 처방, 오답 목록에 반영하지 않는다.
    const analysisResult = result;
    const groupRows = buildGroupRows(analysisResult);
    const typeRows = buildTypeRows(analysisResult);
    const areaRows = buildAreaRows(analysisResult);
    const strongAreas = getStrongAreas(typeRows, areaRows);
    const weakAreas = getWeakAreas(typeRows, areaRows);
    const wrongItems = (result.items || []).filter((item) => item.student_answer === null || item.is_correct === false);

    root.innerHTML = `
      <section class="report-card${isLevelTestResult(result) ? " level-test-report" : ""}${isRandomResult(result) ? " random-report" : ""}">
        <h1>${escapeHtml(getReportTitle(result))}</h1>
        <p class="subtitle">${escapeHtml(result.test_name || "TOPIK I 듣기 PBT형 IBT 시뮬레이션")}</p>
        <div class="blue-line"></div>

        <div class="summary-grid">
          <div class="summary-box"><span>응시자</span><strong>${escapeHtml(result.student_name || "-")}</strong></div>
          <div class="summary-box"><span>전화번호</span><strong>${escapeHtml(formatPhone(result.student_phone))}</strong></div>
          <div class="summary-box"><span>${buildScoreCardLabel(result)}</span><strong>${buildScoreCardValue(result)}</strong></div>
          <div class="summary-box"><span>정답 수</span><strong>${result.correct_count} / ${result.total_questions}</strong></div>
          <div class="summary-box"><span>미응답</span><strong>${result.unanswered_count}</strong></div>
          ${buildExpectedGradeCard(result)}
        </div>

        <section class="level-box">
          <h2>${escapeHtml(level.title)}</h2>
          <p>${isLevelTestResult(result) ? "100점 환산 구간" : "듣기 점수 구간"}: ${escapeHtml(level.range)}</p>
          <p>예상 수준: ${escapeHtml(level.expected)}</p>
          <p>안정권 해석: ${escapeHtml(level.safe)}</p>
          <p>다음 목표: ${escapeHtml(level.next)}</p>
          <p>${escapeHtml(level.comment)}</p>
        </section>

        <section class="notice-box">
          <h3>공식 급수 안내</h3>
          <p>이 보고서는 TOPIK I 듣기 영역만 기준으로 한 예상 수준입니다. 공식 TOPIK I 급수는 듣기·읽기 총점 기준으로 결정되므로, 이 결과만으로 공식 급수를 확정할 수 없습니다.</p>
        </section>

        ${buildLevelTestNotice(result)}
        ${buildRandomExamNotice(result)}

        <section class="section-block">
          <h2>시험 정보</h2>
          <table class="info-table">
            <tr><th>시험명</th><td>${escapeHtml(result.test_name || "-")}</td></tr>
            <tr><th>응시자</th><td>${escapeHtml(result.student_name || "-")}</td></tr>
            <tr><th>전화번호</th><td>${escapeHtml(formatPhone(result.student_phone))}</td></tr>
            <tr><th>시험 범위</th><td>${escapeHtml(result.test_scope || "-")}</td></tr>
            <tr><th>출제 방식</th><td>${escapeHtml(result.generated_exam_label || "-")}</td></tr>
            <tr><th>출제 회차</th><td>${escapeHtml(result.generated_exam_round || "-")}</td></tr>
            ${buildRandomExamInfoRows(result)}
            <tr><th>응시 시간</th><td>${formatDateTime(result.started_at)} ~ ${formatDateTime(result.submitted_at)}</td></tr>
            <tr><th>문항 수</th><td>${result.total_questions}문항</td></tr>
            ${buildLevelTestScoreInfoRows(result)}
          </table>
        </section>

        ${buildRandomSourceSection(result)}

        <section class="section-block">
          <h2>유형별 득점 그래프</h2>
          <p class="section-guide">${isLevelTestResult(result) ? "아래 그래프는 레벨테스트에 포함된 TOPIK I 듣기 8개 대표 유형별 득점률입니다. 막대가 짧은 유형일수록 우선 복습이 필요한 영역입니다." : "아래 그래프는 TOPIK I 듣기 8개 대표 유형으로 묶어 계산한 득점률입니다. 막대가 짧은 유형일수록 우선 복습이 필요한 영역입니다."}</p>
          <div class="bar-list">${buildBars(typeRows)}</div>
          <div class="weak-summary">
            <strong>유형별 약점 요약</strong>
            <p>${buildWeakSummary(typeRows)}</p>
          <p>${buildRelatedWrongSummary(typeRows)}</p>
          </div>
        </section>

        ${buildPriorityReviewSection(result, groupRows, typeRows, wrongItems)}

        <section class="section-block compact-analysis-section">
          <h2>핵심 구간 요약</h2>
          <p class="section-guide">긴 설명 표는 줄이고, 구간별 정답률과 복습할 문항만 빠르게 확인하도록 요약했습니다. 자세한 복습 방법은 위의 우선 복습 순서를 기준으로 진행하세요.</p>
          ${buildCompactGroupTable(groupRows)}
        </section>

        <section class="section-block strength-weakness-section">
          <h2>강점·약점 영역</h2>
          <div class="strength-weakness-grid">
            <div>
              <h3>강점 영역</h3>
              <div class="tag-list strong-tags">${strongAreas.length ? strongAreas.map((x) => `<span>${escapeHtml(x)}</span>`).join("") : "<span>아직 뚜렷한 강점 영역이 없습니다.</span>"}</div>
            </div>
            <div>
              <h3>약점 영역</h3>
              <div class="tag-list weak-tags">${weakAreas.length ? weakAreas.map((x) => `<span>${escapeHtml(x)}</span>`).join("") : "<span>뚜렷한 약점 영역이 없습니다.</span>"}</div>
            </div>
          </div>
          <p class="section-guide">${isLevelTestResult(result) ? "현재 약점 영역은 레벨테스트 문항 기준입니다." : "현재 약점 영역은 30문항 기준입니다."} 같은 유형을 묶어서 다시 듣고, 정답 근거가 되는 표현을 확인하세요.</p>
        </section>

        <section class="section-block prescription-section">
          <h2>학습 처방</h2>
          ${buildPrescription(result, groupRows, typeRows, wrongItems)}
        </section>

        <section class="section-block wrong-section">
          <h2>오답 문항</h2>
          ${buildWrongItemList(wrongItems.filter((item) => item.student_answer !== null))}
        </section>

        <section class="section-block unanswered-section">
          <h2>미응답 문항</h2>
          ${buildUnansweredList(wrongItems.filter((item) => item.student_answer === null))}
        </section>
      </section>
    `;
  }

  function saveNormalizedRandomResultForPrint(result) {
    if (!isRandomResult(result)) return;

    try {
      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(result, null, 2));
    } catch (error) {
      console.warn("[saveNormalizedRandomResultForPrint] failed:", error);
    }
  }

  function updateWrongReviewButton(result) {
    const btn = document.getElementById("wrong-review-btn");
    if (!btn) return;

    const remaining = getRemainingWrongCount(result);

    if (!result) {
      btn.textContent = "오답 다시 풀기";
      btn.disabled = true;
      btn.title = "먼저 시험 결과를 제출해야 합니다.";
      return;
    }

    if (remaining > 0) {
      btn.textContent = `오답 다시 풀기 (${remaining}문항 남음)`;
      btn.disabled = false;
      btn.title = `오답풀이 진행 상태 기준으로 ${remaining}문항을 다시 풀 수 있습니다. 진단 보고서 본문은 최초 제출 결과 기준으로 유지됩니다.`;
    } else {
      btn.textContent = "오답 다시 풀기 (남은 오답 0문항)";
      btn.disabled = true;
      btn.title = "남은 오답 또는 미응답 문항이 없습니다.";
    }
  }

  function buildWrongReviewAdjustedAnalysisResult(originalResult) {
    // Step14:
    // 진단 보고서는 최초 제출 결과만 기준으로 유지한다.
    // 오답풀이에서 맞힌 문항은 오답풀이 진행 화면에서만 사용하고,
    // 이 보고서의 점수·약점 분석·오답 목록에는 반영하지 않는다.
    return originalResult;
  }

  function getOriginalWrongQuestionNumberSet(originalResult) {
    return new Set((originalResult?.items || [])
      .filter((item) => item.student_answer === null || item.is_correct === false)
      .map((item) => Number(item.question_number))
      .filter(Number.isFinite));
  }

  function getRemainingWrongQuestionNumberSet(originalResult) {
    // Step14:
    // 진단 보고서 기준의 남은 문항은 최초 제출 당시의 오답/미응답 문항이다.
    // 오답풀이 누적 진행률은 여기서 반영하지 않는다.
    return getOriginalWrongQuestionNumberSet(originalResult);
  }

  function getCorrectedQuestionNumberSet(originalResult) {
    // Step14: 진단 보고서에는 오답풀이 정답 처리 문항을 반영하지 않는다.
    return new Set();
  }

  function getRemainingWrongCount(originalResult) {
    // Step15:
    // 진단 보고서 본문은 최초 제출 결과 그대로 유지한다.
    // 단, 상단의 "오답 다시 풀기" 버튼에 표시되는 남은 문항 수는
    // 오답풀이 진행 상태를 반영해야 한다.
    if (!originalResult) return 0;

    const originalWrongSet = getOriginalWrongQuestionNumberSet(originalResult);
    const progress = loadWrongReviewProgressForOriginal(originalResult);

    if (progress && Array.isArray(progress.remaining_question_numbers)) {
      const remaining = uniqueFiniteNumbers(progress.remaining_question_numbers)
        .filter((q) => originalWrongSet.has(q));
      return remaining.length;
    }

    const reviewResult = loadWrongReviewResult();
    if (isReviewResultForOriginal(reviewResult, originalResult)) {
      return (reviewResult.items || [])
        .filter((item) => item.student_answer === null || item.student_answer === undefined || item.is_correct === false)
        .map((item) => Number(item.question_number))
        .filter((q) => Number.isFinite(q) && originalWrongSet.has(q)).length;
    }

    return originalWrongSet.size;
  }

  function uniqueFiniteNumbers(values) {
    return Array.from(new Set((values || [])
      .map((value) => Number(value))
      .filter(Number.isFinite)
    )).sort((a, b) => a - b);
  }

  function getRemainingWrongItems(originalResult) {
    return (originalResult?.items || [])
      .filter((item) => item.student_answer === null || item.is_correct === false);
  }


  function loadWrongReviewProgressForOriginal(originalResult) {
    try {
      const raw = localStorage.getItem(WRONG_REVIEW_PROGRESS_STORAGE_KEY);
      if (!raw) return null;
      const progress = JSON.parse(raw);
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

  function loadWrongReviewResult() {
    const raw = localStorage.getItem(WRONG_REVIEW_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function countWrongOrUnanswered(result) {
    return (result.items || []).filter((item) => item.student_answer === null || item.is_correct === false).length;
  }

  function buildGroupRows(result) {
    const groups = isLevelTestResult(result) ? LEVEL_TEST_GROUPS : GROUPS;

    return groups.map((group) => {
      const items = itemsInRange(result.items || [], group.range);
      const stat = calcStat(items);
      return {
        cells: [
          group.name,
          `<strong>${group.focus}</strong><br>${group.prescription}`,
          `${stat.correct} / ${items.length}`,
          `${stat.earned} / ${stat.total}`,
          `${stat.rate}%`,
          stat.problemQuestions.length ? stat.problemQuestions.map((q) => `${q}번`).join(", ") : "관련 문항 없음"
        ],
        rate: stat.rate,
        name: group.name,
        correct: stat.correct,
        total: items.length,
        earned: stat.earned,
        totalPoints: stat.total,
        score: stat.earned,
        problemNumbers: stat.problemQuestions,
        problemCount: stat.problemQuestions.length
      };
    });
  }

  function buildTypeRows(result) {
    const map = new Map();
    (result.items || []).forEach((item) => {
      const key = item.category || item.type || "기타";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });

    return Array.from(map.entries()).map(([name, items]) => {
      const stat = calcStat(items);
      return {
        cells: [
          name,
          `${stat.correct} / ${items.length}`,
          `${stat.earned} / ${stat.total}`,
          `${stat.rate}%`,
          stat.problemQuestions.length ? stat.problemQuestions.map((q) => `${q}번`).join(", ") : "관련 문항 없음"
        ],
        rate: stat.rate,
        name,
        correct: stat.correct,
        total: items.length,
        earned: stat.earned,
        totalPoints: stat.total,
        score: stat.earned,
        problemNumbers: stat.problemQuestions,
        problemCount: stat.problemQuestions.length
      };
    });
  }

  function buildAreaRows(result) {
    const map = new Map();
    (result.items || []).forEach((item) => {
      const key = diagnosisLabel(item.diagnostic_area || item.category || "기타");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });

    return Array.from(map.entries()).map(([name, items]) => {
      const stat = calcStat(items);
      return {
        cells: [
          name,
          `${stat.correct} / ${items.length}`,
          `${stat.earned} / ${stat.total}`,
          `${stat.rate}%`,
          stat.problemQuestions.length ? stat.problemQuestions.map((q) => `${q}번`).join(", ") : "관련 문항 없음"
        ],
        rate: stat.rate,
        name,
        correct: stat.correct,
        total: items.length,
        earned: stat.earned,
        totalPoints: stat.total,
        score: stat.earned,
        problemNumbers: stat.problemQuestions,
        problemCount: stat.problemQuestions.length
      };
    });
  }

  function itemsInRange(items, range) {
    return items.filter((item) => {
      const q = Number(item.question_number);
      return q >= range[0] && q <= range[1];
    });
  }

  function calcStat(items) {
    const total = items.reduce((sum, item) => sum + Number(item.points || 0), 0);
    const earned = items.reduce((sum, item) => sum + Number(item.earned_points || 0), 0);
    const correct = items.filter((item) => item.is_correct).length;
    const rate = total ? Math.round((earned / total) * 100) : 0;
    const problemQuestions = items
      .filter((item) => item.student_answer === null || item.is_correct === false)
      .map((item) => item.question_number);
    return { total, earned, correct, rate, problemQuestions };
  }

  function buildBars(rows) {
    return rows.map((row) => {
      const [name, correct, score, rateText] = row.cells;
      const rate = Math.max(0, Math.min(100, Number(row.rate || 0)));
      const levelClass = rate >= 80 ? "good" : rate >= 50 ? "mid" : "weak";
      return `
        <div class="bar-row score-bar-row ${levelClass}">
          <div class="bar-topline">
            <div class="bar-name">${escapeHtml(name)}</div>
            <div class="bar-rate">${rateText}</div>
          </div>
          <div class="bar-track" aria-label="${escapeHtml(name)} ${rate}%">
            <div class="bar-fill" style="width:${rate}%"></div>
          </div>
          <div class="bar-meta">
            <span>점수 ${score}</span>
            <span>정답 ${correct}문항</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function buildWeakSummary(typeRows) {
    const weak = typeRows
      .filter((row) => row.problemCount > 0)
      .sort((a, b) => a.rate - b.rate || b.problemCount - a.problemCount)
      .slice(0, 3);
    if (!weak.length) return "현재 뚜렷한 약점 유형이 없습니다.";
    return `현재 가장 보완이 필요한 유형은 ${weak.map((row) => `${row.name} ${row.rate}%`).join(", ")}입니다.`;
  }

  function buildRelatedWrongSummary(typeRows) {
    const weak = typeRows
      .filter((row) => row.problemCount > 0)
      .sort((a, b) => a.rate - b.rate || b.problemCount - a.problemCount)
      .slice(0, 3);

    if (!weak.length) return "관련 오답 문항: 없음";

    const parts = weak.map((row) => {
      const problemCell = row.cells[row.cells.length - 1] || "";
      return `${row.name}: ${problemCell}`;
    });

    return `관련 오답 문항: ${parts.join(" / ")}`;
  }

  function buildCompactGroupTable(rows) {
    if (!rows || !rows.length) return `<p class="empty-message">구간별 분석 정보가 없습니다.</p>`;

    return `
      <table class="analysis-table compact-group-table">
        <thead>
          <tr>
            <th>구간</th>
            <th>정답 수</th>
            <th>점수</th>
            <th>정답률</th>
            <th>복습할 문항</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const cells = row.cells || [];
            return `
              <tr>
                <td>${cells[0] || ""}</td>
                <td>${cells[2] || ""}</td>
                <td>${cells[3] || ""}</td>
                <td>${cells[4] || ""}</td>
                <td>${cells[5] || ""}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function buildAnalysisTable(rows, headers) {
    return `
      <table class="analysis-table">
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => {
            const cells = (row.cells || []).slice(0, headers.length);
            while (cells.length < headers.length) cells.push("");
            return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function getStrongAreas(typeRows, areaRows) {
    // TOPIK I 듣기는 대표 유형과 진단 영역이 거의 1:1로 대응하므로
    // 강점 영역 태그는 대표 유형 중심으로 표시하여 중복을 줄인다.
    const strong = typeRows
      .filter((row) => row.rate >= 80 && row.problemCount === 0)
      .slice(0, 6)
      .map((row) => `${row.name} ${row.rate}%`);

    return strong;
  }

  function getWeakAreas(typeRows, areaRows) {
    // 진단 영역별 표는 아래에 따로 있으므로, 약점 태그는 대표 유형 중심으로 표시한다.
    // 이렇게 해야 PDF에서 같은 의미의 태그가 두 번씩 반복되는 현상을 줄일 수 있다.
    return typeRows
      .filter((row) => row.problemCount > 0)
      .sort((a, b) => a.rate - b.rate || b.problemCount - a.problemCount)
      .slice(0, 8)
      .map((row) => `${row.name} 문제 ${row.problemCount}개`);
  }

  function buildPriorityReviewSection(result, groupRows, typeRows, wrongItems) {
    const weakTypes = typeRows
      .filter((row) => row.problemCount > 0)
      .sort((a, b) => {
        if (a.rate !== b.rate) return a.rate - b.rate;
        return b.problemCount - a.problemCount;
      })
      .slice(0, 3);

    if (!weakTypes.length) {
      return `
        <section class="section-block priority-review-section">
          <h2>우선 복습 순서</h2>
          <div class="student-tip-box">
            <strong>현재 큰 약점 유형이 뚜렷하지 않습니다.</strong>
            <p>오답 문항만 다시 듣고, 정답 근거 표현을 확인한 뒤 다음 랜덤 시험을 한 번 더 응시하세요.</p>
          </div>
        </section>
      `;
    }

    const priorityCards = weakTypes.map((row, index) => {
      const summary = normalizePriorityRow(row);
      const wrongNums = summary.problemNumbers.length
        ? summary.problemNumbers.map((n) => `${n}번`).join(", ")
        : summary.problemText;
      const tip = getTypeActionTip(row.name);
      return `
        <article class="priority-card">
          <h3>${index + 1}순위 · ${escapeHtml(row.name)}</h3>
          <p><strong>현재 결과:</strong> ${summary.correct} / ${summary.total}문항 정답, ${summary.earned} / ${summary.totalPoints}점, 정답률 ${summary.rate}%</p>
          <p><strong>복습할 문항:</strong> ${escapeHtml(wrongNums)}</p>
          <p><strong>복습 방법:</strong> ${escapeHtml(tip)}</p>
        </article>
      `;
    }).join("");

    return `
      <section class="section-block priority-review-section">
        <h2>우선 복습 순서</h2>
        <p class="section-guide">오답이 많은 경우 모든 문항을 한 번에 다시 풀기보다, 아래 순서대로 유형을 묶어서 복습하는 것이 효과적입니다.</p>
        <div class="priority-grid">${priorityCards}</div>
        <div class="student-action-plan">
          <h3>오늘 할 일</h3>
          <ol>
            <li>1순위 유형의 오답 오디오를 다시 듣고, 정답이 되는 표현을 한 줄로 적습니다.</li>
            <li>2순위 유형은 선택지의 핵심 명사·동사에 먼저 밑줄을 긋고 다시 듣습니다.</li>
            <li>긴 대화나 내용 일치 문제는 들으면서 인물, 장소, 날짜, 행동을 표로 정리합니다.</li>
          </ol>
          <h3>다음 랜덤 시험 전 확인할 것</h3>
          <p>같은 유형의 오답 수가 줄었는지, 미응답이 생기지 않았는지, 정답 근거를 듣고 설명할 수 있는지 확인하세요.</p>
        </div>
      </section>
    `;
  }

  function normalizePriorityRow(row) {
    const correctCell = String(row?.cells?.[1] || "");
    const scoreCell = String(row?.cells?.[2] || "");
    const problemCell = String(row?.cells?.[4] || "");

    const correctMatch = correctCell.match(/(\d+)\s*\/\s*(\d+)/);
    const scoreMatch = scoreCell.match(/(\d+)\s*\/\s*(\d+)/);

    const problemNumbers = Array.isArray(row.problemNumbers)
      ? row.problemNumbers.map(Number).filter(Number.isFinite)
      : extractQuestionNumbers(problemCell);

    return {
      correct: Number.isFinite(Number(row.correct)) ? Number(row.correct) : Number(correctMatch?.[1] || 0),
      total: Number.isFinite(Number(row.total)) ? Number(row.total) : Number(correctMatch?.[2] || 0),
      earned: Number.isFinite(Number(row.earned)) ? Number(row.earned) : Number(row.score ?? scoreMatch?.[1] ?? 0),
      totalPoints: Number.isFinite(Number(row.totalPoints)) ? Number(row.totalPoints) : Number(scoreMatch?.[2] || 0),
      rate: Number.isFinite(Number(row.rate)) ? Number(row.rate) : 0,
      problemNumbers,
      problemText: problemNumbers.length ? problemNumbers.map((n) => `${n}번`).join(", ") : (problemCell && !problemCell.includes("관련 문항 없음") ? stripHtml(problemCell) : "관련 오답 없음")
    };
  }

  function extractQuestionNumbers(text) {
    const numbers = [];
    String(text || "").replace(/(\d+)번/g, (_, n) => {
      numbers.push(Number(n));
      return "";
    });
    return [...new Set(numbers)].filter(Number.isFinite).sort((a, b) => a - b);
  }

  function stripHtml(value) {
    return String(value || "").replace(/<[^>]*>/g, "").trim();
  }

  function getTypeActionTip(typeName) {
    const name = String(typeName || "");
    if (name.includes("알맞은 대답")) {
      return "질문 끝의 의문사와 핵심 명사를 먼저 듣고, 예/아니요 대답이 맞는지 확인하세요.";
    }
    if (name.includes("이어지는 말")) {
      return "감사, 사과, 인사, 부탁, 허락처럼 마지막 말 뒤에 자연스럽게 이어지는 기능 표현을 묶어서 복습하세요.";
    }
    if (name.includes("장소")) {
      return "물건 이름, 사람의 역할, 행동 단서를 듣고 장소를 연결하세요.";
    }
    if (name.includes("화제")) {
      return "반복해서 나오는 명사와 두 사람이 가장 많이 말하는 대상을 표시하세요.";
    }
    if (name.includes("그림")) {
      return "누가, 어디에서, 무엇을 하는지 순서대로 듣고 그림의 행동과 물건 위치를 대조하세요.";
    }
    if (name.includes("내용 일치")) {
      return "선택지의 인물·장소·시간·행동을 하나씩 듣기 내용과 대조하세요.";
    }
    if (name.includes("중심 생각")) {
      return "좋다, 필요하다, 하고 싶다, 불편하다 같은 의견·태도 표현을 중심으로 들으세요.";
    }
    if (name.includes("긴 대화")) {
      return "첫 문제는 전체 목적, 두 번째 문제는 세부 내용으로 역할을 나누어 듣고 메모하세요.";
    }
    return "오답 문항을 다시 듣고 정답 근거가 되는 표현을 찾아 표시하세요.";
  }

  function buildWrongItemList(items) {
    if (!items.length) return `<p class="empty-message">오답 또는 미응답 문항이 없습니다.</p>`;

    return `
      <div class="wrong-grid">
        ${items.map((item) => {
          const student = item.student_answer === null ? "미응답" : `${item.student_answer}. ${choiceText(item, item.student_answer)}`;
          const correct = item.correct_answer === null ? "-" : `${item.correct_answer}. ${choiceText(item, item.correct_answer)}`;
          const source = getSourceInfoText(item);
          return `
            <article class="wrong-item compact-wrong-item">
              <div class="wrong-title">
                <strong>${item.question_number}번</strong>
                <span>${escapeHtml(item.category || diagnosisLabel(item.diagnostic_area || ""))}</span>
              </div>
              ${source ? `<div class="wrong-answer-line source-line">${escapeHtml(source)}</div>` : ""}
              <div class="wrong-answer-line answer-line"><b>내 답</b> ${escapeHtml(student)}</div>
              <div class="wrong-answer-line answer-line correct-line"><b>정답</b> ${escapeHtml(correct)}</div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function choiceText(item, choice) {
    const opt = (item.options || []).find((option) => Number(option.choice) === Number(choice));
    return opt?.text || "";
  }

  function buildUnansweredList(items) {
    if (!items.length) return `<p class="empty-message">미응답 문항이 없습니다.</p>`;
    return `<p class="unanswered-list">${items.map((item) => `${item.question_number}번`).join(", ")}</p>`;
  }

  function buildCurrentLevelPrescriptionText(result, level) {
    if (isLevelTestResult(result)) {
      const score100 = getScore100(result);
      const gradeInfo = getTopik1ExpectedGradeFrom100(score100);

      return `현재 듣기 레벨테스트 기준 예상 수준은 '${escapeHtml(gradeInfo.title)}'입니다. 100점 환산 점수는 ${score100}점이며, 다음 목표는 ${escapeHtml(gradeInfo.next)}입니다. 듣기에서는 문제를 보기 전에 상황 단서, 핵심 명사, 화자의 태도 표현을 빠르게 잡는 연습이 필요합니다.`;
    }

    return `현재 듣기 기준 예상 수준은 '${escapeHtml(level.title)}'입니다. 다음 목표는 ${escapeHtml(level.next)}입니다. 듣기에서는 문제를 보기 전에 상황 단서, 핵심 명사, 화자의 태도 표현을 빠르게 잡는 연습이 필요합니다.`;
  }

  function buildPrescription(result, groupRows, typeRows, wrongItems) {
    const level = interpretLevel(result.earned_points);
    const weakGroups = groupRows.filter((row) => row.problemCount > 0).sort((a, b) => a.rate - b.rate).slice(0, 3);
    const weakTypes = typeRows.filter((row) => row.problemCount > 0).sort((a, b) => a.rate - b.rate).slice(0, 3);
    const wrongNums = wrongItems.map((item) => `${item.question_number}번`).join(", ") || "없음";

    return `
      <div class="compact-prescription final-prescription">
        <p class="prescription-lead">${buildCurrentLevelPrescriptionText(result, level)}</p>

        <div class="prescription-grid">
          <div>
            <h3>우선 복습 구간</h3>
            <p>${escapeHtml(weakGroups.map((row) => row.name).join(", ") || "현재 뚜렷한 약점 구간이 없습니다.")}</p>
          </div>
          <div>
            <h3>우선 복습 유형</h3>
            <p>${escapeHtml(weakTypes.map((row) => row.name).join(", ") || "현재 뚜렷한 약점 유형이 없습니다.")}</p>
          </div>
        </div>

        <p class="wrong-management"><strong>오답·미응답 관리:</strong> ${escapeHtml(wrongNums)} 문항을 오답 다시 풀기로 먼저 복습하세요.</p>
        <p class="two-week-plan"><strong>2주 계획:</strong> 1~3일차 오답 근거 표시 → 4~6일차 약점 유형 복습 → 7일차 전체 재풀이 → 8~13일차 새 랜덤 시험 반복 → 14일차 보고서 비교.</p>
      </div>
    `;
  }

  function interpretLevel(score) {
    const s = Number(score || 0);
    if (s < 30) {
      return {
        title: "TOPIK I 듣기 기초 보완 필요",
        range: "0~29점",
        expected: "기초 듣기 표현 보완 단계",
        safe: "TOPIK I 안정권 진입 전 준비 단계",
        next: "30점 이상, 기본 대화 이해 안정화",
        comment: "짧은 질문과 대답, 장소·화제 단서 파악부터 다시 안정화해야 합니다."
      };
    }
    if (s < 50) {
      return {
        title: "TOPIK I 듣기 초급 하위 안정화 단계",
        range: "30~49점",
        expected: "기본 대화 이해 가능 단계",
        safe: "1급 가능권 진입 전후",
        next: "50점 이상, TOPIK I 1급 안정권",
        comment: "기초 응답과 장소·화제 파악은 가능하지만 내용 일치와 중심 생각에서 보완이 필요합니다."
      };
    }
    if (s < 70) {
      return {
        title: "TOPIK I 듣기 1급 가능권",
        range: "50~69점",
        expected: "일상 대화 이해 가능 단계",
        safe: "TOPIK I 1급 가능권",
        next: "70점 이상, 2급 가능권",
        comment: "기본 유형은 안정적입니다. 긴 대화 세트와 세부 정보 일치 판단을 강화하세요."
      };
    }
    return {
      title: "TOPIK I 듣기 2급 가능권",
      range: "70~100점",
      expected: "TOPIK I 듣기 상위 안정권",
      safe: "TOPIK I 2급 가능권",
      next: "읽기와 합산 점수 안정화",
      comment: "대부분의 듣기 유형을 안정적으로 처리할 수 있습니다. 오답 유형만 집중 복습하세요."
    };
  }

  function formatDateTime(value) {
    if (!value) return "-";
    try { return new Date(value).toLocaleString("ko-KR"); } catch { return value; }
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

document.addEventListener("DOMContentLoaded", ListeningDiagnosis.init);
