/**
 * 用热稽查与违规用热处理台账的领域类型。
 * 一条案件单的生命周期固定为：立案 → 取证 → 告知 → 决定。
 * 只许顺阶段往前走，不得跳级；作出处理决定后封卷，不得倒回立案改材料。
 */

/** 流程阶段，顺序即流转顺序，下标用于状态机校验。 */
export type CaseStage = '立案' | '取证' | '告知' | '决定'

export const CASE_STAGES: CaseStage[] = ['立案', '取证', '告知', '决定']

/**
 * 案卷状态：
 * - 挂起：案由缺失、尚未在统一案由目录中核定，挂起期间不能推进；
 * - 立案/取证/告知：当前所在（已到达的最远）阶段；
 * - 决定：处理决定已作出，案卷办结封卷（closed=true）。
 */
export type CaseStatus = '挂起' | '立案' | '取证' | '告知' | '决定'

/** 现场取证条目：每条都必须两人签字，且不得为同一人。 */
export interface EvidenceItem {
  id: number
  spot: string // 取证地点
  method: string // 取证方式：拍照 / 录像 / 抄表记录 / 现场笔录
  content: string // 取证情况说明
  photoName: string // 现场取证照片（影像资料名称/编号）
  photoTakenAt: string // 拍摄时间
  signer1: string // 取证签字人一
  signer2: string // 取证签字人二
  createdAt: string
}

/** 计量记录：决定追补热费时必须随附，缺失不得作出含追补的决定。 */
export interface MeterRecord {
  id: number
  meterNo: string // 计量表号
  period: string // 计费周期
  baseReading: number // 周期表底数
  lastReading: number // 抄见读数
  heatAmount: number // 追补热量（GJ）
  amount: number // 折算追补金额（元）
  source: string // 记录来源（抄表台账 / 检定记录）
  recordedAt: string
}

/** 告知环节材料。 */
export interface NoticeInfo {
  docNo: string // 告知书编号
  method: string // 告知方式：直接送达 / 留置送达 / 公告送达
  content: string // 拟处理意见
  notifier: string // 告知人
  notifiedAt: string // 告知日期
}

/** 处理决定。 */
export interface DecisionInfo {
  docNo: string // 处理决定书编号
  result: string // 处理结果
  recoveryAmount: number // 追补热费金额（元），大于 0 时必须附计量记录
  penalty: number // 罚款金额（元）
  meterRecords: MeterRecord[] // 追补所附计量记录
  decisionMaker: string // 决定作出人
  decidedAt: string // 决定日期
}

/** 案卷流转日志，封卷后随卷保存。 */
export interface CaseLog {
  at: string
  action: string
  detail: string
  operator: string
}

/** 稽查案件单（案卷）。 */
export interface AuditCase {
  id: number
  caseNo: string // 案件编号
  userName: string // 当事人（用户）名称
  userAddress: string // 用热地址
  reason: string // 案由：必须取自统一案由目录；空串表示缺失
  reasonSource: string // 案由来源：立案登记 / 勘察转入
  filingBasis: string // 立案依据口径（取自案由目录）
  description: string // 案情摘要
  inspector: string // 主办稽查员
  filedAt: string // 立案日期
  dedupeKey: string // 立案材料指纹：相同指纹重复提交只落一条

  status: CaseStatus
  pending: boolean // 未办结为 true，沿用平台看板口径
  abnormal: boolean // 挂起为 true，沿用平台看板口径
  suspended: boolean // 是否挂起（案由缺失）
  suspendReason: string

  evidences: EvidenceItem[]
  evidenceSubmittedAt: string
  notice: NoticeInfo | null
  noticeSubmittedAt: string
  decision: DecisionInfo | null
  decisionAt: string
  closed: boolean // 出过决定即封卷

  logs: CaseLog[]
  createdAt: string
  updatedAt: string
}

/**
 * 勘察记录（现场勘察台账）。
 * 现场先记原始案由，再按既有立案口径核定到统一案由目录，核定后才能转立案。
 */
export interface SurveyRecord {
  id: number
  surveyNo: string // 勘察记录编号
  userName: string
  userAddress: string
  rawReason: string // 现场记录的原始案由（自由填写）
  reasonCode: string // 核定后的统一案由编码；空串表示尚未核定
  method: string // 勘察方式
  findings: string // 勘察情况
  surveyor: string // 勘察人
  surveyedAt: string // 勘察日期
  convertedCaseId: number // 已转立案的案件编号 id；0 表示未转
}

/**
 * 阶段草稿：提交失败（或演练中断）时，本步材料留在本地，
 * 之后从失败的那一步继续录入，不用从头再填。
 */
export interface StageDraft {
  id: number
  caseId: number // 0 表示尚未立案成功的立案草稿
  stage: CaseStage
  payload: string // 表单内容 JSON
  lastError: string // 最近一次提交失败原因
  updatedAt: string
}

/** 办结后落到热费结算的待办：含追补的决定生成一条。 */
export interface BillingTodo {
  id: number
  caseId: number
  caseNo: string
  userName: string
  userAddress: string
  docNo: string // 处理决定书编号
  recoveryAmount: number
  meterSummary: string // 计量记录摘要
  decidedAt: string
  pushed: boolean // 是否已转入热费结算单
  refNo: string // 转入后的热费结算单编号
}

/** 统一的操作返回。 */
export interface OpResult<T = undefined> {
  ok: boolean
  message: string
  data?: T
}

/** 立案表单输入。 */
export interface FilingInput {
  userName: string
  userAddress: string
  reason: string // 统一案由名称；空串表示案由暂不明确
  description: string
  inspector: string
  filedAt: string
  reasonSource: string
}
