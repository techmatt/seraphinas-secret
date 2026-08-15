/**
 * `npm run voice:status` — am I ready to sit down and play this with Julia?
 *
 * One command, three questions, no audio involved:
 *
 * 1. **Coverage.** Which lines have no Firefly recording yet, by speaker and
 *    profile, because a batch is cut per speaker and profile and that is the
 *    unit of work.
 * 2. **Stale.** Which lines were edited after they were recorded. These are the
 *    urgent ones: the recording exists, sounds fine, and says the wrong thing,
 *    so the build has quietly fallen back and the voice has changed mid-scene.
 * 3. **Confidence.** Which words the aligner placed but was not sure of. The
 *    spike settled on 0.40 as the line worth looking at; every word under it
 *    began with a vowel or a nasal after silence, which is where there is no
 *    acoustic edge to find. These are the ones a future debug view lights up.
 *
 * Reads nothing but `content/` — no build output, so it answers the same before
 * and after `voice:build`.
 *
 *   npm run voice:status
 *   npm run voice:status -- --verbose    every missing line id, not just counts
 */

import {
  CLIP_DIR,
  REVIEW_SCORE,
  clipStateFor,
  forgetMissingAudio,
  profileFor,
  readClipIndex,
  readLines,
  readProfiles,
  spokenFor,
  type ClipRecord,
} from './firefly.js';
import type { LineSpec } from './types.js';

async function main(): Promise<void> {
  const verbose = process.argv.slice(2).includes('--verbose');

  const lines = await readLines();
  const profiles = await readProfiles();
  const index = await readClipIndex();
  const gone = await forgetMissingAudio(index);

  const missing: LineSpec[] = [];
  const stale: { line: LineSpec; clip: ClipRecord }[] = [];
  const fresh: { line: LineSpec; clip: ClipRecord }[] = [];

  for (const line of lines) {
    const state = clipStateFor(line, index);
    if (state.state === 'missing') missing.push(line);
    else if (state.state === 'stale') stale.push({ line, clip: state.clip });
    else fresh.push({ line, clip: state.clip });
  }

  const total = lines.length;
  const percent = total ? Math.round((fresh.length / total) * 100) : 0;
  console.log(`voice coverage — ${fresh.length} of ${total} lines recorded (${percent}%)\n`);

  // By speaker AND profile: that pair is one Firefly setup and one batch.
  const groups = new Map<string, { recorded: number; total: number; missing: string[] }>();
  for (const line of lines) {
    const key = `${line.speaker}/${profileFor(line, profiles)}`;
    const group = groups.get(key) ?? { recorded: 0, total: 0, missing: [] };
    group.total++;
    const state = clipStateFor(line, index).state;
    if (state === 'fresh') group.recorded++;
    else if (state === 'missing') group.missing.push(line.id);
    groups.set(key, group);
  }

  console.log(`${'speaker/profile'.padEnd(24)} recorded  to record`);
  for (const [key, group] of [...groups].sort()) {
    console.log(
      `${key.padEnd(24)} ${`${group.recorded}/${group.total}`.padStart(8)}  ${String(group.missing.length).padStart(9)}`,
    );
    if (verbose && group.missing.length) {
      for (const id of group.missing) console.log(`    ${id}`);
    }
  }

  if (gone.length) {
    console.log(
      `\nno audio on disk — ${gone.length} clip${gone.length === 1 ? '' : 's'} in the index has no file ` +
        `under ${CLIP_DIR}: ${gone.join(', ')}`,
    );
    console.log('Counted as never recorded above. Re-batch them, or restore the files.');
  }

  if (stale.length) {
    console.log(`\nSTALE — ${stale.length} recording${stale.length === 1 ? '' : 's'} no longer matches its line.`);
    console.log('These play in the fallback voice until they are recorded again:');
    for (const { line, clip } of stale) {
      console.log(`  ${line.id}  (${clip.batch}, recorded ${clip.ingested})`);
      console.log(`    was: ${clip.spoken}`);
      console.log(`    now: ${spokenFor(line)}`);
    }
    console.log(`  npm run voice:batch -- --stale`);
  }

  const flagged = fresh.flatMap(({ line, clip }) =>
    clip.align.review.map((w) => ({ id: line.id, batch: clip.batch, ...w })),
  );
  if (flagged.length) {
    console.log(
      `\nlow confidence — ${flagged.length} word${flagged.length === 1 ? '' : 's'} at or under ` +
        `${REVIEW_SCORE.toFixed(2)}, across ${new Set(flagged.map((w) => w.id)).size} lines`,
    );
    console.log('The highlight may sit slightly off on these. Worth an ear, not a re-record:');
    for (const word of flagged.sort((a, b) => a.score - b.score)) {
      console.log(`  ${word.id.padEnd(24)} ${JSON.stringify(word.word).padEnd(16)} ${word.score.toFixed(2)}`);
    }
  }

  const cuts = fresh.filter(({ clip }) => !clip.cut.usableGap);
  if (cuts.length) {
    console.log(
      `\ntight joins — ${cuts.length} clip${cuts.length === 1 ? '' : 's'} was cut where the recording ` +
        `never went quiet: ${cuts.map((c) => c.line.id).join(', ')}`,
    );
    console.log('Listen to the start and end of these; a longer pause in the paste fixes it.');
  }

  if (!stale.length && !missing.length) {
    console.log('\nEverything is recorded and current. Nothing falls back.');
  } else if (!verbose && missing.length) {
    console.log(`\n${missing.length} lines still on the fallback voice — --verbose lists them.`);
    console.log('  npm run voice:batch          cuts batch files for every one of them');
  }
}

main().catch((error: unknown) => {
  console.error(`voice status failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
