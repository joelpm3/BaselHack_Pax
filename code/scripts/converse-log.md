# Conversation loop log

Findings from looping the example conversations in `scripts/converse-scenarios.ts` through the
real advisor (`pnpm converse all`), read as a Pax pension expert and as the product team.
Transcripts land in `data/converse/<run>/` (not committed). Model: claude-opus-5-5 (chat),
claude-sonnet-5-5 (simulated customer).

## Iteration 0: baseline (before any change)

Live user test (31.10.) and live DB, read before the loop:

| # | Bug | Cause | Fix |
|---|-----|-------|-----|
| 1 | Quick replies "Ich bin 1990 geboren" under "Wie alt ist Ihre Partnerin?" | The model called suggestReplies twice in one turn: once before writing its text (for a question it then did not ask), once after. The chat showed the **first** call. | Chat shows only the last suggestReplies call that comes after the text (`quickRepliesOf`); prompt and tool description: replies after the text, in the customer's voice, about the partner when the question is about the partner. |
| 2 | Customer's and partner's birth years swapped | Follow-on of 1: the stale button "Ich bin 1990 geboren" answered a question about the partner. Nothing told the customer when a stored fact was overwritten. | Fix 1, plus `person`/`partner` described as "ich" vs "meine Frau", a bare number answers the question just asked, and updateProfile returns `replaced` (facts it overwrote) which the advisor must name. |
| 3 | No quick replies after the "Zinseszins" detour | Prompt called suggestReplies "optional"; after a general question the model answered and re-asked without them. | Prompt: quick replies after every question with typical short answers, including a question repeated after a detour. |
| 4 | Risk card with an illness gap before existing cover was known | `missingForAnalysis` only listed calculation inputs; the prompt said "as soon as the core facts are known, run the analyses". No way to record cover named in the chat. | New step "what they already have" before the analyses; `privateCover` answer is required for showRiskAnalysis (unless death/disability policies are on file); `addPolicies` stores named policies as chat policies so the risk card counts them; savings, 3a and monthly spending listed as "ask before the first analysis". |
| 5 | "Danke, Herr." | Style rule allowed "Frau/Herr <last name>" without saying what to do without one. | Never Herr/Frau without the last name; vary openings. |
| 6 | Voice message "ich bin 31, ich habe eine Frau, ich zahle 3000 in die 3a" stored only the 3a amount, no reply text | Same device had an earlier conversation: the profile already held 1996 and a partner, the prompt still said "Pax knows nothing about this person" and the model silently ignored the contradicting age. Then it called suggestReplies without text and ended the turn empty. | Section "Earlier conversations" for returning visitors; contradictions: the latest statement wins and is named; ages that fit a stored birth year are not a change; every turn ends with text (see 7). |

Loop run `iter0` (10 scenarios, original code):

| # | Bug | Fix |
|---|-----|-----|
| 7 | **44 of ~85 turns had no text at all** with Opus: the model called updateProfile and suggestReplies, then ended with an empty step (`end_turn`, 2 output tokens). Same bug as the live "Notiert card without text" and the empty quick-reply turns other agents saw after calculation tools. | See iteration 1 (two attempts) for the fix that worked. |
| 8 | Analyses ran right after the last calculation input (4 times), before asking about existing insurance or savings. | See 4. |
| 9 | Advisor narrates the UI ("Ich habe die Upload-Karte geöffnet", "Unten erscheint jetzt ein Upload-Feld", "Ich habe Ihnen einige Bereiche als Antworten vorgeschlagen"). | Prompt: don't describe the interface. |
| 10 | Two questions in one message ("quanti anni ha oggi? Vive da solo …?"). | Prompt: exactly one question, at the end. |
| 11 | Customer's sex inferred from "ich habe eine Frau" (stored male) while the partner's sex was not stored. | Prompt: "meine Frau"/"mein Mann" gives the partner's sex, never the customer's. |
| 12 | Quick replies guessing personal numbers ("[42] [45] [48]" for the exact age, income ranges that need a follow-up). | Prompt: no quick replies for numbers only the customer knows; relative answers for the partner's age. |
| 13 | Very long messages after results and offers (four bold sections, tables, 200+ words). | Prompt: about 80 words, 120 after an analysis or offer, no tables or headings, one list at most. |
| 14 | Harness: mode `new_customer` does not exist (it is `new_business`). | Fixed in the harness. |

