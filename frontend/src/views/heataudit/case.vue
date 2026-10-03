<template>
  <section class="page case-page" v-if="item">
    <header class="page-head">
      <div>
        <h2>{{ item.caseNo }} <span class="case-title-sub">{{ item.userName }}</span></h2>
        <p class="page-desc">{{ item.userAddress }} · 主办 {{ item.inspector }} · 立案 {{ item.filedAt }}</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn ghost" :to="{ name: 'heataudit' }">返回案卷列表</RouterLink>
      </div>
    </header>

    <!-- 状态机步骤条 -->
    <ol class="stage-track">
      <li
        v-for="(stage, idx) in stages"
        :key="stage"
        class="stage-node"
        :class="trackClass(stage)"
      >
        <span class="stage-dot">{{ idx + 1 }}</span>
        <span class="stage-name">{{ stage }}</span>
        <span v-if="idx < stages.length - 1" class="stage-arrow">→</span>
      </li>
    </ol>

    <div v-if="dupQuery" class="form-banner info">相同立案材料此前已登记，本条即既有案卷，未重复建档。</div>
    <div v-if="item.suspended" class="form-banner warn">
      <strong>案卷挂起：</strong>{{ item.suspendReason }} 补正有效案由后自动恢复流转。
    </div>
    <div v-if="item.closed" class="form-banner done">
      处理决定已作出（{{ item.decision?.decidedAt }}），案卷办结封卷，以下内容只读，不得倒回修改。
    </div>
    <div v-if="activeError" class="form-banner error">
      {{ activeError }}
      <span v-if="failureAtStep" class="banner-sub">本步材料已暂存，直接再点提交即可从这一步继续。</span>
    </div>

    <div class="panels">
      <!-- 一、立案 -->
      <section class="stage-panel" :class="{ locked: !canEditFiling }">
        <h3>一、立案 {{ panelTag('立案') }}</h3>
        <div v-if="!canEditFiling" class="readonly-grid">
          <p><label>案由</label>{{ item.reason || '—' }}</p>
          <p><label>立案依据</label>{{ item.filingBasis || '—' }}</p>
          <p><label>案由来源</label>{{ item.reasonSource }}</p>
          <p class="wide"><label>案情摘要</label>{{ item.description || '—' }}</p>
        </div>
        <form v-else class="entry-form" @submit.prevent="saveFiling">
          <label class="form-item">
            <span>当事人 *</span>
            <input v-model="filing.userName" />
          </label>
          <label class="form-item">
            <span>用热地址 *</span>
            <input v-model="filing.userAddress" />
          </label>
          <label class="form-item">
            <span>案由（统一目录）</span>
            <select v-model="filing.reason">
              <option value="">案由缺失 —— 继续挂起</option>
              <option v-for="r in reasons" :key="r.code" :value="r.name">【{{ r.category }}】{{ r.name }}</option>
            </select>
            <small v-if="filing.reason" class="basis-hint">立案依据：{{ reasonBasis(filing.reason) }}</small>
          </label>
          <label class="form-item">
            <span>主办稽查员 *</span>
            <input v-model="filing.inspector" />
          </label>
          <label class="form-item">
            <span>立案日期 *</span>
            <input v-model="filing.filedAt" type="date" />
          </label>
          <label class="form-item wide">
            <span>案情摘要</span>
            <textarea v-model="filing.description" rows="2"></textarea>
          </label>
          <div class="form-foot">
            <button class="btn primary" type="submit">保存立案材料</button>
            <span class="hint-text">{{ item.suspended ? '补正有效案由后自动恢复' : '保存后进入现场取证' }}</span>
          </div>
        </form>
      </section>

      <!-- 二、取证 -->
      <section class="stage-panel" :class="{ locked: trackClass('取证') === 'locked', readonly: trackClass('取证') === 'done' }">
        <h3>二、现场取证 {{ panelTag('取证') }}</h3>

        <!-- 已登记的证据列表 -->
        <table class="sub-table">
          <thead>
            <tr><th>地点</th><th>方式</th><th>影像资料</th><th>拍摄时间</th><th>签字一</th><th>签字二</th><th>情况说明</th></tr>
          </thead>
          <tbody>
            <tr v-for="e in item.evidences" :key="e.id">
              <td>{{ e.spot }}</td><td>{{ e.method }}</td><td>{{ e.photoName }}</td>
              <td>{{ e.photoTakenAt }}</td>
              <td class="sign-cell">✎ {{ e.signer1 }}</td>
              <td class="sign-cell">✎ {{ e.signer2 }}</td>
              <td>{{ e.content }}</td>
            </tr>
            <tr v-if="!item.evidences.length"><td colspan="7" class="empty-state">尚无取证材料</td></tr>
          </tbody>
        </table>

        <form v-if="canEditEvidence" class="entry-form" @submit.prevent="addEvidenceRow">
          <p class="sub-title">新增现场取证（两人签字，不得同一人）</p>
          <label class="form-item">
            <span>取证地点 *</span>
            <input v-model="evidence.spot" placeholder="如：XX 阀门井 / 表井" />
          </label>
          <label class="form-item">
            <span>取证方式 *</span>
            <select v-model="evidence.method">
              <option>拍照</option><option>录像</option><option>抄表记录</option><option>现场笔录</option>
              <option>拍照 + 现场笔录</option><option>拍照 + 录像</option>
            </select>
          </label>
          <label class="form-item">
            <span>影像资料编号/名称 *</span>
            <input v-model="evidence.photoName" placeholder="IMG_xxxx.jpg / VID_xxxx.mp4" />
          </label>
          <label class="form-item">
            <span>拍摄时间</span>
            <input v-model="evidence.photoTakenAt" placeholder="2026-10-03 09:30" />
          </label>
          <label class="form-item">
            <span>签字人一 *</span>
            <input v-model="evidence.signer1" :placeholder="`不得与签字人二相同`" />
          </label>
          <label class="form-item">
            <span>签字人二 *</span>
            <input v-model="evidence.signer2" placeholder="双人现场签字" />
          </label>
          <label class="form-item wide">
            <span>取证情况说明 *</span>
            <textarea v-model="evidence.content" rows="2"></textarea>
          </label>
          <div class="form-foot">
            <button class="btn" type="submit">登记取证（入卷）</button>
            <span class="hint-text">登记后仍在立案阶段，全部取证完成后点下方按钮提交</span>
          </div>
        </form>

        <div v-if="canSubmitEvidence" class="form-foot submit-bar">
          <button class="btn primary" type="button" @click="doSubmitEvidence">
            完成现场取证，提交进入告知
          </button>
          <span class="hint-text">已登记 {{ item.evidences.length }} 份证据，均须双人签字</span>
        </div>
      </section>

      <!-- 三、告知 -->
      <section class="stage-panel" :class="{ locked: trackClass('告知') === 'locked', readonly: trackClass('告知') === 'done' }">
        <h3>三、处理告知 {{ panelTag('告知') }}</h3>
        <div v-if="item.notice" class="readonly-grid">
          <p><label>告知书编号</label>{{ item.notice.docNo }}</p>
          <p><label>告知方式</label>{{ item.notice.method }}</p>
          <p><label>告知日期</label>{{ item.notice.notifiedAt }}</p>
          <p><label>告知人</label>{{ item.notice.notifier }}</p>
          <p class="wide"><label>拟处理意见</label>{{ item.notice.content }}</p>
        </div>
        <form v-else-if="canEditNotice" class="entry-form" @submit.prevent="submitNoticeRow">
          <label class="form-item"><span>告知书编号 *</span><input v-model="notice.docNo" /></label>
          <label class="form-item">
            <span>告知方式 *</span>
            <select v-model="notice.method">
              <option>直接送达</option><option>留置送达</option><option>公告送达</option>
            </select>
          </label>
          <label class="form-item"><span>告知人 *</span><input v-model="notice.notifier" /></label>
          <label class="form-item"><span>告知日期 *</span><input v-model="notice.notifiedAt" type="date" /></label>
          <label class="form-item wide">
            <span>拟处理意见 *</span>
            <textarea v-model="notice.content" rows="2" placeholder="认定事实、拟追补/处罚、陈述申辩权利"></textarea>
          </label>
          <div class="form-foot">
            <button class="btn" type="button" @click="stashNotice">暂存</button>
            <button class="btn primary" type="submit">提交告知，进入决定</button>
          </div>
        </form>
      </section>

      <!-- 四、决定 -->
      <section class="stage-panel" :class="{ locked: trackClass('决定') === 'locked', readonly: trackClass('决定') === 'done' }">
        <h3>四、处理决定 {{ panelTag('决定') }}</h3>
        <template v-if="item.decision">
          <div class="readonly-grid">
            <p><label>决定书编号</label>{{ item.decision.docNo }}</p>
            <p><label>决定日期</label>{{ item.decision.decidedAt }}</p>
            <p><label>作出人</label>{{ item.decision.decisionMaker }}</p>
            <p><label>追补热费</label>{{ item.decision.recoveryAmount }} 元</p>
            <p><label>罚款</label>{{ item.decision.penalty }} 元</p>
            <p class="wide"><label>处理结果</label>{{ item.decision.result }}</p>
          </div>
          <table class="sub-table">
            <thead>
              <tr><th>计量表号</th><th>计费周期</th><th>底数</th><th>抄见</th><th>追补热量(GJ)</th><th>折算金额(元)</th><th>来源</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in item.decision.meterRecords" :key="m.id">
                <td>{{ m.meterNo }}</td><td>{{ m.period }}</td><td>{{ m.baseReading }}</td>
                <td>{{ m.lastReading }}</td><td>{{ m.heatAmount }}</td><td>{{ m.amount }}</td><td>{{ m.source }}</td>
              </tr>
              <tr v-if="!item.decision.meterRecords.length"><td colspan="7" class="empty-state">无追补，未附计量记录</td></tr>
            </tbody>
          </table>
        </template>

        <form v-else-if="canEditDecision" class="entry-form" @submit.prevent="submitDecisionRow">
          <label class="form-item"><span>处理决定书编号 *</span><input v-model="decision.docNo" /></label>
          <label class="form-item"><span>决定日期 *</span><input v-model="decision.decidedAt" type="date" /></label>
          <label class="form-item"><span>决定作出人 *</span><input v-model="decision.decisionMaker" /></label>
          <label class="form-item">
            <span>追补热费（元）</span>
            <input v-model.number="decision.recoveryAmount" type="number" min="0" @input="stashDecision" />
          </label>
          <label class="form-item">
            <span>罚款（元）</span>
            <input v-model.number="decision.penalty" type="number" min="0" @input="stashDecision" />
          </label>
          <label class="form-item wide">
            <span>处理结果 *</span>
            <textarea v-model="decision.result" rows="2" @input="stashDecision"></textarea>
          </label>

          <div v-if="Number(decision.recoveryAmount) > 0" class="meter-block">
            <p class="sub-title">追补热费必须附计量记录（至少一条，数据须合格）</p>
            <table class="sub-table">
              <thead>
                <tr><th>计量表号 *</th><th>计费周期 *</th><th>周期底数</th><th>抄见读数</th><th>追补热量GJ *</th><th>折算金额元 *</th><th>记录来源 *</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in decision.meterRecords" :key="i">
                  <td><input v-model="m.meterNo" @input="stashDecision" /></td>
                  <td><input v-model="m.period" placeholder="2025-11 至 2026-03" @input="stashDecision" /></td>
                  <td><input v-model.number="m.baseReading" type="number" @input="stashDecision" /></td>
                  <td><input v-model.number="m.lastReading" type="number" @input="stashDecision" /></td>
                  <td><input v-model.number="m.heatAmount" type="number" min="0" step="0.01" @input="stashDecision" /></td>
                  <td><input v-model.number="m.amount" type="number" min="0" @input="stashDecision" /></td>
                  <td><input v-model="m.source" placeholder="抄表台账/检定记录" @input="stashDecision" /></td>
                  <td><button class="link" type="button" @click="removeMeter(i)">删除</button></td>
                </tr>
              </tbody>
            </table>
            <button class="btn" type="button" @click="addMeter">新增一条计量记录</button>
          </div>

          <div class="form-foot">
            <button class="btn" type="button" @click="stashDecision">暂存</button>
            <button class="btn primary" type="submit">作出处理决定并办结封卷</button>
            <span class="hint-text">提交后不可倒回；含追补将自动生成热费结算待办</span>
          </div>
        </form>
      </section>
    </div>

    <!-- 流转日志 -->
    <section class="log-panel">
      <h3>案卷流转日志</h3>
      <ol class="log-list">
        <li v-for="(l, i) in [...item.logs].reverse()" :key="i">
          <span class="log-at">{{ l.at }}</span>
          <strong>{{ l.action }}</strong>
          <span class="log-detail">{{ l.detail }}</span>
          <span class="log-op">— {{ l.operator }}</span>
        </li>
      </ol>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  addEvidence,
  getCase,
  getDraft,
  readDraftPayload,
  saveDraft,
  stageState,
  submitDecision,
  submitEvidence,
  submitNotice,
  updateFiling,
} from '@/audit/audit-service'
import type { AuditCase, CaseStage, MeterRecord } from '@/audit/types'
import { REASON_CATALOG, reasonBasis } from '@/audit/reasons'

