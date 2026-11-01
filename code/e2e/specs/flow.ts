import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The steps every persona goes through, written against roles and visible labels (German UI).
 * The advisor's answers come from the persona scripts in e2e/personas via the mock LLM.
 */

/** Writing instead of talking: the composer remembers the choice per device. */
export async function useTextInput(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("pax.chat.inputMode", "text"));
}

/** "Ich bin bereits Pax-Kunde": the seeded demo client of that name. */
export async function startAsClient(page: Page, name: string) {
  await page.goto("/de/kunde");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/de\/chat\//);
  await expect(chatInput(page)).toBeVisible();
}

/** "Beratung starten" on the home page: a new, anonymous visitor. */
export async function startAsVisitor(page: Page) {
  await page.goto("/de");
  await page.getByRole("button", { name: /Beratung starten/ }).click();
  await expect(page).toHaveURL(/\/de\/chat\//);
  await expect(chatInput(page)).toBeVisible();
}

const chatInput = (page: Page) => page.getByRole("textbox", { name: "Ihre Nachricht" });
const advisorMessages = (page: Page) => page.locator('li[data-role="assistant"]');

/** Runs one turn: `act` makes the customer's move, then waits until Clara's answer is complete. */
export async function turn(page: Page, act: () => Promise<unknown>): Promise<Locator> {
  const before = await advisorMessages(page).count();
  await act();
  await expect(advisorMessages(page)).toHaveCount(before + 1, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Antwort stoppen" })).toHaveCount(0, {
    timeout: 60_000,
  });
  const reply = advisorMessages(page).last();
  await expect(reply.getByText("[e2e mock]")).toHaveCount(0);
  return reply;
}

/** The customer types a message and sends it with Enter. */
export function say(page: Page, text: string): Promise<Locator> {
  return turn(page, async () => {
    await chatInput(page).fill(text);
    await chatInput(page).press("Enter");
  });
}

/** A widget in the chat, found by its card heading. */
export function widget(page: Page, title: string | RegExp): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });
}

export const recommendationCards = (page: Page) =>
  widget(page, /^(Empfehlung|\d+ Empfehlungen)$/).locator("article");

