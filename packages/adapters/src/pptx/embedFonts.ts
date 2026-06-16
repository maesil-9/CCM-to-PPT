/**
 * Embed full TrueType/OpenType fonts into a PPTX package (ECMA-376 font
 * embedding) so the slide's NATIVE text (title, section labels) renders with the
 * intended font on machines that lack it. Score lyrics are already rasterized
 * into the slide image, so this is purely for the editable text and is opt-in
 * (it embeds the whole font — no subsetting tooling here — which is large).
 *
 * Mutates the given JSZip in place. Must run before timestamp normalization so
 * the new entries inherit the fixed date (deterministic output).
 *
 * Parts added:
 *  - ppt/fonts/fontN.fntdata           (raw font bytes; PPTX does not obfuscate)
 *  - [Content_Types].xml               Default Extension="fntdata"
 *  - ppt/_rels/presentation.xml.rels   relationship(s) of type .../font
 *  - ppt/presentation.xml              embedTrueTypeFonts="1" + <p:embeddedFontLst>
 */
import type JSZip from "jszip";
import type { PptxFontEmbed } from "@worship-score/core";

const FONT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";
const FONT_CONTENT_TYPE = "application/x-fontdata";

/** Escape a value for an XML attribute (font family names may contain & or quotes). */
function xmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function uniqueRelId(existing: Set<string>, base: string): string {
  let id = base;
  let n = 1;
  while (existing.has(id)) id = `${base}_${n++}`;
  existing.add(id);
  return id;
}

export async function embedFontsInPptx(zip: JSZip, embed: PptxFontEmbed): Promise<void> {
  const presFile = zip.file("ppt/presentation.xml");
  const relFile = zip.file("ppt/_rels/presentation.xml.rels");
  const ctFile = zip.file("[Content_Types].xml");
  if (!presFile || !relFile || !ctFile) return; // not a recognizable PPTX; leave untouched

  const weights: Array<{ tag: "regular" | "bold"; bytes: Uint8Array }> = [
    { tag: "regular", bytes: embed.regular },
    ...(embed.bold ? [{ tag: "bold" as const, bytes: embed.bold }] : []),
  ];

  // 1. Add the font parts. Number them after any existing fonts.
  let fontIndex = 1;
  while (zip.file(`ppt/fonts/font${fontIndex}.fntdata`)) fontIndex++;

  // 2. Relationship ids, kept clear of existing ones.
  let relXml = await relFile.async("string");
  const existingIds = new Set([...relXml.matchAll(/Id="([^"]+)"/g)].map((m) => m[1] as string));

  const fontRefs: Array<{ tag: "regular" | "bold"; relId: string }> = [];
  const relInserts: string[] = [];
  for (const w of weights) {
    const partName = `ppt/fonts/font${fontIndex}.fntdata`;
    zip.file(partName, w.bytes);
    const relId = uniqueRelId(existingIds, "rIdFont" + fontIndex);
    relInserts.push(`<Relationship Id="${relId}" Type="${FONT_REL_TYPE}" Target="fonts/font${fontIndex}.fntdata"/>`);
    fontRefs.push({ tag: w.tag, relId });
    fontIndex++;
  }

  // 3. presentation.xml.rels — insert before </Relationships>.
  relXml = relXml.replace(/<\/Relationships>\s*$/, `${relInserts.join("")}</Relationships>`);
  zip.file("ppt/_rels/presentation.xml.rels", relXml);

  // 4. [Content_Types].xml — ensure a Default for the fntdata extension.
  let ct = await ctFile.async("string");
  if (!/Extension="fntdata"/.test(ct)) {
    ct = ct.replace(/(<Types[^>]*>)/, `$1<Default Extension="fntdata" ContentType="${FONT_CONTENT_TYPE}"/>`);
    zip.file("[Content_Types].xml", ct);
  }

  // 5. presentation.xml — turn on embedding and add the embeddedFontLst in the
  //    correct schema position (immediately after <p:notesSz/>, before
  //    custShowLst/defaultTextStyle/extLst).
  let pres = await presFile.async("string");
  const refXml = fontRefs
    .map((r) => `<p:${r.tag} r:id="${r.relId}"/>`)
    .join("");
  const fontListXml =
    `<p:embeddedFontLst><p:embeddedFont><p:font typeface="${xmlAttr(embed.family)}"/>${refXml}</p:embeddedFont></p:embeddedFontLst>`;

  // Enable embedding on the root element if not already set.
  if (!/\bembedTrueTypeFonts=/.test(pres)) {
    pres = pres.replace(/<p:presentation\b/, '<p:presentation embedTrueTypeFonts="1"');
  }

  // Insert after the (self-closing) notesSz; fall back to before defaultTextStyle,
  // then before </p:presentation>, so a layout variation never drops the list.
  if (/<p:notesSz\b[^>]*\/>/.test(pres)) {
    pres = pres.replace(/(<p:notesSz\b[^>]*\/>)/, `$1${fontListXml}`);
  } else if (/<p:defaultTextStyle\b/.test(pres)) {
    pres = pres.replace(/(<p:defaultTextStyle\b)/, `${fontListXml}$1`);
  } else {
    pres = pres.replace(/<\/p:presentation>\s*$/, `${fontListXml}</p:presentation>`);
  }
  zip.file("ppt/presentation.xml", pres);
}
