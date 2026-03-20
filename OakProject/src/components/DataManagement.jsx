import { useState, useEffect, useRef } from 'react'

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString()
}

function fmtBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return iso.split('T')[0]
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-oak-900 border-b border-oak-200 pb-2 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-oak-200 rounded-lg p-4">
      <div className="text-2xl font-bold text-oak-800">{value}</div>
      <div className="text-sm font-medium text-oak-700 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-oak-500 mt-1">{sub}</div>}
    </div>
  )
}

function Badge({ children, color = 'oak' }) {
  const colors = {
    oak: 'bg-oak-100 text-oak-700',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-oak-950 text-green-300 text-xs rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
      {children}
    </pre>
  )
}

// Column type shorthand for display
function shortType(t) {
  if (!t) return ''
  if (t.includes('VARCHAR') || t.includes('TEXT') || t.includes('STRING')) return 'text'
  if (t.includes('INTEGER') || t.includes('INT')) return 'int'
  if (t.includes('FLOAT') || t.includes('REAL') || t.includes('NUMERIC')) return 'float'
  if (t.includes('BOOLEAN')) return 'bool'
  if (t.includes('DATE') || t.includes('TIME')) return 'date'
  return t.toLowerCase().split('(')[0]
}

function TablePreview({ table }) {
  const [open, setOpen] = useState(false)
  const scrollRef = useRef(null)

  if (!table) return null
  const { table: name, row_count, columns, preview } = table

  return (
    <div className="border border-oak-200 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-oak-50 hover:bg-oak-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono font-semibold text-oak-800 text-sm">{name}</span>
          <span className="text-xs text-oak-500">{columns.length} columns</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge color="blue">{fmt(row_count)} rows</Badge>
          <span className="text-oak-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div>
          {/* Column schema strip */}
          <div className="px-4 py-2 bg-white border-b border-oak-100 flex flex-wrap gap-2">
            {columns.map(col => (
              <span key={col.name} className="inline-flex items-center gap-1 text-xs font-mono">
                <span className={`font-semibold ${col.primary_key ? 'text-amber-700' : 'text-oak-700'}`}>
                  {col.primary_key ? '🔑 ' : ''}{col.name}
                </span>
                <span className="text-oak-400">{shortType(col.type)}</span>
                {col.nullable && <span className="text-oak-300">?</span>}
              </span>
            ))}
          </div>

          {/* Data preview */}
          <div ref={scrollRef} className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr className="bg-oak-900 text-oak-100">
                  {columns.map(col => (
                    <th key={col.name} className="px-3 py-2 text-left font-mono font-medium whitespace-nowrap border-r border-oak-700 last:border-r-0">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-4 text-center text-oak-400 italic">
                      No rows yet
                    </td>
                  </tr>
                ) : preview.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-oak-50'}>
                    {columns.map(col => {
                      const val = row[col.name]
                      const display = val == null ? <span className="text-oak-300 italic">null</span>
                        : typeof val === 'boolean' ? <span className={val ? 'text-green-600' : 'text-red-500'}>{String(val)}</span>
                        : typeof val === 'string' && val.startsWith('http') ? (
                          <a href={val} target="_blank" rel="noreferrer"
                            className="text-blue-600 hover:underline truncate block max-w-[160px]">
                            {val}
                          </a>
                        )
                        : <span className="truncate block max-w-[200px]" title={String(val)}>{String(val)}</span>
                      return (
                        <td key={col.name} className="px-3 py-1.5 border-t border-oak-100 border-r border-oak-100 last:border-r-0 font-mono text-oak-700 align-top">
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {row_count > preview.length && (
            <div className="px-4 py-2 bg-oak-50 border-t border-oak-100 text-xs text-oak-400 text-right">
              Showing {preview.length} of {fmt(row_count)} rows
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 bg-oak-100 rounded w-1/3" />
      <div className="h-4 bg-oak-100 rounded w-2/3" />
      <div className="h-4 bg-oak-100 rounded w-1/2" />
    </div>
  )
}

function BackendError() {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
      <strong>Could not reach backend.</strong> Make sure FastAPI is running:
      <CodeBlock>uvicorn backend.main:app --reload --port 8000{'\n'}# or: ./dev.sh</CodeBlock>
    </div>
  )
}

export default function DataManagement() {
  const [stats, setStats] = useState(null)
  const [statsError, setStatsError] = useState(false)
  const [sources, setSources] = useState(null)
  const [sourcesError, setSourcesError] = useState(false)
  const [files, setFiles] = useState(null)
  const [filesError, setFilesError] = useState(false)
  const [tables, setTables] = useState(null)
  const [tablesError, setTablesError] = useState(false)

  // Fire all 4 requests independently — each section renders as soon as its own data arrives
  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => setStatsError(true))
    fetch('/api/admin/sources').then(r => r.json()).then(setSources).catch(() => setSourcesError(true))
    fetch('/api/admin/files').then(r => r.json()).then(setFiles).catch(() => setFilesError(true))
    fetch('/api/admin/tables').then(r => r.json()).then(setTables).catch(() => setTablesError(true))
  }, [])

  const allObsFiles = files ? [...(files.occurrences || []), ...(files.photos || [])] : []
  const hasStaticFiles = allObsFiles.length > 0

  return (
    <div className="max-w-5xl">
      {/* ── Database Overview ───────────────────────────── */}
      <Section title="Database">
        {statsError ? <BackendError /> : !stats ? <SectionSkeleton /> : (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="Total Observations"
              value={fmt(stats.total_observations)}
              sub={`${fmt(stats.total_curated)} curated`}
            />
            <StatCard
              label="Total Images"
              value={fmt(stats.total_images)}
              sub="from iNaturalist"
            />
            <StatCard
              label="GBIF Records"
              value={fmt(stats.obs_by_source?.gbif ?? 0)}
            />
            <StatCard
              label="iNat Records"
              value={fmt(stats.obs_by_source?.inat ?? 0)}
            />
          </div>
          <div className="bg-oak-50 border border-oak-200 rounded-lg p-3 text-xs text-oak-600 font-mono space-y-1 mb-6">
            <div><span className="text-oak-400">path</span>  {stats.db_path}</div>
            <div><span className="text-oak-400">size</span>  {fmtBytes(stats.db_size_bytes)}</div>
            {stats.first_import && (
              <div><span className="text-oak-400">imported</span>  {fmtDate(stats.first_import)} → {fmtDate(stats.last_import)}</div>
            )}
          </div>
        </>)}

        {/* Table Explorer — independent load */}
        <h3 className="text-sm font-semibold text-oak-700 mb-3">Tables</h3>
        {tablesError ? <BackendError /> : !tables ? <SectionSkeleton /> : (
          <div className="space-y-3">
            {tables.map(t => <TablePreview key={t.table} table={t} />)}
          </div>
        )}
      </Section>

      {/* ── Data Sources ───────────────────────────────── */}
      <Section title="Data Sources">
        {sourcesError ? <BackendError /> : !sources ? <SectionSkeleton /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-oak-50 text-oak-600 text-xs uppercase tracking-wide">
                <th className="text-left px-3 py-2 border border-oak-200">Source</th>
                <th className="text-left px-3 py-2 border border-oak-200">License</th>
                <th className="text-right px-3 py-2 border border-oak-200">Observations</th>
                <th className="text-left px-3 py-2 border border-oak-200">URL</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(src => (
                <tr key={src.source_code} className="hover:bg-oak-50">
                  <td className="px-3 py-2 border border-oak-200 font-medium text-oak-800">
                    {src.name}
                    <span className="ml-2 text-xs text-oak-400 font-mono">{src.source_code}</span>
                  </td>
                  <td className="px-3 py-2 border border-oak-200 text-oak-600">{src.license}</td>
                  <td className="px-3 py-2 border border-oak-200 text-right font-mono">
                    {src.observation_count > 0
                      ? <Badge color="green">{fmt(src.observation_count)}</Badge>
                      : <Badge color="yellow">0 — not fetched</Badge>}
                  </td>
                  <td className="px-3 py-2 border border-oak-200">
                    <a href={src.url} target="_blank" rel="noreferrer"
                      className="text-blue-600 hover:underline text-xs truncate block max-w-[180px]">
                      {src.url}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Section>

      {/* ── Per-Species Breakdown ──────────────────────── */}
      <Section title="Per-Species Breakdown">
        {statsError ? <BackendError /> : !stats ? <SectionSkeleton /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-oak-50 text-oak-600 text-xs uppercase tracking-wide">
                <th className="text-left px-3 py-2 border border-oak-200">Species</th>
                <th className="text-right px-3 py-2 border border-oak-200">GBIF</th>
                <th className="text-right px-3 py-2 border border-oak-200">iNat</th>
                <th className="text-right px-3 py-2 border border-oak-200">Images</th>
                <th className="text-right px-3 py-2 border border-oak-200">Curated</th>
                <th className="text-left px-3 py-2 border border-oak-200">Date Range</th>
              </tr>
            </thead>
            <tbody>
              {stats.species.map(sp => {
                const total = sp.gbif_count + sp.inat_count
                return (
                  <tr key={sp.species_id} className="hover:bg-oak-50">
                    <td className="px-3 py-2 border border-oak-200">
                      <div className="font-medium text-oak-800 text-xs">{sp.common_name}</div>
                      <div className="text-oak-400 italic text-xs">{sp.scientific_name}</div>
                    </td>
                    <td className="px-3 py-2 border border-oak-200 text-right font-mono text-xs text-oak-700">
                      {fmt(sp.gbif_count)}
                    </td>
                    <td className="px-3 py-2 border border-oak-200 text-right font-mono text-xs text-oak-700">
                      {fmt(sp.inat_count)}
                    </td>
                    <td className="px-3 py-2 border border-oak-200 text-right font-mono text-xs text-oak-700">
                      {fmt(sp.image_count)}
                    </td>
                    <td className="px-3 py-2 border border-oak-200 text-right text-xs">
                      {sp.curated_count > 0
                        ? <Badge color="green">{fmt(sp.curated_count)}</Badge>
                        : <span className="text-oak-400">—</span>}
                    </td>
                    <td className="px-3 py-2 border border-oak-200 text-xs text-oak-500 font-mono">
                      {total === 0
                        ? <span className="text-oak-300">no data</span>
                        : `${sp.earliest_obs ?? '?'} → ${sp.latest_obs ?? '?'}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </Section>

      {/* ── Static Export Files ───────────────────────── */}
      <Section title="Static Export Files">
        {filesError ? <BackendError /> : !files ? <SectionSkeleton /> : !hasStaticFiles ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <strong>No static files found</strong> in <code className="font-mono text-xs">data/occurrences/</code> or <code className="font-mono text-xs">data/photos/</code>.
            Run the export script to generate them for the static site.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[['occurrences', 'Occurrence GeoJSON'], ['photos', 'Photo JSON']].map(([key, label]) => (
              <div key={key}>
                <h3 className="text-sm font-semibold text-oak-700 mb-2">{label}
                  <span className="ml-2 text-xs font-normal text-oak-400">data/{key}/</span>
                </h3>
                {files[key].length === 0 ? (
                  <p className="text-xs text-oak-400 italic">No files exported yet.</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-oak-50 text-oak-500">
                        <th className="text-left px-2 py-1 border border-oak-200">File</th>
                        <th className="text-right px-2 py-1 border border-oak-200">Records</th>
                        <th className="text-right px-2 py-1 border border-oak-200">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files[key].map(f => (
                        <tr key={f.filename} className="hover:bg-oak-50">
                          <td className="px-2 py-1 border border-oak-200 font-mono text-oak-700">{f.filename}</td>
                          <td className="px-2 py-1 border border-oak-200 text-right font-mono">{fmt(f.record_count)}</td>
                          <td className="px-2 py-1 border border-oak-200 text-right text-oak-500">{fmtBytes(f.size_bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── How to Update Data — static content, no fetch needed ── */}
      <Section title="How to Update Data">
        <div className="space-y-5 text-sm text-oak-700">
          <div>
            <div className="font-medium mb-1">1. Fetch observations from GBIF &amp; iNaturalist</div>
            <p className="text-xs text-oak-500 mb-2">
              Pulls up to 300 GBIF records and 200 iNat research-grade observations per species into <code className="font-mono">oaks.db</code>.
              Safe to re-run — duplicates are skipped via unique constraint on <code className="font-mono">(source, source_record_id)</code>.
            </p>
            <CodeBlock>
              # From the OakProject/ root:{'\n'}
              uv run --with-requirements backend/requirements.txt python scripts/fetch-data.py{'\n'}
              {'\n'}
              # Or if deps are already installed:{'\n'}
              python scripts/fetch-data.py
            </CodeBlock>
          </div>

          <div>
            <div className="font-medium mb-1">2. Export to static files (for the deployed site)</div>
            <p className="text-xs text-oak-500 mb-2">
              Writes GeoJSON and photo JSON to <code className="font-mono">data/occurrences/</code> and <code className="font-mono">data/photos/</code>.
              Use <code className="font-mono">--curated-only</code> to export only hand-curated observations.
            </p>
            <CodeBlock>
              python scripts/export-static.py{'\n'}
              {'\n'}
              # Curated observations only:{'\n'}
              python scripts/export-static.py --curated-only
            </CodeBlock>
          </div>

          <div>
            <div className="font-medium mb-1">3. Build &amp; deploy the static site</div>
            <CodeBlock>
              npm run build{'\n'}
              # Deploy dist/ + data/ to Netlify / GitHub Pages / etc.
            </CodeBlock>
          </div>

          <div>
            <div className="font-medium mb-1">Data bounding box (SoCal)</div>
            <p className="text-xs text-oak-500 mb-2">Fetches are limited to this geographic window:</p>
            <CodeBlock>
              Lat:  32.5 → 35.8  (South to North){'\n'}
              Lon: -120.5 → -114.0  (West to East)
            </CodeBlock>
          </div>

          <div>
            <div className="font-medium mb-1">API docs (local backend)</div>
            <p className="text-xs text-oak-500">
              The FastAPI backend exposes interactive docs at{' '}
              <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer"
                className="text-blue-600 hover:underline font-mono">
                http://localhost:8000/docs
              </a>
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
