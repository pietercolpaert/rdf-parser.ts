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
export { Writer } from 'rdf-writer-ts';

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
} from '../index';
export type { WriterOptions, WriterOutputStream } from 'rdf-writer-ts';

import type { NamedNodeLike, ParserOptions, ParserOutputItem, QuadLike } from '../index';

type BrowserStreamChunk = string | Uint8Array | ArrayBuffer;

export type StreamParserOptions = ParserOptions;

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
