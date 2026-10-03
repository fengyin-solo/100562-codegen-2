/* 用热稽查台账业务规矩的端到端验证：node scripts/verify-audit.mjs
 * 通过 esbuild 把 TS 服务层打包后在 node 里跑，localStorage 用内存垫片。 */
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync, rmSync } from 'node:fs'

const ENTRY = '/tmp/audit-verify-entry.ts'
writeFileSync(
  ENTRY,
  `
export * from '/workspace/frontend/src/audit/audit-service'
export { setFailDrill } from '/workspace/frontend/src/audit/store'
`,
)

const mem = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  },
}

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@': '/workspace/frontend/src' },
})
const OUT = '/tmp/audit-verify-bundle.mjs'
writeFileSync(OUT, result.outputFiles[0].text)
const svc = await import(pathToFileURL(OUT).href)

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fail += 1
    console.error(`  ✗ ${name} ${extra}`)
  }
}

const today = '2026-10-03'
const baseFiling = (over = {}) => ({
  userName: '测试餐馆',
  userAddress: '测试路 1 号',
  reason: '擅自在供热设施上私接管道',
  description: '私接暖风机',
  inspector: '赵维',
  filedAt: today,
  reasonSource: '立案登记',
  ...over,
})

// 1. 正常立案 + 重复立案只落一条
console.log('1) 立案与去重')
const r1 = svc.fileCase(baseFiling())
check('首次立案成功', r1.ok && !r1.data.duplicated, r1.message)
const id = r1.data.caseId
const r1b = svc.fileCase(baseFiling())
check('相同材料重复提交只落一条', r1b.ok && r1b.data.duplicated && r1b.data.caseId === id, r1b.message)
check('案件总数未增加', svc.listCases().length === 4, `实际 ${svc.listCases().length}`)

// 2. 案由缺失先挂起，挂起不许推进
console.log('2) 案由缺失挂起')
const r2 = svc.fileCase(baseFiling({ userName: '悬而未决户', userAddress: '悬案巷 2 号', reason: '' }))
const suspendId = r2.data.caseId
const suspended = svc.getCase(suspendId)
check('案由空 -> 挂起', suspended.status === '挂起' && suspended.suspended, suspended.status)
const ev = svc.submitEvidence(suspendId)
check('挂起案卷不能取证', !ev.ok && ev.message.includes('挂起'))
// 补正案由恢复
const fix = svc.updateFiling(suspendId, { reason: '绕过热计量装置用热' })
check('补正案由后恢复立案', fix.ok && svc.getCase(suspendId).status === '立案', fix.message)
// 非目录案由不予受理
const badReason = svc.fileCase(baseFiling({ userName: '乱填户', userAddress: '乱巷 3 号', reason: '随便写的案由' }))
check('目录外案由立案被拒', !badReason.ok, badReason.message)

// 3. 取证两人签字
console.log('3) 现场取证双人签字')
const evInput = (over = {}) => ({
  spot: '表井', method: '拍照', content: '私接管道', photoName: 'IMG_1.jpg',
  photoTakenAt: '2026-10-03 09:00', signer1: '赵维', signer2: '钱立', ...over,
})
const e1 = svc.addEvidence(id, evInput())
check('双人不同签字可登记', e1.ok, e1.message)
const e2 = svc.addEvidence(id, evInput({ signer2: '赵维' }))
check('同一人签字被拒', !e2.ok && e2.message.includes('同一人'), e2.message)
const e3 = svc.addEvidence(id, evInput({ signer2: '' }))
check('缺第二签字被拒', !e3.ok && e3.message.includes('两名'), e3.message)
// 新案：无证据不许完成取证
const r3 = svc.fileCase(baseFiling({ userName: '无证据户', userAddress: '无证巷 4 号' }))
const noEvId = r3.data.caseId
const se0 = svc.submitEvidence(noEvId)
check('无证据不能完成取证', !se0.ok, se0.message)

// 4. 不可跳级：立案态直接告知/决定
console.log('4) 阶段不可跳级')
const jumpNotice = svc.submitNotice(id, { docNo: 'X', method: '直接送达', content: 'x', notifier: '孙明', notifiedAt: today })
check('立案态不能直接告知', !jumpNotice.ok && jumpNotice.message.includes('不能跳'), jumpNotice.message)
const jumpDecision = svc.submitDecision(id, {
  docNo: 'X', result: 'x', recoveryAmount: 0, penalty: 0, meterRecords: [], decisionMaker: '周正', decidedAt: today,
})
check('立案态不能直接决定', !jumpDecision.ok, jumpDecision.message)

