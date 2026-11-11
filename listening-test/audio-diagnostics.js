/* TOPIK I audio diagnostics — isolated, observation-only module.
 * No scoring, navigation, audio currentTime/play/pause/src or student data changes.
 * Report transport is disabled until a dedicated verified receiver is configured.
 */
(() => {
  "use strict";
  const KEY = "topik1-listening-audio-diagnostics-v1";
  const MAX = 60;
  const STALL_MS = 8000;
  const PENDING_MS = 6000;
  const audio = document.getElementById("exam-audio");
  if (!audio) return;
  const session = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID() : "s-" + Date.now().toString(36);
  let source = "";
  let started = false;
  let lastPosition = 0;
  let lastProgressAt = Date.now();
  let pendingSince = 0;
  let lastReportedKey = "";
  let lastReportedAt = 0;
  let badge = null;
  const telemetryEndpoint = String(window.TOPIK_AUDIO_DIAGNOSTICS_ENDPOINT || "");
  const save = (rows) => {
    try { localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX))); }
    catch (error) { console.warn("[TOPIKAudioDiagnostics] local save failed", error); }
  };
  const rows = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(-MAX) : [];
    } catch { return []; }
  };
  const basename = () => {
    try { return new URL(audio.currentSrc || audio.src, location.href).pathname.split("/").slice(-2).join("/"); }
    catch { return ""; }
  };
  function browserFamily() {
    const u = navigator.userAgent || "";
    if (/Edg\//.test(u)) return "Edge";
    if (/Chrome\//.test(u)) return "Chrome";
    if (/Firefox\//.test(u)) return "Firefox";
    if (/Safari\//.test(u)) return "Safari";
    return "Other";
  }
  const visibleQuestion = () => (document.getElementById("current-question-label")?.textContent || "").trim().slice(0, 32);
  const examLabel = () => (document.getElementById("test-header-title")?.textContent || "").trim().slice(0, 80);
  const isInExam = () => {
    const screen = document.getElementById("test-screen");
    return !!screen && !screen.hidden;
  };
  function getStatus(type) {
    return {
      schema: "audio-issue-v1", event_id: session + "-" + Date.now().toString(36),
      timestamp: new Date().toISOString(), type, session,
      exam: examLabel(), question: visibleQuestion(),
      audio_file: basename(), position_seconds: Math.round((audio.currentTime || 0) * 10) / 10,
      duration_seconds: Number.isFinite(audio.duration) ? Math.round(audio.duration * 10) / 10 : null,
      ready_state: audio.readyState, network_state: audio.networkState,
      paused: audio.paused, ended: audio.ended, document_hidden: document.hidden,
      browser: browserFamily(), online: navigator.onLine,
      media_error: audio.error ? { code: audio.error.code } : null
    };
  }
  function exportLog() {
    const blob = new Blob([JSON.stringify({ schema: "audio-issues-v1", records: rows() }, null, 2)],
      { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "TOPIK1_audio_errors_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function showButton() {
    if (badge || !document.body) return;
    badge = document.createElement("button");
    badge.type = "button";
    badge.textContent = "음성 오류 기록 저장";
    badge.setAttribute("aria-label", "교사용 오디오 오류 기록 다운로드");
    badge.style.cssText = "position:fixed;right:10px;bottom:90px;z-index:9998;background:#fff3cd;color:#614500;border:1px solid #ca9c29;border-radius:7px;padding:7px 10px;font-size:12px;cursor:pointer;";
    badge.addEventListener("click", exportLog);
    document.body.appendChild(badge);
  }
  function report(type) {
    if (!isInExam()) return;
    const signature = [type, basename(), visibleQuestion(), Math.floor(audio.currentTime / 10)].join("|");
    const now = Date.now();
    if (signature === lastReportedKey && now - lastReportedAt < 60000) return;
    lastReportedKey = signature; lastReportedAt = now;
    const entry = getStatus(type);
    save([...rows(), entry]);
    console.warn("[TOPIKAudioDiagnostics] saved issue", entry);
    showButton();
    // Dedicated receiver only. Never transmit to the existing result-scoring endpoint.
    // No student name, phone number, responses, or authentication tokens are collected.
    if (/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(telemetryEndpoint)) {
      try {
        const data = new URLSearchParams();
        data.set("payload", JSON.stringify({ action: "log_audio_issue", issue: entry }));
        fetch(telemetryEndpoint, {
          method: "POST", mode: "no-cors", keepalive: true,
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: data.toString()
        }).catch((error) => console.warn("[TOPIKAudioDiagnostics] report send failed", error));
      } catch (error) { console.warn("[TOPIKAudioDiagnostics] report disabled", error); }
    }
  }
  function reset() {
    source = audio.currentSrc || audio.src || "";
    started = false; pendingSince = 0;
    lastPosition = 0; lastProgressAt = Date.now();
    lastReportedKey = "";
  }
  audio.addEventListener("loadstart", reset);
  audio.addEventListener("playing", () => {
    started = true; pendingSince = 0;
    lastPosition = audio.currentTime || 0;
    lastProgressAt = Date.now();
  });
  audio.addEventListener("timeupdate", () => {
    const t = audio.currentTime || 0;
    if (Math.abs(t - lastPosition) > 0.12) {
      lastPosition = t;
      lastProgressAt = Date.now();
      pendingSince = 0;
    }
  });
  audio.addEventListener("waiting", () => { if (started && !audio.paused) pendingSince ||= Date.now(); });
  audio.addEventListener("stalled", () => { if (started && !audio.paused) pendingSince ||= Date.now(); });
  audio.addEventListener("error", () => report("media_error"));
  audio.addEventListener("ended", () => { started = false; pendingSince = 0; });
  audio.addEventListener("pause", () => { pendingSince = 0; });
  document.addEventListener("visibilitychange", () => {
    lastProgressAt = Date.now(); pendingSince = 0;
  });
  setInterval(() => {
    if (!isInExam() || document.hidden || !started || audio.paused || audio.ended) return;
    const now = Date.now();
    if (pendingSince && now - pendingSince >= PENDING_MS) {
      report("buffering_timeout"); pendingSince = 0;
    } else if (now - lastProgressAt >= STALL_MS && audio.duration - audio.currentTime > 1.5) {
      report("playback_not_progressing");
      lastProgressAt = now;
    }
  }, 2000);
  window.TOPIKAudioDiagnostics = Object.freeze({
    download: exportLog, recent: () => rows(), pendingCount: () => rows().length,
    transportEnabled: /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(telemetryEndpoint),
    version: "20261111-diagnostic-staging"
  });
})();