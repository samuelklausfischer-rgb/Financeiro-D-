import { formatCurrency, formatPercentage } from './formatters'

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
  const [year, month] = monthCode.split('-')
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

export function normalizeAuditData(rawRows: any[], months: string[]): AuditRow[] {
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
  jan: number
  fev: number
  mar: number
  atual: number
  difVsMar: number
  status: CockpitStatus
  tipoMatch: string
  qtdDepartamentos: number
  departamentos: Array<{ dept: string; valor: number }>
  media: number
  varPct: number
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
  if (tipoMatch === 'Novo (sem historico)') return 'Novo'
  if (dif > 0.01) return 'Aumento'
  if (dif < -0.01) return 'Queda'
  return 'Igual'
}

function monthNum(code: string): number {
  const parts = code.split('-')
  return parts.length === 2 ? parseInt(parts[1], 10) : 0
}

function extractJanFevMar(meses: Record<string, number>): { jan: number; fev: number; mar: number } {
  const sorted = Object.entries(meses)
    .filter(([k]) => /^\d{4}-\d{2}$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b))

  const jan = sorted.find(([k]) => monthNum(k) === 1)?.[1] ?? 0
  const fev = sorted.find(([k]) => monthNum(k) === 2)?.[1] ?? 0
  const mar = sorted.find(([k]) => monthNum(k) === 3)?.[1] ?? 0
  return { jan, fev, mar }
}

export function buildCockpitRows(blockKey: string, rows: any[]): CockpitRow[] {
  const UNIT_LABELS: Record<string, string> = {
    prn_matriz: 'PRN MATRIZ',
    camboriu: 'CAMBORIU',
    palhoca: 'PALHOCA',
  }
  const unidade = UNIT_LABELS[blockKey] ?? blockKey.toUpperCase()

  return rows.map((row) => {
    const favorecido = ns(row.nome || row.favorecido || row.name || '')
    const categoria = ns(row.categoria || row.categoriaOriginal || '')
    const meses: Record<string, number> = row.meses || {}
    const { jan, fev, mar } = extractJanFevMar(meses)
    const atual = Number(row.valorPago ?? row.valorDia ?? row.atual ?? 0)
    const difVsMar = atual - mar

    let tipoMatch = row.tipoMatch || ''
    if (!tipoMatch) {
      const temHistorico = row.temHistorico ?? (jan > 0 || fev > 0 || mar > 0)
      tipoMatch = temHistorico ? 'Match exato (favorecido + categoria)' : 'Novo (sem historico)'
    }

    const status = calcStatus(difVsMar, tipoMatch)

    const departamentos: Array<{ dept: string; valor: number }> = []
    if (Array.isArray(row.dailyLines)) {
      for (const dl of row.dailyLines) {
        const dept = ns(dl.departamento || dl.dept || '')
        if (dept) departamentos.push({ dept, valor: Number(dl.valor ?? 0) })
      }
    } else if (row.departamento) {
      departamentos.push({ dept: ns(row.departamento), valor: atual })
    }

    // Calcular media e varPct
    const mesesValidos = [jan, fev, mar].filter(v => v > 0)
    const media = mesesValidos.length > 0 ? (jan + fev + mar) / mesesValidos.length : 0
    const varPct = mar > 0 ? ((atual - mar) / mar) * 100 : (atual > 0 ? 100 : 0)

    return {
      unidade,
      favorecido,
      categoria,
      jan,
      fev,
      mar,
      atual,
      difVsMar,
      status,
      tipoMatch,
      qtdDepartamentos: departamentos.length,
      departamentos,
      media: Math.round(media * 100) / 100,
      varPct: Math.round(varPct * 100) / 100,
      _raw: row,
    }
  })
}

export function groupRowsConsolidated(allRows: CockpitRow[]): CockpitRow[] {
  const map = new Map<string, CockpitRow>()

  for (const row of allRows) {
    const key = `${row.favorecido}|||${row.categoria}`
    if (!map.has(key)) {
      map.set(key, {
        unidade: 'CONSOLIDADO',
        favorecido: row.favorecido,
        categoria: row.categoria,
        jan: row.jan,
        fev: row.fev,
        mar: row.mar,
        atual: row.atual,
        difVsMar: row.difVsMar,
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
      existing.jan += row.jan
      existing.fev += row.fev
      existing.mar += row.mar
      existing.atual += row.atual
      existing.difVsMar = existing.atual - existing.mar
      
      if (row.tipoMatch === 'Novo (sem historico)') {
        existing.tipoMatch = 'Novo (sem historico)'
      }
      existing.status = calcStatus(existing.difVsMar, existing.tipoMatch)
    }
  }

  for (const row of map.values()) {
    const mesesValidos = [row.jan, row.fev, row.mar].filter(v => v > 0)
    row.media = mesesValidos.length > 0 
      ? Math.round(((row.jan + row.fev + row.mar) / mesesValidos.length) * 100) / 100 
      : 0
    row.varPct = row.mar > 0 
      ? Math.round(((row.atual - row.mar) / row.mar) * 10000) / 100 
      : (row.atual > 0 ? 100 : 0)
    
    row.jan = Math.round(row.jan * 100) / 100
    row.fev = Math.round(row.fev * 100) / 100
    row.mar = Math.round(row.mar * 100) / 100
    row.atual = Math.round(row.atual * 100) / 100
    row.difVsMar = Math.round(row.difVsMar * 100) / 100
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
      existing.jan += row.jan
      existing.fev += row.fev
      existing.mar += row.mar
      existing.atual += row.atual
    }
  }

  for (const row of map.values()) {
    const mesesValidos = [row.jan, row.fev, row.mar].filter(v => v > 0)
    row.media = mesesValidos.length > 0 
      ? Math.round(((row.jan + row.fev + row.mar) / mesesValidos.length) * 100) / 100 
      : 0
    row.varPct = row.mar > 0 
      ? Math.round(((row.atual - row.mar) / row.mar) * 10000) / 100 
      : (row.atual > 0 ? 100 : 0)
    row.difVsMar = Math.round((row.atual - row.mar) * 100) / 100
    row.status = calcStatus(row.difVsMar, row.tipoMatch)
    
    row.jan = Math.round(row.jan * 100) / 100
    row.fev = Math.round(row.fev * 100) / 100
    row.mar = Math.round(row.mar * 100) / 100
    row.atual = Math.round(row.atual * 100) / 100
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
      existing.jan += row.jan
      existing.fev += row.fev
      existing.mar += row.mar
      existing.difVsMar = existing.atual - existing.mar
      const mesesValidos = [existing.jan, existing.fev, existing.mar].filter(v => v > 0)
      existing.media = mesesValidos.length > 0
        ? Math.round(((existing.jan + existing.fev + existing.mar) / mesesValidos.length) * 100) / 100
        : 0
      existing.varPct = existing.mar > 0
        ? Math.round(((existing.atual - existing.mar) / existing.mar) * 10000) / 100
        : (existing.atual > 0 ? 100 : 0)
      existing.status = calcStatus(existing.difVsMar, existing.tipoMatch)
      existing.departamentos.push(...row.departamentos)
      existing.qtdDepartamentos = existing.departamentos.length
    }
  }

  return Array.from(map.values())
}
