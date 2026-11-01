import { chf, type PersonaScript, recommendationId, riskGapPerMonth } from "./script";

/**
 * Wilson Smith (official persona "affluent couple", the main earner): new visitor, 59, CHF
 * 200'000, married to Lily (80 %, CHF 80'000), CHF 500'000 assets. Clara works out what Lily
 * would have if something happened to him, offers a person (assets over CHF 300'000, as the
 * company rule says) and keeps advising; Wilson applies for term life cover.
 */
export const WILSON = {
  say: {
    opening:
      "Guten Tag, ich bin Wilson Smith, Jahrgang 1967, verheiratet mit Lily (1976). Ich verdiene deutlich mehr als sie. Was hätte Lily, wenn mir etwas passiert?",
    details:
      "Ich arbeite 100 % für 200'000 brutto, Lily 80 % für 80'000, beide mit Pensionskasse. Wir wohnen in 4125 Riehen, haben rund 500'000 Vermögen und keine privaten Risikoversicherungen.",
    options: "Zeigen Sie mir bitte die Möglichkeiten.",
  },
  offerProduct: "Pax Todesfallversicherung",
  contact: {
    firstName: "Wilson",
    lastName: "Smith",
    birthDate: "1967-09-16",
    email: "wilson.smith@example.ch",
    phone: "+41 79 000 00 12",
  },
  signature: "Wilson Smith",
} as const;

export const wilsonScript: PersonaScript = {
  id: "wilson",
  opening: /ich bin Wilson Smith/,
  turns: [
    {
      user: /ich bin Wilson Smith/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: {
                person: {
                  firstName: "Wilson",
                  birthYear: 1967,
                  sex: "male",
                  maritalStatus: "married",
                },
                partner: {
                  firstName: "Lily",
                  birthYear: 1976,
                  sex: "female",
                  maritalStatus: "married",
                },
                addGoals: ["protect_family"],
                contact: { firstName: "Wilson", lastName: "Smith" },
              },
            },
          ],
        },
        {
          text:
            "Das rechne ich Ihnen gern aus. Dafür brauche ich noch: Ihr Bruttolohn und Pensum, " +
            "Lilys Lohn und Pensum, ob Sie beide in einer Pensionskasse sind, Ihren Wohnort, Ihr " +
            "Vermögen ungefähr, und ob Sie bereits private Todesfall- oder " +
            "Erwerbsunfähigkeitsversicherungen haben?",
        },
      ],
    },
    {
      user: /200'000 brutto/,
      steps: [
        {
          tools: [
            {
              name: "updateProfile",
              args: {
                person: { employment: "employed", workloadPercent: 100, grossIncome: 200000 },
                partner: { employment: "employed", workloadPercent: 80, grossIncome: 80000 },
                pillar2: { hasPensionFund: true },
                residence: { zip: "4125", city: "Riehen" },
                assets: { total: 500000 },
                privateCover: "no",
              },
            },
          ],
        },
        { tools: [{ name: "showRiskAnalysis", args: {} }] },
        {
          text: (ctx) =>
            `Stirbt einer von Ihnen, bekommt der andere eine Witwen- oder Witwerrente von AHV und ` +
            `Pensionskasse. Sterben Sie, fehlen Lily trotzdem rund ` +
            `${chf(riskGapPerMonth(ctx, 1, "death"))} pro Monat, weil Ihr Lohn wegfällt. Werden Sie ` +
            `erwerbsunfähig, fehlen rund ${chf(riskGapPerMonth(ctx, 1, "disability"))} pro Monat. ` +
            "Bei einem Vermögen über CHF 300'000 vermittle ich Ihnen gern auch eine persönliche " +
            "Beratung. Möchten Sie die Möglichkeiten sehen?",
          tools: [
            {
              name: "suggestReplies",
              args: { options: ["Zeigen Sie mir bitte die Möglichkeiten.", "Lieber persönlich"] },
            },
          ],
        },
      ],
    },
    {
      user: /Zeigen Sie mir bitte die Möglichkeiten/,
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
                    note: "Tod von Wilson, Lily verliert seinen Lohn",
                  },
                  {
                    type: "disability",
                    annualAmount: riskGapPerMonth(ctx, 1, "disability") * 12,
                    person: "self",
                    note: "Erwerbsunfähigkeit von Wilson bis zur Pensionierung",
                  },
                ],
              }),
            },
          ],
        },
        {
          text:
            "Zwei Möglichkeiten passen zu Ihrer Lage: eine Todesfallversicherung bis zu Ihrer " +
            "Pensionierung und eine Erwerbsunfähigkeitsrente. Die Prämien sind unverbindlich. Welche " +
            "Offerte möchten Sie ansehen?",
        },
      ],
    },
    {
      user: /Offerte für Pax Todesfallversicherung/,
      steps: [
        {
          text: "Gern. Ergänzen Sie in der Offerte Ihre Angaben, danach können Sie unterschreiben.",
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
          text: "Danke, Ihr Antrag ist bei Pax. Eine Pax-Beraterin prüft ihn, danach beginnt die Police.",
        },
      ],
    },
  ],
};
