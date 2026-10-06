<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width: 560px;">
          <div class="modal-header">
            <h3>📝 編輯調代課紀錄</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow:auto;">
            <div class="text-xs-muted-78">
               單號：<strong>{{ historyEditForm.serial || '未提供' }}</strong>
                         · 類型：{{ historyEditForm.specialFlow === 'combined_return' ? '併班上課' : (historyEditForm.type === 'exchange' || historyEditForm.type === '對調' ? '調課' : '代課') }}
             </div>
            <div class="form-group">
              <label class="form-label">類型</label>
               <div v-if="historyEditForm.specialFlow === 'combined_return'" class="form-input" style="background:#f8fafc;color:#0f766e;">代課（併班上課）</div>
              <select v-else class="form-select" v-model="historyEditForm.type" @change="onHistoryEditTypeChange">
                <option value="substitution">代課</option>
                <option value="exchange">調課</option>
              </select>
            </div>
            <div class="grid-2-10">
              <div class="form-group m-0">
                <label class="form-label">請假教師</label>
                <select class="form-select" v-model="historyEditForm.requesterEmail">
                  <option value="" disabled>請選擇...</option>
                   <option v-for="t in teachersList" :key="'he-leave-'+t.email" :value="t.email">{{ t.name }}（{{ t.subject || '無' }}）</option>
                </select>
              </div>
              <div v-if="historyEditForm.specialFlow !== 'combined_return'" class="form-group m-0">
                <label class="form-label">{{ historyEditForm.type === 'exchange' || historyEditForm.type === '對調' ? '對調教師' : '代課教師' }}</label>
                <select class="form-select" v-model="historyEditForm.targetTeacherEmail">
                  <option value="" disabled>請選擇...</option>
                   <option v-for="t in teachersList" :key="'he-sub-'+t.email" :value="t.email">{{ t.name }}（{{ t.subject || '無' }}）</option>
                </select>
              </div>
               <div v-else class="form-group m-0">
                  <label class="form-label">併班教師</label>
                 <select class="form-select" v-model="historyEditForm.targetTeacherEmail">
                   <option value="" disabled>請選擇同節併班代課教師...</option>
                   <option v-for="t in teachersList" :key="'he-combined-sub-'+t.email" :value="t.email">{{ t.name }}（{{ t.subject || '無' }}）</option>
                 </select>
               </div>
            </div>
            <div class="grid-2-10">
              <div class="form-group m-0">
                <label class="form-label">班級</label>
                <input type="text" class="form-input" v-model="historyEditForm.className" list="he-class-list" placeholder="如 701">
                <datalist id="he-class-list">
                  <option v-for="c in classList" :key="'he-cls-'+c" :value="c"></option>
                </datalist>
              </div>
              <div class="form-group m-0">
                <label class="form-label">科目</label>
                <input type="text" class="form-input" v-model="historyEditForm.subject" placeholder="如 國文">
              </div>
            </div>
            <div class="text-sm-sec-mt">請假課堂</div>
            <div class="grid-12-08-10">
              <div class="form-group m-0">
                <label class="form-label">日期</label>
                <input type="date" class="form-input" v-model="historyEditForm.requestDate" @change="onHistoryEditDateChange('request')">
              </div>
              <div class="form-group m-0">
                <label class="form-label">節次</label>
                <select class="form-select" v-model.number="historyEditForm.requestPeriod" @change="onHistoryEditPeriodChange">
                  <option v-for="p in timetablePeriods" :key="'he-rp-'+p" :value="p">{{ formatPeriodText(p) }}</option>
                </select>
              </div>
            </div>
            <template v-if="historyEditForm.type === 'exchange' || historyEditForm.type === '對調'">
              <div class="text-sm-sec-mt">對調課堂</div>
              <div class="grid-12-08-10">
                <div class="form-group m-0">
                  <label class="form-label">日期</label>
                  <input type="date" class="form-input" v-model="historyEditForm.targetDate" @change="onHistoryEditDateChange('target')">
                </div>
                <div class="form-group m-0">
                  <label class="form-label">節次</label>
                  <select class="form-select" v-model.number="historyEditForm.targetPeriod">
                    <option v-for="p in timetablePeriods" :key="'he-tp-'+p" :value="p">{{ formatPeriodText(p) }}</option>
                  </select>
                </div>
              </div>
            </template>
            <div class="form-group m-0">
              <label class="form-label">原因 / 假別</label>
               <select class="form-select" v-model="historyEditForm.reason" @change="onHistoryEditReasonChange">
                 <option value="" disabled>請選擇假別...</option>
                 <option v-if="(historyEditForm.type === 'substitution' || historyEditForm.type === 'exchange' || historyEditForm.type === '對調') && historyEditForm.specialFlow !== 'combined_return'" value="課務調整">課務調整（無請假）</option>
                  <option v-for="r in leaveReasonOptions" :key="'he-r-'+r" :value="r">{{ r }}</option>
               </select>
            </div>
            <div class="form-group m-0" v-if="historyEditForm.type !== 'exchange' && historyEditForm.type !== '對調' && historyEditForm.specialFlow !== 'combined_return'">
              <label class="form-label">請假時間（代課清冊）</label>
              <div style="display:flex;gap:8px;align-items:center;">
                <select class="form-select" style="width:110px;" v-model="historyEditForm.leaveTimeType">
                  <option value="">未填</option>
                  <option value="全天">全天</option>
                  <option value="上午">上午</option>
                  <option value="下午">下午</option>
                  <option value="自訂">自訂</option>
                </select>
                <input type="text" class="form-input" placeholder="如 08:00~16:00" v-model="historyEditForm.leaveTime">
                <small v-if="historyEditForm.courseAdjustmentOnly" style="color:var(--text-muted);">課務調整不建立請假或代導鐘點費。</small>
              </div>
            </div>
             <div class="form-group m-0" v-if="historyEditForm.type !== 'exchange' && historyEditForm.type !== '對調'">
               <label class="form-label">{{ historyEditForm.specialFlow === 'combined_return' ? '被代教師扣減類別' : '經費類別' }}</label>
               <div v-if="historyEditForm.specialFlow === 'combined_return'" class="form-input" style="background:#f8fafc;color:#0f766e;">
                 {{ historyEditForm.subFee || '請先選擇假別' }}（依假別自動帶入）
               </div>
               <select v-else class="form-select" v-model="historyEditForm.subFee">
                  <option value="自費代課">自費代課</option>
                  <option value="公費代課">公費代課</option>
                  <option :value="TIMETABLE_ONLY_FEE">僅課表呈現（不結算）</option>
                  <option v-if="historyEditForm.subFee === '僅課表呈現'" value="僅課表呈現">僅課表呈現（舊）</option>
                  <option value="扣額度">扣額度</option>
                 <option value="活動公費">活動公費</option>
                 <option value="第8節代課">第8節代課</option>
                 <option value="無">無</option>
                 <option v-if="historyEditForm.subFee === '互代不結'" value="互代不結">互代不結（舊）</option>
                 <option v-if="historyEditForm.subFee === '學校移撥'" value="學校移撥">學校移撥（舊）</option>
               </select>
             </div>
            <div class="form-group m-0">
              <label class="form-label">備註</label>
              <input type="text" class="form-input" v-model="historyEditForm.note">
            </div>
            <div class="form-group" style="flex-direction: row; align-items: center; gap: 8px; margin:0;">
              <input type="checkbox" id="chk-printed" v-model="historyEditForm.printed" class="chk-box-16">
              <label for="chk-printed" class="form-label m-0">標記為已列印</label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveHistoryEdit">💾 儲存</button>
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 歷史異動編輯 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  teachersList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  timetablePeriods: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  leaveReasonOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  TIMETABLE_ONLY_FEE: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  onHistoryEditDateChange: { type: Function, required: true },
  formatPeriodText: { type: Function, required: true },
  onHistoryEditTypeChange: { type: Function, required: true },
  onHistoryEditPeriodChange: { type: Function, required: true },
  onHistoryEditReasonChange: { type: Function, required: true },
  saveHistoryEdit: { type: Function, required: true },
});
defineEmits(['close']);
const historyEditForm = defineModel('historyEditForm');
</script>
