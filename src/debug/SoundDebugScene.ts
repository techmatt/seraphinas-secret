/**
 * The sound debug view — every voice line, audited the way the game plays it.
 *
 * This is the review surface for the Firefly loop. A batch is recorded by hand,
 * cut apart by `voice:ingest` and timed by a forced aligner that is right most
 * of the time; the only way to know it is right *this* time is to listen, and
 * the only listening worth doing is to the machinery the game actually uses. So
 * a line here is played through a real `SpeechBubble` with a real `WordRibbon`
 * in it — not an audio element and a list of numbers — and what Matt watches is
 * the highlight itself. The words the aligner was unsure of are underlined in
 * red, so his ear knows where to go.
 *
 * **It is a dev tool, and it follows dev-tool conventions.** Rows of monospace
 * text, letters and arrow keys, no voice on its own labels. The game's rules —
 * coloured dots instead of letters, every word on screen spoken aloud — are
 * about the game Julia plays. This is not that: it is reached by a **keyboard**
 * key, keyboard is not a game input, and she plays on the pad, so there is no
 * sequence of presses on the thing in her hands that arrives here. The red
 * button still leaves, because a way out is not a feature.
 *
 * What it knows that the game may not is quarantined in `voiceDebug.ts` — which
 * provider filled a line in, out of which batch. See that file's header.
 */

import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { SpeechBubble } from '../ui/SpeechBubble';
import type { VoiceBank } from '../voice/VoiceBank';
import {
  loadVoiceDebug,
  markForReview,
  REVIEW_FILE,
  type VoiceDebugFile,
  type VoiceDebugLine,
} from './voiceDebug';

export const SOUND_DEBUG_SCENE = 'SoundDebugScene';

/** The key that opens it, from anywhere in the world. See `RoomScene`. */
export const SOUND_DEBUG_KEY = 'V';

export interface SoundDebugData {
  /** The room's own bank, so a clip is the same object the game would play. */
  voice: VoiceBank;
  /** Put back whatever was paused to open this. Called once, on the way out. */
  onExit: () => void;
}

const MONO = 'Consolas, "DejaVu Sans Mono", "Courier New", monospace';

const INK = {
  paper: '#d5cae8',
  dim: '#8578a0',
  lit: '#ffffff',
  stale: '#ff6b6b',
  low: '#ffb03a',
  minor: '#8fd1ff',
  good: '#9ce27a',
};

/** Left column: the list. Right column: whatever is selected, in full. */
const LIST = { x: 28, y: 192, rowHeight: 22, rows: 18, width: 672 };
const DETAIL = { x: 720, y: 192 };

/**
 * Where the balloon is told its speaker is standing.
 *
 * Deliberately far off the bottom of the screen. `SpeechBubble` clamps a
 * balloon into the camera's view, so a speaker below the world puts it as low
 * as it will go — which is where it belongs here, under the list, whatever
 * height the sentence came out to. Asking for a y directly would mean knowing
 * how many rows the words wrapped to before they were laid out.
 */
const BALLOON_ANCHOR = { x: GAME_WIDTH / 2, y: GAME_HEIGHT * 4 };

/** The four filters, each a ring of options cycled by its own number key. */
interface Filters {
  group: number;
  provider: number;
  flag: number;
  batch: number;
}

const FLAG_OPTIONS = [
  'all',
  'any flag',
  'stale',
  'simulated',
  'low-confidence',
  'tight-join',
  'profile-moved',
];

export class SoundDebugScene extends Phaser.Scene {
  private voice!: VoiceBank;
  private exit!: () => void;

  private sidecar: VoiceDebugFile | null = null;
  private bubble!: SpeechBubble;

  private filters: Filters = { group: 0, provider: 0, flag: 0, batch: 0 };
  private groupOptions = ['all'];
  private providerOptions = ['all'];
  private batchOptions = ['all'];

  /** The lines the filters let through, and where the cursor is in them. */
  private shown: VoiceDebugLine[] = [];
  private selected = 0;
  private top = 0;

  /** Marked since this view opened. The file is the record; this is the badge. */
  private readonly markedHere = new Set<string>();
  private status = 'loading debug.json…';

  private headline!: Phaser.GameObjects.Text;
  private coverage!: Phaser.GameObjects.Text;
  private groups!: Phaser.GameObjects.Text;
  private filterLine!: Phaser.GameObjects.Text;
  private statusLine!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private rows: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;

