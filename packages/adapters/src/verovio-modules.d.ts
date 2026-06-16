/**
 * Ambient declarations for the `verovio` npm package subpath exports, which
 * ship no bundled TypeScript types. Kept intentionally minimal — only the
 * toolkit surface this adapter uses.
 */
declare module "verovio/wasm" {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module "verovio/esm" {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, unknown>): void;
    getOptions(): Record<string, unknown>;
    getVersion(): string;
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(page: number, xmlDeclaration?: boolean): string;
    redoLayout(options?: Record<string, unknown>): void;
  }
  export function enableLog(level: number): void;
}
