import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export type HistorySourceMeta = {
  original_filename: string
  source: 'vault' | 'temporary' | 'legacy'
}

export type HistorySheetData = {
  sourceFile: string
  sheetName: string
  rows: unknown[][]
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DO NOVO FORMATO CONSOLIDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nome da aba que identifica o novo formato consolidado (todas as matrizes
 * em uma única aba organizada em blocos de colunas).
 */
const CONSOLIDATED_SHEET_NAME = 'financas'

/**
 * Mapeamento dos 3 blocos de colunas da planilha consolidada.
 * Cada bloco representa uma matriz e suas respectivas colunas:
 *   colForn  = Fornecedor (Nome Fantasia)
 *   colValor = Valor da Conta
 *   colCat   = Categoria
 *   colData  = Data de Registro (número serial do Excel)
 */
const CONSOLIDATED_BLOCKS = [
  { name: 'PRN MATRIZ', colForn: 0,  colValor: 1,  colCat: 2,  colData: 3  },
  { name: 'CAMBORIU',   colForn: 5,  colValor: 6,  colCat: 7,  colData: 8  },
  { name: 'PALHOCA',    colForn: 10, colValor: 11, colCat: 12, colData: 13 },
] as const

/**
 * Filtro de período: apenas Fevereiro (2), Março (3) e Abril (4).
 * Janeiro (1) e qualquer outro mês fora desse intervalo são descartados.
 */
const ALLOWED_MONTHS = new Set([2, 3, 4])

/**
 * Linha (índice base-zero) a partir da qual os dados reais começam.
 * Linha 0 = Títulos das matrizes  (PRN MATRIZ / CAMBORIÚ / PALHOÇA)
 * Linha 1 = Cabeçalhos das colunas (Fornecedor, Valor, Categoria, Data)
 * Linha 2 = Primeiro registro real
 */
const DATA_START_ROW = 2

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte um número serial do Excel para mês (1-12).
 * Retorna null se o valor não for um número serial válido.
 */
function excelSerialToMonth(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null

  try {
    const parsed = XLSX.SSF.parse_date_code(value)
    return parsed ? parsed.m : null
  } catch {
    return null
  }
}

/**
 * Converte um número serial do Excel para string ISO (YYYY-MM-DD).
 * Retorna null se não conseguir converter.
 */
function excelSerialToIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    try {
      const parsed = XLSX.SSF.parse_date_code(value)
      if (parsed) {
        const m = String(parsed.m).padStart(2, '0')
        const d = String(parsed.d).padStart(2, '0')
        return `${parsed.y}-${m}-${d}`
      }
    } catch {
      return null
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) {
    const [, day, month, year] = brMatch
    return `${year}-${month}-${day}`
  }

  return null
}

/**
 * Verifica se a linha de um bloco possui dados válidos (fornecedor ou data).
 */
