import { listRows, saveRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'
import { adjudgeReason, findReasonByName, reasonBasis, REASON_CATALOG } from './reasons'
import {
  isFailDrillOn,
  loadCases,
  loadDrafts,
  loadMeta,
  loadSurveys,
  loadTodos,
  nextId,
  saveCases,
  saveDrafts,
  saveMeta,
  saveSurveys,
  saveTodos,
} from './store'
import type {
  AuditCase,
  BillingTodo,
  CaseLog,
  CaseStage,
  DecisionInfo,
  EvidenceItem,
  FilingInput,
  MeterRecord,
  NoticeInfo,
  OpResult,
  StageDraft,
  SurveyRecord,
} from './types'
import { CASE_STAGES } from './types'

/**
 * 用热稽查领域服务。
 * 状态机硬约束：立案 → 取证 → 告知 → 决定，只能顺阶段前进；
 * 挂起是立案前的卡口（案由缺失）；出过决定（closed）一律封卷，不接受任何修改与倒回。
 */

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function today(): string {
  return nowStamp().slice(0, 10)
}

function addLog(item: AuditCase, action: string, detail: string, operator = '稽查队'): void {
  const entry: CaseLog = { at: nowStamp(), action, detail, operator }
  item.logs.push(entry)
  item.updatedAt = entry.at
}

function requireOpen(item: AuditCase | undefined): OpResult {
  if (!item) {
    return { ok: false, message: '没有找到这条案卷' }
  }
  if (item.closed) {
    return { ok: false, message: '该案卷已作出处理决定并封卷，不得倒回立案或修改任何材料' }
  }
  return { ok: true, message: '' }
}

function requireStage(item: AuditCase, expected: CaseStage): OpResult {
  if (item.status === '挂起') {
    return { ok: false, message: '该案卷因案由缺失挂起，须先补正核定案由后才能继续' }
  }
  if (item.status !== expected) {
    return {
      ok: false,
      message: `当前处于「${item.status}」阶段，只能办理本阶段的事，不能跳到「${expected}」`,
    }
  }
  return { ok: true, message: '' }
}

// ---------- 查询 ----------

export function listCases(): AuditCase[] {
  return loadCases()
}

export function getCase(id: number): AuditCase | undefined {
  return loadCases().find((item) => item.id === id)
}

// ---------- 草稿：提交失败从失败那一步接着录 ----------

export function listDrafts(): StageDraft[] {
  return loadDrafts().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function getDraft(caseId: number, stage?: CaseStage): StageDraft | undefined {
  return loadDrafts()
    .filter((d) => d.caseId === caseId && (stage ? d.stage === stage : true))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
}

/** 录入过程中随时暂存：提交失败后表单内容不丢，打开还在失败的那一步。 */
export function saveDraft(caseId: number, stage: CaseStage, payload: unknown, lastError = ''): void {
  const drafts = loadDrafts()
  const idx = drafts.findIndex((d) => d.caseId === caseId && d.stage === stage)
  const body = JSON.stringify(payload ?? {})
  if (idx >= 0) {
    drafts[idx].payload = body
    drafts[idx].lastError = lastError
    drafts[idx].updatedAt = nowStamp()
  } else {
    drafts.push({
      id: nextId('draftSeq'),
      caseId,
      stage,
      payload: body,
      lastError,
      updatedAt: nowStamp(),
    })
  }
  saveDrafts(drafts)
}

export function readDraftPayload<T>(draft: StageDraft | undefined): T | null {
  if (!draft) {
    return null
  }
  try {
    return JSON.parse(draft.payload) as T
  } catch {
    return null
  }
}

export function clearDraft(caseId: number, stage: CaseStage): void {
  saveDrafts(loadDrafts().filter((d) => !(d.caseId === caseId && d.stage === stage)))
}

export function removeDraft(id: number): void {
  saveDrafts(loadDrafts().filter((d) => d.id !== id))
}

/** 演练开关打开时，阶段提交在落库前失败，材料留在草稿里。 */
function failSubmit(
  caseId: number,
  stage: CaseStage,
  payload: unknown,
  reason: string,
): OpResult {
  saveDraft(caseId, stage, payload, reason)
  return { ok: false, message: reason }
}

// ---------- 立案 ----------

function filingFingerprint(input: { userName: string; userAddress: string; reason: string }): string {
  return [input.userName.trim(), input.userAddress.trim(), input.reason.trim()].join('|')
}

function genCaseNo(seq: number): string {
  return `稽立字〔${new Date().getFullYear()}〕第${String(seq).padStart(3, '0')}号`
}

/** 立案：相同立案材料重复提交只落一条（按当事人+地址+案由去重，含已封卷案件）。 */
export function fileCase(input: FilingInput): OpResult<{ caseId: number; duplicated: boolean }> {
  const userName = input.userName.trim()
  const userAddress = input.userAddress.trim()
  const inspector = input.inspector.trim()
  if (!userName || !userAddress) {
    return { ok: false, message: '当事人与用热地址必须填写' }
  }
  if (!inspector) {
    return { ok: false, message: '主办稽查员必须填写' }
  }
  if (!input.filedAt) {
    return { ok: false, message: '立案日期必须填写' }
  }

  const reason = input.reason.trim()
  const reasonKnown = reason !== '' && !!findReasonByName(reason)
  if (reason !== '' && !reasonKnown) {
    return { ok: false, message: '案由不在统一案由目录内，请改用目录口径登记，或留空走挂起补正' }
  }

  const key = filingFingerprint({ userName, userAddress, reason })
  const existed = loadCases().find((item) => item.dedupeKey === key)
  if (existed) {
    return {
      ok: true,
      message: `相同立案材料已登记（${existed.caseNo}），未重复建档`,
      data: { caseId: existed.id, duplicated: true },
    }
  }

  // 提交失败演练：立案也按失败那一步留住草稿。
  if (isFailDrillOn()) {
    const failed = failSubmit(0, '立案', input, '提交失败（演练）：立案材料未送达，已暂存，可从立案这一步继续提交')
    return { ok: false, message: failed.message }
  }

  const suspended = !reasonKnown
  const seq = nextId('caseSeq')
  const item: AuditCase = {
    id: seq,
    caseNo: genCaseNo(seq),
    userName,
    userAddress,
    reason: reasonKnown ? reason : '',
    reasonSource: input.reasonSource || '立案登记',
    filingBasis: reasonKnown ? reasonBasis(reason) : '',
    description: input.description.trim(),
    inspector,
    filedAt: input.filedAt,
    dedupeKey: key,
    status: suspended ? '挂起' : '立案',
    pending: true,
    abnormal: suspended,
    suspended,
    suspendReason: suspended ? '案由缺失：未核定到统一案由目录，暂不允许推进，补正案由后恢复。' : '',
    evidences: [],
    evidenceSubmittedAt: '',
    notice: null,
    noticeSubmittedAt: '',
    decision: null,
    decisionAt: '',
    closed: false,
    logs: [],
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
  }
  addLog(
    item,
    suspended ? '立案挂起' : '立案',
    suspended
      ? '案由缺失，按规定挂起，待按统一案由目录核定后补正恢复。'
      : `按统一案由「${reason}」登记立案，依据：${item.filingBasis}`,
    inspector,
  )

  const cases = loadCases()
  cases.push(item)
  saveCases(cases)
  clearDraft(0, '立案')
  return {
    ok: true,
    message: suspended
      ? `已登记但案由缺失，案卷（${item.caseNo}）挂起，补正案由后恢复`
      : `立案成功，案件编号 ${item.caseNo}`,
    data: { caseId: item.id, duplicated: false },
  }
}

/**
 * 修改立案材料 / 补正挂起案由。
 * 只有挂起或刚立案（尚未取证）时可以改；进入取证以后立案材料冻结；已封卷一律不许改。
 */
export function updateFiling(
  id: number,
  patch: Partial<Pick<FilingInput, 'userName' | 'userAddress' | 'reason' | 'description' | 'inspector' | 'filedAt'>>,
): OpResult {
  const cases = loadCases()
  const item = cases.find((c) => c.id === id)
  const guard = requireOpen(item)
  if (!guard.ok || !item) {
    return guard
  }
  if (item.status !== '挂起' && item.status !== '立案') {
    return { ok: false, message: `已进入「${item.status}」阶段，立案材料冻结，不能倒回修改` }
  }

  if (patch.reason !== undefined) {
    const reason = patch.reason.trim()
    if (reason !== '' && !findReasonByName(reason)) {
      return { ok: false, message: '案由不在统一案由目录内，请按目录口径核定' }
    }
    item.reason = reason
    item.filingBasis = reason ? reasonBasis(reason) : ''
  }
  if (patch.userName !== undefined && patch.userName.trim()) {
    item.userName = patch.userName.trim()
  }
  if (patch.userAddress !== undefined && patch.userAddress.trim()) {
    item.userAddress = patch.userAddress.trim()
  }
  if (patch.description !== undefined) {
    item.description = patch.description.trim()
  }
  if (patch.inspector !== undefined && patch.inspector.trim()) {
    item.inspector = patch.inspector.trim()
  }
  if (patch.filedAt) {
    item.filedAt = patch.filedAt
  }
  item.dedupeKey = filingFingerprint(item)

  // 补正有效案由：挂起恢复为立案；把已有有效案由清空则重新挂起。
  if (item.suspended && item.reason) {
    item.suspended = false
    item.abnormal = false
    item.suspendReason = ''
    item.status = '立案'
    addLog(item, '挂起恢复', `案由补正为「${item.reason}」，恢复立案流程。`, item.inspector)
  } else if (!item.suspended && !item.reason) {
    item.suspended = true
    item.abnormal = true
    item.suspendReason = '案由缺失：未核定到统一案由目录，暂不允许推进，补正案由后恢复。'
    item.status = '挂起'
    addLog(item, '立案挂起', '案由被清空，按规定挂起。', item.inspector)
  }

  saveCases(cases)
  return { ok: true, message: item.suspended ? '已保存，案卷仍处于挂起' : '立案材料已保存' }
}

// ---------- 取证 ----------

export interface EvidenceInput {
  spot: string
  method: string
  content: string
  photoName: string
  photoTakenAt: string
  signer1: string
  signer2: string
}

/** 登记一条现场取证：两人必须都签字，且不得为同一人。 */
export function addEvidence(caseId: number, input: EvidenceInput): OpResult {
  const cases = loadCases()
  const item = cases.find((c) => c.id === caseId)
  const guard = requireOpen(item)
  if (!guard.ok || !item) {
    return guard
  }
  // 取证条目只能在「立案」阶段登记：取证一旦提交，材料冻结。
  if (item.status !== '立案') {
    return { ok: false, message: `已进入「${item.status}」阶段，取证材料已冻结，不能补登取证` }
  }
  const signer1 = input.signer1.trim()
  const signer2 = input.signer2.trim()
  if (!input.spot.trim() || !input.content.trim() || !input.photoName.trim()) {
    return { ok: false, message: '取证地点、取证情况、影像资料必须填写' }
  }
  if (!signer1 || !signer2) {
    return { ok: false, message: '现场取证必须两名稽查人员共同签字' }
  }
  if (signer1 === signer2) {
    return { ok: false, message: '两名签字人不得为同一人，现场取证须两人签字' }
  }

  const evidence: EvidenceItem = {
    id: nextId('evidenceSeq'),
    spot: input.spot.trim(),
    method: input.method.trim() || '现场取证',
    content: input.content.trim(),
    photoName: input.photoName.trim(),
    photoTakenAt: input.photoTakenAt,
    signer1,
    signer2,
    createdAt: nowStamp(),
  }
  item.evidences.push(evidence)
  addLog(item, '取证登记', `现场取证 1 份（${evidence.method}），签字人 ${signer1}、${signer2}。`, signer1)
  saveCases(cases)
  return { ok: true, message: '现场取证已入卷（双人签字齐备）' }
}

/** 完成取证提交：校验至少一份双人签字证据，状态从立案推进到取证。 */
export function submitEvidence(caseId: number, submittedAt = nowStamp()): OpResult {
  const cases = loadCases()
  const item = cases.find((c) => c.id === caseId)
  const guard = requireOpen(item)
  if (!guard.ok || !item) {
    return guard
  }
  const stage = requireStage(item, '立案')
  if (!stage.ok) {
    return stage
  }
  if (item.evidences.length === 0) {
    return { ok: false, message: '现场取证材料为空，至少登记一份双人签字证据后才能完成取证' }
  }
  const bad = item.evidences.some((e) => !e.signer1 || !e.signer2 || e.signer1 === e.signer2)
  if (bad) {
    return { ok: false, message: '存在签字不全或同一人签字的取证材料，不得提交' }
  }
  if (isFailDrillOn()) {
    return failSubmit(caseId, '取证', { submittedAt }, '提交失败（演练）：取证材料未送达，已暂存，从取证这一步继续提交')
  }

  item.status = '取证'
  item.evidenceSubmittedAt = submittedAt
  addLog(item, '取证完成', `现场取证 ${item.evidences.length} 份，均双人签字。`)
  saveCases(cases)
  clearDraft(caseId, '取证')
  return { ok: true, message: '取证完成，案卷进入告知阶段' }
}

// ---------- 告知 ----------

export interface NoticeInput {
  docNo: string
  method: string
  content: string
  notifier: string
  notifiedAt: string
}

/** 告知提交：立案、取证两步齐备才允许办理，推进到告知。 */
export function submitNotice(caseId: number, input: NoticeInput): OpResult {
  const cases = loadCases()
  const item = cases.find((c) => c.id === caseId)
  const guard = requireOpen(item)
  if (!guard.ok || !item) {
    return guard
  }
  const stage = requireStage(item, '取证')
  if (!stage.ok) {
    return stage
  }
  const notice: NoticeInfo = {
    docNo: input.docNo.trim(),
    method: input.method.trim(),
    content: input.content.trim(),
    notifier: input.notifier.trim(),
    notifiedAt: input.notifiedAt,
  }
  if (!notice.docNo || !notice.method || !notice.content || !notice.notifier || !notice.notifiedAt) {
    return { ok: false, message: '告知书编号、方式、拟处理意见、告知人、告知日期必须齐全' }
  }
  if (isFailDrillOn()) {
    return failSubmit(caseId, '告知', notice, '提交失败（演练）：告知材料未送达，已暂存，从告知这一步继续提交')
  }

  item.notice = notice
  item.noticeSubmittedAt = nowStamp()
  item.status = '告知'
  addLog(item, '告知完成', `${notice.method}告知书 ${notice.docNo}，告知人 ${notice.notifier}。`, notice.notifier)
  saveCases(cases)
  clearDraft(caseId, '告知')
  return { ok: true, message: '告知完成，案卷进入决定阶段' }
}

// ---------- 决定 ----------

export interface DecisionInput {
  docNo: string
  result: string
  recoveryAmount: number
  penalty: number
  meterRecords: Omit<MeterRecord, 'id'>[]
  decisionMaker: string
  decidedAt: string
}

function validateMeter(records: MeterRecord[]): string {
  if (records.length === 0) {
    return '决定追补热费必须附计量记录'
  }
  for (const r of records) {
    if (!r.meterNo.trim() || !r.period.trim() || !r.source.trim()) {
      return '计量记录的表号、计费周期、记录来源必须齐全'
    }
    if (!(r.heatAmount > 0) || !(r.amount > 0)) {
      return '计量记录的追补热量与折算金额必须大于 0'
    }
    if (r.lastReading < r.baseReading) {
      return `表 ${r.meterNo} 的抄见读数小于周期底数，请核对计量记录`
    }
  }
  return ''
}

/** 作出处理决定：必须走完立案、取证、告知；含追补必须附合格计量记录；办结即封卷并生成热费待办。 */
export function submitDecision(caseId: number, input: DecisionInput): OpResult {
  const cases = loadCases()
  const item = cases.find((c) => c.id === caseId)
  const guard = requireOpen(item)
  if (!guard.ok || !item) {
    return guard
  }
  const stage = requireStage(item, '告知')
  if (!stage.ok) {
    return stage
  }
  const recovery = Number(input.recoveryAmount) || 0
  const penalty = Number(input.penalty) || 0
  if (!input.docNo.trim() || !input.result.trim() || !input.decisionMaker.trim() || !input.decidedAt) {
    return { ok: false, message: '决定书编号、处理结果、作出人、决定日期必须齐全' }
  }
  if (recovery < 0 || penalty < 0) {
    return { ok: false, message: '追补金额与罚款金额不能为负' }
  }

  const records: MeterRecord[] = input.meterRecords.map((r) => ({
    id: nextId('meterSeq'),
    meterNo: String(r.meterNo ?? '').trim(),
    period: String(r.period ?? '').trim(),
    baseReading: Number(r.baseReading) || 0,
    lastReading: Number(r.lastReading) || 0,
    heatAmount: Number(r.heatAmount) || 0,
    amount: Number(r.amount) || 0,
    source: String(r.source ?? '').trim(),
    recordedAt: r.recordedAt || today(),
  }))

  if (recovery > 0) {
    const meterError = validateMeter(records)
    if (meterError) {
      return { ok: false, message: meterError }
    }
  }

  const draftPayload = { ...input, meterRecords: records }
  if (isFailDrillOn()) {
    return failSubmit(caseId, '决定', draftPayload, '提交失败（演练）：处理决定未送达，已暂存，从决定这一步继续提交')
  }

  const decision: DecisionInfo = {
    docNo: input.docNo.trim(),
    result: input.result.trim(),
    recoveryAmount: recovery,
    penalty,
    meterRecords: recovery > 0 ? records : [],
    decisionMaker: input.decisionMaker.trim(),
    decidedAt: input.decidedAt,
  }

  item.decision = decision
  item.decisionAt = nowStamp()
  item.status = '决定'
  item.closed = true
  item.pending = false
  addLog(
    item,
    '作出决定',
    recovery > 0
      ? `决定书 ${decision.docNo}：追补 ${recovery} 元（附计量记录 ${records.length} 份）、罚款 ${penalty} 元，案卷办结封卷。`
      : `决定书 ${decision.docNo}：罚款 ${penalty} 元，无热费追补，案卷办结封卷。`,
    decision.decisionMaker,
  )
  saveCases(cases)
  clearDraft(caseId, '决定')

  if (recovery > 0) {
    createBillingTodo(item, decision)
  }
  return { ok: true, message: '处理决定已作出，案卷办结封卷' + (recovery > 0 ? '；追补热费已落到热费结算待办' : '') }
}

// ---------- 勘察记录：案由与案卷并轨到统一目录 ----------

export function listSurveys(): SurveyRecord[] {
  return loadSurveys()
}

export function getSurvey(id: number): SurveyRecord | undefined {
  return loadSurveys().find((s) => s.id === id)
}

export interface SurveyInput {
  userName: string
  userAddress: string
  rawReason: string
  method: string
  findings: string
  surveyor: string
  surveyedAt: string
}

export function createSurvey(input: SurveyInput): OpResult<{ surveyId: number }> {
  if (!input.userName.trim() || !input.userAddress.trim()) {
    return { ok: false, message: '当事人与用热地址必须填写' }
  }
  if (!input.surveyor.trim() || !input.surveyedAt) {
    return { ok: false, message: '勘察人与勘察日期必须填写' }
  }
  const rows = loadSurveys()
  const seq = nextId('surveySeq')
  const row: SurveyRecord = {
    id: seq,
    surveyNo: `KC-${input.surveyedAt.split('-').join('')}-${String(rows.length + 1).padStart(2, '0')}`,
    userName: input.userName.trim(),
    userAddress: input.userAddress.trim(),
    rawReason: input.rawReason.trim(),
    reasonCode: '',
    method: input.method.trim() || '现场勘察',
    findings: input.findings.trim(),
    surveyor: input.surveyor.trim(),
    surveyedAt: input.surveyedAt,
    convertedCaseId: 0,
  }
  rows.push(row)
  saveSurveys(rows)
  return { ok: true, message: `勘察记录 ${row.surveyNo} 已登记，案由待核定`, data: { surveyId: row.id } }
}

/** 核定案由：把现场原始案由对回统一目录；对不上不允许核定通过。 */
export function adjudgeSurvey(surveyId: number): OpResult {
  const rows = loadSurveys()
  const row = rows.find((s) => s.id === surveyId)
  if (!row) {
    return { ok: false, message: '没有找到这条勘察记录' }
  }
  const matched = adjudgeReason(row.rawReason)
  if (!matched) {
    return { ok: false, message: `原始案由「${row.rawReason}」对不上统一案由目录，需补写明确情况后再核定` }
  }
  row.reasonCode = matched.code
  saveSurveys(rows)
  return { ok: true, message: `已核定为「${matched.name}」（${matched.code}）` }
}

/** 勘察转立案：未核定案由的先挂起；同一当事人+地址+案由不重复建档。 */
export function convertSurveyToCase(surveyId: number, inspector = '稽查队'): OpResult<{ caseId: number; duplicated: boolean }> {
  const surveys = loadSurveys()
  const row = surveys.find((s) => s.id === surveyId)
  if (!row) {
    return { ok: false, message: '没有找到这条勘察记录' }
  }
  if (row.convertedCaseId) {
    return { ok: false, message: `该勘察记录已转立案（案件 id ${row.convertedCaseId}）` }
  }

  const entry = REASON_CATALOG.find((c) => c.code === row.reasonCode)
  const result = fileCase({
    userName: row.userName,
    userAddress: row.userAddress,
    reason: entry?.name ?? '',
    description: `由勘察记录 ${row.surveyNo} 转入：${row.findings}`,
    inspector: inspector || row.surveyor,
    filedAt: today(),
    reasonSource: '勘察转入',
  })
  if (!result.ok || !result.data) {
    return { ok: false, message: result.message }
  }
  if (!result.data.duplicated) {
    row.convertedCaseId = result.data.caseId
    saveSurveys(surveys)
  }
  return {
    ok: true,
    message: result.data.duplicated
      ? result.message
      : entry
        ? `${result.message}（案由：${entry.name}）`
        : `${result.message}，请在案卷中补正案由`,
    data: result.data,
  }
}

// ---------- 办结 → 热费结算待办 ----------

export function listTodos(): BillingTodo[] {
  return loadTodos().sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1))
}

