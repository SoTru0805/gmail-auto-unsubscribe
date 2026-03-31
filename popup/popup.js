/**
 * popup.js — Vanilla JS Dashboard (replaces React App.jsx)
 * No external dependencies, no CDN, no eval.
 */

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
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
  } catch { return dateStr; }
}

function initials(name) {
  return (name || "?").split(" ").slice(0, 2)
    .map(w => w[0]?.toUpperCase() || "").join("");
}

function avatarStyle(email) {
  const palettes = [
    ["#dbeafe","#2563eb"], ["#fce7f3","#be185d"], ["#dcfce7","#15803d"],
    ["#fef9c3","#a16207"], ["#f3e8ff","#7e22ce"], ["#ffedd5","#c2410c"],
    ["#e0f2fe","#0369a1"], ["#fee2e2","#b91c1c"],
  ];
  let hash = 0;
  for (const c of (email || "")) hash = (hash * 31 + c.charCodeAt(0)) % palettes.length;
  const [bg, fg] = palettes[Math.abs(hash) % palettes.length];
  return `background:${bg};color:${fg}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); }, 3000);
}

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  senders: [],
  loading: true,
  scanning: false,
  autoEnabled: true,
  lastScanned: null,
  authError: false,
  activeTab: "review",
};

// ─── Load Data ────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await sendMessage({ action: "GET_STORAGE" });
    if (!res?.success) throw new Error("Storage error");
    const { senders: raw = {}, lastScanned, autoUnsubscribeEnabled } = res.data;
    state.senders = Object.values(raw);
    state.lastScanned = lastScanned;
    state.autoEnabled = autoUnsubscribeEnabled !== false;
    state.authError = false;
  } catch (err) {
    console.error("Load error:", err);
  } finally {
    state.loading = false;
    render();
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────
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
      const sender = state.senders.find(s => s.email === email);
      if (sender?.unsubscribeLink) {
        await sendMessage({ action: "UNSUBSCRIBE", email, link: sender.unsubscribeLink });
        showToast(`Unsubscribed from ${sender.name || email}`, "success");
      } else {
        await sendMessage({ action: "UPDATE_SENDER", email, updates: { status: newStatus, unsubscribedAt: new Date().toISOString() } });
        showToast(`Marked as unsubscribed`, "info");
      }
    } else {
      await sendMessage({ action: "UPDATE_SENDER", email, updates: { status: newStatus } });
      const labels = { keep: "Kept ✓", block: "Blocked", resubscribe: "Moved to Review", unblock: "Unblocked" };
      showToast(labels[action] || "Updated", "success");
    }
    await loadData();
  } catch (err) {
    showToast("Action failed. Try again.", "error");
  }
}

async function handleUnsubscribeAll() {
  const pending = state.senders.filter(s => s.status === "pending" && s.unsubscribeLink);
  if (!pending.length) { showToast("No unsubscribable senders found", "info"); return; }
  showToast(`Unsubscribing ${pending.length} senders…`, "info");
  for (const s of pending) {
    await handleAction(s.email, "unsubscribe");
  }
  showToast("All done!", "success");
}

async function handleScan() {
  state.scanning = true;
  updateScanBtn();
  showToast("Scanning inbox…", "info");
  try {
    await sendMessage({ action: "GET_AUTH_TOKEN", interactive: true });
    await sendMessage({ action: "SCAN_NOW" });
    await loadData();
    showToast("Scan complete!", "success");
  } catch (err) {
    state.authError = err.message?.toLowerCase().includes("oauth") ||
                      err.message?.toLowerCase().includes("auth") ||
                      err.message?.toLowerCase().includes("token");
    showToast("Scan failed. Check permissions.", "error");
    render();
  } finally {
    state.scanning = false;
    updateScanBtn();
  }
}

async function toggleAuto() {
  state.autoEnabled = !state.autoEnabled;
  await chrome.storage.local.set({ autoUnsubscribeEnabled: state.autoEnabled });
  const toggle = document.getElementById("auto-toggle");
  toggle.classList.toggle("on", state.autoEnabled);
}

// ─── Render Helpers ───────────────────────────────────────────────────────────
function updateScanBtn() {
  const btn = document.getElementById("scan-btn");
  if (!btn) return;
  btn.disabled = state.scanning;
  btn.innerHTML = state.scanning
    ? `<svg class="spin-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Scanning…`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg> Scan Now`;

  // Add spinner style dynamically
  const existing = document.getElementById("spin-style");
  if (!existing) {
    const s = document.createElement("style");
    s.id = "spin-style";
    s.textContent = "@keyframes spin2{to{transform:rotate(360deg)}} .spin-icon{animation:spin2 0.7s linear infinite}";
    document.head.appendChild(s);
  }
}

