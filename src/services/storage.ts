import { openDB } from 'idb'
import type { DBSchema } from 'idb'
import type { Capture, Session, Settings } from '../types/capture.ts'

interface Database extends DBSchema {
  sessions: { key: string; value: Session }
  preferences: { key: string; value: Settings }
}
const db = () => openDB<Database>('gamerbit-capture', 1, {
  upgrade(database) {
    database.createObjectStore('sessions', { keyPath: 'id' })
    database.createObjectStore('preferences')
  },
})
export async function loadSessions() {
  return (await (await db()).getAll('sessions')).sort((a, b) => b.created.localeCompare(a.created))
}
export async function saveSession(session: Session) {
  await (await db()).add('sessions', session)
}
export async function saveCapture(id: string, capture: Capture) {
  try {
    const quota = await navigator.storage?.estimate?.().catch(() => undefined)
    if (quota?.quota != null && quota.usage != null && quota.quota - quota.usage < capture.photo.size) {
      throw new DOMException('Cuota insuficiente', 'QuotaExceededError')
    }
    const tx = (await db()).transaction('sessions', 'readwrite')
    const session = await tx.store.get(id)
    if (!session) throw new Error('No se encontró la sesión.')
    const retained = session.captures.filter(item => item.targetId !== capture.targetId)
    session.captures = [...retained.map(item => item.visualComparison?.neighborTargetId === capture.targetId
      ? { ...item, visualComparison: undefined } : item), capture]
    await Promise.all([tx.store.put(session), tx.done])
    return session
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Espacio local insuficiente. Libera almacenamiento antes de continuar.', { cause: error })
    }
    throw error
  }
}
export async function loadSettings() { return (await db()).get('preferences', 'capture') }
export async function saveSettings(settings: Settings) { await (await db()).put('preferences', settings, 'capture') }
