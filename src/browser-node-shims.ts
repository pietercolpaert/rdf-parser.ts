export class Transform {
  public constructor() {}
}

export class StringDecoder {
  public constructor(_encoding = 'utf8') {}
  public write(input: string | Uint8Array): string { return typeof input === 'string' ? input : String(input); }
  public end(): string { return ''; }
}
