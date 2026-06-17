import React, { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export const AuroraBackground = ({ className, children, ...props }: AuroraBackgroundProps) => {
  // Versão Otimizada (Performance Extrema)
  // Removemos as animações, blurs e mix-blends que causavam "Main Thread Blocking" e lag no scroll.
  return (
    <div
      className={cn('relative min-h-screen w-full bg-gray-50 text-gray-700', className)}
      {...props}
    >
      <div className="relative z-10 w-full min-h-screen flex flex-col">{children}</div>
    </div>
  )
}
