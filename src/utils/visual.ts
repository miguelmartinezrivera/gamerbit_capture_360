interface Feature { x: number; y: number; descriptor: number[] }
type Pair = [Feature, Feature]
export interface VisualMatch {
  matches: number
  inliers: number
  estimatedOverlapPercent: number | null
}
const size = 192

export function extractFeatures(pixels: ImageData): Feature[] {
  const gray = new Float32Array(size * size)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.21 * pixels.data[4 * i] + 0.72 * pixels.data[4 * i + 1] + 0.07 * pixels.data[4 * i + 2]
  }
  const candidates = []
  for (let y = 8; y < size - 8; y += 2) {
    for (let x = 8; x < size - 8; x += 2) {
      let xx = 0, yy = 0, xy = 0
      for (let j = -2; j <= 2; j++) {
        for (let k = -2; k <= 2; k++) {
          const i = (y + j) * size + x + k
          const dx = gray[i + 1] - gray[i - 1], dy = gray[i + size] - gray[i - size]
          xx += dx * dx
          yy += dy * dy
          xy += dx * dy
        }
      }
      const score = (xx * yy - xy * xy) / (xx + yy + 1)
      if (score > 500) candidates.push({ x, y, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const features: Feature[] = []
  for (const { x, y } of candidates) {
    if (features.some(feature => Math.hypot(x - feature.x, y - feature.y) < 8)) continue
    const patch = []
    for (let j = -6; j <= 6; j += 2) {
      for (let k = -6; k <= 6; k += 2) patch.push(gray[(y + j) * size + x + k])
    }
    const mean = patch.reduce((sum, value) => sum + value, 0) / patch.length
    const norm = Math.hypot(...patch.map(value => value - mean))
    if (norm > 35) features.push({ x, y, descriptor: patch.map(value => (value - mean) / norm) })
    if (features.length === 100) break
  }
  return features
}

function nearest(feature: Feature, candidates: Feature[]) {
  let best: Feature | undefined
  let first = Infinity, second = Infinity
  for (const candidate of candidates) {
    let error = 0
    for (let i = 0; i < feature.descriptor.length; i++) error += (feature.descriptor[i] - candidate.descriptor[i]) ** 2
    if (error < first) { second = first; first = error; best = candidate }
    else if (error < second) second = error
  }
  return first < 0.5 && first < 0.64 * second ? best : undefined
}

function affine([a, b]: Pair, [c, d]: Pair, [e, f]: Pair) {
  const ux = c.x - a.x, uy = c.y - a.y, vx = e.x - a.x, vy = e.y - a.y
  const det = ux * vy - uy * vx
  if (Math.abs(det) < 150) return null
  const ax = ((d.x - b.x) * vy - (f.x - b.x) * uy) / det
  const bx = (ux * (f.x - b.x) - vx * (d.x - b.x)) / det
  const ay = ((d.y - b.y) * vy - (f.y - b.y) * uy) / det
  const by = (ux * (f.y - b.y) - vx * (d.y - b.y)) / det
  const scale = ax * by - bx * ay
  if (scale < 0.6 || scale > 1.65 || Math.hypot(ax, ay, bx, by) > 2.2) return null
  return (x: number, y: number) => [b.x + ax * (x - a.x) + bx * (y - a.y), b.y + ay * (x - a.x) + by * (y - a.y)]
}
export function compare(first: ImageData, second: ImageData): VisualMatch {
  const a = extractFeatures(first), b = extractFeatures(second)
  const pairs: Pair[] = a.flatMap(feature => {
    const match = nearest(feature, b)
    return match && nearest(match, a) === feature ? [[feature, match]] : []
  })
  let best: ReturnType<typeof affine> = null
  let inliers: Pair[] = []
  const limit = Math.min(22, pairs.length)
  for (let i = 0; i < limit; i++) for (let j = i + 1; j < limit; j++) for (let k = j + 1; k < limit; k++) {
    const project = affine(pairs[i], pairs[j], pairs[k])
    if (!project) continue
    const hits = pairs.filter(([source, destination]) => {
      const [x, y] = project(source.x, source.y)
      return Math.hypot(x - destination.x, y - destination.y) <= 4
    })
    if (hits.length > inliers.length) { best = project; inliers = hits }
  }
  let estimatedOverlapPercent: number | null = null
  const x = inliers.map(([point]) => point.x), y = inliers.map(([point]) => point.y)
  if (best && inliers.length >= 10 && inliers.length >= pairs.length * 0.65
    && Math.max(...x) - Math.min(...x) >= 36 && Math.max(...y) - Math.min(...y) >= 36) {
    let inside = 0
    for (let row = 2; row < size; row += 4) for (let col = 2; col < size; col += 4) {
      const [u, v] = best(col, row)
      if (u >= 0 && u < size && v >= 0 && v < size) inside++
    }
    estimatedOverlapPercent = inside / (size / 4) ** 2 * 100
  }
  return { matches: pairs.length, inliers: inliers.length, estimatedOverlapPercent }
}
