// The few parts of pdfkit that the sponsorship documents use. pdfkit ships no types of its own, and adding @types/pdfkit would change the lockfile.
declare module "pdfkit" {
  import { EventEmitter } from "events";
  interface TextOptions { width?: number; align?: "left" | "center" | "right" | "justify"; continued?: boolean; lineGap?: number; paragraphGap?: number; indent?: number; underline?: boolean }
  class PDFDocument extends EventEmitter {
    constructor(options?: { size?: string; margin?: number; compress?: boolean; bufferPages?: boolean; info?: Record<string, string> });
    page: { width: number; height: number; margins: { top: number; bottom: number; left: number; right: number } };
    x: number; y: number;
    font(name: string, size?: number): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    text(text: string, options?: TextOptions): this;
    text(text: string, x: number, y: number, options?: TextOptions): this;
    heightOfString(text: string, options?: TextOptions): number;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    rect(x: number, y: number, width: number, height: number): this;
    fill(color?: string): this;
    addPage(): this;
    bufferedPageRange(): { start: number; count: number };
    switchToPage(index: number): this;
    end(): void;
  }
  export = PDFDocument;
}