function blockRowHasData(row: unknown[], colForn: number, colData: number): boolean {
  const forn = row[colForn]
  const data = row[colData]
  return (
    (typeof forn === 'string' && forn.trim().length > 0) ||
    (typeof data === 'number' && data > 0)
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO: FORMATO CONSOLIDADO (NOVO)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa a aba "financas" do novo formato consolidado.
 *
 * Para cada bloco (MATRIZ, CAMBORIU, PALHOCA), percorre as linhas de dados
 * (a partir da linha DATA_START_ROW) e:
 *  1. Verifica se a linha possui dados para aquele bloco.
 *  2. Converte a data serial para ISO e extrai o mês.
 *  3. Descarta linhas cujo mês não esteja em ALLOWED_MONTHS (Fev, Mar, Abr).
 *  4. Monta uma linha normalizada com os 4 campos do bloco.
 *
 * Retorna um HistorySheetData por bloco, com sheetName identificando a matriz,
 * garantindo compatibilidade com o formato esperado pelo n8n.
 */
function extractConsolidatedBlocks(
  sourceFile: string,
  rows: unknown[][],
): HistorySheetData[] {
  const dataRows = rows.slice(DATA_START_ROW)
  const results: HistorySheetData[] = []

  for (const block of CONSOLIDATED_BLOCKS) {
    const { name, colForn, colValor, colCat, colData } = block
    const blockRows: unknown[][] = []

    // Cabeçalho normalizado para manter compatibilidade com o n8n
    blockRows.push(['Fornecedor', 'Valor', 'Categoria', 'Data'])

    for (const row of dataRows) {
      if (!Array.isArray(row)) continue
      if (!blockRowHasData(row, colForn, colData)) continue

      const month = excelSerialToMonth(row[colData])

      // Filtro temporal: aceita apenas Fev (2), Mar (3) e Abr (4)
      if (month === null || !ALLOWED_MONTHS.has(month)) continue

      const isoDate = excelSerialToIso(row[colData])
      const fornecedor = typeof row[colForn] === 'string' ? (row[colForn] as string).trim() : String(row[colForn] ?? '').trim()
      const valor = typeof row[colValor] === 'number' ? row[colValor] : Number(String(row[colValor] ?? '0').replace(',', '.')) || 0
      const categoria = typeof row[colCat] === 'string' ? (row[colCat] as string).trim() : String(row[colCat] ?? '').trim()

      blockRows.push([fornecedor, valor, categoria, isoDate])
    }

    // Só inclui o bloco se tiver ao menos 1 linha de dado (além do cabeçalho)
    if (blockRows.length > 1) {
      results.push({
        sourceFile,
        sheetName: `${sourceFile}::${name}`,
        rows: blockRows,
      })
    }
  }

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO: FORMATO LEGADO (ANTIGO)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa planilhas no formato antigo (uma matriz por aba ou por arquivo).
 * Mantém o comportamento original para garantir compatibilidade retroativa.
 */
function extractLegacySheets(
  sourceFile: string,
  workbook: XLSX.WorkBook,
): HistorySheetData[] {
  const results: HistorySheetData[] = []

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName]
    if (!ws || !ws['!ref']) continue

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
    if (rows.length === 0) continue

    results.push({
      sourceFile,
      sheetName: `${sourceFile}::${sheetName}`,
      rows,
    })
  }

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL EXPORTADA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrai os dados históricos de uma lista de arquivos Excel.
 *
 * Detecta automaticamente o formato da planilha:
 *   - NOVO (consolidado): aba "financas" com 3 blocos de colunas (MATRIZ,
 *     CAMBORIU, PALHOCA). Aplica filtro de período (Fev-Mar-Abr) e fragmenta
 *     em 3 conjuntos de dados independentes.
 *   - LEGADO: formato antigo com uma matriz por aba. Comportamento preservado.
 */
export async function extractHistoricalRows(
  files: File[],
  _meta?: HistorySourceMeta[],
): Promise<HistorySheetData[]> {
  if (files.length === 0) {
    throw new Error('Selecione ao menos uma planilha histórica para a análise.')
  }

  const allSheets: HistorySheetData[] = []

  for (const file of files) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

    const isConsolidated = workbook.SheetNames.includes(CONSOLIDATED_SHEET_NAME)

    if (isConsolidated) {
      // NOVO FORMATO: aba "financas" com os 3 blocos lado a lado
      const ws = workbook.Sheets[CONSOLIDATED_SHEET_NAME]
      if (!ws || !ws['!ref']) continue

      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
      const blocks = extractConsolidatedBlocks(file.name, rows)
      allSheets.push(...blocks)
    } else {
      // FORMATO LEGADO: uma matriz por aba (comportamento anterior preservado)
      const legacy = extractLegacySheets(file.name, workbook)
      allSheets.push(...legacy)
    }
  }

  if (allSheets.length === 0) {
    throw new Error('Nenhuma aba válida encontrada nos arquivos históricos.')
  }

  return allSheets
}
