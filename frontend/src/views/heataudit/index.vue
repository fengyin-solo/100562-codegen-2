<template>
  <section class="page" data-module="heataudit">
    <header class="page-head">
      <div>
        <h2>用热稽查与违规用热处理台账</h2>
        <p class="page-desc">
          一张案件单从立案一路流转到处理决定：立案 → 取证 → 告知 → 决定，只许顺阶段前进，不得跳级；出过决定即封卷。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="goCreate">登记立案</button>
        <RouterLink class="btn" :to="{ name: 'audit-survey' }">勘察记录</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card" :class="{ warn: item.warn }">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span class="legend-item">立案 → 取证 → 告知 → 决定</span>
      <span class="legend-item">缺一步不许跳级</span>
      <span class="legend-item">决定后封卷不可倒回</span>
      <label class="drill-switch">
        <input type="checkbox" :checked="drillOn" @change="toggleDrill" />
        提交失败演练（打开后阶段提交失败、材料暂存，可从失败那一步续录）
      </label>
    </p>

    <div v-if="draftRows.length" class="draft-banner">
      <strong>有 {{ draftRows.length }} 份提交失败/未送达的阶段草稿：</strong>
      <RouterLink
        v-for="d in draftRows"
        :key="d.id"
        class="draft-chip"
        :to="{ name: 'audit-case', params: { id: d.caseId }, query: { step: d.stage } }"
      >
        {{ d.caseId === 0 ? '立案草稿' : caseLabel(d.caseId) }} · {{ d.stage }}（{{ d.updatedAt.slice(5, 16) }}）
      </RouterLink>
    </div>

    <div v-if="todoPending" class="todo-banner">
      <RouterLink :to="{ name: 'heatbilling' }">
        有 {{ todoPending }} 条办结追补已落到热费结算待办，点此前往热费结算办理 →
      </RouterLink>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>当事人 / 地址 / 案件编号</span>
        <input v-model="keyword" placeholder="按关键字检索" />
      </label>
      <label class="filter-item">
        <span>案由（统一目录）</span>
        <select v-model="reasonFilter">
          <option value="">全部案由</option>
          <option v-for="r in reasons" :key="r.code" :value="r.name">{{ r.category }}｜{{ r.name }}</option>
          <option value="__missing__">案由缺失（挂起）</option>
        </select>
      </label>
      <label class="filter-item">
        <span>状态</span>
        <select v-model="statusFilter">
          <option value>全部状态</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>案件编号</th>
          <th>当事人</th>
          <th>用热地址</th>
          <th>案由（统一目录）</th>
          <th>主办稽查员</th>
          <th>立案日期</th>
          <th>当前状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in filtered" :key="row.id" :class="{ closed: row.closed, suspended: row.suspended }">
          <td>{{ row.caseNo }}</td>
          <td>{{ row.userName }}</td>
          <td>{{ row.userAddress }}</td>
          <td>
            <span v-if="row.reason">{{ row.reason }}</span>
            <span v-else class="missing-tag">案由缺失·挂起</span>
          </td>
          <td>{{ row.inspector }}</td>
          <td>{{ row.filedAt }}</td>
          <td><span class="status-badge" :class="badgeClass(row.status)">{{ statusLabel(row) }}</span></td>
          <td class="row-actions">
            <RouterLink class="link" :to="{ name: 'audit-case', params: { id: row.id } }">
              {{ row.closed ? '查看卷宗' : '办理' }}
            </RouterLink>
          </td>
        </tr>
        <tr v-if="!filtered.length">
          <td colspan="8" class="empty-state">暂无符合条件的案卷，可先登记立案</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ filtered.length }} 条案卷（数据保存在本机浏览器）</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { auditStats, listCases, listDrafts, listTodos } from '@/audit/audit-service'
import { REASON_CATALOG } from '@/audit/reasons'
import { isFailDrillOn, setFailDrill } from '@/audit/store'
import type { AuditCase, CaseStatus, StageDraft } from '@/audit/types'

const router = useRouter()

const reasons = REASON_CATALOG
const statuses: CaseStatus[] = ['挂起', '立案', '取证', '告知', '决定']

const rows = ref<AuditCase[]>([])
const drafts = ref<StageDraft[]>([])
const todoPending = ref(0)
const drillOn = ref(isFailDrillOn())

const keyword = ref('')
const reasonFilter = ref('')
const statusFilter = ref('')

const stats = computed(() => {
  const s = auditStats()
  return [
    { label: '在册案卷', value: s.total, warn: false },
    { label: '在途（未办结）', value: s.open, warn: false },
    { label: '案由缺失挂起', value: s.suspended, warn: s.suspended > 0 },
    { label: '已办结封卷', value: s.closed, warn: false },
    { label: '失败待续录', value: s.drafts, warn: s.drafts > 0 },
    { label: '热费追补待办', value: s.todoPending, warn: s.todoPending > 0 },
  ]
})

const draftRows = computed(() => drafts.value)

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return rows.value.filter((row) => {
    if (kw) {
      const hay = `${row.caseNo} ${row.userName} ${row.userAddress} ${row.reason} ${row.inspector}`
      if (!hay.includes(kw)) {
        return false
      }
    }
    if (reasonFilter.value === '__missing__') {
      if (row.reason) {
        return false
      }
    } else if (reasonFilter.value && row.reason !== reasonFilter.value) {
      return false
    }
    if (statusFilter.value && row.status !== statusFilter.value) {
      return false
    }
    return true
  })
})

function caseLabel(caseId: number): string {
  const item = rows.value.find((c) => c.id === caseId)
  return item ? item.caseNo : `案件#${caseId}`
}

function statusLabel(row: AuditCase): string {
  if (row.status === '决定') {
    return '决定·已办结'
  }
  return row.status
}

function badgeClass(status: CaseStatus): string {
  if (status === '挂起') {
    return 'b-suspend'
  }
  if (status === '决定') {
    return 'b-done'
  }
  return 'b-open'
}

function toggleDrill(event: Event) {
  const on = (event.target as HTMLInputElement).checked
  setFailDrill(on)
  drillOn.value = on
}

function goCreate() {
  router.push({ name: 'audit-create' })
}

function resetFilters() {
  keyword.value = ''
  reasonFilter.value = ''
  statusFilter.value = ''
}

function reload() {
  rows.value = listCases()
  drafts.value = listDrafts()
  todoPending.value = listTodos().filter((t) => !t.pushed).length
}

onMounted(reload)
</script>
