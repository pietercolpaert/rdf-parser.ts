#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const DEFAULT_QUADS = 100_000;
const DEFAULT_SAMPLES = 3;
const DEFAULT_THRESHOLD = 20;
const DEFAULT_CHUNK_SIZE = 64 * 1024;

function parseArgs(argv) {
	const args = {
		baseRef: process.env.PERF_BASE_REF || '',
		quads: Number(process.env.PERF_QUADS || DEFAULT_QUADS),
		samples: Number(process.env.PERF_SAMPLES || DEFAULT_SAMPLES),
		threshold: Number(process.env.PERF_THRESHOLD || DEFAULT_THRESHOLD),
		chunkSize: Number(process.env.PERF_CHUNK_SIZE || DEFAULT_CHUNK_SIZE),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--base-ref') args.baseRef = argv[++i];
		else if (arg.startsWith('--base-ref=')) args.baseRef = arg.slice('--base-ref='.length);
		else if (arg === '--quads') args.quads = Number(argv[++i]);
		else if (arg.startsWith('--quads=')) args.quads = Number(arg.slice('--quads='.length));
		else if (arg === '--samples') args.samples = Number(argv[++i]);
		else if (arg.startsWith('--samples=')) args.samples = Number(arg.slice('--samples='.length));
		else if (arg === '--threshold') args.threshold = Number(argv[++i]);
		else if (arg.startsWith('--threshold=')) args.threshold = Number(arg.slice('--threshold='.length));
		else if (arg === '--chunk-size') args.chunkSize = Number(argv[++i]);
		else if (arg.startsWith('--chunk-size=')) args.chunkSize = Number(arg.slice('--chunk-size='.length));
		else throw new Error(`Unknown argument: ${arg}`);
	}

	if (!Number.isFinite(args.quads) || args.quads <= 0) throw new Error('quads must be a positive number');
	if (!Number.isFinite(args.samples) || args.samples <= 0) throw new Error('samples must be a positive number');
	if (!Number.isFinite(args.threshold) || args.threshold <= 0) throw new Error('threshold must be a positive number');
	if (!Number.isFinite(args.chunkSize) || args.chunkSize <= 0) throw new Error('chunk-size must be a positive number');
	args.samples = Math.trunc(args.samples);
	args.quads = Math.trunc(args.quads);
	args.chunkSize = Math.trunc(args.chunkSize);
	return args;
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		encoding: 'utf8',
		stdio: options.stdio || 'pipe',
	});
	if (result.status !== 0) {
		const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
		throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
	}
	return (result.stdout || '').trim();
}

function canResolveGitRef(ref, cwd) {
	if (!ref) return false;
	const result = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd, stdio: 'ignore' });
	return result.status === 0;
}

function defaultBaseRef(cwd) {
	if (canResolveGitRef('HEAD', cwd)) return 'HEAD';
	return '';
}

function iri(local) {
	return `<http://example.org/${local}>`;
}

function generateSyntheticNQuads(count) {
	const lines = new Array(count);
	for (let i = 0; i < count; i++) {
		const s = iri(`s${i}`);
		const p = iri(`p${i % 17}`);
		const g = iri(`g${i % 11}`);
		switch (i % 4) {
			case 0:
				lines[i] = `${s} ${p} ${iri(`o${i}`)} .`;
				break;
			case 1:
				lines[i] = `${s} ${p} "literal ${i}" .`;
				break;
			case 2:
				lines[i] = `${s} ${p} "${i}"^^<http://www.w3.org/2001/XMLSchema#integer> ${g} .`;
				break;
			default:
				lines[i] = `${s} ${p} "hello ${i}"@en ${g} .`;
				break;
		}
	}
	return `${lines.join('\n')}\n`;
}

function* bufferChunks(buffer, chunkSize) {
	for (let i = 0; i < buffer.length; i += chunkSize) {
		yield buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
	}
}

function parseString(mod, input) {
	return (new mod.Parser({ format: 'n-quads' }).parse(input) || []).length;
}

function parseStream(mod, inputBuffer, chunkSize) {
	return new Promise((resolve, reject) => {
		let parsed = 0;
		const parser = new mod.StreamParser({ format: 'n-quads' });
		parser.on('data', () => { parsed++; });
		parser.on('error', reject);
		parser.on('end', () => resolve(parsed));
		Readable.from(bufferChunks(inputBuffer, chunkSize)).pipe(parser);
	});
}

async function bestThroughput(samples, quads, runOnce) {
	let best = 0;
	for (let i = 0; i < samples; i++) {
		if (global.gc) global.gc();
		const start = process.hrtime.bigint();
		const parsed = await runOnce();
		const seconds = Number(process.hrtime.bigint() - start) / 1e9;
		if (parsed !== quads) throw new Error(`Expected ${quads} quads, got ${parsed}`);
		best = Math.max(best, parsed / seconds);
	}
	return best;
}

function color(text, code) {
	if (process.env.NO_COLOR) return text;
	return `\u001B[${code}m${text}\u001B[0m`;
}

