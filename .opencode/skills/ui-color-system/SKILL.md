---
name: ui-color-system
description: >
  Design a complete, production-ready UI color system from scratch. Use this skill whenever
  the user asks about color palettes, theming, dark/light mode, color tokens, CSS variables,
  background/text/border color choices, HSL vs OKLCH color formats, or how to structure colors
  for a UI. Trigger for phrases like "help me pick colors", "set up a color palette", "dark mode
  colors", "design tokens", "what colors should I use", "color system for my app", or any
  request to improve or build out the visual color foundation of an interface.
---

# UI Color System

A practical, opinionated guide to building a complete color system for apps and UIs — covering format choice, shade generation, dark/light mode, and semantic usage.

---

## Core Philosophy

You only need three categories of color:

1. **Neutral colors** — backgrounds, text, borders, dividers
2. **Brand/primary color** — main CTAs, interactive elements, character
3. **Semantic colors** — success, warning, error, info states

Don't over-engineer it. These three cover 95% of UI needs.

---

## Step 1: Choose the Right Color Format

**Avoid hex and RGB for palette creation** — the values are opaque and give no intuition for relationships between shades.

**Use HSL** as a readable, math-friendly format:

- **H** (Hue): 0–360, the actual color on the color wheel
- **S** (Saturation): 0–100, intensity of the color (0 = gray)
- **L** (Lightness): 0–100, dark to light

HSL makes shade generation simple arithmetic.

**Prefer OKLCH for modern projects** (Tailwind v4 default):

- **L**: 0–1 (lightness)
- **C**: 0–0.4 (chroma, like saturation — rarely need above 0.15–0.2 for UI)
- **H**: 0–360 (hue)

OKLCH produces perceptually uniform lightness steps — increments look more natural across the spectrum, unlike HSL where saturation gets crushed at extremes.

---

## Step 2: Build the Neutral Palette

Neutrals handle backgrounds, text, and borders. Start with `S: 0` (fully desaturated). Hue doesn't matter at zero saturation.

### Dark Mode Backgrounds (HSL)

| Token        | Value           | Use                         |
| ------------ | --------------- | --------------------------- |
| `--bg-dark`  | `hsl(0 0% 0%)`  | Page base                   |
| `--bg-mid`   | `hsl(0 0% 5%)`  | Cards, surfaces             |
| `--bg-light` | `hsl(0 0% 10%)` | Raised/highlighted elements |

Lighter = closer to the user = more important. Reserve `--bg-light` for key surfaces.

### Light Mode Backgrounds

Start by subtracting lightness from 100, then adjust by eye:
| Token | Value | Use |
|---|---|---|
| `--bg-dark` | `hsl(0 0% 90%)` | Page base (darkest in light mode) |
| `--bg-mid` | `hsl(0 0% 95%)` | Cards |
| `--bg-light` | `hsl(0 0% 100%)` | Raised elements |

> **Naming convention**: `--bg-dark` is always the darkest background, `--bg-light` always the lightest — regardless of color mode. This makes variables mode-agnostic.

### Text Colors

| Token              | Dark Mode       | Light Mode      | Use                           |
| ------------------ | --------------- | --------------- | ----------------------------- |
| `--text-primary`   | `hsl(0 0% 93%)` | `hsl(0 0% 10%)` | Headings, key content         |
| `--text-secondary` | `hsl(0 0% 65%)` | `hsl(0 0% 45%)` | Body text, supporting content |

Don't use 100% or 0% lightness for text — it looks harsh. Aim for high contrast without blinding white-on-black.

---

## Step 3: Add Depth with Borders, Gradients & Shadows

### Borders

Should be visible but not distracting:

```css
--border: hsl(0 0% 18%); /* dark mode */
--border: hsl(0 0% 82%); /* light mode */
```

### Gradient Backgrounds

Use two background shades for subtle depth:

