import { useEffect, useRef, useState } from 'react'
import { cameraPose, readMotion, screenAngle } from '../services/sensors.ts'
import type { Motion, Pose, Target } from '../types/capture.ts'
import { basis, degrees, distance, dot, wrap } from '../utils/geometry.ts'

export interface Reading {
  pose: Pose; time: number; speed: number; screenAngle: number; motion: Motion | null
}
export function useOrientation() {
  const latest = useRef<Reading | null>(null)
  const offset = useRef<number | null>(null)
  const calibrationTime = useRef(0)
  const calibratedAngle = useRef<number | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [calibrationNotice, setCalibrationNotice] = useState('')
  const [calibrated, setCalibrated] = useState(false)

  useEffect(() => {
    let motion: { value: Motion; time: number } | null = null
    const movement = (event: DeviceMotionEvent) => { motion = { value: readMotion(event), time: performance.now() } }
    const orientation = (event: DeviceOrientationEvent) => {
      const angle = screenAngle()
      const previous = latest.current
      const pose = cameraPose(event, angle, previous ? wrap(previous.pose.yaw + (offset.current ?? 0)) : 0)
      if (!pose) return
      const time = performance.now()
      pose.yaw = wrap(pose.yaw - (offset.current ?? 0))
      const dt = previous ? (time - previous.time) / 1000 : 0
      const angularShift = previous ? distance(previous.pose, pose) : 0
      if (calibratedAngle.current != null && dt > 0 && dt < 0.12 && angularShift > 28) {
        offset.current = null
        calibratedAngle.current = null
        latest.current = null
        setCalibrated(false)
        setCalibrationNotice('Se detectó un salto en la orientación. Vuelve a calibrar.')
        return
      }
      const speed = previous && dt > 0 && dt < 0.5
        ? Math.max(angularShift, degrees(Math.acos(Math.max(-1, Math.min(1, dot(basis(previous.pose).up, basis(pose).up)))))) / dt
        : Infinity
      latest.current = { pose, time, speed, screenAngle: angle, motion: motion && time - motion.time < 500 ? motion.value : null }
    }
    const invalidate = () => {
      if (document.hidden) {
        offset.current = null
        calibratedAngle.current = null
        latest.current = null
        setCalibrated(false)
        setCalibrationNotice('La aplicación pasó a segundo plano. Vuelve a calibrar.')
      }
    }
    const timer = window.setInterval(() => {
      const sample = latest.current
      if (calibratedAngle.current != null && (screenAngle() !== calibratedAngle.current || performance.now() - (sample?.time ?? calibrationTime.current) > 800)) {
        offset.current = null
        calibratedAngle.current = null
        latest.current = null
        setCalibrated(false)
        setCalibrationNotice('La orientación de pantalla cambió o se perdió la señal. Vuelve a calibrar.')
      }
      setReading(latest.current && performance.now() - latest.current.time < 800 ? latest.current : null)
    }, 80)
    window.addEventListener('deviceorientation', orientation)
    window.addEventListener('devicemotion', movement)
    document.addEventListener('visibilitychange', invalidate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('deviceorientation', orientation)
      window.removeEventListener('devicemotion', movement)
      document.removeEventListener('visibilitychange', invalidate)
    }
  }, [])

  function calibrate(anchor: Pose | Target, expectedScreen: number) {
    const sample = latest.current
    if (!sample || performance.now() - sample.time > 500) throw new Error('Todavía no hay datos de orientación. Revisa los permisos o mueve suavemente el iPhone.')
    if (sample.screenAngle !== expectedScreen || screenAngle() !== expectedScreen) throw new Error('Vuelve a la orientación de pantalla original.')
    if (Math.abs(anchor.pitch - sample.pose.pitch) > 8 || Math.abs(wrap(anchor.roll - sample.pose.roll)) > 12) {
      throw new Error('Ajusta la inclinación y nivel de la cámara para que coincidan con la referencia.')
    }
    offset.current = wrap((offset.current ?? 0) + sample.pose.yaw - anchor.yaw)
    calibrationTime.current = performance.now()
    calibratedAngle.current = expectedScreen
    latest.current = null
    setReading(null)
    setCalibrationNotice('')
    setCalibrated(true)
  }
  return { reading, latest, calibrated, calibrate, calibrationNotice }
}
