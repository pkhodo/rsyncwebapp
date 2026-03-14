export const ALLOWED_THEMES = ["terminal", "fancy"];

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusBadge(status) {
  return `<span class="status ${status}">${String(status).replaceAll("_", " ")}</span>`;
}

function shortPath(path, max = 46) {
  if (!path || path.length <= max) return path || "-";
  return `...${path.slice(-(max - 3))}`;
}

function toNumber(value, fallback = 0) {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : fallback;
}

export function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function createUI(elements, keys) {
  const {
    jobsEl,
    summaryEl,
    kpiGridEl,
    systemChecksEl,
    setupSummaryEl,
    setupActionsEl,
    wizardSummaryEl,
    wizardStepsEl,
    connectivityDetailsEl,
    connectivityStatusEl,
    serviceStatusEl,
    autoSyncStatusEl,
    serviceLogContentEl,
    historyJobEl,
    historyContentEl,
    compactModeBtn,
    toggleSectionsBtn,
    themeSelect,
    toastContainer,
    sectionToggleButtons,
    collapsiblePanels,
  } = elements;

  const { themeKey, compactKey, collapsedKey } = keys;

  function showToast(message, level = "ok", timeoutMs = 3200) {
    const toast = document.createElement("div");
    toast.className = `toast ${level}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 160);
    }, timeoutMs);
  }

  function setTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(themeKey, theme);
  }

  function bootTheme() {
    const stored = localStorage.getItem(themeKey) || "terminal";
    if (!ALLOWED_THEMES.includes(stored)) {
      themeSelect.value = "terminal";
      setTheme("terminal");
      return;
    }
    themeSelect.value = stored;
    setTheme(stored);
  }

  function renderSummary(jobs, connectivity = null) {
    const counts = jobs.reduce(
      (acc, job) => {
        const status = job.runtime.status;
        const progress = toNumber(job.runtime.progress_percent, 0);
        acc.total += 1;
        acc.progressTotal += progress;
        if (status === "running") acc.running += 1;
        if (status === "paused_service") acc.pausedService += 1;
        if (status === "waiting_network") acc.waitingNetwork += 1;
        if (status === "waiting_window") acc.waitingWindow += 1;
        if (status === "failed") acc.failed += 1;
        if (status === "completed") acc.completed += 1;
        if (job.runtime.last_error) acc.withError += 1;
        return acc;
      },
      {
        total: 0,
        running: 0,
        waitingNetwork: 0,
        waitingWindow: 0,
        failed: 0,
        pausedService: 0,
        completed: 0,
        progressTotal: 0,
        withError: 0,
      }
    );

    const avgProgress = counts.total > 0 ? counts.progressTotal / counts.total : 0;
    const active = counts.running + counts.waitingNetwork + counts.waitingWindow + counts.pausedService;
    const connEntries = Object.values((connectivity && connectivity.servers) || {});
    const connUp = connEntries.filter((entry) => entry.reachable).length;
    const connDown = connEntries.length - connUp;

    kpiGridEl.innerHTML = `
      <article class="kpi-card ${counts.failed > 0 ? "err" : "ok"}">
        <div class="kpi-label">Failures</div>
        <div class="kpi-value">${counts.failed}</div>
      </article>
      <article class="kpi-card ${active > 0 ? "accent" : "ok"}">
        <div class="kpi-label">Active</div>
        <div class="kpi-value">${active}</div>
      </article>
      <article class="kpi-card ${counts.waitingNetwork > 0 ? "warn" : "ok"}">
        <div class="kpi-label">Waiting Network</div>
        <div class="kpi-value">${counts.waitingNetwork}</div>
      </article>
      <article class="kpi-card ${counts.pausedService > 0 ? "warn" : "ok"}">
        <div class="kpi-label">Paused by Service</div>
        <div class="kpi-value">${counts.pausedService}</div>
      </article>
      <article class="kpi-card ${connDown > 0 ? "warn" : "ok"}">
        <div class="kpi-label">Connectivity</div>
        <div class="kpi-value">${connUp}/${connEntries.length || 0}</div>
      </article>
      <article class="kpi-card accent">
        <div class="kpi-label">Average Progress</div>
        <div class="kpi-value">${avgProgress.toFixed(1)}%</div>
      </article>
      <article class="kpi-card ${counts.completed > 0 ? "ok" : "accent"}">
        <div class="kpi-label">Completed</div>
        <div class="kpi-value">${counts.completed}</div>
      </article>
    `;

    summaryEl.innerHTML = `
      <strong>${counts.total}</strong> jobs ·
      <strong>${counts.running}</strong> running ·
      <strong>${counts.waitingNetwork + counts.waitingWindow}</strong> waiting ·
      <strong>${counts.pausedService}</strong> service-paused ·
      <strong>${counts.withError}</strong> with alerts ·
      refreshed <strong>${new Date().toLocaleTimeString()}</strong>
    `;
  }

  function renderServiceStatus(service, error = null) {
    if (error) {
      serviceStatusEl.className = "status-pill err";
      serviceStatusEl.textContent = `Service status unavailable: ${error}`;
      if (autoSyncStatusEl) {
        autoSyncStatusEl.className = "status-pill err";
        autoSyncStatusEl.textContent = "Auto-sync: unavailable";
      }
      return;
    }
    serviceStatusEl.className = "status-pill ok";
    serviceStatusEl.textContent = `Service PID ${service.pid} · uptime ${service.uptime_seconds}s`;
    if (autoSyncStatusEl) {
      const paused = !!service.service_pause;
      autoSyncStatusEl.className = `status-pill ${paused ? "warn" : "ok"}`;
      autoSyncStatusEl.textContent = paused ? "Auto-sync: paused (manual)" : "Auto-sync: active";
    }
  }

  function renderConnectivity(connectivity, error = null) {
    if (error) {
      connectivityStatusEl.className = "status-pill err";
      connectivityStatusEl.textContent = `Connectivity check failed: ${error}`;
      connectivityDetailsEl.innerHTML = "";
      return;
    }

    const entries = Object.values(connectivity.servers || {});
    const paused = !!(connectivity && connectivity.paused);
    if (entries.length === 0) {
      connectivityStatusEl.textContent = "Connectivity: no servers configured";
      connectivityStatusEl.className = "status-pill warn";
      connectivityDetailsEl.innerHTML = "";
      return;
    }

    if (paused) {
      connectivityStatusEl.textContent = "Connectivity: probes paused by service control";
      connectivityStatusEl.className = "status-pill warn";
    } else {
      const allUp = entries.every((entry) => entry.reachable);
      connectivityStatusEl.textContent = allUp
        ? "Connectivity: all SSH targets reachable"
        : "Connectivity: some targets unreachable";
      connectivityStatusEl.className = `status-pill ${allUp ? "ok" : "warn"}`;
    }

    connectivityDetailsEl.innerHTML = "";
    for (const entry of entries) {
      const chip = document.createElement("span");
      chip.className = `conn-chip ${paused ? "warn" : entry.reachable ? "ok" : "err"}`;
      const latency = entry.latency_ms == null ? "-" : `${entry.latency_ms}ms`;
      chip.textContent = `${entry.server} · ${paused ? "paused" : entry.reachable ? "up" : "down"} · ${latency}`;
      connectivityDetailsEl.appendChild(chip);
    }
  }

  function renderSystemChecks(checks, error = null) {
    if (error) {
      systemChecksEl.innerHTML = `<span class="system-check err">System checks unavailable: ${error}</span>`;
      return;
    }
    const entries = Object.entries((checks && checks.commands) || {});
    if (entries.length === 0) {
      systemChecksEl.innerHTML = `<span class="system-check warn">No system checks available</span>`;
      return;
    }
    const base = entries
      .map(([name, info]) => {
        const cls = info.available ? "ok" : "err";
        const label = info.available ? "ready" : "missing";
        const version = info.version ? info.version : info.detail;
        return `<span class="system-check ${cls}" title="${version}">${name} · ${label}</span>`;
      })
      .join("");
    const caps = checks.rsync_capabilities || {};
    const compatibilityChip = `<span class="system-check ${checks.compatibility_ready ? "ok" : "warn"}" title="${caps.version || "unknown"}">${caps.flavor || "rsync"} · ${checks.compatibility_ready ? "compatible" : "limited"}</span>`;
    const notes = (caps.notes || [])
      .map((note) => `<span class="system-check warn">${note}</span>`)
      .join("");
    systemChecksEl.innerHTML = `${base}${compatibilityChip}${notes}`;
  }

  function renderSetup(setup, error = null) {
    if (error) {
      setupSummaryEl.textContent = `Setup unavailable: ${error}`;
      setupActionsEl.innerHTML = "";
      return;
    }
    const platform = setup.platform || {};
    setupSummaryEl.textContent = `Platform: ${platform.system || "unknown"} ${platform.release || ""}`.trim();
    const actions = setup.actions || [];
    if (actions.length === 0) {
      setupActionsEl.innerHTML = `<div class="setup-card"><strong>No guided installers</strong><p>This platform currently has no one-click setup actions.</p></div>`;
      return;
    }
    setupActionsEl.innerHTML = actions
      .map(
        (action) => `
          <article class="setup-card">
            <div class="setup-title">${action.label}</div>
            <p>${action.description}</p>
            <button data-setup-action="${action.id}" type="button">Run</button>
          </article>
        `
      )
      .join("");
  }

  function renderOnboarding(onboarding, error = null) {
    if (error) {
      wizardSummaryEl.textContent = `Onboarding unavailable: ${error}`;
      wizardStepsEl.innerHTML = "";
      return;
    }
    const steps = (onboarding && onboarding.steps) || [];
    if (steps.length === 0) {
      wizardSummaryEl.textContent = "No onboarding steps available.";
      wizardStepsEl.innerHTML = "";
      return;
    }
    wizardSummaryEl.textContent = onboarding.complete
      ? "Onboarding complete. You are ready for normal operations."
      : "Complete these steps once to make first sync safe.";
    const actionByStep = {
      dependencies: { id: "install-deps", label: "Install Dependencies" },
      first_job: { id: "open-editor", label: "Open Job Editor" },
      ssh_check: { id: "test-ssh", label: "Test SSH" },
      first_dry_run: { id: "run-dry", label: "Run Dry Run" },
    };
    wizardStepsEl.innerHTML = steps
      .map((step) => {
        const ok = step.state === "ok";
        const warn = step.state === "pending" || step.state === "pending_no_job" || step.state === "paused";
        const cls = ok ? "ok" : warn ? "warn" : "err";
        const action = actionByStep[step.id];
        const actionBtn = action && !ok
          ? `<button type="button" data-wizard-action="${action.id}">${action.label}</button>`
          : `<button type="button" disabled>${ok ? "Done" : "Pending"}</button>`;
        return `
          <article class="wizard-step ${cls}">
            <div>
              <div class="setup-title">${step.label}</div>
              <p>${step.detail || "-"}</p>
            </div>
            ${actionBtn}
          </article>
        `;
      })
      .join("");
  }

  function renderHistory(jobId, history, error = null) {
    if (!jobId) {
      historyJobEl.textContent = "No job selected";
      historyContentEl.textContent = 'Select a job and click "Log" to load run/event history.';
      return;
    }
    historyJobEl.textContent = `Job: ${jobId}`;
    if (error) {
      historyContentEl.textContent = `Failed to load history: ${error}`;
      return;
    }
    const runs = history.runs || [];
    const events = history.events || [];
    const lines = [];
    lines.push("Runs:");
    if (runs.length === 0) {
      lines.push("- none");
    } else {
      for (const run of runs) {
        lines.push(
          `- #${run.id} ${run.status} attempt=${run.attempt} start=${formatDate(run.started_at)} end=${formatDate(run.finished_at)} exit=${run.exit_code ?? "-"}`
        );
      }
    }
    lines.push("");
    lines.push("Events:");
    if (events.length === 0) {
      lines.push("- none");
    } else {
      for (const event of events) {
        lines.push(
          `- #${event.id} ${event.event_type}/${event.status} at ${formatDate(event.created_at)} :: ${event.message || "-"}`
        );
      }
    }
    historyContentEl.textContent = lines.join("\n");
    historyContentEl.scrollTop = 0;
  }

  function renderJobs(jobs) {
    jobsEl.innerHTML = "";
    if (jobs.length === 0) {
      jobsEl.innerHTML = "<p>No jobs configured yet.</p>";
      return;
    }

    for (const job of jobs) {
      const cfg = job.config;
      const rt = job.runtime;
      const progress = Math.max(0, Math.min(100, toNumber(rt.progress_percent, 0)));
      const nextRetryText = rt.next_retry_at ? new Date(rt.next_retry_at).toLocaleTimeString() : "-";
      const div = document.createElement("div");
      div.className = "job-card";
      div.innerHTML = `
        <div class="job-top">
          <div class="job-title">${cfg.name} <small>(${cfg.id})</small></div>
          <div class="job-state">
            <span class="job-progress-badge">${progress.toFixed(1)}%</span>
            ${statusBadge(rt.status)}
          </div>
        </div>
        <div class="path-strip">
          <span class="path-chip">src ${cfg.server}:${shortPath(cfg.remote_path)}</span>
          <span class="path-chip">dst ${shortPath(cfg.local_path)}</span>
        </div>
        <div class="meta-critical">
          <span class="telemetry-chip">mode ${cfg.mode}</span>
          <span class="telemetry-chip">retries ${rt.retries}</span>
          <span class="telemetry-chip">next ${nextRetryText}</span>
          <span class="telemetry-chip ${rt.last_error ? "err" : "ok"}">${rt.last_error ? "alert" : "clean"}</span>
        </div>
        <div class="meta meta-extended">
          <div><strong>Retry:</strong> ${cfg.auto_retry ? "on" : "off"} | <strong>Dry-run default:</strong> ${cfg.dry_run ? "yes" : "no"}</div>
          <div><strong>Throttle:</strong> bw=${cfg.bwlimit_kbps || 0}KB/s | nice=${cfg.nice_level || 0} | hours=${cfg.allowed_start_hour ?? -1}-${cfg.allowed_end_hour ?? -1}</div>
          <div><strong>Last start:</strong> ${formatDate(rt.last_started_at)} | <strong>Last end:</strong> ${formatDate(rt.last_finished_at)}</div>
          <div><strong>Attempts:</strong> ${rt.attempts} | <strong>Error:</strong> ${rt.last_error || "-"}</div>
        </div>
        <div class="progress-wrap">
          <progress max="100" value="${progress}"></progress>
          <div class="meta progress-line">${rt.progress_line || "No progress output yet."}</div>
        </div>
        <div class="job-actions">
          <button data-action="start" data-id="${cfg.id}">Start</button>
          <button data-action="dry-run" data-id="${cfg.id}">Dry Run</button>
          <button data-action="pause" data-id="${cfg.id}">Pause</button>
          <button data-action="resume" data-id="${cfg.id}">Resume</button>
          <button data-action="cancel" data-id="${cfg.id}">Cancel</button>
          <button data-action="log" data-id="${cfg.id}">Log</button>
          <button data-action="preview-deletes" data-id="${cfg.id}" class="extra-action">Preview Deletes</button>
          <button data-action="test-connection" data-id="${cfg.id}" class="extra-action">Test Conn</button>
          <button data-action="edit" data-id="${cfg.id}" class="extra-action">Edit</button>
          <button data-action="delete" data-id="${cfg.id}" class="extra-action">Delete</button>
        </div>
      `;
      jobsEl.appendChild(div);
    }
  }

  function renderServiceLogs(payload, error = null) {
    if (error) {
      serviceLogContentEl.textContent = `Failed to load service logs: ${error}`;
      return;
    }
    const groups = payload.logs || [];
    const chunks = [];
    for (const group of groups) {
      const header = `=== ${group.name} (${group.exists ? "found" : "missing"}) ===`;
      const body = group.exists ? group.lines.join("\n") || "(empty)" : "Log file not created yet.";
      chunks.push(`${header}\n${body}`);
    }
    serviceLogContentEl.textContent = chunks.join("\n\n");
    serviceLogContentEl.scrollTop = serviceLogContentEl.scrollHeight;
  }

  function readCollapsedSet() {
    try {
      const raw = localStorage.getItem(collapsedKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed);
    } catch (_err) {
      return new Set();
    }
  }

  function writeCollapsedSet(setValue) {
    localStorage.setItem(collapsedKey, JSON.stringify(Array.from(setValue)));
  }

  function updateSectionButton(sectionName, collapsed) {
    const btn = document.querySelector(`.collapse-btn[data-target-section="${sectionName}"]`);
    if (btn) {
      btn.textContent = collapsed ? "Expand" : "Collapse";
    }
  }

  function updateGlobalCollapseButton() {
    const panels = Array.from(collapsiblePanels);
    const collapsedCount = panels.filter((panel) => panel.classList.contains("is-collapsed")).length;
    const allCollapsed = panels.length > 0 && collapsedCount === panels.length;
    toggleSectionsBtn.textContent = allCollapsed ? "Expand All" : "Collapse All";
  }

  function setSectionCollapsed(sectionName, collapsed, persist = true) {
    const panel = document.querySelector(`.panel.collapsible[data-section="${sectionName}"]`);
    if (!panel) return;
    panel.classList.toggle("is-collapsed", collapsed);
    updateSectionButton(sectionName, collapsed);
    if (persist) {
      const collapsedSet = readCollapsedSet();
      if (collapsed) collapsedSet.add(sectionName);
      else collapsedSet.delete(sectionName);
      writeCollapsedSet(collapsedSet);
    }
    updateGlobalCollapseButton();
  }

  function setAllSectionsCollapsed(collapsed) {
    const collapsedSet = new Set();
    for (const panel of collapsiblePanels) {
      const section = panel.dataset.section;
      if (!section) continue;
      panel.classList.toggle("is-collapsed", collapsed);
      if (collapsed) collapsedSet.add(section);
      updateSectionButton(section, collapsed);
    }
    writeCollapsedSet(collapsedSet);
    updateGlobalCollapseButton();
  }

  function setCompactMode(enabled, persist = true) {
    document.body.classList.toggle("compact-mode", enabled);
    compactModeBtn.textContent = `Compact Mode: ${enabled ? "On" : "Off"}`;
    if (persist) {
      localStorage.setItem(compactKey, enabled ? "1" : "0");
    }
  }

  function isCompactMode() {
    return document.body.classList.contains("compact-mode");
  }

  function bootLayoutMode() {
    setCompactMode(localStorage.getItem(compactKey) === "1", false);
    const collapsedSet = readCollapsedSet();
    for (const panel of collapsiblePanels) {
      const sectionName = panel.dataset.section;
      if (!sectionName) continue;
      const collapsed = collapsedSet.has(sectionName);
      panel.classList.toggle("is-collapsed", collapsed);
      updateSectionButton(sectionName, collapsed);
    }
    updateGlobalCollapseButton();
  }

  function bindSectionToggleButtons() {
    for (const btn of sectionToggleButtons) {
      btn.addEventListener("click", () => {
        const sectionName = btn.dataset.targetSection;
        if (!sectionName) return;
        const panel = document.querySelector(`.panel.collapsible[data-section="${sectionName}"]`);
        const collapsed = panel ? !panel.classList.contains("is-collapsed") : false;
        setSectionCollapsed(sectionName, collapsed, true);
      });
    }
  }

  return {
    bootTheme,
    setTheme,
    showToast,
    renderSummary,
    renderServiceStatus,
    renderConnectivity,
    renderSystemChecks,
    renderSetup,
    renderOnboarding,
    renderJobs,
    renderServiceLogs,
    renderHistory,
    setCompactMode,
    isCompactMode,
    setSectionCollapsed,
    setAllSectionsCollapsed,
    bootLayoutMode,
    bindSectionToggleButtons,
  };
}
