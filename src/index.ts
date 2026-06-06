import { Transform, type TransformCallback, type TransformOptions, type Readable } from 'node:stream';

export type TermType = 'NamedNode' | 'BlankNode' | 'Literal' | 'Variable' | 'DefaultGraph' | 'Quad';

export interface Term {
  termType: TermType;
  value: string;
  equals(other: unknown): boolean;
}

export interface ParserOptions {
  baseIRI?: string;
  baseIRIPath?: string;
  format?: string;
  factory?: DataFactoryLike;
  comments?: boolean;
  relax?: boolean;
  parseUnsupportedVersions?: boolean;
  version?: string;
}

export interface StreamParserOptions extends ParserOptions, TransformOptions {}

export interface DataFactoryLike {
  namedNode(value: string): NamedNodeLike;
  blankNode(value?: string): BlankNodeLike;
  literal(value: string, languageOrDatatype?: string | NamedNodeLike, datatype?: NamedNodeLike): LiteralLike;
  variable?(value: string): VariableLike;
  defaultGraph(): DefaultGraphLike;
  quad(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike): QuadLike;
}

export type TermLike = NamedNodeLike | BlankNodeLike | LiteralLike | VariableLike | DefaultGraphLike | QuadLike;
export type NamedNodeLike = Term & { termType: 'NamedNode' };
export type BlankNodeLike = Term & { termType: 'BlankNode' };
export type VariableLike = Term & { termType: 'Variable' };
export type DefaultGraphLike = Term & { termType: 'DefaultGraph' };
export type LiteralLike = Term & { termType: 'Literal'; language: string; datatype: NamedNodeLike; direction?: string };
export type QuadLike = Term & {
  termType: 'Quad';
  subject: TermLike;
  predicate: TermLike;
  object: TermLike;
  graph: TermLike;
};

export type ParseCallback = (error: Error | null, quad?: QuadLike | null, prefixes?: Record<string, NamedNodeLike>) => void;

type EventCallbacks = {
  prefix?: (prefix: string, iri: NamedNodeLike) => void;
  comment?: (comment: string) => void;
};

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDF_TYPE = `${RDF}type`;
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;
const RDF_LANG_STRING = `${RDF}langString`;
const RDF_DIR_LANG_STRING = `${RDF}dirLangString`;
const XSD_STRING = `${XSD}string`;
const XSD_INTEGER = `${XSD}integer`;
const XSD_DECIMAL = `${XSD}decimal`;
const XSD_DOUBLE = `${XSD}double`;
const XSD_BOOLEAN = `${XSD}boolean`;

function sameTerm(a: TermLike, b: unknown): boolean {
  if (!b || typeof b !== 'object' || !('termType' in b) || !('value' in b)) return false;
  const other = b as TermLike;
  if (a.termType !== other.termType || a.value !== other.value) return false;
  if (a.termType === 'Literal' && other.termType === 'Literal') {
    return a.language === other.language && a.direction === other.direction && a.datatype.equals(other.datatype);
  }
  if (a.termType === 'Quad' && other.termType === 'Quad') {
    return a.subject.equals(other.subject) && a.predicate.equals(other.predicate) &&
      a.object.equals(other.object) && a.graph.equals(other.graph);
  }
  return true;
}

