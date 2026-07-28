#!/usr/bin/env node
/**
 * Build: bundles the WebGL stage into a single self-hosted, tree-shaken,
 * minified ES module at assets/js/stage.js
 *
 * No CDN at runtime. Three.js is tree-shaken so only the classes actually
 * referenced by the stage end up in the shipped file.
 */
import { build, context } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const watch = process.argv.includes('--watch');

/** Strips comments + collapses whitespace inside GLSL template literals. */
const glslMinify = {
  name: 'glsl-minify',
  setup(b) {
    b.onLoad({ filter: /src[\\/]stage[\\/].*\.js$/ }, async (args) => {
      let code = await readFile(args.path, 'utf8');
      // Only touch tagged `glsl\`...\`` templates so JS is left alone.
      code = code.replace(/glsl`([\s\S]*?)`/g, (_m, src) => {
        const out = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n');
        return '`' + out + '`';
      });
      return { contents: code, loader: 'js' };
    });
  },
};

const options = {
  entryPoints: [resolve(root, 'src/stage/index.js')],
  outfile: resolve(root, 'assets/js/stage.js'),
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
  minify: true,
  treeShaking: true,
  legalComments: 'none',
  sourcemap: false,
  plugins: [glslMinify],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: '/* Delight Water Solutions — WebGL stage. Three.js (MIT) tree-shaken bundle. */',
  },
};

async function report() {
  const out = resolve(root, 'assets/js/stage.js');
  const buf = await readFile(out);
  const raw = (buf.length / 1024).toFixed(1);
  const gz = (gzipSync(buf).length / 1024).toFixed(1);
  console.log(`  ✓ ${relative(root, out)}  ${raw} KB raw · ${gz} KB gzip`);
}

await mkdir(resolve(root, 'assets/js'), { recursive: true });

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/stage …');
} else {
  const t0 = Date.now();
  const result = await build(options);
  if (result.errors.length) process.exit(1);
  console.log(`build ok in ${Date.now() - t0}ms`);
  await report();
}
