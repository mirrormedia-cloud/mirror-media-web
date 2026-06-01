/* Firebase Cloud Messaging service worker.
 *
 * Loaded by the browser at /firebase-messaging-sw.js — Firebase looks for
 * this exact path. Service workers can't read Vite env vars, so the public
 * config is inlined below. These are the same values shipped in the bundle
 * via VITE_FIREBASE_*; if you rotate them, update both places.
 *
 * IMPORTANT: keep this file at the site root. Moving it breaks FCM.
 */

// Diagnostic: confirms the SW file itself is executing. If you don't see
// this line in the SW's own console after a hard refresh, the SW is stuck
// on an older cached version and isn't activating.
console.log("[fcm-sw] script loaded at", new Date().toISOString());

// Skip waiting + claim clients so updates to this file activate immediately
// instead of staying "waiting" until every controlled tab closes — the
// old PWA install would otherwise keep the previous SW alive indefinitely.
self.addEventListener("install", (event) => {
    console.log("[fcm-sw] install event");
    event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
    console.log("[fcm-sw] activate event");
    event.waitUntil(self.clients.claim());
});

// Raw push event listener — runs BEFORE Firebase's own push handler.
//
// Two responsibilities:
//   1. Diagnostic logging: confirms pushes are reaching the SW.
//   2. Broadcasting to ALL open pages via postMessage. Firebase's onMessage
//      has timing quirks (focus transitions, SDK init, page navigation)
//      that occasionally drop foreground deliveries. By posting directly
//      from the raw push event, the page gets notified for EVERY push
//      regardless of Firebase's internal routing. The page dedups against
//      Firebase's onMessage so the user doesn't see two toasts.
self.addEventListener("push", (event) => {
    let raw = "";
    let parsed = null;
    try {
        if (event.data) {
            raw = event.data.text();
            parsed = JSON.parse(raw);
        }
    } catch { /* malformed payload — leave parsed null */ }
    console.log("[fcm-sw] raw push event received, payload:", raw || "(empty)");

    if (!parsed) return;
    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clients) {
            try {
                // `type` namespaced so we don't collide with Firebase's own
                // postMessage protocol (which uses different type strings).
                client.postMessage({ type: "MMC_FCM_PUSH", payload: parsed });
            } catch { /* dead client — skip */ }
        }
    })());
});

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

// Firebase web config — PUBLIC values, intentionally shipped to the browser.
// Keep in sync with the VITE_FIREBASE_* entries in frontend/.env.
// (Service workers can't read Vite env vars, so this has to be inlined.)
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDYsZpwnMv7vrYkXe_uE34ZY3ulQh4Jv8A",
    authDomain: "mirror-media-cloud.firebaseapp.com",
    projectId: "mirror-media-cloud",
    storageBucket: "mirror-media-cloud.firebasestorage.app",
    messagingSenderId: "447516703168",
    appId: "1:447516703168:web:51e2b9f743f72da18ff025",
};

// Only initialise if config is filled out — an empty config makes the SDK
// throw on every push event, which hides the real "config missing" issue.
if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId) {
    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        console.log("[fcm-sw] firebase.initializeApp succeeded");

        const messaging = firebase.messaging();
        console.log("[fcm-sw] firebase.messaging() instance acquired");

        // Backend sends a `notification + data` payload. Chrome's Firebase
        // SDK auto-displays the `notification` block via its OWN push
        // handler — we must NOT call showNotification here, otherwise the
        // user sees the same push twice (Chrome's auto-display + ours).
        //
        // This handler is kept purely for diagnostics. If we ever needed
        // custom rendering (badges, action buttons, multi-line), we'd
        // switch to data-only and re-enable showNotification — but that
        // breaks reliable delivery to closed PWAs, so don't do that
        // without a strong reason.
        messaging.onBackgroundMessage((payload) => {
            console.log("[fcm-sw] onBackgroundMessage fired:", JSON.stringify(payload));

            // const title =
            //     payload.notification?.title ||
            //     payload.data?.title ||
            //     "Mirror Media Cloud";

            // const body =
            //     payload.notification?.body ||
            //     payload.data?.body ||
            //     "You have a new notification";

            // const redirect_url =
            //     payload.data?.redirect_url ||
            //     payload.data?.url ||
            //     "/dashboard";

            // self.registration.showNotification(title, {
            //     body,
            //     icon: "/icons/icon-192x192.png",
            //     badge: "/icons/icon-192x192.png",
            //     data: {
            //         redirect_url,
            //         payload,
            //     },
            // });
        });
        console.log("[fcm-sw] onBackgroundMessage handler registered");
    } catch (err) {
        console.warn("[fcm-sw] init failed:", err);
    }
} else {
    console.warn("[fcm-sw] FIREBASE_CONFIG empty — skipping init");
}

/**
 * Notification click → focus an existing tab if one is open, otherwise
 * open a new one at the redirect URL. Falls back to /dashboard.
 */
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target_url = (event.notification.data && event.notification.data.redirect_url) || "/dashboard";

    event.waitUntil((async () => {
        const all_clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

        for (const client of all_clients) {
            try {
                const url = new URL(client.url);
                if (url.origin === self.location.origin) {
                    await client.focus();
                    // Best-effort navigate the existing tab to the target.
                    if ("navigate" in client) {
                        await client.navigate(target_url);
                    } else {
                        client.postMessage({ type: "FCM_NAVIGATE", url: target_url });
                    }
                    return;
                }
            } catch { /* skip malformed client */ }
        }

        // No existing tab — open a new one.
        if (self.clients.openWindow) {
            await self.clients.openWindow(target_url);
        }
    })());
});
