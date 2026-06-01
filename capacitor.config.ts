import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the built Vite bundle (`dist/`) into a native Android
 * (and optionally iOS) shell. The web code runs inside a system WebView
 * but native plugins bridge to OS APIs — most importantly here,
 * @capacitor/push-notifications which uses native FCM SDK instead of
 * Web Push. Native FCM tokens survive Android force-stop where Web Push
 * subscriptions do not.
 *
 * webDir: dist — must match Vite's build output. `npm run build` first,
 * then `cap sync android` copies dist into android/app/src/main/assets/public/.
 *
 * server.androidScheme: "https" — uses the new https://localhost origin for
 * the WebView. Required for service-worker registration, secure cookies,
 * and any code that branches on window.location.protocol === "https:".
 * Without this, Capacitor defaults to http://localhost and modern Web APIs
 * (Notification, Clipboard, etc.) refuse to run inside the WebView.
 */
const config: CapacitorConfig = {
    appId: "com.mirrormedia.cloud",
    appName: "Mirror Media Cloud",
    webDir: "dist",
    server: {
        androidScheme: "https",
        // For local dev against a live backend, you can point this at your
        // ngrok / LAN URL. For production builds, leave undefined so the
        // app loads the bundled dist/ instead of a remote URL.
        // url: "https://your-stable-domain",
        // cleartext: false,
    },
    plugins: {
        PushNotifications: {
            // Sound + alert + badge on iOS; on Android it's enabled by default.
            // Plugin will request the necessary permission on first register().
            presentationOptions: ["badge", "sound", "alert"],
        },
        SplashScreen: {
            // Matches manifest.json's theme/background colors so the splash
            // doesn't flash a wrong color before our CSS loads.
            launchShowDuration: 1500,
            backgroundColor: "#020617",
            showSpinner: false,
            androidScaleType: "CENTER_CROP",
            splashFullScreen: true,
            splashImmersive: true,
        },
    },
    android: {
        // allowMixedContent: false — keep HTTPS-only. Anything served over
        // http: in the WebView (image, script, fetch) will be blocked.
        allowMixedContent: false,
    },
};

export default config;
