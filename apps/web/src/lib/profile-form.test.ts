import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM,
  formPath,
  profileResolver,
  stepOf,
  toInput,
  type ProfileFormValues,
} from "./profile-form";

const filled: ProfileFormValues = {
  nickname: "Dorothy",
  birthYear: "1946",
  languages: [{ value: "English" }],
  lifeStages: [{ region: "Dayton, Ohio, USA", fromYear: "1946", toYear: "1968" }],
  favourites: [{ domain: "music", text: "Patsy Cline" }],
  avoid: [{ text: "Vietnam War", reason: "" }],
};

const run = (v: ProfileFormValues) =>
  profileResolver(v, undefined, { fields: {}, shouldUseNativeValidation: false });

describe("profile form", () => {
  it("converts text inputs to the shared shape", () => {
    expect(toInput(filled)).toMatchObject({
      birthYear: 1946,
      languages: ["English"],
      lifeStages: [{ fromYear: 1946, toYear: 1968 }],
      avoid: [{ text: "Vietnam War", reason: undefined }],
    });
  });

  it("accepts a complete form and reports empty fields at the right paths", async () => {
    expect((await run(filled)).errors).toEqual({});
    const { errors } = await run(EMPTY_FORM);
    expect(errors).toHaveProperty("birthYear.message");
    expect(errors).toHaveProperty("languages.0.value.message");
    expect(errors).toHaveProperty("lifeStages.0.region.message");
    expect(errors).toHaveProperty("favourites.0.text.message");
  });

  it("maps paths and steps", () => {
    expect(formPath("languages.1")).toBe("languages.1.value");
    expect(formPath("favourites")).toBe("favourites.root");
    expect(formPath("lifeStages.0.toYear")).toBe("lifeStages.0.toYear");
    expect(stepOf("birthYear")).toBe(0);
    expect(stepOf("lifeStages.0.region")).toBe(1);
    expect(stepOf("favourites.root")).toBe(2);
    expect(stepOf("avoid.0.reason")).toBe(3);
  });
});
