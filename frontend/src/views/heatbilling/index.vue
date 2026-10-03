<template>
  <section class="page" data-module="heatbilling">
    <header class="page-head">
      <div>
        <h2>热费结算管理</h2>
        <p class="page-desc">维护热费结算单，围绕结算编号、用户名称、用热面积、热价标准做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记热费结算单</button>
        <button class="btn" type="button" @click="exportRows">导出热费结算清单</button>
      </div>
    </header>

    <!-- 用热稽查办结后落到这里的待办：含追补的处理决定各生成一条 -->
    <section class="audit-todo-block">
      <h3>稽查追补待办（违规用热案件办结转入）</h3>
      <table v-if="todos.length" class="data-table">
        <thead>
          <tr>
            <th>案件编号</th><th>当事人</th><th>地址</th><th>决定书编号</th>
            <th>追补金额(元)</th><th>计量记录</th><th>决定日期</th><th>办理</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in todos" :key="t.id" :class="{ pushed: t.pushed }">
            <td>{{ t.caseNo }}</td>
            <td>{{ t.userName }}</td>
            <td>{{ t.userAddress }}</td>
            <td>{{ t.docNo }}</td>
            <td>{{ t.recoveryAmount }}</td>
            <td>{{ t.meterSummary }}</td>
            <td>{{ t.decidedAt }}</td>
            <td>
              <button v-if="!t.pushed" class="btn small primary" type="button" @click="pushTodo(t.id)">
                转热费结算单
              </button>
              <span v-else class="pushed-tag">已转 {{ t.refNo }}（待核算）</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">暂无稽查追补待办</p>
    </section>

    <p v-if="todoMessage" class="form-banner" :class="todoOk ? 'info' : 'error'">{{ todoMessage }}</p>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ fromAudit: !!row.案件编号 }">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无热费结算数据，可先登记热费结算单</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条热费结算记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listTodos, pushTodoToBilling } from '@/audit/audit-service'
import type { BillingTodo } from '@/audit/types'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('heatbilling')
const columns = ["结算编号", "用户名称", "用热面积", "热价标准", "应缴金额", "缴费日期", "收费员", "结算状态"]
const actions = ["提交核算", "登记缴费", "办理减免"]
const statuses = ["待核算", "已核算", "已缴费", "已减免"]
const stats = [{"label": "待核算用户", "value": 0}, {"label": "已缴费用户", "value": 0}, {"label": "本月应收金额", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const todos = ref<BillingTodo[]>([])
const todoMessage = ref('')
const todoOk = ref(true)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '热费结算单登记入口尚未接入审批流'
}

function pushTodo(id: number) {
  const result = pushTodoToBilling(id)
  todoOk.value = result.ok
  todoMessage.value = result.message
  reloadTodos()
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reloadTodos() {
  todos.value = listTodos()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '热费结算列表读取失败'
  }
}

onMounted(() => {
  reloadTodos()
  reload()
})
</script>
