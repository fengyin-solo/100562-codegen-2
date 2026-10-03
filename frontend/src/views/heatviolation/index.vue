<template>
  <section class="page" data-module="heatviolation">
    <header class="page-head">
      <div>
        <h2>用热稽查与违规用热处理台账</h2>
        <p class="page-desc">
          一张案件单从立案经取证、告知一路流转到处理决定：状态单行道不可跳级，已出决定封卷不可倒回；
          现场取证两人签字，追补热费附计量记录，办结结果落到热费结算待办。
        </p>
      </div>
      <div class="page-actions">
        <label class="fail-toggle" title="演示中途提交失败：打开后下一次提交会在暂存后失败，可从失败步骤续录">
          <input v-model="failFlag" type="checkbox" @change="onFailFlag" />
          模拟下一次提交失败
        </label>
        <button class="btn primary" type="button" @click="showCreate = true">登记违规案件</button>
        <button class="btn" type="button" @click="resetLedger">重置示例数据</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">在办案件</span>
        <strong class="stat-value">{{ openCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已挂起（案由待核定）</span>
        <strong class="stat-value warn">{{ suspendedCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已办结（已出决定）</span>
        <strong class="stat-value">{{ resolvedCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">热费结算待办</span>
        <strong class="stat-value">{{ pendingTodoCount }}</strong>
      </article>
    </div>

    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab', { active: activeTab === tab.key }]"
        type="button"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <em v-if="tab.badge" class="tab-badge">{{ tab.badge }}</em>
      </button>
    </nav>

    <!-- 案件卷宗 -->
    <div v-show="activeTab === 'cases'">
      <form class="filter-bar" @submit.prevent="reload">
        <label class="filter-item">
          <span>关键词</span>
          <input v-model="keyword" placeholder="案件编号 / 用户 / 地址 / 案由" />
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="statusFilter">
            <option value="">全部</option>
            <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <button class="btn" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="resetFilter">重置</button>
      </form>

      <div v-if="!selectedCase" class="split-view">
        <table class="data-table">
          <thead>
            <tr>
              <th>案件编号</th><th>用户名称</th><th>用热地址</th><th>案由</th>
              <th>立案日期</th><th>当前状态</th><th>断点</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in cases" :key="row.id" :class="{ selected: row.id === selectedId }">
              <td>{{ row.caseNo }}</td>
              <td>{{ row.customer }}</td>
              <td>{{ row.address }}</td>
              <td>
                <span v-if="row.reason">{{ row.reason }}</span>
                <span v-else class="warn-text">案由缺失</span>
              </td>
              <td>{{ row.filedAt }}</td>
              <td>
                <span :class="['status-badge', statusBadgeClass(row)]">{{ statusOf(row) }}</span>
              </td>
              <td>
                <span v-if="row.failedStage" class="warn-text">{{ stageLabel(row.failedStage) }}暂存</span>
                <span v-else>—</span>
              </td>
              <td><button class="link" type="button" @click="openCase(row.id)">打开卷宗</button></td>
            </tr>
            <tr v-if="!cases.length">
              <td colspan="8" class="empty-state">没有符合条件的卷宗，可先登记违规案件。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="case-panel">
        <button class="btn ghost back-btn" type="button" @click="selectedId = null">← 返回案件列表</button>
        <CaseWorkflow :key="selectedCase.id" :detail="selectedCase" @changed="reload" />
      </div>
    </div>

    <!-- 勘察记录：与案卷共用同一套案由 -->
    <div v-show="activeTab === 'surveys'">
      <p class="rule-hint">
        勘察记录的案由与案卷列表共用同一套立案口径（{{ reasonCatalog }}）；案由缺失的记录先挂起，核定后才能转立案。
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>勘察编号</th><th>用户名称</th><th>地址</th><th>案由（共用口径）</th>
            <th>勘察日期</th><th>勘察人</th><th>状态</th><th>关联卷宗</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in surveys" :key="row.id">
            <td>{{ row.surveyNo }}</td>
            <td>{{ row.customer }}</td>
            <td>{{ row.address }}</td>
            <td>
              <template v-if="!row.suspended && row.reason">{{ row.reason }}</template>
              <span v-else class="warn-text">案由缺失 · 挂起</span>
            </td>
            <td>{{ row.surveyDate }}</td>
            <td>{{ row.inspector }}</td>
            <td>
              <span :class="['status-badge', row.suspended ? 'badge-hang' : 'badge-active']">
                {{ row.suspended ? '已挂起' : '已核定' }}
              </span>
            </td>
            <td>{{ linkedCaseNo(row.convertedCaseId) }}</td>
            <td class="row-actions">
              <template v-if="row.suspended">
                <select v-model="surveyReason[row.id]">
                  <option value="">核定案由</option>
                  <option v-for="reason in CASE_REASONS" :key="reason" :value="reason">{{ reason }}</option>
                </select>
                <button class="link" type="button" @click="fixSurvey(row.id)">核定</button>
              </template>
              <button
                v-else-if="row.convertedCaseId === null"
                class="link"
                type="button"
                @click="convertSurvey(row.id)"
              >
                转立案
              </button>
              <button
                v-else
                class="link"
                type="button"
                @click="openCase(row.convertedCaseId as number)"
              >
                打开卷宗
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 热费结算待办 -->
    <div v-show="activeTab === 'todos'">
      <p class="rule-hint">案件作出处理决定后，追补热费办结结果在此生成待办；受理后落入「热费结算」清单的追补待核算单。</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>待办编号</th><th>来源卷宗</th><th>用户名称</th><th>案由</th>
            <th>追补金额</th><th>计量记录</th><th>决定书</th><th>办结日期</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="todo in todos" :key="todo.id">
            <td>{{ todo.todoNo }}</td>
            <td><button class="link" type="button" @click="openCase(todo.caseId)">{{ todo.caseNo }}</button></td>
            <td>{{ todo.customer }}</td>
            <td>{{ todo.reason }}</td>
            <td>{{ todo.recoveryHeatFee > 0 ? todo.recoveryHeatFee + ' 元' : '不追补（备查）' }}</td>
            <td>{{ todo.meterRecordNo || '—' }}</td>
            <td>{{ todo.decisionDocumentNo }}</td>
            <td>{{ todo.resolvedAt }}</td>
            <td>
              <span :class="['status-badge', todo.acceptedAt ? 'badge-resolved' : 'badge-active']">
                {{ todo.acceptedAt ? '已受理' : '待受理' }}
              </span>
            </td>
            <td>
              <button v-if="!todo.acceptedAt" class="link" type="button" @click="acceptTodo(todo.id)">受理进热费结算</button>
              <RouterLink v-else class="link" to="/heatbilling">去热费结算查看</RouterLink>
            </td>
          </tr>
          <tr v-if="!todos.length">
            <td colspan="10" class="empty-state">暂无办结待办，案件作出处理决定后自动生成。</td>
          </tr>
        </tbody>
      </table>
    </div>

    <CaseCreateDialog v-if="showCreate" @close="showCreate = false" @created="onCreated" />

    <footer class="page-foot">
      <span class="error-text" v-if="errorMessage">{{ errorMessage }}</span>
      <span v-else>卷宗、勘察记录与待办均保存在本机浏览器，数据不落服务器。</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import {
  CASE_REASONS,
  STAGE_LABELS,
  acceptBillingTodo,
  caseStatusText,
  getCase,
  isFailNextSubmit,
  listBillingTodos,
  listCases,
  listSurviews,
  resetViolationLedger,
  resolveSurveyReason,
  setFailNextSubmit,
  surveyToCase,
} from '@/api/violation-service'
import type { SiteSurvey, ViolationCase } from '@/data/violation-types'
import CaseCreateDialog from './CaseCreateDialog.vue'
import CaseWorkflow from './CaseWorkflow.vue'

const activeTab = ref<'cases' | 'surveys' | 'todos'>('cases')
const keyword = ref('')
const statusFilter = ref('')
const statusOptions = ['立案', '取证', '告知', '已挂起', '已决定']

const cases = ref<ViolationCase[]>([])
const surveys = ref<SiteSurvey[]>([])
const todos = ref(listBillingTodos())
const selectedId = ref<number | null>(null)
const showCreate = ref(false)
const errorMessage = ref('')
const surveyReason = reactive<Record<number, string>>({})
const failFlag = ref(isFailNextSubmit())

const tabs = computed(() => [
  { key: 'cases' as const, label: '案件卷宗', badge: 0 },
  {
    key: 'surveys' as const,
    label: '勘察记录',
    badge: surveys.value.filter((row) => row.suspended).length,
  },
  {
    key: 'todos' as const,
    label: '热费结算待办',
    badge: todos.value.filter((todo) => !todo.acceptedAt).length,
  },
])

const selectedCase = computed(() =>
  selectedId.value === null ? null : getCase(selectedId.value) ?? null,
)

const openCount = computed(() => cases.value.filter((row) => !row.resolved && !row.suspended).length)
const suspendedCount = computed(() => cases.value.filter((row) => row.suspended).length)
const resolvedCount = computed(() => cases.value.filter((row) => row.resolved).length)
const pendingTodoCount = computed(() => todos.value.filter((todo) => !todo.acceptedAt).length)

const reasonCatalog = CASE_REASONS.join('、')

function statusOf(row: ViolationCase): string {
  return caseStatusText(row)
}

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage
}

function statusBadgeClass(row: ViolationCase) {
  if (row.resolved) {
    return 'badge-resolved'
  }
  if (row.suspended) {
    return 'badge-hang'
  }
  return 'badge-active'
}

function linkedCaseNo(id: number | null): string {
  if (id === null) {
    return '—'
  }
  return getCase(id)?.caseNo ?? `#${id}`
}

function reload() {
  errorMessage.value = ''
  cases.value = listCases({ keyword: keyword.value, status: statusFilter.value })
  surveys.value = listSurviews()
  todos.value = listBillingTodos()
  if (selectedId.value !== null && !getCase(selectedId.value)) {
    selectedId.value = null
  }
}

function resetFilter() {
  keyword.value = ''
  statusFilter.value = ''
  reload()
}

function openCase(id: number) {
  selectedId.value = id
  activeTab.value = 'cases'
}

function onCreated(id: number) {
  showCreate.value = false
  reload()
  openCase(id)
}

function fixSurvey(id: number) {
  const result = resolveSurveyReason(id, surveyReason[id] ?? '')
  errorMessage.value = result.ok ? '' : result.message
  reload()
}

function convertSurvey(id: number) {
  const result = surveyToCase(id, '')
  errorMessage.value = result.ok ? '' : result.message
  reload()
  if (result.ok && result.data) {
    openCase(result.data.caseId)
  }
}

function acceptTodo(id: number) {
  const result = acceptBillingTodo(id)
  errorMessage.value = result.ok ? '' : result.message
  reload()
}

function onFailFlag() {
  setFailNextSubmit(failFlag.value)
}

function resetLedger() {
  resetViolationLedger()
  selectedId.value = null
  errorMessage.value = ''
  reload()
}

reload()
</script>
