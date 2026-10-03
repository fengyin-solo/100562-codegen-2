/**
 * 用热稽查与违规用热处理台账的业务服务：页面只渲染，所有规则在这里判。
 *
 * 铁律：
 * - 状态单行道 立案→取证→告知→决定，只能提交当前这一步，缺一步不许跳级；
 * - 已作出决定（resolved）的卷宗不许倒回立案、不许再改材料；
 * - 现场取证必须两名稽查人员共同签字；
 * - 追补热费必须附计量记录（计量单号 + 表码前后读数）；
 * - 案由缺失先挂起，补齐后在原步骤继续，不回退；
 * - 重复提交立案材料，在办卷宗只落一条；
 * - 提交失败先把材料暂存在对应步骤，之后从失败那一步接着录。
 */
import { listRows, saveRows } from '@/data/local-store'
import {
  nextId,
  persistViolation,
  resetViolation,
  violationStore,
} from '@/data/violation-store'
import {
  CASE_REASONS,
  FAILURE_FLAG_KEY,
  STAGE_ACTIONS,
  STAGE_LABELS,
  isStageKey,
  nextStage,
  type BillingTodo,
  type DecisionMaterial,
  type EvidenceMaterial,
  type FilingMaterial,
  type NoticeMaterial,
  type ServiceResult,
  type SiteSurvey,
  type StageKey,
  type ViolationCase,
} from '@/data/violation-types'

export { CASE_REASONS, STAGE_ACTIONS, STAGE_LABELS, STAGES } from '@/data/violation-types'

