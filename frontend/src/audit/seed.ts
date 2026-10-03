import type { AuditCase, CaseLog, BillingTodo, SurveyRecord } from './types'

// 示例案卷：首次打开时播种，之后浏览器里的改动优先。
// 覆盖封卷、在途、挂起三种形态，案由全部取自统一案由目录。

const log = (at: string, action: string, detail: string, operator = '稽查队'): CaseLog => ({
  at,
  action,
  detail,
  operator,
})

function buildSeedCases(): AuditCase[] {
  const case1: AuditCase = {
    id: 1,
    caseNo: '稽立字〔2026〕第007号',
    userName: '金城便民超市',
    userAddress: '和平里片区 12 号楼底商 103',
    reason: '擅自改装损坏热计量表',
    reasonSource: '立案登记',
    filingBasis: '《供热计量与收费管理规程》违规用热处置口径第5项：改装、损坏、干扰计量表',
    description: '稽查发现该户热量表机芯被加装反向装置，表具读数明显低于同期，涉嫌改表窃热。',
    inspector: '赵维',
    filedAt: '2026-09-12',
    dedupeKey: '金城便民超市|和平里片区 12 号楼底商 103|擅自改装损坏热计量表',
    status: '决定',
    pending: false,
    abnormal: false,
    suspended: false,
    suspendReason: '',
    evidences: [
      {
        id: 1,
        spot: '和平里 12 号楼底商 103 表井',
        method: '拍照 + 现场笔录',
        content: '热量表机芯处有加装反向齿轮痕迹，封铅破损，现场拍照 6 张并制作笔录。',
        photoName: 'IMG_20260912_改表006.jpg',
        photoTakenAt: '2026-09-12 10:20',
        signer1: '赵维',
        signer2: '钱立',
        createdAt: '2026-09-12 10:35',
      },
    ],
    evidenceSubmittedAt: '2026-09-12 16:00',
    notice: {
      docNo: '稽告字〔2026〕第011号',
      method: '直接送达',
      content: '拟认定擅改计量表，追补热费并处罚款，当事人可在三日内陈述申辩。',
      notifier: '孙明',
      notifiedAt: '2026-09-15',
    },
    noticeSubmittedAt: '2026-09-15 11:00',
    decision: {
      docNo: '稽处决字〔2026〕第006号',
      result: '责令改正，追补违规用热期间热费，并处罚款；热费追补转热费结算待办。',
      recoveryAmount: 3860,
      penalty: 2000,
      meterRecords: [
        {
          id: 1,
          meterNo: 'RL-220715',
          period: '2025-11 至 2026-03',
          baseReading: 182.4,
          lastReading: 191.1,
          heatAmount: 32.17,
          amount: 3860,
          source: '热计量抄表台账 + 表具检定记录',
          recordedAt: '2026-09-18',
        },
      ],
      decisionMaker: '稽查队负责人 周正',
      decidedAt: '2026-09-20',
    },
    decisionAt: '2026-09-20 15:30',
    closed: true,
    logs: [
      log('2026-09-12 09:10', '立案', '核查举报线索后立案，主办赵维。'),
      log('2026-09-12 16:00', '取证完成', '现场取证 1 份，双人签字齐备（赵维、钱立）。'),
      log('2026-09-15 11:00', '告知完成', '直接送达告知书，当事人签收。'),
      log('2026-09-20 15:30', '作出决定', '追补 3860 元、罚款 2000 元，附计量记录 1 份，案卷办结封卷。'),
    ],
    createdAt: '2026-09-12 09:10',
    updatedAt: '2026-09-20 15:30',
  }

  const case2: AuditCase = {
    id: 2,
    caseNo: '稽立字〔2026〕第012号',
    userName: '顺达洗车行',
    userAddress: '建设大街 47 号临街门面',
    reason: '擅自在供热设施上私接管道',
    reasonSource: '勘察转入',
    filingBasis: '《供热计量与收费管理规程》违规用热处置口径第3项：私接供热管道增加用热面积',
    description: '二次网巡线发现该户从门前阀门井私接 DN20 管道引入暖风机，未装计量装置。',
    inspector: '钱立',
    filedAt: '2026-09-28',
    dedupeKey: '顺达洗车行|建设大街 47 号临街门面|擅自在供热设施上私接管道',
    status: '取证',
    pending: true,
    abnormal: false,
    suspended: false,
    suspendReason: '',
    evidences: [
      {
        id: 2,
        spot: '建设大街 47 号门前阀门井 JS-047',
        method: '拍照 + 录像',
        content: '阀门井内引出 DN20 私接管道直通店内暖风机，录像 1 段、照片 9 张。',
        photoName: 'VID_20260928_私接001.mp4',
        photoTakenAt: '2026-09-28 14:05',
        signer1: '钱立',
        signer2: '赵维',
        createdAt: '2026-09-28 14:40',
      },
    ],
    evidenceSubmittedAt: '',
    notice: null,
    noticeSubmittedAt: '',
    decision: null,
    decisionAt: '',
    closed: false,
    logs: [
      log('2026-09-27 10:00', '勘察登记', '巡线发现疑似私接，勘察编号 KC-20260927-02。'),
      log('2026-09-28 08:50', '立案', '勘察核定后转立案，主办钱立。'),
      log('2026-09-28 14:40', '取证登记', '已登记现场取证 1 份，待完成取证提交。'),
    ],
    createdAt: '2026-09-28 08:50',
    updatedAt: '2026-09-28 14:40',
  }

  const case3: AuditCase = {
    id: 3,
    caseNo: '稽立字〔2026〕第013号',
    userName: '待核实住户',
    userAddress: '滨河小区 3 号楼 2 单元 501',
    reason: '',
    reasonSource: '立案登记',
    filingBasis: '',
    description: '举报该户存在违规用热，现场情况尚在核实，立案时案由未能在统一目录中核定。',
    inspector: '孙明',
    filedAt: '2026-10-01',
    dedupeKey: '待核实住户|滨河小区 3 号楼 2 单元 501|',
    status: '挂起',
    pending: true,
    abnormal: true,
    suspended: true,
    suspendReason: '案由缺失：未核定到统一案由目录，暂不允许推进，补正案由后恢复。',
    evidences: [],
    evidenceSubmittedAt: '',
    notice: null,
    noticeSubmittedAt: '',
    decision: null,
    decisionAt: '',
    closed: false,
    logs: [
      log('2026-10-01 16:20', '立案挂起', '案由缺失，按规定挂起，待核定后补正。'),
    ],
    createdAt: '2026-10-01 16:20',
    updatedAt: '2026-10-01 16:20',
  }

  return [case1, case2, case3]
}

