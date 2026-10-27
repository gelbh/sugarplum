---
name: Sugarplum
description: Dual-register study PWA — night plum stage for zen recall, sugar-dust monochrome for operate.
colors:
  plum: "#5B2C6F"
  amber: "#C4A574"
  stage: "#1e0d1b"
  stage-deep: "#180816"
  ivory: "#e8d8c7"
  sugar-dust: "#F5F5F5"
  paper: "#FFFFFF"
  shell-fg: "#F5F5F5"
  shell-muted: "rgba(245, 245, 245, 0.62)"
  shell-hairline: "rgba(232, 216, 199, 0.16)"
  lamp-glow: "rgba(196, 165, 116, 0.28)"
  plum-wash: "rgba(91, 44, 111, 0.28)"
  plum-wash-hover: "rgba(91, 44, 111, 0.38)"
  text-secondary-light: "rgba(30, 13, 27, 0.72)"
  divider-light: "rgba(30, 13, 27, 0.12)"
  text-secondary-stage: "rgba(232, 216, 199, 0.78)"
  divider-stage: "rgba(232, 216, 199, 0.16)"
typography:
  display:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "clamp(5.5rem, 12vw, 8rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  brand:
    fontFamily: '"Alice", "Georgia", "Times New Roman", serif'
    fontSize: "1.25rem"
    fontWeight: 400
    letterSpacing: "0.02em"
  headline:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  card-prompt:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "1.35rem"
    fontWeight: 400
    lineHeight: 1.35
  card-answer:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "1.2rem"
    fontWeight: 400
    lineHeight: 1.45
  card-overline:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.22em"
  label:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 400
    letterSpacing: "0.02em"
  nav-label:
    fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif'
    fontSize: "0.7rem"
    fontWeight: 500
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  drawer: "220px"
  shell-bar: "56px"
  card-max: "360px"
components:
  button-primary:
    backgroundColor: "{colors.plum}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "12px 24px"
    typography: "{typography.title}"
  button-primary-large:
    backgroundColor: "{colors.plum}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "12px 24px"
    height: "48px"
  button-grade:
    backgroundColor: "transparent"
    textColor: "inherit"
    rounded: "{rounded.sm}"
    padding: "8px 4px"
    height: "56px"
  card-playing:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.stage}"
    rounded: "{rounded.lg}"
    padding: "24px"
    width: "{spacing.card-max}"
  shell-nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.shell-muted}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  shell-nav-item-selected:
    backgroundColor: "{colors.plum-wash}"
    textColor: "{colors.shell-fg}"
    rounded: "{rounded.sm}"
  paper-section:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.stage}"
    rounded: "{rounded.sm}"
    padding: "20px"
  due-proof:
    backgroundColor: "transparent"
    textColor: "{colors.stage}"
    typography: "{typography.display}"
---

# Design System: Sugarplum

## Overview

**Creative North Star: "Night Stage & Sugar Dust"**

Sugarplum is a dual-register product world. Operate (Today, Library, Settings, shell) lives on sugar-dust monochrome with a single fruit-plum accent. Zen Study leaves that desk and enters an evening plum stage lit by a soft amber lamp glow, with recall happening on a playing-card ivory face. Both registers share the same plum pigment and Source Sans 3 / Alice type pairing; they must never blend into one muddy middle.

The stack is Material UI plus a thin brand CSS skin (`brand.css`) that owns only stage and playing-card tokens. Density is calm and task-forward: Today is a giant due proof and one CTA; Study in zen strips chrome and centers the card; Library and Settings use outlined white papers on sugar dust. Fruity sugarplum materials show up as plum flesh, ivory card stock, and candied amber as lamp light / secondary only, not as a second accent flood.

Confirmed visual rejections: purple-on-white marketing gradients, cream-serif terracotta clusters, dashboard chrome painted onto zen stage, and inventing brand CSS beyond stage/card.

**Key Characteristics:**
- Dual register: zen Study = night stage + ivory card; Operate = sugar-dust + plum accent
- Shared fruit plum `#5B2C6F` as the only chromatic CTA / selection pigment
- Alice for brand wordmark (`h6`); Source Sans 3 everywhere else
- Playing-card aspect `5 / 7`, max width 360px, soft drop on the face
- App shell always night plum, independent of light/dark content scheme

