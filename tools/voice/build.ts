/**
 * `npm run voice:build` — turn authored lines into audio files plus a manifest.
 *
 * Every word the game speaks is baked here, at content time, never at runtime.
 * The output of this script is the game's entire knowledge of voice: one audio
 * file per line and one `manifest.json` describing them. Swapping providers
 * means writing a new module under `providers/` and re-running this.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { align } from './align.js';
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
  out: string;
  /** Prefix written into each manifest entry's `audio` field. */
  base: string;
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    lines: path.join('content', 'voice', 'lines.json'),
    voices: path.join('content', 'voice', 'voices.json'),
    out: path.join('public', 'voice'),
    base: 'voice',
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };

    if (arg === '--force') opts.force = true;
    else if (arg === '--lines') opts.lines = value();
    else if (arg === '--voices') opts.voices = value();
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
 */
function fingerprint(line: LineSpec, voice: VoiceConfig, provider: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ provider, voice, text: line.text, say: line.say ?? null }))
    .digest('hex')
    .slice(0, 16);
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
  let built = 0;
  let skipped = 0;

  for (const line of lines) {
    const voice = resolveVoice(line, book);
    const hash = fingerprint(line, voice, provider.id);
    const audioName = `${line.id}.mp3`;
    const audioPath = path.join(opts.out, audioName);

    const cached = cache[line.id];
    if (cached?.hash === hash && (await exists(audioPath))) {
      manifest.lines.push(cached.entry);
      nextCache[line.id] = cached;
      skipped++;
      continue;
    }

    const spokenText = line.say ?? line.text;
    const result = await provider.synthesize(spokenText, voice);
    const words = align(line.text, result.words, line.say !== undefined);

    await writeFile(path.join(opts.out, `${line.id}.${result.extension}`), result.audio);

    const entry: ManifestLine = {
      id: line.id,
      speaker: line.speaker,
      text: words.map((w) => w.word).join(' '),
      audio: `${opts.base}/${line.id}.${result.extension}`,
      words,
      duration: words.length ? words[words.length - 1]!.end : 0,
    };

    manifest.lines.push(entry);
    nextCache[line.id] = { hash, entry };
    built++;
    console.log(
      `  built ${line.id.padEnd(24)} ${entry.words.length} words  ${entry.duration.toFixed(2)}s  ` +
        `${(result.audio.length / 1024).toFixed(0)} KB`,
    );
  }

  await writeFile(path.join(opts.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(cacheFile, `${JSON.stringify(nextCache, null, 2)}\n`);

  const orphans = (await readdir(opts.out))
    .filter((f) => f.endsWith('.mp3'))
    .filter((f) => !ids.has(f.slice(0, -4)));
  for (const orphan of orphans) {
    await unlink(path.join(opts.out, orphan));
    console.log(`  removed orphan ${orphan}`);
  }

  console.log(
    `voice: ${built} built, ${skipped} unchanged, ${manifest.lines.length} lines in ${path.join(opts.out, 'manifest.json')}`,
  );
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
