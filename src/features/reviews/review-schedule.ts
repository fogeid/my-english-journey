import type { Rating } from '../vocabulary/vocabulary-model'

/**
 * PRÉVIA do intervalo, só para rótulos dos botões ("Bom · 3 dias").
 * A fonte autoritativa é a função SQL public.review_vocabulary (o servidor calcula e grava as datas);
 * tests/rls/vocabulary-rls.test.ts confere que as duas tabelas são idênticas.
 */
export function previewIntervalMinutes(streak: number, rating: Rating): number {
  const s = Math.max(0, Math.min(100, Math.trunc(streak)))
  switch (rating) {
    case 'again':
      return 10
    case 'hard':
      return 1440
    case 'good':
      return 1440 * [1, 3, 7, 14, 30][Math.min(s, 4)]
    case 'easy':
      return 1440 * [3, 7, 14, 30][Math.min(s, 3)]
  }
}

export function previewStreakAfter(streak: number, rating: Rating): number {
  const s = Math.max(0, Math.min(100, Math.trunc(streak)))
  if (rating === 'again') return 0
  if (rating === 'hard') return s
  return Math.min(s + 1, 100)
}

export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const days = minutes / 1440
  return days === 1 ? '1 dia' : `${days} dias`
}

export const RATINGS: { value: Rating; label: string; key: string }[] = [
  { value: 'again', label: 'Errei', key: '1' },
  { value: 'hard', label: 'Difícil', key: '2' },
  { value: 'good', label: 'Bom', key: '3' },
  { value: 'easy', label: 'Fácil', key: '4' },
]
