import { Transform, TransformOptions, Readable, TransformCallback } from 'node:stream';

type TermType = 'NamedNode' | 'BlankNode' | 'Literal' | 'Variable' | 'DefaultGraph' | 'Quad';
interface Term {
    termType: TermType;
    value: string;
    equals(other: unknown): boolean;
}
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
    literal(value: string, languageOrDatatype?: string | NamedNodeLike, datatype?: NamedNodeLike): LiteralLike;
    variable?(value: string): VariableLike;
    defaultGraph(): DefaultGraphLike;
    quad(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike): QuadLike;
}
type TermLike = NamedNodeLike | BlankNodeLike | LiteralLike | VariableLike | DefaultGraphLike | QuadLike;
type NamedNodeLike = Term & {
    termType: 'NamedNode';
};
type BlankNodeLike = Term & {
    termType: 'BlankNode';
};
type VariableLike = Term & {
    termType: 'Variable';
};
type DefaultGraphLike = Term & {
    termType: 'DefaultGraph';
};
type LiteralLike = Term & {
    termType: 'Literal';
    language: string;
    datatype: NamedNodeLike;
    direction?: string;
};
type QuadLike = Term & {
    termType: 'Quad';
    subject: TermLike;
    predicate: TermLike;
    object: TermLike;
    graph: TermLike;
};
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
    readonly direction?: string;
    constructor(value: string, language?: string, datatype?: NamedNodeLike, direction?: string);
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
declare const literal: (value: string, languageOrDatatype?: string | NamedNodeLike, datatype?: NamedNodeLike) => LiteralLike;
declare const variable: ((value: string) => VariableLike) | undefined;
declare const defaultGraph: () => DefaultGraphLike;
declare const quad: (subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike) => QuadLike;

export { BlankNode, type BlankNodeLike, DataFactory, type DataFactoryLike, DefaultGraph, type DefaultGraphLike, Literal, type LiteralLike, Message, type MessageQuad, type MessageQuadArray, NamedNode, type NamedNodeLike, type ParseCallback, Parser, type ParserOptions, type ParserOutput, type ParserOutputItem, Quad, type QuadLike, StreamParser, type StreamParserOptions, type Term, type TermLike, type TermType, Variable, type VariableLike, blankNode, defaultGraph, isMessageQuad, literal, namedNode, quad, quadToString, termFromId, termToId, termToString, toMessages, variable };
