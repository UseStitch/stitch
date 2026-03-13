---
name: responsive-ui-layout
description: >
  Design and build responsive websites using CSS Flexbox, Grid, and media queries.
  Use this skill whenever the user asks about responsive design, making a layout work
  on mobile, using flexbox or grid, handling breakpoints, sidebar layouts, sticky headers,
  or building UIs that adapt to different screen sizes. Trigger even if they just say
  "my layout is broken on mobile", "how do I center this", "make this responsive",
  or "should I use flex or grid".
---

# Responsive Web Layout

A practical system for designing and building layouts that work on any screen size — from 4K monitors to tiny smartphones.

---

## The Core Mental Model

**Everything on a webpage is a box.** Every element — a nav, a card, a button — is a rectangular box. Boxes nest inside other boxes (parent → child). Responsive layout = dynamically moving boxes into different rows and columns based on screen size.

**Every design can be broken into rows and columns.** Before writing any code, sketch how the layout should look at mobile, tablet, and desktop. Then implement using the rules below.

---

## Rule 1: Understand Box Display Modes

Before laying out anything, know what each `display` value does:

| Value          | Behavior                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| `none`         | Removes element from layout entirely                                                    |
| `inline`       | Stays in line, only takes content width                                                 |
| `block`        | Starts on new line, takes full width (default for most elements)                        |
| `inline-block` | Sits inline but accepts width/height/margin/padding                                     |
| `flex`         | Parent becomes flex container; children become flex items (best for flexible layouts)   |
| `grid`         | Parent becomes grid container; children become grid items (best for structured layouts) |

---

## Rule 2: Break Layouts into Rows and Columns

Use **Flexbox** for flexible, flow-based layouts. Use **Grid** for structured, fixed-column layouts.

### Flexbox Essentials

```css
/* Parent */
.container {
  display: flex;
  flex-wrap: wrap; /* allow wrapping to next row */
  gap: 16px;
}

/* Children — the "flex shorthand": grow | shrink | basis */
.item {
  flex: 1 1 auto; /* grow to fill, shrink if needed, start at natural size */
}
```

**Key flex properties:**

- `flex-grow`: `0` = don't grow, `1` = grow to fill space, higher = proportionally more
- `flex-shrink`: `0` = never shrink, `1` = shrink when needed
- `flex-basis`: starting size (like `min-width`). `0` = start from nothing; `auto` = use content size
- `justify-content`: horizontal distribution (`flex-start`, `flex-end`, `center`, `space-between`, `space-around`)
- `align-items`: vertical alignment (`stretch`, `center`, `flex-start`, `flex-end`)

**Common flex patterns:**

```css
/* Navbar: logo | search | actions */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header .search {
  flex-grow: 1;
  max-width: 400px;
}

/* Equal-width columns that wrap */
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.card {
  flex: 1 1 300px; /* grow/shrink, min ~300px before wrapping */
}

/* Sidebar + main content */
.layout {
  display: flex;
  gap: 24px;
}
.sidebar {
  width: 240px;
  flex-shrink: 0;
}
.main {
  flex-grow: 1;
}
```

### Grid Essentials

```css
/* Rigid equal columns */
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

/* Auto-responsive grid (no media queries needed) */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(400px, 100%), 1fr));
  gap: 16px;
}
```

**When to use Grid vs Flex:**

| Situation                                     | Use     |
| --------------------------------------------- | ------- |
| Items need to wrap and fill space freely      | Flexbox |
| Cards/items should all be the same size       | Grid    |
| You need precise row AND column control       | Grid    |
| Sidebar + main, nav items, tag clouds         | Flexbox |
| Dashboard tiles, image galleries, data tables | Grid    |

> **Default rule:** Use Flexbox for everything unless you specifically want a rigid grid structure.

---

## Rule 3: Sketch Before You Code

Even a rough pencil sketch saves hours of rework. For each layout, answer:

