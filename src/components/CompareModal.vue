<template>
      <div class="modal-overlay" data-tour="compare-modal" @click.self="closeCompareModal">
        <div class="modal-card" data-tour="compare-card">
          <div class="modal-header">
            <h3>{{ pendingRequestData.isBatchCandidatePreview ? '👁️ 批次候選課表預覽' : '📉 調代課模擬對照與防呆核對' }}</h3>
            <button class="btn-close" @click="closeCompareModal">&times;</button>
          </div>

          <div class="modal-body" data-tour="compare-body">
            <div v-if="pendingRequestData.isBatchCandidatePreview" style="margin-bottom:12px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1e40af;font-size:0.8rem;line-height:1.5;">
              唯讀預覽：檢視目前選取課堂與候選教師的課表，不會指定、送出或更動批次內容。
            </div>
            <!-- 衝堂警告橫幅 -->
            <div v-if="hasSubTeacherConflict" style="background:#fee2e2; border:1.5px solid #ef4444; border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; align-items:center; gap:8px; font-size:0.85rem; color:#991b1b; font-weight:600;">
              <template v-if="pendingRequestData.isPerSlot">
                ⚠️ 衝堂警告：部分代課老師在指定節次已有課（紅色格），請切換右側受邀人檢視。
              </template>
              <template v-else>
                ⚠️ 衝堂警告：{{ getTeacherNameByEmail(pendingRequestData.subTeacher) }} 老師在此節次已有課（紅色格），無法正常代課！
              </template>
                <span v-if="isAdmin || (isProxySubmitActive && pendingRequestData.leaveTeacher && user && String(pendingRequestData.leaveTeacher).toLowerCase() !== String(getTeacherNameByEmail(user.email) || '').toLowerCase())" style="font-weight:400; color:#b91c1c;">（可強制送出）</span>
            </div>

            <!-- 行政代申請提示／教學組直接核准 -->
            <div
              v-if="isProxySubmitActive && pendingRequestData.leaveTeacher && user && String(pendingRequestData.leaveTeacher).toLowerCase() !== String(getTeacherNameByEmail(user.email) || '').toLowerCase() && !pendingRequestData.isBatchCandidatePreview"
              class="direct-approve-box"
              style="border-color:#f59e0b;background:#fffbeb;"
            >
              <div class="direct-approve-title" style="color:#b45309;">📋 行政代申請</div>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px;">
                請假老師：{{ getTeacherNameByEmail(pendingRequestData.leaveTeacher) || pendingRequestData.leaveTeacher }}；
                送出後<strong>跳過受邀確認</strong>，直接進入「待教學組核准」。
              </div>
            </div>
               <div v-if="isAdmin && !notificationsSuppressed && pendingRequestData.specialFlow !== 'combined_return' && !pendingRequestData.isBatchCandidatePreview && !(isProxySubmitActive && pendingRequestData.leaveTeacher && user && String(pendingRequestData.leaveTeacher).toLowerCase() !== String(getTeacherNameByEmail(user.email) || '').toLowerCase())" class="direct-approve-box">
              <label class="direct-approve-row">
                <input type="checkbox" class="direct-approve-check" v-model="directApproveMode">
                <span class="direct-approve-text">
                  <div class="direct-approve-title">⚡ 教學組直接核准</div>
                  <div class="direct-approve-desc">勾選後送出即生效並更新課表；未勾選則需對方同意後再送行政審核。<span v-if="notificationsSuppressed">紙本模式下不寄送通知信。</span></div>
                </span>
              </label>
              <label v-if="directApproveMode" class="direct-approve-sub">
                <input type="checkbox" class="direct-approve-check-sm" v-model="directApproveSkipNotify">
                <span>不寄通知信（稍後可用 LINE／批次通知）</span>
              </label>
            </div>

            <div v-if="pendingRequestData.specialFlow === 'combined_return'" style="margin-bottom:12px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">
               <label class="form-label" style="margin-bottom:6px;color:#9a3412;">併班教師</label>
              <select class="form-select" v-model="pendingRequestData.subTeacher">
                <option value="" disabled>請選擇同節併班代課教師...</option>
                <option v-for="candidate in (pendingRequestData.combinedReturnCandidates || [])" :key="'cr-candidate-' + candidate.email" :value="candidate.email">
                  {{ candidate.name }}（{{ candidate.className || '併班課' }}{{ candidate.subject ? '／' + candidate.subject : '' }}）
                </option>
              </select>
               <div style="margin-top:6px;font-size:0.75rem;color:#7c2d12;">請假教師：{{ getTeacherNameByEmail(pendingRequestData.leaveTeacher) }}；核准後由所選併班教師上課，不支領代課費。</div>
            </div>

            <!-- 課表模擬對比（手機可收合） -->
             <details class="compare-grids-details" open>
               <summary class="compare-grids-summary">📅 雙方課表對照（點可收合）</summary>
               <div v-if="pendingRequestData.isBatch && pendingRequestData.mode !== 'exchange' && batchCompareWeekTotal > 1" class="batch-compare-week-nav" role="group" aria-label="批次模擬週次切換">
                <button type="button" class="batch-compare-week-nav-btn" :disabled="batchCompareWeekIndex <= 0" @click="shiftBatchCompareWeek(-1)">‹ 上一週</button>
                <div class="batch-compare-week-nav-main">
                  <strong>批次模擬第 {{ batchCompareWeekIndex + 1 }}／{{ batchCompareWeekTotal }} 週</strong>
                  <span>{{ formatDateMMDD(compareWeekDatesA[0]) }}～{{ formatDateMMDD(compareWeekDatesA[4]) }} · 本週 {{ batchCompareWeekSlotCount }} 節</span>
                </div>
                <button type="button" class="batch-compare-week-nav-btn" :disabled="batchCompareWeekIndex >= batchCompareWeekTotal - 1" @click="shiftBatchCompareWeek(1)">下一週 ›</button>
              </div>
              <div v-if="pendingRequestData.isExchangeBatch" class="batch-exchange-preview-switch">
                <strong>選擇要預覽的配對組別</strong>
                <div class="batch-exchange-preview-options" role="group" aria-label="批次調課組別課表預覽">
                  <button
                    v-for="(s, index) in pendingRequestData.batchSlots"
                    :key="'batch-exchange-preview-pick-' + s.key"
                    type="button"
                    class="batch-exchange-preview-option"
                    :class="{ 'is-active': batchExchangePreviewSlotKey === s.key || (!batchExchangePreviewSlotKey && index === 0) }"
                    @click="setBatchExchangePreviewSlot(s.key)"
                  >{{ index + 1 }}. {{ s.teacherName }} ↔ {{ s.subTeacherName || getTeacherNameByEmail(s.subTeacherEmail) }}</button>
                </div>
                <div class="batch-exchange-preview-hint">切換組別檢視調出教師與對調教師的週課表；跨週組別可分別切換來源週與目標週。</div>
              </div>
              <template v-if="isCrossWeekExchange">
               <div class="exchange-cross-week-summary">
                 <strong>跨週調課</strong>
                 <span>{{ getExchangeEndpointText('source') }}</span>
                 <span class="exchange-summary-arrow">↔</span>
                 <span>{{ getExchangeEndpointText('target') }}</span>
               </div>
               <div class="mini-schedule-container exchange-two-table-panels" data-tour="compare-grids" style="margin-bottom: 16px; margin-top: 10px;">
                 <div class="exchange-teacher-panel">
                   <div class="mini-grid-title">👤 <strong>{{ getTeacherNameByEmail(pendingRequestData.leaveTeacher) }}</strong> 老師課表 <span class="exchange-panel-role">（申請人）</span></div>
                   <div class="exchange-week-switch" role="group" aria-label="申請人課表週次">
                     <button type="button" class="exchange-week-switch-btn" :class="{ 'is-active': compareWeekSelectionA === 'source' }" @click="setCompareWeekSelection('A', 'source')">調出週 {{ formatDateMMDD(compareWeekDatesA[0]) }}～{{ formatDateMMDD(compareWeekDatesA[4]) }}</button>
                     <button type="button" class="exchange-week-switch-btn" :class="{ 'is-active': compareWeekSelectionA === 'target' }" @click="setCompareWeekSelection('A', 'target')">調入週 {{ formatDateMMDD(compareWeekDatesB[0]) }}～{{ formatDateMMDD(compareWeekDatesB[4]) }}</button>
                   </div>
                   <div class="exchange-week-status" :class="compareWeekSelectionA === 'source' ? 'is-out' : 'is-in'">
                     {{ compareWeekSelectionA === 'source' ? '目前顯示：原課調出' : '目前顯示：換入課堂' }}
                   </div>
                   <div class="mini-grid exchange-week-grid">
                     <div class="mini-grid-cell mini-grid-header">節</div>
                     <div v-for="d in 5" :key="'exchange-a-head-'+d" class="mini-grid-cell mini-grid-header">{{ ['一','二','三','四','五'][d-1] }}<span class="mini-grid-date">{{ formatDateMMDD(compareDisplayDatesA[d-1]) }}</span></div>
                     <template v-for="p in timetablePeriods" :key="'exchange-a-'+p">
                       <div class="mini-grid-cell mini-grid-period">{{ getPeriodLabel(p) }}</div>
                       <div v-for="d in 5" :key="'exchange-a-'+p+'-'+d" class="mini-grid-cell" :class="getCompareCellClass('A', d, p, compareWeekSelectionA)">
                         {{ getCompareCellText('A', d, p, compareWeekSelectionA) }}
                       </div>
                     </template>
                   </div>
                   <div v-if="compareWeekSelectionA === 'target' && consecAlertsA && consecAlertsA.length" class="hint-amber-box">
                     連堂警示：{{ consecAlertsA.join('、') }}
                   </div>
                 </div>
                 <div class="exchange-teacher-panel">
                   <div class="mini-grid-title">👤 <strong>{{ getTeacherNameByEmail(resolveCompareBEmail()) || '（尚未指定）' }}</strong> 老師課表 <span class="exchange-panel-role">（被申請人）</span></div>
                   <div class="exchange-week-switch" role="group" aria-label="被申請人課表週次">
                     <button type="button" class="exchange-week-switch-btn" :class="{ 'is-active': compareWeekSelectionB === 'source' }" @click="setCompareWeekSelection('B', 'source')">調入週 {{ formatDateMMDD(compareWeekDatesA[0]) }}～{{ formatDateMMDD(compareWeekDatesA[4]) }}</button>
                     <button type="button" class="exchange-week-switch-btn" :class="{ 'is-active': compareWeekSelectionB === 'target' }" @click="setCompareWeekSelection('B', 'target')">調出週 {{ formatDateMMDD(compareWeekDatesB[0]) }}～{{ formatDateMMDD(compareWeekDatesB[4]) }}</button>
                   </div>
                   <div class="exchange-week-status" :class="compareWeekSelectionB === 'source' ? 'is-in' : 'is-out'">
                     {{ compareWeekSelectionB === 'source' ? '目前顯示：換入課堂' : '目前顯示：原課調出' }}
                   </div>
                   <div class="mini-grid exchange-week-grid">
                     <div class="mini-grid-cell mini-grid-header">節</div>
                     <div v-for="d in 5" :key="'exchange-b-head-'+d" class="mini-grid-cell mini-grid-header">{{ ['一','二','三','四','五'][d-1] }}<span class="mini-grid-date">{{ formatDateMMDD(compareDisplayDatesB[d-1]) }}</span></div>
                     <template v-for="p in timetablePeriods" :key="'exchange-b-'+p">
                       <div class="mini-grid-cell mini-grid-period">{{ getPeriodLabel(p) }}</div>
                       <div v-for="d in 5" :key="'exchange-b-'+p+'-'+d" class="mini-grid-cell" :class="getCompareCellClass('B', d, p, compareWeekSelectionB)">
                         {{ getCompareCellText('B', d, p, compareWeekSelectionB) }}
                       </div>
                     </template>
                   </div>
                   <div v-if="compareWeekSelectionB === 'source' && consecAlertsB && consecAlertsB.length" class="hint-amber-box">
                     連堂警示：{{ consecAlertsB.join('、') }}
                   </div>
                 </div>
               </div>
             </template>
             <template v-else>
             <div class="mini-schedule-container" data-tour="compare-grids" style="margin-bottom: 16px; margin-top: 10px;">
              <!-- 左：申請教師當週課表 (A) -->
              <div>
                <div class="mini-grid-title">
                    👤 <strong>{{ getTeacherNameByEmail(pendingRequestData.leaveTeacher) }}</strong> 老師課表（請假／申請人<span v-if="!pendingRequestData.isBatch">，{{ formatDateMMDD(compareWeekDatesA[0]) }}～{{ formatDateMMDD(compareWeekDatesA[4]) }}</span>）
                </div>
                <div class="mini-grid">
                  <div class="mini-grid-cell mini-grid-header">節</div>
                    <div class="mini-grid-cell mini-grid-header">一<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesA[0]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">二<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesA[1]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">三<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesA[2]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">四<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesA[3]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">五<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesA[4]) }}</span></div>
                  
                  <template v-for="p in timetablePeriods" :key="'A-'+p">
                    <div class="mini-grid-cell mini-grid-period">{{ getPeriodLabel(p) }}</div>
                    <div 
                      v-for="d in 5" 
                      :key="'A-'+p+'-'+d"
                      class="mini-grid-cell"
                      :class="getCompareCellClass('A', d, p)"
                    >
                      {{ getCompareCellText('A', d, p) }}
                    </div>
                  </template>
                </div>
                <!-- A師連堂警告 -->
                <div v-if="consecAlertsA && consecAlertsA.length" class="hint-amber-box">
                  ⚠️ 連堂警示：{{ consecAlertsA.join('、') }}
                </div>
              </div>

              <!-- 右：代課/調課教師當週課表 (B) -->
               <div>
                 <div v-if="pendingRequestData.specialFlow === 'combined_return'" class="mini-grid-title">
                    ↩ <strong>{{ getTeacherNameByEmail(resolveCompareBEmail()) || '尚未指定' }}</strong> 老師當週課表（合班代課）
                 </div>
                 <div v-else class="mini-grid-title">
                     👤 <strong>{{ getTeacherNameByEmail(resolveCompareBEmail()) || '（尚未指定）' }}</strong> 老師課表（代課／受邀人<span v-if="!pendingRequestData.isBatch">，{{ formatDateMMDD(compareWeekDatesB[0]) }}～{{ formatDateMMDD(compareWeekDatesB[4]) }}</span>）
                 </div>
                <!-- 每節不同人：切換檢視各受邀人課表 -->
                <div v-if="pendingRequestData.isBatch && pendingRequestData.isPerSlot && batchCompareSubGroups.length > 1" class="batch-slot-chips mb-8-block">
                  <button
                    v-for="g in batchCompareSubGroups"
                    :key="'bcv-'+g.subEmail"
                    type="button"
                    class="batch-slot-chip"
                    :class="{ 'is-view-active': String(batchCompareViewEmail).toLowerCase() === String(g.subEmail).toLowerCase() }"
                    style="cursor:pointer;border:none;"
                    @click="setBatchCompareViewEmail(g.subEmail)"
                  >{{ g.subName }}（{{ g.slots.length }}節）</button>
                </div>
                  <div v-if="pendingRequestData.specialFlow === 'combined_return' && !resolveCompareBEmail()" style="padding:24px 12px;text-align:center;color:#9a3412;font-size:0.85rem;background:#fff7ed;border:1px dashed #fdba74;border-radius:8px;">
                    請先指定同節原本有課的其他併班任課教師。
                 </div>
                 <div v-else-if="!resolveCompareBEmail()" style="padding:24px 12px;text-align:center;color:var(--text-muted);font-size:0.85rem;background:#f8fafc;border:1px dashed var(--border-color);border-radius:8px;">
                   尚無受邀人可顯示課表
                 </div>
                 <div v-else class="mini-grid">
                  <div class="mini-grid-cell mini-grid-header">節</div>
                    <div class="mini-grid-cell mini-grid-header">一<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesB[0]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">二<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesB[1]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">三<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesB[2]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">四<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesB[3]) }}</span></div>
                    <div class="mini-grid-cell mini-grid-header">五<span class="mini-grid-date">{{ formatDateMMDD(compareWeekDatesB[4]) }}</span></div>
                  
                  <template v-for="p in timetablePeriods" :key="'B-'+p">
                    <div class="mini-grid-cell mini-grid-period">{{ getPeriodLabel(p) }}</div>
                    <div 
                      v-for="d in 5" 
                      :key="'B-'+p+'-'+d"
                      class="mini-grid-cell"
                      :class="getCompareCellClass('B', d, p)"
                    >
                      {{ getCompareCellText('B', d, p) }}
                    </div>
                  </template>
                </div>
                <!-- B師連堂警告 -->
                <div v-if="consecAlertsB && consecAlertsB.length" class="hint-amber-box">
                  ⚠️ 連堂警示：{{ consecAlertsB.join('、') }}
                </div>
              </div>
             </div>
              </template>
              </details>

             <!-- 批次節次摘要 -->
            <div v-if="pendingRequestData.isBatch" class="card" style="background:#eff6ff;border:1px solid #bfdbfe;padding:12px 14px;margin:0 0 12px;">
              <div style="font-weight:700;font-size:0.88rem;color:#1e40af;margin-bottom:8px;">
                📦 {{ pendingRequestData.mode === 'exchange' ? '批次調課' : '批次代課' }}申請（共 {{ pendingRequestData.batchCount || batchSlots.length }} {{ pendingRequestData.mode === 'exchange' ? '組' : '節' }}）
              </div>
              <div v-if="pendingRequestData.mode === 'exchange'" class="batch-slot-list" style="max-height:200px;background:#fff;">
                <div v-for="(s, index) in batchSlots" :key="'cx'+s.key" class="batch-slot-item" style="align-items:flex-start;">
                  <span style="min-width:0;flex:1;">
                    <strong>{{ index + 1 }}. {{ s.teacherName }}</strong> {{ formatDateMMDD(s.dateStr) }}({{ getWeekDayText(s.dayOfWeek) }}) {{ formatPeriodText(s.period) }} {{ s.className }}{{ s.subject }}
                    <span style="font-weight:700;color:#64748b;padding:0 5px;">↔</span>
                    <strong>{{ s.subTeacherName || getTeacherNameByEmail(s.subTeacherEmail) }}</strong> {{ formatDateMMDD(s.targetDate) }}({{ getWeekDayText(s.targetDayOfWeek) }}) {{ formatPeriodText(s.targetPeriod) }} {{ s.targetClassName }}{{ s.targetSubject }}
                    <small v-if="s.exchangeValidationError || s.exchangeSubmitError" style="display:block;color:#b91c1c;margin-top:3px;">{{ s.exchangeValidationError || s.exchangeSubmitError }}</small>
                    <small v-else-if="s.exchangeSubmitted" style="display:block;color:#15803d;margin-top:3px;">已送出，獨立等待簽核</small>
                    <small v-else style="display:block;color:#15803d;margin-top:3px;">此組可獨立送出</small>
                  </span>
                </div>
              </div>
              <div v-else-if="pendingRequestData.isPerSlot" class="batch-slot-list" style="max-height:180px;background:#fff;">
                <div v-for="s in batchSlots" :key="'c'+s.key" class="batch-slot-item">
                  <span>{{ formatDateMMDD(s.dateStr) }}({{ getWeekDayText(s.dayOfWeek) }}) {{ formatPeriodText(s.period) }} {{ s.className }}{{ s.subject }}</span>
                  <strong class="text-primary-strong">{{ s.subTeacherName || getTeacherNameByEmail(s.subTeacherEmail) }}</strong>
                </div>
              </div>
              <div v-else class="batch-slot-chips">
                <span v-for="s in batchSlots" :key="'c'+s.key" class="batch-slot-chip">
                  {{ formatDateMMDD(s.dateStr) }}({{ getWeekDayText(s.dayOfWeek) }}) {{ formatPeriodText(s.period) }} {{ s.className }}{{ s.subject }}
                </span>
              </div>
              <div class="text-xs-muted-75-mt">
                <template v-if="pendingRequestData.mode === 'exchange'">
                   共用批次編號；每組獨立簽核、列印及追蹤。{{ pendingRequestData.batchValidCount }} 組可送出，{{ pendingRequestData.batchInvalidCount }} 組需調整。
                </template>
                <template v-else-if="pendingRequestData.isPerSlot">
                   共 {{ pendingRequestData.subTeacherCount || '多' }} 位代課老師　·　假別一次套用　·　每節獨立簽核
                </template>
                <template v-else>
                   代課：{{ getTeacherNameByEmail(pendingRequestData.subTeacher) }}　·　假別一次套用全部節次　·　每節仍獨立簽核
                </template>
              </div>
            </div>

             <!-- 原因與審核選項 -->
             <div v-if="!pendingRequestData.isBatchCandidatePreview" class="card" style="background: #f8fafc; padding: 16px; margin: 0; border: 1px solid var(--border-color);">
                <div v-if="pendingRequestData.specialFlow === 'combined_return'" style="margin-bottom:14px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">
                   <div style="font-size:0.82rem;font-weight:700;color:#9a3412;margin-bottom:6px;">併班上課經費規則</div>
                   <div style="font-size:0.75rem;color:#7c2d12;line-height:1.45;">併班任課教師不支領代課費；請假教師仍依所選假別計算鐘點扣減，費用類別由系統自動帶入。</div>
                   <div v-if="pendingRequestData.reason" style="margin-top:6px;font-size:0.75rem;color:#9a3412;">被代教師扣減類別：<strong>{{ pendingRequestData.subFee || '依假別自動帶入' }}</strong></div>
                </div>
                 <div data-tour="compare-form" class="compare-form-grid">
                     <!-- 原因／假別與僅課務調整 -->
                     <div class="form-group compare-form-leave-type" data-tour="compare-reason">
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                         <label class="form-label" style="margin:0;">假別</label>
                          <label v-if="(pendingRequestData.mode === 'substitution' || pendingRequestData.mode === 'exchange') && pendingRequestData.specialFlow !== 'combined_return'" style="display:flex;align-items:center;gap:5px;font-size:0.78rem;color:var(--text-secondary);cursor:pointer;">
                          <input
                            id="course-adjustment-only"
                            type="checkbox"
                            class="chk-box-16"
                            v-model="pendingRequestData.courseAdjustmentOnly"
                            @change="toggleCourseAdjustmentOnly"
                          >
                          <span>僅申請課務調整（無請假）</span>
                        </label>
                      </div>
                        <select class="form-select" v-model="pendingRequestData.reason" :disabled="pendingRequestData.courseAdjustmentOnly" @change="onLeaveReasonChange">
                          <option value="" disabled>請選擇假別...</option>
                          <option v-if="(pendingRequestData.mode === 'substitution' || pendingRequestData.mode === 'exchange') && pendingRequestData.specialFlow !== 'combined_return'" value="課務調整">課務調整（無請假）</option>
                         <option v-for="r in leaveReasonOptions" :key="r" :value="r">{{ r }}</option>
                       </select>
                    </div>

                     <!-- 備註輸入：桌機版與假別同列，固定在右欄 -->
                      <div class="form-group compare-form-note">
                        <label class="form-label">事由</label>
                        <input type="text" class="form-input" v-model="pendingRequestData.note">
                      </div>

                      <!-- 對調模式才顯示 B 欄日期。 -->
                        <div class="form-group compare-form-exchange-date" v-if="pendingRequestData.mode === 'exchange' && !pendingRequestData.isBatch">
                        <label class="form-label">對調目標日期 (B)</label>
                        <input type="text" class="form-input" style="background: #f1f5f9; font-weight: 600;" readonly :value="pendingRequestData.dateB">
                     </div>
                    <div v-if="pendingRequestData.mode === 'substitution' && !pendingRequestData.courseAdjustmentOnly && pendingRequestData.specialFlow !== 'combined_return'" class="form-group compare-form-leave-time" :class="{ 'compare-form-leave-time-with-fee': isAdmin }">
                      <label class="form-label">請假時間（代課清冊）</label>
                     <div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;">
                       <button type="button" class="btn btn-secondary pad-6-10-78"  @click="setLeaveTimePreset('全天')">全天（{{ getLeaveTimePresetRange(pendingRequestData.leaveTeacher, '全天') }}）</button>
                       <button type="button" class="btn btn-secondary pad-6-10-78"  @click="setLeaveTimePreset('上午')">上午（{{ getLeaveTimePresetRange(pendingRequestData.leaveTeacher, '上午') }}）</button>
                       <button type="button" class="btn btn-secondary pad-6-10-78"  @click="setLeaveTimePreset('下午')">下午（{{ getLeaveTimePresetRange(pendingRequestData.leaveTeacher, '下午') }}）</button>
                     </div>
                     <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;">
                       <input type="time" class="form-input" style="width:125px;" v-model="pendingRequestData.leaveTimeStart" @change="updatePendingLeaveTime">
                       <span>至</span>
                       <input type="time" class="form-input" style="width:125px;" v-model="pendingRequestData.leaveTimeEnd" @change="updatePendingLeaveTime">
                       <span class="text-xs-sec-78" >目前：{{ pendingRequestData.leaveTimeType || '未填' }}（{{ pendingRequestData.leaveTime || '未填' }}）</span>
                     </div>
                      <small style="display:block;margin-top:5px;color:var(--text-muted);">行政人員預設全天 08:00~17:00；非行政預設全天 08:00~16:00，時間可自行修改。</small>
                    </div>

                    <!-- 經費選單僅管理員可見；位於請假時間右欄。 -->
                    <div
                      v-if="isAdmin && pendingRequestData.mode === 'substitution' && pendingRequestData.specialFlow !== 'combined_return'"
                      class="form-group compare-form-fee"
                      data-tour="compare-fee"
                    >
                      <label class="form-label text-success">代課鐘點費結算方式</label>
                      <select
                        class="form-select"
                        v-model="pendingRequestData.subFee"
                        :disabled="isPeriod8FeeLocked"
                      >
                        <option value="" disabled>請選擇...</option>
                        <option v-if="isPeriod8FeeLocked" :value="PERIOD8_FEE">第8節代課（計畫經費）</option>
                        <template v-if="!isPeriod8FeeLocked">
                          <option v-if="!isMutualCover" value="自費代課">自費代課</option>
                          <option v-if="!isMutualCover" value="公費代課">公費代課</option>
                          <option v-if="!isMutualCover" :value="TIMETABLE_ONLY_FEE">僅課表呈現（不結算）</option>
                          <option v-if="!isMutualCover && pendingRequestData.subFee === '僅課表呈現'" value="僅課表呈現">僅課表呈現（舊）</option>
                          <option value="扣額度">扣額度（不結鐘點＋扣折抵額度）</option>
                          <option v-if="isMutualCover" value="活動公費">活動公費（可領代課費）</option>
                          <option v-if="isAdmin || isMutualCover || pendingRequestData.subFee === '第8節代課'" value="第8節代課">第8節代課（計畫經費）</option>
                        </template>
                      </select>
                       <span v-if="pendingRequestData.subFee === '扣額度'" style="font-size:0.72rem; color:#5b21b6; display:block; margin-top:4px;">
                         扣額度規則：扣代課者 1 節額度；被代教師不扣鐘點、不扣額度。
                       </span>
                       <span v-if="pendingRequestData.subFee === TIMETABLE_ONLY_FEE" style="font-size:0.72rem; color:#0369a1; display:block; margin-top:4px;">
                         僅建立課表異動，不發代課費、不扣鐘點、不扣額度，也不列入經費匯出。
                       </span>
                      <span v-if="isMutualCover && !isPeriod8FeeLocked" style="font-size:0.72rem; color:#5b21b6; display:block; margin-top:4px;">
                        ＊1～7節：額度足夠時扣額度，不足時改活動公費；第8節固定使用計畫經費。
                      </span>
                      <div
                        v-if="quotaDeductPreview && quotaDeductPreview.length"
                        style="margin-top:8px;padding:8px 10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;font-size:0.78rem;color:#5b21b6;line-height:1.55;"
                      >
                        <div style="font-weight:700;margin-bottom:4px;">折抵額度預覽（扣額度，僅管理員可見）</div>
                        <div v-for="q in quotaDeductPreview" :key="q.email">
                          {{ q.name }}：目前 <strong>{{ q.before }}</strong>
                          → 扣 <strong>{{ q.deduct }}</strong>
                          → 剩 <strong :style="{color: q.short ? '#b91c1c' : '#5b21b6'}">{{ q.short ? '不足' : q.after }}</strong>
                          <span v-if="q.short" class="text-danger-deep">{{ isMutualCover ? '（將改活動公費）' : '（不可送出）' }}</span>
                        </div>
                        <div v-if="quotaPackLoading" style="margin-top:6px;color:#7c3aed;">查詢中…</div>
                        <div v-else-if="quotaPackError" style="margin-top:6px;color:#b91c1c;">{{ quotaPackError }}</div>
                        <div v-else-if="quotaPackOptions && quotaPackOptions.length" style="margin-top:8px;padding-top:8px;border-top:1px dashed #c4b5fd;">
                          <label class="form-label" style="margin-bottom:4px;">扣自事件包（預設最早有餘額者）</label>
                          <select class="form-select" v-model="pendingRequestData.quotaPackageId" style="width:100%;font-size:0.78rem;">
                            <option v-for="opt in quotaPackOptions" :key="opt.packageId" :value="opt.packageId">
                              {{ opt.eventName || '未命名' }}｜餘{{ opt.remaining }}{{ opt.packageId === quotaFifoPackageId ? '（預設）' : '' }}
                            </option>
                          </select>
                        </div>
                        <div v-else-if="!quotaPackLoading && !quotaPackError && pendingRequestData.subFee === '扣額度' && !quotaDeductInsufficient" style="margin-top:6px;color:#6d28d9;">無分包明細，以總餘額扣。</div>
                        <div v-else-if="!quotaPackLoading && !quotaPackError && pendingRequestData.subFee === '扣額度' && quotaDeductInsufficient" style="margin-top:6px;color:#b91c1c;">餘額不足，請先發放或改經費。</div>
                        <div v-if="quotaDeductInsufficient" style="margin-top:8px;padding-top:8px;border-top:1px dashed #c4b5fd;color:#b91c1c;">
                          <template v-if="isMutualCover">
                            額度不足：送出時會<strong>自動改為活動公費</strong>。
                            <button
                              type="button"
                              class="btn btn-secondary"
                              style="margin-left:8px;padding:2px 10px;font-size:0.72rem;"
                              @click="switchQuotaDeductToSelfPay"
                            >改為活動公費</button>
                          </template>
                          <template v-else>
                            額度不足，不可用「扣額度」。請改自費排代，或另選有額度的老師。
                            <button
                              type="button"
                              class="btn btn-secondary"
                              style="margin-left:8px;padding:2px 10px;font-size:0.72rem;"
                              @click="switchQuotaDeductToSelfPay"
                            >改為自費代課</button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>

              <!-- 舊的管理員簽核模式已移至最上方顯眼處 -->
            </div>

            <!-- 送出前先問對方 LINE 範本 -->
             <div v-if="!pendingRequestData.isBatchCandidatePreview && askFirstLineText && !pendingRequestData.isBatch && pendingRequestData.specialFlow !== 'combined_return'" data-tour="ask-first-line" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-top:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="font-weight:600;color:#15803d;font-size:0.85rem;">💬 送出前先問對方（LINE 範本）</span>
                <div class="flex-gap-6-shrink">
                  <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:0.75rem;line-height:1.2;" @click="copyLineMessage(askFirstLineDraft)">📋 複製</button>
                  <button type="button" class="btn btn-success" style="padding:4px 10px;font-size:0.75rem;line-height:1.2;background:#06c755;border-color:#05b04b;" @click="sendLineMessage(askFirstLineDraft)">💬 LINE 傳送</button>
                </div>
              </div>
              <textarea
                class="form-input"
                rows="7"
                style="width:100%;font-family:monospace;font-size:0.78rem;background:#f8fafc;border:1px solid #d1fae5;border-radius:6px;padding:8px;resize:none;line-height:1.4;"
                v-model="askFirstLineDraft"
                @focus="$event.target.select()"
              ></textarea>
              <span style="font-size:0.72rem;color:#166534;display:block;margin-top:6px;line-height:1.4;">
                * 送出前先傳 LINE 詢問對方意願，對方同意後再送出申請，核准成功率更高。
              </span>
            </div>

          </div>
          
          <div class="modal-footer" data-tour="compare-submit">
            <template v-if="pendingRequestData.isBatchCandidatePreview">
              <button type="button" class="btn btn-primary" @click="closeCompareModal">← 返回批次候選</button>
            </template>
            <!-- 活動互代模擬：只對照課表，確認後寫入暫定（不直接送出申請） -->
            <template v-else-if="paperMode && !isAdmin && isMutualCover">
              <button
                type="button"
                class="btn btn-primary"
                @click="openPaperPrintDraftFromCompare"
               >👁️ 預覽調代課單</button>
              <button type="button" class="btn btn-secondary" @click="$emit('close')">關閉</button>
            </template>
            <template v-else-if="isMutualCover && pendingRequestData.mutualPreview && !pendingRequestData.isBatch">
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="isSubmitting || loading"
                @click="openPaperPrintDraftFromCompare"
              >👁️ 預覽調代課單</button>
              <button
                type="button"
                class="btn btn-primary"
                style="background:#7c3aed;border-color:#6d28d9;"
                :disabled="isSubmitting || loading"
                @click="assignMutualDraftFromMatch(pendingRequestData.subTeacher); $emit('close')"
              >暫定</button>
              <button type="button" class="btn btn-secondary" :disabled="isSubmitting || loading" @click="$emit('close')">關閉</button>
             </template>
             <template v-else>
                <button
                  type="button"
                  class="btn btn-secondary"
                 :disabled="isSubmitting || loading"
                 @click="openPaperPrintDraftFromCompare"
                >👁️ 預覽調代課單</button>
                <button
                  class="btn btn-success"
                 :data-tour="paperFlow ? 'compare-submit-paper' : 'compare-submit-online'"
                  :disabled="(!isMutualCover && quotaDeductInsufficient) || isSubmitting || loading || (pendingRequestData.isExchangeBatch && !pendingRequestData.batchValidCount)"
                :title="(!isMutualCover && quotaDeductInsufficient) ? '額度不足，請改自費排代' : (isMutualCover && quotaDeductInsufficient ? '額度不足將改活動公費後送出' : (isSubmitting || loading ? '送出中，請稍候' : ''))"
                @click="pendingRequestData.isBatch ? executeBatchSubmit() : executeSubmitRequest()"
              >
                 {{ (isSubmitting || loading)
                   ? '送出中…'
                       : (pendingRequestData.isBatch
                       ? (pendingRequestData.mode === 'exchange'
                         ? ((paperFlow ? '送出申請並列印調課單（' : '確認批次調課送出（') + (pendingRequestData.batchValidCount || 0) + ' 組）')
                         : ('確認批次送出（' + (pendingRequestData.batchCount || batchSlots.length) + ' 節）'))
                       : (paperFlow ? '送出申請並列印調代課單' : '確認送出')) }}
               </button>
              <button class="btn btn-secondary" :disabled="isSubmitting || loading" @click="$emit('close')">取消</button>
            </template>
          </div>
        </div>
      </div>
