const monthNames: Record<string, string> = {
  '01': 'Janeiro',
  '02': 'Fevereiro',
  '03': 'Março',
  '04': 'Abril',
  '05': 'Maio',
  '06': 'Junho',
  '07': 'Julho',
  '08': 'Agosto',
  '09': 'Setembro',
  '10': 'Outubro',
  '11': 'Novembro',
  '12': 'Dezembro',
}

export function formatMonthName(monthCode: string): string {
  if (!monthCode || !monthCode.includes('-')) return monthCode
  const [, month] = monthCode.split('-')
  const name = monthNames[month]
  return name ? `${name}` : monthCode
}

export interface AuditRow {
  nome: string
  categoria?: string | null
  valorDia: number
  valorPago: number
  qtdTitulosDia: number
  totalHistorico: number
  mediaHistoricaMensal: number
  divergenciaPct: number | null
  alertaDivergencia25: boolean
  direcaoDivergencia: string
  grupoMensal: string
  meses: Record<string, number>
  categoriaOriginal?: string
  categoriaCruzamento?: string | null
  subcategoria?: string | null
  subcategoriaOriginal?: string | null
  subcategoriaCruzamento?: string | null
  subcategoriaLabel?: string | null
  departamento?: string
}

export function normalizeAuditData(rawRows: any[], _months: string[]): AuditRow[] {
  return rawRows.map(row => ({
    nome: row.nome || 'Desconhecido',
    categoria: row.categoria || null,
    valorDia: row.valorDia || 0,
    valorPago: row.valorPago || row.valorDia || 0,
    qtdTitulosDia: row.qtdTitulosDia || 1,
    totalHistorico: row.totalHistorico || 0,
    mediaHistoricaMensal: row.mediaHistoricaMensal || 0,
    divergenciaPct: row.divergenciaPct,
    alertaDivergencia25: !!row.alertaDivergencia25,
    direcaoDivergencia: row.direcaoDivergencia || 'estavel',
    grupoMensal: row.grupoMensal || 'outros',
    meses: row.meses || {},
    categoriaOriginal: row.categoriaOriginal,
    categoriaCruzamento: row.categoriaCruzamento || null,
    subcategoria: row.subcategoria || null,
    subcategoriaOriginal: row.subcategoriaOriginal || null,
    subcategoriaCruzamento: row.subcategoriaCruzamento || null,
    subcategoriaLabel: row.subcategoriaLabel || null,
    departamento: row.departamento
  }))
}

export type CockpitStatus = 'Aumento' | 'Queda' | 'Novo' | 'Igual'

export interface CockpitRow {
  unidade: string
  favorecido: string
  categoria: string
  fev: number
  mar: number
  abr: number
  mai: number
  atual: number
  difVsAbr: number
  difVsMai: number
  status: CockpitStatus
  tipoMatch: string
  qtdDepartamentos: number
  departamentos: Array<{ dept: string; valor: number }>
  media: number
  varPct: number
  dataRegistro?: string
  vencimento?: string
  _raw?: any
}

export function ns(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s).trim().toUpperCase().replace(/\s+/g, ' ')
}

export function catMatch(curCat: string, histCat: string): boolean {
  if (curCat === histCat) return true
  if (curCat.includes('HONOR') && histCat.includes('HONOR')) {
    if (histCat.includes('PJ & SCP') && (curCat.includes('PJ') || curCat.includes('SCP'))) return true
    if (curCat.includes('PJ & SCP') && (histCat.includes('PJ') || histCat.includes('SCP'))) return true
  }
  return false
}

