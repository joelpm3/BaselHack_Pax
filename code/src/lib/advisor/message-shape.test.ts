import { describe, expect, it } from "vitest";
import { endsWithQuestion, isDangling } from "./message-shape";

describe("isDangling", () => {
  it("catches messages that announce more than they deliver", () => {
    expect(isDangling("Beim Rückruf geht es also um diese Punkte:")).toBe(true);
    expect(
      isDangling(
        "Ich habe Ihren Wohnort geändert. Für die Berechnung brauche ich noch eine letzte Angabe.",
      ),
    ).toBe(true);
    expect(isDangling("Ich schaue mir das an…")).toBe(true);
    expect(isDangling("Il me manque encore une information.")).toBe(true);
  });

  it("accepts finished messages", () => {
    expect(isDangling("Für die Berechnung brauche ich noch Ihr Einkommen: Wie hoch ist es?")).toBe(
      false,
    );
    expect(isDangling("Die Offerte ist bereit. Sie unterschreiben in der Karte.")).toBe(false);
    expect(isDangling("")).toBe(false);
  });
});

describe("endsWithQuestion", () => {
  it("looks at the last sentence only", () => {
    expect(endsWithQuestion("Gut. Wie alt sind Sie?")).toBe(true);
    expect(endsWithQuestion("Quel âge avez-vous ?")).toBe(true);
    expect(endsWithQuestion("Wie alt sind Sie? Dann rechne ich.")).toBe(false);
    expect(endsWithQuestion("Wählen Sie Ihren Ort in der Karte.")).toBe(false);
  });
});
