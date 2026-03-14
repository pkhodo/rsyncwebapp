import { createUI, splitLines } from "./ui.js";

const elements = {
  jobsEl: document.getElementById("jobs"),
  summaryEl: document.getElementById("summary"),
  kpiGridEl: document.getElementById("kpiGrid"),
  systemChecksEl: document.getElementById("systemChecks"),
  setupSummaryEl: document.getElementById("setupSummary"),
  setupActionsEl: document.getElementById("setupActions"),
  wizardSummaryEl: document.getElementById("wizardSummary"),
  wizardStepsEl: document.getElementById("wizardSteps"),
  connectivityDetailsEl: document.getElementById("connectivityDetails"),
  refreshBtn: document.getElementById("refreshBtn"),
  restartServiceBtn: document.getElementById("restartServiceBtn"),
  stopServiceBtn: document.getElementById("stopServiceBtn"),
  refreshLogBtn: document.getElementById("refreshLogBtn"),
  selectedJobEl: document.getElementById("selectedJob"),
  logContentEl: document.getElementById("logContent"),
  previewJobEl: document.getElementById("previewJob"),
  previewContentEl: document.getElementById("previewContent"),
  clearPreviewBtn: document.getElementById("clearPreviewBtn"),
  serviceStatusEl: document.getElementById("serviceStatus"),
  autoSyncStatusEl: document.getElementById("autoSyncStatus"),
  connectivityStatusEl: document.getElementById("connectivityStatus"),
  updateStatusEl: document.getElementById("updateStatus"),
  toggleAutoSyncBtn: document.getElementById("toggleAutoSyncBtn"),
  checkUpdatesBtn: document.getElementById("checkUpdatesBtn"),
  copyDiagnosticsBtn: document.getElementById("copyDiagnosticsBtn"),
  themeSelect: document.getElementById("themeSelect"),
  toastContainer: document.getElementById("toastContainer"),
  compactModeBtn: document.getElementById("compactModeBtn"),
  toggleSectionsBtn: document.getElementById("toggleSectionsBtn"),
  refreshServiceLogBtn: document.getElementById("refreshServiceLogBtn"),
  serviceLogContentEl: document.getElementById("serviceLogContent"),
  historyJobEl: document.getElementById("historyJob"),
  historyContentEl: document.getElementById("historyContent"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  refreshSetupBtn: document.getElementById("refreshSetupBtn"),
  refreshWizardBtn: document.getElementById("refreshWizardBtn"),
  previewCommandBtn: document.getElementById("previewCommandBtn"),
  commandPreviewEl: document.getElementById("commandPreview"),
  editorModeButtons: document.querySelectorAll(".mode-btn[data-editor-mode]"),
  sectionToggleButtons: document.querySelectorAll(".collapse-btn[data-target-section]"),
  collapsiblePanels: document.querySelectorAll(".panel.collapsible[data-section]"),
  jobForm: document.getElementById("jobForm"),
  clearBtn: document.getElementById("clearBtn"),
};

const STORAGE_KEYS = {
  themeKey: "rsync_webapp_theme",
  compactKey: "rsync_webapp_compact_mode",
  collapsedKey: "rsync_webapp_collapsed_sections",
};
const EDITOR_MODE_KEY = "rsync_webapp_editor_mode";

const ui = createUI(elements, STORAGE_KEYS);

let currentLogJobId = null;
let currentHistoryJobId = null;
let jobsCache = [];
let lastConnectivity = null;
let lastOnboarding = null;
let servicePause = false;
let lastSelectedMode = document.getElementById("mode").value;
let autoUpdatePrompted = false;

function setEditorMode(mode, persist = true) {
  const allowed = ["basic", "advanced", "expert"];
  const next = allowed.includes(mode) ? mode : "basic";
  document.body.setAttribute("data-editor-mode", next);
  elements.editorModeButtons.forEach((btn) => {
    const active = btn.dataset.editorMode === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (persist) localStorage.setItem(EDITOR_MODE_KEY, next);
}

function bootEditorMode() {
  setEditorMode(localStorage.getItem(EDITOR_MODE_KEY) || "basic", false);
}

function updateMirrorConfirmControl(forceReconfirm = false) {
  const mode = document.getElementById("mode").value;
  const mirrorConfirmedEl = document.getElementById("mirrorConfirmed");
  const label = mirrorConfirmedEl.closest("label");
  if (!label) return;
  const requiresConfirm = mode === "mirror";
  label.style.display = requiresConfirm ? "flex" : "none";
  if (!requiresConfirm) {
    mirrorConfirmedEl.checked = true;
    return;
  }
  if (forceReconfirm || document.getElementById("jobId").value.trim() === "") {
    mirrorConfirmedEl.checked = false;
  }
}

function formToPayload() {
  return {
    id: document.getElementById("jobId").value.trim() || undefined,
    name: document.getElementById("name").value.trim(),
    server: document.getElementById("server").value.trim(),
    remote_path: document.getElementById("remotePath").value.trim(),
    local_path: document.getElementById("localPath").value.trim(),
    mode: document.getElementById("mode").value,
    mirror_confirmed: document.getElementById("mirrorConfirmed").checked,
    timeout_seconds: Number(document.getElementById("timeoutSeconds").value || 60),
    contimeout_seconds: Number(document.getElementById("contimeoutSeconds").value || 15),
    retry_initial_seconds: Number(document.getElementById("retryInitialSeconds").value || 10),
    retry_max_seconds: Number(document.getElementById("retryMaxSeconds").value || 300),
    bwlimit_kbps: Number(document.getElementById("bwlimitKbps").value || 0),
    nice_level: Number(document.getElementById("niceLevel").value || 0),
    allowed_start_hour: Number(document.getElementById("allowedStartHour").value || -1),
    allowed_end_hour: Number(document.getElementById("allowedEndHour").value || -1),
    dry_run: document.getElementById("dryRun").checked,
    auto_retry: document.getElementById("autoRetry").checked,
    excludes: splitLines(document.getElementById("excludes").value),
    extra_args: splitLines(document.getElementById("extraArgs").value),
  };
}

function setFormFromJob(job) {
  const cfg = job.config;
  document.getElementById("jobId").value = cfg.id || "";
  document.getElementById("name").value = cfg.name || "";
  document.getElementById("server").value = cfg.server || "";
  document.getElementById("remotePath").value = cfg.remote_path || "";
  document.getElementById("localPath").value = cfg.local_path || "";
  document.getElementById("mode").value = cfg.mode || "mirror";
  document.getElementById("mirrorConfirmed").checked = !!cfg.mirror_confirmed;
  document.getElementById("timeoutSeconds").value = cfg.timeout_seconds || 60;
  document.getElementById("contimeoutSeconds").value = cfg.contimeout_seconds || 15;
  document.getElementById("retryInitialSeconds").value = cfg.retry_initial_seconds || 10;
  document.getElementById("retryMaxSeconds").value = cfg.retry_max_seconds || 300;
  document.getElementById("bwlimitKbps").value = cfg.bwlimit_kbps || 0;
  document.getElementById("niceLevel").value = cfg.nice_level || 0;
  document.getElementById("allowedStartHour").value = cfg.allowed_start_hour ?? -1;
  document.getElementById("allowedEndHour").value = cfg.allowed_end_hour ?? -1;
  document.getElementById("dryRun").checked = !!cfg.dry_run;
  document.getElementById("autoRetry").checked = !!cfg.auto_retry;
  document.getElementById("excludes").value = (cfg.excludes || []).join("\n");
  document.getElementById("extraArgs").value = (cfg.extra_args || []).join("\n");
  lastSelectedMode = document.getElementById("mode").value;
  updateMirrorConfirmControl();
}

function clearForm() {
  elements.jobForm.reset();
  document.getElementById("jobId").value = "";
  document.getElementById("mode").value = "mirror";
  document.getElementById("mirrorConfirmed").checked = false;
  document.getElementById("timeoutSeconds").value = 60;
  document.getElementById("contimeoutSeconds").value = 15;
  document.getElementById("retryInitialSeconds").value = 10;
  document.getElementById("retryMaxSeconds").value = 300;
  document.getElementById("bwlimitKbps").value = 0;
  document.getElementById("niceLevel").value = 0;
  document.getElementById("allowedStartHour").value = -1;
  document.getElementById("allowedEndHour").value = -1;
  document.getElementById("autoRetry").checked = true;
  lastSelectedMode = "mirror";
  if (elements.commandPreviewEl) {
    elements.commandPreviewEl.textContent =
      "Expert mode shows the exact rsync command generated by current form values.";
  }
  updateMirrorConfirmControl();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = {};
  try {
    data = await response.json();
  } catch (_err) {
    data = { ok: false, error: `Invalid JSON response (${response.status})` };
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function refreshServiceStatus() {
  try {
    const data = await api("/api/service/status");
    ui.renderServiceStatus(data.service, null);
    servicePause = !!data.service.service_pause;
    elements.toggleAutoSyncBtn.textContent = servicePause ? "Resume Auto-Sync" : "Pause Auto-Sync";
  } catch (error) {
    ui.renderServiceStatus(null, error.message);
  }
}

async function refreshServiceLogs() {
  try {
    const data = await api("/api/service/logs?tail=120");
    ui.renderServiceLogs(data.service_logs, null);
  } catch (error) {
    ui.renderServiceLogs(null, error.message);
  }
}

async function refreshSystemChecks() {
  try {
    const data = await api("/api/system/checks");
    ui.renderSystemChecks(data.checks, null);
  } catch (error) {
    ui.renderSystemChecks(null, error.message);
  }
}

async function refreshSetup() {
  try {
    const data = await api("/api/setup/options");
    ui.renderSetup(data.setup, null);
  } catch (error) {
    ui.renderSetup(null, error.message);
  }
}

async function refreshOnboarding() {
  try {
    const data = await api("/api/onboarding/status");
    lastOnboarding = data.onboarding;
    ui.renderOnboarding(data.onboarding, null);
  } catch (error) {
    ui.renderOnboarding(null, error.message);
  }
}

function renderUpdateStatus(payload, error = null) {
  if (!elements.updateStatusEl) return;
  if (error) {
    elements.updateStatusEl.className = "status-pill warn";
    elements.updateStatusEl.textContent = "Update check unavailable";
    return;
  }
  if (!payload || !payload.ok) {
    elements.updateStatusEl.className = "status-pill warn";
    elements.updateStatusEl.textContent = "Update status unknown";
    return;
  }
  if (payload.update_available) {
    elements.updateStatusEl.className = "status-pill warn";
    if (payload.channel === "git" && payload.remote_commit) {
      elements.updateStatusEl.textContent = `Update available: ${payload.remote_commit}`;
    } else {
      elements.updateStatusEl.textContent = `Update available: v${payload.latest_version || "new release"}`;
    }
    return;
  }
  if (payload.channel === "git" && payload.local_commit) {
    elements.updateStatusEl.className = "status-pill ok";
    elements.updateStatusEl.textContent = `Up to date: ${payload.local_commit}`;
    return;
  }
  elements.updateStatusEl.className = "status-pill ok";
  elements.updateStatusEl.textContent = `Up to date: v${payload.current_version}`;
}

async function refreshUpdateStatus(force = false, showToast = false) {
  try {
    const data = await api(`/api/app/update-check${force ? "?force=1" : ""}`);
    const update = data.update || {};
    renderUpdateStatus(update, null);
    if (!showToast && update.ok && update.update_available && !autoUpdatePrompted) {
      ui.showToast("Update available. Update checks are read-only and never delete project files.", "warn", 5200);
      autoUpdatePrompted = true;
    }
    if (!showToast) return;
    if (update.ok && update.update_available && update.release_url) {
      ui.showToast(`Update available: v${update.latest_version}`, "warn", 3600);
      if (confirm(`Version ${update.latest_version} is available. Open download page?`)) {
        window.open(update.release_url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (update.ok && update.update_available && update.channel === "git") {
      const branch = update.branch || "main";
      ui.showToast(`Update available on origin/${branch}`, "warn", 3200);
      return;
    }
    if (update.ok) {
      if (update.channel === "git") {
        ui.showToast(`Up to date with origin/${update.branch || "main"}`, "ok", 2600);
      } else {
        ui.showToast(`You are up to date (v${update.current_version})`, "ok", 2600);
      }
      return;
    }
    ui.showToast(`Update check failed: ${update.error || "unknown error"}`, "warn", 4200);
  } catch (error) {
    renderUpdateStatus(null, error.message);
    if (showToast) {
      ui.showToast(`Update check failed: ${error.message}`, "warn", 4200);
    }
  }
}

async function copyDiagnostics() {
  const data = await api("/api/diagnostics");
  const text = JSON.stringify(data.diagnostics, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    ui.showToast("Diagnostics copied to clipboard", "ok", 2300);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "readonly");
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
  ui.showToast("Diagnostics copied (legacy clipboard mode)", "ok", 3000);
}

async function runSetupAction(actionId) {
  const data = await api(`/api/setup/${actionId}`, { method: "POST" });
  const result = data.result || {};
  if (!result.success) {
    ui.showToast(`Setup needs attention: ${result.action?.label || actionId}`, "warn", 6000);
    if (result.output) {
      ui.showToast(result.output.split("\n")[0], "warn", 4500);
    }
    await Promise.all([refreshSetup(), refreshSystemChecks(), refreshServiceStatus()]);
    return;
  }
  ui.showToast(`Setup complete: ${result.action?.label || actionId}`, "ok", 2400);
  if (result.output) {
    ui.showToast(result.output.split("\n")[0], "ok", 2200);
  }
  await Promise.all([refreshSetup(), refreshSystemChecks(), refreshServiceStatus()]);
}

async function refreshCommandPreview() {
  const payload = formToPayload();
  delete payload.id;
  const data = await api("/api/jobs/preview-command", { method: "POST", body: JSON.stringify(payload) });
  elements.commandPreviewEl.textContent = data.result.shell || data.result.command.join(" ");
}

async function refreshConnectivity(force = false) {
  try {
    const data = await api(`/api/connectivity${force ? "?force=1" : ""}`);
    lastConnectivity = data.connectivity;
    ui.renderConnectivity(data.connectivity, null);
    ui.renderSummary(jobsCache, lastConnectivity);
  } catch (error) {
    ui.renderConnectivity(null, error.message);
  }
}

async function refreshJobs() {
  const data = await api("/api/jobs");
  jobsCache = data.jobs;
  ui.renderSummary(data.jobs, lastConnectivity);
  ui.renderJobs(data.jobs);
  if (lastOnboarding) {
    ui.renderOnboarding(lastOnboarding, null);
  }
  if (currentLogJobId) await refreshLog();
}

async function refreshLog() {
  if (!currentLogJobId) return;
  const data = await api(`/api/jobs/${currentLogJobId}/log?tail=180`);
  elements.logContentEl.textContent = data.log || "(empty log)";
  elements.logContentEl.scrollTop = elements.logContentEl.scrollHeight;
}

async function refreshHistory() {
  if (!currentHistoryJobId) {
    ui.renderHistory(null, null, null);
    return;
  }
  try {
    const data = await api(`/api/jobs/${currentHistoryJobId}/history?limit=30`);
    ui.renderHistory(currentHistoryJobId, data.history, null);
  } catch (error) {
    ui.renderHistory(currentHistoryJobId, null, error.message);
  }
}

async function runAction(action, id) {
  if (action === "edit") {
    const job = jobsCache.find((item) => item.config.id === id);
    if (job) setFormFromJob(job);
    return;
  }
  if (action === "log") {
    currentLogJobId = id;
    currentHistoryJobId = id;
    elements.selectedJobEl.textContent = `Job: ${id}`;
    await Promise.all([refreshLog(), refreshHistory()]);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete job ${id}?`)) return;
    await api(`/api/jobs/${id}`, { method: "DELETE" });
    if (currentLogJobId === id) {
      currentLogJobId = null;
      currentHistoryJobId = null;
      elements.selectedJobEl.textContent = "No job selected";
      elements.logContentEl.textContent = 'Select a job and click "Log".';
      ui.renderHistory(null, null, null);
    }
    ui.showToast(`Deleted job ${id}`, "ok");
    await Promise.all([refreshJobs(), refreshOnboarding()]);
    return;
  }
  if (action === "test-connection") {
    const data = await api(`/api/jobs/${id}/test-connection`, { method: "POST" });
    const result = data.result;
    if (result.reachable) {
      ui.showToast(`Connection OK for ${id} (${result.latency_ms || "?"}ms)`, "ok");
    } else {
      ui.showToast(`Connection failed for ${id}: ${result.output || result.exit_code}`, "warn", 5000);
    }
    await refreshConnectivity(true);
    return;
  }
  if (action === "preview-deletes") {
    const data = await api(`/api/jobs/${id}/preview-deletes`, { method: "POST" });
    const result = data.result;
    elements.previewJobEl.textContent = `Job: ${id} · ${result.deletes_count} deletion(s) detected`;
    elements.previewContentEl.textContent =
      result.deletes_preview.length > 0
        ? result.deletes_preview.join("\n")
        : `No delete operations detected.\n\nTail:\n${result.tail || "(empty)"}`;
    ui.showToast(`Preview complete for ${id}`, result.exit_code === 0 ? "ok" : "warn");
    return;
  }
  await api(`/api/jobs/${id}/${action}`, { method: "POST" });
  ui.showToast(`${action} requested for ${id}`, "ok");
  await refreshJobs();
}

elements.jobsEl.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  try {
    await runAction(btn.dataset.action, btn.dataset.id);
  } catch (error) {
    ui.showToast(error.message, "err", 5500);
  }
});

elements.jobForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToPayload();
  try {
    if (payload.id) {
      const id = payload.id;
      delete payload.id;
      await api(`/api/jobs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      ui.showToast(`Updated job ${id}`, "ok");
    } else {
      const data = await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
      ui.showToast(`Created job ${data.job.config.id}`, "ok");
    }
    await Promise.all([refreshJobs(), refreshOnboarding()]);
    clearForm();
  } catch (error) {
    ui.showToast(error.message, "err", 6000);
  }
});

elements.clearBtn.addEventListener("click", clearForm);

elements.refreshBtn.addEventListener("click", async () => {
  try {
    await Promise.all([
      refreshJobs(),
      refreshServiceStatus(),
      refreshConnectivity(true),
      refreshServiceLogs(),
      refreshSystemChecks(),
      refreshSetup(),
      refreshOnboarding(),
      refreshHistory(),
    ]);
    ui.showToast("Refreshed", "ok", 1200);
  } catch (error) {
    ui.showToast(error.message, "err");
  }
});

elements.refreshLogBtn.addEventListener("click", () => refreshLog().catch((e) => ui.showToast(e.message, "err")));
elements.refreshHistoryBtn.addEventListener("click", () => refreshHistory().catch((e) => ui.showToast(e.message, "err")));
elements.refreshSetupBtn.addEventListener("click", () => refreshSetup().catch((e) => ui.showToast(e.message, "err")));
elements.refreshWizardBtn.addEventListener("click", () => refreshOnboarding().catch((e) => ui.showToast(e.message, "err")));

elements.clearPreviewBtn.addEventListener("click", () => {
  elements.previewJobEl.textContent = "No preview yet";
  elements.previewContentEl.textContent = 'Use "Preview Deletes" on a job to review what mirror mode would delete.';
});

elements.refreshServiceLogBtn.addEventListener("click", () =>
  refreshServiceLogs().catch((e) => ui.showToast(e.message, "err"))
);

elements.copyDiagnosticsBtn.addEventListener("click", () =>
  copyDiagnostics().catch((e) => ui.showToast(e.message, "err", 4500))
);

elements.checkUpdatesBtn.addEventListener("click", () =>
  refreshUpdateStatus(true, true).catch((e) => ui.showToast(e.message, "err", 4500))
);

elements.setupActionsEl.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-setup-action]");
  if (!btn) return;
  try {
    btn.disabled = true;
    await runSetupAction(btn.dataset.setupAction);
  } catch (error) {
    ui.showToast(error.message, "err", 6000);
  } finally {
    btn.disabled = false;
  }
});

elements.previewCommandBtn.addEventListener("click", async () => {
  try {
    await refreshCommandPreview();
    ui.showToast("Command preview built", "ok", 1400);
  } catch (error) {
    ui.showToast(error.message, "err", 4500);
  }
});

elements.editorModeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setEditorMode(btn.dataset.editorMode));
});

