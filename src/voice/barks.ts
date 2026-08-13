/**
 * The little things she says to herself.
 *
 * A bark is one word or one sentence, in her own voice, about the thing she is
 * holding or the thing she just hit. It is the lowest kind of speech in the
 * game: barks interrupt each other freely and are dropped outright rather than
 * talked over anything that matters — see `SpeechBubble.bark`.
 *
 * The naming barks are *derived* rather than listed. Every one of them is her
 * saying the name of a thing that already has an id — `axe` is "Axe!", `ruby` is
 * "Ruby!" — so a table mapping five ids onto five nearly identical ids would be
 * five more places for the two to disagree. A new tool or a new stone is a line
 * in `content/voice/lines.json` and nothing else. A missing one is not silent:
 * the bubble warns about a line the manifest lacks, which is how "text with no
 * voice is a bug" gets found.
 *
 * The corrective pair cannot be derived from anything, so it is written down.
 */

import type { GemId } from '../ui/toolIcons';
import type { ToolId } from '../world/ToolBelt';

/**
 * Anything she can name aloud: a tool on the row, a stone on the quest row, or
 * one of the two words the second quest is about.
 *
 * `carrot` and `bunny` are written out rather than derived from an id because
 * there are three of each and they are all the same word — `carrot_1` is not a
 * thing anybody says out loud. What she is being taught is the noun, so the noun
 * is what is in here.
 */
export type Named = ToolId | GemId | 'carrot' | 'bunny';

/** Her naming it — "Hammer!", "Malachite!". */
export function nameOf(thing: Named): string {
  return `seraphina_${thing}`;
}

/**
 * "I need my axe!" — what she says when she swings at something real with the
 * wrong thing in her hand. Keyed by the tool that *would* have worked, because
 * naming the fix is the whole point: the lesson is what to go and do, not that
 * this did nothing.
 */
export const NEEDS: Record<'axe' | 'hammer', string> = {
  axe: 'seraphina_need_axe',
  hammer: 'seraphina_need_hammer',
};
