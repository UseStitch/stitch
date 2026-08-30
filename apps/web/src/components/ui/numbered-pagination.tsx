import * as React from 'react';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

export function getPaginationPageNumbers(page: number, totalPages: number): number[] {
  if (totalPages <= 1) {
    return [];
  }

  const firstPage = 1;
  const lastPage = totalPages;
  const start = Math.max(firstPage, page - 1);
  const end = Math.min(lastPage, page + 1);

  const pages = new Set<number>([firstPage, lastPage]);
  for (let index = start; index <= end; index += 1) {
    pages.add(index);
  }

  return [...pages].toSorted((a, b) => a - b);
}

export function clampPaginationPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

type NumberedPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function NumberedPagination({ page, totalPages, onPageChange }: NumberedPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pageNumbers = getPaginationPageNumbers(page, totalPages);
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div className="border-t border-border px-space-l py-space-l">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={isFirstPage}
              onClick={(event) => {
                event.preventDefault();
                if (!isFirstPage) onPageChange(page - 1);
              }}
              className={isFirstPage ? 'pointer-events-none opacity-50' : undefined}
            />
          </PaginationItem>

          {pageNumbers.map((pageNumber, index) => {
            const previousPage = pageNumbers[index - 1];
            const showGap = index > 0 && pageNumber - previousPage > 1;
            return (
              <React.Fragment key={`page-${pageNumber}`}>
                {showGap ? (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : null}
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive={pageNumber === page}
                    onClick={(event) => {
                      event.preventDefault();
                      onPageChange(pageNumber);
                    }}>
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              </React.Fragment>
            );
          })}

          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={isLastPage}
              onClick={(event) => {
                event.preventDefault();
                if (!isLastPage) onPageChange(page + 1);
              }}
              className={isLastPage ? 'pointer-events-none opacity-50' : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
