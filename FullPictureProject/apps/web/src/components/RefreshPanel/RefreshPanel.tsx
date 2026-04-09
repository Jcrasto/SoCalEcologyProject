import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { endpoints } from "../../config/api";
import type { SourceInfo, RefreshRequest, RefreshResponse } from "../../types/sources";

interface Props {
  source: SourceInfo;
}

export function RefreshPanel({ source }: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(oneYearAgo);
  const [endDate, setEndDate] = useState(today);
  const [lastResult, setLastResult] = useState<RefreshResponse | null>(null);

  const { mutate, isPending, error } = useMutation<RefreshResponse, Error, RefreshRequest>({
    mutationFn: (req) =>
      fetch(endpoints.sourceRefresh(source.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.detail)));
        return r.json();
      }),
    onSuccess: (data) => {
      setLastResult(data);
      // Refetch stats after a short delay to let background task start
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["stats", source.id] });
        qc.invalidateQueries({ queryKey: ["preview", source.id] });
      }, 3000);
    },
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Refresh Data</h3>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          disabled={isPending || (source.requires_key && !source.key_configured)}
          onClick={() => mutate({ start_date: startDate, end_date: endDate })}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Queuing…" : "Refresh"}
        </button>
      </div>

      {source.requires_key && !source.key_configured && (
        <p className="mt-2 text-xs text-orange-500">
          Set <code className="font-mono">{source.key_env_var}</code> in your .env to enable refresh.
        </p>
      )}

      {lastResult && (
        <p className="mt-2 text-xs text-green-600">
          ✓ Queued refresh for {lastResult.start_date} → {lastResult.end_date}. Stats will update shortly.
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500">Error: {error.message}</p>
      )}
    </div>
  );
}
