---
name: ui-depth-layering
description: Apply depth, layering, and shadow techniques to improve UI designs that feel flat, boring, or basic. Use this skill whenever a user wants to improve a UI, make it feel less generic, add visual interest to components (navbars, cards, radio buttons, sidebars, dashboards, tables), or asks how to use shadows, layering, color shading, or depth in their interface design. Trigger even for vague requests like "my UI looks boring", "how do I make this look better", or "how do I add depth to my design".
---

# UI Depth & Layering

A technique-first skill for transforming flat, average UIs into visually interesting ones using color shading, layering, and shadows — without redesigning from scratch.

## Core Philosophy

It takes far less effort to go from average → good than from good → great. Depth is that high-leverage lever. Two steps cover 80% of cases:

1. **Create 3–4 shades of the same color**
2. **Add layered shadows**

---

## Step 1: Color Shading (Creating Layers)

Use lightness increments (~0.1 in HSL) to establish a visual layer stack:

| Layer        | Role                            | Shade    |
| ------------ | ------------------------------- | -------- |
| `bg-dark`    | Page background / base          | Darkest  |
| `bg`         | Default card / section          | Mid      |
| `bg-light`   | Elevated / interactive elements | Lighter  |
| `bg-lighter` | Highlights / selected state     | Lightest |

**Rules:**

- Place lighter shades on top of darker ones to simulate elevation
- Elements closer to the user (more important) = lighter
- Elements recessed (less important) = darker
- Remove borders between elements when you're using color difference to separate them — the color contrast does the same job

### Light Mode vs Dark Mode

The same logic applies to both. Use CSS variables (`--bg`, `--bg-light`, etc.) and swap values per theme. Never ignore light mode — it's the default for most users.

---

## Step 2: Shadows

Three shadow levels to choose from based on elevation needed:

### Level 1 — Subtle (Most Natural)

```css
box-shadow:
  0 1px 2px rgba(0, 0, 0, 0.15),
  /* dark bottom shadow */ inset 0 1px 0 rgba(255, 255, 255, 0.08); /* light inset top glow */
```

### Level 2 — Medium

```css
box-shadow:
  0 4px 8px rgba(0, 0, 0, 0.2),
  inset 0 1px 0 rgba(255, 255, 255, 0.1);
```

### Level 3 — Prominent (Hover or Hero Elements)

```css
box-shadow:
  0 8px 24px rgba(0, 0, 0, 0.25),
  inset 0 1px 0 rgba(255, 255, 255, 0.12);
```

**Key insight:** Combining a light inset shadow (top) + dark outer shadow (bottom) mimics realistic lighting — as if light hits from above, making the element appear elevated.

### Inset / Recessed Look (for tables, input wells)

```css
box-shadow:
  inset 0 2px 4px rgba(0, 0, 0, 0.2),
  /* dark inset top */ inset 0 -1px 2px rgba(255, 255, 255, 0.06); /* subtle light inset bottom */
```

Use with a slightly darker background to reinforce the "sunken" effect.

---

## Applying to Common UI Elements

### Navigation Bar

1. Set page to `bg-dark`
2. Nav = `bg` (one step up)
3. Selected tab = `bg-light` with slightly increased text/icon lightness
4. Add Level 1 shadow to nav

### Cards / Profile Cards

1. Card = `bg-light` against `bg-dark` page
2. Level 1 shadow default, Level 2–3 on hover
3. Interactive elements inside = `bg-lighter`

### Dropdowns / Select Controls

1. Use `bg-light` background
2. Pair with a subtle linear gradient (lighter top → slightly darker bottom)
3. Add inset top glow: `inset 0 1px 0 rgba(255,255,255,0.1)`
4. The "shiny highlight" on top reinforces top-down light source

### Radio Buttons / Option Selectors

1. Wrap options in a card (`bg-light`)
2. Highlight each option with `bg-lighter`
3. Selected option = Level 1 shadow (inset light top + dark bottom)
4. Add icons to complement labels
5. Improve typography hierarchy: bold label, muted description

### Dashboard / Analytics UIs

Layer hierarchy (from deepest to highest):

- Page: `bg-dark`
- Table: darker shade, inset shadow (recessed)
- Graph: mid shade
- Metric cards: `bg-light` with Level 1 shadow
- Key stat card: `bg-lighter` with Level 2 shadow

Remove borders on lighter elements — color separation is sufficient.

### Progress Bars

```css
/* Track — recessed */
.track {
  background: var(--bg-dark);
  box-shadow:
    inset 0 2px 3px rgba(0, 0, 0, 0.2),
    inset 0 -1px 1px rgba(255, 255, 255, 0.05);
}
/* Fill — elevated */
.fill {
  background: var(--accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
```

---

## Gradient Tip

Linear gradients pair well with inset glow shadows:

```css
background: linear-gradient(to bottom, var(--bg-lighter), var(--bg-light));
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
```

Simulates top-down lighting consistently across components.

---

## When to Use Which Shadow

| Element                          | Shadow Level |
| -------------------------------- | ------------ |
| Subtle interactive (tabs, pills) | Level 1      |
| Cards, dropdowns                 | Level 1–2    |
| Hovered card                     | Level 2–3    |
| Modal / floating panel           | Level 3      |
| Recessed input / table           | Inset shadow |

---

## Quick Checklist

- [ ] Defined 3–4 shades of base color
- [ ] Page background is darkest shade
- [ ] Interactive/elevated elements use lighter shades
- [ ] Borders removed where color contrast separates elements
- [ ] Shadows use both inset top glow + dark bottom drop
- [ ] Recessed elements (tables, inputs) use inset shadow + darker bg
- [ ] Hover states increase shadow level
- [ ] Light and dark mode use CSS variables
- [ ] Typography hierarchy is established (don't forget font weight/size)

---

## What NOT to Do

- Don't apply Level 3 shadows everywhere — overuse kills the effect
- Don't keep borders when color separation already does the job
- Don't use a single flat `box-shadow` without an inset component — it looks dated
- Don't spend time perfecting tiny details when the ROI is low — apply depth globally and move on
