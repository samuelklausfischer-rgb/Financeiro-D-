import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatPercentage } from './formatters'
import { buildCockpitRows, groupDuplicateRows, groupRowsByUnitConsolidated } from './audit-utils'

// Cores por unidade
const UNIT_COLORS: Record<string, number[]> = {
  'PRN MATRIZ': [0, 102, 204],      // Azul
  'CAMBORIU': [16, 185, 129],       // Verde
  'PALHOCA': [245, 158, 11],      // Ambar
}

function getUnitColor(unidade: string): number[] {
  return UNIT_COLORS[unidade] || [100, 100, 100]
}

export async function generateAuditPDF(data: any) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  })

  const title = "Relatório Consolidado de Auditoria Financeira"
  const dateStr = data?.meta?.data_referencia || data?.request?.referenceDate || new Date().toLocaleDateString('pt-BR')
  const requestId = data?.requestId || data?.meta?.requestId || 'N/A'

  // --- CAPA E CABEÇALHO ---
  doc.setFontSize(22)
  doc.setTextColor(0, 102, 204)
  doc.text("PRN FINANCEIRO", 14, 20)

  doc.setFontSize(14)
  doc.setTextColor(0)
  doc.text(title, 14, 30)

  doc.setFontSize(10)
  doc.text(`Data da Auditoria: ${dateStr}`, 14, 38)
  doc.text(`Protocolo: ${requestId}`, 14, 43)

  // --- SUMÁRIO EXECUTIVO ---
  const summary = data?.summary || {}
  autoTable(doc, {
    startY: 50,
    head: [['TOTAL DESPESAS (DIA)']],
    body: [[
      formatCurrency(summary.totalDespesas),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] }
  })

  // --- BLOCOS POR UNIDADE ---
  // Extrai os dados do byBlock (estrutura usada pelo frontend)
  const crossAnalysis = data?.data?.crossAnalysis || {}
  const byBlock = crossAnalysis.byBlock || {}

  // Converte os dados de cada bloco para CockpitRow e agrupa duplicados
  const allRows: any[] = []
  const blockKeys: Record<string, string> = {
    'prn_matriz': 'PRN MATRIZ',
    'camboriu': 'CAMBORIU',
    'palhoca': 'PALHOCA',
  }

  for (const [key, label] of Object.entries(blockKeys)) {
    const blockRows = Array.isArray(byBlock[key]?.rows) ? byBlock[key].rows : []
    const cockpitRows = buildCockpitRows(key, blockRows)
    const grouped = groupDuplicateRows(cockpitRows)
    // Adiciona unidade a cada linha para o PDF
    for (const r of grouped) {
      r._unidadeLabel = label
      allRows.push(r)
    }
  }

  // Agrupa por unidade para o PDF
  const rowsByUnidade: Record<string, any[]> = {
    'PRN MATRIZ': [],
    'CAMBORIU': [],
    'PALHOCA': [],
  }
  for (const r of allRows) {
    const un = r._unidadeLabel || 'PRN MATRIZ'
    if (rowsByUnidade[un]) rowsByUnidade[un].push(r)
  }

  let currentY = (doc as any).lastAutoTable.finalY + 20

  // Para cada unidade, cria uma seção
  for (const unidade of ['PRN MATRIZ', 'CAMBORIU', 'PALHOCA']) {
    const blockRows = rowsByUnidade[unidade] || []
    if (blockRows.length === 0) continue

    // Verifica se precisa de nova página
    if (currentY > 180) {
      doc.addPage()
      currentY = 20
    }

    const color = getUnitColor(unidade)

    // Título do bloco
    doc.setFontSize(16)
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(unidade, 14, currentY)
    currentY += 8

    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text(`${blockRows.length} registros encontrados`, 14, currentY)
    currentY += 6

    // Cabeçalho da tabela
    const tableHead = ['Favorecido', 'Categoria', 'Jan', 'Fev', 'Mar', 'Atual', 'Var %']

    // Prepara as linhas: grupo + detalhes
    const tableRows: any[] = []
    let groupIndex = 0

    for (const row of blockRows) {
      const currentGroupIndex = groupIndex++

      // Linha principal (grupo)
      tableRows.push({
        isDetail: false,
        groupIndex: currentGroupIndex,
        values: [
          row.favorecido || 'Desconhecido',
          row.categoria || 'Indefinido',
          formatCurrency(row.jan || 0),
          formatCurrency(row.fev || 0),
          formatCurrency(row.mar || 0),
          formatCurrency(row.atual || 0),
          formatPercentage(row.varPct || 0),
        ]
      })

      // Linhas de detalhe (departamentos) - com fundo roxo claro (10-20% opacidade)
      if (Array.isArray(row.departamentos)) {
        for (const dept of row.departamentos) {
          tableRows.push({
            isDetail: true,
            groupIndex: currentGroupIndex,
            values: [
              `    ${dept.dept || 'Sem depto'}`,  // Indentado
              '',  // Categoria vazia
              '',  // Jan
              '',  // Fev
              '',  // Mar
              formatCurrency(dept.valor || 0),  // Valor no campo "Atual"
              '',  // Var %
            ]
          })
        }
      }
    }

    autoTable(doc, {
      startY: currentY,
      head: [tableHead],
      body: tableRows.map(r => r.values),
      theme: 'grid',
      headStyles: { fillColor: color },
      columnStyles: {
        0: { cellWidth: 50 },  // Favorecido
        1: { cellWidth: 30 },  // Categoria
        5: { halign: 'right', fontStyle: 'bold' },  // Atual
        6: { halign: 'right' }  // Var %
      },
      didParseCell: (data: any) => {
        const rowMeta = tableRows[data.row.index]
        if (data.section === 'body') {
          if (rowMeta?.isDetail) {
            // Estilo para departamentos (detalhes) - roxo claro 10-20%
            data.cell.styles.fillColor = [243, 232, 255]  // Roxo claro
            data.cell.styles.textColor = [90, 90, 90]
            data.cell.styles.fontSize = 8
            if (data.column.index === 0) {
              data.cell.styles.fontStyle = 'normal'
            }
          } else {
            // Efeito zebra para linhas principais
            const isOddGroup = (rowMeta?.groupIndex || 0) % 2 === 0
            data.cell.styles.fillColor = isOddGroup ? [217, 230, 249] : [242, 247, 254]
            data.cell.styles.textColor = [30, 30, 30]
            data.cell.styles.fontSize = 9
          }
        }

        // Destaque em vermelho para variações altas
        if (data.section === 'body' && !rowMeta?.isDetail && data.column.index === 6) {
          const valStr = data.cell.text[0].replace('%', '').replace(',', '.')
          const val = parseFloat(valStr)
          if (Math.abs(val) > 25) {
            data.cell.styles.textColor = [220, 53, 69]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    })

    currentY = (doc as any).lastAutoTable.finalY + 15
  }

  // --- RODAPÉ ---
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Página ${i} de ${pageCount} - Gerado eletronicamente em ${new Date().toLocaleString()}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }

  doc.save(`Auditoria_PRN_${requestId}.pdf`)
}

export async function generateGroupedAuditPDF(data: any) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  
  const title = "Relatório de Auditoria Financeira - Visão Agrupada por Unidade"
  const dateStr = data?.meta?.data_referencia || data?.request?.referenceDate || new Date().toLocaleDateString('pt-BR')
  const requestId = data?.requestId || data?.meta?.requestId || 'N/A'

  // CABEÇALHO
  doc.setFontSize(22)
  doc.setTextColor(0, 102, 204)
  doc.text("PRN FINANCEIRO", 14, 20)

  doc.setFontSize(14)
  doc.setTextColor(0)
  doc.text(title, 14, 30)

  doc.setFontSize(10)
  doc.text(`Data da Auditoria: ${dateStr}`, 14, 38)
  doc.text(`Protocolo: ${requestId}`, 14, 43)

  // SUMÁRIO
  const summary = data?.summary || {}
  autoTable(doc, {
    startY: 50,
    head: [['TOTAL DESPESAS (DIA)']],
    body: [[
      formatCurrency(summary.totalDespesas),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] }
  })

  // CONFIGURAÇÃO DAS UNIDADES
  const unitConfigs = [
    { key: 'prn_matriz', label: 'PRN MATRIZ', color: [0, 102, 204] },
    { key: 'camboriu', label: 'CAMBORIU', color: [16, 185, 129] },
    { key: 'palhoca', label: 'PALHOCA', color: [245, 158, 11] },
  ]

  const crossAnalysis = data?.data?.crossAnalysis || {}
  const byBlock = crossAnalysis.byBlock || {}
  let currentY = (doc as any).lastAutoTable.finalY + 20

  // PROCESSA CADA UNIDADE SEPARADAMENTE
  for (const unit of unitConfigs) {
    const blockRows = Array.isArray(byBlock[unit.key]?.rows) ? byBlock[unit.key].rows : []
    const cockpitRows = buildCockpitRows(unit.key, blockRows)
    const groupedRows = groupRowsByUnitConsolidated(cockpitRows)

    if (groupedRows.length === 0) continue

    // Verifica se precisa de nova página
    if (currentY > 180) {
      doc.addPage()
      currentY = 20
    }

    // TÍTULO DO BLOCO
    doc.setFontSize(16)
    doc.setTextColor(unit.color[0], unit.color[1], unit.color[2])
    doc.text(unit.label, 14, currentY)
    currentY += 8

    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text(`${groupedRows.length} registros consolidados`, 14, currentY)
    currentY += 6

    // MONTAGEM DAS LINHAS (SEM DEPARTAMENTOS)
    const tableHead = ['Favorecido', 'Categoria', 'Jan', 'Fev', 'Mar', 'Atual', 'Var %']
    const tableRows: any[] = []

    for (const row of groupedRows) {
      tableRows.push({
        values: [
          row.favorecido || 'Desconhecido',
          row.categoria || 'Indefinido',
          formatCurrency(row.jan || 0),
          formatCurrency(row.fev || 0),
          formatCurrency(row.mar || 0),
          formatCurrency(row.atual || 0),
          formatPercentage(row.varPct || 0),
        ]
      })
    }

    // GERA TABELA DO BLOCO
    autoTable(doc, {
      startY: currentY,
      head: [tableHead],
      body: tableRows.map(r => r.values),
      theme: 'grid',
      headStyles: { fillColor: unit.color },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 30 },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' }
      },
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          // Efeito zebra
          const isOdd = data.row.index % 2 === 0
          data.cell.styles.fillColor = isOdd ? [217, 230, 249] : [242, 247, 254]
          data.cell.styles.textColor = [30, 30, 30]
          data.cell.styles.fontSize = 9

          // Destaque em vermelho para variações altas
          if (data.column.index === 6) {
            const valStr = data.cell.text[0].replace('%', '').replace(',', '.')
            const val = parseFloat(valStr)
            if (Math.abs(val) > 25) {
              data.cell.styles.textColor = [220, 53, 69]
              data.cell.styles.fontStyle = 'bold'
            }
          }
        }
      }
    })

    currentY = (doc as any).lastAutoTable.finalY + 15
  }

  // RODAPÉ
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Página ${i} de ${pageCount} - Gerado em ${new Date().toLocaleString()}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }

  doc.save(`Auditoria_Agrupada_PRN_${requestId}.pdf`)
}
