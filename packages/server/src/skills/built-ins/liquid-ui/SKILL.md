---
name: liquid-ui
description: Use this skill before calling the render_ui tool or designing a Liquid UI dashboard. It contains the fixed component catalog, schema rules, examples, and guidance for when visual UI is appropriate.
---

# Liquid UI / render_ui Guide

You may call `render_ui` without the user explicitly asking when a visual dashboard would make the answer easier to scan.

Use `render_ui` when the response contains comparisons, rankings, multiple entities, statuses, risks, metrics, dates, percentages, polling, financial figures, or chartable quantitative data. Good fits include briefings, reports, market maps, political race overviews, company snapshots, travel comparisons, and research summaries.

Do not use `render_ui` for simple explanations, single facts, short conversational answers, code/debugging tasks, or when the UI would merely repeat clear prose. Never invent data to fill a chart or stat. If data is uncertain or conflicting, mark it clearly with text or an info/warning badge.

## Response Pattern

1. Complete ALL research and tool calls first, including web searches, file reads, and data fetches.
2. Once you have all the data you need, write 1-3 sentences of plain text.
3. Call `render_ui` LAST, after all other tool calls are finished. Never call `render_ui` mid-research.
4. End with a short conclusion or caveat only if useful.

Never write `<liquid_ui>`, `</liquid_ui>`, JSON UI specs, or fenced UI specs in assistant text. If a dashboard is appropriate, call the `render_ui` tool. If you cannot call `render_ui`, respond with plain text only.

Never duplicate information between the dashboard and the text. The dashboard is the primary surface for the data. Once a metric, status, comparison, or figure is shown in the UI, do NOT restate it in prose. Text should only frame the dashboard, such as what it shows, how it was sourced, or caveats the UI cannot express. Do not write a textual summary, list, or table that repeats what the `render_ui` call already displays.

## Component Selection

- `Stat`: Headline metrics. Use `caption` or `trend` for status tied to the metric. Use `Badge` separately only for standalone status labels.
- `Badge`: Status, confidence, risk, category, or trend that is NOT tied to a specific `Stat`. Place `Badge` inside a `Row` or at the end of a `Stack`, never as a direct `Grid` child alongside `Stat` or `Card` nodes.
- `Card`: One entity or theme.
- `Grid`: Comparing peer entities.
- `KeyValue`: Factual rows.
- `Chart`: Real quantitative data only.
- `Text`: Short annotations inside the dashboard.

## Dashboard Quality

- Keep dashboards compact.
- Use at most one chart by default.
- Prefer 2-6 cards.
- Keep labels and badge text short.
- Use unique node IDs and only catalog components/props.

## Schema Rules

The `render_ui` tool input is a single flat graph: `{ root, nodes }`. Nodes use a discriminated `component` field, unique `id` values, and child id refs. Never invent components or props. Use one `render_ui` call per logical UI block.

Critical rules to avoid schema rejection:

- Put ALL props DIRECTLY on each node object. NEVER use a nested `props` key.
- Enum-like numeric fields MUST be strings: `columns` is `"1"`, `"2"`, `"3"`, or `"4"`, not `1`, `2`, `3`, or `4`.
- Required nullable fields MUST be present: include `"caption": null` and `"trend": null` on every `Stat` node if unused.
- Never reference a node's own id in its `children` array.

## Minimal Valid Example

```json
{
  "root": "s1",
  "nodes": [
    { "id": "s1", "component": "Stack", "spacing": "sm", "children": ["g1", "r1"] },
    { "id": "g1", "component": "Grid", "columns": "2", "gap": "sm", "children": ["st1", "st2"] },
    {
      "id": "st1",
      "component": "Stat",
      "label": "Revenue",
      "value": "$4.2k",
      "caption": null,
      "trend": "up"
    },
    {
      "id": "st2",
      "component": "Stat",
      "label": "Orders",
      "value": "38",
      "caption": null,
      "trend": null
    },
    { "id": "r1", "component": "Row", "gap": "sm", "align": "start", "children": ["b1"] },
    { "id": "b1", "component": "Badge", "variant": "success", "text": "On track" }
  ]
}
```

## Catalog

- `Stack`: Vertical layout for ordered groups. Do not use for unrelated comparisons. Props: `children`, `spacing: none|xs|sm|md|lg`.
- `Grid`: Responsive grid for cards, stats, or key values. Do not use for prose-only answers. Props: `children`, `columns: 1|2|3|4`, `gap: none|xs|sm|md|lg`.
- `Row`: Horizontal layout for compact related items. Do not use when wrapping would harm readability. Props: `children`, `gap: none|xs|sm|md|lg`, `align: start|center|end|between`.
- `Card`: Bounded section for grouped information. Do not use for a single short sentence. Props: `title: string|null`, `description: string|null`, `children`.
- `Badge`: Short status, category, or risk label. Do not use for long text. Props: `variant: default|success|warning|destructive|info`, `text`.
- `Stat`: Metric with label and value. Do not use for non-numeric prose. Props: `label`, `value`, `caption: string|null`, `trend: up|down|neutral|null`.
- `KeyValue`: One labeled fact. Do not use for paragraphs. Props: `label`, `value`.
- `Text`: Brief display text inside a UI block. Prefer normal assistant text for full explanations. Props: `text`, `variant: body|muted|heading|caption`.
- `Divider`: Visual separation between grouped items. Do not use repeatedly. Props: no props beyond `id` and `component`.
- `Chart`: Line, bar, or pie chart for real data. Do not invent data or use for tiny lists. Props: `kind: line|bar|pie`, `title: string|null`, `labels`, `datasets: { label, data }[]`.
