// TOPIK I listening result logger - receipt-confirmed delivery (2026-11-12).
// Isolated bridge: scoring, audio, diagnostics and question selection stay unchanged.
(() => {
  "use strict";

  const VERSION = "step27c-receipt-v2-20261112";
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwhl9RJdfqwSPjoQp2_ysrIzT3V5XojfPoXHdvLCdgdL1FymhW6u-BgyHMZIg3SbrRg/exec";
  const DEVELOPER_PHONE = "12345678";
  const QUEUE_KEY = "topik1-listening-result-logger-pending-v1"; // Preserve old pending records.
  const CONFIRMED_KEY = "topik1-listening-result-logger-confirmed-v2";
  const RETRY_INTERVAL_MS = 30000;
  const MIN_RESEND_INTERVAL_MS = 60000;
  const RECEIPT_TIMEOUT_MS = 8000;
  const MAX_PER_FLUSH = 3;
  let flushing = false;
  let receiptCallCounter = 0;

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  // Keep the original attempt ID algorithm: old retries must remain deduplicated.
  function buildAttemptId(result) {
    const phone = normalizePhone(result?.student_phone);
    const submittedAt = safeText(result?.submitted_at) || new Date().toISOString();
    const mode = safeText(result?.generated_exam_mode || result?.exam_type || "unknown");
    const round = safeText(result?.generated_exam_round || "na");
    const raw = [phone, submittedAt, mode, round].join("|");
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `WEB-${phone || "NO_PHONE"}-${Math.abs(hash >>> 0).toString(36)}`;
  }

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("[ResultLogger] local storage read failed:", key, error);
      return [];
    }
  }

  function writeArray(key, entries) {
    try {
      localStorage.setItem(key, JSON.stringify(entries));
      return true;
    } catch (error) {
      console.warn("[ResultLogger] local storage write failed:", key, error);
      return false;
    }
  }

  function loadQueue() {
    return readArray(QUEUE_KEY);
  }

  function saveQueue(entries) {
    return writeArray(QUEUE_KEY, entries);
  }

  function isConfirmed(attemptId) {
    return readArray(CONFIRMED_KEY).includes(attemptId);
  }

  function saveConfirmed(attemptId) {
    const ids = readArray(CONFIRMED_KEY).filter((id) => id !== attemptId);
    ids.push(attemptId);
    return writeArray(CONFIRMED_KEY, ids.slice(-150));
  }

  function createReceiptToken() {
    // Never use Math.random for a publicly queryable receipt token.
    if (!window.crypto?.getRandomValues) return "";
    const bytes = new Uint8Array(20);
    window.crypto.getRandomValues(bytes);
    return "R-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function setStatus(message, isSuccess = false) {
    const card = document.querySelector("#result-screen .summary-card");
    if (!card) return;
    let node = document.getElementById("result-sync-status");
    if (!node) {
      node = document.createElement("p");
      node.id = "result-sync-status";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      node.style.padding = "12px 16px";
      node.style.borderRadius = "8px";
      node.style.margin = "10px 0";
      const anchor = card.querySelector(".summary-info-box");
      if (anchor) anchor.insertAdjacentElement("afterend", node);
      else card.appendChild(node);
    }
    node.style.color = isSuccess ? "#12582d" : "#795300";
    node.style.background = isSuccess ? "#ecfdf3" : "#fff8e6";
    node.textContent = message;
  }

  function enqueue(result) {
    const phone = normalizePhone(result?.student_phone);
    if (!phone || !result?.submitted_at || !Array.isArray(result?.items)) {
      console.warn("[ResultLogger] result cannot be queued: missing complete result metadata.");
      return { queued: false, reason: "incomplete_result" };
    }
    if (phone === DEVELOPER_PHONE) {
      return { queued: false, skipped: true, reason: "developer_phone" };
    }

    const attemptId = buildAttemptId(result);
    if (isConfirmed(attemptId)) {
      setStatus("Google Sheets 기록 확인 완료", true);
      return { queued: false, confirmed: true, attempt_id: attemptId };
    }

    const queue = loadQueue();
    let entry = queue.find((item) => item?.attempt_id === attemptId);
    if (!entry) {
      const token = createReceiptToken();
      if (!token) {
        setStatus("결과는 기기에 보관되었습니다. 저장 확인 기능을 지원하지 않는 브라우저입니다.");
        return { queued: false, reason: "secure_random_unavailable" };
      }
      entry = {
        action: "log_result",
        attempt_id: attemptId,
        receipt_token: token,
        client_version: VERSION,
        queued_at: new Date().toISOString(),
        last_post_at: 0,
        result
      };
      queue.push(entry);
      if (!saveQueue(queue)) {
        setStatus("결과는 기기에 보관되어 있지만 전송 대기 기록을 저장하지 못했습니다.");
        return { queued: false, reason: "queue_write_failed" };
      }
    } else if (!/^R-[0-9a-f]{40}$/.test(safeText(entry.receipt_token))) {
      // Migrate pending items from the original logger without losing their result.
      entry.receipt_token = createReceiptToken();
      entry.client_version = VERSION;
      entry.last_post_at = 0;
      if (!entry.receipt_token || !saveQueue(queue)) {
        return { queued: false, reason: "queue_migration_failed" };
      }
    }

    setStatus("시험 결과는 기기에 보관되었습니다. Google Sheets 저장을 확인 중입니다.");
    window.setTimeout(flushQueue, 250);
    return { queued: true, attempt_id: attemptId };
  }

  function removeFromQueue(attemptId) {
    const next = loadQueue().filter((entry) => entry?.attempt_id !== attemptId);
    return saveQueue(next);
  }

  function updateEntry(attemptId, changes) {
    const queue = loadQueue();
    const entry = queue.find((item) => item?.attempt_id === attemptId);
    if (!entry) return false;
    Object.assign(entry, changes);
    return saveQueue(queue);
  }

  function confirmEntry(entry) {
    if (!saveConfirmed(entry.attempt_id)) return false;
    removeFromQueue(entry.attempt_id);
    console.info("[ResultLogger] server receipt confirmed:", entry.attempt_id);
    setStatus("Google Sheets 기록 확인 완료", true);
    return true;
  }

  function checkReceipt(entry) {
    const token = safeText(entry.receipt_token);
    if (!/^R-[0-9a-f]{40}$/.test(token)) return Promise.resolve(false);

    return new Promise((resolve) => {
      const callback = "topik1ReceiptAck" + Date.now() + "_" + (++receiptCallCounter);
      const script = document.createElement("script");
      let finished = false;
      let timeoutId;

      function finish(stored) {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeoutId);
        delete window[callback];
        script.remove();
        resolve(stored);
      }

      window[callback] = (response) => {
        finish(response?.ok === true && response?.stored === true && response?.receipt_token === token);
      };
      script.onerror = () => finish(false);
      const params = new URLSearchParams({
        action: "receipt_status",
        receipt_token: token,
        callback,
        _: String(Date.now())
      });
      script.src = ENDPOINT + "?" + params.toString();
      timeoutId = window.setTimeout(() => finish(false), RECEIPT_TIMEOUT_MS);
      document.head.appendChild(script);
    });
  }

  async function sendEntry(entry) {
    const body = new URLSearchParams();
    body.set("payload", JSON.stringify(entry));
    // The opaque no-cors POST is NOT proof of a server-side write.
    // The matching receipt_status response is the only success signal.
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      keepalive: body.toString().length < 60000,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString()
    });
  }

  async function flushQueue() {
    if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    flushing = true;
    try {
      for (const entry of loadQueue().slice(0, MAX_PER_FLUSH)) {
        if (!entry?.attempt_id || !entry?.result) continue;

        // Older queued records are upgraded in place without losing their payload.
        if (!/^R-[0-9a-f]{40}$/.test(safeText(entry.receipt_token))) {
          const token = createReceiptToken();
          if (!token || !updateEntry(entry.attempt_id, { receipt_token: token, last_post_at: 0 })) continue;
          entry.receipt_token = token;
        }

        if (await checkReceipt(entry)) {
          confirmEntry(entry);
          continue;
        }

        if (Date.now() - Number(entry.last_post_at || 0) < MIN_RESEND_INTERVAL_MS) {
          setStatus("시트 저장 확인 중입니다. 미확인 결과는 재전송 대기 목록에 보존됩니다.");
          continue;
        }

        // Persist retry metadata BEFORE initiating the potentially interrupted request.
        if (!updateEntry(entry.attempt_id, { last_post_at: Date.now(), client_version: VERSION })) continue;
        try {
          await sendEntry(entry);
          // A POST can reach Apps Script after the opaque fetch promise resolves.
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          if (await checkReceipt(entry)) {
            confirmEntry(entry);
          } else {
            setStatus("시트 저장을 확인하지 못했습니다. 결과를 보존하고 자동 재시도합니다.");
          }
        } catch (error) {
          console.warn("[ResultLogger] send deferred; retained for retry:", error);
          setStatus("시트 전송에 실패했습니다. 결과를 보존하고 자동 재시도합니다.");
        }
      }
    } finally {
      flushing = false;
    }
  }

  function restoreLatestResults() {
    // Original client removed some opaque POSTs from its queue. Reuse the exact
    // stored result (including submitted_at and item answers), never synthesize it.
    const keys = ["topik1-listening-result-latest", "topik1-listening-wrong-review-latest"];
    for (const key of keys) {
      try {
        const result = JSON.parse(localStorage.getItem(key) || "null");
        if (result && typeof result === "object") enqueue(result);
      } catch (error) {
        console.warn("[ResultLogger] old result recovery read failed:", key, error);
      }
    }
  }

  function installResultBuilderHook() {
    if (typeof ResultBuilder === "undefined" || !ResultBuilder?.saveToLocalStorage) {
      console.warn("[ResultLogger] ResultBuilder is not ready.");
      return false;
    }
    if (ResultBuilder.__sheetLoggerHookInstalled) return true;
    const originalSave = ResultBuilder.saveToLocalStorage.bind(ResultBuilder);
    ResultBuilder.saveToLocalStorage = function(result, storageKey) {
      const output = originalSave(result, storageKey);
      try { enqueue(result); }
      catch (error) { console.warn("[ResultLogger] isolated logging failure:", error); }
      return output;
    };
    Object.defineProperty(ResultBuilder, "__sheetLoggerHookInstalled", {
      value: true, configurable: false, enumerable: false, writable: false
    });
    return true;
  }

  function init() {
    installResultBuilderHook();
    restoreLatestResults();
    window.addEventListener("online", flushQueue);
    window.addEventListener("pageshow", flushQueue);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) flushQueue();
    });
    window.setTimeout(flushQueue, 1000);
    window.setInterval(flushQueue, RETRY_INTERVAL_MS);
  }

  window.TOPIK1ResultLogger = {
    version: VERSION,
    endpoint: ENDPOINT,
    flush: flushQueue,
    pendingCount: () => loadQueue().length,
    developerPhone: DEVELOPER_PHONE
  };
  init();
})();
