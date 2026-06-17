import { useState, useRef } from 'react'
import { Upload, FileIcon, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createAnalise } from '@/services/analise-duplicidade'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

import type { AnalysisRecord } from '@/services/analise-duplicidade'

export function UploadSection({
  onUploadSuccess,
}: {
  onUploadSuccess: (record: AnalysisRecord) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected && (selected.name.endsWith('.xlsx') || selected.name.endsWith('.xls'))) {
      setFile(selected)
    } else {
      toast({
        title: 'Formato inválido',
        description: 'Apenas arquivos .xlsx são permitidos.',
        variant: 'destructive',
      })
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    const startTime = Date.now()

    try {
      const result = await createAnalise(file)

      const elapsedTime = Date.now() - startTime
      if (elapsedTime < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 5000 - elapsedTime))
      }

      if (result.status === 'error') {
        toast({
          title: 'Erro na Análise',
          description: result.error_message || 'Falha ao processar arquivo no servidor.',
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Análise Concluída', description: 'O arquivo foi processado com sucesso.' })
      }
      onUploadSuccess(result)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      const elapsedTime = Date.now() - startTime
      if (elapsedTime < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 5000 - elapsedTime))
      }

      if (err.message === 'Session Expired' || err.status === 401) {
        toast({
          title: 'Sessão Expirada',
          description: 'Sua sessão expirou. Por favor, faça login novamente.',
          variant: 'destructive',
        })
        setTimeout(() => {
          window.location.href = '/login'
        }, 1500)
      } else {
        toast({
          title: 'Erro de Comunicação',
          description:
            'Ocorreu um erro ao conectar com o servidor. Verifique sua conexão e tente novamente.',
          variant: 'destructive',
        })
      }
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card className="bg-white border-gray-200 text-gray-900 shadow-md relative overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">Nova análise</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors',
            isUploading
              ? 'border-blue-400 bg-blue-50 pointer-events-none'
              : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
          )}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls"
            className="hidden"
          />

          {!file ? (
            <div
              className="text-center cursor-pointer w-full py-8"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-sm text-gray-600">
                Clique para selecionar ou arraste um arquivo .xlsx
              </p>
            </div>
          ) : (
            <div className="text-center w-full py-4">
              <FileIcon className="mx-auto h-12 w-12 text-blue-600 mb-4" />
              <p className="text-sm font-medium mb-6 text-gray-800">{file.name}</p>

              {isUploading ? (
                <div className="flex flex-col items-center justify-center gap-4 text-blue-600 py-4">
                  <div className="relative">
                    <Loader2 className="h-10 w-10 animate-spin" />
                    <div className="absolute inset-0 border-t-2 border-blue-400 rounded-full animate-ping opacity-20"></div>
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-base font-medium animate-pulse">
                      Analisando arquivo via IA...
                    </p>
                    <p className="text-xs text-blue-500">
                      Este processo pode levar alguns minutos. Por favor, não feche esta página.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-4 justify-center">
                  <Button
                    variant="outline"
                    className="text-gray-700 border-gray-300 hover:bg-gray-100"
                    onClick={() => setFile(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleUpload}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Iniciar análise
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
