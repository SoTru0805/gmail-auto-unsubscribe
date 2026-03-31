/**
 * App.jsx — Gmail Auto-Unsubscribe Popup Dashboard
 * React + Tailwind CSS (loaded via CDN in index.html)
 */

const { useState, useEffect, useCallback } = React;

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icon = {
  Mail: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  ),
  Ban: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  ),
  Undo: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6"/><path d="M3 13c1.8-4.9 6.3-8 11-8 4.9 0 9 3.3 10 8"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
    </svg>
  ),
  Spinner: () => (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  Shield: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Inbox: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  ),
  Auto: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Toggle: ({ on }) => (
    <svg width="36" height="20" viewBox="0 0 36 20" style={{ cursor: 'pointer' }}>
      <rect x="0" y="0" width="36" height="20" rx="10" fill={on ? '#6366f1' : '#cbd5e1'}/>
      <circle cx={on ? "26" : "10"} cy="10" r="8" fill="white" style={{ transition: 'cx 0.2s' }}/>
    </svg>
  ),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function avatarColor(email) {
  const colors = [
    ["#dbeafe", "#2563eb"], ["#fce7f3", "#be185d"], ["#dcfce7", "#15803d"],
    ["#fef9c3", "#a16207"], ["#f3e8ff", "#7e22ce"], ["#ffedd5", "#c2410c"],
    ["#e0f2fe", "#0369a1"], ["#fee2e2", "#b91c1c"],
  ];
  let hash = 0;
  for (const c of (email || "")) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[Math.abs(hash) % colors.length];
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, email }) {
  const [bg, fg] = avatarColor(email);
  return (
    <div style={{ background: bg, color: fg, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
      {initials(name)}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, body }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center animate-fade-in">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-semibold text-slate-700 mb-1">{title}</p>
      <p className="text-sm text-slate-400 max-w-xs">{body}</p>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, color }) {
  const styles = {
    auto: "bg-indigo-50 text-indigo-600",
    review: "bg-amber-50 text-amber-600",
    unsubscribed: "bg-emerald-50 text-emerald-600",
    blocked: "bg-red-50 text-red-600",
    kept: "bg-slate-100 text-slate-500",
    pending: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[color] || styles.pending}`}>
      {label}
    </span>
  );
}

// ─── Review Queue Tab ─────────────────────────────────────────────────────────
function ReviewQueue({ senders, onAction, loading }) {
  const pending = senders.filter((s) => s.status === "pending");

  async function handleUnsubscribeAll() {
    for (const s of pending) {
      if (s.unsubscribeLink) await onAction(s.email, "unsubscribe");
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-indigo-500"><Icon.Spinner /></div>
    </div>
  );

  if (pending.length === 0) return (
    <EmptyState icon="🎉" title="Inbox is clean!" body="No newsletters found yet. Click Scan Now to detect newsletters from your recent emails." />
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs text-slate-500 font-medium">{pending.length} newsletter{pending.length !== 1 ? "s" : ""} pending review</span>
        <button
          onClick={handleUnsubscribeAll}
          className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-md transition-colors"
        >
          Unsubscribe All
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {pending.map((s, i) => (
          <div key={s.email} className="row-hover flex items-center gap-3 px-4 py-3 animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
            <Avatar name={s.name} email={s.email} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 text-sm truncate">{s.name}</span>
                {s.classification === "auto" && <Badge label="High volume" color="auto" />}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400 truncate font-mono">{s.email}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-slate-400">{s.emailCount} emails</span>
                <span className="text-slate-200">·</span>
                <span className="text-xs text-slate-400">Last: {formatDate(s.lastReceived)}</span>
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onAction(s.email, "unsubscribe")}
                disabled={!s.unsubscribeLink}
                title={s.unsubscribeLink ? "Unsubscribe" : "No unsubscribe link found"}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon.X /> Unsub
              </button>
              <button
                onClick={() => onAction(s.email, "keep")}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <Icon.Check /> Keep
              </button>
              <button
                onClick={() => onAction(s.email, "block")}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-red-100 text-red-500 hover:bg-red-50 transition-colors"
              >
                <Icon.Ban />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Auto-Unsubscribed Tab ────────────────────────────────────────────────────
function AutoUnsubscribed({ senders, onAction }) {
  const unsubscribed = senders.filter((s) => s.status === "unsubscribed");

  if (unsubscribed.length === 0) return (
    <EmptyState icon="✉️" title="Nothing auto-unsubscribed yet" body="High-volume newsletters (5+ emails, no replies) are automatically unsubscribed when Auto mode is enabled." />
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs text-slate-500 font-medium">{unsubscribed.length} sender{unsubscribed.length !== 1 ? "s" : ""} unsubscribed</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {unsubscribed.map((s, i) => (
          <div key={s.email} className="row-hover flex items-center gap-3 px-4 py-3 animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
            <Avatar name={s.name} email={s.email} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm truncate">{s.name}</div>
              <div className="text-xs text-slate-400 font-mono truncate mt-0.5">{s.email}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Unsubscribed {formatDate(s.unsubscribedAt)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge label="Unsubscribed" color="unsubscribed" />
              <button
                onClick={() => onAction(s.email, "resubscribe")}
                title="Undo unsubscribe"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <Icon.Undo /> Undo
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Blocked Senders Tab ──────────────────────────────────────────────────────
function BlockedSenders({ senders, onAction }) {
  const blocked = senders.filter((s) => s.status === "blocked");

  if (blocked.length === 0) return (
    <EmptyState icon="🛡️" title="No blocked senders" body="Blocked senders are automatically moved to trash when you receive emails from them." />
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs text-slate-500 font-medium">{blocked.length} sender{blocked.length !== 1 ? "s" : ""} blocked</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {blocked.map((s, i) => (
          <div key={s.email} className="row-hover flex items-center gap-3 px-4 py-3 animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
            <Avatar name={s.name} email={s.email} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 text-sm truncate">{s.name}</div>
              <div className="text-xs text-slate-400 font-mono truncate mt-0.5">{s.email}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge label="Blocked" color="blocked" />
              <button
                onClick={() => onAction(s.email, "unblock")}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <Icon.Undo /> Unblock
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState("review");
  const [senders, setSenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [toast, setToast] = useState(null);

  // ── Load storage ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const res = await sendMessage({ action: "GET_STORAGE" });
      if (!res.success) throw new Error("Storage error");
      const { senders: raw = {}, lastScanned: ls, autoUnsubscribeEnabled } = res.data;
      setSenders(Object.values(raw));
      setLastScanned(ls);
      setAutoEnabled(autoUnsubscribeEnabled !== false);
      setAuthError(false);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Scan ──────────────────────────────────────────────────────────────────
  async function handleScan() {
    setScanning(true);
    showToast("Scanning your inbox...", "info");
    try {
      // First try to get auth (interactive)
      await sendMessage({ action: "GET_AUTH_TOKEN", interactive: true });
      await sendMessage({ action: "SCAN_NOW" });
      await loadData();
      showToast("Scan complete!", "success");
    } catch (err) {
      if (err.message?.includes("auth") || err.message?.includes("token")) {
        setAuthError(true);
      }
      showToast("Scan failed. Check permissions.", "error");
    } finally {
      setScanning(false);
    }
  }

  // ── Toggle auto ───────────────────────────────────────────────────────────
  async function toggleAuto() {
    const newVal = !autoEnabled;
    setAutoEnabled(newVal);
    await chrome.storage.local.set({ autoUnsubscribeEnabled: newVal });
  }

  // ── Sender actions ────────────────────────────────────────────────────────
  async function handleAction(email, action) {
    const statusMap = {
      unsubscribe: "unsubscribed",
      keep: "kept",
      block: "blocked",
      resubscribe: "pending",
      unblock: "pending",
    };

    const newStatus = statusMap[action];
    if (!newStatus) return;

    try {
      if (action === "unsubscribe") {
        const sender = senders.find((s) => s.email === email);
        if (sender?.unsubscribeLink) {
          await sendMessage({ action: "UNSUBSCRIBE", email, link: sender.unsubscribeLink });
          showToast(`Unsubscribed from ${sender.name || email}`, "success");
        } else {
          await sendMessage({ action: "UPDATE_SENDER", email, updates: { status: newStatus, unsubscribedAt: new Date().toISOString() } });
          showToast(`Marked ${email} as unsubscribed`, "info");
        }
      } else {
        await sendMessage({ action: "UPDATE_SENDER", email, updates: { status: newStatus } });
        const labels = { keep: "Kept", block: "Blocked", resubscribe: "Re-added to review", unblock: "Unblocked" };
        showToast(labels[action] || "Updated", "success");
      }

      await loadData();
    } catch (err) {
      showToast("Action failed. Please try again.", "error");
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const counts = {
    pending: senders.filter((s) => s.status === "pending").length,
    unsubscribed: senders.filter((s) => s.status === "unsubscribed").length,
    blocked: senders.filter((s) => s.status === "blocked").length,
  };

  const tabs = [
    { id: "review", label: "Review Queue", icon: Icon.Inbox, count: counts.pending },
    { id: "unsubscribed", label: "Auto-Unsubscribed", icon: Icon.Auto, count: counts.unsubscribed },
    { id: "blocked", label: "Blocked", icon: Icon.Shield, count: counts.blocked },
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
            <Icon.Mail />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 leading-tight">Auto-Unsubscribe</h1>
            <p className="text-[10px] text-slate-400">
              {lastScanned ? `Last scanned ${formatDate(lastScanned)}` : "Not yet scanned"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto toggle */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Auto</span>
            <div onClick={toggleAuto} style={{ cursor: 'pointer' }}>
              <Icon.Toggle on={autoEnabled} />
            </div>
          </div>

          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? <Icon.Spinner /> : <Icon.Refresh />}
            {scanning ? "Scanning…" : "Scan Now"}
          </button>
        </div>
      </div>

      {/* ── Auth Error Banner ── */}
      {authError && (
        <div className="mx-4 mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
          <span>⚠️</span>
          <span>Sign in required. Click Scan Now to authenticate with Google.</span>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-100 px-4">
        {tabs.map(({ id, label, icon: TabIcon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 text-xs font-semibold py-3 px-2 mr-3 transition-colors ${tab === id ? "tab-active" : "tab-inactive"}`}
          >
            <TabIcon />
            {label}
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-hidden">
        {tab === "review" && <ReviewQueue senders={senders} onAction={handleAction} loading={loading} />}
        {tab === "unsubscribed" && <AutoUnsubscribed senders={senders} onAction={handleAction} />}
        {tab === "blocked" && <BlockedSenders senders={senders} onAction={handleAction} />}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white text-xs font-semibold shadow-lg animate-fade-in z-50 ${
            toast.type === "error" ? "bg-red-500" : toast.type === "info" ? "bg-slate-700" : "bg-emerald-500"
          }`}
          style={{ whiteSpace: "nowrap" }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
