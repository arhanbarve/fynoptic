#!/usr/bin/env node
// Visual regression harness for the Astro migration.
//
// --capture-baseline: screenshots the running site at every
// {page} x {theme} x {viewport} combination and stores them under
// tests/baseline/.
// --diff: re-captures the same matrix and compares each screenshot
// pixel-for-pixel against its tests/baseline/ counterpart. Any pair with
// more than 0.1% differing pixels is written to tests/visual-diff/<key>.png
// and the process exits non-zero.
//
// Run `npm run preview` first; that serves dist/ on the port BASE_URL expects.
//
// This originally captured the legacy plain-HTML site at the repo root, on a
// separate port, as the reference to port the Astro build against. Those files
// are gone, so a baseline is now Astro-against-Astro: useful for catching
// regressions between builds, useless as a migration oracle.

import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(ROOT, 'tests', 'baseline');
const DIFF_DIR = path.join(ROOT, 'tests', 'visual-diff');
// Defaults to `astro preview`, which serves dist/ on 4321. Override with
// BASE_URL to point at any other running build.
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4321';

// The list still names .html files from the pre-Astro layout, matching
// astro.config.mjs's build.format: 'file' output. Plus one article detail
// page, since /articles/<id> is a distinct template from the index.
const PAGES = [
  'index.html',
  'about.html',
  'articles.html',
  'courses.html',
  'courseone.html',
  'flashcard.html',
  'practice.html',
  'profile.html',
  'bot.html',
  'accessibility.html',
  'privacy.html',
  'articles/bnpl-real-rules.html',
];

const THEMES = ['dark', 'light'];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

// Max fraction of pixels allowed to differ before a page is flagged.
const DIFF_THRESHOLD_PCT = 0.1;

function keyFor(pageFile, theme, width) {
  const pageName = pageFile.replace(/\.html$/, '').replace(/\//g, '-');
  return `${pageName}-${theme}-${width}`;
}

async function scrollFullPage(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    let last = -1;
    for (let i = 0; i < 50; i++) {
      window.scrollBy(0, step);
      await new Promise((r) => setTimeout(r, 120));
      const pos = window.scrollY;
      if (pos === last) break;
      last = pos;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
}

// The homepage hero's rotating word and the partner logo marquee both
// animate. `reducedMotion: 'reduce'` (set below) already freezes both via
// this codebase's own CSS/JS handling of prefers-reduced-motion, but that's
// an implementation detail this script shouldn't depend on — paint a flat,
// deterministic mask over both regions directly so a future change to
// either animation can never make this comparator flaky.
async function maskAnimatedRegions(page) {
  await page.evaluate(() => {
    // The sticky <header> (position: sticky) is otherwise re-composited on
    // every tile of a full-page screenshot's scroll-and-stitch capture,
    // which Chromium doesn't always do bit-identically between two
    // independent runs — it shows up as a ghosted/duplicated header. Pin it
    // to the top of the document flow instead for the duration of the
    // screenshot; applied identically on every capture, so it doesn't
    // affect the comparison, only its reproducibility.
    const header = document.querySelector('.header');
    if (header) header.style.setProperty('position', 'static', 'important');

    // Same stitching problem, same fix: the position:fixed "back to top"
    // button (#back-to-top / #float-top, toggled visible by scroll
    // position) gets baked into whichever tile it happened to be visible
    // in during the scroll-and-stitch capture, at a scroll-dependent
    // location that isn't reproducible between two runs.
    const backToTop = document.querySelector('#back-to-top, #float-top');
    if (backToTop) backToTop.style.setProperty('display', 'none', 'important');

    const mask = (el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const box = document.createElement('div');
      box.setAttribute('data-visual-diff-mask', '1');
      box.style.cssText = [
        'position:absolute',
        `left:${rect.left + window.scrollX}px`,
        `top:${rect.top + window.scrollY}px`,
        `width:${rect.width}px`,
        `height:${rect.height}px`,
        'background:#808080',
        'z-index:2147483647',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(box);
    };
    // Rotating hero word (index.html only).
    mask(document.querySelector('#hero-heading'));
    // Partner logo marquee (index.html only).
    mask(document.querySelector('.logo-track'));
  });
}

/** Navigates, settles, masks, and screenshots one {page,theme,viewport} combo. Returns a PNG Buffer. */
async function captureOne(browser, pageFile, theme, viewport) {
  const errors = [];
  const context = await browser.newContext({ viewport });
  await context.addInitScript((themeValue) => {
    localStorage.setItem('fynoptic-theme', themeValue);
  }, theme);

  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(String(err));
  });

  await page.goto(`${BASE_URL}/${pageFile}`, { waitUntil: 'networkidle' });
  await scrollFullPage(page);
  await maskAnimatedRegions(page);

  const buffer = await page.screenshot({ fullPage: true });
  await context.close();
  return { buffer, errors };
}

async function captureBaseline() {
  await mkdir(BASELINE_DIR, { recursive: true });

  const consoleErrors = {};
  const browser = await chromium.launch();

  for (const pageFile of PAGES) {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        const key = keyFor(pageFile, theme, viewport.width);
        const { buffer, errors } = await captureOne(browser, pageFile, theme, viewport);

        await writeFile(path.join(BASELINE_DIR, `${key}.png`), buffer);
        consoleErrors[key] = errors;

        console.log(`captured ${key}.png (${errors.length} console error(s))`);
      }
    }
  }

  await browser.close();

  await writeFile(
    path.join(BASELINE_DIR, 'console-errors.json'),
    JSON.stringify(consoleErrors, null, 2),
  );

  await writeFile(
    path.join(BASELINE_DIR, 'url-surface.json'),
    JSON.stringify(PAGES, null, 2),
  );

  const total = PAGES.length * THEMES.length * VIEWPORTS.length;
  console.log(`\nBaseline capture complete: ${total} screenshots written to ${path.relative(ROOT, BASELINE_DIR)}/`);
}

