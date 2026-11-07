import { useMemo, useState, type ReactNode } from 'react';

export type DataTableSortDirection = 'asc' | 'desc';
export type DataTableSortValue = string | number | Date | null | undefined;

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => DataTableSortValue;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  ariaLabel: string;
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyMessage: ReactNode;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  labels?: {
    pageSize?: string;
    previous?: string;
    next?: string;
    page?: string;
    of?: string;
    rows?: string;
  };
}

interface SortState {
  key: string;
  direction: DataTableSortDirection;
}

function compareValues(left: DataTableSortValue, right: DataTableSortValue): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const a = left instanceof Date ? left.getTime() : left;
  const b = right instanceof Date ? right.getTime() : right;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Shared responsive data table with a sticky header, stable sorting and pagination.
 * Pagination and sorting are client-side; callers remain responsible for filtering
 * and for limiting the data set to records the current user is allowed to see.
 */
export function DataTable<T>({
  ariaLabel,
  columns,
  data,
  rowKey,
  emptyMessage,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
  labels,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return data;
    return data
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const compared = compareValues(
          column.sortValue?.(left.row),
          column.sortValue?.(right.row),
        );
        return (sort.direction === 'asc' ? compared : -compared) || left.index - right.index;
      })
      .map(({ row }) => row);
  }, [columns, data, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = sortedData.length === 0 ? 0 : (safePage - 1) * pageSize;
  const pageRows = sortedData.slice(start, start + pageSize);
  const end = Math.min(start + pageSize, sortedData.length);
  const text = {
    pageSize: labels?.pageSize ?? 'Rows per page',
    previous: labels?.previous ?? 'Previous',
    next: labels?.next ?? 'Next',
    page: labels?.page ?? 'Page',
    of: labels?.of ?? 'of',
    rows: labels?.rows ?? 'rows',
  };

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    setSort((current) => ({
      key: column.key,
      direction:
        current?.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  }

  return (
    <div className="data-table-component">
      <div className="data-table__viewport" role="region" aria-label={ariaLabel} tabIndex={0}>
        <table className="data-table" aria-label={ariaLabel}>
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                const ariaSort = active
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={column.sortValue ? ariaSort : undefined}
                    style={{ width: column.width, textAlign: column.align ?? 'left' }}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className="data-table__sort"
                        onClick={() => toggleSort(column)}
                        aria-label={`${column.header}, ${active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'not sorted'}`}
                      >
                        <span>{column.header}</span>
                        <span className="data-table__sort-icon" aria-hidden="true">
                          {active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td className="data-table__empty" colSpan={columns.length}>
                  <span role="status">{emptyMessage}</span>
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-label={column.header}
                      style={{ textAlign: column.align ?? 'left' }}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="data-table__footer">
        <label className="data-table__page-size">
          <span>{text.pageSize}</span>
          <select
            value={pageSize}
            aria-label={text.pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span className="data-table__summary" aria-live="polite">
          {start + (sortedData.length > 0 ? 1 : 0)}–{end} {text.of} {sortedData.length} {text.rows}
        </span>
        <div className="data-table__pagination" aria-label={`${text.page} navigation`}>
          <button
            type="button"
            className="outline-button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage <= 1}
            aria-label={text.previous}
          >
            ‹ <span>{text.previous}</span>
          </button>
          <span aria-current="page">
            {text.page} {safePage} {text.of} {pageCount}
          </span>
          <button
            type="button"
            className="outline-button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={safePage >= pageCount}
            aria-label={text.next}
          >
            <span>{text.next}</span> ›
          </button>
        </div>
      </div>
    </div>
  );
}
