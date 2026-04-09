import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { endpoints } from "../../config/api";
import type { SourceStats, PreviewResponse } from "../../types/sources";

interface Props {
  sourceId: string;
  stats: SourceStats | undefined;
}

export function DataPreview({ sourceId, stats }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [groupBy, setGroupBy] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");

  const { data, isLoading } = useQuery<PreviewResponse>({
    queryKey: ["preview", sourceId],
    queryFn: () => fetch(endpoints.sourcePreview(sourceId, 200)).then((r) => r.json()),
    enabled: !!stats?.has_data,
  });

  const rows = data?.rows ?? [];

  const columns: ColumnDef<Record<string, unknown>>[] = rows.length
    ? Object.keys(rows[0]).map((key) => ({
        accessorKey: key,
        header: key,
        cell: (info) => {
          const val = info.getValue();
          if (val === null || val === undefined) return <span className="text-gray-300">—</span>;
          if (typeof val === "number") return <span>{Number(val).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>;
          return <span>{String(val)}</span>;
        },
      }))
    : [];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!stats?.has_data) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <p className="text-gray-400 text-sm">No data loaded yet. Use "Refresh Data" above to fetch data.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-xs text-gray-500">
          {stats.count.toLocaleString()} total rows · preview showing {rows.length}
        </span>
        <div className="ml-auto flex gap-2">
          <input
            type="text"
            placeholder="Filter state…"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs w-28"
          />
          <input
            type="text"
            placeholder="Filter city…"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs w-28"
          />
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs"
          >
            <option value="">No grouping</option>
            <option value="state">By state</option>
            <option value="city">By city</option>
            <option value="country">By country</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading preview…</div>
      ) : (
        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-gray-700 border-b border-gray-100"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table
                .getRowModel()
                .rows.filter((row) => {
                  const r = row.original;
                  if (filterState && String(r.state ?? "").toLowerCase() !== filterState.toLowerCase()) return false;
                  if (filterCity && String(r.city ?? "").toLowerCase() !== filterCity.toLowerCase()) return false;
                  return true;
                })
                .map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-1.5 whitespace-nowrap text-gray-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
