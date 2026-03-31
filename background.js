/**
 * background.js — Service Worker
 * Handles Gmail API calls, periodic scanning, and auto-unsubscribe logic.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_THRESHOLD = 5; // emails from same sender to qualify for auto-unsubscribe
const SCAN_BATCH_SIZE = 100; // how many recent emails to scan

// ─── Initialization ───────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[AutoUnsub] Extension installed. Starting initial scan...");
  await initStorage();
  await performScan();
});

// Set up periodic scanning alarm
chrome.alarms.create("periodicScan", { periodInMinutes: 1440 }); // every 24 hours

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicScan") {
    console.log("[AutoUnsub] Periodic scan triggered.");
    await performScan();
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case "GET_AUTH_TOKEN":
          const token = await getAuthToken(message.interactive);
          sendResponse({ success: true, token });
          break;

        case "SCAN_NOW":
          await performScan();
          sendResponse({ success: true });
          break;

        case "UNSUBSCRIBE":
          const result = await unsubscribeSender(message.email, message.link);
          sendResponse({ success: true, result });
          break;

        case "UPDATE_SENDER":
          await updateSenderStatus(message.email, message.updates);
          sendResponse({ success: true });
          break;

        case "GET_STORAGE":
          const data = await getStorage();
          sendResponse({ success: true, data });
          break;

        case "CHECK_EMAIL_NEWSLETTER":
          const check = await checkIfNewsletter(message.emailId);
          sendResponse({ success: true, ...check });
          break;

        default:
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (err) {
      console.error("[AutoUnsub] Message handler error:", err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true; // keep message channel open for async response
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
async function initStorage() {
  const existing = await chrome.storage.local.get(null);
  const defaults = {
    senders: {},
    lastScanned: null,
    autoUnsubscribeEnabled: true,
    scanHistory: [],
  };
  const toSet = {};
  for (const [key, val] of Object.entries(defaults)) {
    if (!(key in existing)) toSet[key] = val;
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
}

async function getStorage() {
  return chrome.storage.local.get(null);
}

async function updateSenderStatus(email, updates) {
  const { senders = {} } = await chrome.storage.local.get("senders");
  senders[email] = { ...(senders[email] || {}), ...updates };
  await chrome.storage.local.set({ senders });
}

// ─── Gmail API Helpers ────────────────────────────────────────────────────────

/**
 * Make an authenticated Gmail API request with exponential backoff on 429/5xx.
 */
async function gmailRequest(path, options = {}, retries = 3) {
  const token = await getAuthToken(false);
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${GMAIL_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (res.ok) return res.json();

    if ((res.status === 429 || res.status >= 500) && attempt < retries - 1) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[AutoUnsub] Rate limited (${res.status}). Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    throw new Error(`Gmail API error ${res.status}: ${await res.text()}`);
  }
}

/**
 * Fetch list of message IDs from inbox.
 */
async function listMessages(maxResults = SCAN_BATCH_SIZE) {
  const data = await gmailRequest(
    `/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`
  );
  return data.messages || [];
}

/**
 * Fetch full message details including headers.
 */
async function getMessage(messageId) {
  return gmailRequest(`/users/me/messages/${messageId}?format=full`);
}

/**
 * Extract a specific header value from a message.
 */
function getHeader(message, name) {
  const headers = message.payload?.headers || [];
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || null;
}

/**
 * Decode base64url encoded email body.
 */
function decodeBody(data) {
  if (!data) return "";
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

/**
 * Recursively extract text from MIME parts.
 */
function extractBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) return decodeBody(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" || part.mimeType === "text/plain") {
        const body = extractBody(part);
        if (body) return body;
      }
    }
    // Fallback: check all parts
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return "";
}

/**
 * Find unsubscribe link from email headers or body.
 */
function findUnsubscribeLink(message, bodyText) {
  // 1. Check List-Unsubscribe header (RFC 2369)
  const listUnsub = getHeader(message, "List-Unsubscribe");
  if (listUnsub) {
    // Extract URL from angle brackets: <https://...>, <mailto:...>
    const urlMatch = listUnsub.match(/<(https?:[^>]+)>/);
    if (urlMatch) return urlMatch[1];
    const mailtoMatch = listUnsub.match(/<(mailto:[^>]+)>/);
    if (mailtoMatch) return mailtoMatch[1];
  }

  // 2. Scan body for unsubscribe links
  if (bodyText) {
    const patterns = [
      /href=["'](https?:\/\/[^"']*unsubscribe[^"']*)/gi,
      /href=["'](https?:\/\/[^"']*opt[-_]?out[^"']*)/gi,
      /href=["'](https?:\/\/[^"']*manage[-_]?preferences[^"']*)/gi,
      /href=["'](https?:\/\/[^"']*email[-_]?preferences[^"']*)/gi,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(bodyText);
      if (match) return match[1];
    }
  }

  return null;
}

/**
 * Detect if a message is a newsletter.
 */
function isNewsletter(message, bodyText) {
  // Check List-Unsubscribe header
  const listUnsub = getHeader(message, "List-Unsubscribe");
  if (listUnsub) return true;

  // Check Precedence header (bulk/list)
  const precedence = getHeader(message, "Precedence");
  if (precedence && ["bulk", "list", "junk"].includes(precedence.toLowerCase()))
    return true;

  // Check X-Mailer or X-Campaign headers common in ESPs
  const xMailer = getHeader(message, "X-Mailer") || "";
  const espKeywords = ["mailchimp", "sendgrid", "klaviyo", "constant contact", "hubspot", "campaign monitor"];
  if (espKeywords.some((k) => xMailer.toLowerCase().includes(k))) return true;

  // Scan body for unsubscribe keywords
  if (bodyText) {
    const lower = bodyText.toLowerCase();
    const keywords = ["unsubscribe", "opt out", "opt-out", "manage preferences", "email preferences", "manage your subscription"];
    if (keywords.some((k) => lower.includes(k))) return true;
  }

  return false;
}