  private padWasDown = false;
  /** True from the moment the way out is taken. See the shutdown handler. */
  private closing = false;

  constructor() {
    super(SOUND_DEBUG_SCENE);
  }

  init(data: SoundDebugData): void {
    this.voice = data.voice;
    this.exit = data.onExit;
    // A fresh scene every time it is opened, so nothing is remembered between
    // sessions except the review file — which is the point of the review file.
    this.filters = { group: 0, provider: 0, flag: 0, batch: 0 };
    this.selected = 0;
    this.top = 0;
    this.closing = false;
    this.markedHere.clear();
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x120c18, 1).setOrigin(0, 0);
    this.add
      .rectangle(DETAIL.x - 16, LIST.y - 34, GAME_WIDTH - DETAIL.x - 12, 320, 0x1c1430, 1)
      .setOrigin(0, 0);

    this.headline = this.label(28, 18, 20, INK.lit);
    this.headline.setText('sound debug');
    this.label(GAME_WIDTH - 28, 24, 14, INK.dim).setText('esc or red closes').setOrigin(1, 0);

    this.coverage = this.label(28, 52, 15, INK.paper);
    this.groups = this.label(28, 76, 14, INK.dim);
    this.filterLine = this.label(28, 104, 14, INK.paper);
    this.label(28, 128, 13, INK.dim).setText(
      'up/down select · pgup/pgdn ±10 · home/end · enter play · m mark for review · ' +
        '1 2 3 4 cycle a filter · 0 clear them',
    );
    this.statusLine = this.label(28, 150, 14, INK.dim);

    this.add.rectangle(28, 176, GAME_WIDTH - 56, 1, 0x3a2b56, 1).setOrigin(0, 0);

    this.cursor = this.add
      .rectangle(LIST.x - 6, LIST.y, LIST.width + 12, LIST.rowHeight, 0x3a2b56, 1)
      .setOrigin(0, 0.5)
      .setVisible(false);

    for (let i = 0; i < LIST.rows; i++) {
      this.rows.push(this.label(LIST.x, LIST.y + i * LIST.rowHeight, 15, INK.paper).setOrigin(0, 0.5));
    }

    this.detail = this.label(DETAIL.x, LIST.y - 18, 15, INK.paper);
    this.detail.setLineSpacing(6);

