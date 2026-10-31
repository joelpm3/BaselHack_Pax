import { describe, expect, it } from "vitest";
import { pretendsUiAction, quickRepliesOf, safeQuickReplies } from "./quick-replies";

describe("pretendsUiAction", () => {
  it("catches replies that claim a signature, a confirmation or an upload", () => {
    for (const reply of [
      "Ich habe die Offerte unterschrieben",
      "Die Werte stimmen, bestätigen",
      "Antrag unterzeichnet",
      "Dokument hochgeladen",
      "J'ai signé l'offre",
      "Je confirme les valeurs",
      "Ho firmato l'offerta",
      "Confermo i valori",
      "I signed the offer",
      "Confirm the values",
      "I uploaded my certificate",
    ]) {
      expect(pretendsUiAction(reply), reply).toBe(true);
    }
  });

  it("keeps ordinary answers", () => {
    for (const reply of [
      "Ja, das stimmt",
      "Nein, lieber ohne",
      "Ja, ich habe einen Vorsorgeausweis",
      "Offerte ansehen",
      "Was kostet das?",
      "Oui, volontiers",
      "Sì, grazie",
      "That makes sense, show me the significance",
    ]) {
      expect(pretendsUiAction(reply), reply).toBe(false);
    }
  });
});

describe("safeQuickReplies", () => {
  it("drops only the replies that fake a UI action", () => {
    expect(
      safeQuickReplies(["Ich habe die Offerte unterschrieben", "Ich habe noch eine Frage"]),
    ).toEqual(["Ich habe noch eine Frage"]);
  });
});

describe("quickRepliesOf", () => {
  const replies = (options: string[]) => ({
    type: "tool-suggestReplies",
    state: "output-available",
    output: { options },
  });
  const text = (value: string) => ({ type: "text", text: value });

  it("shows the last suggestion after the text", () => {
    expect(
      quickRepliesOf([
        text("Wann ist Ihre Partnerin geboren?"),
        replies(["Sie ist 1990 geboren", "Sie ist 1993 geboren"]),
      ]),
    ).toEqual(["Sie ist 1990 geboren", "Sie ist 1993 geboren"]);
    expect(quickRepliesOf([text("Frage?"), replies(["A", "B"]), replies(["C", "D"])])).toEqual([
      "C",
      "D",
    ]);
  });

  it("drops suggestions made before the question was written", () => {
    const early = replies(["Ich bin 1990 geboren", "Ich bin 1993 geboren"]);
    const question = text("Wann ist Ihre Partnerin geboren?");
    expect(quickRepliesOf([early, question])).toEqual([]);
    expect(
      quickRepliesOf([early, question, replies(["Sie ist 1990 geboren", "Sie ist 1993 geboren"])]),
    ).toEqual(["Sie ist 1990 geboren", "Sie ist 1993 geboren"]);
  });

  it("ignores pending calls and filters fake UI actions", () => {
    expect(
      quickRepliesOf([
        text("Passt das?"),
        { type: "tool-suggestReplies", state: "input-available" },
        replies(["Ich habe unterschrieben", "Ja, passt"]),
      ]),
    ).toEqual(["Ja, passt"]);
  });
});
