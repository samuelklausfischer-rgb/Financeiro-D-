import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { buildCockpitRows, groupDuplicateRows, groupRowsByUnitConsolidated, CockpitRow } from './audit-utils'

const TABLE_HEADERS = [
  'Favorecido', 
  'Categoria', 
  'Fev', 
  'Mar', 
  'Abr', 
  'Média', 
  'Atual', 
  'Dif vs Abr', 
  'Var %', 
  'Status',
  'OBS do Financeiro'
]

// Cores de Fundo para CABEÇALHOS das Unidades (Sólidas)
const UNIT_HEADER_COLORS: Record<string, string> = {
  'PRN MATRIZ': 'FF1E40AF', // Azul
  'CAMBORIU': 'FF059669',   // Verde
  'PALHOCA': 'FFD97706',    // Laranja
}

// Cores de Fundo para LINHAS DE DADOS (Tintas/Tons muito claros)
const UNIT_ROW_COLORS: Record<string, string> = {
  'PRN MATRIZ': 'FFEBF5FB', // Azul claro
  'CAMBORIU': 'FFEBF7EB', // Verde claro
  'PALHOCA': 'FFFEF9EB', // Laranja claro
}

function formatBRL(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return ''
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount)
}

/**
 * Estiliza o cabeçalho principal da tabela (Azul Escuro)
 */
function styleTableHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  })
}

/**
 * Estiliza a barra de título da unidade
 */
function styleUnitHeader(row: ExcelJS.Row, unit: string) {
  const color = UNIT_HEADER_COLORS[unit] || 'FF64748B'
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })
}

function styleFinanceNoteCell(cell: ExcelJS.Cell) {
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

export async function generateAuditExcel(data: any) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Auditoria Detalhada')

  const crossAnalysis = data?.data?.byBlock || data?.data?.crossAnalysis?.byBlock || {}
  const UNIT_KEYS: Record<string, string> = {
    'PRN MATRIZ': 'prn_matriz',
    'CAMBORIU': 'camboriu',
    'PALHOCA': 'palhoca',
  }

  // 1. Títulos de Topo
  worksheet.addRow(['PRN FINANCEIRO - RELATÓRIO DE AUDITORIA']).font = { bold: true, size: 16 }
  worksheet.addRow([`Data de Referência: ${data?.meta?.data_referencia || data?.request?.referenceDate || new Date().toLocaleDateString()}`])
  worksheet.addRow([`ID Processamento: ${data?.requestId || 'N/A'}`])
  worksheet.addRow([])

  for (const unitLabel of ['PRN MATRIZ', 'CAMBORIU', 'PALHOCA']) {
    const key = UNIT_KEYS[unitLabel]
    const blockRows = Array.isArray(crossAnalysis[key]?.rows) ? crossAnalysis[key].rows : []
    const cockpitRows = buildCockpitRows(key, blockRows)
    const grouped = groupDuplicateRows(cockpitRows)

    if (grouped.length === 0) continue

    // BARRA DA UNIDADE
    const unitRow = worksheet.addRow([unitLabel])
    styleUnitHeader(unitRow, unitLabel)
    worksheet.mergeCells(`A${unitRow.number}:K${unitRow.number}`)

    // CABEÇALHO DA TABELA
    const headerRow = worksheet.addRow(TABLE_HEADERS)
    styleTableHeader(headerRow)

    const unitBg = UNIT_ROW_COLORS[unitLabel] || 'FFFFFFFF'
    let isZebra = false

    for (const row of grouped) {
      isZebra = !isZebra
      // Usamos a cor da unidade mas podemos alternar um brilho sutil se necessário
      const rowColor = isZebra ? unitBg : 'FFFFFFFF' 

      const mainRow = worksheet.addRow([
        row.favorecido,
        row.categoria,
        formatBRL(row.fev),
        formatBRL(row.mar),
        formatBRL(row.abr),
        formatBRL(row.media),
        formatBRL(row.atual),
        formatBRL(row.difVsAbr),
        `${row.varPct?.toFixed(2)}%`,
        row.status,
        ''
      ])

      mainRow.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } }
        
        // Cores de Status
        if (colNumber === 9 || colNumber === 10) {
          if (row.status === 'Aumento') cell.font = { color: { argb: 'FFEF4444' }, bold: true }
          if (row.status === 'Queda') cell.font = { color: { argb: 'FF10B981' }, bold: true }
          if (row.status === 'Novo') cell.font = { color: { argb: 'FF3B82F6' }, bold: true }
        }

        if (colNumber === 11) {
          styleFinanceNoteCell(cell)
        }
      })

      // Sub-linhas (Departamentos)
      if (Array.isArray(row.departamentos)) {
        for (const dept of row.departamentos) {
          const deptRow = worksheet.addRow([
            `    └─ ${dept.dept}`, 
            '', '', '', '', '', 
            formatBRL(dept.valor), 
            '', '', '', ''
          ])
      deptRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } }
        cell.font = { size: 9, color: { argb: 'FF4B5563' }, italic: true }
        if (cell.col === 11) {
          styleFinanceNoteCell(cell)
        }
      })
        }
      }
    }

    // ESPAÇADOR DE BLOCO (Muro visual)
    const spacer = worksheet.addRow([])
    spacer.eachCell((cell) => {
      cell.border = { bottom: { style: 'medium', color: { argb: UNIT_HEADER_COLORS[unitLabel] } } }
    })
    worksheet.addRow([]) // Linha em branco
  }

  // Ajustes Finais
  worksheet.columns = [
    { width: 45 }, { width: 30 }, { width: 12 }, { width: 12 }, { width: 12 }, 
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 28 }
  ]

  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(new Blob([buffer]), `Relatorio_Auditoria_PRN_${Date.now()}.xlsx`)
}

