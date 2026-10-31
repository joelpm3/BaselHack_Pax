# Pax Clara pitch deck

3-minute pitch, 9 slides, live demo inside. Open `present.html` in a browser (works offline: font and
images are in this folder). `index.html` is the source; after editing it, run `./build-present.sh`.

| Key | Action |
|---|---|
| → ↓ Space PageDown Enter, click | Next build step or slide (clicker forward) |
| ← ↑ PageUp Backspace | Previous step (clicker back) |
| `B` `.` `V` on the "Meet Clara" slide | Backup demo: plays `demo-fallback.mp4` from this folder if it exists, else three screenshots. Next click ends it and moves on |
| `N` | Speaker notes with planned times and a running timer |
| `G` | Slide overview |
| `F` | Fullscreen |

Backup video: record the demo on the laptop and save it as `demo-fallback.mp4` next to `present.html`.

Story: the Müller family (Pax's sample persona: May earns, Jane is at home with their baby).
Illustrations in `illustrations/` were generated with Codex image generation in the style of
`illustrations/style-reference.webp`; the deck uses the 1200px `.webp` copies, the `.png` files are
the originals. Survey figures: Generali, May 2025 (1'016 people).

Screenshots in `img/` come from the jury-persona run (Jane Müller) and the live company cockpit on
31.10.2026. The portrait of Franz Laim is from Helvetia's public Zürich Nord agency page.