- What does it look like on mobile (1 column)?
- What does it look like on tablet (2 columns)?
- What does it look like on desktop (3+ columns, sidebars)?
- What happens to the sidebar on mobile — hide it? Stack it above?

Plan the parent–child tree before writing HTML:

```
<main>               ← flex container
  <aside>            ← sidebar (fixed width)
  <section>          ← main content (flex-grow: 1)
    <header>         ← chart header
    <div.cards>      ← grid: auto-fit cards
    <div.tables>     ← grid: 2 columns
```

---

## Rule 4: Use Descriptive, Unique Class Names

Always name elements to reflect their role in the layout, not their appearance.

```html
<!-- Bad -->
<div class="box left big">
  <!-- Good -->
  <div class="dashboard-sidebar">
    <div class="pricing-card">
      <div class="stats-grid"></div>
    </div>
  </div>
</div>
```

This avoids naming conflicts, makes debugging easier, and makes media queries readable.

---

## Rule 5: Use Media Queries for Breakpoints

Media queries apply CSS only when a condition is true (typically screen width).

```css
/* Base styles (mobile-first) */
.sidebar {
  display: block;
}

/* Tablet and up */
@media (min-width: 768px) {
  .sidebar {
    width: 240px;
  }
}

/* Desktop */
@media (max-width: 1024px) {
  .search-bar {
    display: none;
  }
}
```

**Always place media queries at the end of your stylesheet** to prevent cascade conflicts.

**Common breakpoints:**

| Name    | Width          |
| ------- | -------------- |
| Mobile  | < 640px        |
| Tablet  | 640px – 1024px |
| Desktop | > 1024px       |
| Wide    | > 1280px       |

---

## Position Property Reference

Used when you need elements to break out of the normal document flow:

| Value      | Behavior                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `static`   | Default. Flows normally.                                                                                              |
| `relative` | Flows normally but unlocks `top/right/bottom/left` to offset. Also acts as anchor for absolutely positioned children. |
| `absolute` | Removed from flow. Positioned relative to nearest non-static ancestor.                                                |
| `fixed`    | Removed from flow. Stays fixed on screen even on scroll.                                                              |
| `sticky`   | Flows normally, then "sticks" at a scroll position.                                                                   |

**Sticky gotcha:** On sticky elements inside a flex container, always set `align-self: flex-start` — otherwise flex stretching will prevent the sticky behavior.

**Absolute gotcha:** If a child is `position: absolute`, the parent must be `position: relative` (or any non-static value) to contain it.

---

## Common Responsive Patterns

### Sticky Header

```css
header {
  position: sticky;
  top: 0;
  z-index: 100;
}
```

### Sidebar: fixed on desktop, overlay on mobile

```css
.sidebar {
  position: sticky;
  top: 80px; /* account for header */
  align-self: flex-start;
}

@media (max-width: 768px) {
  .sidebar {
    position: absolute;
    top: 0;
    left: 0;
    display: none; /* toggle with JS */
  }
  .layout {
    position: relative; /* contain the absolute sidebar */
  }
}
```

### Cards that go from 1 → 2 → 3 columns automatically

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 16px;
}
```

### Two tables side-by-side on desktop, stacked on mobile

```css
.tables {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(400px, 100%), 1fr));
  gap: 16px;
}
```

---

## Quick Checklist

When building a responsive layout:

- [ ] Sketched mobile, tablet, and desktop layouts?
- [ ] Defined parent–child hierarchy in HTML before writing CSS?
- [ ] Used `flex-wrap: wrap` or grid `auto-fit` so items can reflow?
- [ ] Set `max-width` on wide text blocks to maintain readability?
- [ ] Added `position: relative` to any parent of an `absolute` child?
- [ ] Added `align-self: flex-start` to sticky elements inside flex containers?
- [ ] Placed all media queries at the end of the stylesheet?
- [ ] Tested at mobile, tablet, and desktop widths?

---

## Reference

- [CSS Tricks Flexbox Guide](https://css-tricks.com/snippets/css/a-guide-to-flexbox/) — comprehensive visual reference for all flex properties
