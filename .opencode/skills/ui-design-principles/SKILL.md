---
name: ui-design-principles
description: >
  Apply professional web design principles to produce top-tier, user-friendly websites and UIs.
  Use this skill whenever the user asks for help designing a website, UI, landing page, component,
  or user flow — or whenever they ask how to make their design look better, cleaner, simpler, or
  more professional. Also trigger when they ask about spacing, hierarchy, color, typography,
  design systems, usability, user flows, or how to convince stakeholders on design decisions.
  If the user shows a design and asks for feedback or improvements, use this skill.
---

# Web Design Principles

A practical guide to designing top-tier websites and UIs — grounded in cognitive psychology,
design systems, and real-world usability.

---

## Core Philosophy

**Creativity is a process, not a moment.** Good design is not about inventing something new from
scratch — it's about connecting existing ideas in a unique and intentional way. Study great work,
internalize patterns, then remix them with purpose.

**Don't make users think.** Users are not lazy — they're efficient. They scan, not read. They click
the first reasonable option. They bring expectations and break when those expectations are violated.
Every interaction should feel effortless and obvious.

---

## The Five Rules

### Rule 1: Good Design Is As Little Design As Possible

- Focus on essential features. Ask **"what's the key functionality?"** before asking "how should I design it?"
- Start from the core: often just a heading, an input, and a button is all you need.
- Resist adding elements. More elements almost always = uglier design.
- The brain scans for key visual information. Meet it there.

> **Avoid**: starting with structure (headers, sections, button styles) before knowing the core action.
> **Do**: identify the single most important thing a user needs to do, then design that first.

---

### Rule 2: Use Gestalt Laws — Similarity and Proximity

The brain processes design as a whole before noticing individual elements.

- **Law of Similarity**: Group related elements using consistent shape, size, color, or style.
  - Side effect: makes your design _more consistent_ and _easier to implement_.
- **Law of Proximity**: Elements that belong together should be physically close; unrelated elements should have clear space between them.
- Design must be **scannable within seconds** — if users need to analyze it to understand it, redesign.

---

### Rule 3: Elements Need More Spacing Than You Think

- When designing up close, spacing feels excessive — but users see the full UI at once.
- **Start with generous spacing**, then reduce until it feels right.
- Use spacing to create groups (proximity) and separation (hierarchy).
- Never set spacing arbitrarily — use a system (see Rule 4).

---

### Rule 4: Use a Design System

Even a simple website benefits from a minimal design system. Define these globally:

**Spacing scale** (divisible by 4, expressed in `rem`):

```
4px  / 0.25rem
8px  / 0.5rem
12px / 0.75rem
16px / 1rem
20px / 1.25rem
24px / 1.5rem
32px / 2rem
40px / 2.5rem
48px / 3rem
64px / 4rem
```

> To convert px → rem: divide by 16. Use rem so layout adapts to user system preferences.

**Typography**:

- Pick **one font** and one type scale for the project.
- Set font sizes and line heights as CSS variables.
- **Line height is inversely proportional to font size** — smaller text needs greater line height.
- Large line height also acts as implicit margin between text elements.
- Avoid center-aligning paragraphs and small text; left-align for readability.

**Colors**:

- Pick: 1 dark + 1 light (text/background), 2 accent colors for personality.
- Ensure legibility. Don't overwhelm.
- Skip the "color psychology" tutorials — just make it legible and intentional.
- Use a **subtle gradient** to add life to an otherwise flat accent color.

**Components**:

- Define primary and secondary variants of **links** and **buttons** upfront.
- Use **shadows** to elevate elements instead of borders — the closer something "feels," the more attention it draws.
- Use **accent colors** to highlight the most important actions.

---

### Rule 5: Hierarchy Is Everything

Users look for the most important thing first. Make it obvious.

**Tools for hierarchy** (use sparingly — small changes have big impact):

- **Color**: reduce contrast on secondary info to emphasize primary.
- **Font weight**: bold = important.
- **Font size**: larger = more prominent.
- **Spacing**: more space around an element = more emphasis.

