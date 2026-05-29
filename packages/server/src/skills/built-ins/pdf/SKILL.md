---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text from PDFs, merging multiple PDFs into one, splitting PDFs apart, extracting metadata, counting pages, filling forms, and creating new PDFs. If the user mentions a .pdf file or asks to produce one, use this skill.
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

## Overview

Use `@libpdf/core` (available as the `libpdf` global in code mode) for all PDF operations. It handles parsing, generation, merge, split, forms, and encryption in a single TypeScript-first library.

## Quick Start

```typescript
const bytes = new Uint8Array(await (await import('node:fs/promises')).readFile('document.pdf'));
const pdf = await libpdf.PDF.load(bytes);
console.log(`Pages: ${pdf.getPageCount()}`);
```

## Reading a PDF

`page.extractText()` returns an **object**, not a string. Its shape is:

```typescript
{
  pageIndex: number;
  width: number;
  height: number;
  lines: Array<{ text: string; bbox: object; spans: object[] }>;
  text: string; // full page text concatenated
}
```

Always access `.text` to get the string content.

### Extract Text from All Pages

```typescript
const bytes = new Uint8Array(await (await import('node:fs/promises')).readFile('document.pdf'));
const pdf = await libpdf.PDF.load(bytes);

let text = '';
for (let i = 0; i < pdf.getPageCount(); i++) {
  text += pdf.getPage(i).extractText().text + '\n';
}
```

### Extract Text from a Specific Page

```typescript
const page = pdf.getPage(0); // 0-indexed
const text = page.extractText().text; // .text gives the string
```

### Extract Metadata

```typescript
const { info } = await pdf.getMetadata();
console.log('Title:', info.Title);
console.log('Author:', info.Author);
```

## Merge PDFs

```typescript
const fs = await import('node:fs/promises');
const [bytes1, bytes2] = await Promise.all([fs.readFile('doc1.pdf'), fs.readFile('doc2.pdf')]);

const merged = await libpdf.PDF.merge([new Uint8Array(bytes1), new Uint8Array(bytes2)]);
await fs.writeFile('merged.pdf', await merged.save());
```

## Split PDF

### Extract a Page Range

```typescript
const bytes = new Uint8Array(await (await import('node:fs/promises')).readFile('input.pdf'));
const pdf = await libpdf.PDF.load(bytes);

const first3 = await pdf.extractPages([0, 1, 2]);
await (await import('node:fs/promises')).writeFile('first-3.pdf', await first3.save());
```

### Split into Single-Page Files

```typescript
const fs = await import('node:fs/promises');
const pdf = await libpdf.PDF.load(new Uint8Array(await fs.readFile('input.pdf')));

for (let i = 0; i < pdf.getPageCount(); i++) {
  const single = await pdf.extractPages([i]);
  await fs.writeFile(`page-${i + 1}.pdf`, await single.save());
}
```

## Quick Reference

| Task          | API                                        |
| ------------- | ------------------------------------------ |
| Load PDF      | `await libpdf.PDF.load(uint8array)`        |
| Page count    | `pdf.getPageCount()`                       |
| Get a page    | `pdf.getPage(n)` (0-indexed)               |
| Extract text  | `page.extractText().text`                  |
| Get metadata  | `await pdf.getMetadata()`                  |
| Merge PDFs    | `await libpdf.PDF.merge([bytes1, bytes2])` |
| Split pages   | `await pdf.extractPages([0, 1, 2])`        |
| Save to bytes | `await pdf.save()`                         |
