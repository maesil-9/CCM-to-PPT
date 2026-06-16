/**
 * Deterministic OOXML structural validation for generated PPTX (PRD §PPT-004).
 *
 * Covers the structural subset that can be verified without PowerPoint:
 *  - ZIP loads
 *  - [Content_Types].xml, root rels, presentation.xml + its rels
 *  - slide parts exist and match the expected count
 *  - slide masters/layouts present
 *  - every slide XML is well-formed
 *  - every relationship target resolves to a part that exists (no dangling refs)
 *  - embedded media exist and are referenced
 *
 * The live "open in PowerPoint without repair" test (PPT-004 #12) requires
 * Office and is tracked as a manual/CI step — it is intentionally NOT claimed
 * here.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { PptxCheck, PptxValidationResult } from "@worship-score/core";

/** Resolves an OOXML relationship Target against the part's base directory. */
function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const segments = baseDir.split("/").filter(Boolean);
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Upper bound on zip parts (defense against zip bombs on untrusted input). */
const MAX_PARTS = 5000;

function isImageSignature(bytes: Uint8Array): boolean {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  // JPEG: FF D8 FF
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

interface Relationship {
  target: string;
  mode: string | undefined;
}

function parseRelationships(parser: XMLParser, xml: string): Relationship[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rels = (doc["Relationships"] as Record<string, unknown> | undefined)?.["Relationship"];
  if (!rels) return [];
  const list = Array.isArray(rels) ? rels : [rels];
  return list.map((r) => {
    const rec = r as Record<string, string>;
    return { target: rec["@_Target"] ?? "", mode: rec["@_TargetMode"] };
  });
}

export async function validatePptxOoxml(
  buffer: Uint8Array,
  expectedSlideCount?: number,
): Promise<PptxValidationResult> {
  const checks: PptxCheck[] = [];
  const add = (name: string, passed: boolean, detail?: string) =>
    checks.push({ name, passed, ...(detail ? { detail } : {}) });

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
    add("zip_loadable", true);
  } catch (err) {
    add("zip_loadable", false, (err as Error).message);
    return { ok: false, checks };
  }

  const files = Object.keys(zip.files);
  const has = (name: string) => files.includes(name);

  add("entry_count_sane", files.length <= MAX_PARTS, `${files.length} parts`);
  add("content_types_present", has("[Content_Types].xml"));
  add("root_rels_present", has("_rels/.rels"));
  add("presentation_xml_present", has("ppt/presentation.xml"));
  add("presentation_rels_present", has("ppt/_rels/presentation.xml.rels"));

  const slideFiles = files
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort();
  add("slides_present", slideFiles.length > 0, `${slideFiles.length} slide(s)`);
  if (expectedSlideCount !== undefined) {
    add(
      "slide_count_match",
      slideFiles.length === expectedSlideCount,
      `expected ${expectedSlideCount}, got ${slideFiles.length}`,
    );
  }

  add("slide_master_present", files.some((f) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f)));
  add("slide_layout_present", files.some((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f)));

  const media = files.filter((f) => /^ppt\/media\//.test(f) && !zip.files[f]?.dir);
  add("media_present", media.length > 0, `${media.length} media file(s)`);

  // Every media part must be non-empty and a real PNG/JPEG (a 0-byte or bogus
  // background must not pass validation just because the OOXML structure is ok).
  let mediaValid = media.length > 0;
  let mediaDetail: string | undefined;
  for (const m of media) {
    const file = zip.file(m);
    if (!file) {
      mediaValid = false;
      mediaDetail = `${m} unreadable`;
      break;
    }
    const bytes = await file.async("uint8array");
    if (bytes.length === 0 || !isImageSignature(bytes)) {
      mediaValid = false;
      mediaDetail = `${m} empty or not PNG/JPEG`;
      break;
    }
  }
  add("media_valid_signature", mediaValid, mediaDetail);

  // Every [Content_Types].xml Override must point to a part that exists (OPC).
  let overridesOk = true;
  let overrideDetail: string | undefined;
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    const ct = await ctFile.async("string");
    for (const m of ct.matchAll(/<Override\s+PartName="([^"]+)"/g)) {
      const part = (m[1] ?? "").replace(/^\//, "");
      if (part && !has(part)) {
        overridesOk = false;
        overrideDetail = `phantom override ${part}`;
        break;
      }
    }
  }
  add("content_types_overrides_resolve", overridesOk, overrideDetail);

  // processEntities:false disables internal/external entity expansion (defense in
  // depth — this validator may run on untrusted PPTX in later milestones; pair
  // with a streaming size cap there).
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: false });

  // Well-formedness of every XML part + content-types parseable.
  let wellFormed = true;
  const xmlParts = files.filter((f) => f.endsWith(".xml") || f.endsWith(".rels"));
  for (const part of xmlParts) {
    try {
      const file = zip.file(part);
      if (!file) continue;
      parser.parse(await file.async("string"));
    } catch {
      wellFormed = false;
    }
  }
  add("all_xml_well_formed", wellFormed);

  // Every relationship target (internal) resolves to an existing part.
  let danglingRel: string | null = null;
  const relFiles = files.filter((f) => /(^|\/)_rels\/[^/]+\.rels$/.test(f));
  for (const relFile of relFiles) {
    const relDoc = zip.file(relFile);
    if (!relDoc) continue;
    const baseDir = dirname(dirname(relFile)); // strip "/_rels/x.rels" → owner dir
    for (const rel of parseRelationships(parser, await relDoc.async("string"))) {
      if (rel.mode === "External" || rel.target === "") continue;
      const resolved = resolveTarget(baseDir, rel.target);
      if (!has(resolved)) {
        danglingRel = `${relFile} -> ${rel.target}`;
        break;
      }
    }
    if (danglingRel) break;
  }
  add(
    "relationship_targets_resolve",
    danglingRel === null,
    danglingRel ?? undefined,
  );

  // Each slide references an embedded image via its rels.
  let everySlideHasImage = slideFiles.length > 0;
  for (const slide of slideFiles) {
    const relPath = slide.replace(/^ppt\/slides\/(slide\d+)\.xml$/, "ppt/slides/_rels/$1.xml.rels");
    const relDoc = zip.file(relPath);
    if (!relDoc) {
      everySlideHasImage = false;
      break;
    }
    const rels = parseRelationships(parser, await relDoc.async("string"));
    const hasImage = rels.some((r) => /\/media\//.test(r.target) || /image/i.test(r.target));
    if (!hasImage) {
      everySlideHasImage = false;
      break;
    }
  }
  add("each_slide_has_image", everySlideHasImage);

  const ok = checks.every((c) => c.passed);
  return { ok, checks };
}
