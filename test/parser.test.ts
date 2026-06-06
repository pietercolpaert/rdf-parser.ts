import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { DataFactory, Parser, StreamParser, quadToString, termFromId, termToString } from '../src';

function ids(input: string, baseIRI = 'http://example.org/'): string[] {
  return (new Parser({ baseIRI }).parse(input) ?? []).map(quadToString);
}

describe('Parser', () => {
  it('exports an N3-compatible parser constructor', () => {
    expect(Parser).toBeInstanceOf(Function);
    expect(new Parser()).toBeInstanceOf(Parser);
  });

  it('parses an empty document', () => {
    expect(ids(' \t\n # comment')).toEqual([]);
  });

  it('parses N-Triples and resolves relative IRIs against baseIRI', () => {
    expect(ids('<a> <b> <c>.')).toEqual([
      '<http://example.org/a> <http://example.org/b> <http://example.org/c> .',
    ]);
  });

  it('parses N-Quads', () => {
    expect(ids('<s> <p> "value" <g> .')).toEqual([
      '<http://example.org/s> <http://example.org/p> "value" <http://example.org/g> .',
    ]);
  });

  it('parses Turtle prefixes, literals, booleans, and numeric terms', () => {
    expect(ids('@prefix ex: <http://example.com/>. ex:s ex:p "hello"@EN; ex:n 42, 1.25, 1e2; a ex:T; ex:b true .')).toEqual([
      '<http://example.com/s> <http://example.com/p> "hello"@en .',
      '<http://example.com/s> <http://example.com/n> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .',
      '<http://example.com/s> <http://example.com/n> "1.25"^^<http://www.w3.org/2001/XMLSchema#decimal> .',
      '<http://example.com/s> <http://example.com/n> "1e2"^^<http://www.w3.org/2001/XMLSchema#double> .',
      '<http://example.com/s> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.com/T> .',
      '<http://example.com/s> <http://example.com/b> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .',
    ]);
  });

  it('parses TriG graph blocks', () => {
    expect(ids('@prefix ex: <http://example.com/>. ex:g { ex:s ex:p ex:o. }')).toEqual([
      '<http://example.com/s> <http://example.com/p> <http://example.com/o> <http://example.com/g> .',
    ]);
  });

  it('supports an RDF-JS factory override', () => {
    const quads = new Parser({ factory: DataFactory }).parse('<s> <p> "o" .') ?? [];
    expect(quads[0]?.subject.termType).toBe('NamedNode');
    expect(quads[0]?.object.termType).toBe('Literal');
    expect(quads[0]?.graph.termType).toBe('DefaultGraph');
  });

  it('converts terms to and from ids', () => {
    const term = termFromId('"hello"@en');
    expect(term.termType).toBe('Literal');
    expect(termToString(term)).toBe('"hello"@en');
  });
});

describe('StreamParser', () => {
  it('exports an N3-compatible stream parser constructor', () => {
    expect(StreamParser).toBeInstanceOf(Function);
    expect(new StreamParser()).toBeInstanceOf(StreamParser);
  });

  it('parses chunked streams', async () => {
    const parser = new StreamParser({ baseIRI: 'http://example.org/' });
    const input = Readable.from(['<a> <b>', ' <c>.\n', '<d> <e> <f>.']);
    const output: string[] = [];
    const sink = new Writable({
      objectMode: true,
      write(quad, _encoding, callback) {
        output.push(quadToString(quad));
        callback();
      },
    });

    await new Promise<void>((resolve, reject) => {
      parser.on('error', reject);
      sink.on('error', reject);
      sink.on('finish', resolve);
      parser.import(input).pipe(sink);
    });

    expect(output).toEqual([
      '<http://example.org/a> <http://example.org/b> <http://example.org/c> .',
      '<http://example.org/d> <http://example.org/e> <http://example.org/f> .',
    ]);
  });

  it('emits prefix and comment events', async () => {
    const prefixes: string[] = [];
    const comments: string[] = [];
    const parser = new StreamParser({ comments: true });
    parser.on('prefix', prefix => prefixes.push(prefix));
    parser.on('comment', comment => comments.push(comment));

    await new Promise<void>((resolve, reject) => {
      parser.on('data', () => undefined);
      parser.on('error', reject);
      parser.on('end', resolve);
      parser.import(Readable.from(['# hi\n@prefix ex: <http://example.com/>. ex:s ex:p ex:o.']));
    });

    expect(prefixes).toEqual(['ex']);
    expect(comments).toEqual([' hi']);
  });
});
