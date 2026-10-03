<template>
  <section class="page" data-module="heataudit">
    <header class="page-head">
      <div>
        <h2>现场勘察记录</h2>
        <p class="page-desc">
          勘察记录的案由与案卷列表并为同一套统一目录：现场先记原始案由，按既有立案口径核定后才能转立案；核定不上的先挂起。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn ghost" :to="{ name: 'heataudit' }">返回案卷列表</RouterLink>
      </div>
    </header>

    <p v-if="message" class="form-banner" :class="messageOk ? 'info' : 'error'">{{ message }}</p>

    <form class="filter-bar" @submit.prevent="reload">
      <button class="btn primary" type="button" @click="showForm = !showForm">
        {{ showForm ? '收起登记' : '登记勘察记录' }}
      </button>
    </form>

    <form v-if="showForm" class="entry-form inset" @submit.prevent="createRow">
      <label class="form-item"><span>当事人 *</span><input v-model="form.userName" /></label>
      <label class="form-item"><span>用热地址 *</span><input v-model="form.userAddress" /></label>
      <label class="form-item">
        <span>现场原始案由（可口语记录）</span>
        <input v-model="form.rawReason" placeholder="如：私接管子、偷热、表被改过" />
      </label>
      <label class="form-item">
        <span>勘察方式</span>
        <select v-model="form.method">
          <option>现场勘察</option><option>现场勘察 + 拍照</option><option>现场勘察 + 抄表比对</option><option>走访核实</option>
        </select>
      </label>
      <label class="form-item"><span>勘察人 *</span><input v-model="form.surveyor" /></label>
      <label class="form-item"><span>勘察日期 *</span><input v-model="form.surveyedAt" type="date" /></label>
      <label class="form-item wide"><span>勘察情况</span><textarea v-model="form.findings" rows="2"></textarea></label>
      <div class="form-foot">
        <button class="btn primary" type="submit">保存勘察记录</button>
        <span class="hint-text">保存后案由为「待核定」，核定通过才能转立案</span>
      </div>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>勘察编号</th><th>当事人</th><th>地址</th><th>现场原始案由</th>
          <th>核定案由（统一目录）</th><th>勘察人</th><th>勘察日期</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.surveyNo }}</td>
          <td>{{ row.userName }}</td>
          <td>{{ row.userAddress }}</td>
          <td>{{ row.rawReason }}</td>
          <td>
            <template v-if="row.reasonCode">
              <span class="reason-tag">{{ reasonName(row.reasonCode) }}</span>
              <span class="reason-code">{{ row.reasonCode }}</span>
            </template>
            <span v-else class="missing-tag">待核定</span>
          </td>
          <td>{{ row.surveyor }}</td>
          <td>{{ row.surveyedAt }}</td>
          <td class="row-actions">
            <button v-if="!row.reasonCode" class="link" type="button" @click="adjudge(row.id)">核定案由</button>
            <button
              v-if="row.reasonCode && !row.convertedCaseId"
              class="link"
              type="button"
              @click="convert(row.id)"
            >
              转立案
            </button>
            <RouterLink v-if="row.convertedCaseId" class="link dim" :to="{ name: 'audit-case', params: { id: row.convertedCaseId } }">
              已转立案 #{{ row.convertedCaseId }}
            </RouterLink>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="8" class="empty-state">暂无勘察记录</td></tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import { adjudgeSurvey, convertSurveyToCase, createSurvey, listSurveys } from '@/audit/audit-service'
import type { SurveyInput } from '@/audit/audit-service'
import { REASON_CATALOG } from '@/audit/reasons'
import type { SurveyRecord } from '@/audit/types'

const rows = ref<SurveyRecord[]>([])
const showForm = ref(false)
const message = ref('')
const messageOk = ref(true)

const form = reactive<SurveyInput>({
  userName: '',
  userAddress: '',
  rawReason: '',
  method: '现场勘察',
  findings: '',
  surveyor: '',
  surveyedAt: new Date().toISOString().slice(0, 10),
})

function reasonName(code: string): string {
  return REASON_CATALOG.find((r) => r.code === code)?.name ?? code
}

function notify(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function createRow() {
  const result = createSurvey({ ...form })
  notify(result.ok, result.message)
  if (result.ok) {
    Object.assign(form, { userName: '', userAddress: '', rawReason: '', findings: '', surveyor: '' })
    showForm.value = false
  }
  reload()
}

function adjudge(id: number) {
  const result = adjudgeSurvey(id)
  notify(result.ok, result.message)
  reload()
}

function convert(id: number) {
  const result = convertSurveyToCase(id)
  notify(result.ok, result.message)
  reload()
}

function reload() {
  rows.value = listSurveys()
}

onMounted(reload)
</script>