</template>

<!-- 送出前對照確認 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  hasSubTeacherConflict: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isAdmin: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isProxySubmitActive: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  user: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  notificationsSuppressed: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchCompareWeekTotal: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchCompareWeekIndex: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  compareWeekDatesA: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchCompareWeekSlotCount: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchExchangePreviewSlotKey: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isCrossWeekExchange: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  compareWeekSelectionA: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  compareWeekDatesB: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  compareDisplayDatesA: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  timetablePeriods: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  consecAlertsA: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  compareWeekSelectionB: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  compareDisplayDatesB: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  consecAlertsB: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchCompareSubGroups: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchCompareViewEmail: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchSlots: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  leaveReasonOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isPeriod8FeeLocked: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  PERIOD8_FEE: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isMutualCover: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  TIMETABLE_ONLY_FEE: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaDeductPreview: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaPackLoading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaPackError: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaPackOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaFifoPackageId: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaDeductInsufficient: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  askFirstLineText: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  paperMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isSubmitting: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  loading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  paperFlow: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  getTeacherNameByEmail: { type: Function, required: true },
  shiftBatchCompareWeek: { type: Function, required: true },
  formatDateMMDD: { type: Function, required: true },
  setBatchExchangePreviewSlot: { type: Function, required: true },
  getExchangeEndpointText: { type: Function, required: true },
  setCompareWeekSelection: { type: Function, required: true },
  getPeriodLabel: { type: Function, required: true },
  getCompareCellClass: { type: Function, required: true },
  getCompareCellText: { type: Function, required: true },
  resolveCompareBEmail: { type: Function, required: true },
  setBatchCompareViewEmail: { type: Function, required: true },
  getWeekDayText: { type: Function, required: true },
  formatPeriodText: { type: Function, required: true },
  setLeaveTimePreset: { type: Function, required: true },
  getLeaveTimePresetRange: { type: Function, required: true },
  copyLineMessage: { type: Function, required: true },
  sendLineMessage: { type: Function, required: true },
  assignMutualDraftFromMatch: { type: Function, required: true },
  executeBatchSubmit: { type: Function, required: true },
  executeSubmitRequest: { type: Function, required: true },
  closeCompareModal: { type: Function, required: true },
  toggleCourseAdjustmentOnly: { type: Function, required: true },
  onLeaveReasonChange: { type: Function, required: true },
  updatePendingLeaveTime: { type: Function, required: true },
  switchQuotaDeductToSelfPay: { type: Function, required: true },
  openPaperPrintDraftFromCompare: { type: Function, required: true },
});
defineEmits(['close']);
const directApproveMode = defineModel('directApproveMode');
const directApproveSkipNotify = defineModel('directApproveSkipNotify');
const pendingRequestData = defineModel('pendingRequestData');
const askFirstLineDraft = defineModel('askFirstLineDraft');
</script>