## Colors

Fruit plum and evening stage ink carry the brand; sugar dust and ivory are the two papers.

### Primary
- **Fruit Plum** (`#5B2C6F`): Contained CTAs (Start study, Show answer), selected nav wash and left/top selection marks, section titles on outlined papers, non-zen Study heading. The only saturated chroma on operate surfaces.

### Secondary
- **Candied Amber** (`#C4A574`): Secondary palette role and zen lamp glow (`rgba(196, 165, 116, 0.28)` radial on `.sp-stage`). Not a second CTA color on sugar dust.

### Neutral
- **Sugar Dust** (`#F5F5F5`): Operate default background (light scheme `background.default`).
- **Paper White** (`#FFFFFF`): Outlined section papers and light `background.paper`.
- **Evening Stage** (`#1e0d1b`): Zen stage ground, shell drawer/bottom nav, light-scheme text ink (`text.primary` / plum ink).
- **Stage Deep** (`#180816`): Dark-scheme paper; amber contrast text target.
- **Playing-Card Ivory** (`#e8d8c7`): Card face fill and zen ivory copy (`--sp-card-face` / `--sp-ivory`); not global operate paper.
- **Shell Foreground** (`#F5F5F5`) / **Shell Muted** (`rgba(245, 245, 245, 0.62)`): Chrome labels on the night shell.
- **Shell Hairline** (`rgba(232, 216, 199, 0.16)`): Drawer/bottom-nav borders (ivory at low alpha).

### Named Rules
**The Dual Register Rule.** Operate stays sugar-dust monochrome with plum as accent. Zen Study is night stage + ivory card. Do not put ivory card faces on sugar dust, or sugar-dust panels on the stage.

**The One Plum Voice Rule.** On operate screens, chromatic plum occupies CTAs, selection, and section accents only. The field stays sugar dust, white paper, and plum ink.

**The Ivory Is Card Stock Rule.** `#e8d8c7` is the playing-card face (and zen chrome copy), never the global app paper.

## Typography

**Display Font:** Alice (with Georgia / Times New Roman)
**Body Font:** Source Sans 3 (with Helvetica / Arial)

**Character:** Alice is reserved for the Sugarplum wordmark (MUI `h6` in shell and zen title). Source Sans 3 carries UI, due proof, and card face copy: clear, tabular when counting, never decorative on the card.

### Hierarchy
- **Display / Due Proof** (700, clamp ~5.5–8rem, line-height 0.95, tracking −0.04em): Today’s due count only; tabular nums.
- **Brand** (Alice, ~1.25rem / `h6`, weight 400): Shell wordmark and centered zen “Sugarplum” title.
- **Headline** (Source Sans 600, MUI `h4` ~2.125rem): Operate page titles (Library, Settings, non-zen Study).
- **Title** (600, ~1rem): Paper section headings in plum; primary button labels.
- **Body** (400, 1rem): Supporting copy; secondary at ~72% plum ink on light.
- **Card Prompt** (400, ~1.125–1.35rem, line-height 1.35): Front face centered recall text.
- **Card Answer** (400, ~1.05–1.2rem, line-height 1.45): Back face.
- **Card Overline** (500, 0.6875rem, 0.22em uppercase, ~55% opacity): Front/Back labels on the card face only.
- **Label** (400, ~0.8125rem): Grade rail labels; captions for remaining count (uppercase + 0.06em on Study).

### Named Rules
**The Alice Wordmark Rule.** Alice appears on brand `h6` surfaces only. Card faces, due proof, and body UI stay Source Sans 3.

**The Due Proof Rule.** The giant number is the Today hero. Do not demote it into a chip strip or surround it with secondary marketing blocks.

## Layout

Operate and Study share MUI `Container` `maxWidth="sm"` as the reading column. Today vertically centers on desktop (`minHeight: calc(100vh - 32px)` with flex center). Study zen fills the viewport with tighter vertical padding (`py` 16–24px) and stacks card then grade rail. Card column maxes at 360px. Shell: permanent drawer 220px from `md` up; mobile bottom nav 56px with page `pb: 7`. MUI spacing unit 8px; common rhythm 8 / 16 / 24.