const route = useRoute()
const reasons = REASON_CATALOG
const stages: CaseStage[] = ['立案', '取证', '告知', '决定']

const item = ref<AuditCase | undefined>(undefined)
const activeError = ref('')
const failureAtStep = ref(false)
const dupQuery = computed(() => route.query.dup === '1')

const filing = reactive({ userName: '', userAddress: '', reason: '', description: '', inspector: '', filedAt: '' })
const evidence = reactive({ spot: '', method: '拍照', content: '', photoName: '', photoTakenAt: '', signer1: '', signer2: '' })
const notice = reactive({ docNo: '', method: '直接送达', content: '', notifier: '', notifiedAt: '' })

interface MeterFormRow {
  meterNo: string
  period: string
  baseReading: number
  lastReading: number
  heatAmount: number
  amount: number
  source: string
  recordedAt: string
}

const decision = reactive({
  docNo: '',
  result: '',
  recoveryAmount: 0,
  penalty: 0,
  meterRecords: [] as MeterFormRow[],
  decisionMaker: '',
  decidedAt: '',
})

const caseId = computed(() => Number(route.params.id))

function reload() {
  item.value = getCase(caseId.value)
  if (item.value) {
    Object.assign(filing, {
      userName: item.value.userName,
      userAddress: item.value.userAddress,
      reason: item.value.reason,
      description: item.value.description,
      inspector: item.value.inspector,
      filedAt: item.value.filedAt,
    })
  }
}

