import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { endpoints } from "../../config/api";

interface SchemaColumn {
  name: string;
  type: string;
}

interface TableSchema {
  table: string;
  columns: SchemaColumn[];
}

interface QueryResult {
  ok: boolean;
  columns?: { name: string; type: string }[];
  rows?: Record<string, unknown>[];
  row_count?: number;
  elapsed_ms?: number;
  error?: string;
}

const TYPE_COLORS: Record<string, string> = {
  VARCHAR: "text-emerald-600",
  DOUBLE: "text-blue-600",
  FLOAT: "text-blue-600",
  INTEGER: "text-blue-600",
  BIGINT: "text-blue-600",
  DATE: "text-purple-600",
  TIMESTAMP: "text-purple-600",
  BOOLEAN: "text-orange-600",
};

function typeColor(t: string) {
  for (const [key, cls] of Object.entries(TYPE_COLORS)) {
    if (t.toUpperCase().includes(key)) return cls;
  }
  return "text-gray-400";
}

function SchemaPanel({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { data: schemas, isLoading } = useQuery<TableSchema[]>({
    queryKey: ["schema"],
    queryFn: () => fetch(endpoints.schema()).then((r) => r.json()),
    refetchInterval: 15_000,
  });

  if (isLoading) return <div className="p-3 text-xs text-gray-400">Loading schema…</div>;
  if (!schemas?.length)
    return (
      <div className="p-3 text-xs text-gray-400 space-y-1">
        <p className="font-medium text-gray-500">No tables yet</p>
        <p>Go to the <span className="font-semibold">Explorer</span> tab, select a source, and click <span className="font-semibold">Refresh</span> to load data.</p>
        <p className="text-gray-300 pt-1">Weather works with no API key.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-0.5 p-2 text-xs">
      {schemas.map((s) => (
        <div key={s.table}>
          <button
            onClick={() => setExpanded((e) => ({ ...e, [s.table]: !e[s.table] }))}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-100 text-left"
          >
            <span className="text-gray-400">{expanded[s.table] ? "▾" : "▸"}</span>
            <span
              className="font-semibold text-gray-800 hover:text-blue-600 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onInsert(s.table);
              }}
            >
              {s.table}
            </span>
            <span className="ml-auto text-gray-300 text-[10px]">{s.columns.length} cols</span>
          </button>
          {expanded[s.table] && (
            <div className="ml-5 border-l border-gray-100 pl-2 pb-1">
              {s.columns.map((col) => (
                <button
                  key={col.name}
                  onClick={() => onInsert(col.name)}
                  className="flex items-center gap-2 w-full px-1 py-0.5 rounded hover:bg-gray-50 text-left"
                >
                  <span className="text-gray-700 font-mono">{col.name}</span>
                  <span className={`ml-auto text-[10px] font-mono ${typeColor(col.type)}`}>
                    {col.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResultsTable({ result }: { result: QueryResult }) {
  const columns: ColumnDef<Record<string, unknown>>[] = (result.columns ?? []).map((col) => ({
    accessorKey: col.name,
    header: col.name,
    cell: (info) => {
      const val = info.getValue();
      if (val === null || val === undefined) return <span className="text-gray-300">NULL</span>;
      if (typeof val === "number")
        return <span>{Number(val).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>;
      return <span>{String(val)}</span>;
    },
  }));

  const table = useReactTable({
    data: result.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!result.rows?.length) return <div className="p-4 text-sm text-gray-400">Query returned 0 rows.</div>;

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-50 z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap border-b border-gray-200"
                >
                  <div className="flex flex-col leading-tight">
                    <span>{flexRender(h.column.columnDef.header, h.getContext())}</span>
                    <span className={`text-[9px] font-normal normal-case ${typeColor(result.columns?.find((c) => c.name === h.id)?.type ?? "")}`}>
                      {result.columns?.find((c) => c.name === h.id)?.type}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 hover:bg-blue-50/30">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 whitespace-nowrap font-mono text-gray-700">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EXAMPLE_QUERIES = [
  "SELECT * FROM weather LIMIT 20",
  "SELECT state, AVG(unemployment_rate) AS avg_rate\nFROM unemployment\nGROUP BY state\nORDER BY avg_rate DESC",
  "SELECT series_name, date, rate_pct\nFROM interest_rates\nWHERE series_id = 'FEDFUNDS'\nORDER BY date DESC\nLIMIT 30",
  "SELECT country, indicator_name, AVG(value) AS avg_value\nFROM world_bank\nGROUP BY country, indicator_name\nORDER BY country, indicator_name",
];

export function SqlEditor() {
  const [sql, setSql] = useState("SELECT * FROM weather LIMIT 20");
  const [result, setResult] = useState<QueryResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate, isPending } = useMutation<QueryResult, Error, string>({
    mutationFn: async (query) => {
      const r = await fetch(endpoints.query(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: query }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      return r.json();
    },
    onSuccess: (data) => setResult(data),
    onError: (err) =>
      setResult({ ok: false, error: err.message, elapsed_ms: 0 }),
  });

  const runQuery = useCallback(() => {
    const query = textareaRef.current?.value ?? sql;
    if (query.trim()) mutate(query.trim());
  }, [sql, mutate]);

  const insertAtCursor = useCallback((text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setSql((s) => s + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newVal = sql.slice(0, start) + text + sql.slice(end);
    setSql(newVal);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    }, 0);
  }, [sql]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
    // Tab → insert 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      insertAtCursor("  ");
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Schema sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="px-3 py-2 border-b border-gray-100 sticky top-0 bg-white z-10">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tables</p>
          <p className="text-[10px] text-gray-400">Click to insert name</p>
        </div>
        <SchemaPanel onInsert={insertAtCursor} />
      </aside>

      {/* Editor + results */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <span className="text-xs text-gray-400 hidden sm:block">⌘↵ to run</span>
          <div className="flex gap-1 ml-auto flex-wrap">
            {EXAMPLE_QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => setSql(q)}
                className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 font-mono whitespace-nowrap"
              >
                {q.split("\n")[0].slice(0, 28)}…
              </button>
            ))}
          </div>
          <button
            disabled={isPending}
            onClick={runQuery}
            className="shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Running…" : "Run"}
          </button>
        </div>

        {/* SQL textarea */}
        <div className="shrink-0 border-b border-gray-200">
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="w-full font-mono text-sm text-gray-800 bg-gray-950 text-green-300 p-4 resize-none focus:outline-none"
            style={{ minHeight: "160px", maxHeight: "300px" }}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {result ? (
            <>
              <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50 shrink-0 text-xs">
                {result.ok ? (
                  <>
                    <span className="text-green-600 font-medium">✓ {result.row_count?.toLocaleString()} rows</span>
                    <span className="text-gray-400">{result.elapsed_ms} ms</span>
                  </>
                ) : (
                  <span className="text-red-500 font-medium">✗ Error</span>
                )}
              </div>
              {result.ok ? (
                <ResultsTable result={result} />
              ) : (
                <div className="p-4 font-mono text-sm text-red-600 bg-red-50 m-3 rounded-lg whitespace-pre-wrap">
                  {result.error}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 text-sm text-gray-400">
              Run a query to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
