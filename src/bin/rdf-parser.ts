#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Parser, quadToString } from '../index';

function printUsage(): void {
  process.stderr.write(`Usage: rdf-parser-ts [--format FORMAT] [--base IRI] [file]\n\nParses RDF and writes canonical N-Quads/N-Triples-style lines to stdout.\nWhen no file is passed, input is read from stdin.\n`);
}

const args = process.argv.slice(2);
let format: string | undefined;
let baseIRI: string | undefined;
let file: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(0);
  }
  if (arg === '--format' || arg === '-f') {
    format = args[++i];
    continue;
  }
  if (arg === '--base' || arg === '-b') {
    baseIRI = args[++i];
    continue;
  }
  if (arg?.startsWith('--format=')) {
    format = arg.slice('--format='.length);
    continue;
  }
  if (arg?.startsWith('--base=')) {
    baseIRI = arg.slice('--base='.length);
    continue;
  }
  if (!file) {
    file = arg;
    continue;
  }
  throw new Error(`Unexpected argument: ${arg}`);
}

const input = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
const parser = new Parser({ format, baseIRI });
const quads = parser.parse(input) ?? [];
for (const quad of quads) process.stdout.write(`${quadToString(quad)}\n`);
