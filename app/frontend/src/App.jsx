import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  Bot,
  Check,
  CirclePause,
  CirclePlay,
  CircleSlash2,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  Gauge,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Logs,
  Network,
  Paintbrush,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  TestTubeDiagonal,
  Trash2,
  UploadCloud,
  Wrench,
  X,
  Zap,
} from "lucide-react";

const STORAGE_KEYS = {
  theme: "rsync_wa_theme",
  view: "rsync_wa_view",
  compact: "rsync_wa_compact",
  editor: "rsync_wa_editor_mode",
  updateCheckMs: "rsync_wa_update_check_ms",
};

const UPDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const EMPTY_FORM = {
  id: "",
  name: "",
  server: "",
  remote_path: "",
  local_path: "",
  mode: "append",
  mirror_confirmed: false,
  timeout_seconds: 60,
  contimeout_seconds: 15,
  retry_initial_seconds: 10,
  retry_max_seconds: 300,
  bwlimit_kbps: 0,
  nice_level: 0,
  allowed_start_hour: -1,
  allowed_end_hour: -1,
  dry_run: true,
  auto_retry: true,
  excludes_text: "",
  extra_args_text: "",
};

const VIEW_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "jobs", label: "Jobs", icon: Activity },
  { key: "locations", label: "Locations", icon: Compass },
  { key: "builder", label: "Builder", icon: Wrench },
  { key: "logs", label: "Logs", icon: Logs },
  { key: "setup", label: "Setup", icon: Settings2 },
];

function toLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch (_err) {
    return String(value);
  }
}

function shortPath(value, max = 54) {
  if (!value) return "-";
  if (value.length <= max) return value;
  return `...${value.slice(-(max - 3))}`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = units[0];
  for (const next of units) {
    unit = next;
    if (size < 1024 || next === units[units.length - 1]) break;
    size /= 1024;
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
}

function formatRunDuration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
  const seconds = Math.round((end - start) / 1000);
  return `${seconds}s`;
}

function formatRelative(value) {
  if (!value) return "-";
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return "-";
  const delta = Math.round((at - Date.now()) / 1000);
  if (Math.abs(delta) < 2) return "now";
  if (delta < 0) return `${Math.abs(delta)}s ago`;
  return `in ${delta}s`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_err) {
    payload = { ok: false, error: `Invalid JSON response (${response.status})` };
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

function panelClass() {
  return "panel rounded-2xl border p-4 md:p-5";
}

function statusClass(level = "neutral") {
  if (level === "ok") return "pill pill-ok";
  if (level === "warn") return "pill pill-warn";
  if (level === "err") return "pill pill-err";
  return "pill";
}

function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : raw;
  });

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue];
}

function Collapsible({ title, icon: Icon, open, onToggle, children, right }) {
  return (
    <section className={panelClass()}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button className="flex items-center gap-2 text-left" onClick={onToggle} type="button">
          <Icon className="h-4 w-4 opacity-80" />
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        </button>
        <div className="flex items-center gap-2">
          {right}
          <button className="btn btn-ghost text-xs" onClick={onToggle} type="button">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {open ? children : null}
    </section>
  );
}

