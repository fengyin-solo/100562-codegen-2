import { buildSeed, SEED_SURVEYS, SEED_TODOS } from './seed'
import type { AuditCase, BillingTodo, StageDraft, SurveyRecord } from './types'

// 稽查台账独立存储，键名与通用台账区分，互不污染。
const CASES_KEY = 'district-heating:audit-cases'
const SURVEYS_KEY = 'district-heating:audit-surveys'
const DRAFTS_KEY = 'district-heating:audit-drafts'
const TODOS_KEY = 'district-heating:audit-billing-todos'
const META_KEY = 'district-heating:audit-meta' // 自增序号
const DRILL_KEY = 'district-heating:audit-fail-drill'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(fallback)
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return clone(fallback)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return clone(fallback)
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

export function loadCases(): AuditCase[] {
  return read<AuditCase[]>(CASES_KEY, buildSeed())
}

export function saveCases(cases: AuditCase[]): void {
  write(CASES_KEY, cases)
}

export function loadSurveys(): SurveyRecord[] {
  return read<SurveyRecord[]>(SURVEYS_KEY, SEED_SURVEYS)
}

export function saveSurveys(rows: SurveyRecord[]): void {
  write(SURVEYS_KEY, rows)
}

export function loadDrafts(): StageDraft[] {
  return read<StageDraft[]>(DRAFTS_KEY, [])
}

export function saveDrafts(drafts: StageDraft[]): void {
  write(DRAFTS_KEY, drafts)
}

export function loadTodos(): BillingTodo[] {
  return read<BillingTodo[]>(TODOS_KEY, SEED_TODOS)
}

export function saveTodos(todos: BillingTodo[]): void {
  write(TODOS_KEY, todos)
}

interface MetaState {
  caseSeq: number
  surveySeq: number
  evidenceSeq: number
  meterSeq: number
  draftSeq: number
  todoSeq: number
  billingSeq: number
}

const META_FALLBACK: MetaState = {
  caseSeq: 100,
  surveySeq: 100,
  evidenceSeq: 100,
  meterSeq: 100,
  draftSeq: 100,
  todoSeq: 100,
  billingSeq: 9000,
}

export function loadMeta(): MetaState {
  return read<MetaState>(META_KEY, META_FALLBACK)
}

export function saveMeta(meta: MetaState): void {
  write(META_KEY, meta)
}

/** 取下一个自增号，序号本身也持久化，避免删记录后撞号。 */
export function nextId(field: keyof MetaState): number {
  const meta = loadMeta()
  meta[field] += 1
  saveMeta(meta)
  return meta[field]
}

/** 提交失败演练开关：打开后所有阶段提交都在落库前失败，用于演示断点续录。 */
export function isFailDrillOn(): boolean {
  return read<boolean>(DRILL_KEY, false)
}

export function setFailDrill(on: boolean): void {
  write(DRILL_KEY, on)
}
