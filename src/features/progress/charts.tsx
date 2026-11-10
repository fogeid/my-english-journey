import { useEffect, useId, useRef, useState } from 'react'
import { formatScore } from '../lessons/lesson-model'
import { formatDate } from '../schedule/week'
import type { ScorePoint, SkillStat, WeekStat } from './progress-model'

/**
 * Gráficos simples em SVG/HTML, sem biblioteca. Série única → um só matiz (indigo-600, validado
 * para contraste no fundo claro), sem legenda (o título nomeia a série). Marcas finas, grade recessiva,
 * rótulos seletivos, leitura por hover/foco (teclado) e tabela de dados como alternativa acessível.
 */
const SERIES = '#4f46e5' // indigo-600
const GRID = '#e2e8f0' // slate-200
const AXIS_TEXT = '#64748b' // slate-500
const SURFACE = '#ffffff'

function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function Readout({ text }: { text: string | null }) {
  return (
    <p aria-live="polite" className="mb-2 min-h-5 text-sm text-slate-700">
      {text ?? <span className="text-slate-400">Passe o mouse ou use Tab para ver cada valor.</span>}
    </p>
  )
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-indigo-700 hover:underline">Ver dados em tabela</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="border-b border-slate-200 py-1 pr-3 font-medium text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="border-b border-slate-100 py-1 pr-3 tabular-nums text-slate-800">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// ---------- Evolução das notas (linha) ----------
export function ScoreLineChart({ points }: { points: ScorePoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const titleId = useId()
  const height = 200
  const m = { top: 16, right: 28, bottom: 28, left: 28 }
  const innerW = width - m.left - m.right
  const innerH = height - m.top - m.bottom
  const x = (i: number) => m.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1))
  const y = (v: number) => m.top + innerH - (v / 10) * innerH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const describe = (p: ScorePoint) => `Aula ${p.lessonNumber}${p.title ? ` — ${p.title}` : ''} · ${formatDate(p.date)} · nota ${formatScore(p.score)}`
  // Rótulos do eixo X: no máximo ~6, para não colidir no mobile.
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 70))))

  return (
    <div ref={ref}>
      <Readout text={active === null ? null : describe(points[active])} />
      <svg
        width={width}
        height={height}
        role="group"
        aria-labelledby={titleId}
        className="block max-w-full overflow-visible"
      >
        <title id={titleId}>
          {`Nota geral por aula concluída, de 0 a 10. ${points.length} aulas; última: ${formatScore(last.score)} (aula ${last.lessonNumber}).`}
        </title>
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={m.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
              {v}
            </text>
          </g>
        ))}
        {points.length > 1 && <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g
            key={p.lessonId}
            tabIndex={0}
            role="button"
            aria-label={describe(p)}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="cursor-pointer outline-none [&:focus-visible>circle.ring]:stroke-indigo-300"
          >
            <circle cx={x(i)} cy={y(p.score)} r={14} fill="transparent" />
            <circle className="ring" cx={x(i)} cy={y(p.score)} r={active === i ? 7 : 5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          </g>
        ))}
        <text x={x(points.length - 1)} y={y(last.score) - 12} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0f172a">
          {formatScore(last.score)}
        </text>
        {points.map((p, i) =>
          i % step === 0 || i === points.length - 1 ? (
            <text key={p.lessonId} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              {`A${p.lessonNumber}`}
            </text>
          ) : null,
        )}
      </svg>
      <DataTable
        caption="Nota geral por aula"
        head={['Aula', 'Data', 'Nota']}
        rows={points.map((p) => [`${p.lessonNumber}${p.title ? ` — ${p.title}` : ''}`, formatDate(p.date), formatScore(p.score)])}
      />
    </div>
  )
}

// ---------- Desempenho por habilidade (barras horizontais) ----------
export function SkillBars({ skills }: { skills: SkillStat[] }) {
  return (
    <ul className="space-y-3" aria-label="Média por habilidade (0 a 10)">
      {skills.map((s) => (
        <li key={s.skill} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="text-slate-700">{s.label}</span>
          <span className="relative h-3 rounded-r bg-slate-100" aria-hidden="true">
            {s.average !== null && (
              <span
                className="absolute inset-y-0 left-0 rounded-r"
                style={{ width: `${(s.average / 10) * 100}%`, background: SERIES, minWidth: s.average > 0 ? 4 : 0 }}
                title={`${s.label}: ${formatScore(s.average)} (${s.blocks} ${s.blocks === 1 ? 'bloco' : 'blocos'})`}
              />
            )}
          </span>
          <span className="min-w-[5.5rem] text-right tabular-nums text-slate-900">
            {s.average === null ? (
              <span className="text-slate-400">sem notas</span>
            ) : (
              <>
                <strong>{formatScore(s.average)}</strong> <span className="text-xs text-slate-500">({s.blocks})</span>
              </>
            )}
            <span className="sr-only">{s.average === null ? '' : ` de 10, ${s.blocks} ${s.blocks === 1 ? 'bloco avaliado' : 'blocos avaliados'}`}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// ---------- Dias com estudo por semana (colunas) ----------
export function WeeklyBars({ weeks }: { weeks: WeekStat[] }) {
  const [active, setActive] = useState<number | null>(null)
  const titleId = useId()
  const describe = (w: WeekStat) => `Semana de ${formatDate(w.weekStart)}: ${w.days} ${w.days === 1 ? 'dia' : 'dias'} com estudo`
  const step = Math.max(1, Math.ceil(weeks.length / 6))
  return (
    <div>
      <Readout text={active === null ? null : describe(weeks[active])} />
      <figure aria-labelledby={titleId} className="relative m-0">
        <span id={titleId} className="sr-only">
          {`Dias com estudo por semana (0 a 7), ${weeks.length} semanas.`}
        </span>
        <div className="flex h-36 items-end gap-0.5 border-b border-slate-200">
          {weeks.map((w, i) => (
            <button
              key={w.weekStart}
              type="button"
              aria-label={describe(w)}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              {w.days > 0 && <span className="mb-0.5 text-[11px] tabular-nums text-slate-600">{w.days}</span>}
              <span
                className="w-full max-w-6 rounded-t"
                style={{ height: `${(w.days / 7) * 100}%`, background: SERIES, opacity: active === null || active === i ? 1 : 0.55 }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1 flex gap-0.5 text-[11px] text-slate-500">
          {weeks.map((w, i) => (
            <span key={w.weekStart} className="min-w-0 flex-1 truncate text-center">
              {i % step === 0 || i === weeks.length - 1 ? formatDate(w.weekStart).slice(0, 5) : ''}
            </span>
          ))}
        </div>
      </figure>
      <DataTable caption="Dias com estudo por semana" head={['Semana (início)', 'Dias com estudo']} rows={weeks.map((w) => [formatDate(w.weekStart), w.days])} />
    </div>
  )
}
