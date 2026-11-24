import type { Quality } from '../types/capture.ts'

export function analyze(data: ImageData): Quality {
  const { width, height } = data
  const gray = new Float32Array(width * height)
  let light = 0, dark = 0, bright = 0
  for (let i = 0; i < gray.length; i++) {
    const value = 0.2126 * data.data[4 * i] + 0.7152 * data.data[4 * i + 1] + 0.0722 * data.data[4 * i + 2]
    gray[i] = value
    light += value
    if (value < 20) dark++
    if (value > 245) bright++
  }
  let sum = 0, squares = 0
  const count = (width - 2) * (height - 2)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const edge = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]
      sum += edge
      squares += edge * edge
    }
  }
  const laplacianVariance = Math.max(0, squares / count - (sum / count) ** 2)
  const meanLuminance = light / gray.length, shadowFraction = dark / gray.length, highlightFraction = bright / gray.length
  const warnings: string[] = []
  if (laplacianVariance < 45) warnings.push('Posible desenfoque o poca textura')
  if (meanLuminance < 45 || shadowFraction > 0.55) warnings.push('Posible subexposición')
  if (meanLuminance > 215 || highlightFraction > 0.40) warnings.push('Posible sobreexposición')
  return { laplacianVariance, meanLuminance, shadowFraction, highlightFraction, warnings }
}
