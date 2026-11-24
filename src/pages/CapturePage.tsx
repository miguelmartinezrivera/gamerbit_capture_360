import { Camera, CircleHelp, Crosshair, Download, Move, RotateCcw } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { CoverageMap } from '../components/CoverageMap.tsx'
import { useOrientation } from '../hooks/useOrientation.ts'
import type { Reading } from '../hooks/useOrientation.ts'
import { closeCamera, grabFrame, jpeg, openCamera } from '../services/camera.ts'
import { exportSession } from '../services/export.ts'
import { compareFrames } from '../services/visual.ts'
import { quality } from '../services/quality.ts'
import { requestSensors, screenAngle } from '../services/sensors.ts'
import { saveCapture } from '../services/storage.ts'
import type { Session, Target } from '../types/capture.ts'
import { basis, direction, distance, dot, geometricOverlap, radians, wrap } from '../utils/geometry.ts'

const message = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.'
const next = (session: Session) => {
  const taken = new Set(session.captures.map(capture => capture.targetId))
  return session.targets.find(target => !taken.has(target.id)) ?? null
}

function isStable(reading: Reading) {
  const acceleration = reading.motion?.acceleration
  return reading.speed <= 6 && (reading.motion?.rotationSpeed ?? 0) <= 8
    && (!acceleration || Math.hypot(acceleration.x, acceleration.y, acceleration.z) <= 0.45)
}

