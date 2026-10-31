import { describe, expect, it } from "vitest";
import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("recognises the customer's language from ordinary sentences", () => {
    expect(
      detectLanguage("Ich bin 35 Jahre alt, ich bin Single. Ich arbeite bei Coop an der Kasse."),
    ).toBe("de");
    expect(detectLanguage("Weiss ich noch nicht")).toBe("de");
    expect(detectLanguage("Keine Ahnung, aber ich habe das jetzt gekündigt auf Ende Jahr.")).toBe(
      "de",
    );
    expect(detectLanguage("Je voudrais prendre ma retraite plus tôt, c'est possible ?")).toBe("fr");
    expect(detectLanguage("Vorrei andare in pensione prima, cosa ne pensi?")).toBe("it");
    expect(detectLanguage("I would like to retire early, what do you think?")).toBe("en");
  });

  it("stays out of short, numeric or mixed messages", () => {
    expect(detectLanguage("Ja")).toBeNull();
    expect(detectLanguage("Mit 60")).toBeNull();
    expect(detectLanguage("ok merci")).toBeNull();
    expect(detectLanguage("CHF 7'258 pro Jahr")).toBeNull();
    expect(detectLanguage("Pax LifeStar 3a")).toBeNull();
  });
});
