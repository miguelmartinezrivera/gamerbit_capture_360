import type { Motion, Pose } from '../types/capture.ts'
import { basis, degrees, dot, radians, wrap } from '../utils/geometry.ts'

type PermissionAPI = { requestPermission?: () => Promise<string> }
export async function requestSensors() {
  const orientation = window.DeviceOrientationEvent as PermissionAPI | undefined
  const motion = window.DeviceMotionEvent as PermissionAPI | undefined
  if (!orientation) throw new Error('Este navegador no proporciona orientación.')
  const requests = [orientation.requestPermission?.(), motion?.requestPermission?.()]
  const [rotation, movement] = await Promise.allSettled(requests)
  if (rotation.status === 'rejected' || rotation.value === 'denied') throw new Error('Permiso de orientación denegado.')
  return movement.status === 'fulfilled' && movement.value !== 'denied'
}
export function screenAngle() {
  return wrap(screen.orientation?.angle ?? window.orientation ?? 0)
}
export function readMotion(event: DeviceMotionEvent): Motion {
  const a = event.acceleration
  const r = event.rotationRate
  return {
    acceleration: a && a.x != null && a.y != null && a.z != null ? { x: a.x, y: a.y, z: a.z } : null,
    rotationSpeed: r && r.alpha != null && r.beta != null && r.gamma != null ? Math.hypot(r.alpha, r.beta, r.gamma) : null,
  }
}
export function cameraPose(event: DeviceOrientationEvent, angle: number, nearPoleYaw = 0): Pose | null {
  if (event.alpha == null || event.beta == null || event.gamma == null) return null
  const a = radians(event.alpha), b = radians(event.beta), g = radians(event.gamma)
  const transform = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = Math.cos(g) * x + Math.sin(g) * z
    const z1 = -Math.sin(g) * x + Math.cos(g) * z
    const y2 = Math.cos(b) * y - Math.sin(b) * z1
    return [Math.cos(a) * x1 - Math.sin(a) * y2, Math.sin(b) * y + Math.cos(b) * z1, Math.sin(a) * x1 + Math.cos(a) * y2]
  }
  const [x, y, z] = transform(0, 0, -1)
  const yaw = Math.hypot(x, z) < 0.01 ? nearPoleYaw : degrees(Math.atan2(x, z))
  const pitch = degrees(Math.atan2(y, Math.hypot(x, z)))
  const s = radians(angle)
  const up = transform(-Math.sin(s), Math.cos(s), 0)
  const axes = basis({ yaw, pitch, roll: 0 })
  return { yaw, pitch, roll: wrap(degrees(Math.atan2(-dot(up, axes.right), dot(up, axes.up)))) }
}
