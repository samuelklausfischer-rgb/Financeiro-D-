import { useState, useCallback } from 'react'
import { UploadSection } from './components/upload-section'
import { ResultsDashboard } from './components/dashboard'
import { HistoryTable } from './components/history-table'
import { getAnalise, type AnalysisRecord } from '@/services/analise-duplicidade'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'

export default function DuplicityAnalysis() {
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisRecord | null>(null)
  const [refreshHistory, setRefreshHistory] = useState(0)
  const { toast } = useToast()

  useRealtime(
    'analises_duplicidade',
    (e) => {
      if (currentAnalysis && e.record.id === currentAnalysis.id) {
        setCurrentAnalysis(e.record as AnalysisRecord)
        if (
          e.action === 'update' &&
          (e.record.status === 'completed' || e.record.status === 'error')
        ) {
          setRefreshHistory((prev) => prev + 1)
        }
      }
    },
    !!currentAnalysis,
  )

  const loadAnalysis = useCallback(
    async (id: string) => {
      try {
        const data = await getAnalise(id)
        setCurrentAnalysis(data)
      } catch (err) {
        toast({ title: 'Erro', description: 'Falha ao carregar detalhes.', variant: 'destructive' })
      }
    },
    [toast],
  )

  const handleUploadSuccess = (record: AnalysisRecord) => {
    if (record.status === 'completed' || record.status === 'error') {
      setCurrentAnalysis(record)
    } else {
      setCurrentAnalysis(null)
    }
    setRefreshHistory((prev) => prev + 1)
  }

  const handleDeleteSuccess = (deletedId?: string) => {
    if (!deletedId || currentAnalysis?.id === deletedId) {
      setCurrentAnalysis(null)
    }
    setRefreshHistory((prev) => prev + 1)
  }

  return (
    <div className="relative flex-1 min-h-screen p-8 text-gray-900 bg-gray-50">
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between space-y-2 mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Análise de Duplicidade
            </h2>
            <p className="text-gray-500">
              Identifique duplicidades e revise lançamentos suspeitos em planilhas com auxílio de
              IA.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-1">
          <UploadSection onUploadSuccess={handleUploadSuccess} />

          {currentAnalysis && <ResultsDashboard analysis={currentAnalysis} />}

          <HistoryTable
            onViewDetails={loadAnalysis}
            refreshTrigger={refreshHistory}
            onDeleted={handleDeleteSuccess}
          />
        </div>
      </div>
    </div>
  )
}
