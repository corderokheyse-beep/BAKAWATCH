'use client'

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type UserCredential,
} from 'firebase/auth'
import { firebaseAuth } from './firebase'

/** Sign in with Firebase and return a fresh ID token. */
export async function firebaseSignIn(email: string, password: string): Promise<string> {
  const cred: UserCredential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
  return cred.user.getIdToken()
}

/** Create a Firebase account and return a fresh ID token. */
export async function firebaseRegister(email: string, password: string): Promise<string> {
  const cred: UserCredential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
  return cred.user.getIdToken()
}

/** Send a Firebase password-reset email. Firebase owns the whole reset flow. */
export async function firebaseSendReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth, email.trim())
}

/** Sign out of Firebase (best-effort; local session is cleared separately). */
export async function firebaseSignOut(): Promise<void> {
  try { await signOut(firebaseAuth) } catch { /* non-blocking */ }
}

/** Map Firebase auth error codes to user-friendly messages. */
export function firebaseErrorMessage(err: any): string {
  const code: string = err?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.'
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with mixed case, a number, and a symbol.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.'
    case 'auth/operation-not-allowed':
      // Email/Password provider is disabled in the Firebase console.
      return 'Email/password sign-in is not enabled for this project. Enable it in Firebase Console → Authentication → Sign-in method.'
    case 'auth/admin-restricted-operation':
      return 'Sign-up is restricted for this project. Contact your administrator.'
    case 'auth/configuration-not-found':
      return 'Firebase Authentication is not fully configured for this project.'
    default:
      return err?.message?.replace('Firebase: ', '') ?? 'Authentication failed. Please try again.'
  }
}
