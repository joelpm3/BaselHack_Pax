import { describe, expect, it } from "vitest";
import { findPlace, localitiesByTown, localitiesByZip, normalizeName, parseZip } from ".";

describe("localitiesByZip", () => {
  it("lists every locality of a postcode that covers several places", () => {
    expect(localitiesByZip("8165").map((l) => l.town)).toEqual([
      "Oberweningen",
      "Schleinikon",
      "Schöfflisdorf",
    ]);
  });

  it("finds Zürich for 8001", () => {
    expect(localitiesByZip("8001")).toEqual([
      { zip: "8001", town: "Zürich", canton: "ZH", bfsNumber: 261, municipality: "Zürich" },
    ]);
  });

  it("returns nothing for unknown or malformed postcodes", () => {
    expect(localitiesByZip("0000")).toEqual([]);
    expect(localitiesByZip("abc")).toEqual([]);
  });
});

describe("findPlace", () => {
  it("does not guess when a postcode covers several towns", () => {
    const result = findPlace({ zip: "8165" });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.options.map((o) => `${o.zip} ${o.town}`)).toEqual([
      "8165 Oberweningen",
      "8165 Schleinikon",
      "8165 Schöfflisdorf",
    ]);
  });

  it("uses the town to pick within a postcode", () => {
    expect(findPlace({ zip: "8165", city: "Schoefflisdorf" })).toEqual({
      status: "match",
      place: { zip: "8165", town: "Schöfflisdorf", canton: "ZH", bfsNumber: 99 },
    });
  });

  it("resolves a single-town postcode", () => {
    expect(findPlace({ zip: "8001" })).toEqual({
      status: "match",
      place: { zip: "8001", town: "Zürich", canton: "ZH", bfsNumber: 261 },
    });
  });

  it("treats numbered PO-box localities of one town as one place", () => {
    const result = findPlace({ zip: "1000" });
    expect(result).toMatchObject({ status: "match", place: { zip: "1000", town: "Lausanne" } });
  });

  it("offers every Wil when only the town name is given", () => {
    const result = findPlace({ city: "Wil" });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.options.map((o) => `${o.zip} ${o.town} ${o.canton}`)).toEqual([
      "5276 Wil AG AG",
      "8196 Wil ZH ZH",
      "9500 Wil SG SG",
    ]);
    expect(findPlace({ city: "Wil SG" })).toMatchObject({
      status: "match",
      place: { zip: "9500", town: "Wil SG" },
    });
  });

  it("keeps a town with several postcodes as one place without a postcode", () => {
    expect(findPlace({ city: "Zurich" })).toEqual({
      status: "match",
      place: { zip: null, town: "Zürich", canton: "ZH", bfsNumber: 261 },
    });
  });

  it("falls back to the town when the postcode is unknown", () => {
    expect(findPlace({ zip: "0000", city: "Basel" })).toMatchObject({
      status: "match",
      place: { town: "Basel", canton: "BS" },
    });
  });

  it("returns unknown for places that do not exist", () => {
    expect(findPlace({ zip: "0000" })).toEqual({ status: "unknown" });
    expect(findPlace({ city: "Atlantis" })).toEqual({ status: "unknown" });
    expect(findPlace({})).toEqual({ status: "unknown" });
  });
});

describe("helpers", () => {
  it("parses postcodes leniently", () => {
    expect(parseZip("CH-8165")).toBe("8165");
    expect(parseZip(" 8165 ")).toBe("8165");
    expect(parseZip("81650")).toBeNull();
  });

  it("normalizes names", () => {
    expect(normalizeName("St.Gallen")).toBe(normalizeName("Sankt Gallen"));
    expect(normalizeName("Zürich")).toBe("zurich");
  });

  it("finds a municipality by name when no locality is called like it", () => {
    expect(localitiesByTown("Mettauertal").length).toBeGreaterThan(1);
  });
});