export function buildSeed(): AuditCase[] {
  return buildSeedCases()
}

export const SEED_TODOS: BillingTodo[] = [
  {
    id: 1,
    caseId: 1,
    caseNo: '稽立字〔2026〕第007号',
    userName: '金城便民超市',
    userAddress: '和平里片区 12 号楼底商 103',
    docNo: '稽处决字〔2026〕第006号',
    recoveryAmount: 3860,
    meterSummary: '计量表 RL-220715，追补热量 32.17GJ（2025-11 至 2026-03）',
    decidedAt: '2026-09-20',
    pushed: false,
    refNo: '',
  },
]

// 勘察记录：案由一列同样引用统一目录，未核定的先挂着。
export const SEED_SURVEYS: SurveyRecord[] = [
  {
    id: 1,
    surveyNo: 'KC-20260927-02',
    userName: '顺达洗车行',
    userAddress: '建设大街 47 号临街门面',
    rawReason: '私接管子偷接暖气',
    reasonCode: 'WJ-03',
    method: '现场勘察 + 拍照',
    findings: '阀门井私接 DN20 管道引入店内暖风机，无计量装置。',
    surveyor: '钱立',
    surveyedAt: '2026-09-27',
    convertedCaseId: 2,
  },
  {
    id: 2,
    surveyNo: 'KC-20261002-01',
    userName: '惠民家常菜馆',
    userAddress: '兴隆路 88 号',
    rawReason: '感觉是偷热，具体说不清',
    reasonCode: '',
    method: '现场勘察',
    findings: '店内温度偏高，疑似有旁通管路，需二次勘察确认。',
    surveyor: '赵维',
    surveyedAt: '2026-10-02',
    convertedCaseId: 0,
  },
  {
    id: 3,
    surveyNo: 'KC-20261002-02',
    userName: '刘师傅修配店',
    userAddress: '工业北道 6 号院外',
    rawReason: '改表',
    reasonCode: '',
    method: '现场勘察 + 抄表比对',
    findings: '表具封铅完好但读数停滞，待检定确认是否改装。',
    surveyor: '孙明',
    surveyedAt: '2026-10-02',
    convertedCaseId: 0,
  },
]