    // The real one, so what is being audited is what the game draws. It clamps
    // itself into the camera's view, which is what puts it under the list.
    this.bubble = new SpeechBubble(this, BALLOON_ANCHOR.x, BALLOON_ANCHOR.y, this.voice);

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => {
      // Only when something *other* than the way out shut this down. Phaser
      // destroys the display list before this fires, so a balloon that has
      // already been stopped and destroyed cannot be asked to stop again —
      // `leave` does it while there is still a balloon to do it to.
      if (!this.closing) this.bubble.stop();
      this.input.keyboard?.off('keydown', this.onKey, this);
    });

    // Both of the awaits in this scene come back to a `closing` check: the view
    // can be opened and shut again inside one fetch, and repainting a scene
    // whose text objects Phaser has already destroyed is a crash.
    void loadVoiceDebug().then((file) => {
      if (this.closing) return;
      this.sidecar = file;
      if (!file) {
        this.status = 'no public/voice/debug.json — run npm run voice:build';
        this.repaint();
        return;
      }
      this.groupOptions = ['all', ...file.groups.map((g) => g.key)];
      this.providerOptions = ['all', ...new Set(file.lines.map((line) => line.provider))];
      this.batchOptions = ['all', 'not recorded', ...file.batches.map((b) => b.name)];
      this.status = `marks go to ${REVIEW_FILE}`;
      this.repaint();
    });

    this.repaint();
  }

  override update(): void {
    this.bubble.tick();

    // The pad has no way *in* — that is the whole of "Julia can never reach
    // this" — but red is red everywhere in this game, so it gets her out.
    const pad = this.input.gamepad?.getPad(0);
    const down = pad?.B ?? false;
    if (down && !this.padWasDown) this.leave();
    this.padWasDown = down;
  }

  // --- keys -----------------------------------------------------------------

  private onKey(event: KeyboardEvent): void {
    switch (event.code) {
      case 'Escape':
      case 'KeyC':
      case 'KeyL':
        this.leave();
        return;
      case 'ArrowDown':
        this.move(1);
        break;
      case 'ArrowUp':
        this.move(-1);
        break;
      case 'PageDown':
        this.move(10);
        break;
      case 'PageUp':
        this.move(-10);
        break;
      case 'Home':
        this.move(-this.shown.length);
        break;
      case 'End':
        this.move(this.shown.length);
        break;
      case 'Enter':
      case 'Space':
        this.play();
        return;
      case 'KeyM':
        void this.mark();
        return;
      case 'Digit1':
        this.cycle('group', this.groupOptions.length, event.shiftKey);
        break;
      case 'Digit2':
        this.cycle('provider', this.providerOptions.length, event.shiftKey);
        break;
      case 'Digit3':
        this.cycle('flag', FLAG_OPTIONS.length, event.shiftKey);
        break;
      case 'Digit4':
        this.cycle('batch', this.batchOptions.length, event.shiftKey);
        break;
      case 'Digit0':
        this.filters = { group: 0, provider: 0, flag: 0, batch: 0 };
        break;
      default:
        return;
    }
    this.repaint();
  }

  private cycle(which: keyof Filters, length: number, back: boolean): void {
    this.filters[which] = (this.filters[which] + (back ? length - 1 : 1)) % length;
    // A filter change can leave the cursor past the end of a shorter list.
    this.selected = 0;
    this.top = 0;
  }

  private move(by: number): void {
    this.selected = Phaser.Math.Clamp(this.selected + by, 0, Math.max(0, this.shown.length - 1));
    this.top = Phaser.Math.Clamp(this.top, this.selected - LIST.rows + 1, this.selected);
    this.top = Math.max(0, Math.min(this.top, Math.max(0, this.shown.length - LIST.rows)));
  }

  private leave(): void {
    if (this.closing) return;
    this.closing = true;
    this.bubble.stop();
    this.exit();
    this.scene.stop();
  }

  // --- what it does ---------------------------------------------------------

  /**
   * Play the selected line through the balloon the game speaks through, with
   * the doubted words underlined. Marking goes after `say`, because laying a
   * line out is what clears the marks — see `WordRibbon.markWords`.
   */
  private play(): void {
    const line = this.shown[this.selected];
    if (!line) return;

    if (!this.voice.get(line.id)) {
      this.status = `${line.id} is not in the manifest — run npm run voice:build`;
      this.repaint();
      return;
    }

    this.bubble.say(line.id, { id: line.speaker, ...BALLOON_ANCHOR });
    this.bubble.markWords(line.low.map((word) => word.index));
    this.status = `playing ${line.id}${line.low.length ? ` — ${line.low.length} word(s) underlined` : ''}`;
    this.repaint();
  }

  private async mark(): Promise<void> {
    const line = this.shown[this.selected];
    if (!line) return;
    this.status = `marking ${line.id}…`;
    this.repaint();

    const result = await markForReview(line.id);
    if (this.closing) return;
    if (result.ok) this.markedHere.add(line.id);
    this.status = result.ok
      ? `${line.id} → ${REVIEW_FILE} (${result.detail})`
      : `${line.id}: ${result.detail}`;
    this.repaint();
  }

  // --- drawing --------------------------------------------------------------

  private label(x: number, y: number, size: number, colour: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, '', { fontFamily: MONO, fontSize: `${size}px`, color: colour });
  }

  private repaint(): void {
    const file = this.sidecar;
    this.shown = file ? file.lines.filter((line) => this.passes(line)) : [];
    this.selected = Phaser.Math.Clamp(this.selected, 0, Math.max(0, this.shown.length - 1));

    this.headline.setText(
      file ? `sound debug — ${this.shown.length} of ${file.lines.length} lines` : 'sound debug',
    );
    this.coverage.setText(
      file
        ? `recorded ${file.totals.recorded}/${file.totals.lines}   ` +
            // Only when there are any: a zero here reads as a category of work
            // rather than as the absence of a problem.
            (file.totals.simulated ? `simulated ${file.totals.simulated}   ` : '') +
            `stale ${file.totals.stale}   ` +
            `unrecorded lines fall back to ${file.fallback}   ` +
            `low confidence at or under ${file.reviewScore.toFixed(2)}`
        : '',
    );
    this.groups.setText(
      file
        ? file.groups
            .map((g) => `${g.key} ${g.recorded}/${g.total}${g.simulated ? ` +${g.simulated}sim` : ''}`)
            .join('    ')
        : '',
    );
    this.filterLine.setText(
      `[1] ${this.groupOptions[this.filters.group]}   ` +
        `[2] ${this.providerOptions[this.filters.provider]}   ` +
        `[3] ${FLAG_OPTIONS[this.filters.flag]}   ` +
        `[4] ${this.batchOptions[this.filters.batch]}`,
    );
    this.statusLine.setText(this.status);

    for (let i = 0; i < this.rows.length; i++) {
      const line = this.shown[this.top + i];
      const row = this.rows[i]!;
      if (!line) {
        row.setText('');
        continue;
      }
      row.setText(this.rowText(line));
      row.setColor(this.top + i === this.selected ? INK.lit : this.rowColour(line));
    }

    const at = this.selected - this.top;
    this.cursor
      .setVisible(this.shown.length > 0 && at >= 0 && at < LIST.rows)
      .setY(LIST.y + at * LIST.rowHeight);

    this.detail.setText(this.detailText());
  }

  private passes(line: VoiceDebugLine): boolean {
    const group = this.groupOptions[this.filters.group]!;
    if (group !== 'all' && `${line.speaker}/${line.profile}` !== group) return false;

    const provider = this.providerOptions[this.filters.provider]!;
    if (provider !== 'all' && line.provider !== provider) return false;

    const flag = FLAG_OPTIONS[this.filters.flag]!;
    if (flag === 'any flag' && !line.flags.length) return false;
    if (flag !== 'all' && flag !== 'any flag' && !(line.flags as string[]).includes(flag)) {
      return false;
    }

    const batch = this.batchOptions[this.filters.batch]!;
    if (batch === 'not recorded' && line.batch !== null) return false;
    if (batch !== 'all' && batch !== 'not recorded' && line.batch !== batch) return false;

    return true;
  }

  private rowText(line: VoiceDebugLine): string {
    const mark = this.markedHere.has(line.id) ? '*' : ' ';
    return (
      `${mark} ${pad(line.id, 26)}${pad(`${line.speaker}/${line.profile}`, 22)}` +
      `${pad(line.batch ?? line.provider, 24)}${line.flags.map(short).join(' ')}`
    );
  }

  /** One colour per row, worst flag first — a row is read before it is parsed. */
  private rowColour(line: VoiceDebugLine): string {
    if (line.flags.includes('stale')) return INK.stale;
    if (line.flags.includes('low-confidence')) return INK.low;
    if (line.flags.length) return INK.minor;
    return line.batch ? INK.paper : INK.dim;
  }

  private detailText(): string {
    const line = this.shown[this.selected];
    if (!line) return this.sidecar ? 'nothing matches these filters' : '';

    const words = this.voice.get(line.id);
    const rows = [
      line.id,
      '',
      `speaker    ${line.speaker}`,
      `profile    ${line.profile}`,
      `source     ${line.provider}`,
      `batch      ${line.batch ?? '—'}`,
      `length     ${line.seconds.toFixed(2)} s`,
      `flags      ${line.flags.length ? line.flags.join(', ') : 'none'}`,
    ];

    if (line.flags.includes('simulated')) {
      rows.push('', 'SIMULATED — edge-tts standing in for Firefly.', 'Not a recording. Counts as nothing.');
    }

    if (line.low.length) {
      rows.push('', 'the aligner was unsure of:');
      for (const word of line.low) {
        rows.push(`  ${pad(JSON.stringify(word.word), 16)}${word.score.toFixed(2)}`);
      }
    }

    rows.push('', wrap(words?.text ?? '(not in the manifest)', 44));
    if (this.markedHere.has(line.id)) rows.push('', `marked → ${REVIEW_FILE}`);
    return rows.join('\n');
  }
}

/** The list is monospace, so a column is a character count. */
function pad(text: string, width: number): string {
  return text.length >= width ? `${text.slice(0, width - 2)}… ` : text.padEnd(width);
}

/** Short badges, because a row that wraps is a row nobody reads. */
function short(flag: string): string {
  return flag === 'low-confidence'
    ? 'low'
    : flag === 'tight-join'
      ? 'tight'
      : flag === 'profile-moved'
        ? 'moved'
        : flag === 'simulated'
          ? 'sim'
          : flag;
}

/** Hard-wrap for the detail panel, which is a fixed-width box of plain text. */
function wrap(text: string, width: number): string {
  const out: string[] = [];
  let row = '';
  for (const word of text.split(/\s+/)) {
    if (row && row.length + word.length + 1 > width) {
      out.push(row);
      row = '';
    }
    row = row ? `${row} ${word}` : word;
  }
  if (row) out.push(row);
  return out.join('\n');
}