export function calcStatus(dif: number, tipoMatch: string): CockpitStatus {
  if (dif > 0.01) return 'Aumento'
  if (dif < -0.01) return 'Queda'
  if (tipoMatch.includes('Novo')) return 'Novo'
  return 'Igual'
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function numberValue(...values: unknown[]): number {
  const value = values.find(v => v !== undefined && v !== null)
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function mergeHistoricalBaseline(existing: CockpitRow, row: CockpitRow) {
  const existingHasHistory = existing.mar > 0 || existing.abr > 0 || existing.mai > 0
  const incomingHasHistory = row.mar > 0 || row.abr > 0 || row.mai > 0

  if (!existingHasHistory && incomingHasHistory) {
    existing.fev = row.fev
    existing.mar = row.mar
    existing.abr = row.abr
    existing.mai = row.mai
  }
}

function recalculateGroupedRow(row: CockpitRow) {
  const mesesValidos = [row.mar, row.abr, row.mai].filter(v => v > 0)
  row.media = mesesValidos.length > 0
    ? roundMoney((row.mar + row.abr + row.mai) / mesesValidos.length)
    : 0
  row.difVsAbr = roundMoney(row.atual - row.abr)
  row.difVsMai = roundMoney(row.atual - row.mai)
  row.varPct = row.mai > 0
    ? Math.round(((row.atual - row.mai) / row.mai) * 10000) / 100
    : (row.atual > 0 ? 100 : 0)
  row.status = calcStatus(row.difVsMai, row.tipoMatch)
  row.fev = roundMoney(row.fev)
  row.mar = roundMoney(row.mar)
  row.abr = roundMoney(row.abr)
  row.mai = roundMoney(row.mai)
  row.atual = roundMoney(row.atual)
}

function monthNum(code: string): number {
  const parts = code.split('-')
  return parts.length === 2 ? parseInt(parts[1], 10) : 0
}

function extractHistoricalMonths(row: any): { fev: number; mar: number; abr: number; mai: number } {
  // 1. Prioridade para campos diretos (novo formato n8n V5)
  if (
    typeof row.fev !== 'undefined' ||
    typeof row.mar !== 'undefined' ||
    typeof row.abr !== 'undefined' ||
    typeof row.mai !== 'undefined' ||
    typeof row.maio !== 'undefined' ||
    typeof row.may !== 'undefined'
  ) {
    return {
      fev: numberValue(row.fev),
      mar: numberValue(row.mar),
      abr: numberValue(row.abr),
      mai: numberValue(row.mai, row.maio, row.may)
    }
  }

  // 2. Fallback para objeto meses (formato antigo/legado)
  const meses: Record<string, number> = row.meses || {}
  const sorted = Object.entries(meses)
    .filter(([k]) => /^\d{4}-\d{2}$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b))

  const fev = sorted.find(([k]) => monthNum(k) === 2)?.[1] ?? 0
  const mar = sorted.find(([k]) => monthNum(k) === 3)?.[1] ?? 0
  const abr = sorted.find(([k]) => monthNum(k) === 4)?.[1] ?? 0
  const mai = sorted.find(([k]) => monthNum(k) === 5)?.[1] ?? 0
  return { fev: numberValue(fev), mar: numberValue(mar), abr: numberValue(abr), mai: numberValue(mai) }
}

export function buildCockpitRows(blockKey: string, rows: any[]): CockpitRow[] {
  const UNIT_LABELS: Record<string, string> = {
    prn_matriz: 'PRN MATRIZ',
    MATRIZ: 'PRN MATRIZ',
    camboriu: 'CAMBORIU',
    palhoca: 'PALHOCA',
  }
  const unidade = UNIT_LABELS[blockKey] ?? blockKey.toUpperCase()

  return rows.map((row) => {
    const favorecido = ns(row.nome || row.favorecido || row.name || '')
    const categoria = ns(row.categoria || row.categoriaOriginal || '')
    
    // Extrai Mar/Abr/Maio, preservando Fev apenas para compatibilidade com relatórios antigos.
    const { fev, mar, abr, mai } = extractHistoricalMonths(row)
    
    const atual = Number(row.atual ?? row.valorPago ?? row.valorDia ?? 0)
    const difVsAbr = typeof row.difVsAbr === 'number' ? row.difVsAbr : (atual - abr)
    const difVsMai = typeof row.difVsMai === 'number'
      ? row.difVsMai
      : (typeof row.difVsMaio === 'number' ? row.difVsMaio : (atual - mai))

    let tipoMatch = row.tipoMatch || ''
    if (!tipoMatch) {
      const temHistorico = row.temHistorico ?? (mar > 0 || abr > 0 || mai > 0)
      tipoMatch = temHistorico ? 'Match exato (favorecido + categoria)' : 'Novo (sem historico)'
    }

    const status = calcStatus(difVsMai, tipoMatch)

    const departamentos: Array<{ dept: string; valor: number }> = []
    if (Array.isArray(row.dailyLines)) {
      for (const dl of row.dailyLines) {
        const dept = ns(dl.departamento || dl.dept || '')
        if (dept) departamentos.push({ dept, valor: Number(dl.valor ?? 0) })
      }
    } else if (Array.isArray(row.departamentos)) {
      // Suporte ao formato novo do n8n que já envia departamentos
      for (const d of row.departamentos) {
        departamentos.push({ dept: ns(d.dept || d.departamento || ''), valor: Number(d.valor ?? 0) })
      }
    } else if (row.departamento) {
      departamentos.push({ dept: ns(row.departamento), valor: atual })
    }

    const mesesValidos = [mar, abr, mai].filter(v => v > 0)
    const media = mesesValidos.length > 0 ? (mar + abr + mai) / mesesValidos.length : 0
    const varPct = mai > 0 ? ((atual - mai) / mai) * 100 : (atual > 0 ? 100 : 0)

    return {
      unidade,
      favorecido,
      categoria,
      fev,
      mar,
      abr,
      mai,
      atual,
      difVsAbr,
      difVsMai,
      status,
      tipoMatch,
      qtdDepartamentos: departamentos.length,
      departamentos,
      media: Math.round(media * 100) / 100,
      varPct: Math.round(varPct * 100) / 100,
      dataRegistro: row.dataRegistro || row.data_registro || undefined,
      vencimento: row.vencimento || undefined,
      _raw: row,
    }
  })
}

export function groupRowsConsolidated(allRows: CockpitRow[]): CockpitRow[] {
  const map = new Map<string, CockpitRow>()

  for (const row of groupDuplicateRows(allRows)) {
    const key = `${row.favorecido}|||${row.categoria}`
    if (!map.has(key)) {
      map.set(key, {
        unidade: 'CONSOLIDADO',
        favorecido: row.favorecido,
        categoria: row.categoria,
        fev: row.fev,
        mar: row.mar,
        abr: row.abr,
        mai: row.mai,
        atual: row.atual,
        difVsAbr: row.difVsAbr,
        difVsMai: row.difVsMai,
        status: row.status,
        tipoMatch: row.tipoMatch,
        qtdDepartamentos: 0,
        departamentos: [],
        media: row.media,
        varPct: row.varPct,
        _raw: row._raw
      })
    } else {
      const existing = map.get(key)!
      existing.fev += row.fev
      existing.mar += row.mar
      existing.abr += row.abr
      existing.mai += row.mai
      existing.atual += row.atual
      
      if (row.tipoMatch === 'Novo (sem historico)') {
        existing.tipoMatch = 'Novo (sem historico)'
      }
    }
  }

  for (const row of map.values()) {
    recalculateGroupedRow(row)
  }

  return Array.from(map.values())
}

export function groupRowsByUnitConsolidated(rows: CockpitRow[]): CockpitRow[] {
  const map = new Map<string, CockpitRow>()

  for (const row of rows) {
    const key = `${row.favorecido}|||${row.categoria}`
    if (!map.has(key)) {
      map.set(key, { ...row, departamentos: [], qtdDepartamentos: 0 })
    } else {
      const existing = map.get(key)!
      existing.atual += row.atual
      // Mar/Abr/Maio are already historical totals for this key; duplicate current rows repeat them.
      mergeHistoricalBaseline(existing, row)
    }
  }

  for (const row of map.values()) {
    recalculateGroupedRow(row)
  }

  return Array.from(map.values())
}

export function groupDuplicateRows(rows: CockpitRow[]): CockpitRow[] {
  const map = new Map<string, CockpitRow>()

  for (const row of rows) {
    const key = `${row.unidade}|||${row.favorecido}|||${row.categoria}`
    if (!map.has(key)) {
      map.set(key, { ...row, departamentos: [...row.departamentos] })
    } else {
      const existing = map.get(key)!
      existing.atual += row.atual
      mergeHistoricalBaseline(existing, row)
      existing.departamentos.push(...row.departamentos)
      existing.qtdDepartamentos = existing.departamentos.length
      recalculateGroupedRow(existing)
    }
  }

  return Array.from(map.values())
}