## Iteration 1: first fixes, then the empty-turn root cause

Run `iter1` (all scenarios) with the iteration-0 fixes: still **almost every turn empty**. Step-level logging showed two separate causes:

| # | Finding | Fix |
|---|---------|-----|
| 15 | The iteration-0 fix (adding a system note via `prepareStep` instructions) made the next step **fail**: `Invalid signature in thinking block … The system prompt differs from the one this block was created with`. The failed step ended the turn silently (no stream error). | Never change the instructions within a turn. The note is now appended as a user-side message (`prepareStep` → `messages`), which keeps the prefix and the thinking signatures valid. `onStepError` now logs failed steps. |
| 16 | A note in the widget tool's result ("write your message now") did not help: Opus still ended with an empty step. | Dropped; only the transcript note works. |
| 17 | After the note, Opus writes its text after the quick replies, so the "replies only after the text" rule from fix 1 hid them all. | Chat shows the **last** suggestReplies call (a later call replaces an early, wrong one) and only when the message has text. |
| 18 | suggestReplies with a single option ("Lieber überspringen") failed schema validation and cost a repair step. | Schema allows 1–4 options. |

Check run `iter1c` (voice scenarios): 0 empty turns (before: 4 of 6 per scenario).

## Iteration 2: all scenarios, 12 scenarios (added returning visitor, Swiss run-on)

Run `iter2`: **0 empty turns, 0 analyses before the cover question**, quick replies back after the "Zinseszins" detour, AXA policies stored and counted, contradiction 31 vs 1996 named ("Ich habe deinen Jahrgang von 1996 auf 1995 korrigiert"), du mirrored, voice run-ons fully extracted (name, age, work, partner, child, place in one call). Remaining:

| # | Finding | Fix |
|---|---------|-----|
| 19 | "Herr, für Ihre Lücken …" (bare title at the start of a message, last name unknown). The harness check missed it. | Customer section states how to address the person (title + last name, or no name); harness flags a bare title anywhere. |
| 20 | Echoes of the Notiert card in nearly every message ("Ich habe Ihren Lohn von CHF 92'000 notiert", "Winterthur ist notiert"). | Prompt: the card shows what was stored; only corrections are named, in one clause. |
| 21 | Corrections listed mechanically for plain news ("Bruttolohn von CHF 0 auf CHF 55'000 geändert", "«nein» durch «ja» ersetzt" for Jane going back to work). | Prompt: news is acknowledged in a few words; old/new values only for real corrections. |
| 22 | Other agents reported empty turns after calculation tools (calculateTaxSavings, new calculators), not only after widgets. | The note now follows any tool call while the turn has no text (firmer wording after widgets), so tools added by other branches are covered without a list. |
| 23 | The corrections scenario never produced a swap (the model stored both years correctly). | Scenario now answers with a bare "1994" and then corrects "ich bin 1990 geboren, nicht sie". |

Observed and accepted: the self-employed and the UK-expat cases hand over in the first turn because of company rule efec4209 (complex cases); the advisor keeps advising afterwards. Long but correct explanations when the customer explicitly asks for one (3a rules for students, AHV gaps after moving from the UK).

## Iteration 3: all 12 scenarios after the iteration-2 fixes

Run `iter3` (100 advisor turns): 0 empty turns, 0 bare titles, 0 analyses before the cover
question, "notiert" echoes down from 17 to 2, about 48 words per advisor message, quick replies
on 56 of 100 turns (the rest are open or numeric questions). Checked in detail:

- Bare "1994" as an answer to an unrelated question: the advisor asks whose year it is instead
  of guessing; the correction "ich bin 1990 geboren, nicht sie" stores both years correctly.
- Married → Konkubinat → married again: each change named in one clause, AHV consequence explained.
- Detour to "Zinseszins", car insurance and Bitcoin (it): answered briefly, the open question
  repeated with its quick replies; no investment opinion.
- Age contradiction (customer says 52, born 1972): stores 1972 and mentions 54 politely.
- Existing client Jane: no questions about facts on file; May's Pax policy is counted.

