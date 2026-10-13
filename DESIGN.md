---
name: ChatPort
description: A local transfer desk for selecting conversations and checking their arrival.
colors:
  paper: "#f5f6f2"
  surface: "#fff"
  ink: "#1e332b"
  muted: "#53645b"
  rule: "#dbe2da"
  green: "#236347"
  selected: "#edf4ec"
  amber: "#795319"
  danger: "#9c3434"
  action-hover: "#174e36"
  field-rule: "#a5b4a6"
  focus-ring: "#659379"
  disabled-background: "#e3e8e0"
  disabled-rule: "#c4cec2"
  disabled-ink: "#425448"
typography:
  display:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(28px, 3.5vw, 42px)"
    fontWeight: 600
    lineHeight: 1.17
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  helper:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  action:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  control:
    fontFamily: '"DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  field: "5px"
  control: "6px"
  panel: "12px"
spacing:
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  "28": "28px"
  "32": "32px"
  "40": "40px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-migrate:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 9px"
    width: "100%"
  button-migrate-disabled:
    backgroundColor: "{colors.disabled-background}"
    textColor: "{colors.disabled-ink}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-outline-hover:
    backgroundColor: "{colors.selected}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.green}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
  button-quiet-hover:
    backgroundColor: "{colors.selected}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
  navigation:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "24px 40px"
  status:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  status-verified:
    textColor: "{colors.green}"
  status-needs-review:
    textColor: "{colors.amber}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "22px"
  ledger-row:
    textColor: "{colors.ink}"
    padding: "14px 8px"
  ledger-row-selected:
    backgroundColor: "{colors.selected}"
  preview:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

# Design System: ChatPort

## Overview

**Creative North Star: "The Transfer Desk"**

ChatPort feels like a quiet working desk: pale paper, dark green ink, a conversation ledger, and clear white panels for the account connection, preview, and migration controls. The metaphor describes the shipped interface and the code-led direction contract; it is not a record of a user-selected visual comp.

The visual hierarchy gives most space to real conversation titles and their evidence. Compact labels, dates, and controls support this work without becoming a second visual narrative. Green identifies action and verified progress, while amber identifies outcomes that need checking. Depth comes from surface tone and thin rules.

**Key Characteristics:**

- Paper background with dark green text and restrained green actions.
- Squared, ruled conversation rows with a pale selected state.
- Flat white panels with gently curved corners.
- Compact bilingual controls, tabular dates and counts, and visible keyboard focus.
- An adjacent desktop preview that stacks between the ledger and migration desk on mobile.

## Colors

The palette keeps the working surface quiet and gives state a readable, limited accent vocabulary. The frontmatter preserves the stylesheet's values and is the normative color source.

### Primary

- **Action Green** (`green`): primary buttons, links, checked controls, verified states, and progress fill.
- **Deep Action Green** (`action-hover`): hover on filled actions.
- **Selected Paper** (`selected`): selected ledger rows, the selected count, quiet-button hover, and non-error notices.
- **Focus Green** (`focus-ring`): the shared keyboard-focus outline.

### Secondary

- **Checking Amber** (`amber`): uncertain and failed migration statuses, and media review warnings.
- **Error Red** (`danger`): error notice text; errors retain explanatory copy rather than relying on color.

### Neutral

- **Desk Paper** (`paper`): the page canvas.
- **White Surface** (`surface`): account, preview, and migration panels, fields, and text on filled buttons.
- **Green Ink** (`ink`): primary text, titles, and outlined-action text.
- **Quiet Ink** (`muted`): labels, dates, hints, and supporting text.
- **Paper Rule** (`rule`): row separators, panel boundaries, and internal dividers.
- **Field Rule** (`field-rule`): form-control and outlined-button borders.
- **Disabled Paper**, **Disabled Rule**, and **Disabled Ink** (`disabled-background`, `disabled-rule`, `disabled-ink`): the migration action's explicit disabled state.

### Named Rules

