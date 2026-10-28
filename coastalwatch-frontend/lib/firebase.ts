'use client'

// Firebase client initialization (browser only). The config values are public
// by design — security is enforced by Firebase Auth rules and server-side ID
// token verification, not by hiding these keys.
//
// IMPORTANT: We use `initializeAuth` with `inMemoryPersistence` and NO
// `popupRedirectResolver` (instead of `getAuth`), and initialize lazily on
// demand. `getAuth()` automatically attaches `browserPopupRedirectResolver`,
// which injects a hidden cross-origin `https://<authDomain>/__/auth/iframe`
// (`iframe.js`) on every page load — triggering browser Tracking Prevention
// storage warnings and OAuth domain warnings even though this app only uses
// email/password sign-in and exchanges the ID token for a Sanctum session.
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, initializeAuth, inMemoryPersistence, type Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

let appInstance: FirebaseApp | null = null
let authInstance: Auth | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig)
  }
  return appInstance
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    const app = getFirebaseApp()
    try {
      authInstance = initializeAuth(app, { persistence: inMemoryPersistence })
    } catch {
      authInstance = getAuth(app)
    }
  }
  return authInstance
}

export function hasInitializedFirebaseAuth(): boolean {
  return authInstance !== null
}
