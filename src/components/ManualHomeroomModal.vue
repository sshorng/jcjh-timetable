<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="手動新增代導費" style="max-width:480px;">
          <div class="modal-header">
            <h3>➕ 手動新增代導費</h3>
            <button type="button" class="btn-close" @click="$emit('close')" aria-label="關閉">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
            <p style="margin:0;font-size:0.82rem;color:var(--text-secondary);line-height:1.45;">
               僅供導師整日請假、系統未自動產生代課單時補建代導費；純課務調整或不到一天請假不列入代導鐘點費。
            </p>

            <div class="form-group m-0" >
              <label class="form-label">請假導師 *</label>
              <select class="form-select" v-model="manualHomeroomForm.leaveEmail" @change="onManualHomeroomLeaveTeacherChange">
                <option value="">請選擇原導師…</option>
                 <option v-for="t in homeroomTeachersList" :key="'manual-hr-t-'+t.email" :value="t.email">
                  {{ t.name }}（{{ t.jobTitle }}）
                </option>
              </select>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="form-group m-0" >
                <label class="form-label">代導日期 *</label>
                <input type="date" class="form-input" v-model="manualHomeroomForm.date">
              </div>
              <div class="form-group m-0" >
                <label class="form-label">請假時間類型</label>
                <select class="form-select" v-model="manualHomeroomForm.leaveTimeType">
                  <option value="全天">全天</option>
                  <option value="上午">上午</option>
                  <option value="下午">下午</option>
                  <option value="自訂">自訂</option>
                </select>
              </div>
            </div>

            <div class="form-group m-0" >
              <label class="form-label">請假時間區間</label>
              <input type="text" class="form-input" v-model="manualHomeroomForm.leaveTime" placeholder="例如：08:00~16:00">
              <small style="display:block;margin-top:5px;color:var(--text-muted);">此處只補建整日請假代導費；純課務調整、上午／下午或不足全天請回調代課申請處理。</small>
            </div>

            <div class="form-group m-0" >
              <label class="form-label">代導教師（選填，留空為待指定）</label>
              <input 
                type="text" 
                class="form-input" 
                style="width:100%;padding:6px 10px;font-size:0.82rem;" 
                 placeholder="搜尋或選擇代導教師"
                list="dl-manual-cover-teachers"
                :value="getTeacherNameByEmail(manualHomeroomForm.actualTeacherEmail)"
                @input="onManualCoverTeacherInput($event.target.value)"
              >
              <datalist id="dl-manual-cover-teachers">
                <option v-for="t in teachersListDetails" :key="'man-opt-'+t.email" :value="t.name + '（' + (t.subject || '教師') + '）'"></option>
              </datalist>
            </div>

            <div class="form-group m-0" >
              <label class="form-label">備註（選填）</label>
              <input type="text" class="form-input" v-model="manualHomeroomForm.note" placeholder="例如：導師無課請假手動補建">
            </div>
          </div>
          <div class="modal-footer" style="margin-top:10px;">
            <button type="button" class="btn btn-secondary" :disabled="homeroomRecordsLoading || loading" @click="$emit('close')">取消</button>
            <button type="button" class="btn btn-primary" :disabled="homeroomRecordsLoading || loading || !manualHomeroomForm.leaveEmail || !manualHomeroomForm.date" @click="saveManualHomeroomRecord">
              {{ homeroomRecordsLoading || loading ? '⏳ 儲存中...' : '💾 建立代導紀錄' }}
            </button>
          </div>
        </div>
      </div>
</template>

<!-- 手動導師代課 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  homeroomRecordsLoading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  loading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  homeroomTeachersList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  teachersListDetails: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  onManualHomeroomLeaveTeacherChange: { type: Function, required: true },
  getTeacherNameByEmail: { type: Function, required: true },
  onManualCoverTeacherInput: { type: Function, required: true },
  saveManualHomeroomRecord: { type: Function, required: true },
});
defineEmits(['close']);
const manualHomeroomForm = defineModel('manualHomeroomForm');
</script>