// 5. 正常走到取证 -> 告知
console.log('5) 取证、告知顺阶段推进')
const se = svc.submitEvidence(id)
check('取证提交进入取证阶段', se.ok && svc.getCase(id).status === '取证', se.message)
// 取证后立案材料冻结、证据不能补登
const freezeFiling = svc.updateFiling(id, { description: '想改案情' })
check('取证后立案材料冻结', !freezeFiling.ok && freezeFiling.message.includes('冻结'), freezeFiling.message)
const freezeEv = svc.addEvidence(id, evInput())
check('取证后不能补登证据', !freezeEv.ok && freezeEv.message.includes('冻结'), freezeEv.message)
const noticeIn = { docNo: '稽告字-测01', method: '直接送达', content: '拟追补并罚款', notifier: '孙明', notifiedAt: today }
const sn = svc.submitNotice(id, noticeIn)
check('告知提交进入告知阶段', sn.ok && svc.getCase(id).status === '告知', sn.message)

// 6. 决定追补必须附计量记录
console.log('6) 追补附计量记录')
const decNoMeter = svc.submitDecision(id, {
  docNo: '稽处决-测01', result: '追补', recoveryAmount: 1000, penalty: 0, meterRecords: [],
  decisionMaker: '周正', decidedAt: today,
})
check('追补无计量记录被拒', !decNoMeter.ok && decNoMeter.message.includes('计量记录'), decNoMeter.message)
const decBadMeter = svc.submitDecision(id, {
  docNo: '稽处决-测01', result: '追补', recoveryAmount: 1000, penalty: 0,
  meterRecords: [{ meterNo: 'B1', period: '2025-11', baseReading: 100, lastReading: 90, heatAmount: 0, amount: 0, source: '', recordedAt: today }],
  decisionMaker: '周正', decidedAt: today,
})
check('计量记录不合格被拒（读数倒挂/金额为0/来源空）', !decBadMeter.ok, decBadMeter.message)
const meterOk = { meterNo: 'B1', period: '2025-11 至 2026-03', baseReading: 100, lastReading: 130, heatAmount: 8.3, amount: 1000, source: '抄表台账', recordedAt: today }
const decOk = svc.submitDecision(id, {
  docNo: '稽处决-测01', result: '责令改正、追补并罚款', recoveryAmount: 1000, penalty: 500,
  meterRecords: [meterOk], decisionMaker: '周正', decidedAt: today,
})
check('合格计量记录 -> 决定办结', decOk.ok && svc.getCase(id).status === '决定' && svc.getCase(id).closed, decOk.message)

// 7. 封卷后不可倒回
console.log('7) 封卷只读')
const closed = svc.getCase(id)
check('封卷后改立案被拒', !svc.updateFiling(id, { description: '翻案' }).ok)
check('封卷后补证据被拒', !svc.addEvidence(id, evInput()).ok)
check('封卷后再告知被拒', !svc.submitNotice(id, noticeIn).ok)
check('封卷后再决定被拒', !svc.submitDecision(id, { docNo: '再', result: '再', recoveryAmount: 0, penalty: 0, meterRecords: [], decisionMaker: '周正', decidedAt: today }).ok)

// 8. 办结落到热费结算待办
console.log('8) 热费结算待办')
const todos = svc.listTodos().filter((t) => t.caseId === id)
check('含追补决定生成 1 条待办', todos.length === 1 && todos[0].recoveryAmount === 1000 && !todos[0].pushed)
const push = svc.pushTodoToBilling(todos[0].id)
check('待办转热费结算单成功', push.ok, push.message)
check('重复转入被拒', !svc.pushTodoToBilling(todos[0].id).ok)

// 无追补决定不生成待办
const r4 = svc.fileCase(baseFiling({ userName: '只罚款户', userAddress: '单罚巷 5 号' }))
const id4 = r4.data.caseId
svc.addEvidence(id4, evInput())
svc.submitEvidence(id4)
svc.submitNotice(id4, noticeIn)
const d4 = svc.submitDecision(id4, { docNo: 'D4', result: '仅罚款警告', recoveryAmount: 0, penalty: 200, meterRecords: [], decisionMaker: '周正', decidedAt: today })
check('无追补决定可办结且不产生待办', d4.ok && !svc.listTodos().some((t) => t.caseId === id4), d4.message)

