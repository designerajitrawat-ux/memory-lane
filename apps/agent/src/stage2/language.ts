/**
 * Language policy (docs/05 §3, validators 3–4): captions speak about groups, never about this person,
 * and never about treatment. Prompts invite, they don't test memory. Used on every caption and prompt
 * before it is shown, including text from the LLM.
 */
const CAPTION_BLOCKLIST: RegExp[] = [
  /\b(she|he|they|your (mum|mom|dad|father|mother|parent|wife|husband|gran\w*|nan\w*))\s+(loved?|will|would|enjoyed|adored)\b/i,
  /\bwill (love|enjoy|remember|adore)\b/i,
  /\b(dementia|alzheimer\w*|patients?|suffer\w*|decline|cognitive|symptoms?|diagnos\w*)\b/i,
  // Medical claims, not "a sweet treat" or "cured ham" (live check: a dish's reason was blocked).
  /\b(treatments?|treating|treats? (?:memory|symptoms|dementia|alzheimer\w*|confusion|anxiety|depression)|cures?|therap\w*|heal\w*|clinical\w*|medical\w*|improves? memory|boosts? memory)\b/i,
];

const PROMPT_BLOCKLIST: RegExp[] = [
  /\bdo you remember\b/i,
  /\bcan you remember\b/i,
  /\bdon'?t you remember\b/i,
  /\bwhat (year|date) (was|is|did)\b/i,
  /\bwho (sang|was|is) (this|that|it)\b/i,
  /\bname (the|this|that)\b/i,
  /\btest\b|\bquiz\b/i,
  ...CAPTION_BLOCKLIST.slice(2),
];

export const captionAllowed = (s: string) => !CAPTION_BLOCKLIST.some((re) => re.test(s));
export const promptAllowed = (s: string) => !PROMPT_BLOCKLIST.some((re) => re.test(s));
