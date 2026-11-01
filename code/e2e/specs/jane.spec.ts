import { expect, test } from "@playwright/test";
import { JANE } from "../personas/jane";
import {
  approveAsAdvisor,
  expectNoProductYet,
  expectPolicyActive,
  expectPolicyInReview,
  expectRiskGaps,
  expectSeveralOptions,
  recommendationFor,
  say,
  signOffer,
  startAsClient,
  turn,
  useTextInput,
} from "./flow";

test("Jane Müller: young family, term life cover on May", async ({ page }) => {
  await useTextInput(page);
  await startAsClient(page, "Jane Müller");

  const first = await say(page, JANE.say.opening);
  await expect(first).toContainText("Pensionskasse");
  await expectNoProductYet(page);

  await say(page, JANE.say.pensionFund);
  await expectRiskGaps(page, "May");
  await expectNoProductYet(page);

  await say(page, JANE.say.options);
  await expectSeveralOptions(page, 2);

  const offer = recommendationFor(page, JANE.offerProduct);
  await turn(page, () => offer.getByRole("button", { name: "Offerte ansehen" }).click());
  await signOffer(page, JANE.offerProduct, JANE.signature);

  const policies = await expectPolicyInReview(page, JANE.offerProduct);
  await approveAsAdvisor(page, JANE.signature);
  await expectPolicyActive(page, JANE.offerProduct, policies);
});
