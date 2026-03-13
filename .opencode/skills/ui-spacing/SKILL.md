---
name: ui-spacing
description: >
  Apply professional UI spacing principles to any interface design. Use this skill
  whenever the user asks about spacing, padding, margins, gaps, layout balance,
  or visual grouping in UI/UX design. Also trigger when the user asks why their
  design "looks off", "feels cluttered", "seems unbalanced", or wants to improve
  the visual hierarchy of a UI. Covers rem-based spacing systems, optical weight,
  grouping principles, button padding, vertical vs horizontal spacing, and how to
  fix tight or inconsistent layouts. Use even if the user just says "help me with
  spacing" or "my design doesn't look right".
---

# UI Spacing Skill

A practical guide to applying professional spacing to any UI, based on proven
design principles. Follow this system to group elements, create hierarchy, and
produce clean, balanced interfaces.

---

## Core Philosophy

**Spacing is for grouping and separating.** Its primary role is to help users
navigate the interface — making it clear which elements belong together and
which are distinct. Every spacing decision should serve this purpose.

**Consistency first.** Even if the value isn't perfect, consistent spacing
throughout a design makes it coherent. Inconsistent spacing will always look
worse than a consistently "wrong" value.

**Start big, reduce if needed.** Never start with a small value like `0.5rem`
and increase. Start with something generous like `1.5rem` and reduce. A little
extra whitespace only improves readability; tight spacing actively hurts UX.

---

## The Spacing System

Use `rem` units, not pixels. This ensures spacing scales with font size and
stays consistent across font sizes and screen densities.

### Base increments

```
0.25rem  =  4px   (micro — rare)
0.5rem   =  8px   (tight grouping, closely related elements)
0.75rem  = 12px   (compact spacing)
1rem     = 16px   (default — most gaps and padding)
1.25rem  = 20px   (comfortable inner spacing)
1.5rem   = 24px   (group separation)
2rem     = 32px   (section separation)
3rem     = 48px   (large outer padding)
```

### Three values that cover 90% of use cases

- `0.5rem` — closely related elements (title + subtitle, icon + label)
- `1rem` — same-group elements, button padding, inner spacing
- `1.5–2rem` — between distinct groups or sections

---

## Step-by-Step: How to Space a UI

### Step 1: Break the UI into groups

Identify which elements belong together logically. Label them as Group 1,
Group 2, etc. Elements in the same group share the smallest spacing; spacing
_between_ groups is always larger.

### Step 2: Apply smallest possible space within each group

Start with `0.5rem` for tightly related elements (e.g., heading and its
paragraph). If elements feel cramped, increase to `1rem`.

### Step 3: Separate groups with larger spacing

Add `1.5rem` or `2rem` between distinct groups. The inter-group gap must
always be visually larger than the intra-group gap.

### Step 4: Set outer padding generously

For card/section containers, start with `2rem` outer padding and reduce if
needed. Outer padding should feel like breathing room, not a tight frame.

### Step 5: Apply optical balancing (see below)

---

## Optical Weight & Padding Rules

### Horizontal > Vertical padding for buttons

Text has more visual noise horizontally (varying letter widths like U vs W).
Vertical space is constrained by cap-height and descenders. Equal padding
makes buttons look bloated.

**Rule:** Vertical padding should be smaller than horizontal padding for
horizontal elements (buttons, chips, tags).

```
Good: padding: 0.5rem 1rem;   /* vert smaller than horiz */
Bad:  padding: 1rem 1rem;     /* equal — looks bloated */
```

For elements with many vertical items (lists, stacked cards), increase
vertical padding to `1.25rem` so content has room to breathe.

### Inner spacing < outer spacing (always)

The space _inside_ a button (between icon and label) must always be smaller
than the button's own padding.

```
Good: gap: 0.5rem; padding: 1rem 1.5rem;
Bad:  gap: 1rem;   padding: 0.5rem 1rem;  /* inner > outer = ugly */
```

You may use equal inner and outer spacing if needed, but **never** let inner
spacing exceed outer spacing.

---

## Grouping Decision Guide

| Relationship                     | Spacing to use             |
| -------------------------------- | -------------------------- |
| Same element parts (icon + text) | `< 1rem` (e.g., `0.5rem`)  |
| Items in same group              | `0.5–1rem`                 |
| Between groups / sections        | `1.5–2rem`                 |
| Outer container padding          | `1.5–2rem` (start at 2rem) |
| Between major page sections      | `2–3rem`                   |

---

## Fixing a Tight / Inconsistent Layout

1. **Audit:** Identify which spacing value is being used everywhere. If it's
   the same value (e.g., `0.5rem`) applied uniformly, that's why it looks flat.
2. **Group:** Break the UI into logical groups (don't space yet).
3. **Set outer padding first:** Add generous outer padding (2rem) to each
   section container.
4. **Inner group spacing:** Apply `0.5rem` within groups, `1rem` between
   group items.
5. **Inter-group separation:** Add `1.5–2rem` between distinct groups.
6. **Balance alignment:** Use `space-between` (justify-content) instead of
   fixed gaps where elements need to span the full width.
7. **Check optical weight:** Ensure buttons and inputs have correct
   vertical/horizontal padding ratios.
8. **Equal height alignment:** If a section has items of unequal height
   (e.g., a toggle next to dropdowns), manually set a fixed height so spacing
   feels balanced.

---

## Border Radius + Spacing Harmony

Spacing values double as great border-radius values. If you use `1rem`
padding, try `0.5rem`, `1rem`, or `1.5rem` border-radius for optically
balanced corners. These values pair naturally because they come from the same
base unit.

---

## Common Mistakes to Avoid

- ❌ Starting with tight values and trying to increase — always start bigger
- ❌ Equal spacing between unrelated groups — collapses hierarchy
- ❌ Inner button gap larger than outer padding — looks broken
- ❌ Equal vertical and horizontal padding on wide buttons — looks bloated
- ❌ Inconsistent values everywhere — use the system, pick from the scale
- ❌ Guessing random pixel values — use 0.25rem increments

---

## Quick Reference Cheat Sheet

```
Section outer padding:     2rem (start here, reduce to 1.5rem if needed)
Between sections:          2rem
Between groups in section: 1.5rem
Between items in group:    1rem
Tightly related elements:  0.5rem
Button: vertical padding:  0.5rem
Button: horizontal padding: 1–1.5rem
Button: icon-to-text gap:  0.5rem (always < padding)
```
