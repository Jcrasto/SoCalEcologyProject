export const API_BASE = "/api";

export const endpoints = {
  query: () => `${API_BASE}/query`,
  schema: () => `${API_BASE}/schema`,
  sources: () => `${API_BASE}/sources`,
  sourceStats: (id: string) => `${API_BASE}/sources/${id}/stats`,
  sourcePreview: (id: string, limit = 100) =>
    `${API_BASE}/sources/${id}/preview?limit=${limit}`,
  sourceRefresh: (id: string) => `${API_BASE}/sources/${id}/refresh`,
  data: (id: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return `${API_BASE}/data/${id}${qs ? `?${qs}` : ""}`;
  },
};
