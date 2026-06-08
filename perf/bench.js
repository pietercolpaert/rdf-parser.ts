#!/usr/bin/env node
'use strict';

const { Parser } = require('../dist');
const { Parser: N3Parser } = require('n3');
const { parseEyelingRdf12Count } = require('./eyeling-count');
let graphyNQuadsRead = null;
try {
  graphyNQuadsRead = require('@graphy/content.nq.read');
} catch {
  // Optional benchmark dependency.
}

const DEFAULT_SIZES = [10_000, 100_000, 1_000_000];

function parseArgs(argv) {
  const args = { sizes: DEFAULT_SIZES, includeN3: true, includeGraphy: true, includeEyeling: true, includeTripleTerms: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--sizes') args.sizes = argv[++i].split(',').map(Number);
    else if (arg.startsWith('--sizes=')) args.sizes = arg.slice('--sizes='.length).split(',').map(Number);
    else if (arg === '--no-n3') args.includeN3 = false;
    else if (arg === '--no-graphy') args.includeGraphy = false;
    else if (arg === '--no-eyeling') args.includeEyeling = false;
    else if (arg === '--no-triple-terms') args.includeTripleTerms = false;
    else if (arg === '--triple-terms') args.includeTripleTerms = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function iri(local) {
  return `<http://example.org/${local}>`;
}

function generateSyntheticNQuads(count, options = {}) {
  const includeTripleTerms = options.includeTripleTerms !== false;
  const lines = new Array(count);
  for (let i = 0; i < count; i++) {
    const s = iri(`s${i}`);
    const p = iri(`p${i % 17}`);
    const g = iri(`g${i % 11}`);
    switch (i % 8) {
      case 0:
        lines[i] = `${s} ${p} ${iri(`o${i}`)} .`;
        break;
      case 1:
        lines[i] = `${s} ${p} "literal ${i}" .`;
        break;
      case 2:
        lines[i] = `${s} ${p} "${i}"^^<http://www.w3.org/2001/XMLSchema#integer> ${g} .`;
        break;
      case 3:
        lines[i] = `${s} ${p} "hello ${i}"@en ${g} .`;
        break;
      case 4:
        lines[i] = `${s} ${p} "${i}.5"^^<http://www.w3.org/2001/XMLSchema#decimal> .`;
        break;
      case 5:
        lines[i] = `${s} ${p} "true"^^<http://www.w3.org/2001/XMLSchema#boolean> ${g} .`;
        break;
      case 6:
        lines[i] = includeTripleTerms
          ? `${s} ${iri('assertedBy')} <<(${s} ${p} ${iri(`o${i}`)})>> ${g} .`
          : `${s} ${iri('assertedBy')} "source ${i}" ${g} .`;
        break;
      default:
        lines[i] = includeTripleTerms
          ? `${s} ${p} <<(${iri(`nested${i}`)} ${iri('knows')} "friend ${i}")>> ${g} .`
          : `${s} ${p} "friend ${i}" ${g} .`;
        break;
    }
  }
  return `${lines.join('\n')}\n`;
}

function generateSyntheticTriG(count, options = {}) {
  const includeTripleTerms = options.includeTripleTerms !== false;
  const defaultGraph = [];
  const namedGraphs = new Map();
  const addNamedGraphStatement = (graph, statement) => {
    let statements = namedGraphs.get(graph);
    if (!statements) {
      statements = [];
      namedGraphs.set(graph, statements);
    }
    statements.push(statement);
  };

  for (let i = 0; i < count; i++) {
    const s = iri(`s${i}`);
    const p = iri(`p${i % 17}`);
    const g = iri(`g${i % 11}`);
    switch (i % 8) {
      case 0:
        defaultGraph.push(`${s} ${p} ${iri(`o${i}`)} .`);
        break;
      case 1:
        defaultGraph.push(`${s} ${p} "literal ${i}" .`);
        break;
      case 2:
        addNamedGraphStatement(g, `${s} ${p} "${i}"^^<http://www.w3.org/2001/XMLSchema#integer> .`);
        break;
      case 3:
        addNamedGraphStatement(g, `${s} ${p} "hello ${i}"@en .`);
        break;
      case 4:
        defaultGraph.push(`${s} ${p} "${i}.5"^^<http://www.w3.org/2001/XMLSchema#decimal> .`);
        break;
      case 5:
        addNamedGraphStatement(g, `${s} ${p} "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .`);
        break;
      case 6:
        addNamedGraphStatement(g, includeTripleTerms
          ? `${s} ${iri('assertedBy')} <<(${s} ${p} ${iri(`o${i}`)})>> .`
          : `${s} ${iri('assertedBy')} "source ${i}" .`);
        break;
      default:
        addNamedGraphStatement(g, includeTripleTerms
          ? `${s} ${p} <<(${iri(`nested${i}`)} ${iri('knows')} "friend ${i}")>> .`
          : `${s} ${p} "friend ${i}" .`);
        break;
    }
  }
  const lines = [...defaultGraph];
  for (const [graph, statements] of namedGraphs) {
    lines.push(`${graph} {\n${statements.join('\n')}\n}`);
  }
  return `${lines.join('\n')}\n`;
}

async function bench(label, input, run) {
  if (global.gc) global.gc();
  const startMemory = process.memoryUsage().rss;
  const start = process.hrtime.bigint();
  const parsed = await run();
  const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
  const endMemory = process.memoryUsage().rss;
  const triplesPerSecond = parsed / elapsedSeconds;
  return {
    label,
    parsed,
    seconds: elapsedSeconds,
    triplesPerSecond,
    mbInput: Buffer.byteLength(input) / 1024 / 1024,
    mbRssDelta: (endMemory - startMemory) / 1024 / 1024,
  };
}

function printResult(size, result) {
  console.log([
    String(size).padStart(9),
    result.label.padEnd(20),
    `${result.seconds.toFixed(3)}s`.padStart(10),
    `${Math.round(result.triplesPerSecond).toLocaleString()} q/s`.padStart(18),
    `${result.mbInput.toFixed(1)} MiB`.padStart(12),
    `${result.mbRssDelta.toFixed(1)} MiB RSSΔ`.padStart(16),
  ].join('  '));
}

function parseWithN3(input) {
  const parser = new N3Parser({ format: 'N-Quads' });
  return parser.parse(input).length;
}

function parseWithGraphy(input, relax) {
  if (!graphyNQuadsRead) throw new Error('@graphy/content.nq.read is not installed');
  return new Promise((resolve, reject) => {
    let parsed = 0;
    const timeout = setTimeout(() => reject(new Error('Graphy parser timed out')), 120_000);
    let reader;
    try {
      reader = graphyNQuadsRead(input, { relax });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
      return;
    }
    reader.on('data', () => { parsed++; });
    reader.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    reader.on('end', () => {
      clearTimeout(timeout);
      resolve(parsed);
    });
  });
}

function parseWithEyeling(input) {
  return parseEyelingRdf12Count(input, { label: '<benchmark>' });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('     size  parser                   time          throughput       input        memory');
  console.log('---------  --------------------  ----------  ------------------  ------------  ----------------');
  if (args.includeTripleTerms && args.includeGraphy) {
    console.log('# Note: Graphy 4.x N-Quads readers do not parse RDF1.2 triple terms; use --no-triple-terms for direct Graphy numbers.');
  }
  for (const size of args.sizes) {
    const input = generateSyntheticNQuads(size, { includeTripleTerms: args.includeTripleTerms });
    const eyelingInput = args.includeEyeling
      ? args.includeTripleTerms
        ? generateSyntheticTriG(size, { includeTripleTerms: true })
        : input
      : '';
    // Warm up both parser implementations on a small prefix of the generated data.
    const warmupInput = input.split('\n').slice(0, Math.min(1000, size)).join('\n');
    const warmupEyelingInput = eyelingInput.split('\n').slice(0, Math.min(1000, size)).join('\n');
    new Parser({ format: 'N-Quads' }).parse(warmupInput);
    new Parser({ format: 'N-Quads', relax: true }).parse(warmupInput);
    if (args.includeN3) {
      try { parseWithN3(warmupInput); } catch { /* Older N3 versions may reject RDF1.2 triple terms. */ }
    }
    if (args.includeGraphy && !args.includeTripleTerms) {
      try { await parseWithGraphy(warmupInput, true); } catch { /* Graphy may reject generated input if unsupported. */ }
    }
    if (args.includeEyeling) {
      try { await parseWithEyeling(warmupEyelingInput); } catch { /* Eyeling may reject generated input if unsupported. */ }
    }

    const own = await bench('rdf-parser-ts', input, () => (new Parser({ format: 'N-Quads' }).parse(input) || []).length);
    printResult(size, own);

    const ownRelax = await bench('rdf-parser-ts/relax', input, () => (new Parser({ format: 'N-Quads', relax: true }).parse(input) || []).length);
    printResult(size, ownRelax);

    if (args.includeN3) {
      try {
        const n3 = await bench('n3', input, () => parseWithN3(input));
        printResult(size, n3);
      } catch (error) {
        console.log(`${String(size).padStart(9)}  ${'n3'.padEnd(20)}  skipped: ${error.message}`);
      }
    }

    if (args.includeGraphy) {
      if (args.includeTripleTerms) {
        console.log(`${String(size).padStart(9)}  ${'graphy'.padEnd(20)}  skipped: RDF1.2 triple terms not supported by @graphy/content.nq.read`);
      } else {
        try {
          const graphy = await bench('graphy', input, () => parseWithGraphy(input, false));
          printResult(size, graphy);
        } catch (error) {
          console.log(`${String(size).padStart(9)}  ${'graphy'.padEnd(20)}  skipped: ${error.message}`);
        }
        try {
          const graphyRelax = await bench('graphy/relax', input, () => parseWithGraphy(input, true));
          printResult(size, graphyRelax);
        } catch (error) {
          console.log(`${String(size).padStart(9)}  ${'graphy/relax'.padEnd(20)}  skipped: ${error.message}`);
        }
      }
    }

    if (args.includeEyeling) {
      try {
        const eyeling = await bench('eyeling/rdf', eyelingInput, () => parseWithEyeling(eyelingInput));
        printResult(size, eyeling);
      } catch (error) {
        console.log(`${String(size).padStart(9)}  ${'eyeling/rdf'.padEnd(20)}  skipped: ${error.message}`);
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
