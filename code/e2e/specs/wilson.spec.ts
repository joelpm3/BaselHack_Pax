import { expect, test } from "@playwright/test";
import { WILSON } from "../personas/wilson";
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
  startAsVisitor,
  turn,
  useTextInput,
} from "./flow";

test("Wilson Smith: new visitor, term life cover so Lily keeps her income", async ({ page }) => {
  await useTextInput(page);
  await startAsVisitor(page);

  const first = await say(page, WILSON.say.opening);
  await expect(first).toContainText("Bruttolohn");
  await expectNoProductYet(page);

  const analysis = await say(page, WILSON.say.details);
  await expectRiskGaps(page, "Wilson");
  // Company rule: assets over CHF 300'000, a person is offered and the advice goes on.
  await expect(analysis).toContainText("persönliche Beratung");
  await expectNoProductYet(page);

  await say(page, WILSON.say.options);
  await expectSeveralOptions(page, 2);

  const offer = recommendationFor(page, WILSON.offerProduct);
  await turn(page, () => offer.getByRole("button", { name: "Offerte ansehen" }).click());
  await signOffer(page, WILSON.offerProduct, WILSON.signature, WILSON.contact);

  const policies = await expectPolicyInReview(page, WILSON.offerProduct);
  await approveAsAdvisor(page, WILSON.signature);
  await expectPolicyActive(page, WILSON.offerProduct, policies);
});
