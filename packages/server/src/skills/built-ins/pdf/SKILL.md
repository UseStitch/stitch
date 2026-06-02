---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text from PDFs, merging multiple PDFs into one, splitting PDFs apart, extracting metadata, counting pages, filling forms, and creating new PDFs. If the user mentions a .pdf file or asks to produce one, use this skill.
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

## Overview

Use `@libpdf/core` (available as the `libpdf` global in code mode) for all PDF operations. It handles parsing, generation, merge, split, forms, and encryption in a single TypeScript-first library.

Some PDFs, especially ticketing or receipt PDFs, are image-only: each page paints an embedded image and has no extractable text layer. In those cases, `extractText()` can correctly return an empty string even though the page visibly contains text. Do not stop there; inspect and extract page images for vision/OCR processing.

`@libpdf/core` does not currently expose a high-level "extract images" API. Use the low-level PDF object API for image extraction: page resources contain `/XObject` dictionaries, image XObjects are `PdfStream` objects with `/Subtype /Image`, and indirect objects must be resolved with `pdf.getObject(ref)`.

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

If the combined text is empty or only whitespace, treat the PDF as possibly image-only and use the image fallback below.

### Extract Text from a Specific Page

```typescript
const page = pdf.getPage(0); // 0-indexed
const text = page.extractText().text; // .text gives the string
```

## Image-Only PDF Fallback

When text extraction returns empty text, check page content and resources for image XObjects. A common pattern is a page content stream containing only a `Do` operator for an `/XObject` image, with no fonts in the resources.

### Detect Embedded Page Images

```typescript
const fs = await import('node:fs/promises');
const bytes = new Uint8Array(await fs.readFile('document.pdf'));
const pdf = await libpdf.PDF.load(bytes);

for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex++) {
  const page = pdf.getPage(pageIndex);
  const text = page.extractText().text.trim();
  const content = Buffer.from(page.getContentBytes()).toString('latin1');

  console.log({
    pageIndex,
    textLength: text.length,
    paintsXObject: /\/[^\s]+\s+Do/.test(content),
  });
}
```

### Extract JPEG Image XObjects

Many image-only PDFs embed JPEG streams using `/Filter /DCTDecode`. Those streams can be written directly as `.jpg` files. For extraction, write `stream.data` because it is the raw stream data from the PDF. Do not use `getEncodedData()` for extraction; that method is for encoding decoded stream content after modification. Do not use `getDecodedData()` for JPEG extraction unless you explicitly need decoded pixel data instead of a JPEG file.

```typescript
const fs = await import('node:fs/promises');
const path = await import('node:path');

const pdfPath = 'document.pdf';
const outputDir = 'pdf-images';
await fs.mkdir(outputDir, { recursive: true });

const bytes = new Uint8Array(await fs.readFile(pdfPath));
const pdf = await libpdf.PDF.load(bytes);
const { PdfName, PdfRef } = libpdf;

const extractedImages = [];

for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex++) {
  const page = pdf.getPage(pageIndex);
  const resources = page.getResources();
  const xObjects = resources?.getDict(PdfName.of('XObject'));

  if (!xObjects) continue;

  for (const [name, value] of xObjects) {
    const stream = value instanceof PdfRef ? pdf.getObject(value) : value;
    if (stream?.getName?.(PdfName.of('Subtype')) !== 'Image') continue;

    const filter = stream.getName(PdfName.of('Filter'));
    if (filter !== 'DCTDecode') continue;

    const filename = `page-${pageIndex + 1}-${name.value}.jpg`;
    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, stream.data);

    extractedImages.push({
      pageIndex,
      filePath,
      width: stream.getNumber(PdfName.of('Width')),
      height: stream.getNumber(PdfName.of('Height')),
      filter,
    });
  }
}

return extractedImages;
```

Use the extracted images with any available vision or OCR capability to read visible text. If no vision/OCR capability is available, report that the PDF is image-only and provide the extracted image paths instead of claiming the PDF has no content.

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
