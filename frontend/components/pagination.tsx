/** @jsxImportSource preact */

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  params?: URLSearchParams;
}

export function Pagination({ currentPage, totalPages, basePath, params }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div class="flex flex-wrap gap-3">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
        const pageParams = new URLSearchParams(params);
        pageParams.set("page", page.toString());
        return (
          <a
            key={page}
            href={`${basePath}?${pageParams.toString()}`}
            class={page === currentPage
              ? "rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
              : "rounded-lg bg-white px-4 py-2 font-semibold text-gray-700 shadow-sm hover:text-blue-600"}
          >
            {page}
          </a>
        );
      })}
    </div>
  );
}
