#!/usr/bin/env node
'use strict';

const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src', 'browser.ts');
const shim = path.join(root, 'src', 'browser-node-shims.ts');
const outdir = path.join(root, 'dist', 'browser');

const nodeShimPlugin = {
  name: 'node-browser-shims',
  setup(build) {
    build.onResolve({ filter: /^(node:stream|stream|node:string_decoder|string_decoder)$/ }, () => ({ path: shim }));
  },
};

async function build() {
  fs.mkdirSync(outdir, { recursive: true });
  const common = {
    entryPoints: [entry],
    bundle: true,
    minify: true,
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    legalComments: 'none',
    plugins: [nodeShimPlugin],
    logLevel: 'info',
  };

  await Promise.all([
    esbuild.build({
      ...common,
      format: 'esm',
      outfile: path.join(outdir, 'index.mjs'),
    }),
    esbuild.build({
      ...common,
      format: 'iife',
      globalName: 'RDFParserTS',
      outfile: path.join(outdir, 'index.global.js'),
    }),
  ]);
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
