/**
 * Platform-detecting push abstraction.
 *
 * The app runs in two contexts that have DIFFERENT push delivery stacks:
 *
 *   1. Browser / installed PWA (Capacitor.isNativePlatform() === false)
 *      → Web Push: getFcmToken() via firebase/messaging, service worker
 *        handles background banners. Token format: long string ending in
 *        :APA91b... — routed through W3C Web Push protocol.
 *      → BREAKS on Android force-stop (SW dies, push subscription unreachable).
 *
 *   2. Capacitor Android app (Capacitor.isNativePlatform() === true)
 *      → Native FCM: @capacitor/push-notifications uses Google Play Services
 *        FCM SDK. OS displays background notifications automatically — no SW
 *        involved. Token format: similar string but routed via native FCM.
 *      → SURVIVES force-stop because it's a real app with FCM SDK in-process.
 *
 * Both ends produce tokens that Firebase Admin SDK on the backend can send
 * to via the same `sendEachForMulticast` call — Admin SDK transparently
 * routes based on token format. No backend differentiation needed.
 *
 * Callers (NotificationPermissionCard, AuthContext) use this module's API
 * and never touch firebase/* or @capacitor/* directly.
 */

import { Capacitor } from "@capacitor/core";
import {
    PushNotifications,
    type Token,
    type PushNotificationSchema,
    type ActionPerformed,
} from "@capacitor/push-notifications";
import { getFcmToken, getMessagingInstance, onForegroundMessage } from "./firebase";

export type PushPermission = "default" | "granted" | "denied";
export type DeviceType = "web" | "android" | "ios";

/** True when running inside a Capacitor native shell. */
export function is_native(): boolean {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
}

/** Reports the device type that the backend will store on the session row. */
export function get_device_type(): DeviceType {
    if (!is_native()) return "web";
    const platform = Capacitor.getPlatform();
    if (platform === "android") return "android";
    if (platform === "ios") return "ios";
    return "web";
}

/**
 * Returns true if the runtime can do push at all. Native always can; web
 * needs Notification + ServiceWorker + Firebase support to all be available.
 */
export async function is_push_supported(): Promise<boolean> {
    if (is_native()) return true;
    if (typeof window === "undefined") return false;
    if (!("Notification" in window)) return false;
    const messaging = await getMessagingInstance();
    return messaging !== null;
}

/** Current permission state. Maps Capacitor's "prompt" to web's "default". */
export async function get_permission(): Promise<PushPermission> {
    if (is_native()) {
        const res = await PushNotifications.checkPermissions();
        if (res.receive === "granted") return "granted";
        if (res.receive === "denied") return "denied";
        return "default";
    }
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    return Notification.permission;
}

/**
 * Asks the OS for permission. On Capacitor this returns immediately with
 * the user's choice; on web it pops the browser's native permission prompt.
 */
export async function request_permission(): Promise<PushPermission> {
    if (is_native()) {
        const res = await PushNotifications.requestPermissions();
        if (res.receive === "granted") return "granted";
        if (res.receive === "denied") return "denied";
        return "default";
    }
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    try {
        const result = await Notification.requestPermission();
        return (result as PushPermission) ?? "denied";
    } catch {
        return "denied";
    }
}

/**
 * Mints (or fetches) the device's push token. On native, this triggers the
 * 'registration' event listener — we wrap it in a Promise so the caller
 * can `await` like the web path. On web, just forwards to getFcmToken().
 *
 * Returns null on any failure (no permission, no service worker, network
 * error). The caller decides how to react.
 */
export async function get_push_token(): Promise<string | null> {
    if (is_native()) {
        return new Promise<string | null>((resolve) => {
            let resolved = false;
            const settle = (value: string | null) => {
                if (resolved) return;
                resolved = true;
                // Detach the listeners so we don't leak across re-registers.
                regListener.then((h) => h.remove()).catch(() => { /* noop */ });
                errListener.then((h) => h.remove()).catch(() => { /* noop */ });
                resolve(value);
            };

            const regListener = PushNotifications.addListener(
                "registration",
                (token: Token) => settle(token.value || null)
            );
            const errListener = PushNotifications.addListener(
                "registrationError",
                (err) => {
                    console.warn("[push] native registration error:", err);
                    settle(null);
                }
            );

            // Kicks off the FCM token generation. The listeners above are
            // what actually receive the result.
            PushNotifications.register().catch((err) => {
                console.warn("[push] PushNotifications.register failed:", err);
                settle(null);
            });

            // Safety timeout — if the OS / Play Services hangs, don't leave
            // the caller waiting forever.
            setTimeout(() => settle(null), 15_000);
        });
    }
    return getFcmToken();
}

/**
 * Subscribe to foreground push events. Returns an unsubscribe function.
 *
 * Both code paths normalise their input into the SAME shape the page
 * already expects:
 *   { notification?: { title, body }, data: { ... } }
 *
 * Background notifications are handled by the OS (native) or the SW (web);
 * this hook only fires when the app/tab has focus.
 */
export async function on_foreground_push(
    handler: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, any> }) => void
): Promise<() => void> {
    if (is_native()) {
        const receivedHandle = await PushNotifications.addListener(
            "pushNotificationReceived",
            (notification: PushNotificationSchema) => {
                handler({
                    notification: {
                        title: notification.title ?? undefined,
                        body: notification.body ?? undefined,
                    },
                    data: notification.data ?? {},
                });
            }
        );
        // Tap-on-banner (cold or warm) — pass through with an extra hint
        // so the page can route. The data carries our redirect_url which
        // the bell's click handler already navigates to.
        const tappedHandle = await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            (action: ActionPerformed) => {
                handler({
                    notification: {
                        title: action.notification.title ?? undefined,
                        body: action.notification.body ?? undefined,
                    },
                    data: { ...action.notification.data, __tap: "true" },
                });
            }
        );
        return () => {
            receivedHandle.remove().catch(() => { /* noop */ });
            tappedHandle.remove().catch(() => { /* noop */ });
        };
    }
    return onForegroundMessage((payload: any) => handler(payload));
}
