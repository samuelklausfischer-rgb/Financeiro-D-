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
  fev: number
  mar: number
  abr: number
  atual: number
  difVsAbr: number
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
  if (dif > 0.01) return 'Aumento'
  if (dif < -0.01) return 'Queda'
  if (tipoMatch.includes('Novo')) return 'Novo'
  return 'Igual'
}

function monthNum(code: string): number {
  const parts = code.split('-')
  return parts.length === 2 ? parseInt(parts[1], 10) : 0
}

function extractFevMarAbr(row: any): { fev: number; mar: number; abr: number } {
  // 1. Prioridade para campos diretos (novo formato n8n V5)
  if (typeof row.fev === 'number' || typeof row.mar === 'number' || typeof row.abr === 'number') {
    return {
      fev: Number(row.fev ?? 0),
      mar: Number(row.mar ?? 0),
      abr: Number(row.abr ?? 0)
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
  return { fev, mar, abr }
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
    
    // Extrai Fev/Mar/Abr (com suporte a n8n V5 e Legado)
    const { fev, mar, abr } = extractFevMarAbr(row)
    
    const atual = Number(row.atual ?? row.valorPago ?? row.valorDia ?? 0)
    const difVsAbr = typeof row.difVsAbr === 'number' ? row.difVsAbr : (atual - abr)

    let tipoMatch = row.tipoMatch || ''
    if (!tipoMatch) {
      const temHistorico = row.temHistorico ?? (fev > 0 || mar > 0 || abr > 0)
      tipoMatch = temHistorico ? 'Match exato (favorecido + categoria)' : 'Novo (sem historico)'
    }

    const status = (row.status as CockpitStatus) || calcStatus(difVsAbr, tipoMatch)

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

    // Calcular media e varPct (Média de Fev, Mar, Abr)
    // Se o n8n já enviou, respeita o valor dele
    const mesesValidos = [fev, mar, abr].filter(v => v > 0)
    const media = typeof row.media === 'number' ? row.media : (mesesValidos.length > 0 ? (fev + mar + abr) / mesesValidos.length : 0)
    const varPct = typeof row.varPct === 'number' ? row.varPct : (abr > 0 ? ((atual - abr) / abr) * 100 : (atual > 0 ? 100 : 0))

    return {
      unidade,
      favorecido,
      categoria,
      fev,
      mar,
      abr,
      atual,
      difVsAbr,
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
        fev: row.fev,
        mar: row.mar,
        abr: row.abr,
        atual: row.atual,
        difVsAbr: row.difVsAbr,
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
      existing.atual += row.atual
      existing.difVsAbr = existing.atual - existing.abr
      
      if (row.tipoMatch === 'Novo (sem historico)') {
        existing.tipoMatch = 'Novo (sem historico)'
      }
      existing.status = calcStatus(existing.difVsAbr, existing.tipoMatch)
    }
  }

  for (const row of map.values()) {
    const mesesValidos = [row.fev, row.mar, row.abr].filter(v => v > 0)
    row.media = mesesValidos.length > 0 
      ? Math.round(((row.fev + row.mar + row.abr) / mesesValidos.length) * 100) / 100 
      : 0
    row.varPct = row.abr > 0 
      ? Math.round(((row.atual - row.abr) / row.abr) * 10000) / 100 
      : (row.atual > 0 ? 100 : 0)
    
    row.fev = Math.round(row.fev * 100) / 100
    row.mar = Math.round(row.mar * 100) / 100
    row.abr = Math.round(row.abr * 100) / 100
    row.atual = Math.round(row.atual * 100) / 100
    row.difVsAbr = Math.round(row.difVsAbr * 100) / 100
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
      existing.fev += row.fev
      existing.mar += row.mar
      existing.abr += row.abr
      existing.atual += row.atual
    }
  }

  for (const row of map.values()) {
    const mesesValidos = [row.fev, row.mar, row.abr].filter(v => v > 0)
    row.media = mesesValidos.length > 0 
      ? Math.round(((row.fev + row.mar + row.abr) / mesesValidos.length) * 100) / 100 
      : 0
    row.varPct = row.abr > 0 
      ? Math.round(((row.atual - row.abr) / row.abr) * 10000) / 100 
      : (row.atual > 0 ? 100 : 0)
    row.difVsAbr = Math.round((row.atual - row.abr) * 100) / 100
    row.status = calcStatus(row.difVsAbr, row.tipoMatch)
    
    row.fev = Math.round(row.fev * 100) / 100
    row.mar = Math.round(row.mar * 100) / 100
    row.abr = Math.round(row.abr * 100) / 100
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
      existing.fev += row.fev
      existing.mar += row.mar
      existing.abr += row.abr
      existing.difVsAbr = existing.atual - existing.abr
      const mesesValidos = [existing.fev, existing.mar, existing.abr].filter(v => v > 0)
      existing.media = mesesValidos.length > 0
        ? Math.round(((existing.fev + existing.mar + existing.abr) / mesesValidos.length) * 100) / 100
        : 0
      existing.varPct = existing.abr > 0
        ? Math.round(((existing.atual - existing.abr) / existing.abr) * 100)
        : (existing.atual > 0 ? 100 : 0)
      existing.status = calcStatus(existing.difVsAbr, existing.tipoMatch)
      existing.departamentos.push(...row.departamentos)
      existing.qtdDepartamentos = existing.departamentos.length
    }
  }

  return Array.from(map.values())
}