const green = text => color(text, 32);
const red = text => color(text, 31);
const yellow = text => color(text, 33);
const cyan = text => color(text, 36);

function formatQps(value) {
	return `${Math.round(value).toLocaleString()} q/s`;
}

function formatChange(value) {
	const text = `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
	if (value > 0) return green(text);
	if (value < 0) return red(text);
	return text;
}

function githubEscape(value) {
	return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function emitWarning(message) {
	console.warn(yellow(`WARNING: ${message}`));
	if (process.env.GITHUB_ACTIONS) {
		console.log(`::warning title=Performance regression::${githubEscape(message)}`);
	}
}

function printResults(results, threshold) {
	console.log('');
	console.log('scenario              baseline        current         change');
	console.log('--------------------  --------------  --------------  --------');
	for (const result of results) {
		const regression = result.change < -threshold;
		const label = regression ? red(result.label.padEnd(20)) : result.change > 0 ? green(result.label.padEnd(20)) : result.label.padEnd(20);
		console.log([
			label,
			formatQps(result.baseline).padStart(14),
			formatQps(result.current).padStart(14),
			formatChange(result.change).padStart(8),
		].join('  '));
	}
}

function setupBaseline(root, baseRef) {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rdf-parser-ts-perf-base-'));
	try {
		run('git', ['worktree', 'add', '--detach', tempRoot, baseRef], { cwd: root });
		const currentNodeModules = path.join(root, 'node_modules');
		if (fs.existsSync(currentNodeModules)) {
			fs.symlinkSync(currentNodeModules, path.join(tempRoot, 'node_modules'), 'dir');
		}
		run('npm', ['run', 'build'], { cwd: tempRoot, stdio: 'inherit', env: process.env });
		return tempRoot;
	} catch (error) {
		try { run('git', ['worktree', 'remove', '--force', tempRoot], { cwd: root }); } catch { /* ignore cleanup failure */ }
		throw error;
	}
}

function cleanupBaseline(root, tempRoot) {
	if (!tempRoot) return;
	try {
		run('git', ['worktree', 'remove', '--force', tempRoot], { cwd: root });
	} catch (error) {
		console.warn(yellow(`Could not remove temporary worktree ${tempRoot}: ${error.message}`));
	}
}

async function main() {
	const root = path.resolve(__dirname, '..');
	const args = parseArgs(process.argv.slice(2));
	const baseRef = args.baseRef || defaultBaseRef(root);

	if (!canResolveGitRef(baseRef, root)) {
		emitWarning(`Skipping performance regression check: base ref "${baseRef || '<empty>'}" is not available.`);
		return;
	}

	const currentDist = path.join(root, 'dist', 'index.js');
	if (!fs.existsSync(currentDist)) throw new Error('Current dist/index.js is missing. Run npm run build first.');

	console.log(cyan(`Quick performance regression check against ${baseRef}`));
	console.log(`Input: ${args.quads.toLocaleString()} N-Quads, samples: best of ${args.samples}, warning threshold: -${args.threshold}%`);

	let baselineRoot = '';
	try {
		baselineRoot = setupBaseline(root, baseRef);
		const current = require(currentDist);
		const baseline = require(path.join(baselineRoot, 'dist', 'index.js'));
		const input = generateSyntheticNQuads(args.quads);
		const inputBuffer = Buffer.from(input, 'utf8');

		// Warm both builds before timing so the quick check measures steady-state behavior rather than first-use module setup.
		const warmupInput = input.split('\n').slice(0, Math.min(1000, args.quads)).join('\n') + '\n';
		parseString(current, warmupInput);
		parseString(baseline, warmupInput);

		const scenarios = [
			{
				label: 'Parser.parse',
				runCurrent: () => parseString(current, input),
				runBaseline: () => parseString(baseline, input),
			},
			{
				label: `StreamParser ${Math.round(args.chunkSize / 1024)}KiB`,
				runCurrent: () => parseStream(current, inputBuffer, args.chunkSize),
				runBaseline: () => parseStream(baseline, inputBuffer, args.chunkSize),
			},
		];

		const results = [];
		for (const scenario of scenarios) {
			const baselineThroughput = await bestThroughput(args.samples, args.quads, scenario.runBaseline);
			const currentThroughput = await bestThroughput(args.samples, args.quads, scenario.runCurrent);
			const change = ((currentThroughput / baselineThroughput) - 1) * 100;
			results.push({ label: scenario.label, baseline: baselineThroughput, current: currentThroughput, change });
		}

		printResults(results, args.threshold);

		for (const result of results) {
			if (result.change < -args.threshold) {
				emitWarning(`${result.label} is ${Math.abs(result.change).toFixed(1)}% slower than ${baseRef} (${formatQps(result.current)} vs ${formatQps(result.baseline)}).`);
			}
		}
	} finally {
		cleanupBaseline(root, baselineRoot);
	}
}

main().catch(error => {
	console.error(red(error.stack || error.message));
	process.exitCode = 1;
});