### Named Rules
**The Chrome Strip Rule.** Zen Study hides AppShell drawer and bottom nav (`hideChrome`). Leaving zen restores operate chrome.

## Elevation & Depth

Operate is mostly flat: outlined papers (`variant="outlined"`, divider border), elevation 0 on shell papers. Depth lives on the study card and the zen stage lamp.

### Shadow Vocabulary
- **Card Drop** (`box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35)`): Playing-card face only.
- **Stage Lamp** (radial ellipse ~70% × 55% at 50% 42%, amber glow → transparent): `.sp-stage` atmosphere, not a card shadow.

### Named Rules
**The Flat Operate Rule.** Dashboard and library surfaces do not borrow the card drop. Soft depth is for the physical card and the stage lamp.

## Shapes

Gentle MUI radii: 4px on nav items and grade ticks, 6px on the large Start study CTA, 8px on playing-card faces. Shell bottom bar is square (`borderRadius: 0`). Card geometry locks to aspect ratio `5 / 7` (standard playing card). Selection on desktop nav uses a 3px plum left bar; mobile selected tab uses a 2px plum top bar.

### Named Rules
**The Playing-Card Silhouette Rule.** Study recall lives in a `5 / 7` ivory face at ≤360px. Do not stretch it into a full-bleed content panel.

## Components

### Buttons
- **Shape:** Soft rectangle (6px on hero CTA; default MUI elsewhere; 4px on grade cells).
- **Primary:** Fruit plum fill, white (light) or ivory (dark scheme) contrast; Today Start study uses large size, weight 600, ~1.05rem, `py` 12 / `px` 24.
- **Grade rail:** Outlined cells, inherit color (ivory on stage), min-height 56px; swipe-direction icons (← Again · ↓ Hard · → Good · ↑ Easy) above label; desktop key chip; soft ivory hover wash.
- **Show answer:** Contained primary on the card face, Source Sans 3.

### Cards / Containers
- **Playing card:** Ivory face, stage ink type, 8px radius, 24px padding, drop shadow; 3D Y-flip 0.45s ease (opacity swap under `prefers-reduced-motion`).
- **Operate paper:** White, outlined, divider border, ~20px padding; section title in plum weight 600.
- **Stage:** Full-bleed `#1e0d1b` + lamp radial; ivory chrome copy.

### Chips
- **Study type chip (non-zen only):** Outlined, transparent fill, divider border, secondary text, height 24px. Hidden in zen.

### Navigation
- **Shell:** Always stage background, sugar-dust foreground, ivory hairlines. Selected: plum wash + plum edge mark. Brand row: logo 28px + Alice `h6`.
- **Mobile bottom nav:** Same night ground; selected label full shell-fg; 2px plum top border on selected action; label 0.7rem.

### Signature: Due Proof
Centered tabular count + “cards due” caption + single plum Start study when due > 0. No stage rail, no card chrome on this surface.

### Signature: Grade Rail
Four equal columns (Again / Hard / Good / Easy) with swipe-direction icons matching gestures, keys 1–4 as chips on desktop, swipe hints when shown. Inherits stage ivory in zen; no traffic-light grade colors.

## Do's and Don'ts

### Do:
- **Do** keep zen Study on `.sp-stage` with `.sp-playing-card` ivory faces and shell chrome stripped.
- **Do** keep Today / Library / Settings on sugar dust with plum as the sole accent CTA and section ink.
- **Do** use Alice only for Sugarplum wordmarks; Source Sans 3 for UI and card copy.
- **Do** preserve study behavior from the #19 session: reveal, FSRS grades 1–4, gestures, zen/fullscreen preference.
- **Do** limit custom CSS to stage/card tokens in `brand.css`; everything else through MUI theme / `sx`.

### Don't:
- **Don't** paint operate pages with stage backgrounds or ivory “card” panels as generic layout cards.
- **Don't** introduce a second saturate accent (amber stays lamp/secondary, not a peer CTA on sugar dust).
- **Don't** break playing-card aspect `5 / 7` or the 360px face cap for ordinary study prompts.
- **Don't** add marketing kickers, eyebrow stacks, or purple gradient hero treatments on operate or zen.
- **Don't** thicken the brand skin into a parallel design system beside MUI.
