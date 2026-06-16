/**
 * Post-process a generated PPTX for real-world PowerPoint compatibility and size:
 *  1. Deduplicate byte-identical media (PptxGenJS embeds a common background once
 *     per slide); rewrite every relationship to the single kept part.
 *  2. Drop phantom `[Content_Types].xml` Overrides for parts that do not exist
 *     (PptxGenJS declares slideMaster2..N it never creates → OPC violation →
 *     PowerPoint "repair" prompt).
 */
import JSZip from "jszip";
import type { PptxFontEmbed } from "@worship-score/core";
import { embedFontsInPptx } from "./embedFonts.js";

export interface SanitizeOptions {
  /** Embed these fonts into the package (opt-in; full font, large). */
  fontEmbed?: PptxFontEmbed;
}

function fnv1a(data: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function sanitizePptx(buffer: Uint8Array, options: SanitizeOptions = {}): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const list = () => Object.keys(zip.files);

  // 1. Deduplicate identical media.
  const media = list().filter((f) => /^ppt\/media\//.test(f) && !zip.files[f]?.dir);
  const canonByKey = new Map<string, { part: string; bytes: Uint8Array }>();
  const dupToCanon = new Map<string, string>();
  for (const m of media) {
    const bytes = await zip.file(m)!.async("uint8array");
    const key = `${bytes.length}.${fnv1a(bytes)}`;
    const existing = canonByKey.get(key);
    if (existing && bytesEqual(existing.bytes, bytes)) dupToCanon.set(m, existing.part);
    else canonByKey.set(key, { part: m, bytes });
  }
  for (const dup of dupToCanon.keys()) zip.remove(dup);

  if (dupToCanon.size > 0) {
    for (const relFile of list().filter((f) => /\.rels$/.test(f))) {
      let xml = await zip.file(relFile)!.async("string");
      let changed = false;
      for (const [dup, canon] of dupToCanon) {
        const dupName = dup.slice(dup.lastIndexOf("/") + 1);
        const canonName = canon.slice(canon.lastIndexOf("/") + 1);
        if (xml.includes(dupName)) {
          xml = xml.split(dupName).join(canonName);
          changed = true;
        }
      }
      if (changed) zip.file(relFile, xml);
    }
  }

  // 2. Remove phantom content-type Overrides.
  const present = new Set(list());
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    ct = ct.replace(/<Override\s+PartName="([^"]+)"[^>]*\/>/g, (full, part: string) =>
      present.has(part.replace(/^\//, "")) ? full : "",
    );
    zip.file("[Content_Types].xml", ct);
  }

  // 3. Optional font embedding (opt-in). Runs before timestamp normalization so
  //    the new font/rels/xml entries inherit the fixed date (determinism).
  if (options.fontEmbed) {
    await embedFontsInPptx(zip, options.fontEmbed);
  }

  // 4. Normalize timestamps so the same input yields byte-identical output.
  const FIXED_ISO = "2001-01-01T00:00:00Z";
  const FIXED_DATE = new Date(Date.UTC(2001, 0, 1));
  const core = zip.file("docProps/core.xml");
  if (core) {
    let xml = await core.async("string");
    xml = xml
      .replace(/(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/, `$1${FIXED_ISO}$2`)
      .replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${FIXED_ISO}$2`);
    zip.file("docProps/core.xml", xml);
  }
  for (const entry of Object.values(zip.files)) {
    (entry as unknown as { date: Date }).date = FIXED_DATE;
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
