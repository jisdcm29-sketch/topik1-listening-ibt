// TOPIK I result logger client - Step27C
// Isolated client-side bridge for Google Sheet logging.
// This file does not change scoring, rendering, audio, transcript, or diagnosis behavior.
(() => {
  "use strict";

  const VERSION = "step27c-20260918";
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwhl9RJdfqwSPjoQp2_ysrIzT3V5XojfPoXHdvLCdgdL1FymhW6u-BgyHMZIg3SbrRg/exec";
  const DEVELOPER_PHONE = "12345678";
  const QUEUE_KEY = "topik1-listening-result-logger-pending-v1";
  const FLUSH_DELAY_MS = 200;
  const RETRY_INTERVAL_MS = 30000;

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

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

  function loadQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("[ResultLogger] queue read failed:", error);
      return [];
    }
  }

  function saveQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
      return true;
    } catch (error) {
      console.warn("[ResultLogger] queue save failed:", error);
      return false;
    }
  }

  function removeFromQueue(attemptId) {
    const queue = loadQueue().filter((entry) => entry?.attempt_id !== attemptId);
    saveQueue(queue);
  }

  function enqueue(result) {
    const phone = normalizePhone(result?.student_phone);

    if (!phone) {
      console.warn("[ResultLogger] skipped: missing student phone.");
      return { queued: false, reason: "missing_phone" };
    }

    if (phone === DEVELOPER_PHONE) {
      console.info("[ResultLogger] skipped developer phone.");
      return { queued: false, skipped: true, reason: "developer_phone" };
    }

    const attemptId = buildAttemptId(result);
    const queue = loadQueue();

    if (!queue.some((entry) => entry?.attempt_id === attemptId)) {
      queue.push({
        action: "log_result",
        attempt_id: attemptId,
        client_version: VERSION,
        queued_at: new Date().toISOString(),
        result
      });
      saveQueue(queue);
    }

    window.setTimeout(flushQueue, FLUSH_DELAY_MS);
    return { queued: true, attempt_id: attemptId };
  }

  async function sendEntry(entry) {
    const body = new URLSearchParams();
    body.set("payload", JSON.stringify(entry));

    // no-cors is intentional:
    // Google Apps Script accepts the POST while the browser does not need
    // access to the cross-origin response. Server-side duplicate protection
    // makes retries safe.
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      keepalive: true,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: body.toString()
    });
  }

  let flushing = false;

  async function flushQueue() {
    if (flushing) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    flushing = true;

    try {
      const queue = loadQueue();

      for (const entry of queue) {
        try {
          await sendEntry(entry);
          removeFromQueue(entry.attempt_id);
          console.info("[ResultLogger] sent:", entry.attempt_id);
        } catch (error) {
          console.warn("[ResultLogger] send deferred:", entry?.attempt_id, error);
          break;
        }
      }
    } finally {
      flushing = false;
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

      try {
        enqueue(result);
      } catch (error) {
        // Logging must never interrupt the existing exam flow.
        console.warn("[ResultLogger] isolated logging failure:", error);
      }

      return output;
    };

    Object.defineProperty(ResultBuilder, "__sheetLoggerHookInstalled", {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });

    console.info("[ResultLogger] hook installed:", VERSION);
    return true;
  }

  function init() {
    installResultBuilderHook();
    window.addEventListener("online", flushQueue);
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
