<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width: 400px;">
          <div class="modal-header">
            <h3>✏️ 編輯基礎課表課堂</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body">
            <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.85rem; border: 1px solid var(--border-color);">
              <p><strong>授課教師</strong>：{{ scheduleForm.teacherName }}</p>
              <p><strong>授課時段</strong>：星期{{ getWeekDayText(scheduleForm.dayOfWeek) }} {{ formatPeriodText(scheduleForm.period) }}</p>
            </div>
            <div class="form-group">
              <label class="form-label">授課班級</label>
              <input type="text" class="form-input" placeholder="702 或併班 701、702" v-model="scheduleForm.className">
              <span class="text-xs-muted-70">併班可填多班：701、702 或 701/702（本土語、特教／資優抽離等）</span>
            </div>
            <div class="form-group">
              <label class="form-label">授課科目</label>
              <input type="text" class="form-input" placeholder="國文" v-model="scheduleForm.subject">
            </div>
            <div class="form-group">
              <label class="form-label">課程屬性</label>
              <div v-if="scheduleForm._entries && scheduleForm._entries.length >= 1" class="mb-10">
                <span style="font-size:0.82rem;color:var(--text-secondary);display:block;margin-bottom:6px;">
                  {{ scheduleForm._entries.length > 1 ? '此節有多筆資料，請選擇要編輯或清空的項目：' : '此節課堂（可清空為空堂）：' }}
                </span>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button
                    type="button"
                    class="btn btn-sm-14"
                    :class="scheduleForm.id === e.id ? 'btn-primary' : 'btn-secondary'"
                    v-for="e in scheduleForm._entries"
                    :key="e.id"
                     @click="pickScheduleAttr(e.id || e.attr || '一般')"
                  >
                     {{ getScheduleAttrLabel(e) }}：{{ e.className }} {{ e.subject }}
                     （{{ e.activeFrom || '學期起' }}～{{ e.activeTo || '學期迄' }}）
                   </button>
                   <button type="button" class="btn btn-secondary btn-sm-14" @click="pickScheduleAttr('__new__')">＋建立新版本</button>
                </div>
              </div>
               <select class="form-select" v-model="scheduleForm.attr" @change="normalizeScheduleFormFlags">
                 <option value="一般">一般（計鐘點）</option>
                  <option value="代課">代課（小鐘點；未授課扣除）</option>
                 <option value="巡堂">巡堂（不計鐘點、不可調課、可當空堂）</option>
                <option v-if="parseInt(scheduleForm.period, 10) === 8" value="單週">單週（僅第8節課輔）</option>
                <option v-if="parseInt(scheduleForm.period, 10) === 8" value="雙週">雙週（僅第8節課輔）</option>
                <option v-if="parseInt(scheduleForm.period, 10) === 8" value="課輔">課輔（第8節每週）</option>
                 <option value="抽離">抽離（不進班級課表；計週鐘點；可另勾綁課）</option>
               </select>
               <label class="form-label" style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;">
                 <input type="checkbox" class="chk-box-16" v-model="scheduleForm.overtime"
                   :disabled="parseInt(scheduleForm.period, 10) === 8 || scheduleForm.attr === '巡堂' || scheduleForm.attr === '代課'"
                   @change="normalizeScheduleFormFlags">
                 <span>超鐘點（計入超鐘點結算，可與抽離並存）</span>
               </label>
             </div>
            <div class="form-group" style="flex-direction: row; align-items: center; gap: 8px;">
              <input type="checkbox" id="chk-restricted-course" v-model="scheduleForm.restriction" true-value="restricted" false-value="" class="chk-box-16">
              <label for="chk-restricted-course" class="form-label m-0">綁課／特殊課程，調課前跳提醒（抽離課也可勾）</label>
            </div>
            <div class="form-group">
              <label class="form-label">啟用期間（選填）</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <input type="date" class="form-input" v-model="scheduleForm.activeFrom" :min="semesterStartDate || undefined" :max="semesterEndDate || undefined" aria-label="啟用起日">
                <input type="date" class="form-input" v-model="scheduleForm.activeTo" :min="semesterStartDate || undefined" :max="semesterEndDate || undefined" aria-label="啟用迄日">
              </div>
              <span class="text-xs-muted-70">起日／迄日皆空白＝整個學期有效。建立新版本時請填啟用起日，舊版本會保留並自動結束於前一天。</span>
            </div>
          </div>
          <div class="modal-footer" style="flex-direction: column; gap: 8px;">
            <div style="display: flex; gap: 12px; width: 100%;">
              <button class="btn btn-primary flex-1" @click="saveScheduleCell">儲存</button>
              <button class="btn btn-secondary flex-1" @click="$emit('close')">取消</button>
            </div>
              <button 
              v-if="scheduleForm.id || (scheduleForm._entries && scheduleForm._entries.length)"
              class="btn btn-danger" 
              style="width: 100%; background: rgba(239, 68, 68, 0.05); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.1);"
              @click="clearScheduleCell"
            >
              🗑️ 清空此筆課堂{{ scheduleForm._entries && scheduleForm._entries.length > 1 ? '（目前選取）' : '（設為空堂）' }}
            </button>
          </div>
        </div>
      </div>
</template>

<!-- 基礎課表編輯 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  getWeekDayText: { type: Function, required: true },
  formatPeriodText: { type: Function, required: true },
  getScheduleAttrLabel: { type: Function, required: true },
  semesterStartDate: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  semesterEndDate: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  pickScheduleAttr: { type: Function, required: true },
  normalizeScheduleFormFlags: { type: Function, required: true },
  saveScheduleCell: { type: Function, required: true },
  clearScheduleCell: { type: Function, required: true },
});
defineEmits(['close']);
const scheduleForm = defineModel('scheduleForm');
</script>
