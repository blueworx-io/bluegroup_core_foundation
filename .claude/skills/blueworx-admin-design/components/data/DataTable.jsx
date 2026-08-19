import React from 'react';

/**
 * columns: [{ key, label, align?: 'left'|'right', width? }]
 * rows: [{ id, ...cells }] — a cell may be a string, number or node.
 */
export function DataTable({ columns = [], rows = [], selectable = false, selected = [], onToggle, onToggleAll, rowActions, empty, className = '' }) {
  if (!rows.length && empty) return empty;
  const allChecked = selectable && rows.length > 0 && selected.length === rows.length;
  return (
    <table className={`bw-table ${className}`}>
      <thead>
        <tr>
          {selectable ? (
            <th className="bw-table__check">
              <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={() => onToggleAll && onToggleAll(!allChecked)} />
            </th>
          ) : null}
          {columns.map((c) => (
            <th key={c.key} style={{ width: c.width, textAlign: c.align === 'right' ? 'right' : undefined }}>{c.label}</th>
          ))}
          {rowActions ? <th aria-label="Actions" /> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {selectable ? (
              <td className="bw-table__check">
                <input type="checkbox" aria-label={`Select ${row.id}`} checked={selected.includes(row.id)} onChange={() => onToggle && onToggle(row.id)} />
              </td>
            ) : null}
            {columns.map((c) => (
              <td key={c.key} className={c.align === 'right' ? 'bw-table__num' : undefined}>{row[c.key]}</td>
            ))}
            {rowActions ? <td className="bw-table__actions">{rowActions(row)}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