Verified in the running app (dev server, `POST /api/chat` with a device cookie): the live voice
message produces updateProfile, a du-reply ending in a question, and quick replies that render
under the message on `/de/chat/<id>`.

Open (not fixed here): the greeting for existing clients says "Grüezi Jane, … Sie" (first name
with Sie; the text lives in `messages/*/chat.json`); the Vorsorgebild side panel runs its own
risk check before the cover question (outside the advisor turn); explanations stay long when the
customer explicitly asks for one.

## Iteration 4–6: merged main (e18027c), 19 scenarios, Opus fast mode

Reported from an end-to-end run of `persona-8165` on merged main:

| # | Bug | Cause | Fix |
|---|-----|-------|-----|
| 24 | Message stops without its question ("… Für die Berechnung brauche ich noch eine letzte Angabe." then nothing) | The nudge only fired when the turn had no text at all. Text written before or around a tool call, then an empty final step. | After any tool call, the next step gets a "continue" note quoting the end of the message whenever the text so far does not end with a question (`replyNudgeFor`, `message-shape.ts`). |
| 25 | Message cut before a waiting widget ("Beim Rückruf geht es also um diese Punkte:" + askForFeedback) | A waiting widget ended the turn as soon as any text existed. | A waiting widget ends the turn only when the message does not dangle (no closing colon, ellipsis or "brauche ich noch …" without a question: `readyToWait`); otherwise the continue note asks for the rest. Prompt: text before a card stands on its own, never ends with a colon. |
| 26 | Claimed to have added a point to the callback request, retracted it next turn | No rule against claiming actions; the model did not know that calling requestHandover again updates the open request. | Prompt: only claim what a tool did in this turn; a later topic is visible to the advisor in the conversation anyway, or requestHandover is called again with the full reason (it updates the open request). No new tool. |
| 27 | Quick replies answering a question that was never asked, under "wählen Sie den Ort in der Karte" | The chat showed the last suggestReplies call whenever the message had text. | The chat shows quick replies only when the final text asks a question; prompt: quick replies only for the question in the final text. |

Harness flags added: `DANGLING_ENDING`, `UNMATCHED_QUICK_REPLIES` (also when the chat hides them),
`CLAIMED_ACTION` (claim verbs near callback/advisor/e-mail words, with no requestHandover or
prepareOffer in the turn).

Counts (new flags / turns):

| Run | Code | Turns | DANGLING | UNMATCHED | CLAIMED | NO_TEXT |
|-----|------|-------|----------|-----------|---------|---------|
| reported run (persona-8165) | main | 1 conversation | 2 | 1 | 1 | 0 |
| `iter4` (all 19) | main, before the fix | 150 | 0 | 0 | 0 | 0 |
| `iter5` + `iter5b` (all 19 + 4 persona reruns) | with the fix | 154 + 28 | 0 | 0 | 0 | 0 |
| `iter6` (all 19, 3 × persona-8165) | with the fix | 106 completed | 0 | 1* | 0 | 1* |

`iter4` was re-scanned offline (the flags were added during that run). The reported bugs are
intermittent: they did not show up in 150 turns on main, so the before/after counts mainly show
that the fix does not introduce new problems; the logic is covered by unit tests
(`reply-nudge.test.ts`, `message-shape.test.ts`, `quick-replies.test.ts`).

\* `iter6` stopped at the Anthropic API usage limit (resets 2026-11-01 00:00 UTC): 7 turns failed,
and the one flagged turn is a continue step that the API rejected for the limit, so the turn kept
only its tool calls. Follow-up: a step that fails after tool calls still ends the turn silently
(logged, no error shown to the customer).

## Iteration 7: Clara leads and teaches (Sonnet, 2 scenarios once)

