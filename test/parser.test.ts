import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { DataFactory, Message, Parser, StreamParser, isMessageQuad, quadToString, termFromId, termToString, toMessages, type MessageQuad, type QuadLike } from '../src';

function ids(input: string, baseIRI = 'http://example.org/'): string[] {
  return ((new Parser({ baseIRI }).parse(input) ?? []) as QuadLike[]).map(quadToString);
}

function messageIds(messages: Message[]): string[][] {
  return messages.map(message => Array.from(message, quadToString));
}

async function writeChunk(parser: StreamParser, chunk: string | Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    parser.write(chunk, error => error ? reject(error) : resolve());
  });
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
    const quads = (new Parser({ factory: DataFactory }).parse('<s> <p> "o" .') ?? []) as QuadLike[];
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

  it('emits complete statements before the stream ends', async () => {
    const parser = new StreamParser({ baseIRI: 'http://example.org/' });
    const output: string[] = [];
    parser.on('data', quad => output.push(quadToString(quad)));

    await writeChunk(parser, '<a> <b> <c>. ');
    expect(output).toEqual(['<http://example.org/a> <http://example.org/b> <http://example.org/c> .']);

    await writeChunk(parser, '<d> <e>');
    expect(output).toEqual(['<http://example.org/a> <http://example.org/b> <http://example.org/c> .']);

    await writeChunk(parser, ' <f>. ');
    expect(output).toEqual([
      '<http://example.org/a> <http://example.org/b> <http://example.org/c> .',
      '<http://example.org/d> <http://example.org/e> <http://example.org/f> .',
    ]);

    await new Promise<void>((resolve, reject) => {
      parser.on('error', reject);
      parser.on('end', resolve);
      parser.end();
    });
  });

  it('preserves parser state across incremental stream parses', async () => {
    const parser = new StreamParser();
    const prefixes: string[] = [];
    const output: string[] = [];
    parser.on('prefix', prefix => prefixes.push(prefix));
    parser.on('data', quad => output.push(quadToString(quad)));

    await writeChunk(parser, '@prefix ex: <http://example.com/>. ');
    expect(prefixes).toEqual(['ex']);
    expect(output).toEqual([]);

    await writeChunk(parser, 'ex:s ex:p ex:o. ');
    expect(output).toEqual(['<http://example.com/s> <http://example.com/p> <http://example.com/o> .']);

    await new Promise<void>((resolve, reject) => {
      parser.on('error', reject);
      parser.on('end', resolve);
      parser.end();
    });
  });

  it('decodes UTF-8 characters split across chunks', async () => {
    const parser = new StreamParser({ baseIRI: 'http://example.org/' });
    const output: string[] = [];
    const input = Buffer.from('<s> <p> "café". ', 'utf8');
    const split = input.indexOf(0xC3) + 1;
    parser.on('data', quad => output.push(quadToString(quad)));

    await writeChunk(parser, input.subarray(0, split));
    expect(output).toEqual([]);
    await writeChunk(parser, input.subarray(split));
    expect(output).toEqual(['<http://example.org/s> <http://example.org/p> "café" .']);

    await new Promise<void>((resolve, reject) => {
      parser.on('error', reject);
      parser.on('end', resolve);
      parser.end();
    });
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

describe('RDF Messages', () => {
  it('emits message counters when a version label enables RDF Messages', () => {
    const output = new Parser({ baseIRI: 'http://example.org/' }).parse(`
      VERSION "1.2-messages"
      <s1> <p> <o1> .
      MESSAGE
      <s2> <p> <o2> .
    `) ?? [];

    expect(output.every(isMessageQuad)).toBe(true);
    const entries = output as MessageQuad[];
    expect(entries.map(entry => entry.messageCounter)).toEqual([0, 1]);
    expect(entries.map(entry => quadToString(entry.quad))).toEqual([
      '<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .',
      '<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .',
    ]);
  });

  it('supports explicit RDF Messages mode without an inline version label', () => {
    const output = new Parser({ baseIRI: 'http://example.org/', rdfMessages: true }).parse('<s1> <p> <o1> . MESSAGE <s2> <p> <o2> .') ?? [];
    expect((output as MessageQuad[]).map(entry => entry.messageCounter)).toEqual([0, 1]);
  });

  it('groups parser output into Message arrays and preserves empty messages', () => {
    const output = new Parser({ baseIRI: 'http://example.org/' }).parse(`
      VERSION "1.2-messages"
      MESSAGE
      <s1> <p> <o1> .
      MESSAGE
      MESSAGE
      <s2> <p> <o2> .
      MESSAGE
    `) ?? [];

    const messages = toMessages(output);
    expect(messages.every(message => message instanceof Message)).toBe(true);
    expect(messages.map(message => message.messageCounter)).toEqual([0, 1, 2, 3]);
    expect(messageIds(messages)).toEqual([
      [],
      ['<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .'],
      [],
      ['<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .'],
    ]);
  });

  it('parses messages directly with parseMessages()', () => {
    const messages = new Parser({ baseIRI: 'http://example.org/' }).parseMessages(`
      VERSION "1.2-messages"
      <s1> <p> <o1> .
      MESSAGE
      <s2> <p> <o2> .
    `);

    expect(messageIds(messages)).toEqual([
      ['<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .'],
      ['<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .'],
    ]);
  });

  it('supports @version and @message with repeated prefixes', () => {
    const messages = new Parser().parseMessages(`
      @version "1.2-messages" .
      @prefix ex: <http://example.org/one/> .
      ex:s ex:p ex:o .
      @message .
      @prefix ex: <http://example.org/two/> .
      ex:s ex:p ex:o .
    `);

    expect(messageIds(messages)).toEqual([
      ['<http://example.org/one/s> <http://example.org/one/p> <http://example.org/one/o> .'],
      ['<http://example.org/two/s> <http://example.org/two/p> <http://example.org/two/o> .'],
    ]);
  });

  it('preserves N-Quads graph names in messages', () => {
    const messages = new Parser({ format: 'n-quads' }).parseMessages(`
      VERSION "1.2-messages"
      <http://example.org/s1> <http://example.org/p> <http://example.org/o1> <http://example.org/g1> .
      MESSAGE
      <http://example.org/s2> <http://example.org/p> <http://example.org/o2> <http://example.org/g2> .
    `);

    expect(messageIds(messages)).toEqual([
      ['<http://example.org/s1> <http://example.org/p> <http://example.org/o1> <http://example.org/g1> .'],
      ['<http://example.org/s2> <http://example.org/p> <http://example.org/o2> <http://example.org/g2> .'],
    ]);
  });

  it('supports default-graph and named-graph quads in one message', () => {
    const messages = new Parser().parseMessages(`
      VERSION "1.2-messages"
      PREFIX ex: <http://example.org/>
      ex:s1 ex:p ex:o1 .
      ex:g {
        ex:s2 ex:p ex:o2 .
        ex:s3 ex:p ex:o3 .
      }
      MESSAGE
      ex:s4 ex:p ex:o4 .
    `);

    expect(messageIds(messages)).toEqual([
      [
        '<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .',
        '<http://example.org/s2> <http://example.org/p> <http://example.org/o2> <http://example.org/g> .',
        '<http://example.org/s3> <http://example.org/p> <http://example.org/o3> <http://example.org/g> .',
      ],
      ['<http://example.org/s4> <http://example.org/p> <http://example.org/o4> .'],
    ]);
  });

  it('accepts a message boundary after a graph block', () => {
    const messages = new Parser().parseMessages(`
      VERSION "1.2-messages"
      <http://example.org/g> {
        <http://example.org/a> <http://example.org/b> <http://example.org/c> .
      }
      MESSAGE
      <http://example.org/d> <http://example.org/e> <http://example.org/f> .
    `);

    expect(messageIds(messages)).toEqual([
      ['<http://example.org/a> <http://example.org/b> <http://example.org/c> <http://example.org/g> .'],
      ['<http://example.org/d> <http://example.org/e> <http://example.org/f> .'],
    ]);
  });

  it('scopes blank node labels per message', () => {
    const messages = new Parser({ rdfMessages: true }).parseMessages(`
      _:b0 <http://example.org/p> <http://example.org/o1> .
      MESSAGE
      _:b0 <http://example.org/p> <http://example.org/o2> .
    `);

    const first = messages[0]?.[0]?.subject;
    const second = messages[1]?.[0]?.subject;
    expect(first?.termType).toBe('BlankNode');
    expect(second?.termType).toBe('BlankNode');
    expect(first?.equals(second)).toBe(false);
  });

  it('rejects message delimiters without RDF Messages mode', () => {
    expect(() => new Parser().parse('<http://example.org/s> <http://example.org/p> <http://example.org/o> . MESSAGE')).toThrow(/RDF Messages are not enabled/);
  });

  it('rejects @message without a trailing dot', () => {
    expect(() => new Parser().parse('VERSION "1.2-messages" <http://example.org/s> <http://example.org/p> <http://example.org/o> . @message <http://example.org/invalid>')).toThrow(/Expected \./);
  });

  it('rejects message delimiters inside graph blocks', () => {
    expect(() => new Parser().parse(`
      VERSION "1.2-messages"
      <http://example.org/g> {
        <http://example.org/a> <http://example.org/b> <http://example.org/c> .
        MESSAGE
      }
    `)).toThrow(/inside graph blocks/);
  });

  it('streams message entries and emits messageCounter events', async () => {
    const parser = new StreamParser({ baseIRI: 'http://example.org/' });
    const entries: MessageQuad[] = [];
    const counters: number[] = [];
    parser.on('messageCounter', counter => counters.push(counter));

    await new Promise<void>((resolve, reject) => {
      parser.on('data', entry => entries.push(entry));
      parser.on('error', reject);
      parser.on('end', resolve);
      parser.import(Readable.from(['VERSION "1.2-messages"\n<s1> <p> <o1> .\nMESSAGE\n<s2> <p> <o2> .']));
    });

    expect(counters).toEqual([0, 1]);
    expect(entries.map(entry => entry.messageCounter)).toEqual([0, 1]);
    expect(entries.map(entry => quadToString(entry.quad))).toEqual([
      '<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .',
      '<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .',
    ]);
  });
});
