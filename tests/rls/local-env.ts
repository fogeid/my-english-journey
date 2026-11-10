import { execSync } from 'node:child_process'

export interface LocalSupabaseEnv {
  url: string
  anonKey: string
  serviceRoleKey: string
}

/**
 * Obtém URL e chaves do Supabase LOCAL via `supabase status`.
 * Recusa qualquer URL que não seja localhost: este teste cria e apaga usuários
 * e jamais deve rodar contra um projeto remoto.
 */
export function getLocalSupabaseEnv(): LocalSupabaseEnv {
  let raw: string
  try {
    raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error('Supabase local não está rodando. Execute `npm run db:start` antes de `npm run test:rls`.')
  }
  const json = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>
  const url = json.API_URL
  const anonKey = json.ANON_KEY ?? json.PUBLISHABLE_KEY
  const serviceRoleKey = json.SERVICE_ROLE_KEY ?? json.SECRET_KEY
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Saída de `supabase status` sem API_URL/ANON_KEY/SERVICE_ROLE_KEY.')

  const host = new URL(url).hostname
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`Recusado: teste RLS só roda contra Supabase local (host recebido: ${host}).`)
  }
  return { url, anonKey, serviceRoleKey }
}

const DB_CONTAINER = 'supabase_db_my-english-journey'

/** Executa SQL somente-leitura no container Postgres LOCAL e retorna as linhas (1 coluna). */
export function runLocalSql(sql: string): string[] {
  const out = execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1`, {
    input: `begin read only;\n${sql};\ncommit;\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== 'BEGIN' && l !== 'COMMIT')
}
