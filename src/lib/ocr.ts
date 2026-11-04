// On-device OCR with Tesseract.js. The engine, WASM core, and English model are served
// from this app's own /ocr folder, so images are read in the browser and never uploaded.

import Tesseract, { type Worker } from 'tesseract.js'
import type { OcrLine } from './parse'

type Progress = (p: { status: string; progress: number }) => void

let workerPromise: Promise<Worker> | null = null
let progressHandler: Progress | null = null

function assetUrl(path: string) {
  return new URL(import.meta.env.BASE_URL + path, window.location.origin).href
}

export function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await Tesseract.createWorker('eng', 1, {
        workerPath: assetUrl('ocr/worker.min.js'),
        corePath: assetUrl('ocr/core'),
        langPath: assetUrl('ocr/lang'),
        gzip: true,
        cacheMethod: 'none',
        logger: (m: { status: string; progress: number }) => progressHandler?.(m),
      })
      await w.setParameters({
        tessedit_pageseg_mode: '11' as never, // sparse text: finds text anywhere on an app screen
        preserve_interword_spaces: '1',
      })
      return w
    })().catch((e) => {
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

export async function terminateWorker() {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null)
    workerPromise = null
    await w?.terminate()
  }
}

// ------------------------------------------------------------ image loading

export class UnsupportedImageError extends Error {}

function isHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

/** Decodes PNG, JPG, WEBP, and HEIC (converted on-device) into an ImageBitmap. */
export async function loadImage(file: File): Promise<ImageBitmap> {
  let blob: Blob = file
  if (isHeic(file)) {
    try {
      // Safari can decode HEIC natively; other browsers need the converter.
      return await createImageBitmap(file)
    } catch {
      try {
        const heic2any = (await import('heic2any')).default
        const out = await heic2any({ blob: file, toType: 'image/png' })
        blob = Array.isArray(out) ? out[0] : out
      } catch {
        throw new UnsupportedImageError('This HEIC photo could not be opened in this browser.')
      }
    }
  }
  try {
    return await createImageBitmap(blob)
  } catch {
    throw new UnsupportedImageError('This file could not be opened as an image.')
  }
}

/**
 * Prepares a frame for OCR: scales to a readable width, converts to grayscale, and
 * inverts dark-mode screens so text is dark on light.
 */
export function prepareCanvas(src: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const target = width < 900 ? 1100 : width > 1800 ? 1500 : width
  const scale = target / width
  const c = document.createElement('canvas')
  c.width = Math.round(width * scale)
  c.height = Math.round(height * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, c.width, c.height)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  let total = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
    total += g
  }
  const dark = total / (d.length / 4) < 110
  if (dark) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i]
  ctx.putImageData(img, 0, 0)
  return c
}

// ------------------------------------------------------------ recognition

interface Word {
  text: string
  conf: number
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Rebuilds visual rows from word boxes, so a right-aligned amount joins its merchant name. */
export function wordsToLines(words: Word[]): OcrLine[] {
  const ws = words
    .filter((w) => w.text.trim() && !(w.conf < 35 && !/[a-z0-9$]/i.test(w.text)))
    .sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)
  const rows: { y0: number; y1: number; words: Word[] }[] = []
  for (const w of ws) {
    let best: (typeof rows)[number] | null = null
    let bestOverlap = 0
    for (const r of rows) {
      const overlap = Math.min(r.y1, w.y1) - Math.max(r.y0, w.y0)
      const h = Math.min(r.y1 - r.y0, w.y1 - w.y0)
      if (overlap > 0.5 * h && overlap > bestOverlap) {
        best = r
        bestOverlap = overlap
      }
    }
    if (best) {
      best.words.push(w)
      best.y0 = Math.min(best.y0, w.y0)
      best.y1 = Math.max(best.y1, w.y1)
    } else rows.push({ y0: w.y0, y1: w.y1, words: [w] })
  }
  return rows
    .sort((a, b) => a.y0 - b.y0)
    .map((r) => {
      const sorted = r.words.sort((a, b) => a.x0 - b.x0)
      const conf = sorted.reduce((s, w) => s + w.conf * w.text.length, 0) / Math.max(1, sorted.reduce((s, w) => s + w.text.length, 0))
      return { text: sorted.map((w) => w.text).join(' '), conf, y0: r.y0, y1: r.y1 }
    })
}

export async function recognize(canvas: HTMLCanvasElement, onProgress?: Progress): Promise<OcrLine[]> {
  const w = await getWorker()
  progressHandler = onProgress ?? null
  try {
    const { data } = await w.recognize(canvas, {}, { blocks: true, text: false })
    const words: Word[] = []
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const wd of l.words) words.push({ text: wd.text, conf: wd.confidence, ...wd.bbox })
    return wordsToLines(words)
  } finally {
    progressHandler = null
  }
}