elements.toggleAutoSyncBtn.addEventListener("click", async () => {
  const path = servicePause ? "/api/service/resume-auto" : "/api/service/pause-auto";
  try {
    await api(path, { method: "POST" });
    servicePause = !servicePause;
    elements.toggleAutoSyncBtn.textContent = servicePause ? "Resume Auto-Sync" : "Pause Auto-Sync";
    ui.showToast(servicePause ? "Auto-sync paused" : "Auto-sync resumed", servicePause ? "warn" : "ok", 2200);
    await refreshServiceStatus();
    await refreshJobs();
  } catch (error) {
    ui.showToast(error.message, "err", 4500);
  }
});

elements.restartServiceBtn.addEventListener("click", async () => {
  if (!confirm("Restart the Rsync Web App service now?")) return;
  try {
    await api("/api/service/restart", { method: "POST" });
    ui.showToast("Restart requested. Refresh in a moment...", "warn", 4200);
  } catch (error) {
    ui.showToast(error.message, "err");
  }
});

elements.stopServiceBtn.addEventListener("click", async () => {
  if (!confirm("Stop the Rsync Web App service now?")) return;
  try {
    await api("/api/service/stop", { method: "POST" });
    ui.showToast("Stop requested. Reload page to verify status.", "warn", 4500);
  } catch (error) {
    ui.showToast(error.message, "err");
  }
});

