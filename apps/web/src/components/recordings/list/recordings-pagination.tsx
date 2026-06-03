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

function getPageNumbers(currentPage: number, pageCount: number): number[] {
  if (pageCount <= 1) {
    return [];
  }

  const firstPage = 0;
  const lastPage = pageCount - 1;
  const start = Math.max(firstPage, currentPage - 1);
  const end = Math.min(lastPage, currentPage + 1);

  const pages = new Set<number>([firstPage, lastPage]);
  for (let index = start; index <= end; index += 1) {
    pages.add(index);
  }

  return [...pages].sort((a, b) => a - b);
}

export function RecordingsPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const currentPage = page - 1;
  const pageNumbers = React.useMemo(
    () => getPageNumbers(currentPage, pageCount),
    [currentPage, pageCount],
  );

  if (pageCount <= 1) return null;

  return (
    <div className="border-t border-border px-3 py-3">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (page > 1) {
                  onPageChange(page - 1);
                }
              }}
              className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
            />
          </PaginationItem>

          {pageNumbers.map((pageNumber, index) => {
            const previousPage = pageNumbers[index - 1];
            const showGap = previousPage !== undefined && pageNumber - previousPage > 1;
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
                    isActive={pageNumber === currentPage}
                    onClick={(event) => {
                      event.preventDefault();
                      onPageChange(pageNumber + 1);
                    }}
                  >
                    {pageNumber + 1}
                  </PaginationLink>
                </PaginationItem>
              </React.Fragment>
            );
          })}

          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (page < pageCount) {
                  onPageChange(page + 1);
                }
              }}
              className={page >= pageCount ? 'pointer-events-none opacity-50' : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
