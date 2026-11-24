import type { Session } from '../types/capture.ts'
import { coverage, distance, geometricOverlap } from '../utils/geometry.ts'

export async function exportSession(session: Session) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const root = zip.folder('session_' + session.id)!
  const images = root.folder('images')!
  const captures = [...session.captures].sort((a, b) => a.targetId - b.targetId)
  const targets = new Map(session.targets.map(target => [target.id, target]))
  const photos = []
  for (const { photo, ...capture } of captures) {
    const filename = 'capture_' + String(capture.targetId).padStart(3, '0') + '.jpg'
    images.file(filename, await photo.arrayBuffer())
    photos.push({ ...capture, filename: 'images/' + filename, target: targets.get(capture.targetId) })
  }
  const maxDistance = Math.hypot(session.settings.horizontal, session.settings.vertical)
  const adjacentPairs = captures.flatMap((a, i) => captures.slice(i + 1).flatMap(b => {
    if (distance(a.actual, b.actual) >= maxDistance) return []
    const overlap = geometricOverlap(a.actual, b.actual, session.settings)
    return overlap != null && overlap >= 10
      ? [{ from: a.targetId, to: b.targetId, geometricOverlapPercent: overlap }]
      : []
  }))
  const { captures: stored, ...metadata } = session
  void stored
  root.file('metadata.json', JSON.stringify({
    schemaVersion: 1, ...metadata,
    sphericalCoveragePercent: coverage(captures.map(capture => capture.actual), session.settings),
    sphericalCoverageWithoutWarningsPercent: coverage(captures.filter(capture => !capture.quality.warnings.length).map(capture => capture.actual), session.settings),
    adjacentPairs, photos,
  }, null, 2))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'session_' + session.id + '.zip'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
