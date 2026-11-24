import type { Pose, Settings, Target } from '../types/capture.ts'

export const radians = (degrees: number) => degrees * Math.PI / 180
export const degrees = (rad: number) => rad * 180 / Math.PI
export const wrap = (angle: number) => ((angle % 360 + 540) % 360) - 180
type Vec = [number, number, number]
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export function direction(yaw: number, pitch: number): Vec {
  const y = radians(yaw), p = radians(pitch)
  return [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)]
}
export function basis({ yaw, pitch, roll }: Pose) {
  const y = radians(yaw), p = radians(pitch), r = radians(roll)
  const right: Vec = [Math.cos(y), 0, -Math.sin(y)]
  const up: Vec = [-Math.sin(y) * Math.sin(p), Math.cos(p), -Math.cos(y) * Math.sin(p)]
  const rotate = (a: Vec, b: Vec, angle: number): Vec => [
    a[0] * Math.cos(angle) + b[0] * Math.sin(angle),
    a[1] * Math.cos(angle) + b[1] * Math.sin(angle),
    a[2] * Math.cos(angle) + b[2] * Math.sin(angle),
  ]
  return { forward: direction(yaw, pitch), right: rotate(right, up, r), up: rotate(up, right, -r) }
}
export function distance(a: Pose, b: Pose) {
  return degrees(Math.acos(Math.max(-1, Math.min(1, dot(direction(a.yaw, a.pitch), direction(b.yaw, b.pitch))))))
}
export function generateTargets(settings: Settings): Target[] {
  const scale = 1 - settings.overlap / 100
  const halfV = settings.vertical * scale / 2
  const tanH = Math.tan(radians(settings.horizontal * scale / 2))
  const tanV = Math.tan(radians(halfV))
  const polarRadius = Math.min(settings.horizontal * scale / 2, halfV)
  const bands = Math.ceil(90 / Math.min(1.6 * halfV, 2 * polarRadius))
  const step = 90 / bands
  const targets: Target[] = []
  const add = (pitch: number, count: number, reverse = false) => {
    for (let i = 0; i < count; i++) {
      targets.push({ id: targets.length + 1, yaw: wrap((reverse ? -i : i) * 360 / count), pitch, roll: 0 })
    }
  }
  const ring = (pitch: number, reverse: boolean) => {
    const nearestEquator = Math.max(0, Math.abs(pitch) - step / 2)
    const c = Math.cos(radians(nearestEquator))
    const p = radians(pitch), latitudeError = radians(step / 2)
    // Bound the camera-space components for the entire latitude/longitude cell.
    const fits = (count: number) => {
      const azimuth = Math.PI / count
      const curvature = c * (1 - Math.cos(azimuth))
      const depth = Math.cos(latitudeError) - Math.cos(p) * curvature
      return depth > 0
        && c * Math.sin(azimuth) <= depth * tanH
        && Math.sin(latitudeError) + Math.abs(Math.sin(p)) * curvature <= depth * tanV
    }
    let count = 2
    while (!fits(count)) count++
    add(pitch, count, reverse)
  }
  ring(0, false)
  for (let i = 1; i < bands; i++) ring(i * step, i % 2 === 1)
  add(90, 1)
  for (let i = 1; i < bands; i++) ring(-i * step, i % 2 === 1)
  add(-90, 1)
  return targets
}

export function footprint(pose: Pose, settings: Settings) {
  const { right, up, forward } = basis(pose)
  const h = Math.tan(radians(settings.horizontal / 2)), v = Math.tan(radians(settings.vertical / 2))
  return (ray: Vec) => {
    const depth = dot(ray, forward)
    return depth > 0 && Math.abs(dot(ray, right)) <= depth * h && Math.abs(dot(ray, up)) <= depth * v
  }
}
export function sphereSamples(count: number): Vec[] {
  return Array.from({ length: count }, (_, i) =>
    direction(i * 137.50776405, degrees(Math.asin(1 - 2 * (i + 0.5) / count))))
}
const samples = sphereSamples(4096)
export function coverage(poses: Pose[], settings: Settings, rays = samples) {
  const visible = poses.map(pose => footprint(pose, settings))
  return rays.filter(ray => visible.some(contains => contains(ray))).length / rays.length * 100
}
export function geometricOverlap(a: Pose, b: Pose, settings: Settings) {
  const first = footprint(a, settings), second = footprint(b, settings)
  let area = 0, shared = 0
  for (const ray of samples) {
    if (!first(ray)) continue
    area++
    if (second(ray)) shared++
  }
  return area ? shared / area * 100 : null
}
