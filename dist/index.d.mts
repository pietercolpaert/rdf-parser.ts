import { Transform, TransformOptions, Readable, TransformCallback } from 'node:stream';
import * as RDFJS from '@rdfjs/types';

type TermType = RDFJS.Term['termType'];
type Term = RDFJS.Term;
interface ParserOptions {
    baseIRI?: string;
    baseIRIPath?: string;
    format?: string;
    factory?: DataFactoryLike;
    comments?: boolean;
    relax?: boolean;
    rdfMessages?: boolean;
    messages?: boolean;
    parseUnsupportedVersions?: boolean;
    version?: string;
}
interface StreamParserOptions extends ParserOptions, TransformOptions {
}
interface DataFactoryLike {
    namedNode(value: string): NamedNodeLike;
    blankNode(value?: string): BlankNodeLike;
    literal(value: string, languageOrDatatype?: string | NamedNodeLike | RDFJS.DirectionalLanguage, datatype?: NamedNodeLike): LiteralLike;
    variable?(value: string): VariableLike;
    defaultGraph(): DefaultGraphLike;
    quad(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike): QuadLike;
}
type TermLike = RDFJS.Term;
type NamedNodeLike = RDFJS.NamedNode;
type BlankNodeLike = RDFJS.BlankNode;
type VariableLike = RDFJS.Variable;
type DefaultGraphLike = RDFJS.DefaultGraph;
type LiteralLike = RDFJS.Literal;
type QuadLike = RDFJS.BaseQuad;
interface MessageQuad {
    quad: QuadLike;
    messageCounter: number;
}
type ParserOutput = QuadLike[] | MessageQuadArray;
type ParserOutputItem = QuadLike | MessageQuad;
type ParseCallback = (error: Error | null, quad?: QuadLike | null, prefixes?: Record<string, NamedNodeLike>, messageCounter?: number) => void;
interface MessageQuadArray extends Array<MessageQuad> {
    messageCount: number;
}
type ParserEventCallbacks = {
    prefix?: (prefix: string, iri: NamedNodeLike) => void;
    comment?: (comment: string) => void;
};
type LiteralDirection = RDFJS.DirectionalLanguage['direction'];
declare class NamedNode implements NamedNodeLike {
    readonly value: string;
    readonly termType: "NamedNode";
    constructor(value: string);
    equals(other: unknown): boolean;
}
declare class BlankNode implements BlankNodeLike {
    readonly value: string;
    readonly termType: "BlankNode";
    constructor(value: string);
    equals(other: unknown): boolean;
}
declare class Variable implements VariableLike {
    readonly value: string;
    readonly termType: "Variable";
    constructor(value: string);
    equals(other: unknown): boolean;
}
declare class DefaultGraph implements DefaultGraphLike {
    readonly termType: "DefaultGraph";
    readonly value = "";
    equals(other: unknown): boolean;
}
declare class Literal implements LiteralLike {
    readonly value: string;
    readonly language: string;
    readonly datatype: NamedNodeLike;
    readonly termType: "Literal";
    readonly direction?: LiteralDirection;
    constructor(value: string, language?: string, datatype?: NamedNodeLike, direction?: LiteralDirection);
    equals(other: unknown): boolean;
}
declare class Quad implements QuadLike {
    readonly subject: TermLike;
    readonly predicate: TermLike;
    readonly object: TermLike;
    readonly graph: TermLike;
    readonly termType: "Quad";
    readonly value = "";
    constructor(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike);
    equals(other: unknown): boolean;
}
declare class Message extends Array<QuadLike> {
    readonly messageCounter: number;
    static get [Symbol.species](): ArrayConstructor;
    constructor(messageCounter: number, quads?: Iterable<QuadLike>);
}
declare const DataFactory: DataFactoryLike;
declare class Parser {
    static _resetBlankNodePrefix(): void;
    _factory: DataFactoryLike;
    private readonly options;
    constructor(options?: ParserOptions);
    parse(input: string, callback?: ParseCallback): ParserOutput | undefined;
    parseMessages(input: string): Message[];
}
declare class IncrementalParser {
    private readonly options;
    private readonly callbacks;
    private parserState;
    private pending;
    private atStart;
    constructor(options?: ParserOptions, callbacks?: ParserEventCallbacks);
    write(input: string): ParserOutputItem[];
    end(input?: string): ParserOutputItem[];
    private appendInput;
    private parsePending;
}
declare class StreamParser extends Transform {
    private readonly decoder;
    private readonly options;
    private parserState;
    private pending;
    private atStart;
    constructor(options?: StreamParserOptions);
    import(stream: Readable): this;
    _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private appendInput;
    private parsePending;
}
declare function termToString(term: TermLike): string;
declare function quadToString(quad: QuadLike): string;
declare function termToId(term: TermLike): string;
declare function termFromId(id: string): TermLike;
declare function isMessageQuad(value: unknown): value is MessageQuad;
declare function toMessages(output: Iterable<ParserOutputItem>, messageCount?: number): Message[];
declare const namedNode: (value: string) => NamedNodeLike;
declare const blankNode: (value?: string) => BlankNodeLike;
declare const literal: (value: string, languageOrDatatype?: string | NamedNodeLike | RDFJS.DirectionalLanguage, datatype?: NamedNodeLike) => LiteralLike;
declare const variable: ((value: string) => VariableLike) | undefined;
declare const defaultGraph: () => DefaultGraphLike;
declare const quad: (subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike) => QuadLike;

export { BlankNode, type BlankNodeLike, DataFactory, type DataFactoryLike, DefaultGraph, type DefaultGraphLike, IncrementalParser, Literal, type LiteralLike, Message, type MessageQuad, type MessageQuadArray, NamedNode, type NamedNodeLike, type ParseCallback, Parser, type ParserEventCallbacks, type ParserOptions, type ParserOutput, type ParserOutputItem, Quad, type QuadLike, StreamParser, type StreamParserOptions, type Term, type TermLike, type TermType, Variable, type VariableLike, blankNode, defaultGraph, isMessageQuad, literal, namedNode, quad, quadToString, termFromId, termToId, termToString, toMessages, variable };
