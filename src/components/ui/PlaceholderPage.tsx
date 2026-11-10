import { Construction } from 'lucide-react'
import { PageHeader } from './PageHeader'

/** Página reservada para uma etapa futura: apenas título e descrição, sem funcionalidade. */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section>
      <PageHeader title={title} description={description} />
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-500">
        <Construction className="size-5 shrink-0" aria-hidden="true" />
        <p>Esta seção será disponibilizada em uma etapa futura.</p>
      </div>
    </section>
  )
}
