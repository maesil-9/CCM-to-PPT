# Score analysis verification gate

Turning a source score (PDF / image) into a `ScoreIR` is a transcription step, and
transcription introduces pitch errors that are easy to miss once the score renders
cleanly. **An analysis is not "done" until its pitches have been audited
note‑by‑note against the source.** A valid IR and a good‑looking render are
necessary but not sufficient.

## What must be checked

Directly readable from the source — confirm each matches the IR:

- Key signature, time signature, tempo, clef
- Chord symbols (per measure)
- Lyrics (presence/alignment — not for reproduction)
- Section structure and repeat/ending/D.S./Fine markings

The hard part — must be audited explicitly:

- **Every melody notehead's pitch**, in order, per staff system.

## Note‑by‑note audit procedure

Optical music reading (by a human glancing or by an LLM) is error‑prone, so the
audit is built for **consensus + flagging**, not a single read:

1. For each staff system, take **two independent blind reads** of the noteheads
   from the source (different reading strategies, neither shown the IR's claim).
2. Reconcile in code against the IR's pitch sequence:
   - both reads agree with the IR → **confirmed**;
   - both reads agree with each other but not the IR → **likely IR error**;
   - reads disagree → **third close read + majority vote**.
3. Anything not `confirmed` is **flagged for human/ear confirmation** — a flag is
   "needs a look", not "proven wrong".

The repo includes a reusable `pitch-audit` workflow that implements this fan‑out
(two blind readers per system, in‑script reconcile, tie‑break read). Locate staff
systems by their **chord symbols, not their lyrics**, and have the audit emit
**pitches and measure ids only** — never lyric text. Source scores under
`scores/*/` are copyrighted and stay local (see the repo's score handling notes).

## Ground truth, when available

If the source ships as MIDI/MusicXML, diff the IR against it exactly — that beats
any image read. The multi‑agent image audit above is the fallback for scans/PDFs.
