import { useEffect, useRef, useState } from 'react'

const API_BASE = 'http://localhost:8009/api/v1'

interface TableInfo {
  id: string
  label: string
  icon: string
  total_records: number
  columns: string[]
  preview: Record<string, unknown>[]
}

interface TablesResponse {
  tables: TableInfo[]
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root: {
    position: 'fixed' as const,
    inset: 0,
    background: '#080c14',
    color: '#e2e8f0',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(10,14,23,0.95)',
    flexShrink: 0,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#f1f5f9',
    letterSpacing: '0.02em',
  },
  subtitle: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#60a5fa',
    fontSize: 13,
    cursor: 'pointer',
  },
  sourceRefreshBtn: (spinning: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 9px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: spinning ? '#38bdf8' : '#64748b',
    fontSize: 12,
    cursor: spinning ? 'default' : 'pointer',
    transition: 'color 0.15s',
  }),
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 24,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 10,
  },
  summaryCard: (hasData: boolean) => ({
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${hasData ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)'}`,
    background: hasData ? 'rgba(96,165,250,0.06)' : 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  }),
  summaryIcon: {
    fontSize: 20,
    lineHeight: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 6,
  },
  summaryCount: (hasData: boolean) => ({
    fontSize: 20,
    fontWeight: 700,
    color: hasData ? '#60a5fa' : '#334155',
    marginTop: 2,
    fontVariantNumeric: 'tabular-nums',
  }),
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 10,
  },
  tableCard: {
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  tableCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(255,255,255,0.02)',
  },
  tableCardIcon: {
    fontSize: 16,
  },
  tableCardLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    color: '#e2e8f0',
  },
  badge: (hasData: boolean) => ({
    fontSize: 11,
    fontWeight: 600,
    color: hasData ? '#34d399' : '#475569',
    background: hasData ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
    padding: '2px 8px',
    borderRadius: 12,
    fontVariantNumeric: 'tabular-nums',
  }),
  tableWrapper: {
    overflowX: 'auto' as const,
    maxHeight: 280,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 12,
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    color: '#64748b',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.2)',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
  },
  td: (idx: number) => ({
    padding: '7px 12px',
    color: '#94a3b8',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
    whiteSpace: 'nowrap' as const,
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  emptyRow: {
    padding: '24px 16px',
    color: '#334155',
    fontSize: 12,
    textAlign: 'center' as const,
  },
  loadingOverlay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    color: '#475569',
    fontSize: 14,
  },
  errorBox: {
    margin: '20px',
    padding: '16px',
    borderRadius: 10,
    border: '1px solid rgba(239,68,68,0.3)',
    background: 'rgba(239,68,68,0.08)',
    color: '#fca5a5',
    fontSize: 13,
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export function DataExplorer({ onBack }: Props) {
  const [data, setData] = useState<TablesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({})
  const fetchAfterRefresh = useRef(false)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/admin/tables`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: TablesResponse = await res.json()
      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function refreshSource(id: string) {
    if (refreshing.has(id) || refreshingAll) return
    setRefreshing((prev) => new Set(prev).add(id))
    setSourceErrors((prev) => { const n = { ...prev }; delete n[id]; return n })
    try {
      const res = await fetch(`${API_BASE}/admin/refresh/${id}`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
    } catch (e: unknown) {
      setSourceErrors((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setRefreshing((prev) => { const n = new Set(prev); n.delete(id); return n })
      fetchData()
    }
  }

  async function refreshAll() {
    if (refreshingAll) return
    setRefreshingAll(true)
    setSourceErrors({})
    try {
      const res = await fetch(`${API_BASE}/admin/refresh`, { method: 'POST' })
      if (res.ok) {
        const body = await res.json()
        if (!body.ok && body.errors) {
          setSourceErrors(body.errors)
        }
      }
    } catch {
      // best-effort
    } finally {
      setRefreshingAll(false)
      fetchAfterRefresh.current = true
      fetchData()
    }
  }

  useEffect(() => { fetchData() }, [])

  function scrollTo(id: string) {
    setFocusId(id)
    document.getElementById(`table-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const totalRecords = data?.tables.reduce((s, t) => s + t.total_records, 0) ?? 0
  const anyRefreshing = refreshingAll || refreshing.size > 0

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>
          ← Globe
        </button>
        <div style={S.titleBlock}>
          <div style={S.title}>Data Explorer</div>
          <div style={S.subtitle}>
            {data
              ? `${data.tables.length} tables · ${totalRecords.toLocaleString()} total records`
              : 'Loading…'}
          </div>
        </div>
        <button style={S.refreshBtn} onClick={fetchData} disabled={loading || anyRefreshing}>
          {loading ? 'Loading…' : '↻ Stats'}
        </button>
        <button style={{ ...S.refreshBtn, color: refreshingAll ? '#38bdf8' : '#60a5fa' }} onClick={refreshAll} disabled={anyRefreshing}>
          {refreshingAll ? 'Refreshing…' : '↻ Refresh All'}
        </button>
      </div>

      {/* Body */}
      <div style={S.body}>
        {error && (
          <div style={S.errorBox}>
            Failed to load table stats: {error}
          </div>
        )}

        {loading && !data && (
          <div style={S.loadingOverlay}>Loading table stats…</div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div>
              <div style={S.sectionTitle}>All Tables</div>
              <div style={S.summaryGrid}>
                {data.tables.map((t) => (
                  <div
                    key={t.id}
                    style={S.summaryCard(t.total_records > 0)}
                    onClick={() => scrollTo(t.id)}
                  >
                    <div style={S.summaryIcon}>{t.icon}</div>
                    <div style={S.summaryLabel}>{t.label}</div>
                    <div style={S.summaryCount(t.total_records > 0)}>
                      {t.total_records.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-table detail */}
            <div>
              <div style={S.sectionTitle}>Table Previews (10 rows)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {data.tables.map((t) => (
                  <div
                    key={t.id}
                    id={`table-${t.id}`}
                    style={{
                      ...S.tableCard,
                      ...(focusId === t.id
                        ? { border: '1px solid rgba(96,165,250,0.35)' }
                        : {}),
                    }}
                  >
                    {/* Card header */}
                    <div style={S.tableCardHeader}>
                      <span style={S.tableCardIcon}>{t.icon}</span>
                      <span style={S.tableCardLabel}>{t.label}</span>
                      {sourceErrors[t.id] && (
                        <span style={{ fontSize: 11, color: '#fca5a5', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sourceErrors[t.id]}>
                          ⚠ {sourceErrors[t.id]}
                        </span>
                      )}
                      <span style={S.badge(t.total_records > 0)}>
                        {t.total_records.toLocaleString()} records
                      </span>
                      <button
                        style={S.sourceRefreshBtn(refreshing.has(t.id) || refreshingAll)}
                        onClick={(e) => { e.stopPropagation(); refreshSource(t.id) }}
                        disabled={refreshing.has(t.id) || refreshingAll}
                        title={`Refresh ${t.label}`}
                      >
                        {refreshing.has(t.id) ? '⟳' : '↻'}
                      </button>
                    </div>

                    {/* Table grid */}
                    {t.columns.length === 0 ? (
                      <div style={S.emptyRow}>No data collected yet</div>
                    ) : (
                      <div style={S.tableWrapper}>
                        <table style={S.table}>
                          <thead>
                            <tr>
                              {t.columns.map((col) => (
                                <th key={col} style={S.th}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {t.preview.length === 0 ? (
                              <tr>
                                <td colSpan={t.columns.length} style={S.emptyRow}>
                                  No rows
                                </td>
                              </tr>
                            ) : (
                              t.preview.map((row, ri) => (
                                <tr key={ri}>
                                  {t.columns.map((col) => {
                                    const val = row[col]
                                    const display =
                                      val === null || val === undefined
                                        ? '—'
                                        : String(val)
                                    return (
                                      <td key={col} style={S.td(ri)} title={display}>
                                        {display}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
