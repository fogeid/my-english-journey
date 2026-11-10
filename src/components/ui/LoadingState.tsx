import { LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'Carregando…', fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 text-slate-600 ${fullScreen ? 'min-h-dvh' : 'py-12'}`}
    >
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
