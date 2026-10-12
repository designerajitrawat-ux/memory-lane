// The browser only ever talks to our agent service — never to Qloo or Claude (CLAUDE.md rule 4).
export const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787").replace(
  /\/$/,
  "",
);
