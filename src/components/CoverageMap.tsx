import { useMemo } from 'react'
import type { Session, Target } from '../types/capture.ts'
import { coverage } from '../utils/geometry.ts'

export function CoverageMap({ session, selected, onSelect }: {
  session: Session; selected?: number; onSelect: (target: Target) => void
}) {
  const captures = useMemo(() => new Map(session.captures.map(capture => [capture.targetId, capture])), [session.captures])
  const score = useMemo(() => coverage(session.captures.map(capture => capture.actual), session.settings), [session])
  const rings = useMemo(() => session.targets.reduce((groups, target) => { const ring = groups.get(target.pitch) ?? []; ring.push(target); groups.set(target.pitch, ring); return groups }, new Map<number, Target[]>()), [session.targets])
  return <section className="panel map">
    <div className="section-head"><h2>Cobertura esférica</h2><strong>{score.toFixed(1)}% estimada</strong></div>
    <p>Área de la esfera incluida en las fotos guardadas, según el campo de visión configurado.</p>
    <div className="ring-list">
      {[...rings].sort(([a], [b]) => b - a).map(([pitch, targets]) => <div className="ring" key={pitch}>
        <span>{pitch === 90 ? 'Techo' : pitch === -90 ? 'Suelo' : pitch === 0 ? 'Horizonte' : pitch.toFixed(0) + '°'}</span>
        <div>{[...targets].sort((a, b) => a.yaw - b.yaw).map(target => {
          const photo = captures.get(target.id)
          const status = !photo ? 'Pendiente' : photo.quality.warnings.length ? 'Revisar' : 'Capturada'
          const label = '#' + target.id + ' · ' + target.yaw.toFixed(0) + '° / ' + target.pitch.toFixed(0) + '° · ' + status
          return <button type="button" key={target.id} className={'dot ' + status.toLowerCase()} aria-pressed={selected === target.id} title={label} aria-label={label} onClick={() => onSelect(target)} />
        })}</div>
      </div>)}
    </div>
    <div className="legend"><span>● Pendiente</span><span className="good">● Capturada</span><span className="warn">● Revisar</span></div>
  </section>
}