```css
background: linear-gradient(to bottom, var(--bg-light), var(--bg-dark));
```

In light mode, invert the direction (light from top):

```css
background: linear-gradient(to bottom, var(--bg-light), var(--bg-mid));
```

### Highlight (top edge glow)

Simulate light from above with a lighter top border:

```css
--highlight: hsl(0 0% 22%); /* dark mode */
--highlight: hsl(0 0% 100%); /* light mode — bump fully bright */
border-top: 1px solid var(--highlight);
```

### Shadows (light mode especially)

Always layer two shadows — short+dark and long+light — for realism:

```css
box-shadow:
  0 1px 3px hsl(0 0% 0% / 0.12),
  0 4px 12px hsl(0 0% 0% / 0.06);
```

Use alpha transparency. Never flat opaque shadows.

---

## Step 4: Add Brand Color (Hue + Saturation)

Once neutrals are set, introduce hue and saturation for the primary/brand color:

```css
/* Example: vibrant blue */
--primary: hsl(220 85% 55%);
--primary-hover: hsl(220 85% 48%);
--primary-subtle: hsl(220 85% 95%); /* light mode bg tint */
```

Generate shades by varying lightness while keeping hue and saturation fixed. For OKLCH:

```css
--primary: oklch(0.55 0.18 240);
--primary-hover: oklch(0.48 0.18 240);
```

---

## Step 5: Semantic Colors

Use consistent hues for meaning:
| State | Hue (HSL) |
|---|---|
| Success | green (~140) |
| Warning | orange/yellow (~40) |
| Error | red (~0 or 355) |
| Info | blue (~210) |

Keep saturation moderate (50–70%) and adjust lightness for variants (background tint vs. solid badge vs. text).

---

## Step 6: Wire Up in CSS

```css
:root {
  --bg-dark: hsl(0 0% 0%);
  --bg-mid: hsl(0 0% 5%);
  --bg-light: hsl(0 0% 10%);
  --text-primary: hsl(0 0% 93%);
  --text-secondary: hsl(0 0% 65%);
  --border: hsl(0 0% 18%);
  --highlight: hsl(0 0% 22%);
  --primary: hsl(220 85% 55%);
}

/* Light mode — toggle via class or media query */
body.light,
@media (prefers-color-scheme: light) {
  :root {
    --bg-dark: hsl(0 0% 90%);
    --bg-mid: hsl(0 0% 95%);
    --bg-light: hsl(0 0% 100%);
    --text-primary: hsl(0 0% 10%);
    --text-secondary: hsl(0 0% 45%);
    --border: hsl(0 0% 82%);
    --highlight: hsl(0 0% 100%);
    --primary: hsl(220 85% 50%);
  }
}
```

Toggle with one line of JS:

```js
document.body.classList.toggle('light');
```

---

## Quick Reference: What to Adjust Per Project

| Goal                | Knob to turn                                |
| ------------------- | ------------------------------------------- |
| Warmer neutrals     | Add slight hue (20–40°) + 3–5% saturation   |
| Cooler neutrals     | Add slight hue (200–240°) + 3–5% saturation |
| More vibrant brand  | Increase saturation / chroma                |
| Softer, muted brand | Lower saturation / chroma                   |
| More depth          | Increase shadow spread + opacity            |
| Flatter look        | Remove shadows, reduce border contrast      |

---

## HSL vs OKLCH: When to Use Which

|                       | HSL                           | OKLCH                      |
| --------------------- | ----------------------------- | -------------------------- |
| Browser support       | Universal                     | Modern browsers (2023+)    |
| Perceptual uniformity | Poor (lightness not accurate) | Excellent                  |
| Tailwind v4           | Legacy                        | Default                    |
| Readability           | Good                          | Good                       |
| Recommendation        | Safe default                  | Preferred for new projects |

For OKLCH, chroma above `0.15` starts looking saturated. Stay under `0.2` for most UI colors.
