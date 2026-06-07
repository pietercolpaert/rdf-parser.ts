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

  const declarations = `export {\n  BlankNode,\n  DataFactory,\n  DefaultGraph,\n  IncrementalParser,\n  Literal,\n  Message,\n  NamedNode,\n  Parser,\n  Quad,\n  Variable,\n  blankNode,\n  defaultGraph,\n  isMessageQuad,\n  literal,\n  namedNode,\n  quad,\n  quadToString,\n  termFromId,\n  termToId,\n  termToString,\n  toMessages,\n  variable,\n} from '../index';\n\nexport type {\n  BlankNodeLike,\n  DataFactoryLike,\n  DefaultGraphLike,\n  LiteralLike,\n  MessageQuad,\n  MessageQuadArray,\n  NamedNodeLike,\n  ParseCallback,\n  ParserEventCallbacks,\n  ParserOptions,\n  ParserOutput,\n  ParserOutputItem,\n  QuadLike,\n  StreamParserOptions,\n  Term,\n  TermLike,\n  TermType,\n  VariableLike,\n} from '../index';\n\nimport type { NamedNodeLike, ParserOutputItem, QuadLike, StreamParserOptions } from '../index';\n\ntype BrowserStreamChunk = string | Uint8Array | ArrayBuffer;\n\nexport declare class StreamParser {\n  readonly readable: ReadableStream<ParserOutputItem>;\n  readonly writable: WritableStream<BrowserStreamChunk>;\n  constructor(options?: StreamParserOptions);\n  import(stream: ReadableStream<BrowserStreamChunk>): ReadableStream<ParserOutputItem>;\n  on(event: 'prefix', listener: (prefix: string, iri: NamedNodeLike) => void): this;\n  on(event: 'comment', listener: (comment: string) => void): this;\n  on(event: 'messageCounter', listener: (counter: number, quad: QuadLike) => void): this;\n  addEventListener(event: 'prefix', listener: (prefix: string, iri: NamedNodeLike) => void): this;\n  addEventListener(event: 'comment', listener: (comment: string) => void): this;\n  addEventListener(event: 'messageCounter', listener: (counter: number, quad: QuadLike) => void): this;\n}\n`;
  fs.writeFileSync(path.join(outdir, 'index.d.ts'), declarations);
  fs.writeFileSync(path.join(outdir, 'index.d.mts'), declarations);
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
