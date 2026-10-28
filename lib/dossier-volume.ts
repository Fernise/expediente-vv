/** Preserve input order while indexing a large dossier in one pass. */
export function groupByKey<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

export function documentPage<T>(items: readonly T[], requested?: string) {
  const size = 20;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const parsed = requested && /^\d{1,9}$/.test(requested) ? Number(requested) : 1;
  const page = Math.min(pages, Math.max(1, parsed));
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, pages, start, total: items.length };
}
