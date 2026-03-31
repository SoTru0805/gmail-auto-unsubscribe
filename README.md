# Gmail Auto-Unsubscribe Chrome Extension

A Chrome Extension (Manifest V3) that automatically detects and unsubscribes you from newsletters inside Gmail.

---

## 📁 File Structure

```
extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker: Gmail API + auto-scan logic
├── content.js             # Injected into Gmail: "Unsubscribe" button
├── popup/
│   ├── index.html         # Popup shell
│   └── App.jsx            # React dashboard (3-tab UI)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🚀 Setup Instructions

### Step 1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project**
3. Name it (e.g., `Gmail Auto-Unsubscribe`) and click **Create**
4. In the left menu, go to **APIs & Services → Library**
5. Search for **Gmail API** and click **Enable**

### Step 2 — Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Select **Application type: Chrome Extension**
4. Copy your **Extension ID** from `chrome://extensions` after loading unpacked (Step 3)
5. Paste the Extension ID in the **Application ID** field
6. Click **Create** — copy the generated **Client ID**
7. Open `manifest.json` and replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID

### Step 3 — Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The extension appears — copy the **Extension ID** (you'll need it for Step 2)
6. Reload after updating the `manifest.json` with your Client ID

### Step 4 — Configure OAuth Consent Screen

1. Back in Google Cloud Console → **APIs & Services → OAuth consent screen**
2. Select **External** and click **Create**
3. Fill in:
   - App name: `Gmail Auto-Unsubscribe`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. On the **Scopes** step, click **Add or Remove Scopes**
6. Add: `https://www.googleapis.com/auth/gmail.modify`
7. Click **Save and Continue**
8. Add yourself as a **Test User** (your Gmail address)
9. Complete the setup

---

## 🧪 Testing Each Feature

### Test: Newsletter Detection & Scan
1. Click the extension icon in Chrome toolbar
2. Click **Scan Now** — you'll be prompted to sign in with Google
3. Grant the requested permissions
4. Wait for the scan to complete (scans last 100 emails)
5. Check the **Review Queue** tab — detected newsletters should appear

### Test: One-Click Unsubscribe Button (Content Script)
1. Open Gmail at [https://mail.google.com](https://mail.google.com)
2. Open any newsletter email
3. Look for a small **"Unsubscribe"** button injected next to the sender name
4. Click it — it opens the unsubscribe link and shows a toast notification

### Test: Dashboard Actions
- **Review Queue** → click Unsub / Keep / Block on individual senders
- **Unsubscribe All** → bulk action on all pending senders
- **Auto-Unsubscribed tab** → shows senders processed automatically
- **Blocked tab** → shows blocked senders with Unblock option

### Test: Auto Toggle
- Toggle the **Auto** switch in the header to enable/disable auto-unsubscribe
- When enabled, senders with 5+ emails (no replies) are auto-unsubscribed on each scan

---

## 🔐 Permissions Explained

| Permission | Why |
|---|---|
| `identity` | OAuth 2.0 login with Google |
| `storage` | Persist sender list and settings locally |
| `scripting` | Inject the Unsubscribe button into Gmail UI |
| `tabs` | Open unsubscribe links in new tabs |
| `https://mail.google.com/*` | Allow content script on Gmail |
| `https://gmail.googleapis.com/*` | Call the Gmail API |

---

## ⚙️ Chrome Storage Schema

```json
{
  "senders": {
    "newsletter@example.com": {
      "name": "Example Newsletter",
      "email": "newsletter@example.com",
      "status": "unsubscribed | blocked | kept | pending",
      "emailCount": 12,
      "lastReceived": "Thu, 28 Mar 2026 10:00:00 +0000",
      "unsubscribeLink": "https://example.com/unsubscribe?id=...",
      "classification": "auto | review",
      "unsubscribedAt": "2026-03-30T10:00:00.000Z"
    }
  },
  "lastScanned": "2026-03-30T10:00:00.000Z",
  "autoUnsubscribeEnabled": true
}
```

---

## 🛠️ Extending the Extension

The code is modular and well-commented:

- **`background.js`** — Add new detection heuristics in `isNewsletter()` or `findUnsubscribeLink()`
- **`content.js`** — Customize the injected button UI or add more Gmail UI integrations
- **`popup/App.jsx`** — Add new tabs or dashboard features (export list, stats, etc.)
- **`manifest.json`** — Add more permissions if needed (e.g., `contextMenus` for right-click actions)

---

## 📝 Notes

- The extension scans the **last 100 emails** per scan (configurable via `SCAN_BATCH_SIZE` in `background.js`)
- **Auto-unsubscribe** targets senders with **5+ emails and no replies** from you (`AUTO_THRESHOLD`)
- Scans run automatically every **24 hours** via Chrome Alarms API
- Unsubscribe links are found via `List-Unsubscribe` header (RFC 2369) or body scanning
- `mailto:` unsubscribe links open your mail client instead of a browser tab
