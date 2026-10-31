import type { Locale } from "@/lib/domain/taxonomy";

/**
 * Pax's own explanatory pages ("Ratgeber" and "Vorsorgewelt") the advisor may link to. Every
 * URL was opened and checked on pax.ch (2026-10-31), the French and Italian ones taken from the
 * pages' own language links. pax.ch has no English version, so English uses the German page.
 * The advisor only picks ids; it never writes a URL itself. Titles live in
 * `explainers.references.articles.<id>`.
 */

type LocalizedUrl = { de: string; fr: string; it: string };

const PAX = "https://www.pax.ch";

export const PAX_ARTICLES = {
  compound_interest: {
    de: "/de/vorsorgewelt/langfristiger-vermoegensaufbau",
    fr: "/fr/monde-de-la-prevoyance/construire-de-la-richesse",
    it: "/it/mondo-della-previdenza/costruzione-del-patrimonio",
  },
  pension_system: {
    de: "/de/vorsorgewelt/vorsorgesystem-schweiz",
    fr: "/fr/monde-de-la-prevoyance/comprendre-la-prevoyance",
    it: "/it/mondo-della-previdenza/comprendere-la-previdenza",
  },
  social_security: {
    de: "/de/ratgeber/vorsorge/soziale-vorsorge-der-schweiz",
    fr: "/fr/guide/prevoyance/soziale-vorsorge-der-schweiz",
    it: "/it/guida/previdenza/soziale-vorsorge-der-schweiz",
  },
  retirement_planning: {
    de: "/de/vorsorgewelt/planung-der-altersvorsorge",
    fr: "/fr/monde-de-la-prevoyance/planification-de-la-retraite",
    it: "/it/mondo-della-previdenza/pianificare-il-pensionamento",
  },
  pillar3a_tax: {
    de: "/de/ratgeber/vorsorge/steuerersparnis-saeule-3a",
    fr: "/fr/guide/prevoyance/economies-fiscales-piller-3a",
    it: "/it/guida/previdenza/risparmio-fiscale-pilastro-3a",
  },
  pillar3a_bank_or_insurance: {
    de: "/de/ratgeber/vorsorge/3-saeule-bank-vs-versicherung",
    fr: "/fr/guide/prevoyance/3-pilier-banque-vs-assurance",
    it: "/it/guida/previdenza/terzo-pilastro-confronto-tra-banca-e-assicurazione",
  },
  pillar3a_staggered_withdrawal: {
    de: "/de/ratgeber/vorsorge/pensionierung/saeule-3a-gestaffelt-beziehen",
    fr: "/fr/guide/prevoyance/retraite-suisse/un-retrait-echelonne-de-l-argent-du-pilier-3a",
    it: "/it/guida/previdenza/pensionamento-in-svizzera/prelievo-scaglionato-dal-terzo-pilastro",
  },
  pillar3a_premium_waiver: {
    de: "/de/ratgeber/vorsorge/praemienbefreiung-bei-der-saeule-3a",
    fr: "/fr/guide/prevoyance/exoneration-de-prime-du-pilier-3a",
    it: "/it/guida/previdenza/esenzione-dai-premi-del-3-pilastro",
  },
  life_insurance: {
    de: "/de/ratgeber/vorsorge/lebensversicherung",
    fr: "/fr/guide/prevoyance/assurance-vie",
    it: "/it/guida/previdenza/assicurazione-sulla-vita",
  },
  pillar2_basics: {
    de: "/de/ratgeber/berufliche-vorsorge-verstehen/2-saeule-bvg",
    fr: "/fr/guide/comprendre-la-prevoyance-professionnelle/2-pilier-lpp",
    it: "/it/guida/comprendere-la-previdenza-professionale/secondo-pilastro-lpp",
  },
  conversion_rate: {
    de: "/de/ratgeber/berufliche-vorsorge-verstehen/der-gesetzliche-bvg-umwandlungssatz",
    fr: "/fr/guide/comprendre-la-prevoyance-professionnelle/le-taux-de-conversion",
    it: "/it/guida/comprendere-la-previdenza-professionale/il-tasso-di-conversione",
  },
  coordination_deduction: {
    de: "/de/ratgeber/berufliche-vorsorge-verstehen/koordinationsabzug",
    fr: "/fr/guide/comprendre-la-prevoyance-professionnelle/deduction-de-coordination",
    it: "/it/guida/comprendere-la-previdenza-professionale/trattenuta-di-coordinamento",
  },
  pension_certificate: {
    de: "/de/ratgeber/berufliche-vorsorge-verstehen/lesehilfe-vorsorgeausweis",
    fr: "/fr/guide/comprendre-la-prevoyance-professionnelle/certificat-de-prevoyance",
    it: "/it/guida/comprendere-la-previdenza-professionale/certificato-di-previdenza",
  },
  pension_fund_buy_in: {
    de: "/de/ratgeber/berufliche-vorsorge-optimieren/pensionskasse-freiwillig-einzahlen",
    fr: "/fr/guide/optimiser-votre-prevoyance-professionnelle/rachats-dans-le-2eme-pilier",
    it: "/it/guida/ottimizzare-la-previdenza-professionale/acquisti-nella-previdenza-professionale",
  },
  pension_gaps: {
    de: "/de/ratgeber/berufliche-vorsorge-optimieren/vorsorgeluecken-erkennen-und-schliessen",
    fr: "/fr/guide/optimiser-votre-prevoyance-professionnelle/identifier-les-lacunes-de-prevoyance-et-les-combler",
    it: "/it/guida/ottimizzare-la-previdenza-professionale/riconoscere-e-colmare-le-lacune-previdenziali",
  },
  unpaid_leave: {
    de: "/de/ratgeber/berufliche-vorsorge-optimieren/vorsorge-im-unbezahlten-urlaub",
    fr: "/fr/guide/optimiser-votre-prevoyance-professionnelle/prevoyance-pendant-un-conge-non-paye",
    it: "/it/guida/ottimizzare-la-previdenza-professionale/previdenza-durante-il-congedo-non-pagato",
  },
  early_retirement: {
    de: "/de/ratgeber/vorsorge/pensionierung/fruehpensionierung",
    fr: "/fr/guide/prevoyance/retraite-suisse/retraite-anticipee",
    it: "/it/guida/previdenza/pensionamento-in-svizzera/pensionamento-anticipato",
  },
  pension_or_lump_sum: {
    de: "/de/ratgeber/vorsorge/pensionierung/pensionskassenrente-oder-kapitalbezug",
    fr: "/fr/guide/prevoyance/retraite-suisse/rente-ou-capital",
    it: "/it/guida/previdenza/pensionamento-in-svizzera/rendita-o-capitale",
  },
  retirement_budget: {
    de: "/de/ratgeber/vorsorge/pensionierung/budgetplanung-nach-der-pensionierung",
    fr: "/fr/guide/prevoyance/retraite-suisse/planification-budgetaire-suivant-le-depart-en-retraite",
    it: "/it/guida/previdenza/pensionamento-in-svizzera/pianificazione-del-budget-dopo-il-pensionamento",
  },
  couples_and_cohabiting: {
    de: "/de/ratgeber/familie-und-partnerschaft/vorsorge-fuer-partner",
    fr: "/fr/guide/famille-et-partenariat/prevoyance-pour-partenaire",
    it: "/it/guida/famiglia-e-partenariato/previdenza-per-le-coppie",
  },
  protect_family: {
    de: "/de/ratgeber/familie-und-partnerschaft/familie-absichern",
    fr: "/fr/guide/famille-et-partenariat/assurer-sa-famille",
    it: "/it/guida/famiglia-e-partenariato/tutelare-la-famiglia",
  },
  death_and_disability: {
    de: "/de/vorsorgewelt/finanzielle-absicherung-bei-tod-invaliditaet",
    fr: "/fr/monde-de-la-prevoyance/assurer-les-risques",
    it: "/it/mondo-della-previdenza/proteggere-dai-rischi",
  },
  children: {
    de: "/de/ratgeber/familie-und-partnerschaft/wie-sichere-ich-die-zukunft-meiner-kinder",
    fr: "/fr/guide/famille-et-partenariat/comment-assurer-l-avenir-de-mes-enfants",
    it: "/it/guida/famiglia-e-partenariato/come-assicuro-il-futuro-dei-miei-figli",
  },
  parental_leave: {
    de: "/de/ratgeber/vorsorge/frauenvorsorge/babypause",
    fr: "/fr/guide/prevoyance/frauenvorsorge/pause-maternite",
    it: "/it/guida/previdenza/frauenvorsorge/congedi-di-maternita",
  },
  divorce: {
    de: "/de/ratgeber/familie-und-partnerschaft/scheidung",
    fr: "/fr/guide/famille-et-partenariat/divorce",
    it: "/it/guida/famiglia-e-partenariato/divorzio",
  },
  estate_planning: {
    de: "/de/ratgeber/familie-und-partnerschaft/nachlassplanung",
    fr: "/fr/guide/famille-et-partenariat/planification-successorale",
    it: "/it/guida/famiglia-e-partenariato/pianificazione-della-successione",
  },
  home_ownership: {
    de: "/de/ratgeber/wohnen/wohneigentumsfinanzierung",
    fr: "/fr/guide/logement/financement-d-un-bien-immobilier",
    it: "/it/guida/abitare/finanziamento-della-proprieta-abitativa",
  },
  home_with_pension_money: {
    de: "/de/vorsorgewelt/finanzierung-von-wohneigentum-mit-vorsorgegeldern",
    fr: "/fr/monde-de-la-prevoyance/financer-l-achat-d-une-maison",
    it: "/it/mondo-della-previdenza/finanziamento-casa",
  },
  self_employment: {
    de: "/de/ratgeber/selbststaendigkeit/selbststaendigkeit-aufnehmen",
    fr: "/fr/guide/activite-independante/se-mettre-a-son-compte",
    it: "/it/guida/attivita-autonoma/avviare-la-propria-attivita",
  },
} as const satisfies Record<string, LocalizedUrl>;

export type PaxArticleId = keyof typeof PAX_ARTICLES;
export const PAX_ARTICLE_IDS = Object.keys(PAX_ARTICLES) as [PaxArticleId, ...PaxArticleId[]];

export function isPaxArticleId(id: string): id is PaxArticleId {
  return Object.hasOwn(PAX_ARTICLES, id);
}

/** The page in the customer's language; English falls back to German (pax.ch has no English). */
export function articleLink(
  id: PaxArticleId,
  locale: Locale,
): { url: string; lang: "de" | "fr" | "it" } {
  const lang = locale === "en" ? "de" : locale;
  return { url: `${PAX}${PAX_ARTICLES[id][lang]}`, lang };
}
