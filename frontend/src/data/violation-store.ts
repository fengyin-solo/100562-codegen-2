// 专用业务数据的本地持久化：用热稽查与违规用热处理台账的卷宗、勘察记录、热费待办
// 与通用台账分开存放，避免 readStorage 的 fallback 合并把专用数据冲掉。
import { VIOLATION_SEED } from './violation-seed'

const DOMAIN_STORAGE_KEY = 'district-heating:violation'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export type DomainStore = {
  cases: import('@/data/violation-types').ViolationCase[]
  surveys: import('@/data/violation-types').SiteSurvey[]
  todos: import('@/data/violation-types').BillingTodo[]
}

function freshStore(): DomainStore {
  const seed = clone(VIOLATION_SEED)
  return { cases: seed.cases, surveys: seed.surveys, todos: seed.todos }
}

let cache: DomainStore | null = null

function readStore(): DomainStore {
  const fallback = freshStore()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(DOMAIN_STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(DOMAIN_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DomainStore>
    return {
      cases: Array.isArray(parsed.cases) ? parsed.cases : fallback.cases,
      surveys: Array.isArray(parsed.surveys) ? parsed.surveys : fallback.surveys,
      todos: Array.isArray(parsed.todos) ? parsed.todos : fallback.todos,
    }
  } catch {
    window.localStorage.setItem(DOMAIN_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

export function violationStore(): DomainStore {
  if (cache === null) {
    cache = readStore()
  }
  return cache
}

export function persistViolation(next: DomainStore): void {
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DOMAIN_STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetViolation(): DomainStore {
  const fresh = freshStore()
  persistViolation(fresh)
  return fresh
}

export function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}