**The Evidence Color Rule.** Keep verification and uncertainty colors attached to readable status text; a green mark alone does not communicate the result.

## Typography

**Display Font:** DM Sans, with PingFang SC, Microsoft YaHei, and sans-serif fallbacks.
**Body Font:** the same stack. The shipped local WOFF2 face declares regular weight; the browser supplies the heavier requested weights.
**Label/Mono Font:** the same stack, with tabular numerals for dates and counts. Preview text also uses the body family rather than a separate monospace face.

**Character:** one compact sans-serif voice carries the interface. Weight, size, spacing, and muted color distinguish task headings, conversation titles, and metadata.

### Hierarchy

- **Display:** the fluid `display` role is used for the introduction, with balanced wrapping.
- **Headline:** the `headline` role identifies ledger and migration sections. The preview heading is smaller (17px) in its adjacent panel; narrow-screen ledger headings use (19px).
- **Title:** the `title` role identifies conversation rows. On the narrow breakpoint it reduces to (13px). Account identities use (17px), then (15px) and (13px) at the smaller breakpoints.
- **Body:** the `body` role is the page baseline. Paragraphs cap at (72ch); the introduction's supporting line uses a more open line height (1.7).
- **Helper:** the `helper` role carries catalog counts and supporting copy. Longer desk instructions use line height (1.7).
- **Label:** the `label` role carries field labels, dates, statuses, and footnotes. Row metadata uses tabular numerals and a gap below its title (5px).
- **Action / Control:** regular actions use `action`; compact actions and the full-width migration button use `control`. Both use semibold weight and a compact line height.

### Named Rules

**The One Voice Rule.** Keep UI text and conversation previews in the same font stack; hierarchy comes from the observed roles rather than a new display or mono family.

## Layout

The outer container caps at (1440px). Desktop navigation uses horizontal padding (40px), and the main content uses the same horizontal inset. The account strip is a white grid panel above the workspace. The conversation ledger uses repeated rows and aligned filters rather than individual cards.

The default desktop workspace has a flexible ledger and a migration desk (320px) separated by a gap (32px). Opening a preview creates three columns: flexible ledger, preview `minmax(280px, 0.85fr)`, and the same desk (320px), with gaps (24px). The preview and desk remain visible together; each is sticky at (20px) from the top. The preview scrolls internally within `calc(100dvh - 40px)`.

At the medium breakpoint (1100px), outer horizontal padding becomes (24px), account guidance moves below the two identities, and filters place search above two select fields. Without preview, the desk narrows to (295px). With preview, ledger and preview share two columns and the migration desk spans the next row.

At (800px), the workspace becomes one column. An open preview sits after the ledger and before the migration desk. Both panels become static, and the preview's maximum height is (600px). At (480px), horizontal page padding becomes (18px), account content and row spacing become tighter, dates wrap as needed, and the footer stacks. The secondary header note hides at this breakpoint to preserve room for the brand and controls.

The spacing vocabulary is intentionally compact inside controls and rows, with larger reused steps between major regions. Conversation rows have minimum height (72px), padding (14px 8px), and gaps (12px); narrow rows use padding (13px 3px) and gaps (9px). Long titles, email addresses, and preview text wrap within their region.

## Elevation & Depth

The shipped interface has no shadows. White panels sit against the paper canvas, bounded by thin rules (1px). Selected rows use a tonal background, not a raised surface. Sticky positioning keeps working evidence accessible without implying visual elevation.

### Named Rules

**The Flat Desk Rule.** Preserve tone and thin rules as the depth vocabulary; the incumbent system does not use shadow elevation.

## Shapes

Fields and progress tracks use the `field` radius. Buttons, notices, and the selected-count square use the `control` radius. Account, preview, and migration panels use the larger `panel` radius. Ledger rows stay squared and separated by bottom rules. Status dots are small circles (6px); the count remains a compact square (31px high) with gently curved corners.

Icons are authored inline stroke SVGs. They use round caps and joins, generally with stroke width (1.8); the brand symbol uses (2). Search, transfer direction, verification, and the GitHub external-link marker each have an actual SVG shape in the interface.