function todayStr(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function empty(material: unknown): boolean {
  return String(material ?? '').trim() === ''
}

function reindexFlags(row: ViolationCase): ViolationCase {
  row.pending = !row.resolved
  row.abnormal = row.suspended
  return row
}

// 把卷宗镜像到通用台账存储（heatviolation 键），让运营概览沿用既有统计。
function syncOverview(cases: ViolationCase[]): void {
  const rows = cases.map((item) => ({
    id: item.id,
    status: caseStatusText(item),
    pending: item.pending,
    abnormal: item.abnormal,
    案件编号: item.caseNo,
    用户名称: item.customer,
    用热地址: item.address,
    案由: item.reason,
    案件来源: item.source,
    立案人: item.recorder,
    立案日期: item.filedAt,
    案件状态: caseStatusText(item),
  }))
  saveRows('heatviolation', rows)
}

export function caseStatusText(row: ViolationCase): string {
  if (row.resolved) {
    return '已决定'
  }
  if (row.suspended) {
    return '已挂起'
  }
  return STAGE_LABELS[row.stage]
}

function save(cases: ViolationCase[], surveys?: SiteSurvey[], todos?: BillingTodo[]): void {
  const store = violationStore()
  cases.forEach(reindexFlags)
  persistViolation({
    cases,
    surveys: surveys ?? store.surveys,
    todos: todos ?? store.todos,
  })
  syncOverview(cases)
}

// ---------- 查询 ----------

export function listCases(filters: { keyword?: string; status?: string } = {}): ViolationCase[] {
  const keyword = filters.keyword?.trim() ?? ''
  const status = filters.status ?? ''
  return violationStore().cases.filter((row) => {
    if (keyword) {
      const haystack = `${row.caseNo} ${row.customer} ${row.address} ${row.reason}`
      if (!haystack.includes(keyword)) {
        return false
      }
    }
    if (status && caseStatusText(row) !== status) {
      return false
    }
    return true
  })
}

export function getCase(id: number): ViolationCase | undefined {
  return violationStore().cases.find((row) => row.id === id)
}

export function listSurviews(): SiteSurvey[] {
  return violationStore().surveys
}

export function listBillingTodos(): BillingTodo[] {
  return violationStore().todos
}

// ---------- 立案 ----------

function nextCaseNo(cases: ViolationCase[]): string {
  const seq = cases.reduce((max, row) => {
    const match = /YZJC-\d{4}-(\d+)/.exec(row.caseNo)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `YZJC-2026-${String(seq + 1).padStart(4, '0')}`
}

export type CreateCaseOutcome = { caseId: number; duplicated: boolean }

export function createCase(
  material: FilingMaterial,
): ServiceResult<CreateCaseOutcome> {
  if (empty(material.customer)) {
    return { ok: false, message: '用户名称不能为空，无法立案。' }
  }
  if (empty(material.address)) {
    return { ok: false, message: '用热地址不能为空，无法立案。' }
  }
  if (empty(material.recorder)) {
    return { ok: false, message: '立案人不能为空，无法立案。' }
  }
  // 案由必须沿用既有立案口径；不在目录里的（含空白）一律挂起，而不是硬退。
  const reasonKnown = !empty(material.reason) && CASE_REASONS.includes(material.reason as (typeof CASE_REASONS)[number])

  const store = violationStore()
  // 重复提交立案材料：同一用户、同一用热地址且仍在办（未作出决定）的卷宗只落一条。
  // 同户不同案由视为新的违法事实，允许另立；已办结的不拦截新案。
  const duplicate = store.cases.find(
    (row) =>
      !row.resolved &&
      row.customer.trim() === material.customer.trim() &&
      row.address.trim() === material.address.trim(),
  )
  if (duplicate) {
    return {
      ok: true,
      message: `该用户、该地址的在办卷宗已存在（${duplicate.caseNo}），不重复立案，直接沿用原卷宗。`,
      data: { caseId: duplicate.id, duplicated: true },
    }
  }

  const id = nextId(store.cases)
  const filedAt = material.filedAt || todayStr()
  // 案由核定通过即视为立案步骤完成，案件进入「取证」；案由缺失则停在立案并挂起。
  const row: ViolationCase = {
    id,
    caseNo: material.caseNo || nextCaseNo(store.cases),
    customer: material.customer.trim(),
    address: material.address.trim(),
    reason: reasonKnown ? material.reason : '',
    source: material.source.trim(),
    recorder: material.recorder.trim(),
    filedAt,
    stage: reasonKnown ? 'evidence' : 'filing',
    resolved: false,
    suspended: !reasonKnown,
    suspendReason: reasonKnown ? '' : '立案材料缺少符合口径的案由，按既有立案口径无法核定，先挂起待补。',
    materials: {},
    draft: {},
    failedStage: null,
    failNote: '',
    history: reasonKnown
      ? [{ at: filedAt, action: '提交立案', detail: `立案材料核定通过，案由：${material.reason}，进入取证。` }]
      : [{ at: filedAt, action: '立案挂起', detail: '案由缺失，卷宗挂起，补齐案由后从立案这一步继续。' }],
    pending: true,
    abnormal: !reasonKnown,
  }
  save([...store.cases, row])
  return {
    ok: true,
    message: reasonKnown
      ? `卷宗 ${row.caseNo} 已立案，进入取证环节。`
      : `卷宗 ${row.caseNo} 已登记，但案由缺失已挂起，补齐案由后继续。`,
    data: { caseId: id, duplicated: false },
  }
}

// 挂起卷宗补齐案由：核定通过后在原步骤继续，不回退、不改写既有材料。
export function resolveCaseReason(id: number, reason: string): ServiceResult {
  const store = violationStore()
  const index = store.cases.findIndex((row) => row.id === id)
  if (index < 0) {
    return { ok: false, message: '没有找到这条卷宗。' }
  }
  const row = store.cases[index]
  if (!row.suspended) {
    return { ok: false, message: '该卷宗未挂起，不需要补案由。' }
  }
  if (empty(reason) || !CASE_REASONS.includes(reason as (typeof CASE_REASONS)[number])) {
    return { ok: false, message: '案由必须从既有立案口径中选择，不能留空或自拟。' }
  }
  const updated: ViolationCase = {
    ...row,
    reason,
    // 补齐案由即完成立案核定，案件在不回退任何材料的前提下进入取证。
    stage: row.stage === 'filing' ? 'evidence' : row.stage,
    suspended: false,
    suspendReason: '',
    history: [
      ...row.history,
      {
        at: todayStr(),
        action: '案由核定',
        detail:
          row.stage === 'filing'
            ? `补齐案由「${reason}」，立案核定通过，进入取证。`
            : `补齐案由「${reason}」，卷宗恢复，从${STAGE_LABELS[row.stage]}这一步继续。`,
      },
    ],
  }
  const cases = [...store.cases]
  cases[index] = updated
  save(cases)
  return { ok: true, message: `案由已核定为「${reason}」，卷宗从${STAGE_LABELS[updated.stage]}继续。` }
}

// ---------- 分步流转 ----------

function validateStage(stage: StageKey, payload: Record<string, unknown>): string | null {
  if (stage === 'evidence') {
    const material = payload as Partial<EvidenceMaterial>
    if (empty(material.siteSummary)) {
      return '现场取证情况不能为空。'
    }
    if (!material.photoCount || Number(material.photoCount) <= 0) {
      return '现场取证至少要附 1 张取证照片。'
    }
    if (empty(material.inspectorA) || empty(material.inspectorB)) {
      return '现场取证必须由两名稽查人员共同签字。'
    }
    if (String(material.inspectorA).trim() === String(material.inspectorB).trim()) {
      return '两名签字稽查人员不能是同一人，必须两人签字。'
    }
    if (empty(material.collectedAt)) {
      return '取证日期不能为空。'
    }
  }
  if (stage === 'notice') {
    const material = payload as Partial<NoticeMaterial>
    if (empty(material.documentNo)) {
      return '告知书编号不能为空。'
    }
    if (empty(material.notifiedAt)) {
      return '告知日期不能为空。'
    }
    if (empty(material.method)) {
      return '告知方式不能为空。'
    }
    if (empty(material.receiver)) {
      return '受送达人不能为空。'
    }
  }
  if (stage === 'decision') {
    const material = payload as Partial<DecisionMaterial>
    if (empty(material.documentNo)) {
      return '处理决定书编号不能为空。'
    }
    if (empty(material.decision)) {
      return '处理决定内容不能为空。'
    }
    if (empty(material.handler)) {
      return '决定作出人不能为空。'
    }
    if (empty(material.decidedAt)) {
      return '决定日期不能为空。'
    }
    // 追补热费必须附计量记录。
    if (Number(material.recoveryHeatFee ?? 0) > 0) {
      if (empty(material.meterRecordNo) || empty(material.meterBefore) || empty(material.meterAfter)) {
        return '追补热费必须附计量记录：计量单号、表码前读数、表码后读数都要补齐。'
      }
    }
  }
  return null
}

// 模拟「中途提交失败」开关：打开后，提交在暂存材料之后、落库之前失败。
export function setFailNextSubmit(on: boolean): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(FAILURE_FLAG_KEY, on ? '1' : '0')
  }
}

export function isFailNextSubmit(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false
  }
  return window.localStorage.getItem(FAILURE_FLAG_KEY) === '1'
}

