/**
 * Firebase Web Messaging initialisation.
 *
 * Lazy + guarded: a browser without service workers, without Notification
 * API, or running on http: gets `null` from getMessagingInstance() instead
 * of an exception. Callers must handle that path.
 *
 * Only Firebase Messaging is used here — auth/firestore/etc. are not pulled
 * in. The whole project leans on the existing Postgres-backed auth, so
 * Firebase carries push and nothing else.
 */

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
    getMessaging,
    isSupported,
    getToken,
    onMessage,
    type Messaging,
    type MessagePayload,
} from "firebase/messaging";
import { FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from "./firebase.config";

export interface FirebaseConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
}

/**
 * Pulled from `./firebase.config.ts`. Env-var indirection was removed
 * because Vite's import.meta replacement and the .env loader can produce
 * silently-empty values under certain bundler/SSR configs. Reading a
 * plain TS module gives us compile-time guarantees that the values exist.
 */
function readConfig(): FirebaseConfig | null {
    const cfg = FIREBASE_CONFIG;
    if (!cfg.apiKey || !cfg.projectId || !cfg.messagingSenderId || !cfg.appId) return null;
    return cfg;
}

let _app: FirebaseApp | null = null;
let _messaging: Messaging | null = null;
let _initPromise: Promise<Messaging | null> | null = null;

/**
 * Returns the messaging instance, or null if the runtime can't support FCM
 * (no service worker, no notifications, no PushManager, http:, or missing env).
 *
 * Memoised — calling repeatedly is cheap.
 */
export function getMessagingInstance(): Promise<Messaging | null> {
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        if (typeof window === "undefined") return null;
        if (!("serviceWorker" in navigator)) return null;
        if (!("Notification" in window)) return null;
        if (!("PushManager" in window)) return null;

        // Some browsers can't run FCM at all (Safari < 16, in-app webviews).
        // The SDK exposes isSupported() to detect those — call it before
        // initializeApp so a thrown exception inside the SDK doesn't leak.
        let supported = false;
        try {
            supported = await isSupported();
        } catch {
            return null;
        }
        if (!supported) return null;

        const config = readConfig();
        if (!config) {
            console.warn("[firebase] config missing — fill src/lib/firebase.config.ts");
            return null;
        }

        try {
            _app = getApps()[0] ?? initializeApp(config);
            _messaging = getMessaging(_app);
            return _messaging;
        } catch (err) {
            console.warn("[firebase] init failed:", err);
            return null;
        }
    })();

    return _initPromise;
}

/**
 * Requests a fresh FCM token tied to the registered service worker. Returns
 * the token, or null on any failure path (permission denied, SW not ready,
 * VAPID misconfigured, network error).
 *
 * The caller is responsible for passing it to /api/notifications/register-token.
 */
export async function getFcmToken(): Promise<string | null> {
    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    const vapidKey = FIREBASE_VAPID_KEY;
    if (!vapidKey) {
        console.warn("[firebase] VAPID key missing — fill FIREBASE_VAPID_KEY in src/lib/firebase.config.ts");
        return null;
    }

    try {
        // The messaging SW must be registered at the document root with this
        // exact filename — Firebase looks it up itself if we pass the
        // registration. We register manually to control the scope; the SDK
        // would otherwise register one at `/firebase-cloud-messaging-push-scope`.
        const swRegistration = await navigator.serviceWorker.register(
            "/firebase-messaging-sw.js",
            { scope: "/firebase-cloud-messaging-push-scope" }
        );

        const token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: swRegistration,
        });
        return token || null;
    } catch (err) {
        console.warn("[firebase] getToken failed:", err);
        return null;
    }
}

/**
 * Subscribe to foreground-tab messages. The browser's notification banner
 * won't fire automatically for these (tab is focused) — callers typically
 * show an in-app toast or just refresh the bell badge.
 *
 * Returns an unsubscribe fn, or a no-op fn if FCM isn't supported.
 */
export async function onForegroundMessage(
    handler: (payload: MessagePayload) => void
): Promise<() => void> {
    const messaging = await getMessagingInstance();
    if (!messaging) return () => { /* noop */ };
    return onMessage(messaging, handler);
}

/** Pass-through for callers that want the raw config (e.g. the SW init). */
export function getFirebaseConfig(): FirebaseConfig | null {
    return readConfig();
}
