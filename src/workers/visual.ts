import { compare } from '../utils/visual.ts'
self.addEventListener('message', (event: MessageEvent<[ImageData, ImageData]>) => {
  self.postMessage(compare(...event.data))
})
