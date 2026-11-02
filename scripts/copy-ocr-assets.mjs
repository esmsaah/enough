// Copy the on-device OCR engine and language data into public/ocr, so photos and
// scanned PDFs are read without any outside request (brief §11.3). Runs before build.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(process.cwd(), 'public', 'ocr');
mkdirSync(out, { recursive: true });
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const tess = pkgDir('tesseract.js');
copyFileSync(join(tess, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
const core = pkgDir('tesseract.js-core');
for (const f of ['tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm', 'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm']) {
  copyFileSync(join(core, f), join(out, f));
}
// Latin (English + Croatian for č ć š ž đ) and Cyrillic (Serbian), fast integer models.
for (const lang of ['eng', 'hrv', 'srp']) {
  const src = join(pkgDir(`@tesseract.js-data/${lang}`), '4.0.0_best_int', `${lang}.traineddata.gz`);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  copyFileSync(src, join(out, `${lang}.traineddata.gz`));
}
console.log('OCR assets copied to public/ocr');