const canEditFiling = computed(() => item.value && !item.value.closed && (item.value.status === '挂起' || item.value.status === '立案'))
const canEditEvidence = computed(() => item.value && !item.value.closed && item.value.status === '立案')
const canSubmitEvidence = computed(() => item.value && !item.value.closed && item.value.status === '立案' && item.value.evidences.length > 0)
const canEditNotice = computed(() => item.value && !item.value.closed && item.value.status === '取证')
const canEditDecision = computed(() => item.value && !item.value.closed && item.value.status === '告知')

function trackClass(stage: CaseStage): 'done' | 'active' | 'locked' {
  if (!item.value) {
    return 'locked'
  }
  return stageState(item.value, stage)
}

function panelTag(stage: CaseStage): string {
  const state = trackClass(stage)
  if (state === 'done') {
    return '· 已完成（材料冻结）'
  }
  if (state === 'active') {
    return '· 当前办理'
  }
  return '· 未到达（前序阶段未完成，不可跳办）'
}

function run<T>(fn: () => { ok: boolean; message: string }, stage: CaseStage, payload?: T) {
  activeError.value = ''
  failureAtStep.value = false
  const result = fn()
  if (!result.ok) {
    activeError.value = result.message
    if (payload !== undefined) {
      saveDraft(caseId.value, stage, payload, result.message)
      failureAtStep.value = true
    }
  }
  reload()
}

