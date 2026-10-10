declare module "qrcode" {
  export function toBuffer(text: string, options?: { width?: number; margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H"; type?: "png" }): Promise<Buffer>;
}
