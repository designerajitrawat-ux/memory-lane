import type { SessionItemKind } from "@memory-lane/shared";
import { promptAllowed } from "../stage2/language";

/**
 * Conversation prompts written in code (docs/05 §4.2 style): open, gentle invitations that work for
 * anyone who lived through these years, never memory tests ("Do you remember…?" is out). Several per
 * kind so sessions don't repeat themselves; the LLM writes warmer, item-specific ones once configured,
 * and every prompt passes the same language checks.
 */
const PROMPTS: Record<SessionItemKind, ((name: string) => string)[]> = {
  song: [
    (n) => `What does ${soundOf(n)} bring to mind?`,
    () => "Would you like to sing along, or just listen for a while?",
    () => "Where did music like this play when you were young: the radio, the cinema, a wedding?",
    () => "Who would you have danced with to a song like this?",
    () => "Tell me about a time when this kind of music was playing.",
  ],
  film: [
    (n) => `What was it like going to see a film like ${n}?`,
    () => "Tell me about the cinema you used to go to.",
    () => "Who did you like to watch films with?",
    () => "What did people wear for an evening at the pictures back then?",
  ],
  tv: [
    (n) => `What was it like when ${n} came on?`,
    () => "Who would gather round the television with you?",
    () => "Which evenings of the week did you look forward to most?",
    () => "Tell me about the room where the television was.",
  ],
  food: [
    (n) => `What comes to mind with the smell of ${n}?`,
    () => "Who made it best in your family?",
    () => "Tell me about a meal you shared with people you love.",
    () => "What else was on the table on a special day?",
  ],
  place: [
    (n) => `Tell me about ${n}.`,
    () => "What would we see if we walked there together?",
    () => "Who would you go there with?",
    () => "What did it sound like there on a busy day?",
  ],
};

/** "Mohammed Rafi's voice", "Tom Jones' voice", "the sound of The Hollies". */
function soundOf(name: string): string {
  if (/^the\s/i.test(name)) return `the sound of ${name}`;
  return name.endsWith("s") ? `${name}' voice` : `${name}'s voice`;
}

/**
 * 2–3 prompts for an item, rotating with the session number so later sessions feel fresh. Only
 * prompts that pass the language checks are returned; the name-free ones always do.
 */
export function promptsFor(
  kind: SessionItemKind,
  name: string,
  sessionNumber: number,
  opts: { locality?: string | null } = {},
): string[] {
  // A place Qloo found near their town may be one they never visited: start from the town instead.
  const town =
    kind === "place" && opts.locality && !name.toLowerCase().includes(opts.locality.toLowerCase())
      ? opts.locality
      : null;
  const all = town
    ? [
        (n: string) => `${n} is in ${town}. What was ${town} like when you were young?`,
        ...PROMPTS.place.slice(1),
      ]
    : PROMPTS[kind];
  const start = ((sessionNumber - 1) * 2) % all.length;
  const picked = [all[0], all[(start + 1) % all.length], all[(start + 2) % all.length]];
  const prompts = [...new Set(picked.map((p) => (p as (n: string) => string)(name)))]
    .filter(promptAllowed)
    .slice(0, 3);
  // A name that trips the checks (security review S3) still leaves gentle, name-free prompts.
  return prompts.length ? prompts : all.slice(1, 3).map((p) => p(name));
}
