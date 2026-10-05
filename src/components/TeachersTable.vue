<template>
  <!-- 後台教師管理表（自 App.vue 抽出；展示型，狀態全由 props 注入） -->
<div v-if="teachersNeedPager" class="tt-pager-bar">
              <span style="font-size:0.8rem;color:var(--text-secondary);">
                顯示 {{ (teachersPage - 1) * teachersPageSize + 1 }}～{{ Math.min(teachersPage * teachersPageSize, teachersListDetails.length) }}
                ／共 {{ teachersListDetails.length }} 位
              </span>
              <select class="form-control" style="width:auto;padding:4px 8px;font-size:0.78rem;" :model-value="teachersPageSize" @update:model-value="$emit('update:teachersPageSize', Number($event))" title="每頁人數">
                <option :value="20">每頁 20 人</option>
                <option :value="50">每頁 50 人</option>
                <option :value="100">每頁 100 人</option>
              </select>
              <button type="button" class="btn btn-secondary btn-sm-75" :disabled="teachersPage <= 1" @click="changeTeachersPage(teachersPage - 1)">上一頁</button>
              <span style="font-size:0.8rem;">{{ teachersPage }} / {{ teachersTotalPages }}</span>
              <button type="button" class="btn btn-secondary btn-sm-75" :disabled="teachersPage >= teachersTotalPages" @click="changeTeachersPage(teachersPage + 1)">下一頁</button>
            </div>
            <div class="table-responsive">
               <table class="custom-table" style="font-size:0.85rem;table-layout:fixed;min-width:1350px;">
                 <colgroup>
                   <col style="width:7%;">
                   <col style="width:7%;">
                   <col style="width:8%;">
                   <col style="width:7%;">
                   <col style="width:10%;">
                   <col style="width:18%;">
                    <col style="width:8%;">
                   <col style="width:8%;">
                    <col style="width:25%;">
                 </colgroup>
                 <thead>
                   <tr>
                     <th style="text-align:left;">姓名</th>
                     <th>科目</th>
                     <th>職務</th>
                     <th>超鐘點計畫</th>
                     <th>基本鐘點（基鐘）</th>
                     <th title="學期固定設定；尚未設定時顯示目前課表推算值">固定超鐘點</th>
                     <th title="可用餘額；點數字可看額度帳本歷程">折抵額度</th>
                     <th>系統角色</th>
                     <th>操作</th>
                   </tr>
                 </thead>
                 <tbody>
                    <tr v-for="t in pagedTeachersListDetails" :key="t.loginEmail || t.email" @dblclick="openEditTeacherModal(t)" class="cursor-pointer" title="點擊兩下快速編輯此教師資料">
                     <td style="vertical-align:middle;word-break:keep-all;"><strong>{{ t.name }}</strong></td>
                     <td style="vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere;">{{ t.subject }}</td>
                     <td style="vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere;">{{ t.jobTitle || '教師' }}</td>
                      <td style="vertical-align:middle;overflow:hidden;" :title="getExpensePlanSummary(t.expensePlan)"><span v-autofit data-autofit-max="13.5" data-autofit-min="9" style="display:block;white-space:nowrap;overflow:hidden;line-height:1.45;">{{ getExpensePlanSummary(t.expensePlan) }}</span></td>
                     <td style="vertical-align:middle;text-align:center;white-space:nowrap;">
                        <!-- 基礎基本鐘點設定 -->
                        <input
                        type="number" 
                        style="padding: 4px 6px; width: 65px; text-align: center; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem; color: var(--text-primary); font-family: var(--font-sans);"
                        v-model.number="t.baseHours"
                        @change="updateTeacherBaseHours(t.loginEmail, t.baseHours)"
                        @click.stop
                        @dblclick.stop
                       > 節
                     </td>
                       <td style="text-align:center;vertical-align:middle;white-space:normal;">
                         <div style="font-weight:700;line-height:1.35;white-space:nowrap;">
                           <strong v-if="t.fixedOvertimeConfigured">{{ t.fixedOvertimeHours }}</strong>
                           <strong v-else style="color:var(--text-muted);">待設定</strong> 節／週
                         </div>
                         <div v-if="t.fixedOvertimeConfigured && t.fixedOvertimeSlotsText" style="display:flex;flex-wrap:wrap;justify-content:center;gap:3px 6px;max-width:155px;margin:5px auto 0;color:var(--text-muted);font-size:0.74rem;line-height:1.35;">
                           <template v-for="slot in (t.fixedOvertimeSlotsText || '').split('、')" :key="(t.loginEmail || t.email) + '-fixed-slot-' + slot">
                             <span v-if="slot" style="white-space:nowrap;">{{ slot }}</span>
                           </template>
                         </div>
                         <small v-else style="display:block;color:var(--text-muted);margin-top:4px;white-space:nowrap;">目前課表推算 {{ getTeacherTimetableHours(t).overtimeHours }} 節</small>
                       </td>
                      <td style="vertical-align:middle;text-align:center;" @click.stop @dblclick.stop>
                        <div style="display:flex;align-items:center;justify-content:center;gap:3px;white-space:nowrap;">
                          <button
                            type="button"
                            class="quota-balance-btn"
                            :class="{ 'has-quota': (t.mutualQuota || 0) > 0 }"
                            :title="'點擊查看 ' + (t.name || '') + ' 的額度歷程'"
                            @click="openQuotaLedger(t)"
                          >{{ t.mutualQuota || 0 }}</button>
                          <button
                            type="button"
                            class="btn btn-secondary"
                            style="min-width:25px;padding:2px 5px;font-size:0.72rem;line-height:1.2;"
                            :title="'手動增加或扣除 ' + (t.name || '') + ' 的額度'"
                            @click="openManualQuotaAdjust(t)"
                          >±</button>
                        </div>
                      </td>
                    <td>
                      <span class="status-badge" :class="t.role === 'admin' ? 'status-pending-teacher' : (t.role === 'staff' ? 'status-pending-admin' : 'status-approved')" style="font-size: 0.75rem; padding: 2px 6px;">
                        {{ t.role === 'admin' ? '教學組' : (t.role === 'staff' ? '行政' : '一般教師') }}
                      </span>
                    </td>
                     <td style="vertical-align:middle;">
                        <div style="display:grid;grid-template-columns:minmax(66px,0.7fr) minmax(0,1.3fr);gap:6px;align-items:center;">
                         <button class="btn btn-secondary" style="width:100%;min-width:0;padding:4px 5px;font-size:0.75rem;white-space:nowrap;" @click.stop="openEditTeacherModal(t)">✏️ 編輯</button>
                          <button class="btn btn-secondary" style="width:100%;min-width:0;padding:4px 5px;font-size:0.75rem;white-space:nowrap;" @click.stop="openOvertimePlanModal(t)">💰 超鐘點／代課來源</button>
                         <button class="btn btn-secondary" style="width:100%;min-width:0;grid-column:1 / 2;padding:4px 5px;font-size:0.75rem;white-space:nowrap;color:var(--color-danger);border-color:rgba(239,68,68,0.1);" @click.stop="deleteTeacher(t.loginEmail, t.name)">🗑️ 刪除</button>
                       </div>
                     </td>
                  </tr>
                </tbody>
              </table>
            </div></template>

<script setup>
defineProps({
  pagedTeachersListDetails: { type: [Array, Number, Boolean, Object], default: undefined },
  teachersListDetails: { type: [Array, Number, Boolean, Object], default: undefined },
  teachersNeedPager: { type: [Array, Number, Boolean, Object], default: undefined },
  teachersPage: { type: [Array, Number, Boolean, Object], default: undefined },
  teachersPageSize: { type: [Array, Number, Boolean, Object], default: undefined },
  teachersTotalPages: { type: [Array, Number, Boolean, Object], default: undefined },
  changeTeachersPage: { type: Function, required: true },
  deleteTeacher: { type: Function, required: true },
  getExpensePlanSummary: { type: Function, required: true },
  getTeacherTimetableHours: { type: Function, required: true },
  openEditTeacherModal: { type: Function, required: true },
  openManualQuotaAdjust: { type: Function, required: true },
  openOvertimePlanModal: { type: Function, required: true },
  openQuotaLedger: { type: Function, required: true },
  updateTeacherBaseHours: { type: Function, required: true },
});
defineEmits(['update:teachersPageSize']);
</script>
