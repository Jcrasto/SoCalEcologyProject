import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SourceList } from "./components/SourceList/SourceList";
import { RefreshPanel } from "./components/RefreshPanel/RefreshPanel";
import { DataPreview } from "./components/DataPreview/DataPreview";
import { SqlEditor } from "./components/SqlEditor/SqlEditor";
import { useSourceStore } from "./stores/sourceStore";
import { endpoints } from "./config/api";
import type { SourceInfo, SourceStats } from "./types/sources";

const CesiumGlobe = lazy(() =>
  import("./components/Globe/CesiumGlobe").then((m) => ({ default: m.CesiumGlobe }))
);

type Tab = "explorer" | "sql" | "globe";

export default function App() {
  const [tab, setTab] = useState<Tab>("explorer");
  const { selectedSourceId } = useSourceStore();

  const { data: sources } = useQuery<SourceInfo[]>({
    queryKey: ["sources"],
    queryFn: () => fetch(endpoints.sources()).then((r) => r.json()),
  });

  const selectedSource = sources?.find((s) => s.id === selectedSourceId);

  const { data: stats } = useQuery<SourceStats>({
    queryKey: ["stats", selectedSourceId],
    queryFn: () =>
      fetch(endpoints.sourceStats(selectedSourceId!)).then((r) => r.json()),
    enabled: !!selectedSourceId,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "explorer", label: "Explorer" },
    { id: "sql", label: "SQL" },
    { id: "globe", label: "Globe" },
  ];

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* Sidebar — only shown on explorer tab */}
      {tab === "explorer" && (
        <aside className="w-64 shrink-0 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <h1 className="text-base font-bold text-gray-900">FullPicture</h1>
            <p className="text-[11px] text-gray-400">Data Explorer</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SourceList />
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-4 shrink-0 relative z-20">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {tab === "explorer" && (
            <div className="h-full overflow-y-auto">
              {selectedSource ? (
                <div className="p-6 max-w-6xl mx-auto space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{selectedSource.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{selectedSource.description}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <StatCard label="Total rows" value={stats?.has_data ? stats.count.toLocaleString() : "—"} />
                    <StatCard label="Earliest date" value={stats?.start_date ?? "—"} />
                    <StatCard label="Latest date" value={stats?.end_date ?? "—"} />
                  </div>
                  <RefreshPanel source={selectedSource} />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Data Preview</h3>
                    <DataPreview sourceId={selectedSource.id} stats={stats} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <div className="text-5xl mb-4">🌐</div>
                  <h2 className="text-lg font-semibold text-gray-700">Select a data source</h2>
                  <p className="text-sm text-gray-400 mt-1 max-w-sm">
                    Choose a source from the sidebar to preview data, view statistics, and trigger refreshes.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "sql" && <SqlEditor />}

          {tab === "globe" && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-gray-400">
                  Loading globe…
                </div>
              }
            >
              <CesiumGlobe sourceId={selectedSourceId ?? ""} data={undefined} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}