export async function generateGroupedAuditExcel(data: any) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Consolidado por Unidade')

  const crossAnalysis = data?.data?.byBlock || data?.data?.crossAnalysis?.byBlock || {}
  
  // 1. Cabeçalho Geral
  worksheet.addRow(['PRN FINANCEIRO - VISÃO CONSOLIDADA POR UNIDADE']).font = { bold: true, size: 16 }
  worksheet.addRow([`Data de Exportação: ${new Date().toLocaleString('pt-BR')}`])
  worksheet.addRow([])

  const UNIT_KEYS: Record<string, string> = { 
    'PRN MATRIZ': 'prn_matriz', 
    'CAMBORIU': 'camboriu', 
    'PALHOCA': 'palhoca' 
  }

  for (const [unitLabel, key] of Object.entries(UNIT_KEYS)) {
    const blockRows = Array.isArray(crossAnalysis[key]?.rows) ? crossAnalysis[key].rows : []
    const cockpitRows = buildCockpitRows(key, blockRows)
    const grouped = groupRowsByUnitConsolidated(cockpitRows)

    if (grouped.length === 0) continue

    // BARRA DA UNIDADE (Identidade Visual)
    const unitRow = worksheet.addRow([unitLabel])
    styleUnitHeader(unitRow, unitLabel)
    worksheet.mergeCells(`A${unitRow.number}:K${unitRow.number}`)

    // CABEÇALHO DA TABELA
    const headerRow = worksheet.addRow(TABLE_HEADERS)
    styleTableHeader(headerRow)

    const unitBg = UNIT_ROW_COLORS[unitLabel] || 'FFFFFFFF'
    let isZebra = false

    for (const row of grouped) {
      isZebra = !isZebra
      const rowColor = isZebra ? unitBg : 'FFFFFFFF'

      const r = worksheet.addRow([
        row.favorecido,
        row.categoria,
        formatBRL(row.fev),
        formatBRL(row.mar),
        formatBRL(row.abr),
        formatBRL(row.media),
        formatBRL(row.atual),
        formatBRL(row.difVsAbr),
        `${row.varPct?.toFixed(2)}%`,
        row.status,
        ''
      ])
      
      r.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } }
        
        // Colunas 9 e 10 (Var % e Status)
        if (colNum === 9 || colNum === 10) {
           if (row.status === 'Aumento') cell.font = { color: { argb: 'FFEF4444' }, bold: true }
           if (row.status === 'Queda') cell.font = { color: { argb: 'FF10B981' }, bold: true }
           if (row.status === 'Novo') cell.font = { color: { argb: 'FF3B82F6' }, bold: true }
        }

        if (colNum === 11) {
          styleFinanceNoteCell(cell)
        }
      })
    }

    // Divisor de Bloco
    const spacer = worksheet.addRow([])
    spacer.eachCell((cell) => {
      cell.border = { bottom: { style: 'medium', color: { argb: UNIT_HEADER_COLORS[unitLabel] } } }
    })
    worksheet.addRow([]) // Espaço extra
  }

  worksheet.columns = [
    { width: 45 }, { width: 30 }, { width: 12 }, { width: 12 }, { width: 12 }, 
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 28 }
  ]
  
  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(new Blob([buffer]), `Consolidado_Premium_PRN_${Date.now()}.xlsx`)
}
