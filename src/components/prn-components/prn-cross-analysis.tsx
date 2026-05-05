import { useState, useMemo } from 'react'
import { formatCurrency, formatPercentage } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  History,
  Filter,
  FileText,
  ChevronDown,
  ChevronRight,
  Layers,
  Sheet,
} from 'lucide-react'
import { generateAuditPDF, generateGroupedAuditPDF } from '@/lib/export-pdf'
import { generateAuditExcel, generateGroupedAuditExcel } from '@/lib/export-excel'
import { buildCockpitRows, groupDuplicateRows, CockpitRow } from '@/lib/audit-utils'

// ─── Unidade badge config ─────────────────────────────────────────────

const UNIT_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  'PRN MATRIZ': { label: 'PRN MATRIZ', bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400' },
  CAMBORIU: { label: 'Camboriú', bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400' },
  PALHOCA: { label: 'Palhoça', bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400' },
}

function unitBadge(unidade: string) {
  const cfg = UNIT_CONFIG[unidade] ?? {
    label: unidade,
    bg: 'bg-white/10 border-white/20',
    text: 'text-white/50',
  }
  return (
    <Badge className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border', cfg.bg, cfg.text)}>
      {cfg.label}
    </Badge>
  )
}

// ─── Money cell helpers ─────────────────────────────────────────────────

function MoneyCell({ value, highlight = false }: { value: number; highlight?: boolean }) {
  return (
    <span
      className={cn(
        'font-mono text-xs tabular-nums',
        value === 0
          ? 'text-white/20'
          : highlight
          ? 'font-bold text-blue-400 text-sm'
          : 'text-white/50',
      )}
    >
      {formatCurrency(value)}
    </span>
  )
}

// ─── Expandable departamentos ─────────────────────────────────────────────

function DeptExpander({ row }: { row: CockpitRow }) {
  const [open, setOpen] = useState(false)
  const hasDepts = row.departamentos.length > 0

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        {hasDepts && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-white/30 hover:text-white/70 transition-colors"
            aria-label="Expandir departamentos"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        <span className="font-bold text-white text-xs truncate max-w-[180px]">{row.favorecido}</span>
      </div>
      {open && hasDepts && (
        <div className="ml-4 space-y-0.5 border-l border-white/10 pl-2 mt-1">
          {row.departamentos.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-[10px]">
              <span className="text-white/40 uppercase truncate max-w-[150px]">{d.dept}</span>
              <span className="font-mono text-white/50">{formatCurrency(d.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Filter bar types ─────────────────────────────────────────────────

const FILTERS: Array<{ id: string; label: string; color: string }> = [
  { id: 'all', label: 'Todos', color: 'text-white' },
  { id: 'Aumento', label: 'Aumento', color: 'text-red-400' },
  { id: 'Queda', label: 'Queda', color: 'text-emerald-400' },
  { id: 'Novo', label: 'Novo', color: 'text-blue-400' },
  { id: 'Igual', label: 'Igual', color: 'text-white/40' },
]

// ─── Main component ─────────────────────────────────────────────────

export function PrnCrossAnalysis({ data, fullPayload }: { data?: any; fullPayload?: any }) {
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingGrouped, setIsExportingGrouped] = useState(false)
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [isExportingExcelGrouped, setIsExportingExcelGrouped] = useState(false)
  const [sortKey, setSortKey] = useState<keyof CockpitRow | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Build cockpit rows from all 3 blocks
  const allRows = useMemo<CockpitRow[]>(() => {
    // Busca byBlock diretamente em data ou dentro de data.crossAnalysis
    const byBlock = data?.byBlock || data?.crossAnalysis?.byBlock
    const result: CockpitRow[] = []

    if (byBlock && typeof byBlock === 'object') {
      for (const key of ['prn_matriz', 'camboriu', 'palhoca']) {
        const blockRows = Array.isArray(byBlock[key]?.rows) ? byBlock[key].rows : []
        result.push(...buildCockpitRows(key, blockRows))
      }
    } else {
      const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : []
      const byBlockFallback: Record<string, any[]> = { prn_matriz: [], camboriu: [], palhoca: [] }
      for (const row of rows) {
        const b = row._block || 'prn_matriz'
        ;(byBlockFallback[b] = byBlockFallback[b] || []).push(row)
      }
      for (const [key, blockRows] of Object.entries(byBlockFallback)) {
        result.push(...buildCockpitRows(key, blockRows))
      }
    }

    // Agrupa duplicados (mesmo favorecido + categoria + unidade)
    return groupDuplicateRows(result)
  }, [data])

  // Group rows by unidade
  const rowsByUnidade = useMemo(() => {
    const grouped: Record<string, CockpitRow[]> = {
      'PRN MATRIZ': [],
      'CAMBORIU': [],
      'PALHOCA': [],
    }
    for (const r of allRows) {
      if (grouped[r.unidade]) grouped[r.unidade].push(r)
    }
    return grouped
  }, [allRows])

  // Filter and sort function
  const filterAndSortRows = (rows: CockpitRow[]) => {
    let filtered = filterStatus === 'all' ? rows : rows.filter((r) => r.status === filterStatus)
    if (sortKey) {
      filtered = [...filtered].sort((a, b) => {
        const va = a[sortKey] as any
        const vb = b[sortKey] as any
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return filtered
  }

  // Summary counts
  const counts = useMemo(() => {
    const c = { Aumento: 0, Queda: 0, Novo: 0, Igual: 0 }
    for (const r of allRows) c[r.status]++
    return c
  }, [allRows])

  const handleSort = (key: keyof CockpitRow) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await generateAuditPDF(fullPayload)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportGrouped = async () => {
    setIsExportingGrouped(true)
    try {
      await generateGroupedAuditPDF(fullPayload)
    } finally {
      setIsExportingGrouped(false)
    }
  }

  const handleExportExcel = async () => {
    setIsExportingExcel(true)
    try {
      await generateAuditExcel(fullPayload)
    } finally {
      setIsExportingExcel(false)
    }
  }

  const handleExportExcelGrouped = async () => {
    setIsExportingExcelGrouped(true)
    try {
      await generateGroupedAuditExcel(fullPayload)
    } finally {
      setIsExportingExcelGrouped(false)
    }
  }

  if (!data || (!Array.isArray(data?.rows) && !Array.isArray(data) && !data?.byBlock && !data?.crossAnalysis?.byBlock)) return null

  // ─── Sortable column header ──────────────────────────────────────────
  const SortTh = ({
    label,
    field,
    align = 'left',
  }: {
    label: string
    field: keyof CockpitRow
    align?: 'left' | 'right' | 'center'
  }) => {
    const active = sortKey === field
    return (
      <th
        className={cn(
          'px-3 py-3 text-[9px] font-black uppercase tracking-widest text-white/30 cursor-pointer select-none hover:text-white/60 transition-colors whitespace-nowrap',
          align === 'right' && 'text-right',
          align === 'center' && 'text-center',
        )}
        onClick={() => handleSort(field)}
      >
        {label}
        {active && (
          <span className="ml-1 text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </th>
    )
  }

  return (
    <div className="space-y-6 mt-10 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
      {/* Header */}
      <div className="space-y-4 border-b border-white/5 pb-6">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="space-y-2">
              <h3 className="text-2xl font-black text-white flex items-center gap-3 tracking-tighter">
                <div className="p-2 bg-blue-500/10 rounded-xl">
                  <History className="h-6 w-6 text-blue-400" />
                </div>
                Cockpit Financeiro — Cruzamento vs Abril
              </h3>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] pl-14">
              {allRows.length} favorecidos · {counts.Aumento} aumentos · {counts.Queda} quedas ·{' '}
              {counts.Novo} novos · {counts.Igual} iguais
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="border-white/10 bg-white/5 hover:bg-white/10 text-white/70 font-bold rounded-xl h-10 px-4 transition-all"
          >
            <FileText className={cn('h-4 w-4 mr-2 text-red-400', isExporting && 'animate-pulse')} />
            {isExporting ? 'Exportando...' : 'Exportar PDF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportGrouped}
            disabled={isExportingGrouped}
            className="border-white/10 bg-white/5 hover:bg-white/10 text-white/70 font-bold rounded-xl h-10 px-4 transition-all"
          >
            <Layers className={cn('h-4 w-4 mr-2 text-purple-400', isExportingGrouped && 'animate-pulse')} />
            {isExportingGrouped ? 'Exportando...' : 'PDF Agrupado'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 font-bold rounded-xl h-10 px-4 transition-all"
          >
            <Sheet className={cn('h-4 w-4 mr-2', isExportingExcel && 'animate-pulse')} />
            {isExportingExcel ? 'Exportando...' : 'Exportar Excel'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcelGrouped}
            disabled={isExportingExcelGrouped}
            className="border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 text-teal-400 font-bold rounded-xl h-10 px-4 transition-all"
          >
            <Sheet className={cn('h-4 w-4 mr-2', isExportingExcelGrouped && 'animate-pulse')} />
            {isExportingExcelGrouped ? 'Exportando...' : 'Excel Agrupado'}
          </Button>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-3 bg-white/[0.03] p-1.5 rounded-2xl border border-white/5 overflow-x-auto max-w-full">
          <div className="flex items-center gap-1.5 px-3">
            <Filter className="h-4 w-4 text-blue-400" />
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">Filtros</span>
          </div>
          <div className="flex items-center gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                variant="ghost"
                size="sm"
                onClick={() => setFilterStatus(f.id)}
                className={cn(
                  'whitespace-nowrap rounded-xl h-9 text-[11px] font-bold uppercase tracking-widest transition-all px-4',
                  filterStatus === f.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-white/40 hover:bg-white/5 hover:text-white',
                )}
              >
                <span
                  className={cn(
                    'mr-1.5 w-1.5 h-1.5 rounded-full inline-block',
                    f.color.replace('text-', 'bg-'),
                  )}
                />
                {f.label}
                {f.id !== 'all' && (
                  <span className="ml-1.5 text-white/30">
                    {counts[f.id as keyof typeof counts] ?? 0}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Blocks by Unidade */}
      {(['PRN MATRIZ', 'CAMBORIU', 'PALHOCA'] as const).map((unidade) => {
        const blockRows = filterAndSortRows(rowsByUnidade[unidade] || [])
        const hasData = blockRows.length > 0
        const cfg = UNIT_CONFIG[unidade] ?? { label: unidade, bg: 'bg-white/10 border-white/20', text: 'text-white/50' }

        return (
          <div key={unidade} className="mb-8">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
              <div className={cn("p-2 rounded-xl border", cfg.bg)}>
                <History className={cn("h-5 w-5", cfg.text)} />
              </div>
              <div>
                <h4 className={cn("text-xl font-bold tracking-tighter", cfg.text)}>
                  {cfg.label}
                </h4>
                <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest">
                  {blockRows.length} registros encontrados
                </p>
              </div>
            </div>

            {!hasData ? (
              <div className="p-20 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                <div className="bg-white/5 p-4 rounded-full w-fit mx-auto mb-4">
                  <Filter className="h-8 w-8 text-white/20" />
                </div>
                <p className="text-white/30 font-bold uppercase text-[10px] tracking-widest">
                  Nenhum registro encontrado para este filtro
                </p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.04] border-b border-white/10">
                      <tr>
                        <SortTh label="Favorecido" field="favorecido" />
                        <SortTh label="Categoria" field="categoria" />
                        <SortTh label="Fev" field="fev" align="right" />
                        <SortTh label="Mar" field="mar" align="right" />
                        <SortTh label="Abr" field="abr" align="right" />
                        <SortTh label="Média" field="media" align="right" />
                        <SortTh label="Atual" field="atual" align="right" />
                        <SortTh label="Var %" field="varPct" align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {blockRows.map((row, i) => (
                        <tr
                          key={i}
                          className={cn(
                            'border-b border-white/5 transition-colors hover:bg-white/[0.03]',
                            i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]',
                          )}
                        >
                          {/* Favorecido */}
                          <td className="px-3 py-3 min-w-[160px]">
                            <DeptExpander row={row} />
                          </td>

                          {/* Categoria */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            {row.categoria ? (
                              <Badge className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border bg-purple-500/10 text-purple-400 border-purple-500/30 max-w-[160px] truncate">
                                {row.categoria}
                              </Badge>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>

                          {/* Fev */}
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.fev} />
                          </td>

                          {/* Mar */}
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.mar} />
                          </td>

                          {/* Abr */}
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.abr} />
                          </td>

                          {/* Média */}
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.media} />
                          </td>

                          {/* Atual */}
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.atual} highlight />
                          </td>

                          {/* Var % */}
                          <td className="px-3 py-3 text-right">
                            <span className={cn(
                              'font-mono text-xs font-bold tabular-nums',
                              row.varPct > 0 ? 'text-red-400' : row.varPct < 0 ? 'text-emerald-400' : 'text-white/20'
                            )}>
                              {row.varPct !== 0 ? formatPercentage(row.varPct) : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
