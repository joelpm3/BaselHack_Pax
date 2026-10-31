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
| 7 | **44 of ~85 turns had no text at all** with Opus: the model called updateProfile and suggestReplies, then ended with an empty step. | `prepareStep`: when a widget tool ran before any text, the next step gets a system note to write the message and to send quick replies after it. Prompt: never end a turn with tool calls alone. |
| 8 | Analyses ran right after the last calculation input (4 times), before asking about existing insurance or savings. | See 4. |
| 9 | Advisor narrates the UI ("Ich habe die Upload-Karte geöffnet", "Unten erscheint jetzt ein Upload-Feld", "Ich habe Ihnen einige Bereiche als Antworten vorgeschlagen"). | Prompt: don't describe the interface. |
| 10 | Two questions in one message ("quanti anni ha oggi? Vive da solo …?"). | Prompt: exactly one question, at the end. |
| 11 | Customer's sex inferred from "ich habe eine Frau" (stored male) while the partner's sex was not stored. | Pending (iteration 1). |
| 12 | Quick replies guessing personal numbers ("[42] [45] [48]" for the exact age). | Pending (iteration 1). |
| 13 | Very long messages after results and offers (four bold sections, tables, 200+ words). | Pending (iteration 1). |
