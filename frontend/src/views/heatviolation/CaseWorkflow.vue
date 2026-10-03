<template>
  <section class="workflow">
    <header class="case-head">
      <div>
        <h3>{{ detail.caseNo }} · {{ detail.customer }}</h3>
        <p class="page-desc">{{ detail.address }}　立案日期 {{ detail.filedAt }}　立案人 {{ detail.recorder }}</p>
      </div>
      <span :class="['status-badge', badgeClass]">{{ statusText }}</span>
    </header>

    <!-- 单行道步骤条 -->
    <ol class="stepper">
      <li
        v-for="(label, index) in stageNames"
        :key="label"
        :class="{
          done: stageIndex > index,
          current: !detail.resolved && stageIndex === index,
          hang: detail.suspended && stageIndex === index,
        }"
      >
        <span class="step-dot">{{ index + 1 }}</span>
        <span class="step-label">{{ label }}</span>
      </li>
    </ol>

    <!-- 案由缺失挂起：补齐后在原步骤继续 -->
    <div v-if="detail.suspended" class="hang-panel">
      <p class="hang-title">卷宗已挂起：{{ detail.suspendReason }}</p>
      <div class="hang-actions">
        <label class="inline-field">
          <span>核定案由</span>
          <select v-model="reasonPick">
            <option value="">请按立案口径选择</option>
            <option v-for="reason in CASE_REASONS" :key="reason" :value="reason">{{ reason }}</option>
          </select>
        </label>
        <button class="btn primary" type="button" @click="resolveReason">核定案由并恢复</button>
      </div>
    </div>

    <!-- 失败续录提示 -->
    <div v-if="detail.failedStage && !detail.resolved" class="resume-panel">
      <strong>断点续录：</strong>{{ detail.failNote }}
    </div>

    <p v-if="message" :class="['form-message', lastOk ? 'ok-text' : 'error-text']">{{ message }}</p>

    <!-- 已封卷：只读卷宗 -->
    <div v-if="detail.resolved" class="sealed">
      <p class="sealed-tip">该卷宗已作出处理决定并封卷，不允许倒回立案或修改任何材料。</p>
      <table class="material-table">
        <tbody>
          <tr v-for="item in sealedRows" :key="item.label">
            <th>{{ item.label }}</th>
            <td>{{ item.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 当前步骤表单 -->
    <form v-else-if="!detail.suspended" class="stage-form" @submit.prevent="submit">
      <h4 class="stage-title">当前步骤：{{ stageNames[stageIndex] }}（{{ STAGE_ACTIONS[detail.stage] }}）</h4>

      <template v-if="detail.stage === 'evidence'">
        <label class="form-item">
          <span>现场取证情况 <em>*</em></span>
          <textarea v-model="evidence.siteSummary" rows="2" placeholder="现场违规情形、取证手段"></textarea>
        </label>
        <div class="form-grid">
          <label class="form-item">
            <span>取证照片数 <em>*</em></span>
            <input v-model.number="evidence.photoCount" type="number" min="1" />
          </label>
          <label class="form-item">
            <span>取证日期 <em>*</em></span>
            <input v-model="evidence.collectedAt" type="date" />
          </label>
        </div>
        <div class="form-grid">
          <label class="form-item">
            <span>稽查人员签字（一） <em>*</em></span>
            <input v-model="evidence.inspectorA" placeholder="签字稽查人员 A" />
          </label>
          <label class="form-item">
            <span>稽查人员签字（二） <em>*</em></span>
            <input v-model="evidence.inspectorB" placeholder="签字稽查人员 B，须两人" />
          </label>
        </div>
        <p class="rule-hint">现场取证必须两名稽查人员共同签字，缺一人或同一人签两次都不能提交。</p>
      </template>

      <template v-else-if="detail.stage === 'notice'">
        <div class="form-grid">
          <label class="form-item">
            <span>告知书编号 <em>*</em></span>
            <input v-model="notice.documentNo" placeholder="如：YZGZ-2026-0012" />
          </label>
          <label class="form-item">
            <span>告知日期 <em>*</em></span>
            <input v-model="notice.notifiedAt" type="date" />
          </label>
        </div>
        <div class="form-grid">
          <label class="form-item">
            <span>告知方式 <em>*</em></span>
            <input v-model="notice.method" placeholder="上门送达 / 留置送达 / 邮寄" />
          </label>
          <label class="form-item">
            <span>受送达人 <em>*</em></span>
            <input v-model="notice.receiver" />
          </label>
        </div>
        <label class="form-item">
          <span>告知事项</span>
          <textarea v-model="notice.content" rows="2" placeholder="违规事实、拟处理意见、陈述申辩权利"></textarea>
        </label>
      </template>

      <template v-else-if="detail.stage === 'decision'">
        <div class="form-grid">
          <label class="form-item">
            <span>处理决定书编号 <em>*</em></span>
            <input v-model="decision.documentNo" placeholder="如：YZJD-2026-0008" />
          </label>
          <label class="form-item">
            <span>决定日期 <em>*</em></span>
            <input v-model="decision.decidedAt" type="date" />
          </label>
        </div>
        <label class="form-item">
          <span>处理决定 <em>*</em></span>
          <textarea v-model="decision.decision" rows="2" placeholder="责令整改 / 拆除私接 / 追补热费等"></textarea>
        </label>
        <div class="form-grid">
          <label class="form-item">
            <span>追补热费（元）</span>
            <input v-model.number="decision.recoveryHeatFee" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>决定作出人 <em>*</em></span>
            <input v-model="decision.handler" />
          </label>
        </div>
        <fieldset class="meter-box">
          <legend>追补计量记录（追补金额大于 0 时必须附）</legend>
          <div class="form-grid">
            <label class="form-item">
              <span>计量记录单号</span>
              <input v-model="decision.meterRecordNo" placeholder="如：JL-2026-09022" />
            </label>
            <div class="form-grid">
              <label class="form-item">
                <span>表码前读数</span>
                <input v-model="decision.meterBefore" placeholder="如：12840 kWh" />
              </label>
              <label class="form-item">
                <span>表码后读数</span>
                <input v-model="decision.meterAfter" placeholder="如：20560 kWh" />
              </label>
            </div>
          </div>
        </fieldset>
      </template>

      <footer class="stage-foot">
        <button class="btn" type="button" @click="stash">暂存（稍后从这一步续录）</button>
        <button class="btn primary" type="submit">{{ STAGE_ACTIONS[detail.stage] }}</button>
      </footer>
    </form>

    <!-- 流转记录 -->
    <section class="history">
      <h4>流转记录</h4>
      <ul>
        <li v-for="(item, index) in detail.history" :key="index">
          <span class="history-at">{{ item.at }}</span>
          <span class="history-action">{{ item.action }}</span>
          <span class="history-detail">{{ item.detail }}</span>
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import {
  CASE_REASONS,
  STAGE_ACTIONS,
  caseStatusText,
  resolveCaseReason,
  saveStageDraft,
  submitStage,
} from '@/api/violation-service'
import { STAGES, type DecisionMaterial, type EvidenceMaterial, type NoticeMaterial, type ViolationCase } from '@/data/violation-types'

const props = defineProps<{ detail: ViolationCase }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const stageNames = ['立案', '取证', '告知', '决定']
const stageIndex = computed(() => STAGES.indexOf(props.detail.stage))
const statusText = computed(() => caseStatusText(props.detail))
const badgeClass = computed(() => ({
  'badge-resolved': props.detail.resolved,
  'badge-hang': props.detail.suspended,
  'badge-active': !props.detail.resolved && !props.detail.suspended,
}))

const reasonPick = ref('')
const message = ref('')
const lastOk = ref(false)

const evidence = reactive<EvidenceMaterial>(blankEvidence())
const notice = reactive<NoticeMaterial>(blankNotice())
const decision = reactive<DecisionMaterial>(blankDecision())

function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function blankEvidence(): EvidenceMaterial {
  return { siteSummary: '', photoCount: 0, inspectorA: '', inspectorB: '', collectedAt: today() }
}
function blankNotice(): NoticeMaterial {
  return { documentNo: '', notifiedAt: today(), method: '', receiver: '', content: '' }
}
function blankDecision(): DecisionMaterial {
  return {
    documentNo: '',
    decision: '',
    recoveryHeatFee: 0,
    meterRecordNo: '',
    meterBefore: '',
    meterAfter: '',
    decidedAt: today(),
    handler: '',
  }
}

// 切换卷宗或材料落库后，把已暂存内容带回表单，从失败那一步接着录。
watch(
  () => props.detail,
  (row) => {
    message.value = ''
    Object.assign(evidence, blankEvidence(), row.materials.evidence, row.draft.evidence)
    Object.assign(notice, blankNotice(), row.materials.notice, row.draft.notice)
    Object.assign(decision, blankDecision(), row.materials.decision, row.draft.decision)
  },
  { immediate: true, deep: true },
)

function currentPayload(): Record<string, unknown> {
  if (props.detail.stage === 'evidence') {
    return { ...evidence }
  }
  if (props.detail.stage === 'notice') {
    return { ...notice }
  }
  return { ...decision }
}

function submit() {
  const result = submitStage(props.detail.id, props.detail.stage, currentPayload())
  lastOk.value = result.ok
  message.value = result.message
  if (result.ok) {
    emit('changed')
  } else {
    emit('changed') // 失败也已暂存，刷新以展示断点提示
  }
}

function stash() {
  const result = saveStageDraft(props.detail.id, props.detail.stage, currentPayload())
  lastOk.value = result.ok
  message.value = result.message
  emit('changed')
}

function resolveReason() {
  const result = resolveCaseReason(props.detail.id, reasonPick.value)
  lastOk.value = result.ok
  message.value = result.message
  if (result.ok) {
    reasonPick.value = ''
    emit('changed')
  }
}

const sealedRows = computed(() => {
  const e = props.detail.materials.evidence
  const n = props.detail.materials.notice
  const d = props.detail.materials.decision
  const rows = [
    { label: '案由', value: props.detail.reason },
    { label: '案件来源', value: props.detail.source || '—' },
  ]
  if (e) {
    rows.push(
      { label: '取证情况', value: e.siteSummary },
      { label: '取证照片 / 日期', value: `${e.photoCount} 张 · ${e.collectedAt}` },
      { label: '稽查签字', value: `${e.inspectorA}、${e.inspectorB}` },
    )
  }
  if (n) {
    rows.push(
      { label: '告知书编号', value: n.documentNo },
      { label: '告知情况', value: `${n.notifiedAt} · ${n.method} · 受送达人 ${n.receiver}` },
    )
  }
  if (d) {
    rows.push(
      { label: '处理决定书', value: `${d.documentNo} · ${d.decidedAt}` },
      { label: '处理决定', value: d.decision },
      {
        label: '追补热费 / 计量记录',
        value:
          Number(d.recoveryHeatFee) > 0
            ? `${d.recoveryHeatFee} 元 · 计量单 ${d.meterRecordNo}（${d.meterBefore} → ${d.meterAfter}）`
            : '不涉及追补',
      },
      { label: '决定作出人', value: d.handler },
    )
  }
  return rows
})
</script>