/**
 * Parse sender email and name from From header.
 */
function parseSender(fromHeader) {
  if (!fromHeader) return { name: "Unknown", email: "" };
  const match = fromHeader.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      email: match[2].trim().toLowerCase(),
    };
  }
  // Plain email address
  return { name: fromHeader.trim(), email: fromHeader.trim().toLowerCase() };
}

// ─── Check single email (called from content script) ─────────────────────────
async function checkIfNewsletter(emailId) {
  try {
    const message = await getMessage(emailId);
    const bodyText = extractBody(message.payload);
    const isNL = isNewsletter(message, bodyText);
    const unsubLink = isNL ? findUnsubscribeLink(message, bodyText) : null;
    const from = getHeader(message, "From");
    const sender = parseSender(from);
    return { isNewsletter: isNL, unsubscribeLink: unsubLink, sender };
  } catch (err) {
    return { isNewsletter: false, unsubscribeLink: null, sender: null };
  }
}

// ─── Main Scan ────────────────────────────────────────────────────────────────
async function performScan() {
  try {
    console.log("[AutoUnsub] Starting email scan...");
    const token = await getAuthToken(false);
    if (!token) {
      console.log("[AutoUnsub] No auth token — skipping scan (user not logged in).");
      return;
    }

    const messages = await listMessages(SCAN_BATCH_SIZE);
    const { senders = {}, autoUnsubscribeEnabled = true } =
      await chrome.storage.local.get(["senders", "autoUnsubscribeEnabled"]);

    // Counters per sender
    const senderCounts = {};
    const senderMeta = {};

    for (const { id } of messages) {
      try {
        const message = await getMessage(id);
        const from = getHeader(message, "From");
        const date = getHeader(message, "Date");
        const sender = parseSender(from);
        if (!sender.email) continue;

        const bodyText = extractBody(message.payload);
        if (!isNewsletter(message, bodyText)) continue;

        const email = sender.email;
        senderCounts[email] = (senderCounts[email] || 0) + 1;

        if (!senderMeta[email]) {
          senderMeta[email] = {
            name: sender.name,
            email,
            lastReceived: date,
            unsubscribeLink: findUnsubscribeLink(message, bodyText),
          };
        } else {
          // Keep most recent date
          if (new Date(date) > new Date(senderMeta[email].lastReceived)) {
            senderMeta[email].lastReceived = date;
          }
          // Update unsubscribe link if not yet found
          if (!senderMeta[email].unsubscribeLink) {
            senderMeta[email].unsubscribeLink = findUnsubscribeLink(message, bodyText);
          }
        }
      } catch (err) {
        // Skip individual message errors
      }
    }

    // Update senders storage
    for (const [email, count] of Object.entries(senderCounts)) {
      const meta = senderMeta[email];
      const existing = senders[email];

      // Skip already processed senders
      if (
        existing?.status === "unsubscribed" ||
        existing?.status === "blocked" ||
        existing?.status === "kept"
      ) {
        continue;
      }

      const classification =
        count >= AUTO_THRESHOLD ? "auto" : "review";

      senders[email] = {
        name: meta.name,
        email,
        emailCount: count,
        lastReceived: meta.lastReceived,
        unsubscribeLink: meta.unsubscribeLink || null,
        status: existing?.status || "pending",
        classification,
        unsubscribedAt: existing?.unsubscribedAt || null,
      };
    }

    await chrome.storage.local.set({
      senders,
      lastScanned: new Date().toISOString(),
    });

    // Auto-unsubscribe HIGH confidence senders
    if (autoUnsubscribeEnabled) {
      const autoSenders = Object.values(senders).filter(
        (s) =>
          s.classification === "auto" &&
          s.status === "pending" &&
          s.unsubscribeLink
      );
      for (const sender of autoSenders) {
        await unsubscribeSender(sender.email, sender.unsubscribeLink, true);
        console.log(`[AutoUnsub] Auto-unsubscribed: ${sender.email}`);
      }
    }

    console.log(
      `[AutoUnsub] Scan complete. Found ${Object.keys(senderCounts).length} newsletter senders.`
    );
  } catch (err) {
    console.error("[AutoUnsub] Scan failed:", err);
  }
}

// ─── Unsubscribe Action ───────────────────────────────────────────────────────
async function unsubscribeSender(email, link, silent = false) {
  if (!link) return { status: "no_link" };

  try {
    if (link.startsWith("mailto:")) {
      // Handle mailto: unsubscribe (send email)
      // For now, just mark as unsubscribed and notify user
      await updateSenderStatus(email, {
        status: "unsubscribed",
        unsubscribedAt: new Date().toISOString(),
      });
      if (!silent) {
        chrome.tabs.create({ url: link });
      }
      return { status: "mailto" };
    }

    if (!silent) {
      // Open in new tab for manual confirmation
      chrome.tabs.create({ url: link });
    } else {
      // Silent: fetch in background (best-effort)
      try {
        await fetch(link, { method: "GET", mode: "no-cors" });
      } catch {
        // no-cors fetch may fail silently — that's OK
      }
    }

    await updateSenderStatus(email, {
      status: "unsubscribed",
      unsubscribedAt: new Date().toISOString(),
    });

    return { status: "success" };
  } catch (err) {
    console.error(`[AutoUnsub] Failed to unsubscribe ${email}:`, err);
    return { status: "error", error: err.message };
  }
}
