/**
 * Firebase Web SDK configuration.
 *
 * These are PUBLIC values — Firebase ships them to every browser in the
 * bundle. They're not secrets. Edit this file directly when you rotate
 * your Firebase project; nothing reads them from .env any more.
 *
 * IMPORTANT: When you change these values, you ALSO need to update
 * `public/firebase-messaging-sw.js` with the same six values. Service
 * workers can't import TypeScript modules, so the SW carries its own
 * copy. Keep them in sync.
 *
 * VAPID key — separate from the rest. Generate it once at:
 *   Firebase Console → Project Settings → Cloud Messaging → "Web configuration".
 */

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDYsZpwnMv7vrYkXe_uE34ZY3ulQh4Jv8A",
    authDomain: "mirror-media-cloud.firebaseapp.com",
    projectId: "mirror-media-cloud",
    storageBucket: "mirror-media-cloud.firebasestorage.app",
    messagingSenderId: "447516703168",
    appId: "1:447516703168:web:51e2b9f743f72da18ff025",
};

export const FIREBASE_VAPID_KEY = "BFrlE_sgaXWyd3sYOJa1oBUlYR8KSYRMS8wxJCMdXxh41_UK8wdNAz-w574ylm_EakMFrNIbps01XvLxlW308P8";
