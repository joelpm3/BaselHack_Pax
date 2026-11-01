import { chf, type PersonaScript, recommendationId, riskGapPerMonth } from "./script";

/**
 * May Müller (official persona "young family", the main earner): comes as a new visitor through
 * "Beratung starten", tells his situation in two messages, sees his death and disability gaps
 * and applies for disability cover, entering his contact details in the offer.
 */
export const MAY = {
  say: {
    opening:
      "Grüezi, ich bin May Müller, Jahrgang 1984, verheiratet mit Jane (1986). Unser Baby ist fünf Monate alt. Was passiert mit meiner Familie, wenn mir etwas zustösst?",
    details:
      "Ich arbeite 100 % und verdiene 100'000 brutto, mit Pensionskasse. Jane arbeitet nicht. Wir wohnen in 4053 Basel, haben etwa 20'000 gespart und keine private Risikoversicherung.",
    options: "Was kann ich tun?",
  },
  offerProduct: "Pax Erwerbsunfähigkeitsversicherung",
  contact: {
    firstName: "May",
    lastName: "Müller",
    birthDate: "1984-09-16",
    email: "may.mueller@example.ch",
    phone: "+41 79 000 00 11",
  },
  signature: "May Müller",
} as const;

export const mayScript: PersonaScript = {
  id: "may",
  opening: /ich bin May Müller/,
  turns: [
    {
      user: /ich bin May Müller/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: {
                person: {
                  firstName: "May",
                  birthYear: 1984,
                  sex: "male",
                  maritalStatus: "married",
                },
                partner: {
                  firstName: "Jane",
                  birthYear: 1986,
                  sex: "female",
                  maritalStatus: "married",
                },
                children: [{ birthYear: 2026 }],
                addGoals: ["protect_family"],
                contact: { firstName: "May", lastName: "Müller" },
              },
            },
          ],
        },
        {
          text:
            "Herzliche Gratulation zu Ihrem Baby! Damit ich ausrechnen kann, was Ihrer Familie bliebe, " +
            "brauche ich noch ein paar Angaben: Wie viel verdienen Sie brutto im Jahr und in welchem " +
            "Pensum, sind Sie in einer Pensionskasse, arbeitet Jane, wo wohnen Sie, und haben Sie " +
            "bereits eine private Todesfall- oder Erwerbsunfähigkeitsversicherung?",
        },
      ],
    },
    {
      user: /verdiene 100'000 brutto/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: {
                person: { employment: "employed", workloadPercent: 100, grossIncome: 100000 },
                partner: { employment: "homemaker", workloadPercent: 0, grossIncome: 0 },
                pillar2: { hasPensionFund: true },
                residence: { zip: "4053", city: "Basel" },
                assets: { total: 20000 },
                privateCover: "no",
              },
            },
          ],
        },
        { tools: [{ name: "showRiskAnalysis", args: {} }] },
        {
          text: (ctx) =>
            `Danke, damit kann ich rechnen. Sterben Sie, fehlen Jane und Ihrem Kind rund ` +
            `${chf(riskGapPerMonth(ctx, 1, "death"))} pro Monat. Werden Sie erwerbsunfähig, fehlen ` +
            `rund ${chf(riskGapPerMonth(ctx, 1, "disability"))} pro Monat, weil AHV/IV und ` +
            "Pensionskasse nur einen Teil Ihres Lohns ersetzen. Möchten Sie sehen, was Sie tun können?",
          tools: [{ name: "suggestReplies", args: { options: ["Was kann ich tun?", "Später"] } }],
        },
      ],
    },
    {
      user: /Was kann ich tun/,
      steps: [
        {
          tools: [
            {
              name: "recommendProducts",
              args: (ctx) => ({
                gaps: [
                  {
                    type: "death",
                    annualAmount: riskGapPerMonth(ctx, 1, "death") * 12,
                    person: "self",
                    note: "Tod von May, bis das Kind 25 ist",
                  },
                  {
                    type: "disability",
                    annualAmount: riskGapPerMonth(ctx, 1, "disability") * 12,
                    person: "self",
                    note: "Erwerbsunfähigkeit von May",
                  },
                ],
              }),
            },
          ],
        },
        {
          text:
            "Für jede Lücke gibt es eine Möglichkeit: Die Erwerbsunfähigkeitsversicherung zahlt Ihnen " +
            "eine Rente, wenn Sie nicht mehr arbeiten können, die Todesfallversicherung Ihrer Familie " +
            "ein Kapital. Die Prämien sind unverbindlich. Welche Offerte möchten Sie zuerst ansehen?",
        },
      ],
    },
    {
      user: /Offerte für Pax Erwerbsunfähigkeitsversicherung/,
      steps: [
        {
          text: "Gern. Ergänzen Sie in der Offerte Ihre Angaben, danach können Sie unterschreiben.",
          tools: [
            {
              name: "prepareOffer",
              args: (ctx) => ({ recommendationId: recommendationId(ctx, "erwerbsunfaehigkeit") }),
            },
          ],
        },
      ],
    },
    {
      user: /Antrag für Pax Erwerbsunfähigkeitsversicherung unterschrieben/,
      steps: [
        {
          text:
            "Danke, Ihr Antrag ist bei Pax. Nach der Prüfung durch eine Pax-Beraterin beginnt die " +
            "Police; im Vorsorge-Cockpit sehen Sie sie schon jetzt.",
        },
      ],
    },
  ],
};
