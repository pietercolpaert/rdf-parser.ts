#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');

const eyelingRoot = path.dirname(require.resolve('eyeling/package.json'));
const { parseN3Text } = require(path.join(eyelingRoot, 'lib/multisource.js'));
const { internalTripleToRdfJsQuads } = require(path.join(eyelingRoot, 'lib/rdfjs.js'));

async function readTextStream(stream) {
  let text = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) text += chunk;
  return text;
}

async function readSource(source) {
  if (!source || source === '-') {
    return { text: await readTextStream(process.stdin), label: '<stdin>', baseIri: '' };
  }

  const resolved = path.resolve(source);
  return {
    text: await readTextStream(fs.createReadStream(resolved, { encoding: 'utf8' })),
    label: source,
    baseIri: pathToFileURL(resolved).toString(),
  };
}

function* rdfJsQuadsFromEyelingTriples(triples) {
  for (const triple of triples) {
    yield* internalTripleToRdfJsQuads(triple);
  }
}

async function countQuadStream(stream) {
  let count = 0;
  for await (const unusedQuad of stream) count += 1;
  return count;
}

async function parseEyelingRdf12Count(text, options = {}) {
  const document = parseN3Text(text, {
    baseIri: options.baseIri || '',
    label: options.label || '<input>',
    keepSourceArtifacts: false,
    rdf: true,
  });

  const quadStream = Readable.from(rdfJsQuadsFromEyelingTriples(document.triples), { objectMode: true });
  return countQuadStream(quadStream);
}

async function main(argv = process.argv.slice(2)) {
  const source = argv[0] || '-';
  const { text, label, baseIri } = await readSource(source);
  const count = await parseEyelingRdf12Count(text, { label, baseIri });
  process.stdout.write(`${count}\n`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { parseEyelingRdf12Count };