// 仅暂存当前步骤材料，不流转：随时能从失败那一步接着录。
export function saveStageDraft(
  id: number,
  stage: StageKey,
  draft: Record<string, unknown>,
): ServiceResult {
  const store = violationStore()
  const index = store.cases.findIndex((row) => row.id === id)
  if (index < 0) {
    return { ok: false, message: '没有找到这条卷宗。' }
  }
  const row = store.cases[index]
  if (row.resolved) {
    return { ok: false, message: '卷宗已作出决定，材料已封卷，不能再改。' }
  }
  if (stage !== row.stage) {
    return { ok: false, message: `只能暂存当前步骤（${STAGE_LABELS[row.stage]}）的材料。` }
  }
  const updated: ViolationCase = {
    ...row,
    draft: { ...row.draft, [stage]: draft },
    failedStage: stage,
    failNote: `材料已暂存在「${STAGE_LABELS[stage]}」，可随时从这一步接着录。`,
  }
  const cases = [...store.cases]
  cases[index] = updated
  save(cases)
  return { ok: true, message: `材料已暂存，下次从「${STAGE_LABELS[stage]}」继续。` }
}

export function submitStage(
  id: number,
  expectedStage: StageKey,
  payload: Record<string, unknown>,
): ServiceResult {
  const store = violationStore()
  const index = store.cases.findIndex((row) => row.id === id)
  if (index < 0) {
    return { ok: false, message: '没有找到这条卷宗。' }
  }
  const row = store.cases[index]

  // 已出决定：封卷，不许倒回立案改材料。
  if (row.resolved) {
    return { ok: false, message: '该卷宗已作出处理决定并封卷，不能倒回任何步骤修改材料。' }
  }
  // 挂起中：先补案由。
  if (row.suspended) {
    return { ok: false, message: '卷宗处于挂起状态，请先按立案口径核定案由后再继续。' }
  }
  // 单行道：只能提交当前这一步，缺一步不许跳级。
  if (!isStageKey(expectedStage) || expectedStage !== row.stage) {
    return {
      ok: false,
      message: `不能跳级：卷宗当前在「${STAGE_LABELS[row.stage]}」，必须先完成这一步，不能直接提交「${STAGE_LABELS[expectedStage]}」。`,
    }
  }

  // 先校验材料：材料不合格不算系统失败，但同样把已填内容暂存在当前步骤。
  const invalid = validateStage(expectedStage, payload)
  if (invalid) {
    const cases = [...store.cases]
    cases[index] = {
      ...row,
      draft: { ...row.draft, [expectedStage]: payload },
      failedStage: expectedStage,
      failNote: `材料不完整，已暂存在「${STAGE_LABELS[expectedStage]}」，补齐后从这一步继续。`,
    }
    save(cases)
    return { ok: false, message: `${invalid}（已填内容已暂存，不会丢失）` }
  }

  // 材料先落草稿，再模拟可能出现的中途提交失败：失败后从失败那一步接着录。
  const staged: ViolationCase = {
    ...row,
    draft: { ...row.draft, [expectedStage]: payload },
  }
  if (isFailNextSubmit()) {
    setFailNextSubmit(false)
    const failed: ViolationCase = {
      ...staged,
      failedStage: expectedStage,
      failNote: `提交在「${STAGE_LABELS[expectedStage]}」这一步中断，材料已暂存，请从失败这一步重新提交。`,
    }
    const cases = [...store.cases]
    cases[index] = failed
    save(cases)
    return {
      ok: false,
      message: `提交在「${STAGE_LABELS[expectedStage]}」这一步失败，材料已保留，请从失败这一步接着录。`,
    }
  }

  const target = nextStage(expectedStage)
  const isFinal = expectedStage === 'decision'
  const updated: ViolationCase = {
    ...staged,
    materials: {
      ...staged.materials,
      [expectedStage]: payload,
    },
    stage: target ?? expectedStage,
    resolved: isFinal,
    draft: isFinal ? {} : { ...staged.draft, [expectedStage]: undefined },
    failedStage: null,
    failNote: '',
    history: [
      ...staged.history,
      {
        at: todayStr(),
        action: STAGE_ACTIONS[expectedStage],
        detail: buildHistoryDetail(expectedStage, payload),
      },
    ],
  }
  if (isFinal) {
    updated.draft = {}
  }

  // 办结结果落到热费结算待办清单。
  let todos = store.todos
  if (isFinal) {
    const decision = payload as DecisionMaterial
    todos = [...store.todos, buildTodo(updated, decision)]
  }

  const cases = [...store.cases]
  cases[index] = updated
  save(cases, undefined, todos)

  return {
    ok: true,
    message: isFinal
      ? `卷宗 ${row.caseNo} 已作出处理决定并封卷，办结结果已推送热费结算待办。`
      : `「${STAGE_LABELS[expectedStage]}」完成，进入「${STAGE_LABELS[target as StageKey]}」。`,
  }
}

