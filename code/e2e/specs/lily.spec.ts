import { expect, test } from "@playwright/test";
import { LILY } from "../personas/lily";
import {
  approveAsAdvisor,
  completeSuitability,
  expectNoProductYet,
  expectPolicyActive,
  expectPolicyInReview,
  expectRetirementGap,
  expectSeveralOptions,
  recommendationFor,
  say,
  signOffer,
  startAsClient,
  turn,
  useTextInput,
} from "./flow";

// Reaches the suitability form; the radio selectors in completeSuitability (flow.ts) still need fixing.
test.fixme("Lily Smith: retirement savings with LifeStar after the suitability check", async ({
  page,
}) => {
  await useTextInput(page);
  await startAsClient(page, "Lily Smith");

  const first = await say(page, LILY.say.opening);
  await expect(first).toContainText("im Monat sparen");
  await expectNoProductYet(page);

  const analysis = await say(page, LILY.say.savings);
  await expectRetirementGap(page);
  await expect(analysis).toContainText("Pax-Beraterin");
  await expectNoProductYet(page);

  await say(page, LILY.say.options);
  await expectSeveralOptions(page, 1);

  const rec = recommendationFor(page, LILY.suitabilityProduct);
  await expect(rec.getByText("Nach der Angemessenheitsprüfung").first()).toBeVisible();
  await turn(page, () =>
    rec.getByRole("button", { name: "Angemessenheitsprüfung starten" }).click(),
  );
  await completeSuitability(page, LILY.suitabilityProduct, {
    netIncome: "unter 75'000",
    netAssets: "über 300'000",
    savingCapacity: "über 7'000",
    goal: "moderate Gewinnchancen",
    horizon: "Mehr als 15 Jahre",
    knowledge: "bereits Kenntnisse und Erfahrungen",
    drawdown: "vorläufig nichts",
  });
  await signOffer(page, LILY.offerProduct, LILY.signature);

  const policies = await expectPolicyInReview(page, LILY.offerProduct);
  await approveAsAdvisor(page, LILY.signature);
  await expectPolicyActive(page, LILY.offerProduct, policies);
});
