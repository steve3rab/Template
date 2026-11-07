import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

type RecordRow = { id: string; name: string; amount: number };

const rows: RecordRow[] = Array.from({ length: 23 }, (_, index) => ({
  id: `row-${index + 1}`,
  name: `Record ${String(index + 1).padStart(2, '0')}`,
  amount: 23 - index,
}));

const columns: DataTableColumn<RecordRow>[] = [
  { key: 'name', header: 'Name', render: (row) => row.name, sortValue: (row) => row.name },
  { key: 'amount', header: 'Amount', render: (row) => row.amount, sortValue: (row) => row.amount },
];

describe('DataTable', () => {
  it('paginates rows and changes the page size', () => {
    render(
      <DataTable
        ariaLabel="Records"
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        emptyMessage="No records."
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('1–10 of 23 rows')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Record 11')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
      target: { value: '25' },
    });
    expect(screen.getAllByRole('row')).toHaveLength(24);
    expect(screen.getByText('1–23 of 23 rows')).toBeInTheDocument();
  });

  it('sorts values in both directions and resets pagination', () => {
    render(
      <DataTable
        ariaLabel="Records"
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        emptyMessage="No records."
        initialPageSize={5}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Amount' }));
    const table = screen.getByRole('table', { name: 'Records' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Record 23');
    expect(screen.getByRole('columnheader', { name: /amount/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Amount' }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Record 01');
    expect(screen.getByRole('columnheader', { name: /amount/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('shows an accessible empty state', () => {
    render(
      <DataTable
        ariaLabel="Records"
        columns={columns}
        data={[]}
        rowKey={(row) => row.id}
        emptyMessage="No records available."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No records available.');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
