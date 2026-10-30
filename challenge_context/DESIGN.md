# Pax UI — Design System

> Sources:
> - https://ui.pax.ch/?path=/docs/guide-design-tokens--docs (Design Tokens)
> - https://ui.pax.ch/?path=/docs/guide-typography-system--docs (Typography)
> - https://ui.pax.ch/?path=/docs/guide-installation-setup--docs (Installation & Setup)
>
> Hex/rem values were read from the CSS custom properties that the Storybook loads (`pax-ui.css`), captured 2026-10-30.

Pax UI is an **Angular (v19/v20)** component library. Every token is available as a **CSS custom property** and as a **Tailwind CSS utility class**. Semantic tokens adapt to light/dark theme automatically.

---

## 1. Color

### 1.1 Brand

| Token (CSS var) | Tailwind | Hex |
|---|---|---|
| `--color-brand-pax-green` | `bg-brand-pax-green` / `text-brand-pax-green` | `#8ccd0f` |
| `--color-brand-pax-purple` | `bg-brand-pax-purple` / `text-brand-pax-purple` | `#3c0078` |
| `--color-brand-deep-green` | `bg-brand-deep-green` | `#003018` |
| `--color-brand-deep-purple` | `bg-brand-deep-purple` | `#2a0754` |
| `--color-brand-contrast-green` | `bg-brand-contrast-green` | `#5ca700` |

### 1.2 Neutral

| Token | Tailwind | Value |
|---|---|---|
| `--color-neutral-black` | `bg-neutral-black` | `#121212` |
| `--color-neutral-white` | `bg-neutral-white` | `#ffffff` |
| `--color-neutral-black-50` | `bg-neutral-black-50` | `rgba(18,18,18,0.5)` |
| `--color-neutral-black-10` | `bg-neutral-black-10` | `rgba(18,18,18,0.1)` |
| `--color-neutral-white-50` | `bg-neutral-white-50` | `rgba(255,255,255,0.5)` |
| `--color-neutral-white-20` | `bg-neutral-white-20` | `rgba(255,255,255,0.2)` |
| `--color-neutral-gray-1` (lightest) | `bg-neutral-gray-1` | `#f5f5f5` |
| `--color-neutral-gray-2` | `bg-neutral-gray-2` | `#ededed` |
| `--color-neutral-gray-3` | `bg-neutral-gray-3` | `#d4d4d4` |
| `--color-neutral-gray-4` | `bg-neutral-gray-4` | `#adadad` |
| `--color-neutral-gray-5` | `bg-neutral-gray-5` | `#8e8e8e` |
| `--color-neutral-gray-6` | `bg-neutral-gray-6` | `#6a6a6a` |
| `--color-neutral-gray-7` (darkest) | `bg-neutral-gray-7` | `#282828` |

### 1.3 System (states)

| State | Base | Light | Dark |
|---|---|---|---|
| Success `--color-system-success` | `#00be00` | `#f5fbe9` | `#003018` |
| Warning `--color-system-warning` | `#ff9600` | `#fff4e5` | `#814c00` |
| Error `--color-system-error` | `#ff3232` | `#fff5f5` | `#5c1212` |
| Info `--color-system-info` | `#3c0078` | `#f8f6fb` | `#2a0754` |

Tailwind: `bg-system-success`, `text-system-success`, `bg-system-success-light`, `bg-system-success-dark`, and the same pattern for `warning`, `error` and `info`.

### 1.4 Accent (highlight / decoration)

| Token | Tailwind | Hex |
|---|---|---|
| `--color-accent-pink` | `bg-accent-pink` | `#ff28d7` |
| `--color-accent-orange` | `bg-accent-orange` | `#ff6c00` |
| `--color-accent-yellow` | `bg-accent-yellow` | `#fae614` |
| `--color-accent-mint` | `bg-accent-mint` | `#00d7c3` |
| `--color-accent-blue` | `bg-accent-blue` | `#22a2ff` |

### 1.5 Chart (data visualization)

Named chart colors:

| Token | Tailwind | Hex |
|---|---|---|
| `--color-chart-turquoise` | `bg-chart-turquoise` | `#78c7c7` |
| `--color-chart-amber` | `bg-chart-amber` | `#e6be4b` |
| `--color-chart-blue` | `bg-chart-blue` | `#345076` |
| `--color-chart-red` | `bg-chart-red` | `#b54963` |
| `--color-chart-silver` | `bg-chart-silver` | `#bcbbb0` |
| `--color-chart-beige` | `bg-chart-beige` | `#c3a57d` |

Ordered chart series (`--background-chart-chart-N`):

| # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Hex | `#8ccd0f` green | `#3c0078` purple | `#78c7c7` turquoise | `#e6be4b` amber | `#345076` blue | `#b54963` red | `#bcbbb0` silver | `#c3a57d` beige |

### 1.6 Semantic tokens (theme-aware)

Use these by default; they switch with the theme.

#### Background

| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--background-default` (primary surface) | `bg-default` | `#ffffff` | `#121212` |
| `--background-muted` (secondary surface) | `bg-muted` | `#f5f5f5` | `#282828` |
| `--background-default-muted` | — | `rgba(18,18,18,0.1)` | `rgba(255,255,255,0.2)` |
| `--background-inverse-muted` | — | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.2)` |
| `--background-brand` (brand emphasis) | `bg-brand` | `#8ccd0f` | `#8ccd0f` |
| `--background-brand-contrast` (brand alternative) | `bg-brand-contrast` | `#5ca700` | `#5ca700` |
| `--background-brand-deep-green` | — | `#003018` | `#003018` |
| `--background-brand-pax-purple` | — | `#3c0078` | `#3c0078` |
| `--background-footer-navi-brand-deep-purple` | — | `#2a0754` | `#2a0754` |
| `--background-success` | `bg-success` | `#f5fbe9` | `#003018` |
| `--background-warning` | `bg-warning` | `#fff4e5` | `#ffffff` |
| `--background-error` | `bg-error` | `#fff5f5` | `#5c1212` |
| `--background-info` | `bg-info` | `#f8f6fb` | `#2a0754` |
| `--background-accent-*` | — | same as accent colors | same |

#### Text

| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--text-default` (primary content) | `text-default` | `#121212` | `#ffffff` |
| `--text-muted` (secondary content) | `text-muted` | `#6a6a6a` | `#ededed` |
| `--text-subtle` (supporting content) | `text-subtle` | `#adadad` | `#adadad` |
| `--text-default-muted` | — | `rgba(18,18,18,0.5)` | `rgba(255,255,255,0.5)` |
| `--text-brand` | `text-brand` | `#8ccd0f` | `#8ccd0f` |
| `--text-brand-contrast` | `text-brand-contrast` | `#5ca700` | `#8ccd0f` |
| `--text-inverse` (on dark backgrounds) | `text-inverse` | `#ffffff` | `#ffffff` |
| `--text-inverse-muted` | — | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.5)` |
| `--text-success` | `text-success` | `#003018` | `#f5fbe9` |
| `--text-warning` | `text-warning` | `#814c00` | `#ffffff` |
| `--text-error` | `text-error` | `#5c1212` | `#fff5f5` |
| `--text-info` | `text-info` | `#2a0754` | `#f8f6fb` |

#### Icon

| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--icon-default` | `text-icon-default` | `#121212` | `#ffffff` |
| `--icon-muted` | `text-icon-muted` | `#6a6a6a` | `#ededed` |
| `--icon-subtle` | `text-icon-subtle` | `#adadad` | `#adadad` |
| `--icon-default-muted` | — | `rgba(18,18,18,0.5)` | `rgba(255,255,255,0.5)` |
| `--icon-brand` | `text-icon-brand` | `#8ccd0f` | `#8ccd0f` |
| `--icon-brand-contrast` | `text-icon-brand-contrast` | `#5ca700` | `#8ccd0f` |
| `--icon-inverse` | `text-icon-inverse` | `#ffffff` | `#ffffff` |
| `--icon-inverse-muted` | — | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.5)` |
| `--icon-success` | `text-icon-success` | `#00be00` | `#00be00` |
| `--icon-warning` | `text-icon-warning` | `#ff9600` | `#ffffff` |
| `--icon-error` | `text-icon-error` | `#ff3232` | `#ff3232` |
| `--icon-info` | `text-icon-info` | `#3c0078` | `#f8f6fb` |

#### Border

| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--border-default` | `border-default` | `#121212` | `#ffffff` |
| `--border-default-muted` | — | `rgba(18,18,18,0.5)` | `rgba(255,255,255,0.5)` |
| `--border-soft` | `border-soft` | `#d4d4d4` | `#adadad` |
| `--border-subtle` | `border-subtle` | `#adadad` | `#d4d4d4` |
| `--border-focusring` | `border-focusring` | `#8ccd0f` | `#8ccd0f` |
| `--border-inverse` | — | `#ffffff` | `#ffffff` |
| `--border-inverse-muted` | — | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.5)` |
| `--border-success` | `border-success` | `#00be00` | `#00be00` |
| `--border-warning` | `border-warning` | `#ff9600` | `#ffffff` |
| `--border-error` | `border-error` | `#ff3232` | `#ff3232` |
| `--border-info` | `border-info` | `#3c0078` | `#3c0078` |