export class NamedNode implements NamedNodeLike {
  public readonly termType = 'NamedNode' as const;
  public constructor(public readonly value: string) {}
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class BlankNode implements BlankNodeLike {
  public readonly termType = 'BlankNode' as const;
  public constructor(public readonly value: string) {}
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class Variable implements VariableLike {
  public readonly termType = 'Variable' as const;
  public constructor(public readonly value: string) {}
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class DefaultGraph implements DefaultGraphLike {
  public readonly termType = 'DefaultGraph' as const;
  public readonly value = '';
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class Literal implements LiteralLike {
  public readonly termType = 'Literal' as const;
  public readonly direction?: string;

  public constructor(
    public readonly value: string,
    public readonly language = '',
    public readonly datatype: NamedNodeLike = new NamedNode(language ? RDF_LANG_STRING : XSD_STRING),
    direction?: string,
  ) {
    if (direction) this.direction = direction;
  }

  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class Quad implements QuadLike {
  public readonly termType = 'Quad' as const;
  public readonly value = '';

  public constructor(
    public readonly subject: TermLike,
    public readonly predicate: TermLike,
    public readonly object: TermLike,
    public readonly graph: TermLike = defaultGraphSingleton,
  ) {}

  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

const defaultGraphSingleton = new DefaultGraph();

let globalBlankNodeCounter = 0;

export const DataFactory: DataFactoryLike = {
  namedNode: value => new NamedNode(value),
  blankNode: value => new BlankNode(value ?? `b${globalBlankNodeCounter++}`),
  literal: (value, languageOrDatatype, datatype) => {
    if (typeof languageOrDatatype === 'string') {
      const directionalSeparator = languageOrDatatype.indexOf('--');
      if (directionalSeparator >= 0) {
        const language = languageOrDatatype.slice(0, directionalSeparator).toLowerCase();
        const direction = languageOrDatatype.slice(directionalSeparator + 2).toLowerCase();
        return new Literal(value, language, datatype ?? new NamedNode(RDF_LANG_STRING), direction);
      }
      const language = languageOrDatatype.toLowerCase();
      return new Literal(value, language, datatype ?? new NamedNode(language ? RDF_LANG_STRING : XSD_STRING));
    }
    return new Literal(value, '', languageOrDatatype ?? datatype ?? new NamedNode(XSD_STRING));
  },
  variable: value => new Variable(value),
  defaultGraph: () => defaultGraphSingleton,
  quad: (subject, predicate, object, graph = defaultGraphSingleton) => new Quad(subject, predicate, object, graph),
};

export class Parser {
  public static _resetBlankNodePrefix(): void { globalBlankNodeCounter = 0; }
  public _factory: DataFactoryLike;

  private readonly options: ParserOptions;

  public constructor(options: ParserOptions = {}) {
    this.options = options;
    this._factory = options.factory ?? DataFactory;
  }

  public parse(input: string, callback?: ParseCallback): QuadLike[] | undefined {
    try {
      const core = new CoreParser(input, this.options, {
        prefix: (prefix, iri) => undefined,
        comment: comment => undefined,
      });
      const result = core.parse();
      if (callback) {
        for (const quad of result.quads) callback(null, quad, result.prefixes);
        callback(null, null, result.prefixes);
        return undefined;
      }
      return result.quads;
    } catch (error) {
      if (callback) {
        callback(error instanceof Error ? error : new Error(String(error)));
        return undefined;
      }
      throw error;
    }
  }
}

export class StreamParser extends Transform {
  private readonly chunks: Buffer[] = [];
  private readonly options: ParserOptions;

  public constructor(options: StreamParserOptions = {}) {
    const { baseIRI, baseIRIPath, format, factory, comments, relax, parseUnsupportedVersions, version, ...streamOptions } = options;
    super({ ...streamOptions, readableObjectMode: true });
    this.options = { baseIRI, baseIRIPath, format, factory, comments, relax, parseUnsupportedVersions, version };
  }

  public import(stream: Readable): this {
    stream.on('error', error => this.emit('error', error));
    stream.pipe(this);
    return this;
  }

  public override _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: TransformCallback): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }

  public override _flush(callback: TransformCallback): void {
    try {
      const input = Buffer.concat(this.chunks).toString('utf8');
      const parser = new CoreParser(input, this.options, {
        prefix: (prefix, iri) => this.emit('prefix', prefix, iri),
        comment: comment => this.emit('comment', comment),
      });
      for (const quad of parser.parse().quads) this.push(quad);
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

class CoreParser {
  private readonly input: string;
  private readonly length: number;
  private index = 0;
  private line = 1;
  private readonly factory: DataFactoryLike;
  private readonly prefixes: Record<string, NamedNodeLike> = Object.create(null) as Record<string, NamedNodeLike>;
  private readonly quads: QuadLike[] = [];
  private readonly callbacks: EventCallbacks;
  private readonly strictNTriples: boolean;
  private readonly strictNQuads: boolean;
  private readonly allowLegacyTripleTerms: boolean;
  private readonly relax: boolean;
  private readonly defaultGraphTerm: DefaultGraphLike;
  private readonly namedNodeCache = new Map<string, NamedNodeLike>();
  private baseIRI: string;
  private localBlankNodeCounter = 0;
  private fastEnd = 0;

  public constructor(input: string, options: ParserOptions, callbacks: EventCallbacks) {
    this.input = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
    this.length = this.input.length;
    this.factory = options.factory ?? DataFactory;
    this.baseIRI = options.baseIRI ?? options.baseIRIPath ?? '';
    this.callbacks = callbacks;
    this.relax = options.relax === true;
    this.defaultGraphTerm = this.factory.defaultGraph();
    const format = (options.format ?? '').toLowerCase();
    this.strictNTriples = format.includes('n-triples');
    this.strictNQuads = format.includes('n-quads');
    this.allowLegacyTripleTerms = format.includes('*');
  }

  public parse(): { quads: QuadLike[]; prefixes: Record<string, NamedNodeLike> } {
    while (true) {
      this.skipWsAndComments();
      if (this.index >= this.length) return { quads: this.quads, prefixes: this.prefixes };
      if ((this.strictNTriples || this.strictNQuads) && this.tryParseLineStatementFast()) continue;
      this.parseStatement(this.defaultGraphTerm);
    }
  }

  private tryParseLineStatementFast(): boolean {
    let i = this.index;

    const subject = this.readFastNode(i, false);
    if (!subject || subject.termType === 'Quad') return false;
    i = this.skipHws(this.fastEnd);

    const predicateEnd = this.readFastIriEnd(i);
    if (predicateEnd < 0) return false;
    const predicate = this.cachedNamedNode(this.input.slice(i + 1, predicateEnd));
    i = this.skipHws(predicateEnd + 1);

    const object = this.readFastObject(i);
    if (!object) return false;
    i = this.skipHws(this.fastEnd);

    let graph: TermLike = this.defaultGraphTerm;
    const graphStart = this.input.charCodeAt(i);
    if (graphStart === 60 || (graphStart === 95 && this.input.charCodeAt(i + 1) === 58)) {
      if (this.strictNTriples) return false;
      graph = this.readFastNode(i, true) ?? this.defaultGraphTerm;
      if (graph === this.defaultGraphTerm && this.input.charCodeAt(i) !== 46) return false;
      if (graph.termType === 'Quad' || graph.termType === 'Literal') return false;
      i = this.skipHws(this.fastEnd);
    }

    if (this.input.charCodeAt(i) !== 46) return false;
    this.index = i + 1;
    this.quads.push(this.factory.quad(subject, predicate, object, graph));
    return true;
  }

  private readFastObject(index: number): TermLike | null {
    const code = this.input.charCodeAt(index);
    if (code === 60) {
      if (this.input.charCodeAt(index + 1) === 60) return null;
      const end = this.readFastIriEnd(index);
      if (end < 0) return null;
      this.fastEnd = end + 1;
      return this.factory.namedNode(this.input.slice(index + 1, end));
    }
    if (code === 95 && this.input.charCodeAt(index + 1) === 58) return this.readFastBlankNode(index);
    if (code === 34) return this.readFastLiteral(index);
    return null;
  }

  private readFastNode(index: number, cache: boolean): TermLike | null {
    const code = this.input.charCodeAt(index);
    if (code === 60) {
      if (this.input.charCodeAt(index + 1) === 60) return null;
      const end = this.readFastIriEnd(index);
      if (end < 0) return null;
      this.fastEnd = end + 1;
      const value = this.input.slice(index + 1, end);
      return cache ? this.cachedNamedNode(value) : this.factory.namedNode(value);
    }
    if (code === 95 && this.input.charCodeAt(index + 1) === 58) return this.readFastBlankNode(index);
    return null;
  }

  private readFastBlankNode(index: number): BlankNodeLike | null {
    let i = index + 2;
    const start = i;
    while (i < this.length) {
      const code = this.input.charCodeAt(i);
      if (!isNameChar(code)) break;
      if (code === 46) {
        const next = this.input.charCodeAt(i + 1);
        if (Number.isNaN(next) || isWs(next) || next === 59 || next === 44 || next === 125 || next === 93 || next === 41) break;
      }
      i++;
    }
    if (i === start) return null;
    this.fastEnd = i;
    return this.factory.blankNode(this.input.slice(start, i));
  }

  private readFastLiteral(index: number): LiteralLike | null {
    const end = this.input.indexOf('"', index + 1);
    if (end < 0) return null;
    for (let i = index + 1; i < end; i++) {
      const code = this.input.charCodeAt(i);
      if (code === 92 || code === 10 || code === 13) return null;
    }

    const value = this.input.slice(index + 1, end);
    let i = end + 1;
    const next = this.input.charCodeAt(i);
    if (next === 64) {
      const start = ++i;
      while (i < this.length) {
        const code = this.input.charCodeAt(i);
        if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 45) i++;
        else break;
      }
      if (i === start) return null;
      const tag = this.input.slice(start, i);
      if (!this.relax && !isLanguageTagValid(tag)) return null;
      this.fastEnd = i;
      return this.factory.literal(value, tag.toLowerCase());
    }
    if (next === 94 && this.input.charCodeAt(i + 1) === 94) {
      i += 2;
      const datatypeEnd = this.readFastIriEnd(i);
      if (datatypeEnd < 0) return null;
      const datatypeValue = this.input.slice(i + 1, datatypeEnd);
      if (!this.relax && (datatypeValue === RDF_LANG_STRING || datatypeValue === RDF_DIR_LANG_STRING)) return null;
      this.fastEnd = datatypeEnd + 1;
      return this.factory.literal(value, this.cachedNamedNode(datatypeValue));
    }
    this.fastEnd = i;
    return this.factory.literal(value);
  }

  private readFastIriEnd(index: number): number {
    if (this.input.charCodeAt(index) !== 60) return -1;
    const end = this.input.indexOf('>', index + 1);
    if (end < 0) return -1;
    if (this.relax) return end;

    let hasScheme = false;
    for (let i = index + 1; i < end; i++) {
      const code = this.input.charCodeAt(i);
      if (code === 58 && i > index + 1) hasScheme = true;
      if (code <= 32 || code === 34 || code === 60 || code === 92 || code === 94 || code === 96 || code === 123 || code === 124 || code === 125) {
        return -1;
      }
    }
    return hasScheme ? end : -1;
  }

  private skipHws(index: number): number {
    while (index < this.length) {
      const code = this.input.charCodeAt(index);
      if (code !== 32 && code !== 9) break;
      index++;
    }
    return index;
  }

  private cachedNamedNode(value: string): NamedNodeLike {
    const cached = this.namedNodeCache.get(value);
    if (cached) return cached;
    const node = this.factory.namedNode(value);
    if (this.namedNodeCache.size < 4096) this.namedNodeCache.set(value, node);
    return node;
  }

  private parseStatement(defaultGraph: TermLike): void {
    this.skipWsAndComments();
    if (this.parseDirective()) return;
    if (this.peekCharCode() === 123) {
      this.index++;
      this.parseGraphStatements(defaultGraph);
      return;
    }
    if (this.matchWord('GRAPH')) {
      this.skipWsAndComments();
      const graph = this.parseNamedOrBlankTerm(defaultGraph);
      this.skipWsAndComments();
      this.expectChar(123, 'Expected { after GRAPH label');
      this.parseGraphStatements(graph);
      return;
    }

    const subjectOrGraph = this.parseSubject(defaultGraph);
    this.skipWsAndComments();
    if (this.peekCharCode() === 123) {
      this.index++;
      this.parseGraphStatements(subjectOrGraph);
      return;
    }
    this.parsePredicateObjectList(subjectOrGraph, defaultGraph);
  }

  private parseGraphStatements(graph: TermLike): void {
    while (true) {
      this.skipWsAndComments();
      if (this.index >= this.length) this.fail('Unclosed graph block');
      if (this.peekCharCode() === 125) {
        this.index++;
        this.skipWsAndComments();
        if (this.peekCharCode() === 46) this.index++;
        return;
      }
      this.parseStatement(graph);
    }
  }

  private parsePredicateObjectList(subject: TermLike, graph: TermLike, terminatorCode = 46): void {
    while (true) {
      const predicate = this.parsePredicate(graph);
      this.skipWsAndComments();
      while (true) {
        const object = this.parseObject(graph);
        this.skipWsAndComments();

        if (terminatorCode === 46 && graph.termType === 'DefaultGraph' && this.canStartTerm() && !this.nextIsStatementBoundary()) {
          if (this.strictNTriples) this.fail('Graph terms are not allowed in N-Triples');
          const explicitGraph = this.parseNamedOrBlankTerm(graph);
          this.addQuad(subject, predicate, object, explicitGraph);
          this.skipWsAndComments();
          this.expectChar(46, 'Expected . after quad');
          return;
        }

        this.addQuad(subject, predicate, object, graph);
        if (this.peekCharCode() !== 44) break;
        if (this.strictNTriples || this.strictNQuads) this.fail('Object lists are not allowed in this format');
        this.index++;
        this.skipWsAndComments();
      }

      if (this.peekCharCode() !== 59) break;
      if (this.strictNTriples || this.strictNQuads) this.fail('Predicate lists are not allowed in this format');
      this.index++;
      this.skipWsAndComments();
      if (this.peekCharCode() === terminatorCode) break;
    }
    if (terminatorCode === 46) this.expectChar(46, 'Expected . after triple');
    else if (this.peekCharCode() !== terminatorCode) this.fail(`Expected ${String.fromCharCode(terminatorCode)} after property list`);
  }

  private addQuad(subject: TermLike, predicate: TermLike, object: TermLike, graph: TermLike): void {
    this.quads.push(this.factory.quad(subject, predicate, object, graph));
  }

  private parseDirective(): boolean {
    const start = this.index;
    if (this.peekCharCode() === 64) {
      if (this.strictNTriples || this.strictNQuads) this.fail('Directives are not allowed in this format');
      this.index++;
      if (this.matchWord('prefix')) {
        this.parsePrefixDirective(true);
        return true;
      }
      if (this.matchWord('base')) {
        this.parseBaseDirective(true);
        return true;
      }
      this.index = start;
      return false;
    }
    if (this.matchWord('PREFIX')) {
      if (this.strictNTriples || this.strictNQuads) this.fail('Directives are not allowed in this format');
      this.parsePrefixDirective(false);
      return true;
    }
    if (this.matchWord('BASE')) {
      if (this.strictNTriples || this.strictNQuads) this.fail('Directives are not allowed in this format');
      this.parseBaseDirective(false);
      return true;
    }
    return false;
  }

  private parsePrefixDirective(needsDot: boolean): void {
    this.skipWsAndComments();
    const prefix = this.readUntilColon();
    this.expectChar(58, 'Expected : after prefix label');
    this.skipWsAndComments();
    const iri = this.parseIri();
    this.prefixes[prefix] = iri;
    this.callbacks.prefix?.(prefix, iri);
    this.skipWsAndComments();
    if (needsDot) this.expectChar(46, 'Expected . after prefix directive');
  }

  private parseBaseDirective(needsDot: boolean): void {
    this.skipWsAndComments();
    this.baseIRI = this.parseIri().value;
    this.skipWsAndComments();
    if (needsDot) this.expectChar(46, 'Expected . after base directive');
  }

  private parseSubject(graph: TermLike): TermLike {
    const term = this.parseTerm(graph);
    if (term.termType === 'Literal' || term.termType === 'DefaultGraph' || term.termType === 'Variable' ||
      ((this.strictNTriples || this.strictNQuads) && !this.allowLegacyTripleTerms && term.termType === 'Quad')) {
      this.fail(`Invalid subject term ${term.termType}`);
    }
    return term;
  }

  private parseObject(graph: TermLike): TermLike {
    return this.parseTerm(graph);
  }

  private parsePredicate(graph: TermLike): TermLike {
    if (this.matchWord('a')) return this.factory.namedNode(RDF_TYPE);
    const term = this.parseTerm(graph);
    if (term.termType !== 'NamedNode') this.fail(`Invalid predicate term ${term.termType}`);
    return term;
  }

  private parseNamedOrBlankTerm(graph: TermLike): TermLike {
    const term = this.parseTerm(graph);
    if (term.termType !== 'NamedNode' && term.termType !== 'BlankNode') this.fail(`Invalid graph term ${term.termType}`);
    return term;
  }

  private parseTerm(graph: TermLike): TermLike {
    this.skipWsAndComments();
    const code = this.peekCharCode();
    if (code < 0) this.fail('Unexpected end of input');

    if (code === 60) {
      if (this.input.charCodeAt(this.index + 1) === 60) return this.parseTripleTerm(graph);
      return this.parseIri();
    }
    if (code === 34 || code === 39) return this.parseLiteral();
    if (code === 95 && this.input.charCodeAt(this.index + 1) === 58) return this.parseBlankNode();
    if (code === 91) return this.parseBlankNodePropertyList(graph);
    if (code === 40) return this.parseCollection(graph);
    if (code === 43 || code === 45 || (code >= 48 && code <= 57)) return this.parseNumber();
    if ((this.strictNTriples || this.strictNQuads) && (this.matchWord('true') || this.matchWord('false'))) {
      this.fail('Boolean literals are not allowed in this format');
    }
    if (this.matchWord('true')) return this.factory.literal('true', this.factory.namedNode(XSD_BOOLEAN));
    if (this.matchWord('false')) return this.factory.literal('false', this.factory.namedNode(XSD_BOOLEAN));
    return this.parsePrefixedName();
  }

  private parseTripleTerm(graph: TermLike): TermLike {
    this.index += 2;
    this.skipWsAndComments();
    const parenthesized = this.peekCharCode() === 40;
    if (parenthesized) this.index++;
    else if ((this.strictNTriples || this.strictNQuads) && !this.allowLegacyTripleTerms) {
      this.fail('Unparenthesized triple terms are not allowed in RDF1.2 line formats');
    }
    const subject = this.parseSubject(graph);
    const predicate = this.parsePredicate(graph);
    const object = this.parseObject(graph);
    this.skipWsAndComments();
    if (parenthesized) this.expectChar(41, 'Expected ) after triple term');
    this.skipWsAndComments();
    if (this.input.charCodeAt(this.index) !== 62 || this.input.charCodeAt(this.index + 1) !== 62) {
      this.fail('Expected >> after triple term');
    }
    this.index += 2;
    return this.factory.quad(subject, predicate, object, this.factory.defaultGraph());
  }

  private parseIri(): NamedNodeLike {
    this.expectChar(60, 'Expected <');
    let value = '';
    while (this.index < this.length) {
      const code = this.peekCharCode();
      if (code === 62) {
        this.index++;
        if ((this.strictNTriples || this.strictNQuads) && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
          this.fail('Relative IRIs are not allowed in this format');
        }
        return this.factory.namedNode(resolveIri(value, this.baseIRI));
      }
      if (code === 92) {
        this.index++;
        const escapeCode = this.peekCharCode();
        if ((this.strictNTriples || this.strictNQuads) && escapeCode !== 117 && escapeCode !== 85) {
          this.fail('Only Unicode escapes are allowed in IRIs');
        }
        value += this.readEscape();
        continue;
      }
      if ((this.strictNTriples || this.strictNQuads) &&
          (code <= 32 || code === 34 || code === 60 || code === 94 || code === 96 || code === 123 || code === 124 || code === 125)) {
        this.fail('Invalid character in IRI');
      }
      value += this.input[this.index]!;
      this.advanceOne();
    }
    this.fail('Unterminated IRI');
  }

  private parseLiteral(): LiteralLike {
    if ((this.strictNTriples || this.strictNQuads) && this.peekCharCode() !== 34) {
      this.fail('Only double-quoted literals are allowed in this format');
    }
    const value = this.readQuotedString();
    if (this.peekCharCode() === 64) {
      this.index++;
      const tag = this.readLanguageTag();
      return this.factory.literal(value, tag);
    }
    if (this.peekCharCode() === 94 && this.input.charCodeAt(this.index + 1) === 94) {
      this.index += 2;
      const datatype = this.parseTerm(this.factory.defaultGraph());
      if (datatype.termType !== 'NamedNode') this.fail('Expected datatype IRI after ^^');
      if ((this.strictNTriples || this.strictNQuads) && (datatype.value === RDF_LANG_STRING || datatype.value === RDF_DIR_LANG_STRING)) {
        this.fail('Language string datatypes require an explicit language tag');
      }
      return this.factory.literal(value, datatype);
    }
    return this.factory.literal(value);
  }

  private parseBlankNode(): BlankNodeLike {
    this.index += 2;
    const start = this.index;
    while (this.index < this.length && isNameChar(this.peekCharCode())) {
      if (this.peekCharCode() === 46) {
        const next = this.input.charCodeAt(this.index + 1);
        if (Number.isNaN(next) || isWs(next) || next === 59 || next === 44 || next === 125 || next === 93 || next === 41) break;
      }
      this.index++;
    }
    if (this.index === start) this.fail('Expected blank node label');
    return this.factory.blankNode(this.input.slice(start, this.index));
  }

  private parseBlankNodePropertyList(graph: TermLike): BlankNodeLike {
    this.expectChar(91, 'Expected [');
    const blank = this.factory.blankNode(`b${this.localBlankNodeCounter++}`);
    this.skipWsAndComments();
    if (this.peekCharCode() === 93) {
      this.index++;
      return blank;
    }
    this.parsePredicateObjectList(blank, graph, 93);
    this.skipWsAndComments();
    this.expectChar(93, 'Expected ] after blank node property list');
    return blank;
  }

  private parseCollection(graph: TermLike): TermLike {
    this.expectChar(40, 'Expected (');
    this.skipWsAndComments();
    if (this.peekCharCode() === 41) {
      this.index++;
      return this.factory.namedNode(RDF_NIL);
    }

    const head = this.factory.blankNode(`b${this.localBlankNodeCounter++}`);
    let current = head;
    while (true) {
      const item = this.parseObject(graph);
      this.addQuad(current, this.factory.namedNode(RDF_FIRST), item, graph);
      this.skipWsAndComments();
      if (this.peekCharCode() === 41) {
        this.index++;
        this.addQuad(current, this.factory.namedNode(RDF_REST), this.factory.namedNode(RDF_NIL), graph);
        return head;
      }
      const next = this.factory.blankNode(`b${this.localBlankNodeCounter++}`);
      this.addQuad(current, this.factory.namedNode(RDF_REST), next, graph);
      current = next;
    }
  }

  private parseNumber(): LiteralLike {
    if (this.strictNTriples || this.strictNQuads) this.fail('Numeric literals are not allowed in this format');
    const rest = this.input.slice(this.index);
    const match = /^[+-]?(?:(?:\d+\.\d*)|(?:\.\d+)|(?:\d+))(?:[eE][+-]?\d+)?/.exec(rest);
    if (!match?.[0]) this.fail('Invalid number');
    const value = match[0];
    this.index += value.length;
    let datatype = XSD_INTEGER;
    if (/[eE]/.test(value)) datatype = XSD_DOUBLE;
    else if (value.includes('.')) datatype = XSD_DECIMAL;
    return this.factory.literal(value, this.factory.namedNode(datatype));
  }

  private parsePrefixedName(): NamedNodeLike {
    const prefix = this.readUntilColon();
    this.expectChar(58, 'Expected prefixed name');
    const localStart = this.index;
    while (this.index < this.length) {
      const code = this.peekCharCode();
      if (!isLocalNameChar(code)) break;
      if (code === 46) {
        const next = this.input.charCodeAt(this.index + 1);
        if (Number.isNaN(next) || isWs(next) || next === 59 || next === 44 || next === 125 || next === 93 || next === 41) break;
      }
      this.index++;
    }
    const namespace = this.prefixes[prefix];
    if (!namespace) this.fail(`Unknown prefix "${prefix}"`);
    return this.factory.namedNode(namespace.value + this.input.slice(localStart, this.index));
  }

  private readQuotedString(): string {
    const quote = this.peekCharCode();
    const triple = this.input.charCodeAt(this.index + 1) === quote && this.input.charCodeAt(this.index + 2) === quote;
    if ((this.strictNTriples || this.strictNQuads) && triple) this.fail('Long literals are not allowed in this format');
    this.index += triple ? 3 : 1;
    let value = '';
    while (this.index < this.length) {
      const code = this.peekCharCode();
      if (code === quote) {
        if (triple) {
          if (this.input.charCodeAt(this.index + 1) === quote && this.input.charCodeAt(this.index + 2) === quote) {
            this.index += 3;
            return value;
          }
        } else {
          this.index++;
          return value;
        }
      }
      if (code === 92) {
        this.index++;
        value += this.readEscape();
        continue;
      }
      if (!triple && (code === 10 || code === 13)) this.fail('Line breaks are not allowed in literals');
      value += this.input[this.index]!;
      this.advanceOne();
    }
    this.fail('Unterminated literal');
  }

  private readEscape(): string {
    const code = this.peekCharCode();
    if (code === 116) { this.index++; return '\t'; }
    if (code === 98) { this.index++; return '\b'; }
    if (code === 110) { this.index++; return '\n'; }
    if (code === 114) { this.index++; return '\r'; }
    if (code === 102) { this.index++; return '\f'; }
    if (code === 34 || code === 39 || code === 92) { this.index++; return String.fromCharCode(code); }
    if (code === 117 || code === 85) {
      const size = code === 117 ? 4 : 8;
      this.index++;
      const hex = this.input.slice(this.index, this.index + size);
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== size) this.fail('Invalid Unicode escape');
      this.index += size;
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }
    this.fail('Invalid escape sequence');
  }

  private readLanguageTag(): string {
    const start = this.index;
    const first = this.peekCharCode();
    if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) this.fail('Expected language tag');
    while (this.index < this.length) {
      const code = this.peekCharCode();
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 45) {
        this.index++;
      } else {
        break;
      }
    }
    if (this.index === start) this.fail('Expected language tag');
    const tag = this.input.slice(start, this.index);
    const directionalSeparator = tag.indexOf('--');
    const language = directionalSeparator >= 0 ? tag.slice(0, directionalSeparator) : tag;
    const direction = directionalSeparator >= 0 ? tag.slice(directionalSeparator + 2) : '';
    if (!language) this.fail('Expected language tag');
    for (const subtag of language.split('-')) {
      if (!subtag || subtag.length > 8) this.fail('Invalid language tag');
    }
    if (directionalSeparator >= 0 && direction !== 'ltr' && direction !== 'rtl') {
      this.fail('Invalid base direction');
    }
    return tag.toLowerCase();
  }

  private readUntilColon(): string {
    const start = this.index;
    while (this.index < this.length) {
      const code = this.peekCharCode();
      if (code === 58) break;
      if (!isPrefixNameChar(code)) break;
      this.index++;
    }
    return this.input.slice(start, this.index);
  }

  private skipWsAndComments(): void {
    while (this.index < this.length) {
      const code = this.peekCharCode();
      if (isWs(code)) {
        this.advanceOne();
        continue;
      }
      if (code === 35) {
        this.index++;
        const start = this.index;
        while (this.index < this.length) {
          const next = this.peekCharCode();
          if (next === 10 || next === 13) break;
          this.index++;
        }
        this.callbacks.comment?.(this.input.slice(start, this.index));
        continue;
      }
      return;
    }
  }

  private matchWord(word: string): boolean {
    if (this.input.length - this.index < word.length) return false;
    if (this.input.slice(this.index, this.index + word.length).toLowerCase() !== word.toLowerCase()) return false;
    const previous = this.index > 0 ? this.input.charCodeAt(this.index - 1) : -1;
    const next = this.input.charCodeAt(this.index + word.length);
    if ((previous >= 0 && isWordBoundaryBlocker(previous)) || isWordBoundaryBlocker(next)) return false;
    this.index += word.length;
    return true;
  }

  private canStartTerm(): boolean {
    const code = this.peekCharCode();
    return code === 60 || code === 95 || code === 91 || code === 40 || code === 34 || code === 39 || code === 43 || code === 45 ||
      (code >= 48 && code <= 57) || isPrefixStart(code);
  }

  private nextIsStatementBoundary(): boolean {
    const code = this.peekCharCode();
    return code === 46 || code === 59 || code === 44 || code === 125 || code === 93 || code === 41 || code < 0;
  }

  private expectChar(code: number, message: string): void {
    this.skipWsAndComments();
    if (this.peekCharCode() !== code) this.fail(message);
    this.index++;
  }

  private peekCharCode(): number {
    return this.index < this.length ? this.input.charCodeAt(this.index) : -1;
  }

  private advanceOne(): void {
    if (this.input.charCodeAt(this.index) === 10) this.line++;
    this.index++;
  }

  private fail(message: string): never {
    const error = new Error(`${message} on line ${this.line}.`);
    (error as Error & { context?: unknown }).context = { line: this.line, index: this.index };
    throw error;
  }
}

function resolveIri(value: string, baseIRI: string): string {
  if (!baseIRI || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return value;
  try {
    return new URL(value, baseIRI).href;
  } catch {
    return value;
  }
}

function isWs(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isNameChar(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) ||
    code === 95 || code === 45 || code === 46;
}

function isWordBoundaryBlocker(code: number): boolean {
  return isNameChar(code) || code === 58;
}

function isPrefixStart(code: number): boolean {
  return code === 58 || code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isPrefixNameChar(code: number): boolean {
  return code === 95 || code === 45 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function isLocalNameChar(code: number): boolean {
  return isPrefixNameChar(code) || code === 126 || code === 46 || code === 37 || code === 47 || code === 35;
}

function isLanguageTagValid(tag: string): boolean {
  const directionalSeparator = tag.indexOf('--');
  const language = directionalSeparator >= 0 ? tag.slice(0, directionalSeparator) : tag;
  const direction = directionalSeparator >= 0 ? tag.slice(directionalSeparator + 2) : '';
  if (!language) return false;
  const first = language.charCodeAt(0);
  if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) return false;
  for (const subtag of language.split('-')) {
    if (!subtag || subtag.length > 8) return false;
  }
  return directionalSeparator < 0 || direction === 'ltr' || direction === 'rtl';
}

function escapeString(value: string): string {
  return value.replace(/[\\"\n\r\t\b\f]/g, character => {
    switch (character) {
      case '\\': return '\\\\';
      case '"': return '\\"';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      case '\b': return '\\b';
      case '\f': return '\\f';
      default: return character;
    }
  });
}

export function termToString(term: TermLike): string {
  switch (term.termType) {
    case 'NamedNode':
      return `<${term.value.replace(/[>\\]/g, character => `\\${character}`)}>`;
    case 'BlankNode':
      return `_:${term.value}`;
    case 'Variable':
      return `?${term.value}`;
    case 'DefaultGraph':
      return '';
    case 'Literal': {
      const quoted = `"${escapeString(term.value)}"`;
      if (term.language) return `${quoted}@${term.direction ? `${term.language}--${term.direction}` : term.language}`;
      if (term.datatype.value === XSD_STRING) return quoted;
      return `${quoted}^^<${term.datatype.value}>`;
    }
    case 'Quad':
      return `<< ${termToString(term.subject)} ${termToString(term.predicate)} ${termToString(term.object)} >>`;
  }
}

export function quadToString(quad: QuadLike): string {
  const graph = quad.graph.termType === 'DefaultGraph' ? '' : ` ${termToString(quad.graph)}`;
  return `${termToString(quad.subject)} ${termToString(quad.predicate)} ${termToString(quad.object)}${graph} .`;
}

export function termToId(term: TermLike): string {
  return termToString(term);
}

export function termFromId(id: string): TermLike {
  const parser = new CoreParser(`_:s <urn:p> ${id} .`, {}, {});
  const quad = parser.parse().quads[0];
  if (!quad) throw new Error(`Invalid term id: ${id}`);
  return quad.object;
}

export const namedNode = DataFactory.namedNode;
export const blankNode = DataFactory.blankNode;
export const literal = DataFactory.literal;
export const variable = DataFactory.variable;
export const defaultGraph = DataFactory.defaultGraph;
export const quad = DataFactory.quad;
