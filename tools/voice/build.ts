/**
 * `npm run voice:build` — turn authored lines into audio files plus a manifest.
 *
 * Every word the game speaks is baked here, at content time, never at runtime.
 * The output of this script is the game's entire knowledge of voice: one audio
 * file per line and one `manifest.json` describing them.
 *
 * Two things can fill a line in, and the choice is made per line:
 *
 * - **An ingested Firefly clip**, recorded by hand and stored under
 *   `content/voice/clips/`, with word timings recovered by forced alignment.
 *   Used only when the text stored beside the clip still matches the line —
 *   the hash is the only guard, because alignment will happily fit the wrong
 *   words to the right audio and report itself confident.
 * - **edge-tts**, synthesised here and now with its own word boundaries. The
 *   fallback for a line never recorded, and the *loud* fallback for a line
 *   edited since it was.
 *
 * The manifest says nothing about which. The game reads it and cannot tell,
 * which is the whole contract — see `types.ts`.
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { align, isSpeakable } from './align.js';
import { buildDebugSidecar } from './debugSidecar.js';
import {
  CLIP_DIR,
  clipStateFor,
  forgetMissingAudio,
  isSimulated,
  profileFor,
  readClipIndex,
  readProfiles,
  spokenFor,
  type ClipIndex,
  type ClipRecord,
} from './firefly.js';
import { EdgeTtsProvider } from './providers/edgeTts.js';
import type {
  LineSpec,
  ManifestLine,
  VoiceBook,
  VoiceConfig,
  VoiceManifest,
  VoiceProvider,
} from './types.js';

const MANIFEST_VERSION = 1;

/** Providers are keyed by the `provider` field in voices.json. */
const PROVIDERS: Record<string, () => VoiceProvider> = {
  'edge-tts': () => new EdgeTtsProvider(),
};

interface Options {
  lines: string;
  voices: string;
  clips: string;
  out: string;
  /** Prefix written into each manifest entry's `audio` field. */
  base: string;
  force: boolean;
  /** Ignore the clip store entirely, for a pure fallback build. */
  noClips: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    lines: path.join('content', 'voice', 'lines.json'),
    voices: path.join('content', 'voice', 'voices.json'),
    clips: CLIP_DIR,
    out: path.join('public', 'voice'),
    base: 'voice',
    force: false,
    noClips: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };

    if (arg === '--force') opts.force = true;
    else if (arg === '--no-clips') opts.noClips = true;
    else if (arg === '--lines') opts.lines = value();
    else if (arg === '--voices') opts.voices = value();
    else if (arg === '--clips') opts.clips = value();
    else if (arg === '--out') opts.out = value();
    else if (arg === '--base') opts.base = value();
    else throw new Error(`unknown argument ${arg}`);
  }

  return opts;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/**
 * Everything that would change the audio. Kept in a sidecar rather than the
 * manifest so the manifest stays exactly the contract the game reads.
 *
 * `source` is in it so a line that gains or loses a Firefly clip rebuilds even
 * though its text never moved.
 */
function fingerprint(source: unknown): string {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex').slice(0, 16);
}

