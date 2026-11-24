import { analyze } from './quality.worker.ts'

self.addEventListener('message', (event: MessageEvent<ImageData>) => {
  self.postMessage(analyze(event.data))
})
