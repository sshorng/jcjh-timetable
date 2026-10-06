<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width: 460px;">
          <div class="modal-header">
             <h3>🔍 {{ detailRequest && detailRequest.type === 'triangle' ? '三角調詳情簽核狀態' : '調代課異動詳情簽核狀態' }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body p-20">
            <div v-if="detailRequest" style="display: flex; flex-direction: column; gap: 14px;">
              
              <!-- 狀態與單號 -->
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                <div>
                  <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">異動單號</span>
                  <strong style="font-size: 1rem; color: var(--text-primary);">{{ detailRequest.serial || '---' }}</strong>
                </div>
                <span class="status-badge" :class="'status-' + (detailRequest.status ? detailRequest.status.toLowerCase() : 'approved')">
                  {{ getStatusText(detailRequest.status || 'approved') }}
                </span>
              </div>

              <!-- 異動明細 -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                 <div>
                   <span class="text-muted-block">請假教師（申請）</span>
                   <strong>{{ detailRequest.requesterName }}</strong>
                 </div>
                 <div>
                   <span class="text-muted-block">{{ detailRequest.specialFlow === 'combined_return' ? '特殊流程' : '代課/受邀教師' }}</span>
                    <strong>{{ detailRequest.specialFlow === 'combined_return' ? '併班上課' : detailRequest.targetTeacherName }}</strong>
                </div>
                <div style="grid-column: span 2;">
                  <span class="text-muted-block">異動課堂</span>
                  <strong>{{ formatDateMMDD(detailRequest.requestDate) }}({{ getWeekDayText(detailRequest.requestPeriodDay || new Date(detailRequest.requestDate.replace(/-/g, '/')).getDay()) }}) 第{{ detailRequest.requestPeriod }}節 {{ getOriginalRequestClass(detailRequest) }}{{ getOriginalRequestSubject(detailRequest) }}</strong>
                </div>
                 <div v-if="detailRequest.type === 'exchange' || detailRequest.type === '對調'" style="grid-column: span 2; border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 4px;">
                  <span class="text-muted-block">對調課堂</span>
                  <strong class="text-primary-strong">{{ formatDateMMDD(detailRequest.targetDate) }}({{ getWeekDayText(detailRequest.targetDayOfWeek) }}) 第{{ detailRequest.targetPeriod }}節 {{ getOriginalTargetClass(detailRequest) }}{{ getOriginalTargetSubject(detailRequest) }}</strong>
                </div>
                <div v-if="detailRequest.type !== 'exchange' && detailRequest.type !== '對調' && detailRequest.type !== 'triangle'">
                 <span class="text-muted-block">代課經費</span>
                  <strong class="text-success">{{ detailRequest.specialFlow === 'combined_return' ? ('併班教師不支領；被代教師依假別扣減（' + (detailRequest.subFee || '待判定') + '）') : (detailRequest.subFee || '自費代課') }}</strong>
               </div>

                  <div v-if="detailRequest && detailRequest.type === 'triangle'" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;font-size:0.8rem;line-height:1.5;">
                  <div style="font-weight:700;color:#1d4ed8;margin-bottom:8px;">三角調整組 {{ detailRequest.triangleId || detailRequest.batchId || '未提供' }}</div>
                  <div v-for="row in getTriangleGroupRequests(detailRequest)" :key="'detail-tri-' + row.id" style="padding:8px 0;border-top:1px solid #dbeafe;">
                   <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                     <strong>第{{ row.triangleLegIndex || '未提供' }}腳：{{ row.requesterName }} → {{ row.targetTeacherName }}</strong>
                      <span class="status-badge tag-gray">{{ row.triangleConsentStatus === 'paper_agreed' ? '紙本已確認' : (row.triangleConsentStatus === 'paper_pending' ? '待紙本簽名' : (row.triangleConsentStatus === 'agree' ? '已同意' : (row.triangleConsentStatus === 'decline' ? '已拒絕' : '待同意'))) }}</span>
                   </div>
                   <div style="color:var(--text-secondary);margin-top:3px;">{{ formatLeaveClassSlot(row) }} → {{ formatExchangeClassSlot(row) }}</div>
                 </div>
                   <div style="margin-top:8px;color:#1e3a8a;">{{ isPaperFlowRequest(detailRequest) ? '紙本模式：請確認三位教師都已在調課單簽名，再由教學組核審；系統不進行線上簽核。' : '線上模式：三方全部同意後才會送教學組核准；任一人拒絕或撤回，整組不生效。' }}</div>
               </div>
                <div>
                  <span class="text-muted-block">假別事由</span>
                  <strong>{{ detailRequest.reason || '請假' }}</strong>
                </div>
              </div>

              <!-- 備註 -->
              <div v-if="detailRequest.note" style="font-size: 0.8rem; border-left: 3px solid var(--color-danger); padding-left: 8px; color: var(--text-primary); margin-top: 4px;">
                <strong>行政備註：</strong>{{ detailRequest.note }}
              </div>

              <!-- 簽核進度（調代課資訊下方） -->
              <div class="req-progress-panel" :class="{ 'is-failed': getRequestProgressSteps(detailRequest).failed }">
                <div class="req-progress-panel-title">簽核進度</div>
                <div class="req-progress req-progress-lg">
                  <div
                    v-for="(st, si) in getRequestProgressSteps(detailRequest).steps"
                    :key="'d'+st.key"
                    class="req-progress-step"
                    :class="{ done: st.done, current: st.current, fail: st.fail }"
                  >
                    <span class="req-progress-dot"></span>
                    <span class="req-progress-label">{{ st.label }}</span>
                    <span v-if="st.done && st.at" class="req-progress-time">{{ st.at }}</span>
                    <span v-if="si < getRequestProgressSteps(detailRequest).steps.length - 1" class="req-progress-line"></span>
                  </div>
                </div>
                <p class="req-progress-summary">{{ getRequestProgressSteps(detailRequest).summary }}</p>
                <p v-if="getRequestProgressSteps(detailRequest).overdue" class="req-progress-overdue">⚠ {{ getRequestProgressSteps(detailRequest).overdueHint }}</p>
              </div>

            </div>
          </div>
          <div class="modal-footer" style="padding: 12px 20px; justify-content: flex-end; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
              <!-- 已核准案件的行事曆與列印按鈕（非審核中） -->
              <template v-if="detailRequest && (detailRequest.status === 'approved' || !detailRequest.status)">
                <button
                  type="button"
                  class="btn btn-secondary"
                  style="padding: 6px 10px; font-size: 0.8rem; margin: 0; display: inline-flex; align-items: center; gap: 4px; border-color: #cbd5e1; background: #fff;"
                  title="依您的角色標記「不用上」或「代課／調入」"
                  @click="addEventToCalendar(detailRequest)"
                >
                   📅 日曆
                </button>
                <button
                  class="btn btn-primary"
                  style="padding: 6px 10px; font-size: 0.8rem; margin: 0; display: inline-flex; align-items: center; gap: 4px;"
                  title="依學校原版格式列印代（調、補）課單"
                  @click="printSingleRequest(detailRequest, 'Notice')"
                >
                   🖨️ 列印
                </button>
              </template>
                <!-- 進行中申請單 (Pending) 的快速簽核操作按鈕組 -->
              <template v-if="detailRequest && (detailRequest.status === 'pending_teacher' || detailRequest.status === 'pending_admin')">
                <button
                  type="button"
                  class="btn btn-primary btn-inline-flex"
                  @click="openPaperPrintForRequest(detailRequest)"
                >🖨️ 列印</button>
                <button
                  v-if="isAdmin || (user && detailRequest.requesterName && detailRequest.requesterName.toLowerCase() === getTeacherNameByEmail(user.email).toLowerCase())"
                  type="button"
                  class="btn btn-success btn-inline-flex"
                  title="開啟可編輯的 LINE 訊息"
                  @click="copyLineMessageForRequest(detailRequest)"
                >💬 傳訊</button>
                <!-- 受邀教師線上回簽同意/拒絕 -->
                 <template v-if="detailRequest.status === 'pending_teacher' && user && detailRequest.targetTeacherName && detailRequest.targetTeacherName.toLowerCase() === getTeacherNameByEmail(user.email).toLowerCase()">
                  <button
                     v-if="detailRequest.batchId && detailRequest.type !== 'triangle'"
                    class="btn btn-success"
                    style="padding: 6px 12px; font-size: 0.8rem; margin: 0; display: inline-flex; align-items: center; background:#047857;"
                    @click="respondToBatch(detailRequest.batchId, 'agree'); $emit('close');"
                  >
                     ✔️ 全同
                  </button>
                  <button 
                    class="btn btn-success btn-inline-flex"
                    @click="respondToRequest(detailRequest.id, 'agree'); $emit('close');"
                  >
                     ✔️ 同意
                  </button>
                  <button 
                    class="btn btn-danger btn-danger-inline"
                    @click="respondToRequest(detailRequest.id, 'decline'); $emit('close');"
                  >
                     ❌ 拒絕
                  </button>
                  <button
                     v-if="detailRequest.batchId && detailRequest.type !== 'triangle'"
                    class="btn btn-secondary"
                    style="padding: 6px 12px; font-size: 0.8rem; margin: 0; color: var(--color-danger);"
                    @click="respondToBatch(detailRequest.batchId, 'decline'); $emit('close');"
                  >
                     全拒
                  </button>
                </template>
                
                <!-- 申請人本人線上撤回 -->
                 <template v-if="detailRequest.status === 'pending_teacher' && user && detailRequest.requesterName && detailRequest.requesterName.toLowerCase() === getTeacherNameByEmail(user.email).toLowerCase()">
                  <button 
                    class="btn btn-warning" 
                    style="padding: 6px 12px; font-size: 0.8rem; margin: 0; background: #f59e0b; color: white; display: inline-flex; align-items: center;"
                    @click="cancelRequest(detailRequest.id); $emit('close');"
                  >
                     ↩️ 撤回
                  </button>
                </template>
                
                <!-- 行政管理員核准／駁回；紙本流程不寄通知信 -->
                <template v-if="detailRequest.status === 'pending_admin' && isAdmin">
                  <button 
                    class="btn btn-success btn-inline-flex"
                    @click="adminApprove(detailRequest.id); $emit('close');"
                  >
                      ⚡ 核准
                  </button>
                  <button 
                    class="btn btn-danger btn-danger-inline"
                    @click="adminReject(detailRequest.id); $emit('close');"
                  >
                    🚫 駁回
                  </button>
                </template>
                
                <!-- 行政管理員對 pending_teacher 單子直接撤銷 -->
                <template v-if="detailRequest.status === 'pending_teacher' && isAdmin">
                  <button 
                    class="btn btn-danger btn-danger-inline"
                    @click="cancelRequest(detailRequest.id); $emit('close');"
                  >
                      🗑️ 撤銷
                  </button>
                </template>
              </template>

              <!-- 只有管理員可以進行快速撤銷 (已核准生效的異動) -->
              <button 
                v-if="isAdmin && detailSubRecord && detailRequest.id !== 'N/A'"
                class="btn btn-danger" 
                style="padding: 6px 12px; font-size: 0.8rem; margin: 0; background: var(--color-danger); color: white;"
                @click="deleteSubstitutionRecord(detailSubRecord.id, detailRequest.id); $emit('close');"
              >
                 🗑️ 撤銷
              </button>
              
              <!-- 二次轉移/再次調代課 -->
               <button v-if="detailSubRecord && detailRequest.specialFlow !== 'combined_return' && canStartSecondSubFromDetail"
                class="btn btn-success" 
                style="padding: 6px 12px; font-size: 0.8rem; margin: 0;"
                @click="startSecondSub"
              >
                 🔄 再辦
              </button>

              <!-- 調開／被代後：原課老師該節已空，可另排空堂任務 -->
              <button
                 v-if="isAdmin && detailSubRecord && detailRequest.specialFlow !== 'combined_return' && detailSubRecord.originalTeacherName"
                class="btn btn-primary"
                style="padding: 6px 12px; font-size: 0.8rem; margin: 0;"
                type="button"
                @click="openEmptySlotFromDetail"
              >
                 📌 排班
              </button>
            </div>
          </div>
        </div>
      </div>
</template>

<!-- 調代課異動詳情 modal（自 App.vue 抽出；展示＋操作委派，狀態全由 props 注入） -->
<script setup>
defineProps({
  detailRequest: { type: Object, default: null },
  detailSubRecord: { type: Object, default: null },
  user: { type: Object, default: null },
  isAdmin: { type: Boolean, default: false },
  canStartSecondSubFromDetail: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  getStatusText: { type: Function, required: true },
  formatDateMMDD: { type: Function, required: true },
  getWeekDayText: { type: Function, required: true },
  getOriginalRequestClass: { type: Function, required: true },
  getOriginalRequestSubject: { type: Function, required: true },
  getOriginalTargetClass: { type: Function, required: true },
  getOriginalTargetSubject: { type: Function, required: true },
  getTriangleGroupRequests: { type: Function, required: true },
  formatLeaveClassSlot: { type: Function, required: true },
  formatExchangeClassSlot: { type: Function, required: true },
  isPaperFlowRequest: { type: Function, required: true },
  getRequestProgressSteps: { type: Function, required: true },
  getTeacherNameByEmail: { type: Function, required: true },
  addEventToCalendar: { type: Function, required: true },
  printSingleRequest: { type: Function, required: true },
  openPaperPrintForRequest: { type: Function, required: true },
  copyLineMessageForRequest: { type: Function, required: true },
  respondToBatch: { type: Function, required: true },
  respondToRequest: { type: Function, required: true },
  cancelRequest: { type: Function, required: true },
  adminApprove: { type: Function, required: true },
  adminReject: { type: Function, required: true },
  deleteSubstitutionRecord: { type: Function, required: true },
  startSecondSub: { type: Function, required: true },
  openEmptySlotFromDetail: { type: Function, required: true },
});
defineEmits(['close']);
</script>
