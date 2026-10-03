<template>
  <section class="page" data-module="heataudit">
    <header class="page-head">
      <div>
        <h2>稽查立案登记</h2>
        <p class="page-desc">
          案由必须在统一案由目录内核定；一时核定不了可留空，案卷先挂起，补正后恢复。相同立案材料重复提交只落一条。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn ghost" :to="{ name: 'heataudit' }">返回案卷列表</RouterLink>
      </div>
    </header>

    <div v-if="lastError" class="form-banner error">
      <span>{{ lastError }}</span>
      <span v-if="draftSaved" class="banner-sub">材料已暂存，可直接再次提交，无需重填。</span>
    </div>
    <div v-else-if="draftSaved" class="form-banner info">立案材料已暂存，随时可继续提交。</div>

    <form class="entry-form" @submit.prevent="submit">
      <label class="form-item">
        <span>当事人（用户）名称 *</span>
        <input v-model="form.userName" placeholder="如：金城便民超市" />
      </label>
      <label class="form-item">
        <span>用热地址 *</span>
        <input v-model="form.userAddress" placeholder="片区 / 楼栋 / 门牌号" />
      </label>
      <label class="form-item">
        <span>案由（统一案由目录）</span>
        <select v-model="form.reason">
          <option value="">暂不明确 —— 先挂起，待核定补正</option>
          <option v-for="r in reasons" :key="r.code" :value="r.name">
            【{{ r.category }}】{{ r.name }}
          </option>
        </select>
        <small v-if="form.reason" class="basis-hint">立案依据：{{ reasonBasis(form.reason) }}</small>
      </label>
      <label class="form-item">
        <span>主办稽查员 *</span>
        <input v-model="form.inspector" placeholder="主办人姓名" />
      </label>
      <label class="form-item">
        <span>立案日期 *</span>
        <input v-model="form.filedAt" type="date" />
      </label>
      <label class="form-item wide">
        <span>案情摘要</span>
        <textarea v-model="form.description" rows="3" placeholder="线索来源、现场初步情况"></textarea>
      </label>

      <div class="form-foot">
        <button class="btn" type="button" @click="stash">暂存材料</button>
        <button class="btn primary" type="submit">提交立案</button>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { fileCase, getDraft, readDraftPayload, saveDraft } from '@/audit/audit-service'
import { REASON_CATALOG, reasonBasis } from '@/audit/reasons'
import type { FilingInput } from '@/audit/types'

const router = useRouter()
const reasons = REASON_CATALOG

const form = reactive<FilingInput>({
  userName: '',
  userAddress: '',
  reason: '',
  description: '',
  inspector: '',
  filedAt: new Date().toISOString().slice(0, 10),
  reasonSource: '立案登记',
})

const lastError = ref('')
const draftSaved = ref(false)

function stash() {
  saveDraft(0, '立案', form, lastError.value)
  draftSaved.value = true
}

function submit() {
  stash()
  const result = fileCase({ ...form })
  if (!result.ok || !result.data) {
    lastError.value = result.message
    return
  }
  lastError.value = ''
  router.push({
    name: 'audit-case',
    params: { id: result.data.caseId },
    query: result.data.duplicated ? { dup: '1' } : undefined,
  })
}

onMounted(() => {
  const draft = readDraftPayload<FilingInput>(getDraft(0, '立案'))
  if (draft) {
    Object.assign(form, draft)
    draftSaved.value = true
  }
})
</script>
