import type { VisualMatch } from '../utils/visual.ts'

export interface Pose { yaw: number; pitch: number; roll: number }
export interface Target extends Pose { id: number }
export interface Settings {
  overlap: number; horizontal: number; vertical: number
  resolution: 'max' | '1080' | '720'; automatic: boolean
  tolerance: number; stability: number
}
export const defaults: Settings = {
  overlap: 50, horizontal: 48, vertical: 64, resolution: 'max',
  automatic: true, tolerance: 3, stability: 700,
}
export interface Motion {
  acceleration: { x: number; y: number; z: number } | null
  rotationSpeed: number | null
}
export interface Quality {
  laplacianVariance: number; meanLuminance: number
  shadowFraction: number; highlightFraction: number; warnings: string[]
}
export interface Capture {
  targetId: number; actual: Pose; photo: Blob; time: string
  width: number; height: number; screenAngle: number
  motion: Motion | null; stableMs: number; angularSpeed: number | null
  quality: Quality
  visualComparison?: VisualMatch & { neighborTargetId: number }
}
export interface Session {
  id: string; establishment: string; room: string; point: string; created: string
  settings: Settings; targets: Target[]; captures: Capture[]
}

