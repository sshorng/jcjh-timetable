<template>
      <div class="modal-overlay" @click.self="closeSamePeriodSwapModal">
        <div class="modal-card same-period-swap-modal-card" style="max-width:680px;">
          <div class="modal-header">
            <div>
              <h3>管理員同節互換</h3>
              <div class="same-period-swap-subtitle">選擇同一時段的另一位任課教師</div>
            </div>
            <button type="button" class="btn-close" @click="closeSamePeriodSwapModal" aria-label="關閉">&times;</button>
          </div>
          <div class="modal-body same-period-swap-body">
            <div class="same-period-swap-context">
              <span class="same-period-swap-context-time">{{ samePeriodSwapSource.date }}　{{ formatPeriodText(samePeriodSwapSource.period) }}</span>
              <span class="same-period-swap-context-divider"></span>
              <strong>{{ samePeriodSwapSource.teacherName }}</strong>
              <span class="same-period-swap-context-course">{{ samePeriodSwapSource.cell.className }}　{{ samePeriodSwapSource.cell.subject }}</span>
            </div>
            <section class="same-period-swap-picker">
              <div class="same-period-swap-picker-heading">
                <div>
                  <strong>同時段可互換</strong>
                  <span>{{ samePeriodSwapFilteredCandidates.length }} 位</span>
                </div>
                <span class="same-period-swap-sort-hint">按班級排序</span>
              </div>
              <label class="same-period-swap-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  v-model="samePeriodSwapSearchQuery"
                  placeholder="搜尋班級、科目或教師姓名"
                  aria-label="搜尋互換教師"
                >
                <button v-if="samePeriodSwapSearchQuery" type="button" aria-label="清除搜尋" @click="samePeriodSwapSearchQuery = ''">×</button>
              </label>
              <div v-if="samePeriodSwapFilteredCandidates.length" class="same-period-swap-list">
                <button
                  v-for="candidate in samePeriodSwapFilteredCandidates"
                  :key="'same-period-swap-' + candidate.key"
                  type="button"
                  class="same-period-swap-option"
                  :class="{ 'is-selected': samePeriodSwapTargetKey === candidate.key }"
                  :aria-pressed="samePeriodSwapTargetKey === candidate.key"
                  @click="samePeriodSwapTargetKey = candidate.key"
                >
                  <span class="same-period-swap-class-badge" :style="getClassBadgeStyle(candidate.className)">{{ candidate.className }}</span>
                  <span class="same-period-swap-option-course">
                    <strong>{{ candidate.subject }}</strong>
                    <span v-if="candidate.isPullOut" class="same-period-swap-tag is-pullout">抽離</span>
                    <span v-if="candidate.restriction === 'restricted' || candidate.restriction === '限制'" class="same-period-swap-tag is-restricted">綁課</span>
                  </span>
                  <span class="same-period-swap-option-teacher">{{ candidate.name }}</span>
                  <span class="same-period-swap-option-check" aria-hidden="true">✓</span>
                </button>
              </div>
              <div v-else-if="samePeriodSwapCandidates.length" class="same-period-swap-empty">
                <span class="same-period-swap-empty-icon">⌕</span>
                <strong>找不到符合的教師</strong>
                <span>試試班級、科目或姓名的其他關鍵字。</span>
              </div>
              <div v-else class="same-period-swap-empty">
                <span class="same-period-swap-empty-icon">↔</span>
                <strong>目前沒有可互換的教師</strong>
                <span>此時段需有另一位教師正在教授可互換的課程。</span>
              </div>
            </section>
            <div v-if="samePeriodSwapSelectedCandidate" class="same-period-swap-preview">
              <div class="same-period-swap-preview-grid">
                <div class="same-period-swap-preview-side">
                  <span class="same-period-swap-preview-label">{{ samePeriodSwapSource.teacherName }}改上</span>
                  <strong><span class="same-period-swap-preview-class">{{ samePeriodSwapSelectedCandidate.className }}</span>{{ samePeriodSwapSelectedCandidate.subject }}</strong>
                </div>
                <span class="same-period-swap-preview-arrow" aria-hidden="true">⇄</span>
                <div class="same-period-swap-preview-side">
                  <span class="same-period-swap-preview-label">{{ samePeriodSwapSelectedCandidate.name }}改上</span>
                  <strong><span class="same-period-swap-preview-class">{{ samePeriodSwapSource.cell.className }}</span>{{ samePeriodSwapSource.cell.subject }}</strong>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer same-period-swap-actions">
            <button type="button" class="btn btn-primary" :disabled="samePeriodSwapSaving || !samePeriodSwapSelectedCandidate" @click="saveSamePeriodSwap">
              {{ samePeriodSwapSaving ? '儲存中…' : '確認並套用' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="samePeriodSwapSaving" @click="closeSamePeriodSwapModal">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 同節互調 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  samePeriodSwapSource: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  samePeriodSwapFilteredCandidates: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  samePeriodSwapSelectedCandidate: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  samePeriodSwapSaving: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  formatPeriodText: { type: Function, required: true },
  samePeriodSwapTargetKey: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  samePeriodSwapCandidates: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  closeSamePeriodSwapModal: { type: Function, required: true },
  getClassBadgeStyle: { type: Function, required: true },
  saveSamePeriodSwap: { type: Function, required: true },
});
defineEmits(['close']);
const samePeriodSwapSearchQuery = defineModel('samePeriodSwapSearchQuery');
</script>
