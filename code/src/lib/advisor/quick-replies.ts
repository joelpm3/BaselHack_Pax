/**
 * Quick replies are sent as the customer's own words. Signing an offer, confirming extracted
 * values or uploading a document happen in their card, so a reply claiming such an action
 * ("Ich habe die Offerte unterschrieben", "Die Werte stimmen, bestätigen") would make the advisor
 * believe something that never happened. Those replies are dropped, whatever the model suggests.
 */

/** Word stems of UI actions in German, French, Italian and English (start of a word). */
const UI_ACTION =
  /(?<!\p{L})(unterschr|unterzeichn|signier|bestätig|hochgelad|sign(?:e|é|ée|er|ed|ing|ature)?(?!\p{L})|confirm|conferm|firm(?:a|o|ato|ata|are|erò)(?!\p{L})|sottoscri|caricat|upload|téléchar|télévers)/iu;

export function pretendsUiAction(reply: string): boolean {
  return UI_ACTION.test(reply);
}

export function safeQuickReplies(options: string[]): string[] {
  return options.filter((option) => !pretendsUiAction(option));
}
