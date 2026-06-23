(() => {
  "use strict";

  const BANK_URL = "../listening-test/data/bank/question-bank.json";
  const TEST_BASE = "../listening-test/";

  const state = {
    bank: null,
    allItems: [],
    setMap: new Map(),
    exampleMap: new Map(),
    selectedItems: [],
    audioRows: [],
    lastMode: "student"
  };

  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();

    try {
      setStatus("문제은행을 불러오는 중입니다.");
      const bank = await fetchJson(BANK_URL);
      state.bank = bank;
      buildItemIndex(bank);
      renderRoundList();
      setStatus(buildBankStatus());
    } catch (error) {
      console.error(error);
      setStatus("문제은행을 불러오지 못했습니다.\n" + error.message);
      $("print-root").innerHTML = `<div class="empty-preview error">문제은행을 불러오지 못했습니다. ${escapeHtml(error.message)}</div>`;
    }
  }

  function bindEvents() {
    $("build-preview").addEventListener("click", () => renderPreview("student"));
    $("print-student").addEventListener("click", () => printMode("student"));
    $("print-with-key").addEventListener("click", () => printMode("with-key"));
    $("print-key-only").addEventListener("click", () => printMode("key-only"));
    $("download-audio-map").addEventListener("click", downloadAudioMapCsv);
    $("download-audio-zip").addEventListener("click", downloadAudioZip);
    $("reset-tool").addEventListener("click", resetTool);
    $("select-all-rounds").addEventListener("click", () => setAllRounds(true));
    $("clear-rounds").addEventListener("click", () => setAllRounds(false));
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url} 파일을 불러오지 못했습니다. HTTP ${response.status}`);
    }
    return response.json();
  }

  function buildItemIndex(bank) {
    state.setMap.clear();
    state.exampleMap.clear();
    buildExampleIndex(bank);

    (bank.long_listening_sets || []).forEach((set) => {
      const key = set.bank_set_id || set.set_id || set.audio_group_id || set.audio_url;
      state.setMap.set(key, set);
      (set.items || []).forEach((item) => {
        item.__set_key = key;
        item.__set_item = true;
      });
    });

    const singleItems = (bank.single_questions || []).map((item) => ({ ...item, __source_kind: "single" }));
    const setItems = (bank.long_listening_sets || []).flatMap((set) => {
      const key = set.bank_set_id || set.set_id || set.audio_group_id || set.audio_url;
      return (set.items || []).map((item) => ({ ...item, __source_kind: "set-item", __set_key: key }));
    });

    state.allItems = [...singleItems, ...setItems].map((item) => normalizeItem(item));
  }

  function buildExampleIndex(bank) {
    const registerExample = (key, example, round = "") => {
      if (!example || typeof example !== "object") return;

      const normalized = normalizeExample({
        source_round: round || example.source_round || "",
        ...example
      });

      const ids = [
        key,
        normalized.example_id,
        normalized.id,
        normalized.source_example_id,
        normalized.bank_id,
        normalized.sample_id
      ].filter(Boolean).map(String);

      ids.forEach((id) => {
        state.exampleMap.set(id, normalized);
        if (normalized.source_round) {
          state.exampleMap.set(`${normalized.source_round}:${id}`, normalized);
        }
      });
    };

    const containers = [
      bank.examples,
      bank.example_bank,
      bank.example_questions,
      bank.listening_examples,
      bank.sample_questions,
      bank.sample_items
    ];

    containers.forEach((container) => {
      if (!container) return;

      if (Array.isArray(container)) {
        container.forEach((example) => {
          const id = example.example_id || example.id || example.bank_id || example.sample_id || example.source_example_id;
          registerExample(id, example, example.source_round || "");
        });
        return;
      }

      if (typeof container === "object") {
        Object.entries(container).forEach(([key, example]) => {
          registerExample(key, example, example?.source_round || "");
        });
      }
    });

    // Step33 이후 question-bank에는 회차별 보기 블록이 example_blocks_by_source_round에 들어갈 수 있다.
    // 구조: { "100": [ { id: "EX_100_G01", ... } ], "102": [ { id: "EX_G01", ... } ] }
    const byRound = bank.example_blocks_by_source_round || bank.exampleBlocksBySourceRound || {};
    if (byRound && typeof byRound === "object") {
      Object.entries(byRound).forEach(([round, blocks]) => {
        if (Array.isArray(blocks)) {
          blocks.forEach((block) => {
            const id = block.example_id || block.id || block.source_example_id;
            registerExample(id, block, round);
          });
          return;
        }

        if (blocks && typeof blocks === "object") {
          Object.entries(blocks).forEach(([key, block]) => {
            registerExample(key, block, round);
          });
        }
      });
    }
  }

  function normalizeExample(example) {
    const exampleId = example.example_id || example.id || example.bank_id || example.sample_id || example.source_example_id || "";
    return {
      ...example,
      id: example.id || exampleId,
      example_id: exampleId,
      source_round: String(example.source_round || ""),
      instruction: example.instruction || example.example_instruction || "",
      question: example.question || example.example_question || example.prompt || "",
      dialogue: example.dialogue || example.example_dialogue || example.lines || [],
      text: example.text || example.example_text || example.body || "",
      correct_answer: example.correct_answer ?? example.example_correct_answer ?? null,
      options: (example.options || example.example_options || []).map((opt) => ({
        ...opt,
        image_url: normalizeTestAssetUrl(opt.image_url || "")
      })),
      image_choices: (example.image_choices || example.example_image_choices || []).map((opt) => ({
        ...opt,
        image_url: normalizeTestAssetUrl(opt.image_url || "")
      }))
    };
  }

  function normalizeItem(item) {
    const sourceRound = String(item.source_round || extractRound(item.audio_url) || "");
    const originalNumber = Number(item.original_question_number || item.source_question_number || item.question_number || extractQuestionNo(item.audio_url));
    return {
      ...item,
      source_round: sourceRound,
      original_question_number: originalNumber,
      source_question_number: Number(item.source_question_number || originalNumber),
      correct_answer: Number(item.correct_answer),
      points: Number(item.points || 0),
      audio_url: normalizeTestAssetUrl(item.audio_url || item.primary_audio_url || ""),
      primary_audio_url: normalizeTestAssetUrl(item.primary_audio_url || item.audio_url || ""),
      show_example: Boolean(item.show_example),
      example_audio_included: Boolean(item.example_audio_included),
      example_id: item.example_id || "",
      example: item.example || item.sample || item.example_item || item.example_block || null,
      example_instruction: item.example_instruction || "",
      example_question: item.example_question || "",
      example_text: item.example_text || "",
      example_dialogue: item.example_dialogue || item.dialogue_example || [],
      example_correct_answer: item.example_correct_answer ?? null,
      example_options: (item.example_options || []).map((opt) => ({
        ...opt,
        image_url: normalizeTestAssetUrl(opt.image_url || "")
      })),
      options: (item.options || []).map((opt) => ({
        ...opt,
        image_url: normalizeTestAssetUrl(opt.image_url || "")
      })),
      image_choices: (item.image_choices || []).map((opt) => ({
        ...opt,
        image_url: normalizeTestAssetUrl(opt.image_url || "")
      }))
    };
  }

  function normalizeTestAssetUrl(url) {
    if (!url) return "";
    const text = String(url).replace(/\\/g, "/");
    if (/^https?:\/\//i.test(text) || text.startsWith("../")) return text;
    if (text.startsWith("./")) return TEST_BASE + text.slice(2);
    if (text.startsWith("audio/") || text.startsWith("images/")) return TEST_BASE + text;
    return text;
  }

  function extractRound(url) {
    const text = String(url || "");
    const match = text.match(/(?:audio|images)\/(\d{2,4})\//) || text.match(/\b(\d{2,4})_L\d{3}/);
    return match ? match[1] : "";
  }

  function extractQuestionNo(url) {
    const match = String(url || "").match(/_L(\d{3})/i);
    return match ? Number(match[1]) : null;
  }

  function renderRoundList() {
    const rounds = [...new Set(state.allItems.map((item) => item.source_round).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    if (!rounds.length) {
      $("round-list").innerHTML = `<p class="help-text">표시할 회차가 없습니다.</p>`;
      return;
    }

    $("round-list").innerHTML = rounds.map((round) => `
      <label class="round-check">
        <input type="checkbox" name="round" value="${escapeHtml(round)}" checked />
        ${escapeHtml(round)}회
      </label>
    `).join("");
  }

  function setAllRounds(checked) {
    document.querySelectorAll('input[name="round"]').forEach((input) => {
      input.checked = checked;
    });
  }

  function resetTool() {
    $("start-number").value = 1;
    $("end-number").value = 4;
    $("max-count").value = 0;
    $("sort-order").value = "round-question";
    $("show-source").checked = true;
    $("include-audio-ref").checked = true;
    $("show-answer-inline").checked = false;
    $("include-answer-key").checked = true;
    $("sheet-title").value = "TOPIK I 듣기 교사용 문제지";
    setAllRounds(true);
    state.selectedItems = [];
    state.audioRows = [];
    $("print-root").innerHTML = `<div class="empty-preview">왼쪽에서 조건을 정한 뒤 [문제지 미리보기 생성]을 누르세요.</div>`;
    $("audio-download-panel").hidden = true;
    $("preview-summary").textContent = "조건을 정한 뒤 [문제지 미리보기 생성]을 누르세요.";
    setStatus(buildBankStatus());
  }

  function getSelectedRounds() {
    return [...document.querySelectorAll('input[name="round"]:checked')].map((input) => input.value);
  }

  function readConditions() {
    const start = clamp(Number($("start-number").value || 1), 1, 30);
    const end = clamp(Number($("end-number").value || 30), 1, 30);
    const minNo = Math.min(start, end);
    const maxNo = Math.max(start, end);
    const count = Math.max(0, Number($("max-count").value || 0));
    const rounds = getSelectedRounds();

    return {
      start: minNo,
      end: maxNo,
      count,
      rounds,
      sortOrder: $("sort-order").value,
      showSource: $("show-source").checked,
      includeAudioRef: $("include-audio-ref").checked,
      showAnswerInline: $("show-answer-inline").checked,
      includeAnswerKey: $("include-answer-key").checked,
      title: $("sheet-title").value.trim() || "TOPIK I 듣기 교사용 문제지"
    };
  }

  function selectItems(conditions) {
    if (!conditions.rounds.length) {
      throw new Error("출제 회차를 하나 이상 선택하세요.");
    }

    const baseItems = state.allItems.filter((item) => {
      return conditions.rounds.includes(String(item.source_round)) &&
        item.original_question_number >= conditions.start &&
        item.original_question_number <= conditions.end;
    });

    const expanded = expandLongListeningSets(baseItems, conditions);
    const unique = dedupeItems(expanded);
    const sorted = sortItems(unique, conditions.sortOrder);
    const sliced = conditions.count > 0 ? sorted.slice(0, conditions.count) : sorted;

    if (!sliced.length) {
      throw new Error("조건에 맞는 문항이 없습니다.");
    }

    return sliced.map((item, index) => ({
      ...item,
      output_question_number: index + 1
    }));
  }

  function expandLongListeningSets(items, conditions) {
    const result = [...items];
    const setKeys = new Set(items.map((item) => item.__set_key).filter(Boolean));

    setKeys.forEach((key) => {
      const set = state.setMap.get(key);
      if (!set) return;
      (set.items || []).forEach((item) => {
        const normalized = normalizeItem({ ...item, __source_kind: "set-item", __set_key: key });
        if (conditions.rounds.includes(String(normalized.source_round))) {
          result.push(normalized);
        }
      });
    });

    return result;
  }

  function dedupeItems(items) {
    const map = new Map();
    items.forEach((item) => {
      const key = item.bank_id || `${item.source_round}-${item.original_question_number}`;
      map.set(key, item);
    });
    return [...map.values()];
  }

  function sortItems(items, order) {
    const copy = [...items];

    if (order === "random") {
      return shuffle(copy);
    }

    return copy.sort((a, b) => {
      if (order === "question-round") {
        return (a.original_question_number - b.original_question_number) ||
          (Number(a.source_round) - Number(b.source_round));
      }
      return (Number(a.source_round) - Number(b.source_round)) ||
        (a.original_question_number - b.original_question_number);
    });
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function renderPreview(mode = "student") {
    try {
      const conditions = readConditions();
      const items = selectItems(conditions);
      const audioRows = buildAudioRows(items);

      state.selectedItems = items;
      state.audioRows = audioRows;
      state.lastMode = mode;

      const html = buildPrintHtml(items, audioRows, conditions, mode);
      $("print-root").innerHTML = html;
      renderAudioDownloads(audioRows);

      $("preview-summary").textContent = `${items.length}문항 / 오디오 ${audioRows.length}개 / ${conditions.rounds.map((r) => `${r}회`).join(", ")}`;
      const exampleInfo = buildExampleStatus(items);
      setStatus(`미리보기 생성 완료\n문항 수: ${items.length}\n오디오 파일: ${audioRows.length}\n긴 대화 세트는 자동으로 함께 포함됩니다.${exampleInfo}`);
    } catch (error) {
      console.error(error);
      setStatus(error.message);
      $("print-root").innerHTML = `<div class="empty-preview error">${escapeHtml(error.message)}</div>`;
      $("audio-download-panel").hidden = true;
    }
  }

  function buildAudioRows(items) {
    const map = new Map();

    items.forEach((item) => {
      const url = item.primary_audio_url || item.audio_url;
      if (!url) return;

      if (!map.has(url)) {
        map.set(url, {
          track_no: map.size + 1,
          audio_url: url,
          source_round: item.source_round,
          source_audio_file: item.source_audio_file || "",
          source_questions: []
        });
      }

      const row = map.get(url);
      row.source_questions.push(`${item.source_round}회 ${item.original_question_number}번`);
    });

    return [...map.values()].map((row) => ({
      ...row,
      track_label: `A${String(row.track_no).padStart(3, "0")}`,
      source_questions: [...new Set(row.source_questions)]
    }));
  }

  function getAudioLabel(item, audioRows) {
    const url = item.primary_audio_url || item.audio_url;
    const row = audioRows.find((audio) => audio.audio_url === url);
    return row ? row.track_label : "";
  }

  function buildPrintHtml(items, audioRows, conditions, mode) {
    const showInlineAnswer = mode !== "student" && (conditions.showAnswerInline || mode === "with-key");
    const includeKey = mode === "with-key" || (mode === "student" && conditions.includeAnswerKey && conditions.showAnswerInline);
    const keyOnly = mode === "key-only";

    if (keyOnly) {
      return `<div class="print-sheet key-only-sheet">${buildSheetHeader(conditions, items, audioRows, "교사용 정답표")}${buildAnswerKey(items, audioRows)}${buildAudioMap(items, audioRows)}</div>`;
    }

    return `
      <div class="print-sheet">
        ${buildSheetHeader(conditions, items, audioRows, mode === "with-key" ? "문제지 + 정답표" : "학생용 문제지")}
        ${items.map((item) => buildQuestionCard(item, audioRows, conditions, showInlineAnswer)).join("")}
        ${includeKey ? buildAnswerKey(items, audioRows) : ""}
        ${mode === "with-key" ? buildAudioMap(items, audioRows) : ""}
      </div>
    `;
  }

  function buildSheetHeader(conditions, items, audioRows, subtitle) {
    const rounds = [...new Set(items.map((item) => item.source_round))].sort((a, b) => Number(a) - Number(b));
    return `
      <header class="sheet-header">
        <h1>${escapeHtml(conditions.title)}</h1>
        <div class="sheet-meta">
          <span>${escapeHtml(subtitle)}</span>
          <span>문항 수 ${items.length}</span>
          <span>오디오 ${audioRows.length}개</span>
          <span>회차 ${rounds.map((r) => `${r}회`).join(", ")}</span>
          <span>생성 ${formatDate(new Date())}</span>
        </div>
      </header>
    `;
  }

  function buildQuestionCard(item, audioRows, conditions, showInlineAnswer) {
    const audioLabel = getAudioLabel(item, audioRows);
    const sourceLabel = `${item.source_round}회 원문항 ${item.original_question_number}번`;
    const titleBadges = [
      conditions.showSource ? `<span class="source-label">${escapeHtml(sourceLabel)}</span>` : "",
      conditions.includeAudioRef && audioLabel ? `<span class="audio-label">오디오 ${audioLabel}</span>` : "",
      `<span class="category-label">${escapeHtml(item.category || item.type || "")}</span>`
    ].join("");

    const answerChip = showInlineAnswer ? `<span class="answer-chip">정답 ${item.correct_answer}번</span>` : "";

    return `
      <article class="question-card ${questionCardClass(item)}">
        <div class="question-title">
          <h2>${item.output_question_number}. ${escapeHtml(item.question || "문항을 듣고 알맞은 답을 고르십시오.")}${answerChip}</h2>
          <div>${titleBadges}</div>
        </div>
        <div class="instruction">${escapeHtml(item.instruction || "")}</div>
        ${buildExampleBlock(item, showInlineAnswer)}
        ${item.question ? `<div class="question-text">${escapeHtml(item.question)}</div>` : ""}
        ${buildOptions(item)}
      </article>
    `;
  }

  function buildExampleBlock(item, showInlineAnswer) {
    if (!shouldRenderExample(item)) return "";

    const example = resolveExample(item);
    const answer = getExampleCorrectAnswer(example, item);
    const hasContent = hasExampleContent(example);

    if (!hasContent) {
      return `
        <div class="example-block missing-example-block">
          <div class="example-title">&lt;보기&gt;</div>
          <p>이 오디오에는 &lt;보기&gt;가 포함되어 있습니다. 현재 문제은행에서 연결된 보기 본문을 찾지 못했습니다.</p>
          <p class="example-meta">example_id: ${escapeHtml(item.example_id || "-")} / ${escapeHtml(item.source_round)}회 원문항 ${item.original_question_number}번</p>
        </div>
      `;
    }

    return `
      <div class="example-block">
        <div class="example-title">&lt;보기&gt;</div>
        ${example.instruction ? `<div class="example-instruction">${escapeHtml(example.instruction)}</div>` : ""}
        ${renderExampleDialogue(example.dialogue)}
        ${example.text ? `<div class="example-text">${escapeHtml(example.text)}</div>` : ""}
        ${example.question ? `<div class="example-question">${escapeHtml(example.question)}</div>` : ""}
        ${renderExampleOptions(example, answer)}
      </div>
    `;
  }

  function shouldRenderExample(item) {
    return Boolean(
      item.show_example ||
      item.example_audio_included ||
      item.example ||
      item.example_text ||
      item.example_question ||
      (Array.isArray(item.example_options) && item.example_options.length)
    );
  }

  function resolveExample(item) {
    const direct = item.example && typeof item.example === "object"
      ? normalizeExample(item.example)
      : {};

    const exampleId = item.example_id || direct.example_id || "";
    const roundId = item.source_round && exampleId ? `${item.source_round}:${exampleId}` : "";

    const fromMap =
      (roundId && state.exampleMap.has(roundId) ? state.exampleMap.get(roundId) : null) ||
      (exampleId && state.exampleMap.has(String(exampleId)) ? state.exampleMap.get(String(exampleId)) : null) ||
      {};

    return normalizeExample({
      ...fromMap,
      ...direct,
      source_round: item.source_round || direct.source_round || fromMap.source_round || "",
      example_id: exampleId || direct.example_id || fromMap.example_id || "",
      instruction: item.example_instruction || direct.instruction || fromMap.instruction || "",
      question: item.example_question || direct.question || fromMap.question || "",
      text: item.example_text || direct.text || fromMap.text || "",
      dialogue: item.example_dialogue && item.example_dialogue.length ? item.example_dialogue : (direct.dialogue || fromMap.dialogue || []),
      options: item.example_options && item.example_options.length ? item.example_options : (direct.options || fromMap.options || []),
      image_choices: direct.image_choices || fromMap.image_choices || [],
      correct_answer: item.example_correct_answer ?? direct.correct_answer ?? fromMap.correct_answer ?? null
    });
  }

  function hasExampleContent(example) {
    return Boolean(
      example.text ||
      example.question ||
      (Array.isArray(example.dialogue) && example.dialogue.length) ||
      (Array.isArray(example.options) && example.options.length) ||
      (Array.isArray(example.image_choices) && example.image_choices.length)
    );
  }

  function getExampleCorrectAnswer(example, item) {
    const answer = example.correct_answer ?? item.example_correct_answer ?? null;
    return answer === null || answer === undefined || answer === "" ? null : answer;
  }

  function renderExampleDialogue(dialogue) {
    if (!Array.isArray(dialogue) || !dialogue.length) return "";

    return `
      <div class="example-dialogue">
        ${dialogue.map((line) => {
          if (typeof line === "string") return `<div>${escapeHtml(line)}</div>`;
          const speaker = line.speaker || line.role || "";
          const text = line.text || line.utterance || line.content || "";
          return `<div>${speaker ? `<strong>${escapeHtml(speaker)}:</strong> ` : ""}${escapeHtml(text)}</div>`;
        }).join("")}
      </div>
    `;
  }

  function renderExampleOptions(example, answer) {
    const options = example.options && example.options.length ? example.options : example.image_choices;
    if (!options || !options.length) return "";

    const hasImages = options.some((opt) => opt.image_url);
    if (hasImages) {
      return `
        <div class="image-options example-image-options">
          ${options.map((opt) => {
            const isCorrect = isExampleCorrectChoice(opt, answer);
            return `
              <div class="image-option ${isCorrect ? "example-correct-option" : ""}">
                <span class="choice-no ${isCorrect ? "example-correct-choice-no" : ""}">${opt.choice}</span>
                ${opt.image_url ? `<img src="${escapeAttr(opt.image_url)}" alt="보기 ${opt.choice}번 그림" />` : `<div class="image-missing">이미지 없음</div>`}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    return `
      <ol class="options example-options">
        ${options.map((opt) => {
          const isCorrect = isExampleCorrectChoice(opt, answer);
          return `
            <li class="option ${isCorrect ? "example-correct-option" : ""}">
              <span class="choice-no ${isCorrect ? "example-correct-choice-no" : ""}">${opt.choice}</span>
              <span>${escapeHtml(opt.text || "")}</span>
            </li>
          `;
        }).join("")}
      </ol>
    `;
  }

  function isExampleCorrectChoice(option, answer) {
    if (answer === null || answer === undefined || answer === "") return false;
    return String(option.choice) === String(answer) || String(option.value) === String(answer);
  }

  function questionCardClass(item) {
    const category = String(item.category || item.type || "");
    const classes = [];

    if (category.includes("그림") || category.includes("picture")) {
      classes.push("picture-question-card");
    }

    if (category.includes("긴 대화") || category.includes("long_listening")) {
      classes.push("long-listening-card");
    }

    return classes.join(" ");
  }

  function buildOptions(item) {
    const options = item.options || [];
    if (!options.length) return `<p class="help-text">선택지 정보가 없습니다.</p>`;

    const hasImages = options.some((opt) => opt.image_url);
    if (hasImages) {
      return `
        <div class="image-options">
          ${options.map((opt) => `
            <div class="image-option">
              <span class="choice-no">${opt.choice}</span>
              ${opt.image_url ? `<img src="${escapeAttr(opt.image_url)}" alt="${opt.choice}번 그림" />` : `<div class="image-missing">이미지 없음</div>`}
            </div>
          `).join("")}
        </div>
      `;
    }

    return `
      <ol class="options">
        ${options.map((opt) => `
          <li class="option"><span class="choice-no">${opt.choice}</span><span>${escapeHtml(opt.text || "")}</span></li>
        `).join("")}
      </ol>
    `;
  }

  function buildAnswerKey(items, audioRows) {
    return `
      <section class="answer-key-section">
        <h2>교사용 정답표</h2>
        <table class="answer-key-table">
          <thead>
            <tr>
              <th>출력 번호</th>
              <th>원본 출처</th>
              <th>유형</th>
              <th>정답</th>
              <th>배점</th>
              <th>오디오</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td>${item.output_question_number}</td>
                <td>${escapeHtml(item.source_round)}회 ${item.original_question_number}번</td>
                <td>${escapeHtml(item.category || "")}</td>
                <td>${Number.isFinite(item.correct_answer) ? item.correct_answer : ""}</td>
                <td>${item.points || ""}</td>
                <td>${escapeHtml(getAudioLabel(item, audioRows))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `;
  }

  function buildAudioMap(items, audioRows) {
    return `
      <section class="audio-map-section">
        <h2>오디오 매핑표</h2>
        <table class="audio-map-table">
          <thead>
            <tr>
              <th>오디오 번호</th>
              <th>파일 경로</th>
              <th>관련 문항</th>
              <th>원본 파일명</th>
            </tr>
          </thead>
          <tbody>
            ${audioRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.track_label)}</td>
                <td>${escapeHtml(row.audio_url)}</td>
                <td>${escapeHtml(row.source_questions.join(", "))}</td>
                <td>${escapeHtml(row.source_audio_file || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderAudioDownloads(audioRows) {
    $("audio-download-panel").hidden = false;

    if (!audioRows.length) {
      $("audio-list").innerHTML = `<p class="help-text">선택된 오디오 파일이 없습니다.</p>`;
      return;
    }

    $("audio-list").innerHTML = audioRows.map((row) => {
      const fileName = suggestedAudioFileName(row);
      return `
        <div class="audio-item">
          <strong>${escapeHtml(row.track_label)}</strong>
          <div>
            <div>${escapeHtml(row.source_questions.join(", "))}</div>
            <small>${escapeHtml(row.audio_url)}</small>
          </div>
          <a href="${escapeAttr(row.audio_url)}" download="${escapeAttr(fileName)}">mp3 다운로드</a>
        </div>
      `;
    }).join("");
  }

  function suggestedAudioFileName(row) {
    const urlFile = row.audio_url.split("/").pop() || `audio_${row.track_label}.mp3`;
    return `${row.track_label}__${urlFile}`;
  }

  function printMode(mode) {
    renderPreview(mode);
    setTimeout(() => window.print(), 150);
  }

  function downloadAudioMapCsv() {
    ensurePreviewBuilt();
    if (!state.selectedItems.length) return;

    const csvText = buildAudioMapCsvText();
    downloadBlob(
      new Blob(["\ufeff" + csvText], { type: "text/csv;charset=utf-8" }),
      `TOPIK1_listening_audio_map_${formatFileDate(new Date())}.csv`
    );
  }

  async function downloadAudioZip() {
    try {
      ensurePreviewBuilt();
      if (!state.selectedItems.length || !state.audioRows.length) {
        throw new Error("ZIP으로 묶을 오디오가 없습니다. 먼저 문제지 미리보기를 생성하세요.");
      }

      setStatus(`선택 오디오 ZIP을 준비하는 중입니다.\n오디오 파일: ${state.audioRows.length}개`);

      const files = [];
      const usedNames = new Set();

      for (const row of state.audioRows) {
        const response = await fetch(row.audio_url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`${row.track_label} 오디오를 불러오지 못했습니다. HTTP ${response.status}\n${row.audio_url}`);
        }

        const buffer = await response.arrayBuffer();
        const safeName = uniqueFileName(
          `audio/${sanitizeFileName(suggestedAudioFileName(row))}`,
          usedNames
        );

        files.push({
          name: safeName,
          data: new Uint8Array(buffer)
        });
      }

      const csvText = buildAudioMapCsvText();
      const txtText = buildAudioMapText();

      files.push({
        name: "audio-map.csv",
        data: encodeUtf8("\ufeff" + csvText)
      });

      files.push({
        name: "audio-map.txt",
        data: encodeUtf8(txtText)
      });

      const zipBlob = createZipBlob(files);
      const title = sanitizeFileName(($("sheet-title").value || "TOPIK1_listening_audio").trim());
      const fileName = `${title}_audio_pack_${formatFileDate(new Date())}.zip`;
      downloadBlob(zipBlob, fileName);

      setStatus(`선택 오디오 ZIP 생성 완료\n오디오 파일: ${state.audioRows.length}개\n매핑표: audio-map.csv, audio-map.txt 포함`);
    } catch (error) {
      console.error(error);
      setStatus("선택 오디오 ZIP 생성 실패\n" + error.message);
      alert(error.message);
    }
  }

  function ensurePreviewBuilt() {
    if (!state.selectedItems.length || !state.audioRows.length) {
      renderPreview("student");
    }
  }

  function buildAudioMapCsvText() {
    const lines = [
      ["output_question_number", "source_round", "original_question_number", "category", "correct_answer", "points", "audio_track", "audio_url", "zip_file_name"].join(",")
    ];

    state.selectedItems.forEach((item) => {
      const audioLabel = getAudioLabel(item, state.audioRows);
      const audio = state.audioRows.find((row) => row.track_label === audioLabel);
      lines.push([
        item.output_question_number,
        item.source_round,
        item.original_question_number,
        csv(item.category || ""),
        item.correct_answer,
        item.points || "",
        audioLabel,
        csv(audio ? audio.audio_url : ""),
        csv(audio ? `audio/${sanitizeFileName(suggestedAudioFileName(audio))}` : "")
      ].join(","));
    });

    return lines.join("\n");
  }

  function buildAudioMapText() {
    const lines = [];
    lines.push("TOPIK I 듣기 선택 오디오 패키지");
    lines.push(`생성: ${formatDate(new Date())}`);
    lines.push(`문항 수: ${state.selectedItems.length}`);
    lines.push(`오디오 수: ${state.audioRows.length}`);
    lines.push("");
    lines.push("[오디오 파일]");
    state.audioRows.forEach((row) => {
      lines.push(`${row.track_label} | ${row.source_questions.join(", ")} | ${row.audio_url} | ZIP: audio/${sanitizeFileName(suggestedAudioFileName(row))}`);
    });
    lines.push("");
    lines.push("[문항 매핑]");
    state.selectedItems.forEach((item) => {
      const audioLabel = getAudioLabel(item, state.audioRows);
      lines.push(`${item.output_question_number}번 | ${item.source_round}회 원문항 ${item.original_question_number}번 | ${item.category || ""} | 정답 ${item.correct_answer} | ${audioLabel}`);
    });
    return lines.join("\r\n");
  }

  function createZipBlob(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = encodeUtf8(file.name);
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = crc32(data);
      const mod = dosDateTime(new Date());

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const local = new DataView(localHeader.buffer);
      local.setUint32(0, 0x04034b50, TrueLittle);
      local.setUint16(4, 20, TrueLittle);
      local.setUint16(6, 0, TrueLittle);
      local.setUint16(8, 0, TrueLittle);
      local.setUint16(10, mod.time, TrueLittle);
      local.setUint16(12, mod.date, TrueLittle);
      local.setUint32(14, crc, TrueLittle);
      local.setUint32(18, data.length, TrueLittle);
      local.setUint32(22, data.length, TrueLittle);
      local.setUint16(26, nameBytes.length, TrueLittle);
      local.setUint16(28, 0, TrueLittle);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const central = new DataView(centralHeader.buffer);
      central.setUint32(0, 0x02014b50, TrueLittle);
      central.setUint16(4, 20, TrueLittle);
      central.setUint16(6, 20, TrueLittle);
      central.setUint16(8, 0, TrueLittle);
      central.setUint16(10, 0, TrueLittle);
      central.setUint16(12, mod.time, TrueLittle);
      central.setUint16(14, mod.date, TrueLittle);
      central.setUint32(16, crc, TrueLittle);
      central.setUint32(20, data.length, TrueLittle);
      central.setUint32(24, data.length, TrueLittle);
      central.setUint16(28, nameBytes.length, TrueLittle);
      central.setUint16(30, 0, TrueLittle);
      central.setUint16(32, 0, TrueLittle);
      central.setUint16(34, 0, TrueLittle);
      central.setUint16(36, 0, TrueLittle);
      central.setUint32(38, 0, TrueLittle);
      central.setUint32(42, offset, TrueLittle);
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + data.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, TrueLittle);
    endView.setUint16(4, 0, TrueLittle);
    endView.setUint16(6, 0, TrueLittle);
    endView.setUint16(8, files.length, TrueLittle);
    endView.setUint16(10, files.length, TrueLittle);
    endView.setUint32(12, centralSize, TrueLittle);
    endView.setUint32(16, centralOffset, TrueLittle);
    endView.setUint16(20, 0, TrueLittle);

    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  const TrueLittle = true;

  function encodeUtf8(text) {
    return new TextEncoder().encode(String(text));
  }

  function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    return {
      date: ((year - 1980) << 9) | (month << 5) | day,
      time: (hours << 11) | (minutes << 5) | seconds
    };
  }

  let crcTable = null;

  function crc32(data) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[i] = c >>> 0;
      }
    }

    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function sanitizeFileName(value) {
    return String(value || "file")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 140);
  }

  function uniqueFileName(name, usedNames) {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    const dot = name.lastIndexOf(".");
    const base = dot >= 0 ? name.slice(0, dot) : name;
    const ext = dot >= 0 ? name.slice(dot) : "";

    let index = 2;
    let candidate = `${base}_${index}${ext}`;
    while (usedNames.has(candidate)) {
      index += 1;
      candidate = `${base}_${index}${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function buildExampleStatus(items) {
    const needExample = items.filter((item) => shouldRenderExample(item));
    const missing = needExample.filter((item) => !hasExampleContent(resolveExample(item)));
    if (!needExample.length) return "";
    if (!missing.length) return `\n보기 문항: ${needExample.length}개 표시`;
    return `\n보기 문항: ${needExample.length}개 중 ${missing.length}개 본문 미등록`;
  }

  function buildBankStatus() {
    const rounds = [...new Set(state.allItems.map((item) => item.source_round).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    const audioCount = new Set(state.allItems.map((item) => item.audio_url).filter(Boolean)).size;
    return `문제은행 로드 완료\n총 문항: ${state.allItems.length}문항\n회차: ${rounds.map((r) => `${r}회`).join(", ")}\n오디오 파일: ${audioCount}개`;
  }

  function setStatus(message) {
    $("status-message").textContent = message;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }

  function csv(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function formatDate(date) {
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
  }

  function formatFileDate(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
