import { useEffect, useState } from 'react'
import { ArrowLeft, Camera, ChevronRight, Clock, Crosshair, Download, Plus, Settings2 } from 'lucide-react'
import { CapturePage } from './pages/CapturePage.tsx'
import { defaults } from './types/capture.ts'
import type { Session, Settings } from './types/capture.ts'
import { loadSessions, loadSettings, saveSession, saveSettings } from './services/storage.ts'
import { exportSession } from './services/export.ts'
import { generateTargets } from './utils/geometry.ts'

type Page = 'home' | 'new' | 'settings' | 'history'
const label = (session: Session) => session.establishment + ' · ' + session.point
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [sessions, setSessions] = useState<Session[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [settings, setSettings] = useState(defaults)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void Promise.all([loadSessions(), loadSettings()]).then(([stored, preferences]) => {
      setSessions(stored)
      if (preferences) setSettings(preferences)
    }).catch(() => setError('No se pudo abrir el almacenamiento local. Comprueba si Safari permite guardar datos.'))
      .finally(() => setLoaded(true))
  }, [])
  const pending = sessions.find(item => item.captures.length < item.targets.length)
  function update(updated: Session) {
    setSessions(previous => previous.map(item => item.id === updated.id ? updated : item))
    setSession(current => current?.id === updated.id ? updated : current)
  }
  function go(destination: Page) { setSession(null); setError(''); setPage(destination); window.scrollTo(0, 0) }
  function enter(item: Session) { setSession(item); setError(''); window.scrollTo(0, 0) }

  async function create(form: HTMLFormElement) {
    const values = new FormData(form)
    const establishment = String(values.get('establishment') ?? '').trim()
    const room = String(values.get('room') ?? '').trim()
    const point = String(values.get('point') ?? '').trim()
    if (!establishment || !room || !point) { setError('Completa los tres campos de la sesión.'); return }
    setBusy(true)
    setError('')
    try {
      const item: Session = {
        id: crypto.randomUUID(), establishment, room, point, created: new Date().toISOString(),
        settings, targets: generateTargets(settings), captures: [],
      }
      await saveSession(item)
      setSessions(previous => [item, ...previous])
      enter(item)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function configure(form: HTMLFormElement) {
    const values = new FormData(form)
    const updated: Settings = {
      overlap: Number(values.get('overlap')), horizontal: Number(values.get('horizontal')),
      vertical: Number(values.get('vertical')), resolution: values.get('resolution') as Settings['resolution'],
      automatic: values.get('mode') === 'auto', tolerance: Number(values.get('tolerance')), stability: Number(values.get('stability')),
    }
    setBusy(true)
    try { await saveSettings(updated); setSettings(updated); go('home') }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function download(item: Session) {
    setBusy(true)
    setError('')
    try { await exportSession(item) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="shell">
    <header>
      <button className="brand" onClick={() => go('home')} disabled={busy}><span className="brand-icon"><Crosshair size={22}/></span><span>GAMERBIT <small>CAPTURE 360</small></span></button>
      <button aria-label="Configuración" className="icon-button" disabled={busy} onClick={() => go('settings')}><Settings2 size={20}/></button>
    </header>
    <main>
      {(session || page !== 'home') && <button className="text-button back" disabled={busy} onClick={() => go(session && page === 'history' ? 'history' : 'home')}><ArrowLeft size={17}/> Volver</button>}
      {error && <p className="alert" role="alert">{error}</p>}
      {session ? <CapturePage key={session.id} session={session} onUpdate={update}/> : page === 'home' ? <>
        <section className="hero">
          <div className="orbit" aria-hidden="true"><i/><i/><i/><Crosshair size={31}/></div>
          <div className="hero-content"><h1>Captura esférica<br/><em>360°</em></h1><p>Guía fotográfica para reconstruir panorámicas.</p>
            <button className="button primary" disabled={!loaded} onClick={() => go('new')}><Plus size={21}/> Nueva sesión</button>
          </div>
        </section>
        {pending && <button className="quick-link panel" onClick={() => enter(pending)}><Camera size={21}/><span><strong>Continuar sesión</strong><small>{pending.room} · {pending.captures.length} / {pending.targets.length} fotos</small></span><ChevronRight size={18}/></button>}
        <button className="quick-link panel" onClick={() => go('history')}><Clock size={21}/><span><strong>Historial de sesiones</strong><small>{sessions.length} guardadas en este dispositivo</small></span><ChevronRight size={18}/></button>
      </> : page === 'new' ? <>
        <h1>Nueva sesión</h1>
        <form className="panel form" onSubmit={event => { event.preventDefault(); void create(event.currentTarget) }}>
          <label>Establecimiento<input name="establishment" required maxLength={100}/></label>
          <label>Ambiente<input name="room" required maxLength={100}/></label>
          <label>Punto de captura<input name="point" required maxLength={80}/></label>
          <div className="instructions"><h2>Antes de empezar</h2><ul>
            <li>Mantén el iPhone en vertical y en un punto fijo.</li>
            <li>Gira alrededor del centro óptico de la cámara y evita desplazarte lateralmente.</li>
            <li>Evita caminar o cambiar de lente durante la sesión.</li>
          </ul></div>
          <button className="button primary" disabled={busy}><Camera size={18}/> {busy ? 'Creando…' : 'Crear sesión'}</button>
        </form>
      </> : page === 'settings' ? <>
        <h1>Configuración</h1>
        <p className="muted">Se aplica a las próximas sesiones. Configura el campo de visión para el encuadre vertical de la cámara.</p>
        <form className="panel form" onSubmit={event => { event.preventDefault(); void configure(event.currentTarget) }}>
          <label>Superposición objetivo<select name="overlap" defaultValue={settings.overlap}>{[30, 40, 50, 60].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
          <div className="form-grid">
            <label>Campo horizontal (°)<input type="number" required name="horizontal" min={20} max={120} step="0.1" defaultValue={settings.horizontal}/></label>
            <label>Campo vertical (°)<input type="number" required name="vertical" min={20} max={120} step="0.1" defaultValue={settings.vertical}/></label>
          </div>
          <label>Resolución solicitada<select name="resolution" defaultValue={settings.resolution}><option value="max">Máxima disponible</option><option value="1080">1920 × 1080</option><option value="720">1280 × 720</option></select></label>
          <label>Modo de captura<select name="mode" defaultValue={settings.automatic ? 'auto' : 'manual'}><option value="auto">Automático</option><option value="manual">Manual</option></select></label>
          <div className="form-grid">
            <label>Tolerancia (°)<input type="number" required name="tolerance" min={0.5} max={10} step="0.5" defaultValue={settings.tolerance}/></label>
            <label>Estabilidad (ms)<input type="number" required name="stability" min={100} max={5000} step={50} defaultValue={settings.stability}/></label>
          </div>
          <button className="button primary" disabled={busy || !loaded}>Guardar configuración</button>
        </form>
      </> : <>
        <h1>Historial de sesiones</h1>
        {!sessions.length && <p className="panel">Aún no hay sesiones guardadas.</p>}
        {sessions.map(item => <article key={item.id} className="panel history">
          <div className="section-head"><button className="text-button" onClick={() => enter(item)}><strong>{item.room}</strong><ChevronRight size={16}/></button>
          <button className="button subtle" disabled={busy || !item.captures.length} onClick={() => void download(item)}><Download size={16}/> ZIP</button></div>
          <p>{label(item)} · {new Date(item.created).toLocaleDateString()}</p>
          <p>{item.captures.length} / {item.targets.length} fotos</p>
        </article>)}
      </>}
    </main>
  </div>
}
