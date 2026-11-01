import { chf, type PersonaScript, recommendationId, riskGapPerMonth } from "./script";

/**
 * Jane Müller (official persona "young family"): seeded Pax client, homemaker, married to May
 * (employed 100 %, CHF 100'000), baby five months old, a Pax term life policy on May.
 * Logs in through "Ich bin bereits Pax-Kunde"; Clara checks May's pension fund, shows the death
 * and disability gaps if something happens to May, and offers term life cover on him.
 */
export const JANE = {
  say: {
    opening:
      "Hallo, wir haben vor fünf Monaten unser erstes Kind bekommen. Sind wir als Familie gut abgesichert, falls May etwas passiert?",
    pensionFund:
      "Ja, May ist über seinen Arbeitgeber in der Pensionskasse. Ich arbeite im Moment nicht.",
    options: "Ja, welche Möglichkeiten gibt es?",
  },
  offerProduct: "Pax Todesfallversicherung",
  signature: "Jane Müller",
} as const;

export const janeScript: PersonaScript = {
  id: "jane",
  opening: /fünf Monaten unser erstes Kind bekommen/,
  turns: [
    {
      user: /fünf Monaten unser erstes Kind/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: { addConcerns: ["Absicherung der Familie, falls May etwas passiert"] },
            },
          ],
        },
        {
          text:
            "Herzliche Gratulation zu Ihrem Kind! Ich sehe in Ihren Unterlagen, dass May 100 % arbeitet, " +
            "CHF 100'000 verdient und bei Pax eine Todesfallversicherung über CHF 150'000 hat. Damit ich " +
            "richtig rechne, brauche ich noch eine Angabe: Ist May über seinen Arbeitgeber in einer " +
            "Pensionskasse versichert?",
          tools: [
            {
              name: "suggestReplies",
              args: { options: ["Ja, mit Pensionskasse", "Nein, ohne Pensionskasse"] },
            },
          ],
        },
      ],
    },
    {
      user: /in der Pensionskasse/,
      steps: [
        {
          tools: [
            { name: "updateProfile", args: { partner: { pillar2: { hasPensionFund: true } } } },
          ],
        },
        { tools: [{ name: "showRiskAnalysis", args: {} }] },
        {
          text: (ctx) =>
            `Hier sehen Sie, was Ihrer Familie bliebe. Stirbt May, fehlen Ihnen trotz AHV, ` +
            `Pensionskasse und seiner Pax-Police rund ${chf(riskGapPerMonth(ctx, 2, "death"))} pro ` +
            `Monat. Wird er erwerbsunfähig, sind es rund ${chf(riskGapPerMonth(ctx, 2, "disability"))} ` +
            "pro Monat. Möchten Sie sehen, wie sich diese Lücken schliessen lassen?",
          tools: [
            {
              name: "suggestReplies",
              args: { options: ["Ja, welche Möglichkeiten gibt es?", "Später"] },
            },
          ],
        },
      ],
    },
    {
      user: /welche Möglichkeiten/,
      steps: [
        {
          tools: [
            {
              name: "recommendProducts",
              args: (ctx) => ({
                gaps: [
                  {
                    type: "death",
                    annualAmount: riskGapPerMonth(ctx, 2, "death") * 12,
                    person: "partner",
                    note: "Tod von May, bis das Kind 25 ist",
                  },
                  {
                    type: "disability",
                    annualAmount: riskGapPerMonth(ctx, 2, "disability") * 12,
                    person: "partner",
                    note: "Erwerbsunfähigkeit von May",
                  },
                ],
              }),
            },
          ],
        },
        {
          text:
            "Für beide Lücken gibt es eine passende Absicherung auf May: eine Todesfallversicherung, " +
            "die Ihnen und Ihrem Kind ein Kapital auszahlt, und eine Erwerbsunfähigkeitsrente. Die " +
            "Prämien sind unverbindlich berechnet. Als Alternative zur reinen Todesfallversicherung " +
            "kommt eine Sparversicherung mit Todesfallschutz in Frage. Welche Offerte möchten Sie ansehen?",
        },
      ],
    },
    {
      user: /Offerte für Pax Todesfallversicherung/,
      steps: [
        {
          text: "Gern. In der Offerte sehen Sie Deckung, Laufzeit und Prämie, darunter können Sie unterschreiben.",
          tools: [
            {
              name: "prepareOffer",
              args: (ctx) => ({ recommendationId: recommendationId(ctx, "todesfall") }),
            },
          ],
        },
      ],
    },
    {
      user: /Antrag für Pax Todesfallversicherung unterschrieben/,
      steps: [
        {
          text:
            "Danke, Ihr Antrag ist bei Pax. Eine Pax-Beraterin prüft ihn, danach beginnt die Police. " +
            "Sie sehen sie bis dahin im Vorsorge-Cockpit als «In Prüfung».",
        },
      ],
    },
  ],
};