function renderSenderRow(s, actions) {
  const av = `<div class="avatar" style="${avatarStyle(s.email)}">${escapeHtml(initials(s.name))}</div>`;

  const badge = s.classification === "auto" && s.status === "pending"
    ? `<span class="badge badge-auto">High volume</span>` : "";
  const statusBadge = s.status === "unsubscribed"
    ? `<span class="badge badge-unsubscribed">Unsubscribed</span>`
    : s.status === "blocked"
    ? `<span class="badge badge-blocked">Blocked</span>` : "";

  const info = `
    <div class="sender-info">
      <div class="sender-name">${escapeHtml(s.name || s.email)} ${badge}</div>
      <div class="sender-email">${escapeHtml(s.email)}</div>
      <div class="sender-meta">
        ${s.emailCount ? `<span>${s.emailCount} emails</span>` : ""}
        ${s.lastReceived ? `<span>Last: ${formatDate(s.lastReceived)}</span>` : ""}
        ${s.unsubscribedAt ? `<span>Unsubscribed ${formatDate(s.unsubscribedAt)}</span>` : ""}
      </div>
    </div>`;

  let btns = `<div class="actions">${statusBadge}`;
  if (actions.includes("unsub")) {
    btns += `<button class="btn-action btn-unsub" data-action="unsubscribe" data-email="${escapeHtml(s.email)}" ${!s.unsubscribeLink ? "disabled title='No unsubscribe link found'" : ""}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>Unsub</button>`;
  }
  if (actions.includes("keep")) {
    btns += `<button class="btn-action btn-keep" data-action="keep" data-email="${escapeHtml(s.email)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>Keep</button>`;
  }
  if (actions.includes("block")) {
    btns += `<button class="btn-action btn-block" data-action="block" data-email="${escapeHtml(s.email)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>`;
  }
  if (actions.includes("undo")) {
    btns += `<button class="btn-action btn-undo" data-action="resubscribe" data-email="${escapeHtml(s.email)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7v6h6"/><path d="M3 13c1.8-4.9 6.3-8 11-8 4.9 0 9 3.3 10 8"/></svg>Undo</button>`;
  }
  if (actions.includes("unblock")) {
    btns += `<button class="btn-action btn-undo" data-action="unblock" data-email="${escapeHtml(s.email)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7v6h6"/><path d="M3 13c1.8-4.9 6.3-8 11-8 4.9 0 9 3.3 10 8"/></svg>Unblock</button>`;
  }
  btns += `</div>`;

  return `<div class="sender-row fade-in">${av}${info}${btns}</div>`;
}

// ─── Main Render ──────────────────────────────────────────────────────────────
function render() {
  // Last scanned
  const subEl = document.getElementById("last-scanned");
  if (subEl) subEl.textContent = state.lastScanned
    ? `Last scanned ${formatDate(state.lastScanned)}` : "Not yet scanned";

  // Auto toggle
  const toggle = document.getElementById("auto-toggle");
  if (toggle) toggle.classList.toggle("on", state.autoEnabled);

  // Auth banner
  const banner = document.getElementById("auth-banner");
  if (banner) banner.classList.toggle("show", state.authError);

  // Filter senders
  const pending       = state.senders.filter(s => s.status === "pending");
  const unsubscribed  = state.senders.filter(s => s.status === "unsubscribed");
  const blocked       = state.senders.filter(s => s.status === "blocked");

  // Badges
  document.getElementById("badge-review").textContent       = pending.length;
  document.getElementById("badge-unsubscribed").textContent = unsubscribed.length;
  document.getElementById("badge-blocked").textContent      = blocked.length;

  // ── Review Queue ──
  const reviewContent = document.getElementById("review-content");
  if (state.loading) {
    reviewContent.innerHTML = `<div class="loading-wrap"><div class="spinner"></div></div>`;
  } else if (!pending.length) {
    reviewContent.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-title">Inbox is clean!</div><div class="empty-body">No newsletters found yet. Click Scan Now to detect newsletters from your recent emails.</div></div>`;
  } else {
    const rows = pending.map(s => renderSenderRow(s, ["unsub","keep","block"])).join("");
    reviewContent.innerHTML = `
      <div class="list-header">
        <span class="list-meta">${pending.length} newsletter${pending.length !== 1 ? "s" : ""} pending review</span>
        <button class="btn-unsub-all" id="unsub-all-btn">Unsubscribe All</button>
      </div>
      <div class="sender-list">${rows}</div>`;
    document.getElementById("unsub-all-btn")?.addEventListener("click", handleUnsubscribeAll);
  }

  // ── Unsubscribed ──
  const unsubContent = document.getElementById("unsubscribed-content");
  if (!unsubscribed.length) {
    unsubContent.innerHTML = `<div class="empty-state"><div class="empty-icon">✉️</div><div class="empty-title">Nothing auto-unsubscribed yet</div><div class="empty-body">High-volume newsletters (5+ emails) are automatically unsubscribed when Auto mode is enabled.</div></div>`;
  } else {
    const rows = unsubscribed.map(s => renderSenderRow(s, ["undo"])).join("");
    unsubContent.innerHTML = `
      <div class="list-header"><span class="list-meta">${unsubscribed.length} sender${unsubscribed.length !== 1 ? "s" : ""} unsubscribed</span></div>
      <div class="sender-list">${rows}</div>`;
  }

  // ── Blocked ──
  const blockedContent = document.getElementById("blocked-content");
  if (!blocked.length) {
    blockedContent.innerHTML = `<div class="empty-state"><div class="empty-icon">🛡️</div><div class="empty-title">No blocked senders</div><div class="empty-body">Blocked senders are automatically moved to trash when you receive emails from them.</div></div>`;
  } else {
    const rows = blocked.map(s => renderSenderRow(s, ["unblock"])).join("");
    blockedContent.innerHTML = `
      <div class="list-header"><span class="list-meta">${blocked.length} sender${blocked.length !== 1 ? "s" : ""} blocked</span></div>
      <div class="sender-list">${rows}</div>`;
  }

  // Re-attach action button listeners
  document.querySelectorAll(".btn-action").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const email  = btn.dataset.email;
      if (action && email) handleAction(email, action);
    });
  });
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`)?.classList.add("active");
    state.activeTab = btn.dataset.tab;
  });
});

// ─── Scan Button ──────────────────────────────────────────────────────────────
document.getElementById("scan-btn").addEventListener("click", handleScan);

// ─── Auto Toggle ─────────────────────────────────────────────────────────────
document.getElementById("auto-toggle").addEventListener("click", toggleAuto);

// ─── Init ─────────────────────────────────────────────────────────────────────
loadData();