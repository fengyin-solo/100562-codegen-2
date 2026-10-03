/**
 * 用热稽查与违规用热处理台账的领域类型与口径。
 *
 * 案件状态是一条单行道：立案 → 取证 → 告知 → 决定，不允许跳级，
 * 出过处理决定后不允许倒回立案改材料。「已挂起」不是流程的一个环节，
 * 只是案由缺失时的旁挂标记，补齐案由后在原步骤继续。
 */

// 立案口径：案卷列表与勘察记录两处共用同一套案由，新案由只能在这里加。
export const CASE_REASONS = [
  '擅自偷热',
  '私接管网',
  '擅自改动计量表',
  '绕越计量装置',
  '破坏计量封印',
] as const

export type CaseReason = (typeof CASE_REASONS)[number]

// 线性流程的四个步骤，顺序即流转方向，下标差不是 1 的一律视为跳级。
export const STAGES = ['filing', 'evidence', 'notice', 'decision'] as const
export type StageKey = (typeof STAGES)[number]

export const STAGE_LABELS: Record<StageKey, string> = {
  filing: '立案',
  evidence: '取证',
  notice: '告知',
  decision: '决定',
}

export const STAGE_ACTIONS: Record<StageKey, string> = {
  filing: '提交立案',
  evidence: '提交取证',
  notice: '提交告知',
  decision: '作出决定',
}

export function nextStage(stage: StageKey): StageKey | null {
  const index = STAGES.indexOf(stage)
  return index >= 0 && index < STAGES.length - 1 ? STAGES[index + 1] : null
}

export function isStageKey(value: string): value is StageKey {
  return (STAGES as readonly string[]).includes(value)
}

// 立案材料
export type FilingMaterial = {
  caseNo: string
  customer: string
  address: string
  reason: string
  source: string
  recorder: string
  filedAt: string
}

// 现场取证材料：必须两名稽查人员同时签字
export type EvidenceMaterial = {
  siteSummary: string
  photoCount: number
  inspectorA: string
  inspectorB: string
  collectedAt: string
}

// 违规用热告知材料
export type NoticeMaterial = {
  documentNo: string
  notifiedAt: string
  method: string
  receiver: string
  content: string
}

// 处理决定材料；涉及追补热费时必须附计量记录
export type DecisionMaterial = {
  documentNo: string
  decision: string
  recoveryHeatFee: number
  meterRecordNo: string
  meterBefore: string
  meterAfter: string
  decidedAt: string
  handler: string
}

export type StageMaterial = Partial<
  Record<Exclude<StageKey, 'filing'>, Record<string, string | number>>
>

export type StageDraft = {
  evidence?: Partial<EvidenceMaterial>
  notice?: Partial<NoticeMaterial>
  decision?: Partial<DecisionMaterial>
}

export type HistoryEntry = {
  at: string
  action: string
  detail: string
}

export type ViolationCase = {
  id: number
  caseNo: string
  customer: string
  address: string
  reason: string
  source: string
  recorder: string
  filedAt: string
  stage: StageKey
  resolved: boolean
  suspended: boolean
  suspendReason: string
  materials: {
    evidence?: EvidenceMaterial
    notice?: NoticeMaterial
    decision?: DecisionMaterial
  }
  draft: StageDraft
  failedStage: StageKey | null
  failNote: string
  history: HistoryEntry[]
  // 通用看板（pending/abnormal）兼容字段
  pending: boolean
  abnormal: boolean
}

// 勘察记录：案由与案卷列表共用 CASE_REASONS；缺失或不在口径内先挂起待核。
export type SiteSurvey = {
  id: number
  surveyNo: string
  customer: string
  address: string
  reason: string
  surveyDate: string
  inspector: string
  finding: string
  convertedCaseId: number | null
  suspended: boolean
  suspendReason: string
}

// 办结后落到热费结算的待办
export type BillingTodo = {
  id: number
  todoNo: string
  caseId: number
  caseNo: string
  customer: string
  reason: string
  recoveryHeatFee: number
  meterRecordNo: string
  decisionDocumentNo: string
  resolvedAt: string
  acceptedAt: string | null
  billingRowId: number | null
}

export type ServiceResult<T = undefined> = {
  ok: boolean
  message: string
  data?: T
}

export const FAILURE_FLAG_KEY = 'district-heating:violation-fail-flag'