**Process**:

1. Ask: "What's the first thing the user looks for?"
2. Emphasize that element using one or two of the tools above.
3. De-emphasize competing elements.
4. Zoom out and check: does the important thing stand out clearly?

> Note: HTML tags (H1, H2, etc.) don't dictate visual size. An H3 can be larger than an H2 if the context calls for it. Always design by context, not by tag.

---

## Adding Depth and Character (Exceptions to Minimalism)

When the design needs personality:

- Use **shadows** to replace borders and elevate cards/modals.
- Apply **accent colors** sparingly to draw focus.
- Replace flat colors with **subtle gradients**.
- Enhance **lists and tables** with color, spacing, or icons to improve scannability.
- Use **cards** for otherwise bland content blocks.

---

## Simplicity Is Not Minimalism

Simplicity ≠ removing everything. It means removing everything **unnecessary**.

- Sometimes users need many elements to make informed decisions (product pages, comparison tables). That's fine.
- The question to ask: "Does this element help the user make a decision or take an action?"
- If not → remove it.
- Every unnecessary element you remove makes the design clearer.

**Simple designs are harder to make.** They require discipline, precision, and deep understanding of the user — not laziness.

---

## User Flow Design

Before designing screens, map the user journey:

1. **Create a fictional user** with a specific goal (e.g., "David, 24, wants black Oxford shoes for a job interview").
2. **Map the shortest path** from landing to completing their objective.
3. **Identify decision points** — these are where thinking happens. Minimize them.
4. **Remove unnecessary layers** — e.g., eliminate dropdown sub-menus if a simpler layout achieves the same.
5. **Add affordances** at decision points: filters, sorting, search bars.

Key UX principles for flows:

- Don't force login before checkout.
- Provide a search bar to shortcut long navigation paths.
- Make the "right" option the **most obvious** one, not just available.
- Underline clickable text. Use icons users recognize. Make buttons look like buttons.

---

## Following Conventions

Users arrive with expectations. Violating them causes friction.

- Navigation: top or side.
- Buttons: rectangles with text, look pressable.
- Magnifying glass = search. Cart = checkout.
- Sign fields appear in the same location across pages.

**Sticking to conventions isn't boring — it's good design.** The goal isn't to reinvent the wheel; it's to make it roll better.

---

## The Creative Process

Creativity is repeatable when treated as a process:

1. **Know the basics** — internalize the rules above.
2. **Find inspiration** — study top-tier websites, Figma Community, Mobbin, Dribbble. Filter by category and platform.
3. **Study as a user** — note what you like and why. Be specific: "I like bold typography with real human photos."
4. **Incubate** — step away from the problem. Do something else. Ideas surface naturally.
5. **Design without attachment** — don't fall in love with your first version.
6. **Test with real users** — usability test > personal opinion > client opinion.
7. **Iterate** — finish something, then improve it. Done beats perfect.

> If ideas don't come, it often means stress or sleep deprivation is the real blocker — address that first.

---

## Getting Buy-In From Stakeholders

When a client, boss, or PM pushes back on design decisions:

1. Run a **usability test**: have a target user complete a task on the current design.
2. Run the same test on a competitor's product.
3. Show the results side-by-side. If competitors perform better, the business case is self-evident.
4. Present your redesign and test it the same way.
5. Let the data make the argument — not your aesthetic preferences.

Money follows usability. Stakeholders follow money.

---

## Quick Checklist Before Shipping

- [ ] Is the most important action immediately obvious?
- [ ] Can a first-time user figure out what to do without instructions?
- [ ] Is the design scannable in under 5 seconds?
- [ ] Does every element serve a purpose?
- [ ] Are spacing, color, and typography consistent with the system?
- [ ] Do interactive elements (links, buttons) look interactive?
- [ ] Have you zoomed out and checked the overall hierarchy?
- [ ] Has it been tested with at least one real user?
