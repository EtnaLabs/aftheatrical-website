#!/usr/bin/env node

/**
 * Image Optimization Script for AF Theatricals
 *
 * Generates WebP and AVIF variants at multiple sizes for hero images,
 * and optimized versions of the Peppino poster and wallpaper.
 *
 * Usage:
 *   npm install sharp
 *   node scripts/optimize-images.js
 *
 * Output goes to assets/optimized/ ready for R2 upload.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const INPUT_DIR = path.resolve(__dirname, '..', '.assets');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'assets', 'optimized');

const HERO_WIDTHS = [640, 1280, 1920];
const WEBP_QUALITY = 80;
const AVIF_QUALITY = 65;

// Hero images — assumes these exist at these paths relative to INPUT_DIR
// Adjust paths if your R2 sources are downloaded elsewhere
const HERO_IMAGES = [
  { name: 'hero3', ext: '.jpg' },
  { name: 'hero2', ext: '.jpg' },
  { name: 'disco', ext: '.jpg' },
];

// Single-size optimizations
const SINGLE_IMAGES = [
  { input: 'theater/peppino-impastato.png', output: 'peppino-impastato' },
  { input: 'logos/af-wallpaper.png', output: 'af-wallpaper' },
];

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function optimizeHeroImage(name, ext) {
  const inputPath = path.join(INPUT_DIR, 'hero', `${name}${ext}`);

  if (!fs.existsSync(inputPath)) {
    // Try downloading from R2 or look in alternative location
    const altPath = path.join(INPUT_DIR, `${name}${ext}`);
    if (!fs.existsSync(altPath)) {
      console.warn(`  Skipping ${name}${ext} — file not found at ${inputPath} or ${altPath}`);
      console.warn(`  Download from R2 first: https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/hero/${name}${ext}`);
      return;
    }
  }

  const actualPath = fs.existsSync(inputPath)
    ? inputPath
    : path.join(INPUT_DIR, `${name}${ext}`);

  const heroDir = path.join(OUTPUT_DIR, 'hero');
  await ensureDir(heroDir);

  for (const width of HERO_WIDTHS) {
    const base = `${name}-${width}w`;

    // WebP
    await sharp(actualPath)
      .resize(width)
      .webp({ quality: WEBP_QUALITY })
      .toFile(path.join(heroDir, `${base}.webp`));
    console.log(`  Created ${base}.webp`);

    // AVIF
    await sharp(actualPath)
      .resize(width)
      .avif({ quality: AVIF_QUALITY })
      .toFile(path.join(heroDir, `${base}.avif`));
    console.log(`  Created ${base}.avif`);

    // JPG fallback (optimized)
    await sharp(actualPath)
      .resize(width)
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(path.join(heroDir, `${base}.jpg`));
    console.log(`  Created ${base}.jpg`);
  }
}

async function optimizeSingleImage(inputRelPath, outputName) {
  const inputPath = path.join(INPUT_DIR, inputRelPath);

  if (!fs.existsSync(inputPath)) {
    console.warn(`  Skipping ${inputRelPath} — file not found at ${inputPath}`);
    console.warn(`  Download from R2 first: https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/${inputRelPath}`);
    return;
  }

  const outputSubdir = path.join(OUTPUT_DIR, path.dirname(inputRelPath));
  await ensureDir(outputSubdir);

  // WebP
  await sharp(inputPath)
    .webp({ quality: WEBP_QUALITY })
    .toFile(path.join(outputSubdir, `${outputName}.webp`));
  console.log(`  Created ${outputName}.webp`);

  // AVIF
  await sharp(inputPath)
    .avif({ quality: AVIF_QUALITY })
    .toFile(path.join(outputSubdir, `${outputName}.avif`));
  console.log(`  Created ${outputName}.avif`);
}

async function main() {
  console.log('AF Theatricals — Image Optimization\n');
  console.log(`Input:  ${INPUT_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  await ensureDir(OUTPUT_DIR);

  // Hero images
  console.log('Processing hero images...');
  for (const hero of HERO_IMAGES) {
    console.log(`\n  ${hero.name}${hero.ext}:`);
    await optimizeHeroImage(hero.name, hero.ext);
  }

  // Single images
  console.log('\nProcessing single images...');
  for (const img of SINGLE_IMAGES) {
    console.log(`\n  ${img.input}:`);
    await optimizeSingleImage(img.input, img.output);
  }

  console.log('\nDone! Upload contents of assets/optimized/ to R2,');
  console.log('then update index.html image paths to reference the new variants.');
  console.log('\nExample <picture> element for hero images:');
  console.log(`
<picture>
  <source type="image/avif"
    srcset="https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/optimized/hero/hero2-640w.avif 640w,
            https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/optimized/hero/hero2-1280w.avif 1280w,
            https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/optimized/hero/hero2-1920w.avif 1920w"
    sizes="(max-width: 768px) 100vw, 33vw">
  <source type="image/webp"
    srcset="https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/optimized/hero/hero2-640w.webp 640w,
            https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/optimized/hero/hero2-1280w.webp 1280w,
            https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/optimized/hero/hero2-1920w.webp 1920w"
    sizes="(max-width: 768px) 100vw, 33vw">
  <img src="https://pub-43545990593741a6b5e64edec34eabee.r2.dev/assets/optimized/hero/hero2-1920w.jpg"
    alt="AF Theatricals community"
    fetchpriority="high"
    width="1920" height="1280">
</picture>
  `);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
