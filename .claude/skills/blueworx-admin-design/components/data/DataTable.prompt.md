Records list. Put it in a `flush` Card so the table meets the card edges.

```jsx
<Card flush title="Members" actions={<Button size="sm" icon="download">Export</Button>}>
  <DataTable
    columns={[{ key: 'name', label: 'Member' }, { key: 'plan', label: 'Plan' }, { key: 'spend', label: 'Spend', align: 'right' }]}
    rows={rows}
    selectable selected={sel} onToggle={toggle} onToggleAll={toggleAll}
    rowActions={(r) => <IconButton icon="edit" label="Edit" size="sm" />}
    empty={<EmptyState icon="groups" title="No members yet" />} />
</Card>
```

Use `<span className="bw-table__primary">` + `<span className="bw-table__sub">` inside the first cell for a name with a secondary line.
