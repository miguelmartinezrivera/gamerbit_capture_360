import type { Quality } from '../types/capture.ts'
import { analyze } from '../workers/quality.worker.ts'

export function quality(frame: HTMLCanvasElement): Promise<Quality> {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 480 / Math.max(frame.width, frame.height))
  canvas.width = Math.max(3, Math.round(frame.width * scale))
  canvas.height = Math.max(3, Math.round(frame.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return new Promise(resolve => {
    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/analyze.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(analyze(pixels))
      return
    }
    const finish = (result?: Quality) => {
      window.clearTimeout(timeout)
      worker.terminate()
      resolve(result ?? analyze(pixels))
    }
    const timeout = window.setTimeout(() => finish(), 3000)
    worker.onmessage = (event: MessageEvent<Quality>) => finish(event.data)
    worker.onerror = () => finish()
    worker.postMessage(pixels)
  })
}
