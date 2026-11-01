import { chf, type PersonaScript, recommendationId, retirementGapPerYear } from "./script";

/**
 * Lily Smith (official persona "affluent couple"): seeded Pax client, 80 % for CHF 80'000,
 * married to Wilson (CHF 200'000, nine years older), CHF 500'000 assets, 3a already maxed with
 * LifeStar. Clara asks what she can save, shows the retirement overview, offers a person (assets
 * over CHF 300'000) and recommends a LifeStar savings plan in pillar 3b, which needs the
 * suitability check before the offer.
 */
export const LILY = {
  say: {
    opening:
      "Guten Tag. Wilson geht in ein paar Jahren in Pension, ich arbeite noch länger. Reicht unser Geld im Alter, und soll ich zusätzlich sparen?",
    savings:
      "Ich könnte etwa 500 Franken im Monat sparen. Schwankungen machen mir nichts aus, wenn es langfristig ist.",
    options: "Ja, bitte zeigen Sie mir die Möglichkeiten.",
  },
  suitabilityProduct: "Pax LifeStar",
  offerProduct: "Pax LifeStar",
  signature: "Lily Smith",
} as const;

export const lilyScript: PersonaScript = {
  id: "lily",
  opening: /Wilson geht in ein paar Jahren in Pension/,
  turns: [
    {
      user: /Reicht unser Geld im Alter/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: {
                addConcerns: ["Reicht das Geld im Alter?"],
                addGoals: ["retire_comfortably"],
              },
            },
          ],
        },
        {
          text:
            "Gute Frage, das rechnen wir gemeinsam aus. Ihre 3. Säule zahlen Sie mit LifeStar bereits " +
            "voll ein. Wie viel könnten Sie darüber hinaus im Monat sparen, und wie gehen Sie mit " +
            "Schwankungen an der Börse um?",
          tools: [
            {
              name: "suggestReplies",
              args: { options: ["Etwa 500 Franken im Monat", "Lieber kein Risiko"] },
            },
          ],
        },
      ],
    },
    {
      user: /500 Franken im Monat sparen/,
      steps: [
        {
          tools: [{ name: "updateProfile", args: { monthlySavings: 500, riskAttitude: "medium" } }],
        },
        { tools: [{ name: "showPensionOverview", args: {} }] },
        {
          text: (ctx) =>
            `Hier sehen Sie Ihre Vorsorge im Alter: AHV, Pensionskassen und Ersparnisse zusammen ` +
            `gegen 80 % Ihres heutigen Einkommens. Es fehlen rund ${chf(retirementGapPerYear(ctx))} ` +
            "pro Jahr. Weil Ihr Vermögen über CHF 300'000 liegt, bespricht das auch gern eine " +
            "Pax-Beraterin persönlich mit Ihnen. Möchten Sie sehen, wie Sie die Lücke mit einer " +
            "Sparlösung verkleinern?",
          tools: [
            {
              name: "suggestReplies",
              args: {
                options: ["Ja, bitte zeigen Sie mir die Möglichkeiten.", "Lieber persönlich"],
              },
            },
          ],
        },
      ],
    },
    {
      user: /zeigen Sie mir die Möglichkeiten/,
      steps: [
        {
          tools: [
            {
              name: "recommendProducts",
              args: (ctx) => ({
                gaps: [
                  {
                    type: "retirement",
                    annualAmount: retirementGapPerYear(ctx),
                    person: "self",
                    note: "Rentenlücke von Lily, Sparen in der Säule 3b",
                  },
                ],
                preferences: { pillar: "3b", riskAttitude: "medium" },
                annualPremium: 6000,
              }),
            },
          ],
        },
        {
          text:
            "Ein Sparplan mit LifeStar in der freien Vorsorge passt zu Ihrem Sparbetrag: ein Teil ist " +
            "garantiert, der Rest wächst mit Fonds. Unter «Alternativen» finden Sie einen reinen " +
            "Fondssparplan. Weil Fonds schwanken, prüft Pax vor der Offerte, ob das Produkt zu Ihnen " +
            "passt. Möchten Sie die Angemessenheitsprüfung starten?",
        },
      ],
    },
    {
      user: /Angemessenheitsprüfung für Pax LifeStar machen/,
      steps: [
        {
          text: "Gern. Beantworten Sie die Fragen im Formular, danach sehen Sie Ihr Anlageprofil.",
          tools: [
            {
              name: "startSuitabilityCheck",
              args: (ctx) => ({
                recommendationId: recommendationId(ctx, "lifestar"),
                productCode: "lifestar",
              }),
            },
          ],
        },
      ],
    },
    {
      user: /Angemessenheitsprüfung für Pax LifeStar abgeschlossen/,
      steps: [
        {
          text: "LifeStar passt zu Ihrem Profil. Hier ist Ihre Offerte, darunter können Sie unterschreiben.",
          tools: [
            {
              name: "prepareOffer",
              args: (ctx) => ({ recommendationId: recommendationId(ctx, "lifestar") }),
            },
          ],
        },
      ],
    },
    {
      user: /Antrag für Pax LifeStar unterschrieben/,
      steps: [
        {
          text:
            "Danke, Ihr Antrag ist bei Pax. Nach der Prüfung beginnt Ihr Sparplan; im " +
            "Vorsorge-Cockpit sehen Sie ihn als «In Prüfung».",
        },
      ],
    },
  ],
};
