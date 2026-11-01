# Demo journey: rewind to before May got ill

The deck tells the bad ending: May gets ill, CHF 1'239 is missing every month. The demo rewinds
and shows how Clara would have stopped it. That doesn't happen in one chat. It happens over two
years: Clara first met the family when nothing was wrong, and came back when their life changed.

The demo slot is **70 seconds** (1:15–2:25 in the speaker notes). We show five features on the
way (memory, check-in, document upload, gap and recommendation, signing) and skip the rest.

## The story in two moments

| | Autumn 2024: first conversation | Autumn 2026: back in the chat |
|---|---|---|
| Family | May and Jane, no child yet, Kinderwunsch | Noah born 12.05.2026 |
| Income | May 100 % CHF 95'000, Jane nurse 80 % CHF 76'000 | May CHF 100'000, Jane at home |
| What Clara found | Disability by illness: May's gap CHF 2'340 a month (Jane's CHF 1'100). Death less urgent without children. | Jane's salary is gone. May's disability gap CHF 1'239 a month. |
| What they did | Clara recommended a disability pension for May (CHF 29'000 a year, CHF 2'053.20). They chose to wait for the family. | Pax Erwerbsunfähigkeit, CHF 15'000 a year, CHF 741.40 |
| Documents | `lohnausweis-2023-may-mueller.pdf`, `lohnausweis-2023-jane-mueller.pdf`, `vorsorgeausweis-2024-may-mueller.pdf`, `vorsorgeausweis-2024-jane-mueller.pdf` (seeded, confirmed) | `vorsorgeausweis-2026-may-mueller.pdf` (uploaded live), also available: `lohnausweis-2025-may-mueller.pdf`, `police-krankenkasse-2026-familie-mueller.pdf` |

The pitch line is "Clara saw it in 2024 and came back when it mattered", not "Clara sold them a
policy in 2024". The 2024 conversation is **shown, not played**: it sits in the seed as history.
The 2026 check-in runs live.

## The 70 seconds

| Time | Screen | Who says what | Feature shown |
|---|---|---|---|
| 0–5 s | Slide "Meet Clara" | Flurin: "Let's rewind two years. May and Jane both work, no baby yet. They meet Clara." | |
| 5–15 s | `/firma/kunden` → Jane | Verlauf: 2024 conversation, four documents confirmed, recommendation declined, 2025 check-in answered. "Clara read their papers, found May's gap and noted that they want children." | Memory, documents |
| 15–23 s | Jane's customer page → Kommunikation | December 2025 check-in: "Wir erwarten im Mai unser erstes Kind!" Pax notes the birth and writes in April 2026; Jane answers that Noah is born. "Clara checks in every year and comes back when life changes." | Yearly check-in, life-event follow-up |
| 23–55 s | `/kunde` → Jane, chat | Jane by voice, Swiss German: *"Grüezi Clara, mir hän im Mai dr Noah übercho und ich schaff sit dr Geburt nümm. Sin mir no guet abgsicheret, wenn em May öppis passiert?"* Clara asks for the new pension certificate → drag in `vorsorgeausweis-2026-may-mueller.pdf` → confirm (as May) → Vorsorgebild → **gap CHF 1'239** → recommendation | Swiss-German voice, upload and extraction, Logismata, recommendation with reasons |
| 55–65 s | Offer card | Sign with "Jane Müller" → policy in the cockpit | Contract end to end |
| 65–70 s | Back to the deck | "Rewind" slide: "We can't stop May from getting sick…" | |

If time is short, cut in this order: the language switch (already not in this script), the
`/firma/wiedervorlagen` step (open the chat directly and say "Clara's yearly e-mail asked what
changed"), then the upload (see below for what the gap is then).

## The numbers (Logismata, checked 01.11.2026)

| Profile | May disabled by illness | Gap per month |
|---|---|---|
| 2024 seed: both working, 2024 certificates | need 76'000, AHV/IV 27'096, PK 20'830 | **CHF 2'340** |
| 2026 after the chat, 2026 certificate uploaded | need 80'000, AHV/IV 38'604, PK 26'532 | **CHF 1'239** |
| 2026 after the chat, no upload (2024 certificate) | need 80'000, AHV/IV 38'604, PK 24'996 | CHF 1'367 |

The deck says CHF 1'239 and CHF 741.40. That only holds with the upload, so **upload the 2026
certificate and make sure the review card says May**. Jane's old pension figures stay in her
profile after she says she stopped working; they don't change May's gap.

For CHF 1'239 the chat has to record: Jane at home without income, a child born 2026, May at
CHF 100'000.

## The seed

`code/scripts/seed-mueller.ts`, run by `pnpm db:seed`:

- Jane Müller (Interessentin, no Pax policy), client since about 745 days before the seed runs.
- The 2024 conversation is a real recording (`code/scripts/fixtures/mueller-2024-chat.json`):
  Clara's widgets (Notiert, document review, Wenn etwas passiert, Vorsorge mit 65, 3a tax
  savings, Zinseszins, recommendation card for May: CHF 29'000 a year for CHF 2'053.20), the four
  uploaded 2024 PDFs with confirmed extractions, the Logismata calculations, the analysis and the
  resulting profile (both employed, no children, Kinderwunsch). Five of Clara's sentences were
  edited to match the pitch: May's illness gap comes first, no "no offer for Jane", and the chat
  ends with "Sie werden benachrichtigt".
- The outreach after the chat:
  - December 2025: yearly check-in, Jane replies "Wir erwarten im Mai unser erstes Kind!".
  - From that reply, a planned birth in May 2026 (Wiedervorlagen → Beantwortet).
  - April 2026: Pax's e-mail before the birth ("Bald zu dritt"), Jane replies on 20 May that
    Noah was born on 12 May and she will come back to Clara.
- The next yearly check-in is due in December 2026, so "Wiedervorlagen jetzt prüfen" writes no
  e-mail for Jane on demo day (Monika Widmer's check-in is still due).

To record the 2024 chat again, run the app on a fresh database, chat as Jane with the 2024 PDFs
and export the customer's rows into the fixture (dates as offsets from the conversation start).

Dates are relative to the seed day and assume it runs in early November 2026.

The harness scenario `existing-jane` (`scripts/converse-scenarios.ts`) plays the 2026 check-in
chat without the upload.

## Before the demo

- Deploy and run `pnpm db:reset` on pax.secdesk.online. The seed skips everything once advisors
  exist, so a plain `db:seed` does not replace the old Jane. The reset also deletes all other
  data there. Reset again after each rehearsal.
- Rehearse that the 2026 run lands on CHF 1'239 and CHF 741.40 with the uploaded certificate.
- Extraction time for one PDF on the venue wifi (or on the GPU). If it is over 8 seconds, talk
  over it or cut the upload.
- Record the 70 seconds as `assets/pitch/demo-fallback.mp4` once it works.
