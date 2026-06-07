export {
  BlankNode,
  DataFactory,
  DefaultGraph,
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
} from './index';

export type {
  BlankNodeLike,
  DataFactoryLike,
  DefaultGraphLike,
  LiteralLike,
  MessageQuad,
  MessageQuadArray,
  NamedNodeLike,
  ParseCallback,
  ParserOptions,
  ParserOutput,
  ParserOutputItem,
  QuadLike,
  StreamParserOptions,
  Term,
  TermLike,
  TermType,
  VariableLike,
} from './index';

export class StreamParser {
  public constructor() {
    throw new Error('StreamParser is only available in Node.js builds; browser bundles support Parser string parsing only.');
  }
}
