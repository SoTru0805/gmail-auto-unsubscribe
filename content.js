/**
 * content.js — Gmail Content Script
 * Injects unsubscribe buttons into Gmail's email view using MutationObserver.
 */

(function () {
  "use strict";

  // ─── State ──────────────────────────────────────────────────────────────────
  const processedEmails = new Set();
  let currentEmailId = null;

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const STYLES = `
    .autounsub-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      margin-left: 8px;
      border: 1px solid #6366f1;
      border-radius: 4px;
      background: transparent;
      color: #6366f1;
      font-size: 12px;
      font-family: 'Google Sans', Arial, sans-serif;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      vertical-align: middle;
      line-height: 1.4;
    }
    .autounsub-btn:hover {
      background: #6366f1;
      color: white;
    }
    .autounsub-btn.loading {
      opacity: 0.6;
      cursor: not-allowed;
      pointer-events: none;
    }
    .autounsub-btn.done {
      border-color: #10b981;
      color: #10b981;
      pointer-events: none;
    }
    .autounsub-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: #1e1e2e;
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-family: 'Google Sans', Arial, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 99999;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      max-width: 360px;
      text-align: center;
    }
    .autounsub-toast.show {
      transform: translateX(-50%) translateY(0);
    }
    .autounsub-toast.success { border-left: 3px solid #10b981; }
    .autounsub-toast.error   { border-left: 3px solid #ef4444; }
  `;

  function injectStyles() {
    if (document.getElementById("autounsub-styles")) return;
    const style = document.createElement("style");
    style.id = "autounsub-styles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // ─── Toast Notification ───────────────────────────────────────────────────
  function showToast(message, type = "success") {
    let toast = document.getElementById("autounsub-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "autounsub-toast";
      toast.className = "autounsub-toast";
      document.body.appendChild(toast);
    }

    toast.className = `autounsub-toast ${type}`;
    toast.textContent = message;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add("show");
      });
    });

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  // ─── Extract Gmail email ID from URL ─────────────────────────────────────
  function getEmailIdFromUrl() {
    const match = window.location.hash.match(/#[^/]+\/([a-f0-9]+)/);
    return match ? match[1] : null;
  }

  // ─── Find sender info element in Gmail UI ────────────────────────────────
  function findSenderElement() {
    // Gmail's sender name element (various selectors for different Gmail versions)
    const selectors = [
      ".gD",       // Sender span in expanded email view
      "[email]",   // Elements with email attribute
      ".go",       // Sender in some Gmail layouts
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const email = el.getAttribute("email") || el.dataset.email;
        if (email && email.includes("@")) return el;
      }
    }
    return null;
  }

  // ─── Inject Unsubscribe Button ────────────────────────────────────────────
  async function injectUnsubscribeButton(emailId) {
    if (processedEmails.has(emailId)) return;

    const senderEl = findSenderElement();
    if (!senderEl) return;

    // Mark as processed immediately to prevent duplicate injection
    processedEmails.add(emailId);

    // Check with background if this is a newsletter
    let result;
    try {
      result = await sendMessage({
        action: "CHECK_EMAIL_NEWSLETTER",
        emailId,
      });
    } catch (err) {
      console.warn("[AutoUnsub] Could not check newsletter status:", err);
      return;
    }

    if (!result?.isNewsletter || !result?.unsubscribeLink) return;

    // Don't inject if already unsubscribed
    const storageResult = await sendMessage({ action: "GET_STORAGE" });
    const senders = storageResult?.data?.senders || {};
    const senderEmail = result.sender?.email;
    if (senders[senderEmail]?.status === "unsubscribed") return;

    // Create the button
    const btn = document.createElement("button");
    btn.className = "autounsub-btn";
    btn.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
      Unsubscribe
    `;
    btn.title = `Unsubscribe from ${senderEmail}`;

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      btn.classList.add("loading");
      btn.textContent = "Unsubscribing...";

      try {
        // Open unsubscribe link
        await sendMessage({
          action: "UNSUBSCRIBE",
          email: senderEmail,
          link: result.unsubscribeLink,
        });

        btn.className = "autounsub-btn done";
        btn.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Unsubscribed
        `;
        showToast(`✓ Unsubscribed from ${result.sender?.name || senderEmail}`, "success");
      } catch (err) {
        btn.classList.remove("loading");
        btn.textContent = "Unsubscribe";
        showToast("Failed to unsubscribe. Try again.", "error");
      }
    });

    // Insert button after sender element
    senderEl.parentNode?.insertBefore(btn, senderEl.nextSibling);
  }

  // ─── Message Helper ───────────────────────────────────────────────────────
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

  // ─── Handle URL/Email Changes ─────────────────────────────────────────────
  function onEmailView() {
    const emailId = getEmailIdFromUrl();
    if (!emailId || emailId === currentEmailId) return;
    currentEmailId = emailId;

    // Delay slightly to let Gmail render the email UI
    setTimeout(() => {
      injectUnsubscribeButton(emailId);
    }, 800);
  }

  // ─── MutationObserver: Watch for Gmail SPA navigation ────────────────────
  const observer = new MutationObserver(() => {
    onEmailView();
  });

  function startObserving() {
    // Observe the main content area for DOM changes
    const target = document.querySelector(".AO") || document.body;
    observer.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  // ─── Initialize ───────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    startObserving();
    onEmailView(); // Check current page on load

    // Also listen for URL hash changes (Gmail navigation)
    window.addEventListener("hashchange", onEmailView);

    console.log("[AutoUnsub] Content script initialized.");
  }

  // Wait for Gmail to fully load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