// 9. 提交失败 -> 草稿留在失败那一步 -> 关闭演练后续录成功
console.log('9) 断点续录')
svc.setFailDrill(true)
const r5 = svc.fileCase(baseFiling({ userName: '断连户', userAddress: '断网巷 6 号' }))
check('演练开启时立案提交失败', !r5.ok && r5.message.includes('暂存'), r5.message)
let drafts = svc.listDrafts()
check('立案失败留有立案草稿(caseId=0)', drafts.some((d) => d.caseId === 0 && d.stage === '立案'))
svc.setFailDrill(false)
const r5b = svc.fileCase(baseFiling({ userName: '断连户', userAddress: '断网巷 6 号' }))
check('关闭演练后从立案续录成功', r5b.ok && !r5b.data.duplicated, r5b.message)
check('成功后立案草稿清除', !svc.listDrafts().some((d) => d.caseId === 0))
const id5 = r5b.data.caseId
svc.addEvidence(id5, evInput())
svc.submitEvidence(id5)
svc.setFailDrill(true)
const failNotice = svc.submitNotice(id5, noticeIn)
check('告知提交失败', !failNotice.ok)
check('告知失败草稿停留在告知步', svc.listDrafts().some((d) => d.caseId === id5 && d.stage === '告知'))
svc.setFailDrill(false)
const retryNotice = svc.submitNotice(id5, noticeIn)
check('从告知步续录成功', retryNotice.ok && svc.getCase(id5).status === '告知', retryNotice.message)
check('告知草稿已清除', !svc.listDrafts().some((d) => d.caseId === id5))

// 10. 勘察记录：案由并轨 + 核定 + 转立案
console.log('10) 勘察核定与转立案')
// 10a. 未核定先转立案：案卷挂起，但仍只落一条
const s1 = svc.createSurvey({ userName: '未核转户', userAddress: '未核路 7 号', rawReason: '就是偷热', method: '现场勘察', findings: '疑似旁通', surveyor: '钱立', surveyedAt: today })
const sid = s1.data.surveyId
const convSuspended = svc.convertSurveyToCase(sid)
const suspCase = svc.listCases().find((c) => c.userName === '未核转户')
check('未核定转立案成功但案卷挂起', convSuspended.ok && suspCase && suspCase.suspended, convSuspended.message)
const convSuspended2 = svc.convertSurveyToCase(sid)
check('勘察记录重复转立案被拒', !convSuspended2.ok, convSuspended2.message)

// 10b. 对不上统一目录的案由核定不通过
const s2 = svc.createSurvey({ userName: '古怪户', userAddress: '古怪巷 8 号', rawReason: '情况不明待再看', method: '现场勘察', findings: '...', surveyor: '钱立', surveyedAt: today })
const adj2 = svc.adjudgeSurvey(s2.data.surveyId)
check('对不上目录的案由核定不通过', !adj2.ok && adj2.message.includes('对不上'), adj2.message)

// 10c. 口语案由核定回统一目录，核定后转立案带目录案由
const s3 = svc.createSurvey({ userName: '勘察户', userAddress: '勘察路 9 号', rawReason: '私接管子', method: '现场勘察', findings: '私接 DN20', surveyor: '钱立', surveyedAt: today })
const sid3 = s3.data.surveyId
const adj3 = svc.adjudgeSurvey(sid3)
check('口语案由核定回统一目录', adj3.ok && svc.getSurvey(sid3).reasonCode === 'WJ-03', adj3.message)
const conv3 = svc.convertSurveyToCase(sid3)
check('核定后转立案成功', conv3.ok && !conv3.data.duplicated, conv3.message)
const converted = svc.listCases().find((c) => c.userName === '勘察户')
check('转入案卷案由取自统一目录', converted && converted.reason === '擅自在供热设施上私接管道', converted?.reason)

console.log(`\n结果：${pass} 通过，${fail} 失败`)
rmSync(OUT, { force: true })
rmSync(ENTRY, { force: true })
process.exit(fail ? 1 : 0)
