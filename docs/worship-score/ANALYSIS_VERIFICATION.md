# Score analysis verification gate

Turning a source score (PDF / image) into a `ScoreIR` is a transcription step, and
transcription introduces pitch errors that are easy to miss once the score renders
cleanly. **An analysis is not "done" until its pitches have been audited
note-by-note against the source.** A valid IR and a good-looking render are
necessary but not sufficient.

## What must be checked

Directly readable from the source — confirm each matches the IR:

- Key signature, time signature, tempo, clef
- Chord symbols (per measure)
- Lyrics (presence/alignment — not for reproduction)
- Section structure and repeat/ending/D.S./Fine markings

The hard part — must be audited explicitly:

- **Every melody notehead's pitch**, in order, per staff system.

## Reliability of automated image reads (measured)

A run of a multi-agent audit on a real lead-sheet PDF showed that **LLM
note-reading from a rendered staff is not reliable enough to be the gate on its
own.** Across every staff system the independent readers disagreed *with each
other* (not just with the IR): different octaves, different note counts, and some
musically implausible leaps. Low inter-reader agreement means the reads are noise,
so they could neither confirm nor refute the transcription. Treat an automated
read as a **flagging aid only, and only where independent readers strongly agree
with each other** — never as proof the IR is wrong. It is also expensive (that run
spent millions of tokens for an inconclusive result), so do not rerun it blindly.

## What actually verifies pitches (in order of trust)

1. **Machine-format diff** — if the source ships as MIDI/MusicXML, diff the IR
   against it exactly. This is the only fully reliable automated gate.
2. **Human side-by-side** — render the IR as a clean lead sheet in the source's
   original order and have someone who can read or hear the song compare it to the
   source. The human eye/ear is the reliable reader for scans/PDFs.
3. **Harmonic sanity check (cheap, automated)** — confirm every melody note fits
   (or plausibly decorates) its measure's chord, and that the contour matches the
   source. Catches gross errors; does not prove every pitch.
4. **Multi-agent image read** — only as a flag, per the reliability note above.
   Locate staff systems by their **chord symbols, not their lyrics**, and emit
   **pitches and measure ids only** — never lyric text. Source scores under
   `scores/*/` are copyrighted and stay local.

Always also confirm key/meter/tempo/clef/chords/structure directly from the source
(those are readable reliably).