### 1.7 Color usage guidelines

- **Brand colors:** primary brand colors for emphasis and identity
- **Neutral colors:** base colors for text, backgrounds, and UI elements
- **System colors:** state communication (success, error, warning, info)
- **Accent colors:** highlight and decoration colors
- **Chart colors:** data visualization and chart components
- **Semantic colors:** purpose-driven colors that adapt to themes

---

## 2. Typography

**Primary typeface:** `Civil Premium` (weights 400 / 500 / 700) with fallback `system-ui, -apple-system, sans-serif`.

### 2.1 Font weights

| Weight | Tailwind | Use | Token |
|---|---|---|---|
| 400 | `font-normal` | Body text, paragraphs | `--font-weight-paragraph` |
| 500 | `font-medium` | Buttons, emphasized content, overline | `--font-weight-button`, `--font-weight-overline` |
| 700 | `font-bold` | Headings, display text | `--font-weight-heading`, `--font-weight-display` |

### 2.2 Type scale (responsive, desktop breakpoint ≥ 1024px)

Sizes come from the CSS tokens (`--size-*`). Where the documentation page states a different mobile value, it's shown in brackets.

| Style | Tailwind | Mobile | Desktop | Line height | Usage |
|---|---|---|---|---|---|
| Display XXL | `text-display-xxl` | 3.75rem / 60px | 6.875rem / 110px | 110% | Hero sections, landing headers |
| Display XL | `text-display-xl` | 3.125rem / 50px | 6rem / 96px | 110% | Large hero text |
| Display L | `text-display-l` | 2.5rem / 40px | 4.5rem / 72px | 120% | Section heroes |
| Display M | `text-display-m` | 2rem / 32px *(doc: 30px)* | 3.75rem / 60px | 125% | Subsection headers |
| Display S | `text-display-s` | 1.875rem / 30px *(doc: 24px)* | 3.25rem / 52px | 125% | Small display text |
| Heading XL | `text-heading-xl` | 2rem / 32px | 2.75rem / 44px | 125% | Page titles |
| Heading L | `text-heading-l` | 1.625rem / 26px | 2.375rem / 38px | 130% | Section headings |
| Heading M | `text-heading-m` | 1.375rem / 22px | 1.75rem / 28px | 130% | Subsection titles |
| Heading S | `text-heading-s` | 1.125rem / 18px | 1.375rem / 22px | 140% | Small headings |
| Paragraph L | `text-paragraph-l` | 1.125rem / 18px | 1.375rem / 22px | 155% | Introduction text |
| Paragraph M | `text-paragraph-m` | 1rem / 16px *(doc: 17px)* | 1.125rem / 18px | 155% | Body text (default) |
| Paragraph S | `text-paragraph-s` | 0.875rem / 14px *(doc: 16px)* | 1rem / 16px | 155% | Secondary content |
| Paragraph XS | `text-paragraph-xs` | 0.75rem / 12px *(doc: 14px)* | 0.875rem / 14px | 155% | Captions, meta info |
| Paragraph XXS | `text-paragraph-xxs` | 0.625rem / 10px *(doc: 12px)* | 0.75rem / 12px | 155% | Micro text, fine print |
| Overline | `text-overline` | 1.25rem / 20px | 1.375rem / 22px | 155% | Category labels, tags (uppercase) |
| Button | `text-button` | 1rem / 16px | 1rem / 16px | 142% → 140% | CTA text, navigation |

### 2.3 Text color shortcuts

```html
<p class="text-neutral-black">Primary text</p>
<p class="text-neutral-gray-6">Secondary text</p>
<p class="text-brand-pax-green">Brand text</p>
<p class="text-system-error">Error text</p>
```

---

## 3. Spacing

The base scale is `--size-N` (rem). The Tailwind `p-*`, `m-*` and `gap-*` utilities map to `--spacing-padding-*`, `--spacing-margin-*` and `--spacing-gap-*`. Some of these are **responsive**: smaller on mobile (< 1024px), larger on desktop.

### 3.1 Padding scale (`p-*`)

