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

**Every element is related to every other element** — even if only because
they share the same viewport. Relationships vary in strength. Stronger
relationships = closer proximity. Weaker relationships = more distance.
This is the foundation of information hierarchy.

**Consistency first.** Even if the value isn't perfect, consistent spacing
throughout a design makes it coherent. Inconsistent spacing will always look
worse than a consistently "wrong" value.

**Start big, reduce if needed.** Never start with a small value like `0.5rem`
and increase. Start with something generous like `1.5rem` and reduce. A little
extra whitespace only improves readability; tight spacing actively hurts UX.

**Don't eyeball it — eyeball with parameters.** Use a scaling system to give
yourself creative freedom within guardrails. You still make judgment calls, but
the system prevents bad decisions.

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

## The Three Laws of Spacing

1. **Every element is related to every other element.** Even distant elements
   share a relationship (they exist in the same viewport). Spacing should
   reflect the strength of each relationship.

2. **Stronger relationships = closer proximity.** Elements that belong to the
   same informational unit (e.g., an email subject and sender) should be
   closer together than elements with weaker relationships (e.g., an email
   heading and a sidebar nav item).

3. **Spacing must always be ordered: A > B > C.** When you have three levels
   of separation (e.g., space within a group, between groups, between
   sections), each level must be visibly larger than the last. Never let
   two levels look equal.

### Assessing relationship strength

Scan your design and ask: *what does this element belong to?*
- Same informational unit (heading + body of one card) → **strong** → very close
- Same feature area (all settings options) → **medium** → moderate spacing
- Different sections (navigation vs. content) → **weak** → large spacing

**Watch out for context shifts.** With placeholder content (Lorem ipsum),
relationships appear differently than with real content. Always test spacing
with real copy — the true relationships may be reversed from what the
placeholder suggested.

---

## Step-by-Step: How to Space a UI

### Step 1: Apply color grading (optional but helpful)
Assign a different visual weight or color to each level of the type hierarchy
(h1, h2, body, caption, etc.). This makes it much easier to spot the groups
and hierarchy at a glance.

### Step 2: Scan for relational pairs
Go through the design top to bottom and identify pairs of adjacent elements.
For each pair, ask: *is this a strong or weak relationship?*
- Title + subtitle → strong
- Subtitle + paragraph → medium
- Paragraph + next section heading → weak (new semantic section)

### Step 3: Apply spacing level-by-level using a scale
Start from the tightest pair and assign a spacing value from your scale.
Each subsequent weaker relationship gets a larger value. The key rule:
**each value must be larger than the previous.** You don't always need to
skip levels in the middle of a scale — but at the small end (XS/S), skipping
a level helps create clearer visual distinction.

**Example with a named scale:**
- Title → Subtitle: `extra-small`
- Subtitle → Paragraph: `medium` (skip `small` for clear contrast)
- Paragraph → Next Section Heading: `large`

Always apply the margin to the **larger** text element in the pair.

### Step 4: Set outer padding generously
For card/section containers, start with `2rem` outer padding and reduce if
needed. Outer padding should feel like breathing room, not a tight frame.

### Step 5: Apply optical corrections (see below)

---

## Optical Corrections & Padding Rules

### Mathematically symmetrical ≠ visually symmetrical
When you set equal padding on all sides of a card or container, it will
*look* like there's extra space at the top. This is because the bounding
box of a text element is taller than the actual rendered pixel height of
the letterforms — the gap between the bounding box and the cap-height
creates invisible extra space at the top.

**Fix:** Reduce top padding by the amount of that gap (the difference between
the bounding box height and the rendered text height). The result is
mathematically asymmetrical but optically balanced.

This is why a card with "equal" padding often looks top-heavy — and why
optical corrections are required for truly balanced layouts.

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
The space *inside* a button (between icon and label) must always be smaller
than the button's own padding.

```
Good: gap: 0.5rem; padding: 1rem 1.5rem;
Bad:  gap: 1rem;   padding: 0.5rem 1rem;  /* inner > outer = ugly */
```

You may use equal inner and outer spacing if needed, but **never** let inner
spacing exceed outer spacing.

## Using a Named Spacing Scale

A named scale (XS, S, M, L, XL…) is more useful than raw numbers because
it forces you to think in *relative* terms rather than absolute pixels.
An exponential scale works best — the gaps between levels grow larger as
you go up, which mirrors how human perception works.

**Example named scale:**
```
xs   = 0.25rem   (4px)
sm   = 0.5rem    (8px)
md   = 1rem      (16px)
lg   = 1.5rem    (24px)
xl   = 2rem      (32px)
2xl  = 3rem      (48px)
```

### Using the scale for typography pairs
When assigning spacing between text elements:
- Use `xs` or `sm` for strongly related pairs (title + subtitle)
- Skip a level at the small end for clarity (go from `xs` to `md`, not `xs` to `sm`)
- Once past `md`, sequential levels (`md` → `lg` → `xl`) provide enough contrast
- Always apply margin to the **larger** element in the pair

---



| Relationship | Spacing to use |
|---|---|
| Same element parts (icon + text) | `< 1rem` (e.g., `0.5rem`) |
| Items in same group | `0.5–1rem` |
| Between groups / sections | `1.5–2rem` |
| Outer container padding | `1.5–2rem` (start at 2rem) |
| Between major page sections | `2–3rem` |

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
- ❌ Assuming mathematically equal padding looks balanced — it won't; apply optical corrections
- ❌ Designing with placeholder (Lorem ipsum) content — real content shifts relationships
- ❌ Applying the same spacing value between every element regardless of relationship strength
- ❌ Applying margin to the smaller element in a pair — always apply to the larger one

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