function saveFiling() {
  run(() => updateFiling(caseId.value, { ...filing }), '立案')
}

function addEvidenceRow() {
  const payload = { ...evidence }
  run(() => addEvidence(caseId.value, payload), '取证')
  if (!activeError.value) {
    Object.assign(evidence, { spot: '', content: '', photoName: '', photoTakenAt: '', signer1: '', signer2: '' })
  }
}

function doSubmitEvidence() {
  run(() => submitEvidence(caseId.value), '取证', { evidenceSubmit: true })
}

function stashNotice() {
  saveDraft(caseId.value, '告知', { ...notice })
}

function submitNoticeRow() {
  const payload = { ...notice }
  run(() => submitNotice(caseId.value, payload), '告知', payload)
  if (!activeError.value) {
    Object.assign(notice, { docNo: '', content: '', notifier: '', notifiedAt: '' })
  }
}

function addMeter() {
  decision.meterRecords.push({
    meterNo: '',
    period: '',
    baseReading: 0,
    lastReading: 0,
    heatAmount: 0,
    amount: 0,
    source: '',
    recordedAt: '',
  })
}

function removeMeter(i: number) {
  decision.meterRecords.splice(i, 1)
  stashDecision()
}

function stashDecision() {
  saveDraft(caseId.value, '决定', { ...decision, meterRecords: decision.meterRecords })
}