| Class | Mobile | Desktop | Type |
|---|---|---|---|
| `p-0` | 0 | 0 | static |
| `p-px` | 1px | 1px | static |
| `p-0.5` | 2px | 2px | static |
| `p-1` | 4px | 4px | static |
| `p-1.5` | 6px | 6px | static |
| `p-2` | 8px | 8px | static |
| `p-2.5` | 10px | 10px | static |
| `p-3` | 12px | 12px | static |
| `p-4` | 16px | 16px | static |
| `p-5` | 16px | 20px | responsive |
| `p-6` | 20px | 24px | responsive |
| `p-7` | 24px | 28px | responsive |
| `p-8` | 28px | 32px | responsive |
| `p-10` | 32px | 40px | responsive |
| `p-12` | 36px | 48px | responsive |
| `p-14` | 40px | 56px | responsive |
| `p-16` | 64px | 64px | static |
| `p-20` | 80px | 80px | static |
| `p-24` | 96px | 96px | static |
| `p-28` | 56px | 112px | responsive |
| `p-32` | 128px | 128px | static |
| `p-36` | 144px | 144px | static |
| `p-40` | 160px | 160px | static |
| `p-48` | 96px | 192px | responsive |
| `p-64` | 160px | 256px | responsive |
| `p-80` | 192px | 320px | responsive |

### 3.2 Gap scale (`--spacing-gap-*`)

| Token | Mobile | Desktop |
|---|---|---|
| gap-1 | 4px | 4px |
| gap-2 | 8px | 8px |
| gap-3 | 12px | 12px |
| gap-4 | 16px | 16px |
| gap-6 | 20px | 24px |
| gap-8 | 24px | 32px |
| gap-10 | 24px | 40px |
| gap-12 | 28px | 48px |
| gap-16 | 32px | 64px |
| gap-20 | 36px | 80px |
| gap-24 | 40px | 96px |
| gap-28 | 48px | 112px |

### 3.3 Margin scale (`--spacing-margin-*`)

| Token | Mobile | Desktop |
|---|---|---|
| margin-1 | 4px | 4px |
| margin-2 | 8px | 8px |
| margin-6 | 24px | 24px |
| margin-8 | 32px | 32px |
| margin-20 | 24px | 80px |
| margin-24 | 64px | 96px |
| margin-48 | 96px | 192px |

### 3.4 Raw size scale (`--size-*`, static)

`0`=0, `px`=1px, `0-5`=2px, `1`=4px, `1-5`=6px, `2`=8px, `2-5`=10px, `3`=12px, `4`=16px, `5`=20px, `6`=24px, `7`=28px, `8`=32px, `9`=36px, `10`=40px, `12`=48px, `14`=56px, `16`=64px, `20`=80px, `24`=96px, `28`=112px, `32`=128px, `36`=144px, `40`=160px, `48`=192px, `64`=256px, `80`=320px.

### 3.5 Spacing guidelines

- **0–4:** static fine-tuned spacing for dense layouts and precise details
- **5–14:** responsive component spacing (scales automatically between mobile and desktop)
- **16–24:** static large component spacing for consistent sizing
- **28–80:** mixed responsive/static extra-large spacing for layouts
- **Responsive spacing:** layout containers, sections, cards that need mobile optimization
- **Static spacing:** UI details, borders, icons, buttons that need consistent sizing

---

## 4. Borders & Radius

### 4.1 Stroke widths

| Token | Tailwind | Value |
|---|---|---|
| `--stroke-border` | `border-border` | 0.075rem (≈1.2px; documented as "standard, 1px") |
| `--stroke-xs` | `border-xs` | 0.075rem (1.2px) |
| `--stroke-s` | `border-s` | 0.1rem (1.6px) |
| `--stroke-m` | `border-m` | 0.125rem (2px) |
| `--stroke-button-border` | — | 0.1rem (1.6px) |
| `--stroke-focusring` | `border-focusring` | 0.125rem (2px) |
| `--stroke-icon-xs` / `-s` / `-m` | — | 0.075 / 0.1 / 0.125rem |

Guidelines: `border-xs` / `border-s` for subtle decorative borders; `border-m` for standard component borders; `border-focusring` for accessibility focus indicators.

### 4.2 Radius

| Token | Tailwind | Mobile | Desktop |
|---|---|---|---|
| `--radius-none` | `rounded-none` | 0 | 0 |
| `--radius-sm` | `rounded-sm` | 4px | 4px |
| `--radius-m` | `rounded-m` | 10px | 10px |
| `--radius-xl` | `rounded` / `rounded-xl` | 16px | 20px |
| `--radius-full` | `rounded-full` | pill (62.5rem) | pill |

---

## 5. Icons

| Token | Size |
|---|---|
| `--icon-icon-s` | 1.25rem (20px) |
| `--icon-icon-m` | 1.5rem (24px) |
| `--icon-icon-l` | 2rem (32px) |
| `--icon-icon-xl` | 3.5rem (56px) |

