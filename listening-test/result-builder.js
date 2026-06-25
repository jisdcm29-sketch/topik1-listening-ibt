// TOPIK I 듣기 PBT형 IBT - result-builder.js
// 결과 JSON 생성, 채점, localStorage 저장, JSON 다운로드 전용.
// Step34c: 랜덤 시험지 결과에 원회차/원문항/문제은행 출처 정보를 오디오 경로 기준으로도 보존한다.

const ResultBuilder = (() => {
  const RESULT_STORAGE_KEY = "topik1-listening-result-latest";
  const WRONG_REVIEW_STORAGE_KEY = "topik1-listening-wrong-review-latest";

  function buildResult({ exam, answerKey, answers, student, examMeta, override = {} }) {
    const answerMap = buildAnswerMap(answerKey);
    const sourceItems = Array.isArray(exam?.items) ? exam.items : [];

    const resultItems = sourceItems.map((item) => {
      const key = answerMap.get(Number(item.question_number)) || {};
      const points = Number(key.points ?? item.points ?? 0);
      const correctAnswer = normalizeAnswer(key.correct_answer);
      const studentAnswer = normalizeAnswer(answers?.[item.question_number]);
      const answered = studentAnswer !== null;
      const isCorrect = answered && correctAnswer !== null && studentAnswer === correctAnswer;
      const earnedPoints = isCorrect ? points : 0;

      const sourcePathQuestionNumber = extractQuestionNumberFromSourcePath(item.audio_url || item.primary_audio_url || item.image_url || "");
      const sourcePathRound = extractRoundFromSourcePath(item.audio_url || item.primary_audio_url || item.image_url || "");

      const originalQuestionNumber = Number(
        item.source_question_number ??
        item.original_question_number ??
        key.original_question_number ??
        sourcePathQuestionNumber ??
        item.question_number
      );

      return {
        id: item.id,
        question_number: Number(item.question_number),
        output_question_number: Number(item.output_question_number || item.question_number),
        original_question_number: Number.isFinite(originalQuestionNumber) ? originalQuestionNumber : null,
        source_question_number: Number.isFinite(originalQuestionNumber) ? originalQuestionNumber : null,
        source_round: item.source_round || key.source_round || sourcePathRound || "",
        source_exam_id: item.random_source_exam_id || item.source_exam_id || "",
        source_exam_title: item.random_source_exam_title || item.source_exam_title || "",
        source_bank_id: item.source_bank_id || item.random_source_bank_id || key.source_bank_id || "",
        source_set_id: item.source_set_id || item.random_source_set_id || key.source_set_id || "",
        generated_from_random_bank: item.generated_from_random_bank === true,
        type: item.type,
        category: item.category,
        diagnostic_area: item.diagnostic_area,
        instruction: item.instruction,
        question: item.question,
        audio_url: item.audio_url || "",
        image_url: item.image_url || "",
        options: item.options || [],
        points,
        earned_points: earnedPoints,
        correct_answer: correctAnswer,
        student_answer: studentAnswer,
        is_correct: answered ? isCorrect : false,
        description: item.description || ""
      };
    });

    const totalQuestions = Number(override.total_questions || exam?.total_questions || resultItems.length);
    const answeredCount = resultItems.filter((item) => item.student_answer !== null).length;
    const correctCount = resultItems.filter((item) => item.is_correct).length;
    const wrongCount = resultItems.filter((item) => item.student_answer !== null && !item.is_correct).length;
    const totalPossiblePoints = resultItems.reduce((sum, item) => sum + Number(item.points || 0), 0);
    const earnedPoints = resultItems.reduce((sum, item) => sum + Number(item.earned_points || 0), 0);
    const sectionScore100 = totalPossiblePoints > 0
      ? Math.round((earnedPoints / totalPossiblePoints) * 1000) / 10
      : 0;

    const generatedMode = override.generated_exam_mode ||
      exam?.generated_exam_mode ||
      examMeta?.generated_exam_mode ||
      exam?.exam_mode ||
      exam?.exam_type ||
      examMeta?.exam_type ||
      "";

    const generatedRound = override.generated_exam_round ||
      exam?.generated_exam_round ||
      examMeta?.generated_exam_round ||
      exam?.source_round ||
      examMeta?.source_round ||
      "";

    const generatedLabel = override.generated_exam_label ||
      exam?.generated_exam_label ||
      exam?.title ||
      examMeta?.generated_exam_label ||
      examMeta?.label ||
      "";

    const result = {
      test_level: exam?.level || "TOPIK I",
      section: "listening",
      test_name: override.test_name || exam?.title || examMeta?.label || "",
      test_scope: override.test_scope || exam?.test_scope || "",
      student_name: student?.name || "",
      student_phone: student?.phone || "",
      started_at: student?.started_at || "",
      submitted_at: new Date().toISOString(),
      time_limit_minutes: Number(override.time_limit_minutes || exam?.time_limit_minutes || 40),
      total_questions: totalQuestions,
      answered_count: answeredCount,
      unanswered_count: Math.max(0, totalQuestions - answeredCount),
      correct_count: correctCount,
      wrong_count: wrongCount,
      total_possible_points: totalPossiblePoints,
      earned_points: earnedPoints,
      section_score_100: sectionScore100,
      generated_exam_mode: generatedMode,
      generated_exam_round: generatedRound,
      generated_exam_label: generatedLabel,
      audio_mode: exam?.audio_policy?.mode || "play_once_to_end",
      items: resultItems
    };

    const looksRandom = isRandomGeneratedResult({
      generatedMode,
      generatedRound,
      generatedLabel,
      testScope: result.test_scope,
      exam,
      answerKey,
      items: resultItems
    });

    if (looksRandom) {
      const sourceRounds = getSourceRoundsFromItems(resultItems);
      result.random_generation = {
        ...(answerKey?.random_generation || {}),
        ...(exam?.random_generation || {}),
        seed: exam?.random_generation?.seed || answerKey?.random_generation?.seed || generatedRound || "",
        source_rounds: exam?.random_generation?.source_rounds || answerKey?.random_generation?.source_rounds || sourceRounds,
        selection_trace: exam?.random_generation?.selection_trace || answerKey?.random_generation?.selection_trace || []
      };
      result.generated_exam_mode = "random";
      result.generated_exam_label = generatedLabel || (String(result.test_name || "").includes("레벨") ? "TOPIK I 듣기 랜덤 레벨테스트 16문항" : "TOPIK I 듣기 랜덤 시험지 30문항");
      result.random_source_rounds = result.random_generation.source_rounds || sourceRounds;
      result.generated_exam_source_rounds = result.random_source_rounds;
    }

    return result;
  }

  function isRandomGeneratedResult({ generatedMode, generatedRound, generatedLabel, testScope, exam, answerKey, items }) {
    const text = [
      generatedMode,
      generatedRound,
      generatedLabel,
      testScope,
      exam?.title,
      exam?.exam_mode,
      exam?.exam_type,
      answerKey?.generated_exam_mode
    ].map((value) => String(value || "").toLowerCase()).join(" ");

    return !!exam?.random_generation ||
      !!answerKey?.random_generation ||
      text.includes("random") ||
      text.includes("랜덤") ||
      String(generatedRound || "").toLowerCase().startsWith("random-") ||
      (items || []).some((item) => item.generated_from_random_bank === true);
  }

  function buildAnswerMap(answerKey) {
    const map = new Map();
    const answers = Array.isArray(answerKey?.answers) ? answerKey.answers : [];
    answers.forEach((item) => {
      map.set(Number(item.question_number), {
        correct_answer: item.correct_answer,
        points: item.points,
        source_round: item.source_round || "",
        original_question_number: item.original_question_number,
        source_bank_id: item.source_bank_id || "",
        source_set_id: item.source_set_id || ""
      });
    });
    return map;
  }

  function getSourceRoundsFromItems(items) {
    return [...new Set((items || []).map((item) => {
      return String(item.source_round || extractRoundFromSourcePath(item.audio_url || item.primary_audio_url || item.image_url || "") || "");
    }).filter(Boolean))].sort();
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

  function normalizeAnswer(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }

  function saveToLocalStorage(result, key = RESULT_STORAGE_KEY) {
    localStorage.setItem(key, JSON.stringify(result, null, 2));
    return key;
  }

  function loadFromLocalStorage(key = RESULT_STORAGE_KEY) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function downloadJson(result, filename) {
    const safeFilename = filename || makeDefaultFilename(result);
    const jsonText = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function makeDefaultFilename(result) {
    const round = result?.generated_exam_round || "exam";
    const name = (result?.student_name || "student").replace(/[\\/:*?"<>|\s]+/g, "_");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = result?.generated_exam_mode === "wrong-review" ? "wrong-review" : "result";
    return `${suffix}-${round}-${name}-${timestamp}.json`;
  }

  return {
    buildResult,
    saveToLocalStorage,
    loadFromLocalStorage,
    downloadJson,
    makeDefaultFilename,
    RESULT_STORAGE_KEY,
    WRONG_REVIEW_STORAGE_KEY
  };
})();
