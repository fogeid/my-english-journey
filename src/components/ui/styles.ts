const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

export const btn = {
  primary: `inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`,
  secondary: `inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`,
  danger: `inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`,
  ghost: `inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  icon: `inline-flex size-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 ${focus}`,
}

export const field = {
  label: 'mb-1 block text-sm font-medium text-slate-700',
  input:
    'block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-2 focus:outline-offset-0 focus:outline-indigo-600 aria-[invalid=true]:border-red-500',
  error: 'mt-1 text-sm text-red-700',
  hint: 'mt-1 text-xs text-slate-500',
}
