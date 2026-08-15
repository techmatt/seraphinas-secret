# Recording a batch

This folder is the hand-off between the tools and Adobe Firefly's web page.
Everything in it except this file is gitignored: batch files are *inputs*, and
what gets committed is the finished clips under `content/voice/clips/`.

## The loop

1. **Cut the batch files.**

   ```sh
   npm run voice:batch
   ```

   That takes every line with no recording yet and writes, per batch, two files
   here: `dad-01.txt` and `dad-01.json`. About a dozen lines each, never mixing
   two speakers or two voice profiles, because one batch is one Firefly setup.

   To record a specific set instead: `-- --speaker dad`, `-- --profile storybook`,
   `-- --ids seraphina_hello,seraphina_apple`, or `-- --stale` for the lines whose
   text has changed since they were recorded. A batch of one line is normal —
   that is how a single edited line gets patched.

2. **Set Firefly up for the batch.** Open `dad-01.json` and read `profile` and
   `profileSettings`: the voice name and the UI settings that profile is
   recorded with. They live in `content/voice/profiles.json` and they are the
   same every time, so a re-record months later sounds like the first one.

3. **Paste and generate.** Open `dad-01.txt`, select all, paste. There is
   nothing in that file but the words to be spoken — no ids, no headings —
   because anything else in it gets read out loud.

4. **Download the WAV and save it here as `dad-01.wav`.** The name must match
   the batch. Nothing else about the file matters: any sample rate, mono or
   stereo, and `.mp3` / `.flac` work too if that is what comes down.

5. **Ingest.**

   ```sh
   npm run voice:ingest
   ```

   That aligns the recording against exactly the text in the `.txt`, cuts it
   into one clip per line, trims, levels and encodes each one into
   `content/voice/clips/`, and writes down where every clip came from.

6. **Build and check.**

   ```sh
   npm run voice:build
   npm run voice:status
   ```

   `voice:status` is the "am I ready" view: what is still on the fallback voice,
   what has gone stale, and which words the aligner was unsure of.

Repeat from 1. `npm run voice:batch` only ever offers what is not yet recorded,
so the loop empties itself.

## What to check on the very first real batch

Nothing here has met Firefly yet — the machinery was proven on simulated
batches (`npm run voice:simulate` speaks a batch as one continuous edge-tts
utterance and drops the WAV in as if it were a download). Four things are worth
a look the first time a real one comes back, because all four are guesses until
then:

- **Does Firefly pause between the lines?** The cut between two clips goes at
  the quietest point in the gap, and the gap has to exist. `voice:ingest`
  prints `NO SILENT GAP AT A CUT` when it had to cut somewhere that was never
  quiet. If that shows up, put a blank line between lines in the paste, or
  record fewer lines per batch.
- **Did it read every line?** Firefly may have its own idea about how much text
  it will speak in one go. The ingest aligns whatever it is given against the
  full transcript, so a truncated recording comes out as clips that get
  progressively more wrong rather than as an error. Compare the printed
  duration against roughly two and a half seconds per line.
- **Did it say the punctuation, or anything else, out loud?** Watch for a
  ".txt" heading or a stray quote mark getting voiced.
- **The sample rate**, which is printed by `voice:ingest`. Everything handles
  24 / 44.1 / 48 kHz already; this is only worth knowing.

## Files

| File | What |
| --- | --- |
| `<batch>.txt` | The spoken text, one line per line of dialog. Paste this. |
| `<batch>.json` | The sidecar: line ids in order, each one's hash, the profile, the date. |
| `<batch>.wav` | Matt's download. Named after the batch, saved here by hand. |

The sidecar is what makes the ingest possible: the `.txt` has no ids in it, so
the only record of which line is which is the order in that JSON file. Do not
re-order the text file, and do not edit it — if a line is wrong, fix it in
`content/voice/lines.json` and cut a new batch.
