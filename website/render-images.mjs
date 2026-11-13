// Copyright (C) 2026 Alexandre Demartin
// The site's raster images, rendered from their SVG sources in public/ by headless Chrome (`CHROME`, or its macOS
// path), which loads the social card's fonts: social-card.png, 1200×630; apple-touch-icon.png, 180×180; favicon.ico,
// favicon.svg in its light theme at 16, 32 and 48px. Not part of the build: run `npm run docs:images` after changing a
// source, and commit what it writes.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const
  chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  pub = fileURLToPath(new URL('public/', import.meta.url)),
  tmp = mkdtempSync(join(tmpdir(), 'pgcast-images-'));

/**
 * An SVG of public/ as a PNG of `width`×`height`, transparent where it draws nothing. It is framed at that size: opened
 * on its own, it would fill Chrome's viewport, which stays about 500px wide however small the window.
 */
function render(svg, width, height) {
  const png = join(tmp, `${svg}-${width}.png`), page = join(tmp, `${svg}-${width}.html`);
  writeFileSync(page, '<!doctype html><style>body { margin: 0; } iframe { display: block; border: 0; }</style>' +
    `<iframe src="file://${join(pub, svg)}" width="${width}" height="${height}"></iframe>`);
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--user-data-dir=${join(tmp, 'profile')}`,
    '--virtual-time-budget=10000',  // time for the fonts the social card imports
    '--blink-settings=preferredColorScheme=1',  // light, whatever the system's theme (0 is dark)
    `--window-size=${width},${height}`, `--screenshot=${png}`, `file://${page}`,
  ], { stdio: 'ignore', timeout: 60_000 });
  const data = readFileSync(png);
  if (data.readUInt32BE(16) !== width || data.readUInt32BE(20) !== height)  // the PNG's IHDR
    throw new Error(`render-images.mjs: ${svg} came out ${data.readUInt32BE(16)}×${data.readUInt32BE(20)}, not ${width}×${height}`);
  return data;
}

/** An ICO of PNGs, one per size: its header, a directory entry for each, then the PNGs, as browsers read them. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);  // an icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);  // width, then height
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);  // colour planes
    header.writeUInt16LE(32, entry + 6);  // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

try {
  writeFileSync(join(pub, 'social-card.png'), render('social-card.svg', 1200, 630));
  writeFileSync(join(pub, 'apple-touch-icon.png'), render('apple-touch-icon.svg', 180, 180));
  writeFileSync(join(pub, 'favicon.ico'), ico([16, 32, 48].map(size => ({ size, data: render('favicon.svg', size, size) }))));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
