import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../../config/api";
import { useSourceStore } from "../../stores/sourceStore";
import type { SourceInfo, SourceStats } from "../../types/sources";

const CATEGORY_COLORS: Record<string, string> = {
  Weather: "bg-blue-100 text-blue-700",
  "Energy Prices": "bg-amber-100 text-amber-700",
  Environment: "bg-green-100 text-green-700",
  Labor: "bg-purple-100 text-purple-700",
  Finance: "bg-red-100 text-red-700",
  Economics: "bg-teal-100 text-teal-700",
};

function SourceCard({ source }: { source: SourceInfo }) {
  const { selectedSourceId, setSelectedSource } = useSourceStore();
  const isSelected = selectedSourceId === source.id;

  const { data: stats } = useQuery<SourceStats>({
    queryKey: ["stats", source.id],
    queryFn: () => fetch(endpoints.sourceStats(source.id)).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const colorClass = CATEGORY_COLORS[source.category] ?? "bg-gray-100 text-gray-700";

  return (
    <button
      onClick={() => setSelectedSource(isSelected ? null : source.id)}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-50 shadow-sm"
          : "border-transparent hover:bg-gray-50 hover:border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{source.name}</p>
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${colorClass}`}>
            {source.category}
          </span>
        </div>
        <div className="shrink-0 text-right">
          {stats?.has_data ? (
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 mt-1" title="Data available" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300 mt-1" title="No data" />
          )}
        </div>
      </div>
      {stats?.has_data && (
        <div className="mt-1 text-[11px] text-gray-500 space-y-0.5">
          <p>{stats.count.toLocaleString()} rows</p>
          <p>
            {stats.start_date} → {stats.end_date}
          </p>
        </div>
      )}
      {source.requires_key && !source.key_configured && (
        <p className="mt-1 text-[10px] text-orange-500 font-medium">
          ⚠ Set {source.key_env_var}
        </p>
      )}
    </button>
  );
}

export function SourceList() {
  const { data: sources, isLoading, error } = useQuery<SourceInfo[]>({
    queryKey: ["sources"],
    queryFn: () => fetch(endpoints.sources()).then((r) => r.json()),
  });

  if (isLoading) return <div className="p-4 text-sm text-gray-400">Loading sources…</div>;
  if (error) return <div className="p-4 text-sm text-red-500">Failed to load sources.</div>;

  const grouped = (sources ?? []).reduce<Record<string, SourceInfo[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4 p-3">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">
            {category}
          </p>
          <div className="flex flex-col gap-0.5">
            {items.map((s) => (
              <SourceCard key={s.id} source={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
