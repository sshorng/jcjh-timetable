<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card max-w-440">
          <div class="modal-header">
            <h3>{{ teacherModalMode === 'add' ? '➕ 新增教師帳號' : '✏️ 編輯教師資料' }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
               <label class="form-label">教師 Email（登入帳號）</label>
              <input type="email" class="form-input" placeholder="例如: teacher@school.edu.tw" v-model="teacherForm.email" :disabled="teacherModalMode === 'edit'">
            </div>
            <div class="form-group">
              <label class="form-label">教師姓名</label>
              <input type="text" class="form-input" placeholder="陳大明" v-model="teacherForm.name">
            </div>
            <div class="form-group">
              <label class="form-label">授課科目</label>
              <input type="text" class="form-input" placeholder="國文" v-model="teacherForm.subject">
            </div>
            <div class="form-group">
                <label class="form-label">職務（含「導師」即列入代導費；「兼課」列入兼課教師鐘點；「教支人員＋本土語」依計畫分表；「共聘」使用預設）</label>
              <input type="text" class="form-input" placeholder="例如：七年級導師、行政教師" v-model="teacherForm.jobTitle">
            </div>
             <div class="form-group">
                 <label class="form-label">超鐘點／代課（小鐘點）支出計畫（格式：[簡稱]全稱）</label>
                <template v-if="isExpensePlanSlotConfig(teacherForm.expensePlan)">
                 <div style="padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--surface-muted,#f8fafc);font-size:0.82rem;">
                   {{ getExpensePlanSummary(teacherForm.expensePlan) }}
                   <button v-if="overtimePlanTeacher" type="button" class="btn btn-secondary" style="display:block;margin-top:7px;padding:4px 8px;font-size:0.75rem;" @click="$emit('close'); openOvertimePlanModal(overtimePlanTeacher)">編輯課格來源</button>
                 </div>
               </template>
               <template v-else>
                  <input type="text" class="form-input" list="accounting-plan-options" maxlength="80" placeholder="例如：[公代]公費代課鐘點費；留白＝預設經費" v-model="teacherForm.expensePlan">
                 <datalist id="accounting-plan-options">
                   <option v-for="plan in accountingPlanOptions" :key="'accounting-plan-' + plan" :value="plan"></option>
                 </datalist>
               </template>
                 <span style="font-size:0.72rem;color:var(--text-muted);display:block;margin-top:4px;">畫面與工作表頁籤使用簡稱，Excel 標題使用全稱；超鐘點與代課（小鐘點）會依計畫拆表。</span>
             </div>
            <div class="form-group">
              <label class="form-label">系統角色</label>
              <select class="form-select" v-model="teacherForm.role">
                <option value="teacher">一般教師</option>
                <option value="staff">行政</option>
                <option value="admin">教學組</option>
              </select>
            </div>
             <div class="form-group">
              <label class="form-label">基本授課鐘點（基鐘）</label>
               <input type="number" class="form-input" placeholder="導師為12節、專任為16節" v-model.number="teacherForm.baseHours">
             </div>
             <div class="form-group" style="padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--surface-muted,#f8fafc);">
               <label class="form-label">本學期固定超鐘點設定</label>
               <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                 <input type="number" class="form-input" min="0" max="40" step="1" placeholder="節數" style="max-width:110px;" v-model.number="teacherForm.fixedOvertimeHours">
                 <span style="font-size:0.82rem;">節／週</span>
                 <button type="button" class="btn btn-secondary" style="padding:5px 8px;font-size:0.75rem;" @click="fillFixedOvertimeFromCurrentSchedule">從目前課表帶入</button>
               </div>
               <input type="text" class="form-input" placeholder="例如：一2、三5、五午休" v-model="teacherForm.fixedOvertimeSlots">
               <span style="font-size:0.72rem;color:var(--text-muted);display:block;margin-top:4px;">節數必須與節次數量一致。儲存後固定於本學期，不會因放假、最後完整週或臨時調課改變；留白代表尚未設定。</span>
             </div>
             <div class="form-group">
              <label class="form-label">折抵額度（可用餘額）</label>
              <input type="number" class="form-input" min="0" step="1" placeholder="0" v-model.number="teacherForm.mutualQuota">
              <span style="font-size:0.72rem;color:var(--text-muted);display:block;margin-top:4px;">可用餘額以整數節數計。一般課表釋出 1 節＝1（不含代課小鐘點）；小鐘點未授課依月報另扣。扣額度須滿 1 才扣 1。建議用活動面板「＋發放額度」；手動改會寫入帳本調整列。</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveTeacher">儲存</button>
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 教師新增／編輯 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  teacherModalMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  getExpensePlanSummary: { type: Function, required: true },
  overtimePlanTeacher: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  accountingPlanOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isExpensePlanSlotConfig: { type: Function, required: true },
  openOvertimePlanModal: { type: Function, required: true },
  fillFixedOvertimeFromCurrentSchedule: { type: Function, required: true },
  saveTeacher: { type: Function, required: true },
});
defineEmits(['close']);
const teacherForm = defineModel('teacherForm');
</script>