elements.compactModeBtn.addEventListener("click", () => {
  ui.setCompactMode(!ui.isCompactMode(), true);
});

elements.toggleSectionsBtn.addEventListener("click", () => {
  const panels = Array.from(elements.collapsiblePanels);
  const collapsedCount = panels.filter((panel) => panel.classList.contains("is-collapsed")).length;
  const shouldCollapse = collapsedCount !== panels.length;
  ui.setAllSectionsCollapsed(shouldCollapse);
});

elements.themeSelect.addEventListener("change", () => ui.setTheme(elements.themeSelect.value));
document.getElementById("mode").addEventListener("change", (event) => {
  const nextMode = event.target.value;
  const forceReconfirm = nextMode === "mirror" && lastSelectedMode !== "mirror";
  updateMirrorConfirmControl(forceReconfirm);
  if (forceReconfirm) {
    ui.showToast("Mirror mode needs explicit delete confirmation.", "warn", 2600);
  }
  lastSelectedMode = nextMode;
});

elements.wizardStepsEl.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-wizard-action]");
  if (!btn) return;
  const action = btn.dataset.wizardAction;
  try {
    if (action === "install-deps") {
      await runSetupAction("install_dependencies");
      await refreshOnboarding();
      return;
    }
    if (action === "open-editor") {
      ui.setSectionCollapsed("form", false, true);
      document.getElementById("name").focus();
      return;
    }
    if (action === "test-ssh") {
      await refreshConnectivity(true);
      await refreshOnboarding();
      return;
    }
    if (action === "run-dry") {
      const first = jobsCache[0];
      if (!first) {
        ui.showToast("Create a job first", "warn", 2200);
        return;
      }
      await runAction("dry-run", first.config.id);
      await refreshOnboarding();
      return;
    }
  } catch (error) {
    ui.showToast(error.message, "err", 5500);
  }
});

