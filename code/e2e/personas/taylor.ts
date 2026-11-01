import {
  chf,
  type PersonaScript,
  recommendationId,
  retirementGapPerYear,
  riskGapPerMonth,
} from "./script";

/**
 * Taylor Johnson (official persona "single professional"): seeded Pax client, 31, 90 % for
 * CHF 100'000, CHF 500'000 assets, 3a already maxed. Wants to build wealth for a flat and asks
 * what happens if he falls ill. Clara asks about savings, risk appetite and existing cover,
 * shows the disability gap and the retirement overview, and recommends disability cover and a
 * FondsStar savings plan; Taylor passes the suitability check and signs FondsStar.
 */
export const TAYLOR = {
  say: {
    opening:
      "Hoi, ich möchte in ein paar Jahren eine Wohnung kaufen und bis dahin Vermögen aufbauen. Und was wäre eigentlich, wenn ich länger krank würde?",
    savings:
      "Ich kann etwa 800 Franken im Monat sparen und gehe gern mehr Risiko ein. Eine private Erwerbsunfähigkeitsversicherung habe ich nicht.",
    options: "Was empfiehlst du mir?",
  },
  suitabilityProduct: "Pax FondsStar",
  offerProduct: "Pax FondsStar",
  signature: "Taylor Johnson",
} as const;

export const taylorScript: PersonaScript = {
  id: "taylor",
  opening: /eine Wohnung kaufen und bis dahin Vermögen aufbauen/,
  turns: [
    {
      user: /länger krank würde/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: {
                addGoals: ["buy_home", "build_wealth"],
                addConcerns: ["Was wäre, wenn ich länger krank würde?"],
              },
            },
          ],
        },
        {
          text:
            "Beides schauen wir an. Deine 3. Säule zahlst du bereits voll ein. Wie viel kannst du " +
            "darüber hinaus pro Monat sparen, wie viel Risiko möchtest du bei Anlagen eingehen, und " +
            "hast du schon eine private Erwerbsunfähigkeitsversicherung?",
          tools: [
            {
              name: "suggestReplies",
              args: { options: ["Etwa 800 im Monat, gern mit Risiko", "Lieber sicher"] },
            },
          ],
        },
      ],
    },
    {
      user: /800 Franken im Monat sparen/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: { monthlySavings: 800, riskAttitude: "high", privateCover: "no" },
            },
          ],
        },
        {
          tools: [
            { name: "showRiskAnalysis", args: {} },
            { name: "showPensionOverview", args: {} },
          ],
        },
        {
          text: (ctx) =>
            `Wirst du wegen Krankheit erwerbsunfähig, zahlen IV und Pensionskasse nur einen Teil: ` +
            `es fehlen rund ${chf(riskGapPerMonth(ctx, 1, "disability"))} pro Monat. Im Alter ` +
            `fehlen nach heutigem Stand rund ${chf(retirementGapPerYear(ctx))} pro Jahr. ` +
            "Soll ich dir zeigen, was du dagegen tun kannst?",
          tools: [
            { name: "suggestReplies", args: { options: ["Was empfiehlst du mir?", "Später"] } },
          ],
        },
      ],
    },
    {
      user: /Was empfiehlst du mir/,
      steps: [
        {
          tools: [
            {
              name: "recommendProducts",
              args: (ctx) => ({
                gaps: [
                  {
                    type: "disability",
                    annualAmount: riskGapPerMonth(ctx, 1, "disability") * 12,
                    person: "self",
                    note: "Erwerbsunfähigkeit wegen Krankheit",
                  },
                  {
                    type: "retirement",
                    annualAmount: retirementGapPerYear(ctx),
                    person: "self",
                    note: "Vermögensaufbau in der Säule 3b",
                  },
                ],
                preferences: { pillar: "3b", riskAttitude: "high" },
                annualPremium: 9600,
              }),
            },
          ],
        },
        {
          text:
            "Zwei Bausteine passen: eine Erwerbsunfähigkeitsrente für den Fall, dass du länger krank " +
            "bist, und ein Fondssparplan mit FondsStar für dein Vermögen. Unter «Alternativen» siehst " +
            "du weitere Varianten. Für FondsStar braucht es zuerst die Angemessenheitsprüfung. Womit " +
            "möchtest du beginnen?",
        },
      ],
    },
    {
      user: /Angemessenheitsprüfung für Pax FondsStar machen/,
      steps: [
        {
          text: "Gern. Beantworte die Fragen im Formular, danach siehst du dein Anlageprofil.",
          tools: [
            {
              name: "startSuitabilityCheck",
              args: (ctx) => ({
                recommendationId: recommendationId(ctx, "fondsstar"),
                productCode: "fondsstar",
              }),
            },
          ],
        },
      ],
    },
    {
      user: /Angemessenheitsprüfung für Pax FondsStar abgeschlossen/,
      steps: [
        {
          text: "FondsStar passt zu deinem Profil. Hier ist deine Offerte, darunter kannst du unterschreiben.",
          tools: [
            {
              name: "prepareOffer",
              args: (ctx) => ({ recommendationId: recommendationId(ctx, "fondsstar") }),
            },
          ],
        },
      ],
    },
    {
      user: /Antrag für Pax FondsStar unterschrieben/,
      steps: [
        {
          text:
            "Danke, dein Antrag ist bei Pax. Nach der Prüfung startet dein Sparplan; im " +
            "Vorsorge-Cockpit siehst du ihn schon jetzt.",
        },
      ],
    },
  ],
};
