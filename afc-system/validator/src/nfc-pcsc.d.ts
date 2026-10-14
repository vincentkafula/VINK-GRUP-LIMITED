declare module "nfc-pcsc" {
  export class NFC { constructor(logger?: unknown); on(event: string, listener: (arg: any) => void): void; close(): void }
}
