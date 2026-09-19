# Product design direction

TheFastestWeb is a performance directory and founder community. The interface is a timing instrument for the web: precise, high contrast, and built around real measurements. The reference implementation is the home page (`src/app/page.tsx`), the shell (`Nav`, `Footer`) and `src/app/globals.css`. Read those before designing a new surface.

The September 2026 refinement takes the discovery-first clarity of [IndieTools](https://www.indietools.app) and [ScrollLaunch](https://scrolllaunch.com) as a reference. Design variance 6, motion 3, density 6: readable product lists, compact navigation and useful filters. It uses the existing Tailwind 4 and Phosphor foundation. The public directory and account workflows share tokens; marketing animation patterns do not govern the dashboard or data tables.

## Concept: the chronograph

The subject is measured speed, so the visual language comes from timing instruments: a rule of tick marks, a needle, tabular numerals. Two things carry the identity and everything else stays quiet.

1. Expanded display type. Mona Sans runs wide (`font-stretch` 112 to 125%) and tight in headlines, and at normal width in body copy. One family, two voices.
2. The 0 to 100 tick rule. Detailed scores use filled ticks (`ScoreTicks`), and the same rule (`.tick-rule`) closes the brand panel. Directory rows keep a plain numeric score for scanning.

Brand yellow is a fill, never a text color. It appears on the primary button, the brand panel, hover highlights and the needle. Text accents use the gauge's deep orange in light mode and yellow in dark mode (`text-accent`), and they are used sparingly.

## Tokens

All colors are semantic CSS variables in `globals.css`, mapped to Tailwind utilities. Never hardcode a hex value in a component.

| Utility | Meaning |
| --- | --- |
| `bg-bg-deep` | Page canvas |
| `bg-bg-main` | Raised surface: panels, inputs, menus |
| `bg-bg-card`, `bg-bg-card-hover` | Quiet fill and its hover |
| `bg-bg-elevated` | Overlays |
| `border-border`, `border-border-light` | Hairline and stronger line |
| `text-text-primary`, `text-text-secondary`, `text-text-muted` | Ink levels. All pass WCAG AA on every surface above |
| `text-accent`, `text-accent-bright` | Text accent |
| `bg-brand`, `text-on-brand` | Brand yellow fill and the ink that sits on it |
| `text-green`, `text-orange`, `text-red` with `bg-green-dim`, `bg-orange-dim`, `bg-red-dim` | Score bands: 90+, 50 to 89, below 50 |

Neutrals are cool graphite in both themes. Every surface follows the active theme: the owner rejected panels that stay dark in light mode, so do not pin a subtree with `data-theme="dark"`.

Category accents: `data-category="saas|tool|directory|blog|ecommerce|portfolio|other"` sets `--card-accent` on an element. It stays secondary (`.site-row` mixes 1.5% into the surface, 4% on hover), never as a text color.

Radii: 12px for buttons, inputs and icon controls; 9px for chips and navigation; 16px for directory rows; 22px for panels; 28px for feature surfaces. Inner elements are tighter than their container. Existing compact data labels may remain pills.

Elevation: `shadow-panel` for resting panels, `shadow-pop` for menus, dialogs and the hero board. Shadows are tinted, never plain black. Most content sits directly on the canvas with hairlines, not in cards.

Type: `font-mono` (Geist Mono) is for measured values only: scores, timings, ranks, counts. Use `.stat-value` for them. Labels, eyebrows and navigation are never mono and never uppercase.

## Component classes

- `.page-shell` page padding. `.page-title` h1. `.section-title` h2. `.page-description` lead paragraph.
- `.page-eyebrow` small sentence-case label with the needle mark. Use it only where a label adds information; most headings do not need one.
- `.button-primary` (yellow, one per view), `.button-secondary` (outline), `.button-ink` (solid ink; the only button allowed on a brand surface), `.link-underline` (text link with a yellow rule that fills on hover), `.icon-button`.
- `.panel` raised surface. `.panel-quiet` flat tinted surface. `.surface-brand` yellow surface with pinned dark ink.
- `.chip` filter or tag; `aria-current="page"`, `aria-pressed="true"` or `.chip-active` marks the selected one.
- `.form-field` inputs, selects and textareas. Labels stay visible above the field.
- `.monogram` letter tile that stands in for a site icon. `monogram(name)` in `WebsiteList` returns the letter.
- `.stat-value`, `.tick-rule`, `.score-ticks` (through `ScoreTicks`), `.dot-grid`, `.kbd`.
- `scoreTone(score, measured)` returns the band text color for a score.
- `WebsiteList` uses horizontal rows, each a single link, with columns shared through `.site-grid`: position, identity and description, category, score, LCP. Real favicons load lazily with a visible letter fallback. Detailed score instruments belong in reports rather than every directory row.
- `DirectoryFilters` is the control strip above a website list: a name filter, `FacetMenu` popovers (score, technology, country, sort), category chips with accent dots, and removable chips for what is applied. All state lives in the URL; the home page (`/`) and `/explore` read the same parameters.
- `CommandPalette` (in `Nav`) is the product-wide search: Ctrl K, Cmd K or `/`. It queries `/api/search` for websites and also lists categories, pages and actions. `SearchTrigger` renders a field look-alike that opens it.

## Layout

- Content width is 1240px with `px-5 sm:px-8`. Sections are separated by generous space (`pb-20 sm:pb-28`), not by borders or alternating backgrounds.
- Left aligned. Headlines sit on their own row; supporting copy and actions share the row beneath. Avoid centered hero blocks and rows of three identical cards. Prefer asymmetric grids, definition lists, tables and large type lists.
- The home page opens with a compact product introduction and real directory/category counts, followed by filters and twelve websites. The full directory keeps pagination. This keeps the rankings introduction, journal and footer within a reasonable scroll distance.
- The header is a 76px sticky product bar. At narrow widths the compact brand icon leaves room for search, theme and navigation. Footer links form three clear groups with the required legal and contact destinations.
- Other data is tabular. Use native tables with `table-fixed`, a `colgroup`, hairline rows, a rank in `.stat-value`, and the score as the loudest element of the row.
- Sponsor rails (from 2xl) hold six spots a side: sold spots first, then open spots that lead to `/pricing`.
- Use `min-h-[..dvh]`, never `h-screen`.

## Motion

One page-load moment per page at most. Everything else answers the user: hover, press (`scale(.98)`), open, close. Animate `transform` and `opacity` only. `prefers-reduced-motion` is honored globally.

## Writing

Sentence case everywhere. Plain verbs. An action keeps one name across the product: "Submit website", "Test a site", "Explore websites". No separators made of middle dots, no arrows typed into labels (use a Phosphor icon), no exclamation marks. Empty and error states say what happened and what to do next.

## Guardrails

- Both themes, 320px to 1600px, keyboard focus visible, no horizontal overflow, exactly one `h1` per page. Short landscape menus must scroll internally; search results must match the current query.
- `npm run test:public` runs axe (WCAG 2.1 AA) over the public routes in light and dark. Muted text on tinted fills is the usual failure: check contrast when you put `text-text-muted` on anything other than the canvas, `bg-bg-main` or `bg-bg-card`.
- Icons are Phosphor (`@phosphor-icons/react/dist/ssr` in server components), one weight per context.
- No fabricated scores, testimonials or telemetry. Advertising stays labelled and visually secondary.
- Existing URLs, structured data, form names, labels and server actions are preserved by any visual change.