/** Prosody on a line overrides the speaker's, so one line can be slowed down. */
function resolveVoice(line: LineSpec, book: VoiceBook): VoiceConfig {
  const speaker = book.speakers[line.speaker];
  if (!speaker) {
    throw new Error(`line "${line.id}" has speaker "${line.speaker}", which voices.json lacks`);
  }
  return {
    voice: speaker.voice,
    rate: line.rate ?? speaker.rate,
    pitch: line.pitch ?? speaker.pitch,
    volume: line.volume ?? speaker.volume,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const lines = await readJson<LineSpec[]>(opts.lines);
  const book = await readJson<VoiceBook>(opts.voices);

  const makeProvider = PROVIDERS[book.provider];
  if (!makeProvider) {
    throw new Error(
      `voices.json asks for provider "${book.provider}"; known: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }
  const provider = makeProvider();

  const empty: ClipIndex = { version: 0, clips: {}, batches: {} };
  const clipIndex = opts.noClips ? empty : await readClipIndex(path.join(opts.clips, 'index.json'));
  const gone = await forgetMissingAudio(clipIndex, opts.clips);
  for (const id of gone) {
    console.log(`  ${id}: recorded, but its audio is not under ${opts.clips} — falling back`);
  }

  const ids = new Set<string>();
  for (const line of lines) {
    if (ids.has(line.id)) throw new Error(`duplicate line id "${line.id}"`);
    ids.add(line.id);
  }

  await mkdir(opts.out, { recursive: true });

  const cacheFile = path.join(opts.out, '.build-cache.json');
  const cache: Record<string, { hash: string; entry: ManifestLine }> = opts.force
    ? {}
    : await readJson<typeof cache>(cacheFile).catch(() => ({}));

  const manifest: VoiceManifest = { version: MANIFEST_VERSION, provider: provider.id, lines: [] };
  const nextCache: typeof cache = {};
  const stale: { line: LineSpec; clip: ClipRecord }[] = [];
  const missing: LineSpec[] = [];
  let recorded = 0;
  let simulated = 0;
  let built = 0;
  let skipped = 0;

  for (const line of lines) {
    const state = clipStateFor(line, clipIndex);
    if (state.state === 'stale') stale.push({ line, clip: state.clip });
    if (state.state === 'missing') missing.push(line);
    // A simulated clip is used — the words are the right words — but it is not
    // a recording and is never counted as one. See `firefly.ts`.
    if (state.state === 'fresh') (isSimulated(state.clip) ? simulated++ : recorded++);

    const voice = resolveVoice(line, book);
    const hash =
      state.state === 'fresh'
        ? fingerprint({
            source: state.clip.provider,
            clip: state.clip.audio,
            spoken: state.clip.spokenHash,
            ingested: state.clip.ingested,
            text: line.text,
          })
        : fingerprint({ source: provider.id, voice, text: line.text, say: line.say ?? null });

    const cached = cache[line.id];
    if (cached?.hash === hash && (await exists(path.join(opts.out, path.basename(cached.entry.audio))))) {
      manifest.lines.push(cached.entry);
      nextCache[line.id] = cached;
      skipped++;
      continue;
    }

    const entry =
      state.state === 'fresh'
        ? await fromClip(opts, line, state.clip)
        : await fromProvider(opts, line, voice, provider);

    manifest.lines.push(entry);
    nextCache[line.id] = { hash, entry };
    built++;
  }

  // What actually filled these lines in, taken from the clips rather than
  // assumed: a `simulated` clip must not report itself as `firefly` here either.
  const sources = new Set(
    lines.map((line) => {
      const state = clipStateFor(line, clipIndex);
      return state.state === 'fresh' ? state.clip.provider : provider.id;
    }),
  );
  manifest.provider = [...sources].join('+');

  await writeFile(path.join(opts.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(cacheFile, `${JSON.stringify(nextCache, null, 2)}\n`);

  // Beside the manifest, never inside it: where each line came from, which
  // batch, and which words the aligner doubted. Only the dev-only sound debug
  // view reads it, and the game is unchanged if it is deleted. See
  // `debugSidecar.ts`.
  const profiles = await readProfiles().catch(() => null);
  if (profiles) {
    const sidecar = buildDebugSidecar(lines, manifest.lines, clipIndex, profiles, provider.id);
    await writeFile(path.join(opts.out, 'debug.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  }

  const orphans = (await readdir(opts.out))
    .filter((f) => f.endsWith('.mp3'))
    .filter((f) => !ids.has(f.slice(0, -4)));
  for (const orphan of orphans) {
    await unlink(path.join(opts.out, orphan));
    console.log(`  removed orphan ${orphan}`);
  }

  await announce(opts, lines, recorded, simulated, stale, missing);

  console.log(
    `voice: ${built} built, ${skipped} unchanged, ${recorded} from recordings, ` +
      (simulated ? `${simulated} from simulated stand-ins, ` : '') +
      `${manifest.lines.length} lines in ${path.join(opts.out, 'manifest.json')}`,
  );
}

/**
 * A line filled in from an ingested recording.
 *
 * The aligner timed the *spoken* tokens, punctuation-only ones included as
 * zero-length placeholders; `align.ts` wants only the ones that were actually
 * said, and does the mapping onto the display text itself. That mapping is not
 * re-implemented here, and never should be.
 */
async function fromClip(opts: Options, line: LineSpec, clip: ClipRecord): Promise<ManifestLine> {
  const spoken = clip.words.filter((w) => isSpeakable(w.word));
  const words = align(line.text, spoken, line.say !== undefined);

  await copyFile(path.join(opts.clips, clip.audio), path.join(opts.out, clip.audio));

  console.log(
    `  clip  ${line.id.padEnd(24)} ${words.length} words  ${clip.seconds.toFixed(2)}s  ` +
      `${(clip.bytes / 1024).toFixed(0)} KB  ${clip.batch}`,
  );

  return {
    id: line.id,
    speaker: line.speaker,
    text: words.map((w) => w.word).join(' '),
    audio: `${opts.base}/${clip.audio}`,
    words,
    duration: words.length ? words[words.length - 1]!.end : 0,
  };
}

/** A line synthesised here and now, with the provider's own word boundaries. */
async function fromProvider(
  opts: Options,
  line: LineSpec,
  voice: VoiceConfig,
  provider: VoiceProvider,
): Promise<ManifestLine> {
  const result = await provider.synthesize(line.say ?? line.text, voice);
  const words = align(line.text, result.words, line.say !== undefined);
  const name = `${line.id}.${result.extension}`;

  await writeFile(path.join(opts.out, name), result.audio);

  console.log(
    `  built ${line.id.padEnd(24)} ${words.length} words  ` +
      `${(words.length ? words[words.length - 1]!.end : 0).toFixed(2)}s  ` +
      `${(result.audio.length / 1024).toFixed(0)} KB`,
  );

  return {
    id: line.id,
    speaker: line.speaker,
    text: words.map((w) => w.word).join(' '),
    audio: `${opts.base}/${name}`,
    words,
    duration: words.length ? words[words.length - 1]!.end : 0,
  };
}

/**
 * The loud part of the loud fallback.
 *
 * A stale line is the dangerous one: there is a perfectly good recording on
 * disk saying something the game no longer shows, and the build has quietly
 * declined to use it. That has to be impossible to scroll past.
 */
async function announce(
  opts: Options,
  lines: LineSpec[],
  recorded: number,
  simulated: number,
  stale: { line: LineSpec; clip: ClipRecord }[],
  missing: LineSpec[],
): Promise<void> {
  if (stale.length) {
    const rule = '='.repeat(72);
    console.log(`\n${rule}`);
    console.log(`STALE — ${stale.length} recorded line${stale.length === 1 ? '' : 's'} no longer matches its text.`);
    console.log('Falling back to edge-tts for these. Re-batch them to get the voice back:');
    console.log(`  npm run voice:batch -- --ids ${stale.map((s) => s.line.id).join(',')}`);
    console.log(rule);
    for (const { line, clip } of stale) {
      console.log(`  ${line.id}  (${clip.batch})`);
      console.log(`    recorded: ${clip.spoken}`);
      console.log(`    now:      ${spokenFor(line)}`);
    }
    console.log(rule);
  }

  if (missing.length && !opts.noClips) {
    const profiles = await readProfiles().catch(() => null);
    const byProfile = new Map<string, number>();
    for (const line of missing) {
      const key = profiles ? `${line.speaker}/${profileFor(line, profiles)}` : line.speaker;
      byProfile.set(key, (byProfile.get(key) ?? 0) + 1);
    }
    const summary = [...byProfile].map(([key, n]) => `${key} ${n}`).join(', ');
    console.log(
      `\ncoverage: ${recorded}/${lines.length} lines recorded` +
        (simulated ? ` (plus ${simulated} simulated, which count as nothing)` : '') +
        `; ${missing.length} on edge-tts (${summary}) — npm run voice:status for the list`,
    );
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error(`voice build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