function createBillingTodo(item: AuditCase, decision: DecisionInfo): void {
  const todos = loadTodos()
  if (todos.some((t) => t.caseId === item.id)) {
    return // 同一案件只落一条
  }
  const summary = decision.meterRecords
    .map((r) => `表 ${r.meterNo} ${r.period} 追补${r.heatAmount}GJ/${r.amount}元`)
    .join('；')
  todos.push({
    id: nextId('todoSeq'),
    caseId: item.id,
    caseNo: item.caseNo,
    userName: item.userName,
    userAddress: item.userAddress,
    docNo: decision.docNo,
    recoveryAmount: decision.recoveryAmount,
    meterSummary: summary,
    decidedAt: decision.decidedAt,
    pushed: false,
    refNo: '',
  })
  saveTodos(todos)
}

/** 把追补待办转成热费结算单（写入既有热费结算台账，状态待核算）。 */
export function pushTodoToBilling(todoId: number): OpResult {
  const todos = loadTodos()
  const todo = todos.find((t) => t.id === todoId)
  if (!todo) {
    return { ok: false, message: '没有找到这条待办' }
  }
  if (todo.pushed) {
    return { ok: false, message: `已转入热费结算单 ${todo.refNo}，不得重复转入` }
  }

  const rows = listRows('heatbilling')
  const meta = loadMeta()
  meta.billingSeq += 1
  saveMeta(meta)
  const seq = meta.billingSeq
  const refNo = `JS-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
  const nextRowId = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1
  const row: EntryRow = {
    id: nextRowId,
    status: '待核算',
    pending: true,
    abnormal: false,
    结算编号: refNo,
    用户名称: todo.userName,
    用热面积: '稽查追补核定',
    热价标准: '追补热费（稽查决定）',
    应缴金额: todo.recoveryAmount,
    缴费日期: '',
    收费员: '稽查队移交',
    结算状态: '待核算',
    案件编号: todo.caseNo,
    计量记录摘要: todo.meterSummary,
  }
  saveRows('heatbilling', [...rows, row])

  todo.pushed = true
  todo.refNo = refNo
  saveTodos(todos)
  return { ok: true, message: `已转入热费结算单 ${refNo}（待核算）` }
}

// ---------- 看板指标 ----------

export function auditStats() {
  const cases = loadCases()
  return {
    total: cases.length,
    suspended: cases.filter((c) => c.suspended).length,
    open: cases.filter((c) => !c.closed && !c.suspended).length,
    closed: cases.filter((c) => c.closed).length,
    drafts: loadDrafts().length,
    todoPending: loadTodos().filter((t) => !t.pushed).length,
  }
}

export function stageIndex(stage: CaseStage): number {
  return CASE_STAGES.indexOf(stage)
}

/** 步骤条：每个阶段是 done / active / locked 哪种。 */
export function stageState(item: AuditCase, stage: CaseStage): 'done' | 'active' | 'locked' {
  if (item.status === '挂起') {
    return stage === '立案' ? 'active' : 'locked'
  }
  const cur = CASE_STAGES.indexOf(item.status)
  const idx = CASE_STAGES.indexOf(stage)
  if (idx < cur || item.closed) {
    return 'done'
  }
  if (idx === cur) {
    return 'active'
  }
  return 'locked'
}
