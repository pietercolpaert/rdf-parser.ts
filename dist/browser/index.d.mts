export {
  BlankNode,
  DataFactory,
  DefaultGraph,
  IncrementalParser,
  Literal,
  Message,
  NamedNode,
  Parser,
  Quad,
  Variable,
  blankNode,
  defaultGraph,
  isMessageQuad,
  literal,
  namedNode,
  quad,
  quadToString,
  termFromId,
  termToId,
  termToString,
  toMessages,
  variable,
} from '../index';

export type {
  BlankNodeLike,
  DataFactoryLike,
  DefaultGraphLike,
  LiteralLike,
  MessageQuad,
  MessageQuadArray,
  NamedNodeLike,
  ParseCallback,
  ParserEventCallbacks,
  ParserOptions,
  ParserOutput,
  ParserOutputItem,
  QuadLike,
  Term,
  TermLike,
  TermType,
  VariableLike,
  WriterOptions,
} from '../index';

import type { NamedNodeLike, ParserOptions, ParserOutputItem, QuadLike, TermLike, WriterOptions } from '../index';

type BrowserStreamChunk = string | Uint8Array | ArrayBuffer;
type BrowserWriterOutputStream = {
  write(chunk: string, encoding?: string, callback?: (error?: Error | null) => void): unknown;
  end(callback?: (error?: Error | null, output?: string) => void): unknown;
};
type BrowserWriterEndCallback = (error?: Error | null, output?: string) => void;

export type StreamParserOptions = ParserOptions;

export declare class Writer {
  constructor(options?: WriterOptions);
  constructor(outputStream: BrowserWriterOutputStream, options?: WriterOptions);
  quadToString(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike): string;
  quadsToString(quads: Iterable<QuadLike>): string;
  addQuad(quad: QuadLike, done?: (error?: Error | null) => void): void;
  addQuad(subject: TermLike, predicate: TermLike, object: TermLike, done?: (error?: Error | null) => void): void;
  addQuad(subject: TermLike, predicate: TermLike, object: TermLike, graph: TermLike, done?: (error?: Error | null) => void): void;
  addQuads(quads: Iterable<QuadLike>): void;
  addPrefix(prefix: string, iri: string | NamedNodeLike, done?: (error?: Error | null) => void): void;
  addPrefixes(prefixes: Record<string, string | NamedNodeLike>, done?: (error?: Error | null) => void): void;
  blank(): TermLike;
  blank(children: Array<{ predicate: TermLike; object: TermLike }>): TermLike;
  blank(child: { predicate: TermLike; object: TermLike }): TermLike;
  blank(predicate: TermLike, object: TermLike): TermLike;
  list(elements?: TermLike[]): TermLike;
  end(done?: BrowserWriterEndCallback): void;
}

export declare class StreamParser {
  readonly readable: ReadableStream<ParserOutputItem>;
  readonly writable: WritableStream<BrowserStreamChunk>;
  constructor(options?: StreamParserOptions);
  import(stream: ReadableStream<BrowserStreamChunk>): ReadableStream<ParserOutputItem>;
  on(event: 'prefix', listener: (prefix: string, iri: NamedNodeLike) => void): this;
  on(event: 'comment', listener: (comment: string) => void): this;
  on(event: 'messageCounter', listener: (counter: number, quad: QuadLike) => void): this;
  addEventListener(event: 'prefix', listener: (prefix: string, iri: NamedNodeLike) => void): this;
  addEventListener(event: 'comment', listener: (comment: string) => void): this;
  addEventListener(event: 'messageCounter', listener: (counter: number, quad: QuadLike) => void): this;
}
