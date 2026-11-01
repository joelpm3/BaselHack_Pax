import { expect, test } from "@playwright/test";
import { TAYLOR } from "../personas/taylor";
import {
  approveAsAdvisor,
  completeSuitability,
  expectNoProductYet,
  expectPolicyActive,
  expectPolicyInReview,
  expectRetirementGap,
  expectRiskGaps,
  expectSeveralOptions,
  recommendationFor,
  say,
  signOffer,
  startAsClient,
  turn,
  useTextInput,
} from "./flow";

// Reaches the suitability form; the radio selectors in completeSuitability (flow.ts) still need fixing.
test.fixme("Taylor Johnson: disability gap and a FondsStar savings plan", async ({ page }) => {
  await useTextInput(page);
  await startAsClient(page, "Taylor Johnson");

  const first = await say(page, TAYLOR.say.opening);
  await expect(first).toContainText("Erwerbsunfähigkeitsversicherung");
  await expectNoProductYet(page);

  await say(page, TAYLOR.say.savings);
  await expectRiskGaps(page);
  await expectRetirementGap(page);
  await expectNoProductYet(page);

  await say(page, TAYLOR.say.options);
  await expectSeveralOptions(page, 2);

  const rec = recommendationFor(page, TAYLOR.suitabilityProduct);
  await turn(page, () =>
    rec.getByRole("button", { name: "Angemessenheitsprüfung starten" }).click(),
  );
  await completeSuitability(page, TAYLOR.suitabilityProduct, {
    netIncome: "75'000 bis 150'000",
    netAssets: "über 300'000",
    savingCapacity: "über 7'000",
    goal: "hohes Verlustrisiko",
    horizon: "Mehr als 15 Jahre",
    knowledge: "viel Erfahrung",
    drawdown: "investiere zusätzlich",
  });
  await signOffer(page, TAYLOR.offerProduct, TAYLOR.signature);

  const policies = await expectPolicyInReview(page, TAYLOR.offerProduct);
  await approveAsAdvisor(page, TAYLOR.signature);
  await expectPolicyActive(page, TAYLOR.offerProduct, policies);
});