export function CapturePage({ session, onUpdate }: { session: Session; onUpdate: (session: Session) => void }) {
  const [target, setTarget] = useState<Target | null>(() => next(session))
  const [ready, setReady] = useState(false)
  const frameBox = useRef<HTMLElement>(null)
  const [boxSize, setBoxSize] = useState({ width: 1, height: 1 })
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
  const [anchorUrl, setAnchorUrl] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [motionAllowed, setMotionAllowed] = useState(true)
  const [stableMs, setStableMs] = useState(0)
  const [reference, setReference] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const active = useRef(false)
  const lifetime = useRef(0)
  const stableSince = useRef<number | null>(null)
  const { reading, latest, calibrated, calibrate, calibrationNotice } = useOrientation()
  const { settings } = session
  const first = session.captures.find(photo => photo.targetId === 1) ?? session.captures.find(photo => Math.abs(photo.actual.pitch) < 60)
  const existing = session.captures.find(photo => photo.targetId === target?.id)
  const angularError = target && reading ? distance(reading.pose, target) : null
  const rollError = target && reading ? Math.abs(wrap(target.roll - reading.pose.roll)) : 0
  const aligned = angularError != null && angularError <= settings.tolerance && (Math.abs(target!.pitch) === 90 || rollError <= 8)
  const stable = !!reading && isStable(reading)
  const preview = (() => {
    if (!reading || !target || !calibrated) return null
    const axes = basis(reading.pose)
    const ray = direction(target.yaw, target.pitch)
    const depth = dot(ray, axes.forward)
    const side = dot(ray, axes.right)
    const rise = dot(ray, axes.up)
    const x = depth > 0 ? side / Math.max(depth, 0.05) : Math.sign(wrap(target.yaw - reading.pose.yaw)) || 1
    const y = depth > 0 ? rise / Math.max(depth, 0.05) : Math.sign(target.pitch - reading.pose.pitch)
    const imageScale = Math.min(boxSize.width / (videoSize.width || 1), boxSize.height / (videoSize.height || 1))
    return {
      x, y,
      left: 50 + Math.max(-42, Math.min(42, x * 50 * videoSize.width * imageScale / boxSize.width / Math.tan(radians(settings.horizontal / 2)))),
      top: 50 - Math.max(-40, Math.min(40, y * 50 * videoSize.height * imageScale / boxSize.height / Math.tan(radians(settings.vertical / 2)))),
    }
  })()

  useEffect(() => {
    const stop = () => {
      lifetime.current++
      if (stream.current) closeCamera(stream.current)
      stream.current = null
    }
    return stop
  }, [])

  useEffect(() => {
    if (!first?.photo) return
    const url = URL.createObjectURL(first.photo)
    const timer = window.setTimeout(() => setAnchorUrl(url), 0)
    return () => { window.clearTimeout(timer); URL.revokeObjectURL(url) }
  }, [first?.photo])

  useEffect(() => {
    if (!frameBox.current) return
    const observer = new ResizeObserver(([entry]) => {
      setBoxSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) })
    })
    observer.observe(frameBox.current)
    return () => observer.disconnect()
  }, [])

  async function start() {
    if (!window.isSecureContext) { setError('Abre la aplicación mediante HTTPS.'); return }
    const generation = ++lifetime.current
    setStarting(true)
    setError('')
    try {
      const allowed = await requestSensors()
      const opened = await openCamera(settings.resolution)
      if (generation !== lifetime.current || !video.current) { closeCamera(opened); return }
      stream.current = opened
      video.current.srcObject = opened
      for (const track of opened.getVideoTracks()) {
        const interrupted = () => {
          if (stream.current !== opened) return
          setReady(false)
          stream.current = null
          closeCamera(opened)
          setError('La cámara se interrumpió. Actívala de nuevo.')
        }
        track.addEventListener('ended', interrupted)
        track.addEventListener('mute', interrupted)
      }
      await video.current.play()
      if (generation !== lifetime.current || stream.current !== opened) return
      setMotionAllowed(allowed)
      setReady(true)
    } catch (cause) {
      if (generation !== lifetime.current) return
      if (stream.current) closeCamera(stream.current)
      stream.current = null
      setReady(false)
      setError(message(cause))
    } finally {
      if (generation === lifetime.current) setStarting(false)
    }
  }
  function calibrateCamera() {
    try {
      if (!first && Math.abs(screenAngle()) !== 0) throw new Error('Inicia la sesión con el iPhone en vertical.')
      calibrate(first?.actual ?? { yaw: 0, pitch: 0, roll: 0 }, first?.screenAngle ?? 0)
      setReference(first ? 'Referencia de la foto #' + first.targetId : 'Horizonte inicial')
      setError('')
    } catch (cause) { setError(message(cause)) }
  }

  async function shoot(manual: boolean) {
    const sample = latest.current
    if (active.current || !ready || !target || !calibrated || !sample || !video.current || document.hidden) return
    const time = performance.now()
    if (sample.screenAngle !== screenAngle() || time - sample.time > 250) return
    const frameAligned = distance(sample.pose, target) <= settings.tolerance
      && (Math.abs(target.pitch) === 90 || Math.abs(wrap(sample.pose.roll - target.roll)) <= 8)
    const frameStable = isStable(sample)
    if (!manual && (!frameAligned || !frameStable || existing)) return
    active.current = true
    setBusy(true)
    setError('')
    try {
      const measuredStableMs = stableSince.current == null ? 0 : Math.round(time - stableSince.current)
      const frame = grabFrame(video.current)
      const timeOfCapture = new Date().toISOString()
      const neighbor = session.captures.filter(item => item.targetId !== target.id)
        .map(item => ({ item, distance: distance(sample.pose, item.actual) }))
        .sort((a, b) => a.distance - b.distance)[0]?.item
      const comparison = neighbor && (geometricOverlap(sample.pose, neighbor.actual, settings) ?? 0) >= 10
        ? compareFrames(frame, neighbor.photo).then(result => ({ ...result, neighborTargetId: neighbor.targetId })).catch(() => undefined)
        : undefined
      const [photo, metrics, visualComparison] = await Promise.all([jpeg(frame), quality(frame), comparison])
      if (!frameAligned) metrics.warnings.push('Fuera de tolerancia angular')
      if (!frameStable) metrics.warnings.push('Posible movimiento en la toma')
      const updated = await saveCapture(session.id, {
        targetId: target.id, actual: sample.pose, photo, time: timeOfCapture,
        width: frame.width, height: frame.height, screenAngle: sample.screenAngle,
        motion: sample.motion, stableMs: frameStable && frameAligned ? measuredStableMs : 0, angularSpeed: Number.isFinite(sample.speed) ? sample.speed : null,
        quality: metrics, visualComparison,
      })
      onUpdate(updated)
      stableSince.current = null
      setStableMs(0)
      setTarget(next(updated))
    } catch (cause) { setError(message(cause)) }
    finally { active.current = false; setBusy(false) }
  }

  const updateStability = useEffectEvent(() => {
    const sample = latest.current
    const now = performance.now()
    if (!ready || !calibrated || !target || !sample || now - sample.time > 250
      || sample.screenAngle !== screenAngle() || !isStable(sample) || busy || document.hidden
      || distance(sample.pose, target) > settings.tolerance
      || (Math.abs(target.pitch) !== 90 && Math.abs(wrap(sample.pose.roll - target.roll)) > 8)) {
      stableSince.current = null
      setStableMs(0)
      return
    }
    stableSince.current ??= now
    const elapsed = Math.round(now - stableSince.current)
    setStableMs(Math.min(elapsed, settings.stability))
    if (settings.automatic && elapsed >= settings.stability && !existing && !error) void shoot(false)
  })
  useEffect(() => {
    const timer = window.setInterval(() => updateStability(), 40)
    return () => window.clearInterval(timer)
  }, [])

  async function download() {
    setExporting(true)
    setError('')
    try { await exportSession(session) }
    catch (cause) { setError(message(cause)) }
    finally { setExporting(false) }
  }
  const progress = Math.round(session.captures.length / session.targets.length * 100)
  return <>
    <div className="section-head session-heading"><div><h1>{session.room}</h1><p>{session.establishment} · {session.point}</p></div>
      <button className="button subtle" disabled={!session.captures.length || exporting || busy} onClick={() => void download()}><Download size={18}/>{exporting ? 'Preparando…' : 'ZIP'}</button>
    </div>
    <section className="viewfinder" ref={frameBox}>
      <video ref={video} autoPlay muted playsInline aria-label="Vista previa de la cámara trasera" onResize={event => setVideoSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}/>
      {!ready && <div className="camera-placeholder"><Camera size={44}/><button className="button primary" disabled={starting} onClick={() => void start()}>{starting ? 'Solicitando permisos…' : 'Activar cámara y sensores'}</button></div>}
      {ready && <>
        <div className={'crosshair ' + (aligned ? 'good' : '')}><Crosshair size={35}/></div>
        {preview && <div className={'target-marker ' + (aligned ? 'good' : '')} style={{left: preview.left + '%', top: preview.top + '%'}} />}
        <div className="camera-top"><span>{target ? 'Objetivo #' + target.id : 'Secuencia completa'}</span><span>{angularError != null && calibrated ? angularError.toFixed(1) + '°' : '—'}</span></div>
        <div className="camera-bottom">
          {!calibrated ? <button className="button primary" onClick={calibrateCamera}>Calibrar orientación</button>
            : target && <><strong>{aligned ? (stable ? 'Mantén el iPhone quieto' : 'Estabiliza el iPhone') : angularError != null && angularError <= settings.tolerance ? 'Nivela el iPhone' : [preview && Math.abs(preview.x) > 0.025 ? (preview.x > 0 ? '→ Gira a la derecha' : '← Gira a la izquierda') : '', preview && Math.abs(preview.y) > 0.025 ? (preview.y > 0 ? '↑ Sube el iPhone' : '↓ Baja el iPhone') : ''].filter(Boolean).join(' · ') || 'Centra la mira'}</strong>
              <progress aria-label="Estabilidad" max={settings.stability} value={stableMs}/>
              <button className="button primary" disabled={busy || !reading || (settings.automatic && !existing && !error)} onClick={() => { if (settings.automatic && !existing) { setError(''); return } void shoot(true) }}><Camera size={18}/>{busy ? 'Guardando…' : existing ? 'Repetir foto' : settings.automatic && error ? 'Reintentar automático' : 'Capturar'}</button></>}
        </div>
      </>}
    </section>
    {error && <p className="alert" role="alert">{error}</p>}
    {ready && calibrationNotice && <p className="alert" role="status">{calibrationNotice}</p>}
    {ready && !calibrated && <p className="alert">{first ? 'Si cambió la pantalla, vuelve a la posición original. Desde el mismo punto, encuadra la referencia de la foto #' + first.targetId + ' antes de calibrar.' : 'Pon el iPhone en vertical y apunta al horizonte con el teléfono nivelado. Si no llegan datos, revisa el permiso de orientación en Safari.'}</p>}
    <div className="panel status">
      <div className="section-head"><strong>{session.captures.length} / {session.targets.length} fotos</strong><span>{progress}% de la secuencia</span></div>
      <progress aria-label="Progreso de fotos" max={100} value={progress}/>
      {ready && <div className="section-head"><span><Move size={15}/> {videoSize.width || '—'} × {videoSize.height || '—'}</span><button className="text-button" onClick={calibrateCamera}><RotateCcw size={15}/> Recalibrar</button></div>}
      {ready && (!motionAllowed || !reading?.motion) && <p className="warn">Sin datos recientes de movimiento. La estabilidad se estima con la orientación.</p>}
      {first && anchorUrl && <details><summary>Ver foto de referencia para recalibrar</summary><img className="anchor-photo" src={anchorUrl} alt="Encuadre de referencia de la sesión"/></details>}
      {calibrated && reference && <p className="muted">{reference}. Si la guía se desvía, vuelve a encuadrar la referencia antes de recalibrar.</p>}
      {existing?.visualComparison && <p>Comparación visual con foto #{existing.visualComparison.neighborTargetId} · {existing.visualComparison.estimatedOverlapPercent == null
        ? 'Sin evidencia suficiente para estimar superposición'
        : existing.visualComparison.estimatedOverlapPercent.toFixed(0) + '% de superposición estimada'}</p>}
      {existing?.quality.warnings.map(warning => <p className="warn" key={warning}>{warning}</p>)}
    </div>
    <CoverageMap session={session} selected={target?.id} onSelect={item => {
      if (busy) return
      stableSince.current = null
      setStableMs(0)
      setTarget(item)
    }}/>
    <p className="muted"><CircleHelp size={16}/> La superposición geométrica se estima con la orientación y el campo de visión. La estimación visual requiere coincidencias suficientes entre fotos vecinas.</p>
  </>
}