function buildHistoryDetail(stage: StageKey, payload: Record<string, unknown>): string {
  if (stage === 'evidence') {
    const material = payload as EvidenceMaterial
    return `现场取证完成，照片 ${material.photoCount} 张，稽查人员 ${material.inspectorA}、${material.inspectorB} 共同签字。`
  }
  if (stage === 'notice') {
    const material = payload as NoticeMaterial
    return `告知书 ${material.documentNo} 已${material.method}送达。`
  }
  const material = payload as DecisionMaterial
  if (Number(material.recoveryHeatFee ?? 0) > 0) {
    return `处理决定书 ${material.documentNo}：${material.decision}（附计量记录 ${material.meterRecordNo}）。`
  }
  return `处理决定书 ${material.documentNo}：${material.decision}`
}

function buildTodo(row: ViolationCase, decision: DecisionMaterial): BillingTodo {
  const store = violationStore()
  const seq = store.todos.reduce((max, todo) => {
    const match = /ZB-\d{4}-(\d+)/.exec(todo.todoNo)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return {
    id: nextId(store.todos),
    todoNo: `ZB-2026-${String(seq + 1).padStart(4, '0')}`,
    caseId: row.id,
    caseNo: row.caseNo,
    customer: row.customer,
    reason: row.reason,
    recoveryHeatFee: Number(decision.recoveryHeatFee ?? 0) || 0,
    meterRecordNo: decision.meterRecordNo ?? '',
    decisionDocumentNo: decision.documentNo,
    resolvedAt: decision.decidedAt || todayStr(),
    acceptedAt: null,
    billingRowId: null,
  }
}

// ---------- 勘察记录（与案卷共用同一套案由口径） ----------

export function resolveSurveyReason(id: number, reason: string): ServiceResult {
  const store = violationStore()
  const index = store.surveys.findIndex((row) => row.id === id)
  if (index < 0) {
    return { ok: false, message: '没有找到这条勘察记录。' }
  }
  const row = store.surveys[index]
  if (!row.suspended) {
    return { ok: false, message: '该勘察记录未挂起。' }
  }
  if (empty(reason) || !CASE_REASONS.includes(reason as (typeof CASE_REASONS)[number])) {
    return { ok: false, message: '案由必须从既有立案口径中选择，不能留空或自拟。' }
  }
  const surveys = [...store.surveys]
  surveys[index] = { ...row, reason, suspended: false, suspendReason: '' }
  save(store.cases, surveys)
  return { ok: true, message: `勘察记录案由已核定为「${reason}」，可以转立案。` }
}

// 勘察记录转立案：案由必须在口径内，挂起记录不允许转。
export function surveyToCase(id: number, recorder: string): ServiceResult<CreateCaseOutcome> {
  const store = violationStore()
  const survey = store.surveys.find((row) => row.id === id)
  if (!survey) {
    return { ok: false, message: '没有找到这条勘察记录。' }
  }
  if (survey.convertedCaseId !== null) {
    return { ok: false, message: `该勘察记录已转立案（卷宗编号见列表），不能重复转。` }
  }
  if (survey.suspended || empty(survey.reason)) {
    return { ok: false, message: '勘察记录案由缺失已挂起，先核定案由后才能转立案。' }
  }
  const created = createCase({
    caseNo: '',
    customer: survey.customer,
    address: survey.address,
    reason: survey.reason,
    source: `勘察记录 ${survey.surveyNo} 转立案`,
    recorder: recorder || survey.inspector,
    filedAt: survey.surveyDate || todayStr(),
  })
  if (!created.data) {
    return created
  }
  const surveys = store.surveys.map((row) =>
    row.id === id ? { ...row, convertedCaseId: created.data!.caseId } : row,
  )
  const cases = violationStore().cases
  save(cases, surveys)
  return {
    ok: true,
    message: created.data.duplicated
      ? created.message
      : `勘察记录 ${survey.surveyNo} 已转立为卷宗。`,
    data: created.data,
  }
}

// ---------- 热费结算待办 ----------

export function acceptBillingTodo(todoId: number): ServiceResult<{ billingId: number }> {
  const store = violationStore()
  const index = store.todos.findIndex((todo) => todo.id === todoId)
  if (index < 0) {
    return { ok: false, message: '没有找到这条待办。' }
  }
  const todo = store.todos[index]
  if (todo.acceptedAt) {
    return { ok: false, message: '该待办已受理，已在热费结算清单中。' }
  }

  // 办结待办落进通用热费结算台账，状态为「追补待核算」，等待收费员核算。
  const rows = [...listRows('heatbilling')]
  const billingId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  rows.push({
    id: billingId,
    status: '追补待核算',
    pending: true,
    abnormal: false,
    结算编号: `BL-ZB-${String(todo.id).padStart(4, '0')}`,
    用户名称: todo.customer,
    用热面积: '以计量记录核定',
    热价标准: '违规追补',
    应缴金额: todo.recoveryHeatFee,
    缴费日期: '',
    收费员: '',
    结算状态: '追补待核算',
    来源卷宗: todo.caseNo,
    计量记录: todo.meterRecordNo,
  } as (typeof rows)[number])
  saveRows('heatbilling', rows)

  const todos = [...store.todos]
  todos[index] = { ...todo, acceptedAt: todayStr(), billingRowId: billingId }
  save(store.cases, undefined, todos)
  return {
    ok: true,
    message: `已受理，生成热费结算待算单 BL-ZB-${String(todo.id).padStart(4, '0')}。`,
    data: { billingId },
  }
}

export function resetViolationLedger(): void {
  const fresh = resetViolation()
  syncOverview(fresh.cases)
}

// 应用启动时调用：把稽查卷宗镜像到通用存储，供运营概览沿用既有统计。
export function initViolationLedger(): void {
  const rows = listRows('heatviolation')
  if (rows.length === 0) {
    syncOverview(violationStore().cases)
  }
}
