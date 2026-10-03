<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal-card">
      <header class="modal-head">
        <h3>登记违规用热案件（立案）</h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </header>
      <p class="modal-tip">
        案由沿用既有立案口径，与勘察记录共用同一套；留空或选「待核定（先挂起）」的卷宗会先挂起。
        同一用户、同一用热地址且仍在办的立案材料重复提交，只落一条卷宗；已办结的可另立新案。
      </p>
      <form class="violation-form" @submit.prevent="submit">
        <label class="form-item">
          <span>用户名称 <em>*</em></span>
          <input v-model="form.customer" placeholder="如：滨河家园 3-2-501" />
        </label>
        <label class="form-item">
          <span>用热地址 <em>*</em></span>
          <input v-model="form.address" placeholder="楼栋单元门牌 / 商铺地址" />
        </label>
        <label class="form-item">
          <span>案由（立案口径） <em>*</em></span>
          <select v-model="form.reason">
            <option value="">待核定（先挂起）</option>
            <option v-for="reason in CASE_REASONS" :key="reason" :value="reason">{{ reason }}</option>
          </select>
        </label>
        <label class="form-item">
          <span>案件来源</span>
          <input v-model="form.source" placeholder="稽查巡查 / 供热站上报 / 住户举报" />
        </label>
        <label class="form-item">
          <span>立案人 <em>*</em></span>
          <input v-model="form.recorder" placeholder="负责立案登记的稽查人员" />
        </label>
        <label class="form-item">
          <span>立案日期</span>
          <input v-model="form.filedAt" type="date" />
        </label>
        <p v-if="message" :class="['form-message', ok ? 'ok-text' : 'error-text']">{{ message }}</p>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="$emit('close')">取消</button>
          <button class="btn primary" type="submit">提交立案材料</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

import { CASE_REASONS, createCase } from '@/api/violation-service'
import type { FilingMaterial } from '@/data/violation-types'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', caseId: number): void
}>()

function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const form = reactive<FilingMaterial>({
  caseNo: '',
  customer: '',
  address: '',
  reason: '',
  source: '',
  recorder: '',
  filedAt: today(),
})

const message = ref('')
const ok = ref(false)

function submit() {
  message.value = ''
  const result = createCase({ ...form })
  ok.value = result.ok
  message.value = result.message
  if (result.ok && result.data) {
    emit('created', result.data.caseId)
  }
}
</script>