Review of the live case 140bc36e (35-year-old cashier, insurance 3a that saves little): the
advisor followed instead of leading (straight to product cards on "können wir heute
abschliessen?"), never compared bank 3a and insurance 3a, did not clarify "voll investieren, ganz
wenig Risiko", gave LifeStar vs FondsStar one line each, never answered the early-retirement
question with numbers, and did not name the "gut abgedeckt mit 65" contradiction.

Prompt: new section "Clara leads the conversation / Explain so the customer can decide / Talk at
the customer's level / Clarify before acting / Consistency"; step 6 of the conversation design
asks for the trade-off and neutral alternatives before the first recommendation. Harness: flag
`PRODUCT_WITHOUT_EXPLANATION`; scenarios `case-140bc36e` (voice, du) and `product-choice-expert`.

Run `teach1` (claude-sonnet-5-5): 0 product-without-explanation, 0 dangling/unmatched/claimed.
- Case: asks what "voll investieren und ganz wenig Risiko" means ("kaum Kursschwankungen … oder
  möglichst wenig Versicherungsschutz?"), explains bank 3a vs insurance 3a and defines
  Rückkaufswert before any product, says "Eine Anlage-3a und der Schutz bei Invalidität sind zwei
  getrennte Themen", and on "heute abschliessen" names what comes first (the suitability check)
  instead of refusing. LifeStar vs FondsStar compared on guarantee vs fluctuation, with the bank
  3a as the flexible alternative.
- Expert: figures and trade-offs first, clarifies "sicher, aber mit Rendite" (capital guarantee
  vs few fluctuations), no basics; over-explained "Rückkaufswert" once.

Follow-up prompt fixes after the run (not re-run, testing budget): terms the customer already
uses are not defined again; the original question (early retirement) is answered in numbers right
after the first analysis, which the case still deferred within its 10 turns.

Talking at the customer's level: the prompt section "Talk at the customer's level" reads the
level from cues (words, questions, documents, reactions), uses three levels, and scales the
teaching above to it. The expert scenario shows no basics and trade-offs in one or two lines.

Sol review (1 round): a premium waiver was presented as closing a disability gap (fixed: only a
disability pension replaces income), and the product flag counted text written after
recommendProducts (fixed: order-aware).

## Iteration 8: the challenge's official personas as new customers (Sonnet, once each)

New scenarios `jury-young-family` (Jane Müller), `jury-affluent-couple` (Lily Smith),
`jury-single-professional` (Taylor Johnson), up to 14 turns. The harness now acts in the
suitability and offer cards (answers, contact form, signature via the same server functions as
the card actions) and sends the card's message, so a journey can end with a signed policy.

| Persona | Got to | Recommended, why | Problems found |
|---|---|---|---|
| Jane Müller | Signed Pax Todesfallversicherung (CHF 460'000, 25 years, ~CHF 1'850/year) for May; then explained the disability pension (CHF 15'000/year after 24 months, ~CHF 740/year) and offered it | Death gap CHF 1'529/month and disability gap CHF 1'239/month for May (both from showRiskAnalysis); alternatives named: decreasing capital, doing nothing, checking the pension certificate first | Product explanation came in the same message as the recommendation, not before (flag). Figures match the tool results; occupation group 2 matches the tool. |
| Lily Smith (run 1) | Handover in turn 8, no analysis | none | Rule "Vermögen über CHF 300'000: persönliche Beratung anbieten" was applied as an immediate handover; first message repeated after a tool call. |
| Lily Smith (run 2, after the fixes) | Callback offered and accepted only in turn 11; pension overview, capital drawdown, life plan, buy-in rules explained | No product: CHF 500'000 at ~CHF 960/month covers the gap to their actual spending, so "nicht zwingend in ein Produkt binden"; names the contradiction between the 80 %-of-income gap (CHF 10'600/month) and their actual spending | Stored the husband's retirement as a planned event, so the life plan showed her retiring at 56; the advisor admitted it. Fixed: planned events are the customer's or household's, never the partner's retirement. |
| Taylor Johnson | Signed Pax Erwerbsunfähigkeitsversicherung (CHF 32'000/year, 24 months waiting period, re-priced to CHF 1'208/year); then home-purchase simulation and life plan | Disability gap ~CHF 2'600/month (tool); no retirement gap when assets count; alternatives: carry the risk with own assets, do nothing | Handover forced in turn 1 (same rule, fixed). Scenario had no sex (the official persona is a man; fixed). Mortgage rules of thumb correct (20 % equity, 10 % hard equity, imputed rate about 5 %, one third of income). |

Fixes: rules that say "anbieten" offer the callback and call requestHandover once the customer
accepts, while Clara keeps advising within the rule's limits; a message the model repeats after a
tool call is dropped where messages are stored and shown (`repeated-text.ts`); planned events
describe the customer's or household's plans only.

