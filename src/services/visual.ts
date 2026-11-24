import { compare } from '../utils/visual.ts'
import type { VisualMatch } from '../utils/visual.ts'

function pixels(image: CanvasImageSource) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 192
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0, 192, 192)
  return ctx.getImageData(0, 0, 192, 192)
}

export async function compareFrames(frame: HTMLCanvasElement, neighbor: Blob): Promise<VisualMatch> {
  const url = URL.createObjectURL(neighbor)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
    const input = [pixels(frame), pixels(image)] as const
    return await new Promise((resolve) => {
      let worker: Worker
      try { worker = new Worker(new URL('../workers/visual.ts', import.meta.url), { type: 'module' }) }
      catch { resolve(compare(...input)); return }
      const finish = (value?: VisualMatch) => {
        window.clearTimeout(timeout)
        worker.terminate()
        resolve(value ?? compare(...input))
      }
      const timeout = window.setTimeout(() => finish(), 3000)
      worker.onmessage = (event: MessageEvent<VisualMatch>) => finish(event.data)
      worker.onerror = () => finish()
      worker.postMessage(input)
    })
  } finally { URL.revokeObjectURL(url) }
}
