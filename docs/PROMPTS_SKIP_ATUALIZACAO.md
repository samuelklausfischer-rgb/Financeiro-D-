# PROMPTS DE ATUALIZAÇÃO - SKIP.DEV
## Análise PRN - Atualização Webhook n8n

---

## PROMPT 0: Atualizar URL do Webhook PRN (CRÍTICO)

**URL ANTIGA:** `https://0001-0001.25xe2c.easypanel.host/webhook/prn/report`  
**URL NOVA:** `https://n8n-h4xf.srv1623283.hstgr.cloud/webhook/prn/report`

### Arquivos para alterar:

1. **.env (linha 3):**
   ```
   VITE_PRN_ANALYSIS_API_URL=https://n8n-h4xf.srv1623283.hstgr.cloud/webhook/prn/report
   ```

2. **src/services/prn.ts (linha 4):**
   ```typescript
   const PRN_API_URL =
     import.meta.env.VITE_PRN_ANALYSIS_API_URL || 'https://n8n-h4xf.srv1623283.hstgr.cloud/webhook/prn/report'
   ```

3. **pocketbase/hooks/prn_submit.js (linha 91):**
   ```javascript
   const webhookUrl = 'https://n8n-h4xf.srv1623283.hstgr.cloud/webhook/prn/report'
   ```

4. **pocketbase/hooks/prn_report_json.js (linha 65):**
   ```javascript
   url: 'https://n8n-h4xf.srv1623283.hstgr.cloud/webhook/prn/report',
   ```

5. **.env.example (linha 5):**
   ```
   VITE_PRN_ANALYSIS_API_URL=https://n8n-h4xf.srv1623283.hstgr.cloud/webhook/prn/report
   ```

---

## PROMPT 1: Serviço de Comunicação (src/services/prn.ts)

Implementar `submitPrnAnalysisJson` com fluxo:

1. Criar registro `prn_report_runs` (status='processing')
2. Enviar POST FormData com: daily_file, daily_file_base64, daily_filename, historical_file (Blob JSON), historical_filename, historical_files_meta, historical_file_count, reference_date
3. Parsear resposta (JSON ou HTML legacy)
4. Atualizar registro (success/error)
5. Retornar { ...data, _runId }

Funções CRUD para: getPrnHistoryRuns, deletePrnReportRun, getPrnReportData, updatePrnRunPayload, markPrnRunAsError

Funções Storage: listHistoryFiles, uploadHistoryFile, deleteHistoryFile, downloadHistoryFile

---

## PROMPT 2: Página Principal (src/pages/prn-analysis.tsx)

Estados: 'upload' | 'loading' | 'report' | 'error'

Layout header com: BrainCircuit, título "Análise PRN", badge "ENGINE V2"

Upload State: Grid 12 cols - esquerda PrnUploadForm (7/12), direita PrnHistoryTable (5/12, sticky)

On Submit: Extrair files, baixar saved, montar historical rows, converter base64, montar FormData, chamar submitPrnAnalysisJson, normalizar payload, atualizar estado

Loading State: <LoadingState />
Error State: <ErrorState error={errorDetails} onReset={handleReset} />
Report State: <PrnReportView data={reportData} />

---

## PROMPT 3: Visualização do Relatório (src/components/prn/prn-report-view.tsx)

Container do relatório com:

1. Título formatado (data) + subtítulo "Resumo da planilha do dia"
2. PrnHeader: 4 cards (Protocolo ID, Referência, Arquivos, Auditado)
3. PrnSummaryCards: 5 cards financeiros + 4 alertas
4. Tabs com 5 abas:
   - Auditoria Cruzada → PrnCrossAnalysis
   - Recebimentos → PrnDetails type="receipts"
   - Categorias → PrnDetails type="categories"
   - Contas → PrnDetails type="accounts"
   - Entidades → PrnDetails type="entities"

Filtrar receipts pela referenceDate. Agrupar recebidosPorConta. Estados especiais para legacy_html e payload vazio.

---

## PROMPT 4: Auditoria Cruzada (src/components/prn/prn-cross-analysis.tsx)

Header: Título + ícone History, botão "Exportar PDF" (chama generateAuditPDF)

Filtros: Todos, Alertas, Divergentes, Estáveis, Novos (com cores)

3 Blocos: PRN MATRIZ (azul), Camboriú (emerald), Palhoça (âmbar)

Cada bloco com SortableTable contendo:
- Favorecido (ExpandableRow com dailyLines/historyLines)
- Categoria (Badge com cores por tipo)
- Meses dinâmicos (últimos 3)
- Valor Atual
- Média
- Var % (com escala de cores: <10% verde → >=50% vermelho+pulse)

Filtro de linhas por grupoMensal e alertaDivergencia25.

---

## PROMPT 5: Geração de PDF (src/lib/export-pdf.ts)

Função `generateAuditPDF(data)` usando jsPDF (landscape, A4) + jspdf-autotable.

PÁGINA 1:
- Cabeçalho: "PRN FINANCEIRO" (azul), título, data, protocolo
- Tabela Sumário: Total Despesas | Total Recebido | Saldo Bancário
- Tabela Auditoria Cruzada: Favorecido | Meses | Valor Atual | Média | Var%
  - Linhas de grupo (zebra azul 30%/10%)
  - Linhas de detalhe (fundo quase branco)
  - Var% > 25 em vermelho bold

PÁGINA 2:
- "Fluxo de Recebimentos do Dia"
- Tabela: Data | Descrição | Conta Corrente | Valor

RODAPÉ: "Página X de Y - Gerado eletronicamente em {timestamp}"

Arquivo: Auditoria_PRN_{requestId}.pdf

Função auxiliar buildDisplayCategory(row): retorna "categoria / subcategoria".
