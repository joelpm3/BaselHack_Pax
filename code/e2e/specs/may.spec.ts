import { expect, test } from "@playwright/test";
import { MAY } from "../personas/may";
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

test("May Müller: new visitor, disability cover as the family's earner", async ({ page }) => {
  await useTextInput(page);
  await startAsVisitor(page);

  const first = await say(page, MAY.say.opening);
  await expect(first).toContainText("brutto");
  await expectNoProductYet(page);

  await say(page, MAY.say.details);
  await expectRiskGaps(page, "May");
  await expectNoProductYet(page);

  await say(page, MAY.say.options);
  await expectSeveralOptions(page, 2);

  const offer = recommendationFor(page, MAY.offerProduct);
  await turn(page, () => offer.getByRole("button", { name: "Offerte ansehen" }).click());
  await signOffer(page, MAY.offerProduct, MAY.signature, MAY.contact);

  const policies = await expectPolicyInReview(page, MAY.offerProduct);
  await approveAsAdvisor(page, MAY.signature);
  await expectPolicyActive(page, MAY.offerProduct, policies);
});
