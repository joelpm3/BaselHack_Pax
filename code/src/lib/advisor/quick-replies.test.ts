import { describe, expect, it } from "vitest";
import { pretendsUiAction, safeQuickReplies } from "./quick-replies";

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
