// Copies the OCR engine (worker, WASM core, English model) into public/ocr so
// screenshots and recordings are read entirely in the browser, with no CDN calls.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'public', 'ocr')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'core'), { recursive: true })
mkdirSync(join(out, 'lang'), { recursive: true })

cpSync(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'))
const coreDir = join(root, 'node_modules/tesseract.js-core')
for (const f of readdirSync(coreDir)) {
  // Finfriend runs the LSTM engine only, which loads one of the *-lstm.wasm.js builds.
  if (f.startsWith('tesseract-core') && f.endsWith('-lstm.wasm.js')) {
    cpSync(join(coreDir, f), join(out, 'core', f))
  }
}
cpSync(
  join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
  join(out, 'lang', 'eng.traineddata.gz'),
)
console.log('OCR assets copied to public/ocr')