---

## 6. CSS variable usage example

```css
.custom-component {
  background-color: var(--background-brand);
  color: var(--text-inverse);
  border: var(--stroke-border) solid var(--border-soft);
  border-radius: var(--radius-m);
  padding: var(--size-4) var(--size-6);
}
```

## 7. Theming

- By default it follows the system `prefers-color-scheme`.
- Manual override: `document.body.setAttribute('data-theme', 'dark' | 'light')`.
- Semantic tokens switch automatically, for example:
  - `text-default`: black in light, white in dark
  - `bg-muted`: light gray in light, dark gray in dark
  - `border-soft`: light border in light, darker border in dark

## 8. Accessibility

- All color tokens are documented as meeting WCAG 2.1 AA contrast.
- Text on backgrounds meets the 4.5:1 minimum.
- System state colors use appropriate contrast for readability.
- Focus indicators (`--border-focusring`, Pax green, 2px) are designed to stay visible.
- Dark-mode tokens keep the same accessibility standards.

---

## 9. Component library (`@paxch/pax-ui`)

| Category | Components |
|---|---|
| Buttons | Button |
| Cards | Feedback Card, Image Card, Quick Access Card, Wide Card |
| Containers | Accordion, Content |
| Dialog | Dialog, Confirm Dialog, Confirm Warning Dialog, Feedback Dialog |
| Forms | Autocomplete, Button Group, Button Toggle, Checkbox, Checkbox Group, Counter, Date Input, Date Picker, Date Range Picker, File Upload, Input, OTP, Radio Group, Select, Slider, Switch, Textarea |
| Information | Info Box, Notification, Toast Container, Tooltip |
| Lists | Feature List, List Item |
| Navigation | Header, Header Mobile, Footer, Breadcrumb, Bottom Navigation, Fullscreen Menu, Progress Steps |
| Overlay | Popover, Popover List Item |
| Sections | Hero |
| Misc | Spinner |
| Analytics | Cookie Banner, Google Tag Manager setup, consent service |

Likely useful for the advisor: **Progress Steps** (advisory journey), **Feedback Card / Feedback Dialog** (NPS), **Slider / Counter** (scenario inputs), **Info Box / Notification** (risk hints, handover to a human advisor), **Cookie Banner + ConsentService** (DSG consent).

### 9.1 Installation (Angular)

Requirements: Node ≥ 18, npm ≥ 9 (or pnpm 8+ / yarn 1.22+), Angular 19 or 20, TypeScript ≥ 5. Optional: `ngx-mask` ≥ 18 for input masks.

The package is on the **GitHub Package Registry** and needs access to the Pax GitHub org plus a token with `read:packages`.

```ini
# .npmrc
@paxch:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

```bash
npm install @paxch/pax-ui
```

Configure `angular.json` (in both `build` and `test`):

```json
"styles": ["node_modules/@paxch/pax-ui/styles/pax-ui.css", "src/styles.scss"],
"assets": [
  "src/favicon.ico",
  "src/assets",
  { "glob": "**/*", "input": "node_modules/@paxch/pax-ui/assets", "output": "/" }
]
```

Tailwind integration:

```js
const paxUIConfig = require('@paxch/pax-ui/tailwind.theme.js');
module.exports = {
  content: ['./src/**/*.{html,ts}', './node_modules/@paxch/pax-ui/**/*.{html,js}'],
  theme: { extend: { ...paxUIConfig.theme.extend } },
  plugins: [...paxUIConfig.plugins]
};
```

Standalone component imports (tree-shakable):

```ts
import { ButtonComponent } from '@paxch/pax-ui/buttons';
import { InputComponent } from '@paxch/pax-ui/forms';
import { ImageCardComponent } from '@paxch/pax-ui/cards';
// <pax-button variant="default">, <pax-input label="Name" [(ngModel)]="name">, <pax-image-card>
```

Input masks are set through `[maskConfig]` on `pax-input`, which takes any ngx-mask option.

Optional analytics: `providePaxUiAnalytics({ platform_env, application_name, debug, cookieDomain })` from `@paxch/pax-ui/analytics`, plus `<pax-cookie-banner>` with `ConsentService`. The consent categories are `ad_storage`, `analytics_storage`, `functionality_storage`, `security_storage` (always true) and `personalization_storage`.

The bundled CSS is a single minified file (~61 KB).

> **Hackathon note:** if we can't get registry access, or we don't use Angular, we can rebuild the look with the tokens above (CSS variables / Tailwind theme). The Civil Premium font is licensed. Use the fallback stack unless Pax provides the font files.
