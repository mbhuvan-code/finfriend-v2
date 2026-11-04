// Reads a screen recording frame by frame, entirely in the browser.
// 1. Decode the video with the browser's own decoder (MP4, MOV, WEBM where supported).
// 2. Sample a frame every ~0.4s and skip frames that look the same as the last one kept.
// 3. OCR each kept frame, parse rows, then merge overlapping frames (see merge.ts).

import { prepareCanvas, recognize } from './ocr'
import { parseLines, type BalanceCandidate } from './parse'
import { mergeFrames, type MergeResult } from './merge'
import type { ISODate } from './dates'

export class VideoUnsupportedError extends Error {}

export const MAX_SECONDS = 180

function once(el: HTMLMediaElement, ok: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => cleanup(new VideoUnsupportedError('The video took too long to load.')), timeoutMs)
    const onOk = () => cleanup()
    const onErr = () => cleanup(new VideoUnsupportedError('This browser could not decode the video.'))
    function cleanup(err?: Error) {
      clearTimeout(t)
      el.removeEventListener(ok, onOk)
      el.removeEventListener('error', onErr)
      if (err) reject(err)
      else resolve()
    }
    el.addEventListener(ok, onOk)
    el.addEventListener('error', onErr)
  })
}

async function openVideo(file: File): Promise<{ video: HTMLVideoElement; url: string; duration: number }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await once(video, 'loadeddata')
    let duration = video.duration
    if (!Number.isFinite(duration)) {
      // Recordings made in the browser often report an unknown length until we seek to the end.
      video.currentTime = 1e7
      await once(video, 'seeked')
      duration = video.duration
      video.currentTime = 0
      await once(video, 'seeked')
    }
    if (!video.videoWidth || !Number.isFinite(duration) || duration <= 0) {
      throw new VideoUnsupportedError('This browser could not read frames from the video.')
    }
    return { video, url, duration }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e instanceof VideoUnsupportedError ? e : new VideoUnsupportedError('This browser could not decode the video.')
  }
}

function signature(src: CanvasImageSource): Float32Array {
  const c = document.createElement('canvas')
  c.width = 24
  c.height = 48
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, 24, 48)
  const d = ctx.getImageData(0, 0, 24, 48).data
  const out = new Float32Array(24 * 48)
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3
  return out
}

function difference(a: Float32Array, b: Float32Array) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

export interface VideoProgress {
  phase: 'loading' | 'sampling' | 'reading'
  done: number
  total: number
}

export interface VideoResult extends MergeResult {
  balances: BalanceCandidate[]
  framesRead: number
  duration: number
  signsSeen: { minus: number; plus: number }
}

export async function extractFromVideo(
  file: File,
  today: ISODate,
  onProgress: (p: VideoProgress) => void,
  isCancelled: () => boolean,
): Promise<VideoResult> {
  onProgress({ phase: 'loading', done: 0, total: 1 })
  const { video, url, duration } = await openVideo(file)
  try {
    const length = Math.min(duration, MAX_SECONDS)
    const step = 0.4
    const times: number[] = []
    for (let t = 0.05; t < length; t += step) times.push(t)

    // Sample frames and keep only the ones that changed.
    const kept: { time: number; canvas: HTMLCanvasElement }[] = []
    let last: Float32Array | null = null
    for (let i = 0; i < times.length; i++) {
      if (isCancelled()) throw new DOMException('Cancelled', 'AbortError')
      video.currentTime = times[i]
      await once(video, 'seeked')
      const sig = signature(video)
      if (last && difference(sig, last) < 1.5) continue
      last = sig
      kept.push({ time: times[i], canvas: prepareCanvas(video, video.videoWidth, video.videoHeight) })
      onProgress({ phase: 'sampling', done: i + 1, total: times.length })
    }

    const frames: { label: string; rows: ReturnType<typeof parseLines>['rows'] }[] = []
    const balances: BalanceCandidate[] = []
    const signsSeen = { minus: 0, plus: 0 }
    for (let i = 0; i < kept.length; i++) {
      if (isCancelled()) throw new DOMException('Cancelled', 'AbortError')
      onProgress({ phase: 'reading', done: i, total: kept.length })
      const label = fmtTime(kept[i].time)
      const lines = await recognize(kept[i].canvas)
      const parsed = parseLines(lines, today, label)
      frames.push({ label, rows: parsed.rows })
      signsSeen.minus += parsed.signsSeen.minus
      signsSeen.plus += parsed.signsSeen.plus
      for (const b of parsed.balances) if (!balances.some((x) => x.amount === b.amount)) balances.push(b)
      // Free each frame's pixels as soon as it's read.
      kept[i].canvas.width = kept[i].canvas.height = 0
    }
    onProgress({ phase: 'reading', done: kept.length, total: kept.length })
    const merged = mergeFrames(frames)
    return { ...merged, balances, framesRead: kept.length, duration, signsSeen }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