export default function App() {
  const [theme, setTheme] = useStoredState(STORAGE_KEYS.theme, "terminal");
  const [view, setView] = useStoredState(STORAGE_KEYS.view, "overview");
  const [compact, setCompact] = useStoredState(STORAGE_KEYS.compact, "0");
  const [editorMode, setEditorMode] = useStoredState(STORAGE_KEYS.editor, "basic");

  const [jobs, setJobs] = useState([]);
  const [service, setService] = useState(null);
  const [setup, setSetup] = useState(null);
  const [setupHealth, setSetupHealth] = useState(null);
  const [setupResult, setSetupResult] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [connectivity, setConnectivity] = useState(null);
  const [locations, setLocations] = useState({ remote_locations: [], local_locations: [] });
  const [updateInfo, setUpdateInfo] = useState(null);
  const [serviceLogs, setServiceLogs] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobLog, setJobLog] = useState('Select a job and click "Load Job Logs".');
  const [jobHistoryText, setJobHistoryText] = useState('Select a job and click "Load Job Logs".');
  const [deletePreview, setDeletePreview] = useState('Run "Preview Deletes" from Jobs.');
  const [composeOutput, setComposeOutput] = useState("Select remote/local profiles to preview combinations.");
  const [commandPreview, setCommandPreview] = useState(
    "Expert mode shows the exact rsync command generated by your builder values."
  );

  const [remoteDraft, setRemoteDraft] = useState({ id: "", name: "", server: "", remote_path: "", notes: "" });
  const [localDraft, setLocalDraft] = useState({ id: "", name: "", local_path: "", notes: "" });
  const [compose, setCompose] = useState({
    remote_ids: [],
    local_ids: [],
    pair_mode: "matrix",
    name_template: "{remote_name} -> {local_name}",
    defaults: { mode: "append", dry_run: true, auto_retry: true, mirror_confirmed: false },
  });
  const [jobForm, setJobForm] = useState(EMPTY_FORM);
  const [toasts, setToasts] = useState([]);
  const [busyMap, setBusyMap] = useState({});
  const toastGateRef = useRef({});

  const [sectionsOpen, setSectionsOpen] = useState({
    overviewHealth: true,
    overviewWizard: true,
    jobs: true,
    locationsRemote: true,
    locationsLocal: true,
    locationsCompose: true,
    builder: true,
    logsJob: true,
    logsService: true,
    setupActions: true,
  });

  const addToast = (message, level = "ok", timeoutMs = 3400) => {
    const key = `${level}:${message}`;
    const now = Date.now();
    const last = toastGateRef.current[key] || 0;
    if (now - last < 4500) return;
    toastGateRef.current[key] = now;

    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, level }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, timeoutMs);
  };

  const setBusy = (key, value) => {
    setBusyMap((prev) => ({ ...prev, [key]: value }));
  };

  const derived = useMemo(() => {
    const counters = {
      total: jobs.length,
      running: 0,
      waiting: 0,
      failed: 0,
      completed: 0,
      pausedService: 0,
      withAlert: 0,
    };
    let progressTotal = 0;
    for (const job of jobs) {
      const status = job.runtime.status;
      const pct = Number(job.runtime.progress_percent || 0);
      progressTotal += Number.isFinite(pct) ? pct : 0;
      if (status === "running") counters.running += 1;
      if (status === "waiting_network" || status === "waiting_window") counters.waiting += 1;
      if (status === "failed") counters.failed += 1;
      if (status === "completed") counters.completed += 1;
      if (status === "paused_service") counters.pausedService += 1;
      if (job.runtime.last_error) counters.withAlert += 1;
    }

    const entries = Object.values(connectivity?.servers || {});
    const reachable = entries.filter((item) => item.reachable).length;
    const averageProgress = counters.total === 0 ? 0 : progressTotal / counters.total;

    return { counters, averageProgress, connTotal: entries.length, connReachable: reachable };
  }, [jobs, connectivity]);

  const updateStatusPill = useMemo(() => {
    if (!updateInfo?.ok) return { text: "Update status unknown", level: "warn" };
    if (updateInfo.update_available) {
      if (updateInfo.channel === "git") {
        return { text: `Update available (${updateInfo.remote_commit || "origin"})`, level: "warn" };
      }
      return { text: `Update available v${updateInfo.latest_version || "new"}`, level: "warn" };
    }
    if (updateInfo.channel === "git") {
      return { text: `Up to date ${updateInfo.local_commit || ""}`.trim(), level: "ok" };
    }
    return { text: `Up to date v${updateInfo.current_version || "-"}`, level: "ok" };
  }, [updateInfo]);

  const toggleSection = (key) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const collapseAll = () => {
    const allClosed = Object.values(sectionsOpen).every((item) => !item);
    const nextValue = allClosed;
    const next = {};
    for (const key of Object.keys(sectionsOpen)) next[key] = nextValue;
    setSectionsOpen(next);
  };

  const loadJobs = async () => {
    const data = await api("/api/jobs");
    setJobs(data.jobs || []);
    if (!selectedJobId && data.jobs?.length) {
      setSelectedJobId(data.jobs[0].config.id);
    }
  };

  const loadService = async () => {
    const data = await api("/api/service/status");
    setService(data.service);
  };

  const loadSetup = async () => {
    const data = await api("/api/setup/options");
    setSetup(data.setup);
  };

  const loadSetupHealth = async (force = false) => {
    const data = await api(`/api/setup/health${force ? "?force=1" : ""}`);
    setSetupHealth(data.health || null);
  };

  const loadOnboarding = async () => {
    const data = await api("/api/onboarding/status");
    setOnboarding(data.onboarding);
  };

  const loadConnectivity = async (force = false) => {
    const data = await api(`/api/connectivity${force ? "?force=1" : ""}`);
    setConnectivity(data.connectivity);
  };

  const loadLocations = async () => {
    const data = await api("/api/locations");
    setLocations(data.locations || { remote_locations: [], local_locations: [] });
  };

  const loadServiceLogs = async () => {
    const data = await api("/api/service/logs?tail=130");
    const groups = data.service_logs?.logs || [];
    const lines = [];
    for (const group of groups) {
      lines.push(`=== ${group.name} (${group.exists ? "found" : "missing"}) ===`);
      if (group.exists) {
        lines.push((group.lines || []).join("\n") || "(empty)");
      } else {
        lines.push("No log file yet.");
      }
      lines.push("");
    }
    setServiceLogs(lines.join("\n").trim() || "(no logs)");
  };

  const loadJobLogAndHistory = async () => {
    if (!selectedJobId) return;
    const [logData, historyData] = await Promise.all([
      api(`/api/jobs/${selectedJobId}/log?tail=220`),
      api(`/api/jobs/${selectedJobId}/history?limit=30`),
    ]);
    setJobLog(logData.log || "(empty log)");

    const lines = [];
    lines.push("Runs:");
    const runs = historyData.history?.runs || [];
    if (!runs.length) {
      lines.push("- none");
    } else {
      for (const run of runs) {
        const t = Number(run.transferred_files || 0);
        const d = Number(run.deleted_files || 0);
        const sent = formatBytes(run.sent_bytes || 0);
        const recv = formatBytes(run.received_bytes || 0);
        lines.push(
          `- #${run.id} ${run.status} attempt=${run.attempt} start=${formatDate(run.started_at)} end=${formatDate(run.finished_at)} exit=${run.exit_code ?? "-"} mode=${Number(run.dry_run || 0) === 1 ? "dry-run" : "live"} transferred=${t} deleted=${d} sent=${sent} recv=${recv}`
        );
      }
    }
    lines.push("");
    lines.push("Events:");
    const events = historyData.history?.events || [];
    if (!events.length) {
      lines.push("- none");
    } else {
      for (const item of events) {
        lines.push(`- #${item.id} ${item.event_type}/${item.status} at ${formatDate(item.created_at)} :: ${item.message || "-"}`);
      }
    }
    setJobHistoryText(lines.join("\n"));
  };

  const checkUpdates = async (force = false, showToast = false) => {
    const data = await api(`/api/app/update-check${force ? "?force=1" : ""}`);
    setUpdateInfo(data.update || null);
    if (!showToast) return;
    if (data.update?.ok && data.update?.update_available) {
      addToast("Update available. You can apply it from Setup > Update App.", "warn", 4200);
      return;
    }
    addToast("No update available right now.", "ok", 2400);
  };

  const refreshAll = async () => {
    await Promise.all([
      loadJobs(),
      loadService(),
      loadSetup(),
      loadSetupHealth(false),
      loadOnboarding(),
      loadConnectivity(true),
      loadLocations(),
      loadServiceLogs(),
      checkUpdates(false, false),
    ]);
    if (selectedJobId) {
      await loadJobLogAndHistory();
    }
  };

  const refreshAllEvent = useEffectEvent(() => {
    refreshAll().catch((error) => addToast(error.message, "err", 6000));
  });

  const weeklyUpdateEvent = useEffectEvent(() => {
    checkUpdates(false, false)
      .then(() => {
        localStorage.setItem(STORAGE_KEYS.updateCheckMs, String(Date.now()));
      })
      .catch(() => {});
  });

  const pollJobsEvent = useEffectEvent(() => {
    loadJobs().catch(() => {});
  });

  const pollJobLogEvent = useEffectEvent(() => {
    if (!selectedJobId) return;
    loadJobLogAndHistory().catch(() => {});
  });

  useEffect(() => {
    document.body.setAttribute("data-theme", theme === "fancy" ? "fancy" : "terminal");
    document.body.setAttribute("data-compact", compact === "1" ? "1" : "0");
  }, [theme, compact]);

  useEffect(() => {
    refreshAllEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.updateCheckMs);
    const last = raw ? Number(raw) : 0;
    const due = !Number.isFinite(last) || Date.now() - last >= UPDATE_INTERVAL_MS;
    if (!due) return;
    weeklyUpdateEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      pollJobsEvent();
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      loadService().catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      loadConnectivity(false).catch(() => {});
    }, 12000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      pollJobLogEvent();
    }, 9000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      loadServiceLogs().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const runServiceAction = async (path, busyKey, successText) => {
    setBusy(busyKey, true);
    try {
      await api(path, { method: "POST" });
      addToast(successText, "ok");
      await Promise.all([loadService(), loadJobs()]);
    } catch (error) {
      addToast(error.message, "err", 6000);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const runSetupAction = async (actionId) => {
    const busyKey = `setup-${actionId}`;
    setBusy(busyKey, true);
    try {
      const data = await api(`/api/setup/${actionId}`, { method: "POST" });
      const label = data.result?.action?.label || actionId;
      setSetupResult(data.result || null);
      addToast(
        data.result?.success ? `Completed: ${label}` : `Failed: ${label}`,
        data.result?.success ? "ok" : "err",
        4200
      );
      await Promise.all([loadSetup(), loadService(), loadSetupHealth(true)]);
    } catch (error) {
      addToast(error.message, "err", 6000);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const runSetupCheck = async () => {
    const busyKey = "setup-run-check";
    setBusy(busyKey, true);
    try {
      const data = await api("/api/setup/run-check", { method: "POST" });
      setSetupHealth(data.health || null);
      const health = data.health || {};
      const summary = {
        action: { id: "run_setup_check", label: "Run Setup Check" },
        success: health.overall === "ok",
        level: health.overall === "ok" ? "ok" : "warn",
        summary: {
          title: "Guided setup check completed",
          bullets: [
            `Overall: ${health.overall || "unknown"}`,
            `Errors: ${health.errors ?? "-"}`,
            `Warnings: ${health.warnings ?? "-"}`,
          ],
        },
        details: { report: health.report || "" },
        ran_at: new Date().toISOString(),
      };
      setSetupResult(summary);
      addToast(`Setup check: ${health.overall || "unknown"}`, health.overall === "ok" ? "ok" : "warn", 4200);
    } catch (error) {
      addToast(error.message, "err", 6000);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const runJobAction = async (action, jobId) => {
    const busyKey = `job-${action}-${jobId}`;
    setBusy(busyKey, true);
    try {
      if (action === "edit") {
        const item = jobs.find((entry) => entry.config.id === jobId);
        if (!item) return;
        const cfg = item.config;
        setJobForm({
          id: cfg.id || "",
          name: cfg.name || "",
          server: cfg.server || "",
          remote_path: cfg.remote_path || "",
          local_path: cfg.local_path || "",
          mode: cfg.mode || "append",
          mirror_confirmed: !!cfg.mirror_confirmed,
          timeout_seconds: cfg.timeout_seconds ?? 60,
          contimeout_seconds: cfg.contimeout_seconds ?? 15,
          retry_initial_seconds: cfg.retry_initial_seconds ?? 10,
          retry_max_seconds: cfg.retry_max_seconds ?? 300,
          bwlimit_kbps: cfg.bwlimit_kbps ?? 0,
          nice_level: cfg.nice_level ?? 0,
          allowed_start_hour: cfg.allowed_start_hour ?? -1,
          allowed_end_hour: cfg.allowed_end_hour ?? -1,
          dry_run: !!cfg.dry_run,
          auto_retry: !!cfg.auto_retry,
          excludes_text: (cfg.excludes || []).join("\n"),
          extra_args_text: (cfg.extra_args || []).join("\n"),
        });
        setView("builder");
        return;
      }
      if (action === "log") {
        setSelectedJobId(jobId);
        setView("logs");
        await loadJobLogAndHistory();
        return;
      }
      if (action === "delete") {
        const yes = window.confirm(`Delete job ${jobId}?`);
        if (!yes) return;
        await api(`/api/jobs/${jobId}`, { method: "DELETE" });
        addToast(`Deleted ${jobId}`, "ok");
        if (selectedJobId === jobId) {
          setSelectedJobId("");
          setJobLog('Select a job and click "Load Job Logs".');
          setJobHistoryText('Select a job and click "Load Job Logs".');
        }
        await loadJobs();
        return;
      }
      if (action === "clone") {
        const item = jobs.find((entry) => entry.config.id === jobId);
        if (!item) return;
        const cfg = item.config;
        const payload = {
          name: `${cfg.name} copy`,
          server: cfg.server,
          remote_path: cfg.remote_path,
          local_path: cfg.local_path,
          mode: cfg.mode,
          mirror_confirmed: !!cfg.mirror_confirmed,
          timeout_seconds: cfg.timeout_seconds ?? 60,
          contimeout_seconds: cfg.contimeout_seconds ?? 15,
          retry_initial_seconds: cfg.retry_initial_seconds ?? 10,
          retry_max_seconds: cfg.retry_max_seconds ?? 300,
          bwlimit_kbps: cfg.bwlimit_kbps ?? 0,
          nice_level: cfg.nice_level ?? 0,
          allowed_start_hour: cfg.allowed_start_hour ?? -1,
          allowed_end_hour: cfg.allowed_end_hour ?? -1,
          dry_run: true,
          auto_retry: !!cfg.auto_retry,
          excludes: cfg.excludes || [],
          extra_args: cfg.extra_args || [],
        };
        const data = await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
        addToast(`Cloned job as ${data.job?.config?.id || "new job"}`, "ok");
        await loadJobs();
        setView("jobs");
        return;
      }
      if (action === "test-connection") {
        const data = await api(`/api/jobs/${jobId}/test-connection`, { method: "POST" });
        const result = data.result || {};
        if (result.reachable) {
          addToast(`Connection OK (${result.latency_ms || "?"}ms)`, "ok");
        } else {
          addToast(`Connection failed: ${result.output || result.exit_code}`, "warn", 5200);
        }
        await loadConnectivity(true);
        return;
      }
      if (action === "preview-deletes") {
        const data = await api(`/api/jobs/${jobId}/preview-deletes`, { method: "POST" });
        const result = data.result || {};
        const lines = [];
        lines.push(`Job ${jobId}`);
        lines.push(`${result.deletes_count || 0} file(s) would be deleted.`);
        lines.push("");
        const preview = result.deletes_preview || [];
        if (preview.length > 0) {
          lines.push(...preview);
        } else {
          lines.push("No deletions detected.");
        }
        setDeletePreview(lines.join("\n"));
        setView("logs");
        return;
      }
      await api(`/api/jobs/${jobId}/${action}`, { method: "POST" });
      const actionLabel = {
        "start-live": "Live run requested",
        "start": "Run requested",
        "dry-run": "Dry-run requested",
        "clone": "Clone requested",
        "pause": "Pause requested",
        "resume": "Resume requested",
        "cancel": "Cancel requested",
      }[action] || `${action} requested`;
      addToast(`${actionLabel} for ${jobId}`, "ok");
      await loadJobs();
    } catch (error) {
      addToast(error.message, "err", 6000);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const saveJob = async (event) => {
    event.preventDefault();
    const payload = {
      name: jobForm.name.trim(),
      server: jobForm.server.trim(),
      remote_path: jobForm.remote_path.trim(),
      local_path: jobForm.local_path.trim(),
      mode: jobForm.mode,
      mirror_confirmed: !!jobForm.mirror_confirmed,
      timeout_seconds: Number(jobForm.timeout_seconds || 60),
      contimeout_seconds: Number(jobForm.contimeout_seconds || 15),
      retry_initial_seconds: Number(jobForm.retry_initial_seconds || 10),
      retry_max_seconds: Number(jobForm.retry_max_seconds || 300),
      bwlimit_kbps: Number(jobForm.bwlimit_kbps || 0),
      nice_level: Number(jobForm.nice_level || 0),
      allowed_start_hour: Number(jobForm.allowed_start_hour ?? -1),
      allowed_end_hour: Number(jobForm.allowed_end_hour ?? -1),
      dry_run: !!jobForm.dry_run,
      auto_retry: !!jobForm.auto_retry,
      excludes: toLines(jobForm.excludes_text),
      extra_args: toLines(jobForm.extra_args_text),
    };

    if (!payload.name || !payload.server || !payload.remote_path || !payload.local_path) {
      addToast("Name, server, remote path and local path are required.", "warn");
      return;
    }
    if (payload.mode === "mirror" && !payload.mirror_confirmed) {
      addToast("Mirror mode needs delete confirmation before saving.", "warn", 4200);
      return;
    }

    const busyKey = "save-job";
    setBusy(busyKey, true);
    try {
      if (jobForm.id) {
        await api(`/api/jobs/${jobForm.id}`, { method: "PUT", body: JSON.stringify(payload) });
        addToast(`Updated ${jobForm.id}`, "ok");
      } else {
        const data = await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
        addToast(`Created ${data.job?.config?.id || "job"}`, "ok");
      }
      setJobForm(EMPTY_FORM);
      await Promise.all([loadJobs(), loadOnboarding()]);
      setView("jobs");
    } catch (error) {
      addToast(error.message, "err", 6000);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const saveRemote = async (event) => {
    event.preventDefault();
    const body = {
      name: remoteDraft.name.trim(),
      server: remoteDraft.server.trim(),
      remote_path: remoteDraft.remote_path.trim(),
      notes: remoteDraft.notes.trim(),
    };
    if (!body.name || !body.server || !body.remote_path) {
      addToast("Remote location needs name, server and remote path.", "warn");
      return;
    }
    const busyKey = "save-remote";
    setBusy(busyKey, true);
    try {
      if (remoteDraft.id) {
        await api(`/api/locations/remote/${remoteDraft.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/locations/remote", { method: "POST", body: JSON.stringify(body) });
      }
      addToast("Remote location saved", "ok");
      setRemoteDraft({ id: "", name: "", server: "", remote_path: "", notes: "" });
      await loadLocations();
    } catch (error) {
      addToast(error.message, "err", 5200);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const saveLocal = async (event) => {
    event.preventDefault();
    const body = {
      name: localDraft.name.trim(),
      local_path: localDraft.local_path.trim(),
      notes: localDraft.notes.trim(),
    };
    if (!body.name || !body.local_path) {
      addToast("Local location needs name and local path.", "warn");
      return;
    }
    const busyKey = "save-local";
    setBusy(busyKey, true);
    try {
      if (localDraft.id) {
        await api(`/api/locations/local/${localDraft.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/locations/local", { method: "POST", body: JSON.stringify(body) });
      }
      addToast("Local location saved", "ok");
      setLocalDraft({ id: "", name: "", local_path: "", notes: "" });
      await loadLocations();
    } catch (error) {
      addToast(error.message, "err", 5200);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const deleteLocation = async (kind, id) => {
    const yes = window.confirm(`Delete ${kind} location ${id}?`);
    if (!yes) return;
    const busyKey = `delete-${kind}-${id}`;
    setBusy(busyKey, true);
    try {
      const path = kind === "remote" ? `/api/locations/remote/${id}` : `/api/locations/local/${id}`;
      await api(path, { method: "DELETE" });
      addToast("Location deleted", "ok");
      await loadLocations();
    } catch (error) {
      addToast(error.message, "err", 5200);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const cloneLocation = async (kind, item) => {
    const busyKey = `clone-${kind}-${item.id}`;
    setBusy(busyKey, true);
    try {
      if (kind === "remote") {
        const body = {
          name: `${item.name} copy`,
          server: item.server,
          remote_path: item.remote_path,
          notes: item.notes || "",
        };
        await api("/api/locations/remote", { method: "POST", body: JSON.stringify(body) });
      } else {
        const body = {
          name: `${item.name} copy`,
          local_path: item.local_path,
          notes: item.notes || "",
        };
        await api("/api/locations/local", { method: "POST", body: JSON.stringify(body) });
      }
      addToast("Location cloned", "ok");
      await loadLocations();
    } catch (error) {
      addToast(error.message, "err", 5200);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const composeJobs = async (create) => {
    if (!compose.remote_ids.length || !compose.local_ids.length) {
      addToast("Select at least one remote and one local location.", "warn");
      return;
    }
    if (create) {
      const yes = window.confirm("Create jobs from selected location combinations?");
      if (!yes) return;
    }
    const busyKey = create ? "compose-create" : "compose-preview";
    setBusy(busyKey, true);
    try {
      const payload = {
        remote_ids: compose.remote_ids,
        local_ids: compose.local_ids,
        pair_mode: compose.pair_mode,
        name_template: compose.name_template,
        defaults: compose.defaults,
        create,
      };
      const data = await api("/api/locations/compose", { method: "POST", body: JSON.stringify(payload) });
      const result = data.result || {};
      const lines = [
        `Pair mode: ${result.pair_mode || "-"}`,
        `Total pairs: ${result.pairs_total || 0}`,
        `Preview jobs: ${(result.preview_jobs || []).length}`,
        `Created: ${result.created_count || 0}`,
      ];
      const preview = (result.preview_jobs || []).slice(0, 40);
      if (preview.length) {
        lines.push("", "Preview:");
        for (const item of preview) lines.push(`- ${item.name}`);
      }
      const errors = result.errors || [];
      if (errors.length) {
        lines.push("", "Errors:");
        for (const item of errors.slice(0, 30)) lines.push(`- ${item}`);
      }
      setComposeOutput(lines.join("\n"));
      if (create) {
        addToast(`Created ${result.created_count || 0} jobs`, "ok");
        await Promise.all([loadJobs(), loadOnboarding()]);
        setView("jobs");
      } else {
        addToast(`Preview generated for ${result.pairs_total || 0} pairs`, "ok");
      }
    } catch (error) {
      addToast(error.message, "err", 5200);
    } finally {
      setBusy(busyKey, false);
    }
  };

  const copyDiagnostics = async () => {
    try {
      const data = await api("/api/diagnostics");
      const text = JSON.stringify(data.diagnostics, null, 2);
      await navigator.clipboard.writeText(text);
      addToast("Diagnostics copied to clipboard", "ok");
    } catch (error) {
      addToast(error.message, "err", 5200);
    }
  };

  const previewCommand = async () => {
    const payload = {
      name: jobForm.name.trim() || "preview",
      server: jobForm.server.trim(),
      remote_path: jobForm.remote_path.trim(),
      local_path: jobForm.local_path.trim(),
      mode: jobForm.mode,
      mirror_confirmed: !!jobForm.mirror_confirmed,
      timeout_seconds: Number(jobForm.timeout_seconds || 60),
      contimeout_seconds: Number(jobForm.contimeout_seconds || 15),
      retry_initial_seconds: Number(jobForm.retry_initial_seconds || 10),
      retry_max_seconds: Number(jobForm.retry_max_seconds || 300),
      bwlimit_kbps: Number(jobForm.bwlimit_kbps || 0),
      nice_level: Number(jobForm.nice_level || 0),
      allowed_start_hour: Number(jobForm.allowed_start_hour ?? -1),
      allowed_end_hour: Number(jobForm.allowed_end_hour ?? -1),
      dry_run: !!jobForm.dry_run,
      auto_retry: !!jobForm.auto_retry,
      excludes: toLines(jobForm.excludes_text),
      extra_args: toLines(jobForm.extra_args_text),
    };
    try {
      const data = await api("/api/jobs/preview-command", { method: "POST", body: JSON.stringify(payload) });
      setCommandPreview(data.result?.shell || (data.result?.command || []).join(" "));
      addToast("Command preview updated", "ok");
    } catch (error) {
      addToast(error.message, "err", 5200);
    }
  };

  const wizardAction = async (stepId) => {
    try {
      if (stepId === "dependencies") {
        await runSetupAction("install_dependencies");
        await loadOnboarding();
        return;
      }
      if (stepId === "first_job") {
        setView("builder");
        return;
      }
      if (stepId === "ssh_check") {
        await loadConnectivity(true);
        await loadOnboarding();
        return;
      }
      if (stepId === "first_dry_run") {
        if (!jobs.length) {
          addToast("Create at least one job first.", "warn");
          return;
        }
        await runJobAction("dry-run", jobs[0].config.id);
        await loadOnboarding();
      }
    } catch (error) {
      addToast(error.message, "err", 5200);
    }
  };

  const renderOverview = () => (
    <div className="space-y-4">
      <Collapsible
        title="Health and Telemetry"
        icon={Gauge}
        open={sectionsOpen.overviewHealth}
        onToggle={() => toggleSection("overviewHealth")}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="kpi">
            <div className="kpi-label">Jobs</div>
            <div className="kpi-value">{derived.counters.total}</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Running</div>
            <div className="kpi-value">{derived.counters.running}</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Waiting</div>
            <div className="kpi-value">{derived.counters.waiting}</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Failures</div>
            <div className="kpi-value">{derived.counters.failed}</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Connectivity</div>
            <div className="kpi-value">
              {derived.connReachable}/{derived.connTotal}
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Avg Progress</div>
            <div className="kpi-value">{derived.averageProgress.toFixed(1)}%</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Paused by Service</div>
            <div className="kpi-value">{derived.counters.pausedService}</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">With Alerts</div>
            <div className="kpi-value">{derived.counters.withAlert}</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Instances</div>
            <div className="kpi-value">{service?.instances?.count ?? "-"}</div>
          </article>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.values(connectivity?.servers || []) || []).map((server) => (
            <span className={statusClass(server.reachable ? "ok" : "err")} key={server.server}>
              {server.server} · {server.reachable ? "up" : "down"} · {server.latency_ms ?? "-"}ms
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className={statusClass(service?.instances?.single_instance ? "ok" : "warn")}>
            <Server className="h-3.5 w-3.5" />
            listeners on :{service?.port ?? 8787} · {service?.instances?.count ?? "-"}
          </div>
          {service?.instances?.warning ? (
            <div className={statusClass("warn")}>
              <Zap className="h-3.5 w-3.5" />
              {service.instances.warning}
            </div>
          ) : null}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-2 text-xs opacity-80">
            {service?.instances?.cleanup_hint ||
              "Keep one app instance per port. Use Setup controls or ./bin/status-ui.sh to verify."}
          </div>
        </div>
      </Collapsible>

      <Collapsible
        title="First-Run Wizard"
        icon={ListChecks}
        open={sectionsOpen.overviewWizard}
        onToggle={() => toggleSection("overviewWizard")}
      >
        <p className="mb-3 text-sm opacity-80">
          {onboarding?.complete
            ? "Onboarding complete. You can operate in normal mode."
            : "Finish these once for a safe baseline."}
        </p>
        <div className="space-y-2">
          {(onboarding?.steps || []).map((step) => {
            const complete = step.state === "ok";
            return (
              <article className="row-card" key={step.id}>
                <div className="min-w-0">
                  <div className="font-semibold">{step.label}</div>
                  <div className="text-sm opacity-75">{step.detail}</div>
                </div>
                {complete ? (
                  <span className={statusClass("ok")}>
                    <Check className="h-3.5 w-3.5" /> Done
                  </span>
                ) : (
                  <button className="btn btn-ghost text-xs" onClick={() => wizardAction(step.id)} type="button">
                    <Play className="h-3.5 w-3.5" /> Run
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </Collapsible>
    </div>
  );

  const renderJobs = () => (
    <Collapsible title="Jobs" icon={Activity} open={sectionsOpen.jobs} onToggle={() => toggleSection("jobs")}>
      <div className="space-y-3">
        {jobs.length === 0 ? <p className="opacity-70">No jobs yet. Create one in Builder.</p> : null}
        {jobs.map((job) => {
          const cfg = job.config;
          const rt = job.runtime;
          const lastRun = job.last_run || null;
          const progress = Math.max(0, Math.min(100, Number(rt.progress_percent || 0)));
          const runDry = Number(lastRun?.dry_run || 0) === 1 || rt.last_run_type === "dry-run";
          const transferred = Number(lastRun?.transferred_files ?? rt.last_run_stats?.transferred_files ?? 0);
          const deleted = Number(lastRun?.deleted_files ?? rt.last_run_stats?.deleted_files ?? 0);
          const sent = Number(lastRun?.sent_bytes ?? rt.last_run_stats?.sent_bytes ?? 0);
          const received = Number(lastRun?.received_bytes ?? rt.last_run_stats?.received_bytes ?? 0);
          const lastExitCode = lastRun?.exit_code ?? rt.last_exit_code;
          const lastDuration = formatRunDuration(lastRun?.started_at, lastRun?.finished_at);
          const statusTone =
            rt.status === "failed" ? "err" : rt.status === "running" ? "ok" : rt.status === "completed" ? "ok" : "warn";
          return (
            <article className="job-card" key={cfg.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold md:text-base">{cfg.name}</h4>
                  <div className="text-xs opacity-70">{cfg.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={statusClass(rt.last_error ? "warn" : "ok")}>{progress.toFixed(1)}%</span>
                  <span className={statusClass(statusTone)}>
                    {String(rt.status || "idle").replaceAll("_", " ")}
                  </span>
                </div>
              </div>

              <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-xs">
                <div className="mb-2 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <div>
                    <div className="field-label">Remote source</div>
                    <div className="mono">{cfg.server}:{shortPath(cfg.remote_path, 44)}</div>
                  </div>
                  <div className="text-center text-sm opacity-70">→ one-way →</div>
                  <div>
                    <div className="field-label">Local destination</div>
                    <div className="mono">{shortPath(cfg.local_path, 44)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={statusClass("ok")}>
                    {runDry ? "last mode dry-run" : "last mode live"}
                  </span>
                  <span className={statusClass(lastExitCode === 0 ? "ok" : "warn")}>
                    exit {lastExitCode ?? "-"}
                  </span>
                  <span className={statusClass("neutral")}>duration {lastDuration}</span>
                  <span className={statusClass("neutral")}>transferred {transferred}</span>
                  <span className={statusClass("neutral")}>deleted {deleted}</span>
                  <span className={statusClass("neutral")}>sent {formatBytes(sent)}</span>
                  <span className={statusClass("neutral")}>recv {formatBytes(received)}</span>
                  <span className={statusClass(cfg.mode === "mirror" ? "warn" : "ok")}>mode {cfg.mode}</span>
                  {cfg.dry_run ? <span className={statusClass("warn")}>default dry-run enabled</span> : null}
                </div>
                <div className="mt-2">
                  retries <b>{rt.retries}</b> · auto-retry <b>{cfg.auto_retry ? "on" : "off"}</b>
                </div>
                <div className="mt-1">
                  started {formatDate(rt.last_started_at)} ({formatRelative(rt.last_started_at)}) · finished{" "}
                  {formatDate(rt.last_finished_at)} ({formatRelative(rt.last_finished_at)})
                </div>
                <div className="mt-1">
                  next retry {rt.next_retry_at ? `${formatDate(rt.next_retry_at)} (${formatRelative(rt.next_retry_at)})` : "n/a"} · pid{" "}
                  {rt.pid ?? "-"}
                </div>
                <div className="mt-1">
                  last error {rt.last_error ? <span className="text-[var(--bad)]">{rt.last_error}</span> : "none"}
                </div>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/20">
                <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-xs opacity-70">{rt.last_run_summary || rt.progress_line || "No progress output yet."}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn" disabled={busyMap[`job-start-live-${cfg.id}`]} onClick={() => runJobAction("start-live", cfg.id)} type="button">
                  <Play className="h-3.5 w-3.5" /> Run Live
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("dry-run", cfg.id)} type="button">
                  <TestTubeDiagonal className="h-3.5 w-3.5" /> Run Dry-Run
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("pause", cfg.id)} type="button">
                  <CirclePause className="h-3.5 w-3.5" /> Pause
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("resume", cfg.id)} type="button">
                  <CirclePlay className="h-3.5 w-3.5" /> Resume
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("cancel", cfg.id)} type="button">
                  <CircleSlash2 className="h-3.5 w-3.5" /> Cancel
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("test-connection", cfg.id)} type="button">
                  <Network className="h-3.5 w-3.5" /> Test SSH
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("preview-deletes", cfg.id)} type="button">
                  <Eye className="h-3.5 w-3.5" /> Preview Deletes
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("log", cfg.id)} type="button">
                  <Logs className="h-3.5 w-3.5" /> Logs
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("clone", cfg.id)} type="button">
                  <Copy className="h-3.5 w-3.5" /> Clone
                </button>
                <button className="btn btn-ghost" onClick={() => runJobAction("edit", cfg.id)} type="button">
                  <Wrench className="h-3.5 w-3.5" /> Edit
                </button>
                <button className="btn btn-danger" onClick={() => runJobAction("delete", cfg.id)} type="button">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </Collapsible>
  );

  const renderLocations = () => (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Collapsible
          title="Remote Sources"
          icon={UploadCloud}
          open={sectionsOpen.locationsRemote}
          onToggle={() => toggleSection("locationsRemote")}
        >
          <form className="space-y-2" onSubmit={saveRemote}>
            <input
              className="input"
              onChange={(event) => setRemoteDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Name"
              value={remoteDraft.name}
            />
            <input
              className="input"
              onChange={(event) => setRemoteDraft((prev) => ({ ...prev, server: event.target.value }))}
              placeholder="user@host"
              value={remoteDraft.server}
            />
            <input
              className="input"
              onChange={(event) => setRemoteDraft((prev) => ({ ...prev, remote_path: event.target.value }))}
              placeholder="/remote/path"
              value={remoteDraft.remote_path}
            />
            <input
              className="input"
              onChange={(event) => setRemoteDraft((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Notes (optional)"
              value={remoteDraft.notes}
            />
            <div className="flex gap-2">
              <button className="btn" disabled={busyMap["save-remote"]} type="submit">
                <Plus className="h-3.5 w-3.5" /> Save Remote
              </button>
              <button className="btn btn-ghost" onClick={() => setRemoteDraft({ id: "", name: "", server: "", remote_path: "", notes: "" })} type="button">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-2">
            {(locations.remote_locations || []).map((item) => (
              <article className="location-card" key={item.id}>
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-sm font-semibold">{item.name}</div>
                  <div className="text-xs opacity-75">Remote source</div>
                  <div className="mono break-all text-xs opacity-85">
                    {item.server}:{item.remote_path}
                  </div>
                </div>
                <div className="location-actions">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => {
                      setJobForm((prev) => ({ ...prev, server: item.server, remote_path: item.remote_path, name: prev.name || item.name }));
                      setView("builder");
                    }}
                    type="button"
                  >
                    <Wrench className="h-3.5 w-3.5" /> Use
                  </button>
                  <button className="btn btn-ghost text-xs" onClick={() => setRemoteDraft(item)} type="button">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button className="btn btn-ghost text-xs" onClick={() => cloneLocation("remote", item)} type="button">
                    <Copy className="h-3.5 w-3.5" /> Clone
                  </button>
                  <button className="btn btn-danger text-xs" onClick={() => deleteLocation("remote", item.id)} type="button">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Collapsible>

        <Collapsible
          title="Local Destinations"
          icon={Download}
          open={sectionsOpen.locationsLocal}
          onToggle={() => toggleSection("locationsLocal")}
        >
          <form className="space-y-2" onSubmit={saveLocal}>
            <input
              className="input"
              onChange={(event) => setLocalDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Name"
              value={localDraft.name}
            />
            <input
              className="input"
              onChange={(event) => setLocalDraft((prev) => ({ ...prev, local_path: event.target.value }))}
              placeholder="/local/path"
              value={localDraft.local_path}
            />
            <input
              className="input"
              onChange={(event) => setLocalDraft((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Notes (optional)"
              value={localDraft.notes}
            />
            <div className="flex gap-2">
              <button className="btn" disabled={busyMap["save-local"]} type="submit">
                <Plus className="h-3.5 w-3.5" /> Save Local
              </button>
              <button className="btn btn-ghost" onClick={() => setLocalDraft({ id: "", name: "", local_path: "", notes: "" })} type="button">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-2">
            {(locations.local_locations || []).map((item) => (
              <article className="location-card" key={item.id}>
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-sm font-semibold">{item.name}</div>
                  <div className="text-xs opacity-75">Local destination</div>
                  <div className="mono break-all text-xs opacity-85">{item.local_path}</div>
                </div>
                <div className="location-actions">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => {
                      setJobForm((prev) => ({ ...prev, local_path: item.local_path, name: prev.name || item.name }));
                      setView("builder");
                    }}
                    type="button"
                  >
                    <Wrench className="h-3.5 w-3.5" /> Use
                  </button>
                  <button className="btn btn-ghost text-xs" onClick={() => setLocalDraft(item)} type="button">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button className="btn btn-ghost text-xs" onClick={() => cloneLocation("local", item)} type="button">
                    <Copy className="h-3.5 w-3.5" /> Clone
                  </button>
                  <button className="btn btn-danger text-xs" onClick={() => deleteLocation("local", item.id)} type="button">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Collapsible>
      </div>

      <Collapsible
        title="Compose Jobs From Sources and Destinations"
        icon={ArrowUpDown}
        open={sectionsOpen.locationsCompose}
        onToggle={() => toggleSection("locationsCompose")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="field-label">Remote Profiles (multi-select)</label>
            <select
              className="select h-40"
              multiple
              onChange={(event) =>
                setCompose((prev) => ({
                  ...prev,
                  remote_ids: Array.from(event.target.selectedOptions).map((item) => item.value),
                }))
              }
              value={compose.remote_ids}
            >
              {(locations.remote_locations || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.server}:{item.remote_path}
                </option>
              ))}
            </select>

            <label className="field-label">Local Profiles (multi-select)</label>
            <select
              className="select h-40"
              multiple
              onChange={(event) =>
                setCompose((prev) => ({
                  ...prev,
                  local_ids: Array.from(event.target.selectedOptions).map((item) => item.value),
                }))
              }
              value={compose.local_ids}
            >
              {(locations.local_locations || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.local_path}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="field-label">Pair Mode</label>
            <select
              className="select"
              onChange={(event) => setCompose((prev) => ({ ...prev, pair_mode: event.target.value }))}
              value={compose.pair_mode}
            >
              <option value="matrix">matrix (all x all)</option>
              <option value="zip">zip (1-to-1 by order)</option>
            </select>

            <label className="field-label">Name Template</label>
            <input
              className="input"
              onChange={(event) => setCompose((prev) => ({ ...prev, name_template: event.target.value }))}
              value={compose.name_template}
            />

            <label className="field-label">Default Sync Mode</label>
            <select
              className="select"
              onChange={(event) =>
                setCompose((prev) => ({ ...prev, defaults: { ...prev.defaults, mode: event.target.value } }))
              }
              value={compose.defaults.mode}
            >
              <option value="append">append (safe default)</option>
              <option value="mirror">mirror (deletes extra local files)</option>
            </select>

            <label className="check">
              <input
                checked={compose.defaults.dry_run}
                onChange={(event) =>
                  setCompose((prev) => ({ ...prev, defaults: { ...prev.defaults, dry_run: event.target.checked } }))
                }
                type="checkbox"
              />
              Dry run by default
            </label>
            <label className="check">
              <input
                checked={compose.defaults.auto_retry}
                onChange={(event) =>
                  setCompose((prev) => ({ ...prev, defaults: { ...prev.defaults, auto_retry: event.target.checked } }))
                }
                type="checkbox"
              />
              Auto-retry on network outages
            </label>
            <label className="check">
              <input
                checked={compose.defaults.mirror_confirmed}
                onChange={(event) =>
                  setCompose((prev) => ({
                    ...prev,
                    defaults: { ...prev.defaults, mirror_confirmed: event.target.checked },
                  }))
                }
                type="checkbox"
              />
              I understand mirror delete mode
            </label>

            <div className="flex flex-wrap gap-2">
              <button className="btn" disabled={busyMap["compose-preview"]} onClick={() => composeJobs(false)} type="button">
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
              <button className="btn" disabled={busyMap["compose-create"]} onClick={() => composeJobs(true)} type="button">
                <Plus className="h-3.5 w-3.5" /> Create Jobs
              </button>
            </div>
          </div>
        </div>
        <pre className="pre mt-3">{composeOutput}</pre>
      </Collapsible>
    </div>
  );

  const showAdvanced = editorMode !== "basic";
  const showExpert = editorMode === "expert";

  const renderBuilder = () => (
    <Collapsible title="Job Builder" icon={Wrench} open={sectionsOpen.builder} onToggle={() => toggleSection("builder")}>
      <form className="space-y-3" onSubmit={saveJob}>
        <div className="flex flex-wrap gap-2">
          {["basic", "advanced", "expert"].map((mode) => (
            <button
              className={`btn ${editorMode === mode ? "" : "btn-ghost"}`}
              key={mode}
              onClick={() => setEditorMode(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {showAdvanced ? (
            <label>
              <span className="field-label">Job ID (optional)</span>
              <input
                className="input"
                onChange={(event) => setJobForm((prev) => ({ ...prev, id: event.target.value }))}
                placeholder="auto-generated for new jobs"
                value={jobForm.id}
              />
            </label>
          ) : null}

          <label>
            <span className="field-label">Name</span>
            <input
              className="input"
              onChange={(event) => setJobForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              value={jobForm.name}
            />
          </label>

          <label>
            <span className="field-label">SSH server</span>
            <input
              className="input"
              onChange={(event) => setJobForm((prev) => ({ ...prev, server: event.target.value }))}
              placeholder="user@host"
              required
              value={jobForm.server}
            />
          </label>

          <label>
            <span className="field-label">Mode</span>
            <select
              className="select"
              onChange={(event) =>
                setJobForm((prev) => ({
                  ...prev,
                  mode: event.target.value,
                  mirror_confirmed: event.target.value === "mirror" ? prev.mirror_confirmed : false,
                }))
              }
              value={jobForm.mode}
            >
              <option value="append">append (add-only one-way remote to local)</option>
              <option value="mirror">mirror (remote to local and delete local extras)</option>
            </select>
          </label>

          <label>
            <span className="field-label">Remote path</span>
            <input
              className="input"
              onChange={(event) => setJobForm((prev) => ({ ...prev, remote_path: event.target.value }))}
              placeholder="/remote/path"
              required
              value={jobForm.remote_path}
            />
          </label>

          <label>
            <span className="field-label">Local path</span>
            <input
              className="input"
              onChange={(event) => setJobForm((prev) => ({ ...prev, local_path: event.target.value }))}
              placeholder="/absolute/local/path"
              required
              value={jobForm.local_path}
            />
          </label>

          {showAdvanced ? (
            <>
              <label>
                <span className="field-label">Timeout (seconds)</span>
                <input
                  className="input"
                  min="5"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, timeout_seconds: event.target.value }))}
                  type="number"
                  value={jobForm.timeout_seconds}
                />
              </label>
              <label>
                <span className="field-label">Connect timeout (seconds)</span>
                <input
                  className="input"
                  min="3"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, contimeout_seconds: event.target.value }))}
                  type="number"
                  value={jobForm.contimeout_seconds}
                />
              </label>
              <label>
                <span className="field-label">Retry initial (seconds)</span>
                <input
                  className="input"
                  min="1"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, retry_initial_seconds: event.target.value }))}
                  type="number"
                  value={jobForm.retry_initial_seconds}
                />
              </label>
              <label>
                <span className="field-label">Retry max (seconds)</span>
                <input
                  className="input"
                  min="5"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, retry_max_seconds: event.target.value }))}
                  type="number"
                  value={jobForm.retry_max_seconds}
                />
              </label>
              <label>
                <span className="field-label">Bandwidth limit (KB/s)</span>
                <input
                  className="input"
                  min="0"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, bwlimit_kbps: event.target.value }))}
                  type="number"
                  value={jobForm.bwlimit_kbps}
                />
              </label>
              <label>
                <span className="field-label">CPU priority (nice)</span>
                <input
                  className="input"
                  max="19"
                  min="-20"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, nice_level: event.target.value }))}
                  type="number"
                  value={jobForm.nice_level}
                />
              </label>
              <label>
                <span className="field-label">Allowed start hour (-1 off)</span>
                <input
                  className="input"
                  max="23"
                  min="-1"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, allowed_start_hour: event.target.value }))}
                  type="number"
                  value={jobForm.allowed_start_hour}
                />
              </label>
              <label>
                <span className="field-label">Allowed end hour (-1 off)</span>
                <input
                  className="input"
                  max="23"
                  min="-1"
                  onChange={(event) => setJobForm((prev) => ({ ...prev, allowed_end_hour: event.target.value }))}
                  type="number"
                  value={jobForm.allowed_end_hour}
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-xs">
          <div className="mb-1 font-semibold">Sync Flow</div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div>
              <div className="field-label">Remote source</div>
              <div className="mono">{jobForm.server || "user@host"}:{shortPath(jobForm.remote_path || "/remote/path", 44)}</div>
            </div>
            <div className="text-center text-sm opacity-70">→ one-way →</div>
            <div>
              <div className="field-label">Local destination</div>
              <div className="mono">{shortPath(jobForm.local_path || "/absolute/local/path", 44)}</div>
            </div>
          </div>
        </div>

        {showAdvanced ? (
          <label>
            <span className="field-label">Exclude patterns (one per line)</span>
            <textarea
              className="textarea"
              onChange={(event) => setJobForm((prev) => ({ ...prev, excludes_text: event.target.value }))}
              placeholder=".git&#10;.DS_Store"
              rows={4}
              value={jobForm.excludes_text}
            />
          </label>
        ) : null}

        {showExpert ? (
          <>
            <label>
              <span className="field-label">Extra rsync args (one per line)</span>
              <textarea
                className="textarea"
                onChange={(event) => setJobForm((prev) => ({ ...prev, extra_args_text: event.target.value }))}
                placeholder="--size-only"
                rows={4}
                value={jobForm.extra_args_text}
              />
            </label>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="field-label">Command preview</span>
                <button className="btn btn-ghost text-xs" onClick={previewCommand} type="button">
                  <Eye className="h-3.5 w-3.5" /> Build
                </button>
              </div>
              <pre className="pre">{commandPreview}</pre>
            </div>
          </>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2">
          <label className="check">
            <input
              checked={jobForm.dry_run}
              onChange={(event) => setJobForm((prev) => ({ ...prev, dry_run: event.target.checked }))}
              type="checkbox"
            />
            Default run mode is dry-run
          </label>
          <label className="check">
            <input
              checked={jobForm.auto_retry}
              onChange={(event) => setJobForm((prev) => ({ ...prev, auto_retry: event.target.checked }))}
              type="checkbox"
            />
            Auto-retry while network/ZTNA is unavailable
          </label>
          {jobForm.mode === "mirror" ? (
            <label className="check md:col-span-2">
              <input
                checked={jobForm.mirror_confirmed}
                onChange={(event) => setJobForm((prev) => ({ ...prev, mirror_confirmed: event.target.checked }))}
                type="checkbox"
              />
              I understand delete mode for mirror sync
            </label>
          ) : null}
        </div>
        <p className="text-xs opacity-75">
          Job actions in Jobs are explicit: <b>Run Live</b> applies changes, <b>Run Dry-Run</b> simulates only.
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={busyMap["save-job"]} type="submit">
            <Database className="h-3.5 w-3.5" /> Save Job
          </button>
          <button className="btn btn-ghost" onClick={() => setJobForm(EMPTY_FORM)} type="button">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </form>
    </Collapsible>
  );

  const renderLogs = () => (
    <div className="space-y-4">
      <Collapsible
        title="Job Logs and History"
        icon={Logs}
        open={sectionsOpen.logsJob}
        onToggle={() => toggleSection("logsJob")}
        right={
          <button className="btn btn-ghost text-xs" onClick={() => loadJobLogAndHistory().catch((e) => addToast(e.message, "err"))} type="button">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="field-label">Selected job</label>
          <select className="select max-w-[360px]" onChange={(event) => setSelectedJobId(event.target.value)} value={selectedJobId}>
            <option value="">Select...</option>
            {jobs.map((job) => (
              <option key={job.config.id} value={job.config.id}>
                {job.config.name} ({job.config.id})
              </option>
            ))}
          </select>
          <button className="btn btn-ghost text-xs" onClick={() => loadJobLogAndHistory().catch((e) => addToast(e.message, "err"))} type="button">
            <Logs className="h-3.5 w-3.5" /> Load Job Logs
          </button>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <pre className="pre h-80">{jobLog}</pre>
          <pre className="pre h-80">{jobHistoryText}</pre>
        </div>
        <div className="mt-3">
          <label className="field-label">Delete preview</label>
          <pre className="pre h-52">{deletePreview}</pre>
        </div>
      </Collapsible>

      <Collapsible
        title="Service Logs"
        icon={Server}
        open={sectionsOpen.logsService}
        onToggle={() => toggleSection("logsService")}
        right={
          <button className="btn btn-ghost text-xs" onClick={() => loadServiceLogs().catch((e) => addToast(e.message, "err"))} type="button">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      >
        <pre className="pre h-[28rem]">{serviceLogs || "(loading...)"}</pre>
      </Collapsible>
    </div>
  );

  const renderSetup = () => (
    <Collapsible
      title="Setup and Updates"
      icon={Settings2}
      open={sectionsOpen.setupActions}
      onToggle={() => toggleSection("setupActions")}
    >
      <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Setup Health</div>
          <div className="flex gap-2">
            <button className="btn btn-ghost text-xs" disabled={busyMap["setup-run-check"]} onClick={() => loadSetupHealth(true).catch((e) => addToast(e.message, "err"))} type="button">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Health
            </button>
            <button className="btn text-xs" disabled={busyMap["setup-run-check"]} onClick={runSetupCheck} type="button">
              {busyMap["setup-run-check"] ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Run Setup Check
            </button>
            <button
              className="btn btn-ghost text-xs"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(setupHealth?.report || "");
                  addToast("Setup report copied", "ok");
                } catch (error) {
                  addToast(error.message, "err");
                }
              }}
              type="button"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Report
            </button>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          {(setupHealth?.items || []).map((item) => (
            <span className={statusClass(item.state)} key={item.id}>
              {item.label} · {item.state}
            </span>
          ))}
        </div>
        <div className="text-xs opacity-80">
          overall <b>{setupHealth?.overall || "-"}</b> · errors <b>{setupHealth?.errors ?? "-"}</b> · warnings <b>{setupHealth?.warnings ?? "-"}</b>
        </div>
        <pre className="pre mt-2 h-36">{setupHealth?.report || "Run setup check to generate a report."}</pre>
      </div>

      <div className="mb-3 space-y-3">
        {[
          ["first_time", "First-Time Setup"],
          ["maintenance", "Maintenance"],
          ["repair", "Repair"],
        ].map(([key, title]) => {
          const actions = (setup?.actions || []).filter((item) => item.category === key);
          if (!actions.length) return null;
          return (
            <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3" key={key}>
              <div className="mb-2 font-semibold">{title}</div>
              <div className="grid gap-2 md:grid-cols-2">
                {actions.map((action) => (
                  <article className="row-card" key={action.id}>
                    <div className="min-w-0">
                      <div className="font-semibold">{action.label}</div>
                      <div className="text-xs opacity-75">{action.description}</div>
                    </div>
                    <button className="btn btn-ghost text-xs" disabled={busyMap[`setup-${action.id}`]} onClick={() => runSetupAction(action.id)} type="button">
                      {busyMap[`setup-${action.id}`] ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      Run
                    </button>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm">
        <div className="mb-2 font-semibold">Update channel</div>
        <div className="mb-2 opacity-80">
          {updateInfo?.channel === "git"
            ? `Git branch ${updateInfo.branch || "main"} · local ${updateInfo.local_commit || "-"} · remote ${updateInfo.remote_commit || "-"}`
            : `Current v${updateInfo?.current_version || "-"} · latest v${updateInfo?.latest_version || "-"} `}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => checkUpdates(true, true).catch((e) => addToast(e.message, "err"))} type="button">
            <RefreshCw className="h-3.5 w-3.5" /> Check Updates
          </button>
          <button className="btn btn-ghost" onClick={() => runSetupAction("update_app")} type="button">
            <Download className="h-3.5 w-3.5" /> Update App
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm">
        <div className="mb-1 font-semibold">Last Action Result</div>
        <div className="mb-2 flex flex-wrap gap-2">
          <span className={statusClass(setupResult?.level || "neutral")}>{setupResult?.summary?.title || "No action run yet."}</span>
          {setupResult?.ran_at ? <span className={statusClass("neutral")}>{formatDate(setupResult.ran_at)}</span> : null}
        </div>
        <pre className="pre h-36">
{setupResult
  ? [
      ...(setupResult.summary?.bullets || []),
      "",
      setupResult.details?.output || setupResult.details?.report || "",
    ]
      .join("\n")
      .trim()
  : "Run a setup action to view structured output."}
        </pre>
      </div>
    </Collapsible>
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-[1700px] gap-4 p-4 md:p-6">
        <aside className={`${panelClass()} hidden w-[270px] shrink-0 flex-col gap-4 xl:flex`}>
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <h1 className="text-lg font-semibold tracking-tight">rsync.wa</h1>
            </div>
            <p className="mt-1 text-xs opacity-75">One-way remote to local sync control center</p>
          </div>

          <nav className="space-y-1">
            {VIEW_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`nav-btn ${view === item.key ? "active" : ""}`}
                  key={item.key}
                  onClick={() => setView(item.key)}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="space-y-2">
            <span className={statusClass(service ? "ok" : "warn")}>
              Service: {service ? `PID ${service.pid}` : "loading"}
            </span>
            <span className={statusClass(service?.instances?.single_instance ? "ok" : "warn")}>
              Instances: {service?.instances?.count ?? "-"} on :{service?.port ?? 8787}
            </span>
            <span className={statusClass(service?.service_pause ? "warn" : "ok")}>
              Auto-sync: {service?.service_pause ? "paused" : "active"}
            </span>
            <span className={statusClass(derived.connReachable === derived.connTotal ? "ok" : "warn")}>
              Connectivity: {derived.connReachable}/{derived.connTotal}
            </span>
            <span className={statusClass(updateStatusPill.level)}>{updateStatusPill.text}</span>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <section className={panelClass()}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Rsync Ops Console</h2>
                  <p className="text-sm opacity-80">High-signal dashboard for resilient sync with pause/retry behavior.</p>
                  <div className="mt-1 text-xs opacity-70">URL: http://rsync.localhost:8787</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn" onClick={() => refreshAll().catch((e) => addToast(e.message, "err"))} type="button">
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={busyMap.pauseAuto}
                    onClick={() =>
                      runServiceAction(
                        service?.service_pause ? "/api/service/resume-auto" : "/api/service/pause-auto",
                        "pauseAuto",
                        service?.service_pause ? "Auto-sync resumed" : "Auto-sync paused"
                      )
                    }
                    type="button"
                  >
                    {service?.service_pause ? <CirclePlay className="h-3.5 w-3.5" /> : <CirclePause className="h-3.5 w-3.5" />}
                    {service?.service_pause ? "Resume Auto-Sync" : "Pause Auto-Sync"}
                  </button>
                  <button className="btn btn-ghost" onClick={copyDiagnostics} type="button">
                    <Copy className="h-3.5 w-3.5" /> Copy Diagnostics
                  </button>
                  <button className="btn btn-ghost" onClick={collapseAll} type="button">
                    <Bot className="h-3.5 w-3.5" /> Toggle Panels
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className="nav-chip xl:hidden" onClick={() => setView("overview")} type="button">
                  <LayoutDashboard className="h-3.5 w-3.5" /> Overview
                </button>
                <button className="nav-chip xl:hidden" onClick={() => setView("jobs")} type="button">
                  <Activity className="h-3.5 w-3.5" /> Jobs
                </button>
                <button className="nav-chip xl:hidden" onClick={() => setView("locations")} type="button">
                  <Compass className="h-3.5 w-3.5" /> Locations
                </button>
                <button className="nav-chip xl:hidden" onClick={() => setView("builder")} type="button">
                  <Wrench className="h-3.5 w-3.5" /> Builder
                </button>
                <button className="nav-chip xl:hidden" onClick={() => setView("logs")} type="button">
                  <Logs className="h-3.5 w-3.5" /> Logs
                </button>
                <button className="nav-chip xl:hidden" onClick={() => setView("setup")} type="button">
                  <Settings2 className="h-3.5 w-3.5" /> Setup
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <label className="field-label">Theme</label>
                  <select className="select w-32" onChange={(event) => setTheme(event.target.value)} value={theme}>
                    <option value="terminal">Terminal</option>
                    <option value="fancy">Fancy</option>
                  </select>
                  <button className="btn btn-ghost" onClick={() => setCompact(compact === "1" ? "0" : "1")} type="button">
                    <Paintbrush className="h-3.5 w-3.5" /> {compact === "1" ? "Expanded" : "Compact"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => runServiceAction("/api/service/restart", "restart", "Restart requested")} type="button">
                    <RefreshCw className="h-3.5 w-3.5" /> Restart
                  </button>
                  <button className="btn btn-danger" onClick={() => runServiceAction("/api/service/stop", "stop", "Stop requested")} type="button">
                    <CircleSlash2 className="h-3.5 w-3.5" /> Stop App
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className={statusClass(service ? "ok" : "warn")}>
                  <Cpu className="h-3.5 w-3.5" /> service {service ? `${service.uptime_seconds}s uptime` : "loading"}
                </span>
                <span className={statusClass(service?.instances?.single_instance ? "ok" : "warn")}>
                  <Server className="h-3.5 w-3.5" /> instances {service?.instances?.count ?? "-"} on :{service?.port ?? 8787}
                </span>
                <span className={statusClass(service?.service_pause ? "warn" : "ok")}>
                  <HardDrive className="h-3.5 w-3.5" /> {service?.service_pause ? "auto-sync paused" : "auto-sync running"}
                </span>
                <span className={statusClass(derived.connReachable === derived.connTotal ? "ok" : "warn")}>
                  <Network className="h-3.5 w-3.5" /> network {derived.connReachable}/{derived.connTotal}
                </span>
                <span className={statusClass(updateStatusPill.level)}>
                  <Download className="h-3.5 w-3.5" /> {updateStatusPill.text}
                </span>
              </div>
            </div>
          </section>

          {view === "overview" ? renderOverview() : null}
          {view === "jobs" ? renderJobs() : null}
          {view === "locations" ? renderLocations() : null}
          {view === "builder" ? renderBuilder() : null}
          {view === "logs" ? renderLogs() : null}
          {view === "setup" ? renderSetup() : null}
        </main>
      </div>

      <div className="toast-wrap">
        {toasts.map((toast) => (
          <article className={`toast ${toast.level}`} key={toast.id}>
            {toast.message}
          </article>
        ))}
      </div>
    </div>
  );
}
