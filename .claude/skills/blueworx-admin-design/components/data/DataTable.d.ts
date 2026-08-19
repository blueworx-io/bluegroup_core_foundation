/**
 * The BlueWorx replacement for WP_List_Table: uppercase headers, hover rows, actions revealed on hover.
 */
export interface DataTableColumn { key: string; label: React.ReactNode; align?: 'left' | 'right'; width?: number | string }
export interface DataTableProps {
  columns: DataTableColumn[];
  /** Each row needs an `id`; other keys match column keys and may hold nodes. */
  rows: Array<{ id: string | number; [key: string]: any }>;
  /** Adds the leading checkbox column for bulk actions. */
  selectable?: boolean;
  selected?: Array<string | number>;
  onToggle?: (id: string | number) => void;
  onToggleAll?: (checked: boolean) => void;
  /** Render row-level actions; they fade in on row hover. */
  rowActions?: (row: any) => React.ReactNode;
  /** Rendered instead of the table when rows is empty — pass an EmptyState. */
  empty?: React.ReactNode;
  className?: string;
}
export declare function DataTable(props: DataTableProps): JSX.Element;
