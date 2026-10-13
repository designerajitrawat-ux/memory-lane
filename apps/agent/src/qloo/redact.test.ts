import { describe, expect, it } from "vitest";
import { checkArgs, normalizeText } from "./redact";

const NONE = { nickname: null };
const nick = (nickname: string) => ({ nickname });

describe("checkArgs (PII guard before Qloo)", () => {
  it("passes public cultural signals", () => {
    const ok = [
      { entity: "Mohammed Rafi", type: "artist" },
      { query: "golden age Bollywood 1960-1975" },
      {
        target_type: "movie",
        signals: ["Mughal-e-Azam", "Lata Mangeshkar"],
        signal_location: "Punjab, India",
      },
      { entity: "21 Jump Street", type: "tv_show" },
      { entity: "Memory", type: "artist" }, // a song title, not a health term
      { entity: "General Hospital", type: "tv_show" },
      { entity: "42nd Street", type: "movie" },
      { entity: "The Sound of Music", type: "movie" },
      { query: "sarson da saag" },
    ];
    for (const args of ok)
      expect(checkArgs(args, NONE), JSON.stringify(args)).toEqual({ ok: true });
  });

  it("passes exact Qloo identifiers in ID fields, but nothing else that looks like a number", () => {
    const uuid = "23e081cf-cefb-4e12-8337-867f25f5d1fc"; // its digits once matched the phone rule
    expect(
      checkArgs(
        { target_type: "artist", signals: [uuid], signal_tags: ["urn:tag:cuisine:qloo:saag"] },
        nick("Bauji"),
      ),
    ).toEqual({ ok: true });
    // Only an exact identifier is exempt, and only in ID fields.
    expect(
      checkArgs({ target_type: "artist", signals: [`${uuid} call 9876543210`] }, NONE),
    ).toMatchObject({
      ok: false,
    });
    expect(checkArgs({ query: uuid }, NONE)).toMatchObject({ ok: false, reason: "phone" });
  });

  it("refuses the nickname without echoing it", () => {
    const res = checkArgs({ signals: ["Songs for Bimla"] }, nick("bimla"));
    expect(res).toEqual({ ok: false, reason: "nickname", field: "signals[0]" });
    expect(JSON.stringify(res)).not.toMatch(/bimla/i);
  });

  it("catches nickname variants (security review W1)", () => {
    const variants: [string, string][] = [
      ["José", "Songs for José"], // NFD vs NFC
      ["Bimla", "Bim​la classics"], // zero-width space
      ["Bimla", "Bim­la classics"], // soft hyphen
      ["Bimla", "Ｂimla favourites"], // fullwidth B
      ["Bimla", "Bimlа favourites"], // Cyrillic а
      ["Bimla Devi", "Bimla  Devi"], // double space
      ["Bimla Devi", "Bimla Devi"], // no-break space
      ["Bimla Devi", "Bimla favourites"], // first name alone
      ["Bimla Devi", "Devi's songs"], // last name alone
      ["Bimla", "Bimlaji ke gaane"], // attached honorific
      ["Bimla", "Bimla's favourite songs"],
      ["Raj", "Raj Kapoor films"], // 3-letter part as a whole word
    ];
    for (const [n, value] of variants) {
      expect(checkArgs({ query: value }, nick(n)), `${n} / ${value}`).toMatchObject({
        reason: "nickname",
      });
    }
  });

  it("does not over-match short nickname parts", () => {
    expect(checkArgs({ entity: "Rajesh Khanna" }, nick("Raj"))).toEqual({ ok: true });
    expect(checkArgs({ entity: "Kabir" }, nick("Bimla"))).toEqual({ ok: true });
    expect(checkArgs({ entity: "Mohammed Rafi" }, nick("A"))).toEqual({ ok: true });
  });

  it("refuses contact details and URLs, in any digit script", () => {
    const cases: [string, string][] = [
      ["write to dad@example.com", "email"],
      ["call +91 98765 43210", "phone"],
      ["98765–43210", "phone"], // en dash
      ["98765/43210", "phone"],
      ["९८७६५ ४३२१०", "phone"], // Devanagari digits
      ["see https://example.org/x", "url"],
      ["www.example.org", "url"],
    ];
    for (const [query, reason] of cases)
      expect(checkArgs({ query }, NONE), query).toMatchObject({ reason });
  });

  it("refuses addresses in free text and location fields", () => {
    const cases: Record<string, unknown>[] = [
      { query: "near House No. 7" },
      { query: "H.No. 12 Model Town" },
      { query: "Flat 4B Green Park" },
      { query: "123 MG Road, Bengaluru" },
      { query: "Chandigarh 160017" },
      { query: "Boston 02134" },
      { entity: "x", within: "Sector 21, Chandigarh" },
      { entity: "x", within: "Sector २१" }, // Devanagari digits
      { entity: "x", within: "Sector ２１" }, // fullwidth digits
      { target_type: "place", filter_location: "110001" },
    ];
    for (const args of cases)
      expect(checkArgs(args, NONE), JSON.stringify(args)).toMatchObject({ reason: "address" });
  });

  it("refuses health and care terms, including variants", () => {
    for (const q of [
      "music for dementia",
      "dementias",
      "demented",
      "Alzheimer's songs",
      "after the diagnosis",
      "her medication",
      "her meds",
      "parkinsonism",
      "amnesia",
      "music therapy",
      "memory care home",
      "nursing home playlist",
      "caregiver favourites",
      "deme​ntia", // hidden character
      "memory loss tunes",
    ]) {
      expect(checkArgs({ query: q }, NONE), q).toMatchObject({ ok: false, reason: "health" });
    }
  });

  it("walks nested objects and arrays", () => {
    expect(checkArgs({ a: { b: [{ c: "dementia" }] } }, NONE)).toEqual({
      ok: false,
      reason: "health",
      field: "a.b[0].c",
    });
  });
});

describe("normalizeText", () => {
  it("folds width, accents, invisible characters, lookalikes, digits and spaces", () => {
    expect(normalizeText("Ｂim​lа  Devi")).toBe("Bimla Devi");
    expect(normalizeText("José")).toBe("José");
    expect(normalizeText("२१ / ２１")).toBe("21 / 21");
  });
});
