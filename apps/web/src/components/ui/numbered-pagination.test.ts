import { describe, expect, test } from 'bun:test';

import { clampPaginationPage, getPaginationPageNumbers } from '@/components/ui/numbered-pagination';

describe('getPaginationPageNumbers', () => {
  test('returns no pages when there is a single page', () => {
    expect(getPaginationPageNumbers(1, 1)).toEqual([]);
  });

  test('returns no pages when there are zero pages', () => {
    expect(getPaginationPageNumbers(1, 0)).toEqual([]);
  });

  test('returns every page when the total fits within the window', () => {
    expect(getPaginationPageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  test('includes only a trailing gap when on the first page', () => {
    expect(getPaginationPageNumbers(1, 10)).toEqual([1, 2, 10]);
  });

  test('includes only a leading gap when on the last page', () => {
    expect(getPaginationPageNumbers(10, 10)).toEqual([1, 9, 10]);
  });

  test('includes leading and trailing gaps when in the middle', () => {
    expect(getPaginationPageNumbers(5, 10)).toEqual([1, 4, 5, 6, 10]);
  });

  test('keeps first and last page one-based', () => {
    const pageNumbers = getPaginationPageNumbers(1, 3);
    expect(pageNumbers[0]).toBe(1);
    expect(pageNumbers.at(-1)).toBe(3);
  });
});

describe('clampPaginationPage', () => {
  test('clamps pages to the available range', () => {
    expect(clampPaginationPage(0, 5)).toBe(1);
    expect(clampPaginationPage(3, 5)).toBe(3);
    expect(clampPaginationPage(8, 5)).toBe(5);
    expect(clampPaginationPage(2, 0)).toBe(1);
  });
});
