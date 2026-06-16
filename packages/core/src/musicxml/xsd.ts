/**
 * Strict W3C XSD validation of MusicXML against the official MusicXML 4.0
 * schema (PRD §MXL — interchange correctness). Backed by libxml2 compiled to
 * WebAssembly (no native build, cross-platform, deterministic, offline).
 *
 * The schema set (musicxml.xsd + xlink.xsd + xml.xsd) is bundled under
 * `packages/core/schema/musicxml/`; the two `<xs:import>` schemaLocation hints
 * were repointed to the local files so resolution never touches the network.
 *
 * libxml2-wasm is a devDependency: this validator is a build/CI/test gate, not a
 * hot path. The toolkit is imported lazily and the compiled schema is cached for
 * the process, so repeated validations are cheap.
 */
import { fileURLToPath, pathToFileURL } from "node:url";

export interface XsdValidationResult {
  ok: boolean;
  /** Human-readable validation errors (empty when ok). */
  errors: string[];
}

const SCHEMA_PATH = fileURLToPath(new URL("../../schema/musicxml/musicxml.xsd", import.meta.url));

// libxml2-wasm has no published types we depend on at compile time (devDep), so
// the dynamic module is typed loosely here and the surface we use is narrow.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Lib = {
  XmlDocument: {
    fromString(src: string, options?: { url?: string }): any;
    fromBuffer(src: Uint8Array, options?: { url?: string }): any;
  };
  XsdValidator: { fromDoc(doc: any): any };
};

let validatorPromise: Promise<{ lib: Lib; validator: any }> | null = null;

async function getValidator(): Promise<{ lib: Lib; validator: any }> {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const lib = (await import("libxml2-wasm")) as unknown as Lib;
      const { xmlRegisterFsInputProviders } = await import("libxml2-wasm/lib/nodejs.mjs");
      // Let libxml2 read the imported xml.xsd / xlink.xsd from disk.
      xmlRegisterFsInputProviders();
      const url = pathToFileURL(SCHEMA_PATH).href;
      const { readFileSync } = await import("node:fs");
      const xsdDoc = lib.XmlDocument.fromString(readFileSync(SCHEMA_PATH, "utf8"), { url });
      const validator = lib.XsdValidator.fromDoc(xsdDoc);
      return { lib, validator };
    })();
  }
  return validatorPromise;
}

/**
 * Validate a MusicXML document string against the bundled MusicXML 4.0 XSD.
 * Returns `{ ok, errors }`; never throws for invalid input (only for setup
 * failures such as a missing schema bundle).
 */
export async function validateMusicXmlAgainstXsd(musicXml: string): Promise<XsdValidationResult> {
  const { lib, validator } = await getValidator();
  let doc: any = null;
  try {
    doc = lib.XmlDocument.fromString(musicXml);
  } catch (err) {
    return { ok: false, errors: [`XML parse error: ${(err as Error).message}`] };
  }
  try {
    validator.validate(doc);
    return { ok: true, errors: [] };
  } catch (err) {
    const details = (err as { details?: Array<{ message?: string; line?: number }> }).details;
    const errors = Array.isArray(details) && details.length
      ? details.map((d) => `${d.line != null ? `line ${d.line}: ` : ""}${(d.message ?? "").trim()}`)
      : [(err as Error).message];
    return { ok: false, errors };
  } finally {
    doc?.[Symbol.dispose]?.();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
