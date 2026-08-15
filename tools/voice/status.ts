/**
 * `npm run voice:status` — am I ready to sit down and play this with Julia?
 *
 * One command, three questions, no audio involved:
 *
 * 1. **Coverage.** Which lines have no Firefly recording yet, by speaker and
 *    profile, because a batch is cut per speaker and profile and that is the
 *    unit of work. **Only a real recording counts.** A `voice:simulate` clip is
 *    edge-tts wearing a clip's clothes; it plays, and it is listed separately as
 *    work still to do, because pretending otherwise is what made this file wrong
 *    for a day on 2026-08-15.
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
  PLACEHOLDER_VOICE,
  REVIEW_SCORE,
  clipStateFor,
  forgetMissingAudio,
  isSimulated,
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
  // Playable, current, and not a recording: a `voice:simulate` stand-in. It is
  // held apart from `fresh` everywhere below, because the one question this
  // command answers is how much of the game is in Matt's chosen voices.
  const simulated: { line: LineSpec; clip: ClipRecord }[] = [];

  for (const line of lines) {
    const state = clipStateFor(line, index);
    if (state.state === 'missing') missing.push(line);
    else if (state.state === 'stale') stale.push({ line, clip: state.clip });
    else if (isSimulated(state.clip)) simulated.push({ line, clip: state.clip });
    else fresh.push({ line, clip: state.clip });
  }

  const total = lines.length;
  const percent = total ? Math.round((fresh.length / total) * 100) : 0;
  console.log(
    `voice coverage — ${fresh.length} of ${total} lines recorded (${percent}%)` +
      (simulated.length ? `, ${simulated.length} simulated` : '') +
      '\n',
  );

  // By speaker AND profile: that pair is one Firefly setup and one batch.
  const groups = new Map<
    string,
    { recorded: number; simulated: number; total: number; toRecord: string[] }
  >();
  for (const line of lines) {
    const key = `${line.speaker}/${profileFor(line, profiles)}`;
    const group = groups.get(key) ?? { recorded: 0, simulated: 0, total: 0, toRecord: [] };
    group.total++;
    const state = clipStateFor(line, index);
    if (state.state === 'fresh' && !isSimulated(state.clip)) group.recorded++;
    else {
      // Simulated and missing are the same job: this line still needs Matt at
      // the Firefly page. Stale is its own louder section further down.
      if (state.state === 'fresh') group.simulated++;
      if (state.state !== 'stale') group.toRecord.push(line.id);
    }
    groups.set(key, group);
  }

  const anySimulated = simulated.length > 0;
  console.log(
    `${'speaker/profile'.padEnd(24)} recorded  to record${anySimulated ? '  simulated' : ''}`,
  );
  for (const [key, group] of [...groups].sort()) {
    console.log(
      `${key.padEnd(24)} ${`${group.recorded}/${group.total}`.padStart(8)}  ${String(group.toRecord.length).padStart(9)}` +
        (anySimulated ? `  ${String(group.simulated).padStart(9)}` : ''),
    );
    if (verbose && group.toRecord.length) {
      for (const id of group.toRecord) console.log(`    ${id}`);
    }
  }

  if (simulated.length) {
    console.log(
      `\nSIMULATED — ${simulated.length} clip${simulated.length === 1 ? '' : 's'} is edge-tts standing in ` +
        'for Firefly, not a recording.',
    );
    console.log('They play, and they count as nothing. Record them for real, or delete them:');
    for (const { line, clip } of simulated) console.log(`  ${line.id}  (${clip.batch})`);
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

  // The three checks below are about the audio the game will actually play, so
  // a simulated clip is in scope for all of them: it was cut by the same cutter
  // and timed by the same aligner, and a tight join in it is a real tight join.
  const played = [...fresh, ...simulated];

  const flagged = played.flatMap(({ line, clip }) =>
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

  // Prosody lives in the Firefly profile rather than in our data, so a profile
  // edited after a batch was cut is a silent change of voice mid-scene. It does
  // not make a clip stale — only the text does that — but it is worth saying.
  //
  // A clip recorded while the profile still said TBD is the exception, and it
  // is the ordinary case right now: Matt records with voices he picks in
  // Firefly's UI and writes their names down afterwards. There is no voice for
  // that clip to have drifted *from*, so filling the name in is bookkeeping
  // catching up, not the profile moving under a finished recording.
  const named = played.filter(({ clip }) => clip.voice !== PLACEHOLDER_VOICE);
  const drifted = named.filter(({ clip }) => clip.voice !== profiles.profiles[clip.profile]?.voice);
  if (drifted.length) {
    console.log(
      `\nprofile moved — ${drifted.length} clip${drifted.length === 1 ? '' : 's'} recorded under a voice ` +
        `profiles.json no longer names: ${[...new Set(drifted.map((d) => d.clip.profile))].join(', ')}`,
    );
    console.log('Still played, because the words are right. Re-record if the voice matters.');
  }

  const unnamed = played.length - named.length;
  if (unnamed) {
    console.log(
      `\nvoice not written down — ${unnamed} clip${unnamed === 1 ? '' : 's'} was recorded while ` +
        `profiles.json still said ${PLACEHOLDER_VOICE}.`,
    );
    console.log('Nothing is wrong with them. Fill the real voice names in when you have them.');
  }

  const cuts = played.filter(({ clip }) => !clip.cut.usableGap);
  if (cuts.length) {
    console.log(
      `\ntight joins — ${cuts.length} clip${cuts.length === 1 ? '' : 's'} was cut where the recording ` +
        `never went quiet: ${cuts.map((c) => c.line.id).join(', ')}`,
    );
    console.log('Listen to the start and end of these; a longer pause in the paste fixes it.');
  }

  const toRecord = missing.length + simulated.length;
  if (!stale.length && !toRecord) {
    console.log('\nEverything is recorded and current. Nothing falls back.');
  } else if (!verbose && toRecord) {
    console.log(
      `\n${toRecord} lines still need Matt at the Firefly page — --verbose lists them` +
        (simulated.length ? ` (${missing.length} on the fallback voice, ${simulated.length} simulated).` : '.'),
    );
    console.log('  npm run voice:batch                     cuts batch files for every one of them');
    console.log('  npm run voice:batch -- --per-profile    one file per profile, the whole script');
  }
}

main().catch((error: unknown) => {
  console.error(`voice status failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
