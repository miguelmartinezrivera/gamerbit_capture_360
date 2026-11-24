export async function openCamera(resolution: 'max' | '1080' | '720') {
  if (!window.isSecureContext) throw new Error('Abre la aplicación mediante HTTPS para usar la cámara.')
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('La cámara no está disponible en este navegador.')
  const [width, height] = resolution === 'max' ? [8192, 8192] : resolution === '1080' ? [1920, 1080] : [1280, 720]
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { exact: 'environment' }, width: { ideal: width }, height: { ideal: height } },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') throw new Error('Permiso de cámara denegado.', { cause: error })
    throw new Error('No se pudo abrir la cámara trasera. Comprueba que esté disponible y que otra aplicación no la esté usando.', { cause: error })
  }
}
export function closeCamera(stream: MediaStream) {
  stream.getTracks().forEach(track => track.stop())
}
export function grabFrame(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context || !canvas.width || video.readyState < 2) throw new Error('La cámara todavía no tiene una imagen disponible.')
  context.drawImage(video, 0, 0)
  return canvas
}
export function jpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('No se pudo codificar la fotografía.')), 'image/jpeg', 0.94))
}