## Components

### Buttons

Filled actions are compact and direct. The primary variant uses Action Green, White Surface text, the control radius, and its documented padding. Hover deepens the green. The migration action uses the same language at full width with compact typography; its disabled state uses the three explicit disabled tokens and retains full opacity. Other disabled buttons use opacity (0.5).

Outlined actions use transparent fill, Green Ink, and a Field Rule border. Quiet actions remove the visible border and use green text. Both gain Selected Paper on hover. On mobile, account and catalog controls tighten their padding and allow their labels to wrap. No transform or pressed animation is defined.

### Status Marks

Status is inline text accompanied by a dot, not a pill or detached decoration. Neutral text and a muted dot describe an unmigrated item. Verified text and dot use green; uncertain and failed text and dot use amber. In-progress text uses green while retaining the default dot. Always preserve the readable status label.

### Cards / Containers

Work panels use White Surface, the panel radius, and a Paper Rule border. The account panel uses padding (23px 24px), the migration desk uses its `panel` padding, and the adjacent preview uses its `preview` padding. Internal sections are divided with rules. The panels do not gain hover lift.

### Inputs / Fields

Fields use White Surface, Green Ink, a Field Rule stroke, the field radius, and the `field` padding. Form text inherits the UI family. Search adds an inline SVG and places its border on the surrounding field; its input has no separate border. Checkbox controls are native (17px square), use the shared green accent, and retain their visible focus treatment. Multi-line messages resize vertically. The implementation has no distinct invalid-field visual variant; errors appear as explanatory notices or receipt copy.

### Navigation

The header is a restrained horizontal strip bounded below by a rule. The brand combines its transfer SVG with a bold wordmark (23px, reducing to 21px on narrow screens). The local note occupies spare width, and the language control and GitHub link sit at the trailing edge. The external marker is an inline SVG. Links stay green with offset underlines; hover thickens the underline.

### Conversation Ledger and Preview

Each ledger row aligns a native selection checkbox, wrapping title and date metadata, status, and an optional receipt action. Hover provides a light tonal change, while a selected row retains Selected Paper. Title hover adds an underline; selection and preview remain separate controls. Selection survives filter changes, and selected marks and the count describe the same set.

The adjacent preview preserves the ledger and selection desk in view on wide screens. Its title and close action share a heading row, followed by ruled message blocks. Role labels remain muted; message text wraps, preserves line breaks, and uses a generous line height (1.8). Narrow and adjacent previews stack role labels above the text. Receipts reuse the same panel and status language rather than introducing a new visual system.

### Focus and Motion

Buttons, links, fields, selects, textareas, and disclosure summaries share a Focus Green outline (3px) offset by (3px). Ledger background transitions use duration (0.22s) and the source easing `cubic-bezier(0.16, 1, 0.3, 1)`. Reduced-motion preference disables transitions and animations and restores automatic scroll behavior.

## Do's and Don'ts

### Do:

- **Do** use the frontmatter palette roles for task actions, selection, evidence, and uncertainty.
- **Do** keep conversation titles readable with wrapping, ruled rows, and tabular dates and counts.
- **Do** preserve the visible keyboard-focus outline on interactive controls.
- **Do** place an open preview beside the ledger on wide screens and between the ledger and migration desk in the stacked layout.
- **Do** use tone, thin rules, and the observed radius roles to distinguish work panels.

### Don't:

- **Don't** communicate a migration result using color without its status text.
- **Don't** replace the ruled conversation ledger with independently raised cards.
- **Don't** hide the selected set or its count when the user opens a preview or changes filters.
- **Don't** remove the reduced-motion treatment when extending interaction states.

Not canonized: no unresolved visual defect was carried into these rules. The reviewed source and current desktop/mobile captures agree; this pass documents them and does not repair UI code. Synthetic screenshot origins are embedded in the shipping PNGs under `docs/screenshots/`.
