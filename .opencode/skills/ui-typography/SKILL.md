---
name: ui-typography
description: Apply professional UI typography principles to create clear visual hierarchy in interfaces. Use this skill whenever the user asks about font sizing, font weight, type scales, text hierarchy, or how to make UI text look better. Also trigger when the user says their UI "looks like a blob of text", lacks hierarchy, or when they're building or critiquing any app UI that contains text. Covers type scale, weight/color/size combinations, line height, HSL color for text contrast, grouping with proximity, and light/dark mode text strategies.
---

# UI Typography Skill

This skill encodes expert-level knowledge on using typography to create visual hierarchy in app and web UIs. The core insight: typography is the 20% of design effort that delivers 80% of the results, because most UIs are just text and buttons.

## The Three Levers of Visual Hierarchy

Everything in UI typography reduces to three properties. Use them to **emphasize** or **de-emphasize** any text element:

1. **Size** — bigger = more important
2. **Weight** — heavier = more prominent
3. **Color (Lightness)** — higher contrast = more attention

These three can be mixed and matched. You rarely need more than these to build a complete hierarchy.

---

## Type Scale

### You need far fewer sizes than you think

Most apps only need **3 font sizes**, and many production UIs (YouTube, Twitter, etc.) use just:

- A **title/heading** size
- A **body/base** size (14px or 16px — pick one and commit)
- Occasionally one size up or down from base

> Everything on a YouTube video page is 14px except the video title and channel name.

**Practical type scale:**

```
base:  14px or 16px  (default for almost everything)
up:    base + 2px    (use sparingly, only when truly needed)
down:  base - 2px    (captions, metadata, secondary labels)
```

**As CSS variables:**

```css
:root {
  --text-sm: 0.875rem; /* 14px at base 16 */
  --text-base: 1rem; /* 16px */
  --text-lg: 1.125rem; /* 18px */
  --text-xl: 1.25rem; /* 20px */

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-bold: 700;

  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-loose: 1.75;
}
```

**Always use `rem` not `px`** — rem respects the user's browser font size setting (accessibility).

---

## Weight + Color Replace Extra Sizes

The visual impact of weight and lightness is dramatic. Before reaching for a new font size, try:

| Goal                             | Technique                                |
| -------------------------------- | ---------------------------------------- |
| Make text feel more important    | Increase weight (400 → 600 → 700)        |
| Make text feel less important    | Reduce lightness (100% → 60%)            |
| Create a title that stands alone | Increase size AND keep lightness at 100% |
| Create secondary/metadata text   | Same size, lightness at 50–60%           |

**Example:** Three elements at the same 14px size can still have clear hierarchy:

- Title: `font-weight: 700; color: hsl(H S 100%)`
- Username: `font-weight: 400; color: hsl(H S 60%)`
- Timestamp: `font-weight: 400; color: hsl(H S 45%)`

---

## The De-emphasis Technique

> To emphasize element A, de-emphasize element B.

White on black is already maximum contrast. To make a title stand out further, **reduce the lightness of surrounding text** rather than trying to make the title brighter:

- Primary text: `lightness: 100%`
- Secondary text: `lightness: 60%` ← sweet spot for readable but recessive
- Tertiary/metadata: `lightness: 40–50%`

This trick is used everywhere in production UIs. Zoom out on any major app and you'll see it.

---

## HSL Color Model for Typography

Always use `hsl()` instead of `hex` or `rgb` for UI text. It gives you direct control over lightness, which is the main lever for text hierarchy.

```css
color: hsl(<hue> <saturation> <lightness>);
```

- **Hue**: 0–360 (0 = red, 120 = green, 240 = blue)
- **Saturation**: 0% = gray, 100% = fully saturated
- **Lightness**: 0% = black, 50% = base color, 100% = white

**For typography hierarchy, only the L value usually needs to change:**

```css
--text-primary: hsl(220 10% 100%);
--text-secondary: hsl(220 10% 60%);
--text-tertiary: hsl(220 10% 45%);
```

---

## Line Height as Implicit Margin

**Line height acts as automatic spacing between text elements** — you often don't need explicit `margin-bottom` on headings.