ui.bindSectionToggleButtons();
ui.bootTheme();
ui.bootLayoutMode();
bootEditorMode();
updateMirrorConfirmControl();

setInterval(() => {
  refreshJobs().catch(() => {});
}, 3000);

setInterval(() => {
  refreshServiceStatus().catch(() => {});
}, 5000);

setInterval(() => {
  refreshConnectivity(false).catch(() => {});
}, 12000);

setInterval(() => {
  refreshLog().catch(() => {});
}, 4500);

setInterval(() => {
  refreshHistory().catch(() => {});
}, 9000);

setInterval(() => {
  refreshServiceLogs().catch(() => {});
}, 15000);

setInterval(() => {
  refreshSystemChecks().catch(() => {});
}, 45000);

setInterval(() => {
  refreshSetup().catch(() => {});
}, 60000);

setInterval(() => {
  refreshOnboarding().catch(() => {});
}, 12000);

setInterval(() => {
  refreshUpdateStatus(false, false).catch(() => {});
}, 1800000);

Promise.all([
  refreshJobs(),
  refreshServiceStatus(),
  refreshConnectivity(true),
  refreshServiceLogs(),
  refreshSystemChecks(),
  refreshSetup(),
  refreshOnboarding(),
  refreshUpdateStatus(false, false),
  refreshHistory(),
]).catch((error) => {
  elements.summaryEl.textContent = `Failed to initialize: ${error.message}`;
});
