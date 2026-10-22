'use client'

import { CheckCircle2, XCircle } from 'lucide-react'

/**
 * Live password-requirements indicator. The checks mirror the backend rule
 * (Password::min(8)->mixedCase()->numbers()->symbols()->uncompromised()).
 * The "not found in a data breach" part is enforced server-side only — it
 * can't be checked client-side — so it isn't listed here.
 */
export const PASSWORD_CHECKS: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: p => p.length >= 8 },
  { label: 'Uppercase letter (A–Z)', test: p => /[A-Z]/.test(p) },
  { label: 'Lowercase letter (a–z)', test: p => /[a-z]/.test(p) },
  { label: 'Number (0–9)', test: p => /[0-9]/.test(p) },
  { label: 'Symbol (!@#$…)', test: p => /[^A-Za-z0-9]/.test(p) },
]

/** True when the password satisfies every client-checkable requirement. */
export function isStrongPassword(password: string): boolean {
  return PASSWORD_CHECKS.every(c => c.test(password))
}

export default function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {PASSWORD_CHECKS.map(c => {
        const ok = c.test(password)
        return (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
            {ok
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              : <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            <span>{c.label}</span>
            <span className="sr-only">{ok ? '— met' : '— not met'}</span>
          </li>
        )
      })}
    </ul>
  )
}