```css
h1 {
  line-height: 1.2;
} /* Tight — works for large display text */
p {
  line-height: 1.6;
} /* Comfortable for body reading */
```

When a title has a larger font size and tighter line height, the space it creates naturally separates it from the content below. This is why a well-set title "stands alone" without needing extra margin.

---

## Grouping and Separation (Gestalt Principles)

Typography must communicate which elements belong together. Use these signals:

| Signal              | How                                                                   |
| ------------------- | --------------------------------------------------------------------- |
| **Proximity**       | Reduce spacing between related items, increase between groups         |
| **Size**            | Larger text draws the eye first; related smaller text "belongs" to it |
| **Color/lightness** | Items with the same lightness feel related                            |
| **Weight**          | Bold text anchors a group; lighter text feels subordinate             |

**Example:** A video card UI

- Title and thumbnail belong together → keep them visually close
- Metadata (username, views, date) is a separate group → lighter color, smaller size, slightly more distance from title

---

## Document Hierarchy vs. Visual Hierarchy

> **Code for document hierarchy. Style for visual hierarchy.**

Not all `<h1>` tags look the same. An `<h1>` inside a card widget might look like body text because that's appropriate for the visual context. Use semantic HTML correctly, then override with styles:

```css
/* Semantic heading, visually styled as body text in a card */
.card h1 {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}
```

Always ask: **what will the user focus on first?** Emphasize that element, regardless of its HTML tag.

---

## Light Mode Conversion

Converting a dark UI to light is simple with HSL: **subtract the L value from 100**.

```css
/* Dark mode */
--bg: hsl(220 10% 8%); /* L = 8  */
--text-primary: hsl(220 10% 100%); /* L = 100 */
--text-secondary: hsl(220 10% 60%); /* L = 60 */

/* Light mode — just invert L */
--bg: hsl(220 10% 92%); /* 100 - 8  = 92 */
--text-primary: hsl(220 10% 0%); /* 100 - 100 = 0  */
--text-secondary: hsl(220 10% 40%); /* 100 - 60 = 40 */
```

Implement with a CSS class toggle or `prefers-color-scheme`:

```css
@media (prefers-color-scheme: light) {
  :root {
    --text-primary: hsl(220 10% 5%);
    --text-secondary: hsl(220 10% 40%);
  }
}
```

---

## Active/Selected States

For tabs, nav items, and selected states: **lighter shades appear "on top"** and feel more prominent. Use a higher lightness value on the active item rather than a border or background alone:

```css
.tab {
  color: hsl(220 10% 50%);
}
.tab.active {
  color: hsl(220 10% 100%);
  font-weight: 600;
}
```

---

## Checklist: Diagnosing a Typography Problem

When a UI "looks off" typographically, run through these:

- [ ] **No hierarchy?** → Is the title bigger AND bolder than body text?
- [ ] **Everything the same weight?** → Apply weight variation (400 / 600 / 700)
- [ ] **Too many font sizes?** → Collapse to 2–3 sizes; use weight/color for the rest
- [ ] **Looks like one block?** → Secondary text needs lower lightness (60% or less)
- [ ] **Elements competing?** → De-emphasize the less important one, don't boost the primary
- [ ] **Inconsistent spacing?** → Check line-height before adding margins
- [ ] **Hard to read on mobile?** → Verify rem units, not px; check base size is 14–16px
- [ ] **Active state not obvious?** → Increase lightness + weight on active item

---

## Quick Reference: Common Patterns

```css
/* Card title */
.card-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: hsl(var(--hue) var(--sat) 100%);
  line-height: 1.3;
}

/* Username / metadata */
.meta {
  font-size: var(--text-sm);
  font-weight: 400;
  color: hsl(var(--hue) var(--sat) 55%);
}

/* Active nav tab */
.nav-item {
  color: hsl(var(--hue) var(--sat) 50%);
  font-weight: 400;
}
.nav-item.active {
  color: hsl(var(--hue) var(--sat) 100%);
  font-weight: 600;
}

/* Button label */
.btn-primary {
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
}
```
