/*
 * Offline draft queue for field submissions (BAKAWATCH).
 *
 * Field personnel often work with intermittent connectivity. When a submission
 * fails because the device is offline (or the request errors with no response),
 * it is saved here as a local draft and retried automatically when the network
 * returns. Drafts carry a client-generated `clientKey` so a retry can never
 * create a duplicate server record.
 *
 * IMPORTANT: A queued draft is NOT an officially verified record. It is only a
 * locally-held submission until it syncs and goes through the normal review
 * workflow on the server.
 */

import api from './api'

export type DraftKind = 'plantation' | 'monitoring' | 'ecosystem'

export interface OfflineDraft {
  id: string          // local uuid (primary key)
  clientKey: string   // idempotency key sent to the server
  kind: DraftKind
  endpoint: string    // API path, e.g. '/plantation-records'
  fields: Record<string, string>
  image?: Blob | null
  imageName?: string | null
  createdAt: number
  status: 'pending' | 'syncing' | 'error'
  lastError?: string
}

const DB_NAME = 'bakawatch-offline'
const STORE = 'drafts'
const EVT = 'bakawatch:offline-change'

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
}

export function onOfflineChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVT, cb)
  window.addEventListener('online', cb)
  return () => {
    window.removeEventListener(EVT, cb)
    window.removeEventListener('online', cb)
  }
}

export async function listDrafts(): Promise<OfflineDraft[]> {
  try {
    return (await tx<OfflineDraft[]>('readonly', (s) => s.getAll())) ?? []
  } catch {
    return []
  }
}

export async function countDrafts(): Promise<number> {
  return (await listDrafts()).length
}

export async function enqueueDraft(input: {
  kind: DraftKind
  endpoint: string
  fields: Record<string, string>
  image?: Blob | null
  imageName?: string | null
}): Promise<OfflineDraft> {
  const draft: OfflineDraft = {
    id: uuid(),
    clientKey: uuid(),
    kind: input.kind,
    endpoint: input.endpoint,
    fields: input.fields,
    image: input.image ?? null,
    imageName: input.imageName ?? null,
    createdAt: Date.now(),
    status: 'pending',
  }
  await tx('readwrite', (s) => s.put(draft))
  emitChange()
  return draft
}

async function deleteDraft(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
  emitChange()
}

async function updateDraft(draft: OfflineDraft): Promise<void> {
  await tx('readwrite', (s) => s.put(draft))
  emitChange()
}

/** True when the browser reports it is offline. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Distinguish an offline/network failure (worth queuing) from a real server
 * rejection (validation, auth) which should NOT be silently queued.
 */
export function isNetworkError(err: any): boolean {
  if (isOffline()) return true
  // Axios sets no `response` when the request never reached the server.
  return !!err && err.isAxiosError === true && !err.response
}

let flushing = false

/**
 * Attempt to send all pending drafts. Safe to call repeatedly; it de-dupes via
 * the per-draft clientKey and removes each draft only after a successful POST.
 * Returns the number of drafts successfully synced.
 */
export async function flushDrafts(): Promise<number> {
  if (flushing || isOffline()) return 0
  flushing = true
  let synced = 0
  try {
    const drafts = await listDrafts()
    for (const draft of drafts) {
      try {
        const fd = new FormData()
        for (const [k, v] of Object.entries(draft.fields)) fd.append(k, v)
        fd.append('client_key', draft.clientKey)
        if (draft.image) fd.append('image', draft.image, draft.imageName ?? 'photo.jpg')

        await api.post(draft.endpoint, fd)
        await deleteDraft(draft.id)
        synced++
      } catch (err: any) {
        if (isNetworkError(err)) {
          // Still offline — stop and retry later.
          break
        }
        // Server rejected it (e.g. validation). Mark as error so the user can
        // see it needs attention rather than retrying forever.
        await updateDraft({
          ...draft,
          status: 'error',
          lastError: err?.response?.data?.message ?? 'Server rejected this draft.',
        })
      }
    }
  } finally {
    flushing = false
  }
  return synced
}