async function diffAgainstBaseline() {
  await mkdir(DIFF_DIR, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  for (const pageFile of PAGES) {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        const key = keyFor(pageFile, theme, viewport.width);
        const baselinePath = path.join(BASELINE_DIR, `${key}.png`);

        let baselineRaw;
        try {
          baselineRaw = await readFile(baselinePath);
        } catch {
          results.push({ key, status: 'no-baseline' });
          console.log(`✗ ${key}: no baseline found at ${path.relative(ROOT, baselinePath)} — run --capture-baseline first`);
          continue;
        }

        const { buffer: currentRaw } = await captureOne(browser, pageFile, theme, viewport);

        const baseline = PNG.sync.read(baselineRaw);
        const current = PNG.sync.read(currentRaw);

        if (baseline.width !== current.width || baseline.height !== current.height) {
          results.push({ key, status: 'size-mismatch' });
          console.log(
            `✗ ${key}: dimensions changed (${baseline.width}x${baseline.height} -> ${current.width}x${current.height})`,
          );
          continue;
        }

        const { width, height } = baseline;
        const diff = new PNG({ width, height });
        const mismatched = pixelmatch(baseline.data, current.data, diff.data, width, height, {
          threshold: 0.1,
        });
        const pct = (mismatched / (width * height)) * 100;

        if (pct > DIFF_THRESHOLD_PCT) {
          const diffPath = path.join(DIFF_DIR, `${key}.png`);
          await writeFile(diffPath, PNG.sync.write(diff));
          results.push({ key, status: 'diff', pct, mismatched });
          console.log(`✗ ${key}: ${pct.toFixed(3)}% pixels differ (${mismatched}px) — wrote ${path.relative(ROOT, diffPath)}`);
        } else {
          results.push({ key, status: 'ok', pct, mismatched });
          console.log(`✓ ${key}: ${pct.toFixed(4)}% pixels differ`);
        }
      }
    }
  }

  await browser.close();

  const failures = results.filter((r) => r.status !== 'ok');
  console.log(`\n${results.length - failures.length}/${results.length} pages within the ${DIFF_THRESHOLD_PCT}% threshold.`);

  if (failures.length) {
    console.log(`${failures.length} page(s) failed:`);
    for (const f of failures) {
      console.log(`  - ${f.key}: ${f.status}${f.pct !== undefined ? ` (${f.pct.toFixed(3)}%)` : ''}`);
    }
    process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--capture-baseline')) {
    await captureBaseline();
    return;
  }

  if (args.includes('--diff')) {
    await diffAgainstBaseline();
    return;
  }

  console.error('Usage: node scripts/visual-diff.mjs --capture-baseline | --diff');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