/** Needs analysis first: no product, price or offer on screen yet. */
export async function expectNoProductYet(page: Page) {
  await expect(recommendationCards(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Offerte ansehen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Angemessenheitsprüfung starten" })).toHaveCount(0);
  await expect(widget(page, /Offerte/)).toHaveCount(0);
}

/** The risk card with calculated monthly gaps if it hits `person` (a household tab, by name). */
export async function expectRiskGaps(page: Page, person?: string) {
  const card = widget(page, "Wenn etwas passiert");
  await expect(card).toBeVisible();
  if (person) await card.getByRole("tab", { name: `Wenn es ${person} trifft` }).click();
  await expect(card.getByText(/Lücke CHF [\d'’]+\/Mt\./).first()).toBeVisible();
}

/** The retirement overview with the gap per month. */
export async function expectRetirementGap(page: Page) {
  const card = widget(page, /^Ihre Vorsorge mit \d+/);
  await expect(card).toBeVisible();
  await expect(card.getByText(/Lücke pro Monat|Reserve pro Monat/)).toBeVisible();
}

/** Several options: more than one card, or a card with its alternatives. */
export async function expectSeveralOptions(page: Page, minCards: number) {
  await expect(recommendationCards(page)).toHaveCount(minCards);
  const alternatives = recommendationCards(page).getByText("Alternativen", { exact: true });
  await expect(alternatives.first()).toBeVisible();
  await alternatives.first().click();
  await expect(recommendationCards(page).locator("details[open] li").first()).toBeVisible();
}

/** One recommendation card by product name. */
export function recommendationFor(page: Page, product: string): Locator {
  return recommendationCards(page).filter({
    has: page.getByText(product, { exact: true }),
  });
}

export interface SuitabilityAnswers {
  netIncome: string;
  netAssets: string;
  savingCapacity: string;
  goal: string;
  horizon: string;
  knowledge: string;
  drawdown: string;
}

/** Fills the suitability form (questions A to C) and submits it. */
export async function completeSuitability(page: Page, product: string, a: SuitabilityAnswers) {
  const form = widget(page, `Angemessenheitsprüfung: ${product}`);
  await expect(form).toBeVisible();
  const pick = (question: string | RegExp, answer: string) =>
    form.getByRole("group", { name: question }).getByRole("radio", { name: answer }).check();
  await pick(/jährliches Nettoeinkommen/, a.netIncome);
  await pick(/Nettovermögen/, a.netAssets);
  await pick(/jährlich zusätzlich sparen/, a.savingCapacity);
  await pick(/Welches Ziel/, a.goal);
  await pick(/Über welchen Zeitraum/, a.horizon);
  await pick(/Kennen Sie sich mit Wertschriften aus/, a.knowledge);
  await pick(/verlieren 30 %/, a.drawdown);
  await expect(form.getByText(/Ihr Anlageprofil: /)).toBeVisible();
  return turn(page, () => form.getByRole("button", { name: "Prüfung abschliessen" }).click());
}

export interface Contact {
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
}

/** The offer card: contact details (when asked), the three consents and the typed signature. */
export async function signOffer(
  page: Page,
  product: string,
  signature: string,
  contact?: Contact,
): Promise<string> {
  const offer = widget(page, new RegExp(`Offerte.*${product}|${product}.*Offerte`));
  await expect(offer).toBeVisible();
  const contactForm = offer.getByRole("button", { name: "Angaben speichern" });
  if (contact || (await contactForm.isVisible())) {
    if (contact) {
      await offer.getByLabel("Vorname").fill(contact.firstName);
      await offer.getByLabel("Nachname").fill(contact.lastName);
      await offer.getByLabel("Geburtsdatum").fill(contact.birthDate);
      await offer.getByLabel("E-Mail").fill(contact.email);
      await offer.getByLabel("Telefon").fill(contact.phone);
    }
    await offer.getByLabel(/Rauch/).selectOption("no");
    await contactForm.click();
  }
  await expect(offer.getByRole("button", { name: "Jetzt unterschreiben" })).toBeVisible();
  for (const consent of [
    /Offerte und die wichtigsten Bedingungen/,
    /Angaben sind vollständig/,
    /dies eine Demo ist/,
  ])
    await offer.getByRole("checkbox", { name: consent }).check();
  await offer.getByLabel("Unterschrift").fill(signature);
  await turn(page, () => offer.getByRole("button", { name: "Jetzt unterschreiben" }).click());
  const signed = offer.getByText(/Ihr Antrag (\S+) ist jetzt bei Pax zur Prüfung/);
  await expect(signed).toBeVisible();
  const number = (await signed.textContent())?.match(/Antrag (\S+) ist/)?.[1];
  if (!number) throw new Error("No application number on the signed offer");
  return number;
}

/** A Pax advisor releases the signed application in the company cockpit. */
export async function approveAsAdvisor(page: Page, customer: string) {
  await page.goto("/de/firma/login");
  await page.getByRole("radio", { name: /Sandra Keller/ }).check();
  await page.getByLabel("Passwort").fill("e2e-password");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto(`/de/firma/kunden?q=${encodeURIComponent(customer)}`);
  await page
    .getByRole("link", { name: new RegExp(customer) })
    .first()
    .click();
  const approve = page.getByRole("button", { name: "Prüfen und freigeben" });
  await approve.click();
  await expect(approve).toHaveCount(0);
}

const policyCards = (page: Page, product: string) =>
  page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: product, exact: true }) });

/** After the signature: the new policy is in the Vorsorge-Cockpit, still in review. */
export async function expectPolicyInReview(page: Page, product: string): Promise<number> {
  await page.goto("/de/portal");
  const cards = policyCards(page, product);
  await expect(cards.filter({ hasText: "In Prüfung" })).toHaveCount(1);
  return cards.count();
}

/** After the advisor's release: the same policies, none of them in review any more. */
export async function expectPolicyActive(page: Page, product: string, count: number) {
  await page.goto("/de/portal");
  const cards = policyCards(page, product);
  await expect(cards).toHaveCount(count);
  await expect(cards.filter({ hasText: "In Prüfung" })).toHaveCount(0);
}
