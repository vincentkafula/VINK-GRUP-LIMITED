/**
 * MIFARE Ultralight EV1 (MF0UL21 layout, also fits NTAG213/215 for these pages): 4-byte pages, 16-byte reads, a 32-bit password with a 16-bit
 * acknowledge, and a page number from which writes need that password. Ultralight has NO card-side cryptography, so a ticket here is protected
 * by signed data (see ticket.ts) and by a per-card password that stops anyone but our stations rewriting it. It can be COPIED (see the threat
 * model): the server's one-use check and the ticket's short life limit that.
 */
export interface UltralightIo {
  /** The 7-byte UID. */
  uid(): Promise<Buffer>;
  /** Reads 16 bytes (four pages) starting at `page`. */
  read(page: number): Promise<Buffer>;
  write(page: number, data: Buffer): Promise<void>;
  /** Password authentication; returns the 2-byte acknowledge. Throws UltralightError when the card refuses. */
  pwdAuth(pwd: Buffer): Promise<Buffer>;
}

export class UltralightError extends Error { constructor(message: string, public readonly kind: "nak" | "locked" | "io" = "nak") { super(message); } }

/** MF0UL21 page map. */
export const UL21 = { USER_FIRST: 4, USER_LAST: 35, DYN_LOCK: 36, CFG0: 37, CFG1: 38, PWD: 39, PACK: 40, PAGES: 41 } as const;

/**
 * A software Ultralight EV1 (UL21 layout) with the real password rules: a blank card is open; once AUTH0 is set, pages from AUTH0 upward can only
 * be written after a correct PWD_AUTH; wrong passwords count toward AUTHLIM and then the card refuses all further attempts; CFGLCK freezes the
 * configuration for good. Used for tests and for running the whole system without hardware.
 */
export class SimulatedUltralight implements UltralightIo {
  private pages: Buffer[];
  private authed = false;
  private fails = 0;
  readonly serial: Buffer;
  /** Test hook: the card leaves the field after this many more write commands. */
  tearAfterWrites: number | null = null;

  constructor(uid: Buffer = Buffer.from("04a0b1c2d3e4f5", "hex")) {
    if (uid.length !== 7) throw new Error("UID must be 7 bytes");
    this.serial = uid;
    this.pages = Array.from({ length: UL21.PAGES }, () => Buffer.alloc(4));
    this.pages[0] = Buffer.from([uid[0], uid[1], uid[2], uid[0] ^ uid[1] ^ uid[2] ^ 0x88]);
    this.pages[1] = Buffer.from([uid[3], uid[4], uid[5], uid[6]]);
    this.pages[2] = Buffer.from([uid[3] ^ uid[4] ^ uid[5] ^ uid[6], 0x48, 0, 0]);
    this.pages[UL21.CFG0] = Buffer.from([0, 0, 0, 0xff]);       // AUTH0 = 0xFF: nothing protected
    this.pages[UL21.CFG1] = Buffer.from([0, 0, 0, 0]);          // PROT=0 (writes protected, reads free), CFGLCK=0, AUTHLIM=0 (unlimited tries)
    this.pages[UL21.PWD] = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    this.pages[UL21.PACK] = Buffer.alloc(4);
  }

  removeFromField(): void { this.authed = false; }

  private get auth0() { return this.pages[UL21.CFG0][3]; }
  private get prot() { return (this.pages[UL21.CFG1][0] & 0x80) !== 0; }
  private get cfgLocked() { return (this.pages[UL21.CFG1][0] & 0x40) !== 0; }
  private get authLim() { return this.pages[UL21.CFG1][0] & 0x07; }
  private isProtected(page: number) { return page >= this.auth0 && !this.authed; }

  async uid(): Promise<Buffer> { return Buffer.from(this.serial); }

  async read(page: number): Promise<Buffer> {
    if (page < 0 || page >= UL21.PAGES) throw new UltralightError("page out of range");
    const out: Buffer[] = [];
    for (let i = 0; i < 4; i++) {
      const p = (page + i) % UL21.PAGES;                              // reads wrap around the end of the card, as on the real chip
      if (p === UL21.PWD || p === UL21.PACK) out.push(Buffer.alloc(4));   // never readable
      else if (this.prot && this.isProtected(p)) throw new UltralightError("read refused: authenticate first");
      else out.push(this.pages[p]);
    }
    return Buffer.concat(out);
  }

  async write(page: number, data: Buffer): Promise<void> {
    if (data.length !== 4) throw new UltralightError("a write is exactly one page (4 bytes)");
    if (this.tearAfterWrites !== null) { if (this.tearAfterWrites-- <= 0) { this.tearAfterWrites = null; this.authed = false; throw new UltralightError("the card left the field", "io"); } }
    if (page < UL21.USER_FIRST || page > UL21.PACK) throw new UltralightError("that page cannot be written");
    if (page === UL21.DYN_LOCK) { this.pages[page] = Buffer.from(data); return; }
    if (this.isProtected(page)) throw new UltralightError("write refused: authenticate first");
    if (page >= UL21.CFG0 && this.cfgLocked) throw new UltralightError("configuration is locked");
    if (page === UL21.CFG1) {
      // CFGLCK, once set, can never be cleared; AUTHLIM can only be changed while unlocked
      this.pages[page] = Buffer.from([data[0], data[1], data[2], data[3]]);
      return;
    }
    this.pages[page] = Buffer.from(data);
  }

  async pwdAuth(pwd: Buffer): Promise<Buffer> {
    if (this.authLim > 0 && this.fails >= this.authLim) throw new UltralightError("password attempts exhausted: the card is locked", "locked");
    if (!pwd.equals(this.pages[UL21.PWD])) { this.fails++; throw new UltralightError("wrong password"); }
    this.fails = 0; this.authed = true;
    return Buffer.from(this.pages[UL21.PACK].subarray(0, 2));
  }

  /** Test inspection. */
  dump(first = 0, last = UL21.PAGES - 1): Buffer { return Buffer.concat(this.pages.slice(first, last + 1)); }
  get protectedFrom(): number { return this.auth0; }
  get configLocked(): boolean { return this.cfgLocked; }
  get passwordTries(): number { return this.fails; }
}