function submitDecisionRow() {
  const payload = {
    docNo: decision.docNo,
    result: decision.result,
    recoveryAmount: Number(decision.recoveryAmount) || 0,
    penalty: Number(decision.penalty) || 0,
    meterRecords: decision.meterRecords.map((m: MeterFormRow): Omit<MeterRecord, 'id'> => ({
      meterNo: m.meterNo,
      period: m.period,
      baseReading: Number(m.baseReading) || 0,
      lastReading: Number(m.lastReading) || 0,
      heatAmount: Number(m.heatAmount) || 0,
      amount: Number(m.amount) || 0,
      source: m.source,
      recordedAt: m.recordedAt,
    })),
    decisionMaker: decision.decisionMaker,
    decidedAt: decision.decidedAt,
  }
  run(() => submitDecision(caseId.value, payload), '决定', payload)
}

/** 打开页面时若带着失败步骤（或存在该阶段草稿），把暂存内容恢复回表单。 */
function restoreDrafts() {
  const wanted = (route.query.step as CaseStage) || ''
  const restoreOne = (stage: CaseStage): boolean => {
    const draft = getDraft(caseId.value, stage)
    if (!draft) {
      return false
    }
    if (stage === '告知') {
      const data = readDraftPayload<typeof notice>(draft)
      if (data) {
        Object.assign(notice, data)
      }
    } else if (stage === '决定') {
      const data = readDraftPayload<{
        docNo: string
        result: string
        recoveryAmount: number
        penalty: number
        meterRecords: MeterFormRow[]
        decisionMaker: string
        decidedAt: string
      }>(draft)
      if (data) {
        decision.docNo = data.docNo
        decision.result = data.result
        decision.recoveryAmount = data.recoveryAmount
        decision.penalty = data.penalty
        decision.decisionMaker = data.decisionMaker
        decision.decidedAt = data.decidedAt
        decision.meterRecords = Array.isArray(data.meterRecords) ? data.meterRecords : []
      }
    }
    if (wanted === stage && draft.lastError) {
      activeError.value = draft.lastError
      failureAtStep.value = true
    }
    return true
  }
  if (wanted) {
    restoreOne(wanted)
  } else {
    restoreOne('告知')
    restoreOne('决定')
  }
}

onMounted(() => {
  reload()
  if (item.value) {
    restoreDrafts()
  }
})
</script>
