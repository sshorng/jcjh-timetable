<template>
        <div>
          
          <!-- 後台管理子頁籤 -->
          <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px; flex-wrap: wrap;">
            <button
              class="btn btn-pill"
              :class="adminSubTab === 'billing' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'billing'"
            >
              💰 鐘點結算
            </button>
            <button
              class="btn btn-pill"
              :class="adminSubTab === 'period8' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'period8'"
            >
              🕗 第八節
            </button>
             <button
              class="btn btn-pill" 
              :class="adminSubTab === 'teachers' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'teachers'"
            >
              👤 教師管理
            </button>
             <button
               class="btn btn-pill"
               :class="adminSubTab === 'classAway' ? 'btn-primary' : 'btn-secondary'"
               @click="adminSubTab = 'classAway'"
            >
               📭 空堂事件
             </button>
             <button
               class="btn btn-pill"
               :class="adminSubTab === 'schoolSwap' ? 'btn-primary' : 'btn-secondary'"
               @click="adminSubTab = 'schoolSwap'"
             >
               🔁 全校對調
             </button>
              <button
               class="btn btn-pill"
               :class="adminSubTab === 'settings' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'settings'"
            >
              ⚙️ 系統設定
            </button>
             <button
               class="btn btn-pill"
               :class="adminSubTab === 'schoolExport' ? 'btn-primary' : 'btn-secondary'"
               @click="adminSubTab = 'schoolExport'"
             >
               📄 課表匯出
             </button>
            </div>

           <!-- 子分頁：第八節班級週表與核銷匯出 -->
           <div v-if="adminSubTab === 'period8'" class="period8-admin-page">
             <div class="card">
               <div class="card-title card-title-between">
                 <span>🕗 第八節班級課表</span>
                 <button
                   type="button"
                   class="btn btn-primary btn-sm-pad"
                   :disabled="period8Loading || period8ExportLoading"
                   @click="exportPeriod8Accounting"
                 >
                   {{ period8ExportLoading ? '正在整理清冊…' : '匯出第八節核銷清冊' }}
                 </button>
               </div>
               <div class="period8-toolbar">
                 <button type="button" class="btn btn-secondary btn-week-round" @click="changePeriod8Week(-1)" title="上一週">◀</button>
                 <div class="week-label">
                   🗓️ {{ formatDateMMDD(period8WeekDates[0]) }} ~ {{ formatDateMMDD(period8WeekDates[4]) }}
                   <span v-if="period8WeekNumber" class="text-primary-bold">（{{ period8WeekNumber }}）</span>
                 </div>
                 <button type="button" class="btn btn-secondary btn-week-round" @click="changePeriod8Week(1)" title="下一週">▶</button>
                 <button type="button" class="btn btn-secondary btn-sm-78" @click="goToPeriod8ThisWeek">本週</button>
                 <span class="period8-range-note">核銷區間：{{ reportStartDate }} ～ {{ reportEndDate }}，單價 NT$ 600／節</span>
               </div>
               <div v-if="period8Loading" class="billing-empty">正在載入第八節資料，請稍候…</div>
               <div v-else-if="period8RosterRows.length === 0" class="billing-empty">目前沒有可顯示的班級第八節資料。</div>
               <div v-else class="period8-table-wrap">
                 <div class="period8-grid">
                   <div class="period8-grid-header period8-class-header">班級</div>
                    <div v-for="(dateStr, dateIndex) in period8WeekDates" :key="'p8-head-' + dateStr" class="period8-grid-header">
                     {{ formatDateMMDD(dateStr) }}<br><span>{{ ['一','二','三','四','五'][dateIndex] }}</span>
                   </div>
                   <template v-for="row in period8RosterRows" :key="'p8-row-' + row.className">
                     <div class="period8-class-label">{{ row.className }}</div>
                      <div v-for="(dateStr, dateIndex) in period8WeekDates" :key="row.className + '-' + dateStr" class="period8-grid-cell">
                       <template v-if="period8CellsFor(row, dateStr).length">
                         <button
                           v-for="cell in period8CellsFor(row, dateStr)"
                           :key="row.className + '-' + dateStr + '-' + cell.teacherEmail + '-' + cell.status"
                            type="button"
                            class="period8-cell-button"
                            :class="['period8-status-' + cell.status, { 'period8-cell-disabled': cell.status === 'away' }]"
                            :disabled="cell.status === 'away'"
                            :title="cell.status === 'away' ? (cell.awayName || '空堂事件') : (cell.subject ? (cell.teacherName + '／' + cell.subject) : cell.teacherName)"
                            @click="handlePeriod8CellClick(cell)"
                         >
                            <strong>{{ cell.teacherName }}</strong>
                            <span v-if="cell.subject" class="subject-color-tag period8-subject" :style="getSubjectStyle(cell.subject)">{{ cell.subject }}</span>
                            <span v-if="cell.status === 'away'" class="away-class-badge">{{ period8StatusLabel(cell) }}</span>
                            <span v-else-if="period8StatusLabel(cell)" class="period8-status-badge">{{ period8StatusLabel(cell) }}</span>
                         </button>
                       </template>
                        <span v-else class="period8-empty-cell"></span>
                     </div>
                   </template>
                 </div>
               </div>
             </div>
           </div>

           <!-- 子分頁：課表匯出（共用日期） -->
          <div v-if="adminSubTab === 'schoolExport'">
            <div class="card">
              <div class="card-title">
                <span>📄 課表匯出</span>
              </div>
              <div class="report-toolbar" style="flex-wrap:wrap;gap:12px;align-items:flex-end;">
                <div class="form-group m-0-min-140">
                  <label class="form-label">起日</label>
                  <input type="date" class="form-input" v-model="schoolExportStart">
                </div>
                <div class="form-group m-0-min-140">
                  <label class="form-label">迄日</label>
                  <input type="date" class="form-input" v-model="schoolExportEnd">
                </div>
                <button type="button" class="btn btn-secondary p-9-12" @click="setSchoolExportThisWeek">本週一～五</button>
                <label class="label-check-82">
                  <input type="checkbox" v-model="schoolExportIncludeWeekend" class="chk-md">
                  <span>含週末</span>
                </label>
                <label class="label-check-82">
                  <input type="checkbox" v-model="schoolExportOnlyChanged" class="chk-md">
                  <span>只匯出有異動教師</span>
                </label>
                <button type="button" class="btn btn-success" style="padding:10px 16px;" @click="exportSchoolTimetableWord">
                  匯出全校課表（.docx）
                </button>
                <button type="button" class="btn btn-primary" style="padding:10px 16px;" @click="exportInvigilationWorkbook">
                  匯出監考表（.xlsx）
                </button>
                <button type="button" class="btn btn-primary" style="padding:10px 16px;" @click="exportInvigilationClassWorkbook">
                  匯出監考表（班級版 .xlsx）
                </button>
              </div>

              <div style="margin-top:16px;border-top:1px solid var(--border-color);padding-top:12px;">
                <div class="flex-wrap-gap-8-mb">
                  <strong style="font-size:0.88rem;">選擇教師</strong>
                  <span class="text-xs-muted-78">已選 {{ schoolExportSelectedEmails.length }}／{{ teachersList.length }}</span>
                  <button type="button" class="btn btn-secondary p-3-10-75" @click="selectAllSchoolExportTeachers">全選</button>
                  <button type="button" class="btn btn-secondary p-3-10-75" @click="clearSchoolExportTeachers">全不選</button>
                  <input
                    type="text"
                    class="form-input"
                    style="padding:4px 10px;font-size:0.8rem;max-width:180px;margin-left:auto;"
                    placeholder="篩選姓名／科目"
                    v-model="schoolExportTeacherFilter"
                  >
                </div>
                <div style="max-height:280px;overflow:auto;border:1px solid var(--border-color);border-radius:10px;padding:8px 10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 10px;">
                  <label
                    v-for="t in filteredSchoolExportTeachers"
                    :key="t.email"
                    style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;user-select:none;padding:3px 2px;"
                  >
                    <input
                      type="checkbox"
                      style="width:15px;height:15px;margin:0;flex-shrink:0;"
                      :checked="isSchoolExportTeacherSelected(t.email)"
                      @change="toggleSchoolExportTeacher(t.email)"
                    >
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" :title="t.subject || ''">{{ t.name }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- 子分頁 1：月底大鐘點與代課費統計中心 -->
          <div v-if="adminSubTab === 'billing'" class="billing-report">
            <div class="card">
              <div class="card-title billing-report-title">
                <div class="billing-report-title-main">
                  <span>💰 大鐘點與代課費結算</span>
                  <div class="billing-month-control">
                    <button type="button" class="btn btn-secondary billing-period-arrow" title="上一個結算月份" aria-label="上一個結算月份" @click="shiftReportPeriod(-1)">‹</button>
                    <label class="form-label" for="billing-report-start">結算起日</label>
                    <input id="billing-report-start" type="date" class="form-input" v-model="reportStartDate" @change="calculateMonthlyReport">
                    <span class="billing-range-separator">至</span>
                    <label class="form-label" for="billing-report-end">結算迄日</label>
                    <input id="billing-report-end" type="date" class="form-input" v-model="reportEndDate" @change="calculateMonthlyReport">
                    <button type="button" class="btn btn-secondary billing-period-arrow" title="下一個結算月份" aria-label="下一個結算月份" @click="shiftReportPeriod(1)">›</button>
                  </div>
                  <div class="billing-weeks-control" aria-live="polite">
                    <span class="form-label">自動週數</span>
                    <strong class="billing-weeks-value">{{ reportWeeksCount }}</strong>
                    <span class="billing-weeks-suffix">週</span>
                  </div>
                </div>
                <div class="billing-report-actions">
                  <button type="button" class="btn btn-primary" style="padding:8px 14px;font-size:0.85rem;" :disabled="accountingExportLoading" @click="exportSubFeeToExcel">
                    {{ accountingExportLoading ? '⏳ 準備會計檔…' : '📊 下載會計版 Excel' }}
                  </button>
                </div>
              </div>

              <div class="report-toolbar billing-toolbar billing-toolbar-note">
                <p class="billing-toolbar-hint">請設定結算起日與迄日（建議週一至週五）；同一週只計 1 週，週數會自動計算。月報與下載會計版 Excel 會沿用同一日期區間，不需重複設定。</p>
              </div>

              <div v-if="isAdmin" class="card" style="margin:14px 0;padding:16px;background:#fffdf6;border:1px solid #ebd9a2;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #f2e4bd;">
                  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;">
                    <strong style="font-size:1.02rem;color:#5a4310;">👩‍🏫 本期代導紀錄與費用管理（{{ reportStartDate || '起日' }}～{{ reportEndDate || '迄日' }}）</strong>
                    <span class="status-badge" style="background:#e8f4ff;color:#1864ab;font-size:0.78rem;">共 {{ currentMonthHomeroomRecords.length }} 筆</span>
                    <span class="status-badge" style="background:#e6fcf5;color:#0ca678;font-size:0.78rem;">已指定 {{ currentMonthHomeroomAssignedCount }} 筆</span>
                    <span v-if="currentMonthHomeroomPendingCount > 0" class="status-badge status-pending-admin" style="font-size:0.78rem;">待指定 {{ currentMonthHomeroomPendingCount }} 筆</span>
                     <span style="font-size:0.9rem;font-weight:bold;color:#c92a2a;margin-left:4px;">小計 NT$ {{ formatMoney(currentMonthHomeroomFeeTotal) }} 元</span>
                  </div>
                  <button type="button" class="btn btn-secondary" style="padding:6px 12px;font-size:0.82rem;background:#fff;border:1px solid #d9b86c;color:#6b4e0a;" @click="openManualHomeroomModal">
                    ➕ 手動新增代導費
                  </button>
                </div>

                <div v-if="homeroomRecordsLoading" style="font-size:0.84rem;color:var(--text-secondary);padding:8px 0;">正在同步最新代導清冊…</div>
                <div v-else-if="currentMonthHomeroomRecords.length === 0" style="font-size:0.84rem;color:var(--text-secondary);padding:10px 0;">
                   目前本期尚無代導紀錄。若有導師無課或已調課請假，可點選上方「➕ 手動新增代導費」補建。
                </div>
                <div v-else style="display:flex;flex-direction:column;gap:10px;">
                  <div v-for="r in currentMonthHomeroomRecords" :key="r.id" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;background:#fff;border:1px solid #f0e2b8;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                    <div style="flex:1;min-width:260px;font-size:0.85rem;">
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                        <span style="font-weight:bold;color:#2b2b2b;">{{ r.date }}</span>
                        <span style="background:#f1f3f5;padding:2px 6px;border-radius:4px;font-weight:600;color:#495057;">{{ r.className || '導師班' }}</span>
                        <strong>{{ r.originalTeacherName || '未指定' }}</strong>
                        <span v-if="r.sourceRequestId === 'manual'" class="status-badge" style="background:#fff3bf;color:#f59f00;font-size:0.72rem;padding:1px 5px;">手動建立</span>
                      </div>
                      <div class="text-xs-sec-78" >
                          請假時間：{{ r.leaveTimeType || '' }} {{ r.leaveTime || '未填' }}｜鐘點費：1節（NT$ {{ formatMoney(r.feeAmount || 455) }}）
                        <span v-if="r.note" style="margin-left:6px;color:#868e96;">({{ r.note }})</span>
                      </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;">
                      <div v-if="!r.actualTeacherName" style="display:flex;align-items:center;gap:6px;">
                        <input 
                          type="text" 
                          class="form-input" 
                          style="width:180px;padding:6px 10px;font-size:0.82rem;" 
                           placeholder="搜尋或選擇代導教師"
                          :list="'dl-hr-cand-'+r.id"
                          :value="getTeacherNameByEmail(homeroomAssignSelections[r.id])"
                          @input="onHomeroomInputSelect(r, $event.target.value)"
                        >
                        <datalist :id="'dl-hr-cand-'+r.id">
                          <option v-for="t in getHomeroomCoverCandidates(r)" :key="'hr-cand-opt-'+r.id+'-'+t.email" :value="t.name + '（' + (t.subject || '教師') + '）'"></option>
                        </datalist>
                        <button type="button" class="btn btn-primary" style="padding:6px 12px;font-size:0.8rem;" :disabled="homeroomRecordsLoading || loading || !homeroomAssignSelections[r.id]" @click="assignHomeroomTeacher(r)">{{ homeroomRecordsLoading || loading ? '⏳ 存檔中...' : '指定存檔' }}</button>
                      </div>
                      <div v-else style="font-size:0.83rem;color:#0ca678;font-weight:600;display:flex;align-items:center;gap:8px;">
                        <span>✅ 代導：{{ r.actualTeacherName || '未指定' }}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary" style="padding:2px 6px;font-size:0.75rem;" title="重新指定代導教師" @click="r.actualTeacherName = ''; homeroomAssignSelections[r.id] = '';">修改</button>
                      </div>
                      <button type="button" class="btn btn-sm btn-outline-danger" style="padding:4px 8px;font-size:0.78rem;margin-left:4px;" title="撤銷這筆代導紀錄" @click="deleteHomeroomRecord(r)">撤銷</button>
                    </div>
                  </div>
                </div>
              </div>
               <div class="report-table-container billing-table-wrap">
                 <table class="custom-table billing-table">
                  <thead>
                    <tr class="billing-th-group">
                       <th colspan="3" class="billing-th-id">教師</th>
                       <th colspan="9" class="billing-th-17">1～7＋早自習／午休 鐘點</th>
                       <th colspan="6" class="billing-th-sub">早自習／1～7／午休 我去代課</th>
                      <th colspan="2" class="billing-th-p8">第 8 節</th>
                    </tr>
                    <tr class="billing-th-cols">
                       <th class="billing-sticky-name">姓名</th>
                       <th class="billing-th-job">職務</th>
                       <th class="billing-th-subject">科目</th>
                        <th title="每週早自習＋1～7＋午休；基本／一般／抽離（超鐘點另以標記判定；不含巡堂／第8）">排課</th>
                      <th title="教師基本授課鐘點">基鐘</th>
                       <th title="已設定固定超鐘點時採學期設定；未設定才使用排課 − 基鐘">超鐘點/週</th>
                      <th title="超鐘點固定為每週超鐘點 × 結算週數；放假／空堂不扣">空堂扣減</th>
                          <th title="超鐘點表的扣節合計（自費超鐘點＋公費超鐘點）">超鐘扣</th>
                         <th title="自付表中的自費代課節數（原課非超鐘點）">自費扣</th>
                       <th title="小鐘點課程請假或放假未授課的另扣">代課另扣</th>
                      <th title="本月實得超時節數" class="billing-th-result">實得超時</th>
                      <th title="實得超時 × 455" class="billing-th-result">超鐘點費</th>
                       <th title="代他人且經費為公費／活動公費的實際授課節次；不含課表代課">公代節</th>
                       <th title="公代節 × 455">公代費</th>
                       <th title="代他人且經費為自費">自代節</th>
                        <th title="自代節 × 455；懸停可看明細">自代費</th>
                       <th title="課表屬性為代課的小鐘點實際授課節數，與超鐘點分開計算">課代節</th>
                       <th title="課代節 × 455">課代費</th>
                       <th title="實際上課節數（誰上誰拿）">節數</th>
                      <th title="600 元／節" class="billing-th-result">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in monthlyReportData" :key="row.email">
                       <td class="billing-sticky-name"><strong>{{ row.name }}</strong></td>
                       <td class="billing-job" :title="row.jobTitle || '教師'">{{ row.jobTitle || '教師' }}</td>
                       <td class="billing-subj" :title="row.subject || ''">{{ row.subject }}</td>
                      <td class="num">{{ row.weeklyPeriods }}</td>
                      <td class="num">{{ row.baseHours }}</td>
                      <td class="num">{{ row.weeklyOvertime }}</td>
                       <td class="num muted">{{ row.reduceDeduction ? ('−' + row.reduceDeduction) : '無' }}</td>
                        <td class="num warn">{{ ((row.selfPaidDeduction || 0) + (row.publicOvertimeUsed || 0)) ? ('−' + ((row.selfPaidDeduction || 0) + (row.publicOvertimeUsed || 0))) : '無' }}</td>
                         <td class="num danger">{{ row.selfSubDeduction ? ('−' + row.selfSubDeduction) : '無' }}</td>
                       <td class="num warn">{{ row.substituteAdditionalDeduction ? ('−' + row.substituteAdditionalDeduction) : '無' }}</td>
                      <td class="num result" :class="{ danger: row.actualOvertime < 0 }" :title="row.actualOvertime < 0 ? '超鐘不足，自費請假請自行付代課費' : ''">{{ row.actualOvertime }}</td>
                        <td class="num result" :class="{ danger: row.overtimeFee < 0 }" :title="row.overtimeFee < 0 ? '負數＝應自付代課費約此金額' : ''">{{ row.overtimeFee ? ('$' + formatMoney(row.overtimeFee)) : (row.overtimeFee === 0 ? '$0' : '無') }}</td>
                       <td class="num">{{ row.pubSubCount || '無' }}</td>
                        <td class="num ok">{{ row.pubSubFee ? ('$' + formatMoney(row.pubSubFee)) : '無' }}</td>
                        <td class="num">{{ row.selfSubCount || '無' }}</td>
                         <td class="num ok" :title="row.selfSubDetail && row.selfSubDetail !== '無' ? row.selfSubDetail : ''">{{ row.selfSubFee ? ('$' + formatMoney(row.selfSubFee)) : '無' }}</td>
                       <td class="num">{{ row.substitutePaidCount || '無' }}</td>
                       <td class="num ok">{{ row.substitutePaidFee ? ('$' + formatMoney(row.substitutePaidFee)) : '無' }}</td>
                        <td class="num">{{ row.period8SubCount || '無' }}</td>
                      <td class="num result-p8">{{ row.period8Fee ? ('$' + formatMoney(row.period8Fee)) : '無' }}</td>
                     </tr>
                     <tr v-if="monthlyReportData.length > 0" class="billing-total-row">
                       <td colspan="3" class="billing-sticky-name"><strong>合計</strong></td>
                       <td class="num">{{ monthlyReportTotals.weeklyPeriods }}</td>
                       <td class="num">{{ monthlyReportTotals.baseHours }}</td>
                       <td class="num">{{ monthlyReportTotals.weeklyOvertime }}</td>
                       <td class="num muted">{{ monthlyReportTotals.reduceDeduction }}</td>
                        <td class="num warn">{{ (monthlyReportTotals.selfPaidDeduction || 0) + (monthlyReportTotals.publicOvertimeUsed || 0) }}</td>
                         <td class="num danger">{{ monthlyReportTotals.selfSubDeduction }}</td>
                       <td class="num warn">{{ monthlyReportTotals.substituteAdditionalDeduction }}</td>
                       <td class="num result">{{ monthlyReportTotals.actualOvertime }}</td>
                        <td class="num result">${{ formatMoney(monthlyReportTotals.overtimeFee) }}</td>
                       <td class="num">{{ monthlyReportTotals.pubSubCount }}</td>
                        <td class="num ok">${{ formatMoney(monthlyReportTotals.pubSubFee) }}</td>
                        <td class="num">{{ monthlyReportTotals.selfSubCount }}</td>
                         <td class="num ok">${{ formatMoney(monthlyReportTotals.selfSubFee) }}</td>
                       <td class="num">{{ monthlyReportTotals.substitutePaidCount }}</td>
                       <td class="num ok">${{ formatMoney(monthlyReportTotals.substitutePaidFee) }}</td>
                        <td class="num">{{ monthlyReportTotals.period8SubCount }}</td>
                        <td class="num result-p8">${{ formatMoney(monthlyReportTotals.period8Fee) }}</td>
                     </tr>
                      <tr v-if="monthlyReportLoading && monthlyReportData.length === 0">
                          <td colspan="20" class="billing-empty">正在整理本期月報，請稍候…</td>
                      </tr>
                      <tr v-else-if="monthlyReportData.length === 0">
                          <td colspan="20" class="billing-empty">請先在「教師名單」設定基本授課鐘點，再設定有效的結算日期區間。</td>
                      </tr>
                  </tbody>
                 </table>
               </div>
               <div v-if="monthlyReportData.some(row => row.expensePlanConflicts && row.expensePlanConflicts.length)" style="margin-top:10px;padding:10px 12px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;color:#92400e;font-size:0.82rem;line-height:1.6;">
                 <strong>⚠ 經費來源待核對</strong>
                 <div v-for="row in monthlyReportData.filter(item => item.expensePlanConflicts && item.expensePlanConflicts.length)" :key="'expense-conflict-' + row.email">
                   {{ row.name }}：{{ row.expensePlanWarnings.join('；') }}
                 </div>
               </div>
            </div>
          </div>

          <!-- 子分頁 2：教師名單管理與基本授課鐘點設定 -->
          <div v-if="adminSubTab === 'teachers'">
            <!-- 2. 教師名單管理與基本授課鐘點設定 -->
            <div class="card">
            <div class="card-title">
              <span>👤 教師帳號與基本鐘點管理</span>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-success btn-md" @click="showImportTeachersModal = true">📥 批次匯入教師</button>
                <button class="btn btn-secondary btn-md" @click="fillFixedOvertimeForAllTeachers">⚡ 全部代入固定超鐘點</button>
                <button class="btn btn-secondary btn-md" @click="openTeacherExpenseAuditModal">🔎 檢查經費來源</button>
                <button class="btn btn-primary btn-md" @click="openAddTeacherModal">➕ 新增教師</button>
              </div>
            </div>
            
                        <TeachersTable
              :paged-teachers-list-details="pagedTeachersListDetails"
              :teachers-list-details="teachersListDetails"
              :teachers-need-pager="teachersNeedPager"
              :teachers-page="teachersPage"
              :teachers-total-pages="teachersTotalPages"
              :get-expense-plan-summary="getExpensePlanSummary"
              :get-teacher-timetable-hours="getTeacherTimetableHours"
              :update-teacher-base-hours="updateTeacherBaseHours"
              :open-quota-ledger="openQuotaLedger"
              :open-manual-quota-adjust="openManualQuotaAdjust"
              :open-overtime-plan-modal="openOvertimePlanModal"
              :open-edit-teacher-modal="openEditTeacherModal"
              :delete-teacher="deleteTeacher"
              :change-teachers-page="changeTeachersPage"
              v-model:teachersPageSize="teachersPageSize"
            />
          </div>
          </div>

                     <!-- 子分頁：空堂事件 -->
          <div v-if="adminSubTab === 'classAway'">
                        <div class="card">
              <div class="card-title">
                <span>📭 空堂事件</span>
                <button class="btn btn-primary btn-sm-pad" @click="openAddClassAwayModal">＋ 新增事件</button>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.5;margin:0 0 12px 0;">
                 期間內符合範圍與節次的班級：課表<strong>淡化顯示</strong>，媒合／衝堂視同空堂；小鐘點匯出依實際未授課扣減。
                 超鐘點以教師名單的學期固定每週節數 × 結算週數計算；尚未設定者暫以課表推算。放假／空堂<strong>不扣超鐘點</strong>，只有固定節次的代課才扣除。小鐘點依實際未授課日扣減。迄日空白＝學期結束。可進互代者可在活動互代面板選事件帶入。
                   節次可選<strong>每日指定</strong>或<strong>連續起迄</strong>：例如兩天每天只停第8節可用一筆事件；若要從第一天某節一路停到末日某節，選連續起迄。各事件可匯出<strong>活動輪值通知單</strong>（只匯已送出；第1～7節入表、早自習／午休計入額度不另列表格、第8節不列入）。
                 <strong>教學組</strong>可到教師課表點停課格，直接做空堂排班（巡堂、支援等）；導師與一般教師會看到提示，不需申請代課。

              </p>
              <div class="table-responsive">
                <table class="custom-table fs-85" >
                  <thead>
                    <tr>
                      <th>名稱</th>
                       <th>起日</th>
                       <th>迄日</th>
                      <th title="多條規則只顯示條數；逐條的範圍、班級、節次、科目、鐘點請按「編輯」查看">停課規則</th>
                      <th>互代</th>
                      <th>啟用</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="ev in classAwayEvents" :key="ev.id">
                      <td><strong>{{ ev.name }}</strong></td>
                       <td>{{ ev.startDate || '未設定' }}</td>
                       <td>{{ ev.endDate || '學期結束' }}</td>
                       <td style="font-size:0.78rem;line-height:1.4;">{{ classAwayEventRuleSummary(ev) }}</td>
                      <td>{{ ev.forMutual ? '是' : '否' }}</td>
                      <td>{{ ev.enabled !== false ? '是' : '否' }}</td>
                      <td>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;">
                          <button class="btn btn-success btn-xs-tight" @click="exportActivityCoverWord(ev)" title="匯出教師代理遺留課務輪值通知單">匯出輪值單</button>
                          <button class="btn btn-secondary btn-xs-tight" @click="openEditClassAwayModal(ev)">編輯</button>
                          <button class="btn btn-secondary" style="padding:3px 8px;font-size:0.7rem;color:var(--color-danger);" @click="deleteClassAwayEvent(ev)">刪除</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!classAwayEvents.length">
                        <td colspan="7" style="text-align:center;padding:20px;color:var(--text-secondary);"><span class="empty-state-title">尚無空堂事件</span><span class="empty-state-hint">畢業／畢旅可新增事件並勾選班級；段考可設定每日指定節次或連續起迄；填科目可只停該科（例：本土語-台語）</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 子分頁：全校日期節次對調 -->
          <div v-if="adminSubTab === 'schoolSwap'">
            <div class="card">
              <div class="card-title">
                <span>🔁 全校日期節次對調</span>
                <button type="button" class="btn btn-primary btn-sm-pad" @click="openAddSchoolSwapModal">＋ 新增對調</button>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin:0 0 12px;">
                只在指定日期交換兩個節次的固定週課表內容，不會改寫「教師課表」。啟用中的設定不可共用同一個實際日期／節次；停用後保留歷史紀錄。
              </p>
              <div class="table-responsive">
                <table class="custom-table fs-85">
                  <thead>
                    <tr>
                      <th>名稱</th>
                      <th>端點 A</th>
                      <th>端點 B</th>
                      <th>狀態</th>
                      <th>更新時間</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in schoolSwapRows" :key="row.id">
                      <td>
                        <strong>{{ row.name }}</strong>
                        <div v-if="row.note" class="req-note-cell">{{ row.note }}</div>
                      </td>
                      <td>{{ formatDateMMDD(row.dateA) }}({{ schoolSwapWeekdayText(row.dateA) }}) {{ formatPeriodText(row.periodA) }}</td>
                      <td>{{ formatDateMMDD(row.dateB) }}({{ schoolSwapWeekdayText(row.dateB) }}) {{ formatPeriodText(row.periodB) }}</td>
                      <td><span class="status-badge" :class="row.enabled ? 'status-approved' : 'status-pending-teacher'">{{ row.enabled ? '啟用' : '停用' }}</span></td>
                      <td>{{ row.updatedAt || row.createdAt || '尚無時間' }}</td>
                      <td>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;">
                          <button type="button" class="btn btn-secondary btn-xs-tight" @click="openEditSchoolSwapModal(row)">編輯</button>
                          <button type="button" class="btn btn-secondary btn-xs-tight" style="color:var(--color-danger);" @click="deleteSchoolSwap(row)">刪除</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!schoolSwapRows.length">
                      <td colspan="6" style="text-align:center;padding:20px;color:var(--text-secondary);">
                        <span class="empty-state-title">尚無全校對調設定</span>
                        <span class="empty-state-hint">新增後，指定日期的教師與班級課表會自動套用。</span>
                      </td>
                    </tr>
                  </tbody>
              </table>
            </div>
          </div>
          </div>

<!-- 子分頁 4：系統設定（空堂事件 → 學期 → 連線唯讀置底） -->
          <div v-if="adminSubTab === 'settings'">
            <div class="card mb-16" style="border-color:#f59e0b;background:#fffbeb;">
              <div class="card-title">
                <span>🖨️ 調代課作業模式</span>
                <span
                  class="status-badge"
                  :class="onlineSubstitutionEnabled ? 'status-approved' : 'status-pending-teacher'"
                  style="font-size:0.75rem;padding:2px 8px;"
                >{{ onlineSubstitutionEnabled ? '線上申請開放' : '紙本模式' }}</span>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin:0 0 10px;">
                關閉後，一般教師仍可查詢適合人選、模擬雙方課表；送出後會建立待教學組核准的申請並列印紙本通知。教學組仍可線上核准，但所有流程不寄通知信，既有歷史紀錄不受影響。
              </p>
              <label style="display:flex;align-items:center;gap:10px;font-size:0.9rem;font-weight:700;cursor:pointer;">
                <input
                  type="checkbox"
                  class="chk-md"
                  :checked="onlineSubstitutionEnabled"
                  @change="setOnlineSubstitutionEnabled($event.target.checked)"
                >
                <span>{{ onlineSubstitutionEnabled ? '目前允許線上調代課申請' : '一般教師送出紙本流程，教學組線上核准且不寄信' }}</span>
              </label>
            </div>

            <!-- 行政代申請：指定行政授權（非一鍵全開） -->
            <div class="card mb-16">
              <div class="card-title">
                <span>📋 行政代申請</span>
                <span
                  class="status-badge"
                  :class="proxySubmitEnabled ? 'status-approved' : 'status-pending-teacher'"
                  style="font-size:0.75rem;padding:2px 8px;"
                >{{ proxySubmitEnabled ? ('已授權 ' + (proxySubmitEmails || []).length + ' 位') : '未授權任何人' }}</span>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin:0 0 12px 0;">
                只開放給<strong>您勾選的行政</strong>（不是一次開全部行政）。
                被授權者可代全校教師送調代課，送出後<strong>跳過受邀確認、直接送教學組核准</strong>，行政<strong>不可</strong>直接出單。
                未勾選的行政仍可看全校課表，但只能申請自己的課。
              </p>
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;">
                <input
                  v-model="proxyGrantQuery"
                  type="search"
                  class="form-input"
                  placeholder="搜尋行政姓名…"
                  style="max-width:220px;padding:6px 10px;font-size:0.85rem;"
                >
                <button
                  v-if="(proxySubmitEmails || []).length"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="clearAllProxySubmitEmails"
                >清空全部授權</button>
                <span class="text-xs-muted-75" v-if="proxySubmitEnabledBy" >
                  最近由 {{ proxySubmitEnabledBy }} 更新
                  <template v-if="proxySubmitEnabledAt">（{{ String(proxySubmitEnabledAt).slice(0, 16).replace('T', ' ') }}）</template>
                </span>
              </div>
              <div v-if="!proxyGrantCandidateTeachers.length" style="font-size:0.85rem;color:var(--text-muted);padding:8px 0;">
                尚無「行政」角色同仁。請先到「教師管理」把人選角色改成<strong>行政</strong>，再回來勾選授權。
              </div>
              <ul v-else style="list-style:none;margin:0;padding:0;max-height:240px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;">
                <li
                  v-for="t in proxyGrantCandidateTeachers"
                    :key="'grant-' + t.loginEmail"
                  style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border-color);"
                >
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;margin:0;font-size:0.88rem;">
                    <input
                      type="checkbox"
                        :checked="isProxySubmitEmailGranted(t.loginEmail)"
                        @change="toggleProxySubmitEmail(t.loginEmail)"
                    >
                    <span class="fw-600" >{{ t.name }}</span>
                    <span class="text-xs-muted-78" >{{ t.loginEmail }}</span>
                    <span class="badge-staff" style="margin-left:auto;">行政</span>
                  </label>
                </li>
              </ul>
            </div>

            <!-- 代課費專案清單：申請單「代課費來源」下拉的唯一來源 -->
            <div class="card mb-16">
              <div class="card-title">
                <span>🧾 代課費專案清單</span>
                <span
                  class="status-badge"
                  :class="(subsidyProjectPlans || []).length ? 'status-approved' : 'status-pending-teacher'"
                  style="font-size:0.75rem;padding:2px 8px;"
                >{{ (subsidyProjectPlans || []).length ? ((subsidyProjectPlans || []).length + ' 個專案') : '僅公付' }}</span>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin:0 0 10px;">
                申請單「代課費來源」只從這裡取值。填了專案的代課節數，匯出時會從<strong>公付代課</strong>移到專案自己的印領清冊（每個專案一張）；空白一律視為公付。
              </p>
              <input
                class="form-input"
                type="text"
                :value="(subsidyProjectPlans || []).join('、')"
                placeholder="例：深耕計畫、雙語計畫（以「、」分隔；清空＝全部公付）"
                @change="saveSubsidyProjectPlans($event.target.value)"
              >
              <small style="display:block;margin-top:6px;color:var(--text-muted);">
                改名不回溯：既有紀錄仍列在原本的專案名稱表，不會跳到新名稱。
              </small>
            </div>

            <!-- 學期管理 -->
            <div class="card mb-16">
              <div class="card-title">
                <span>📅 學期管理</span>
                <button class="btn btn-primary btn-sm-pad" @click="openAddSemesterModal">＋ 新增學期</button>
              </div>
              <div class="table-responsive">
                <table class="custom-table">
                  <thead>
                    <tr>
                      <th>學期代號</th>
                      <th>學期名稱</th>
                      <th>開始日期</th>
                      <th>結束日期</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="sem in semestersList" :key="sem.id" :style="sem.isDefault ? 'background: #dcfce7;' : ''">
                      <td><strong>{{ sem.id }}</strong></td>
                      <td>{{ sem.name }}</td>
                      <td>{{ sem.startDate || '---' }}</td>
                      <td>{{ sem.endDate || '---' }}</td>
                      <td>
                        <div style="display: flex; gap: 4px;">
                          <button class="btn btn-secondary btn-xs-tight" @click="openEditSemesterModal(sem)">編輯</button>
                          <button class="btn btn-success btn-xs-tight" :disabled="sem.isDefault" @click="setDefaultSemester(sem.id)">設為預設</button>
                          <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 0.7rem; color: var(--color-danger);" @click="deleteSemester(sem.id)">刪除</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="semestersList.length === 0">
                      <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);"><span class="empty-state-title">尚無學期資料</span><span class="empty-state-hint">請新增第一個學期後開始使用</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 連線設定：固定唯讀、置底、不寫 localStorage -->
            <div class="card">
              <div class="card-title"><span>🔗 連線設定</span></div>
              <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0 8px;">
                <div>
                  <label class="form-label fs-78">GAS Web App 網址</label>
                  <input type="text" class="form-input btn-ghost-muted" :value="String(gasApiUrl).slice(0,24)+'…'+String(gasApiUrl).slice(-4)" readonly title="完整網址已隱藏，避免隨手外流；功能不受影響">
                </div>
                <div>
                  <label class="form-label fs-78">Google OAuth Client ID</label>
                  <input type="text" class="form-input btn-ghost-muted" :value="String(googleClientId).slice(0,12)+'…'+String(googleClientId).slice(-12)" readonly title="完整 Client ID 已隱藏，避免隨手外流；登入功能不受影響">
                </div>
                <p style="font-size:0.72rem;color:var(--text-muted);margin:0;">固定內建連線，不可於介面修改，亦不寫入本機。</p>
              </div>
            </div>
          </div>
        </div>
</template>

<script setup>
import { defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { useAdminStore } from '../stores/admin.js';
import { useBackofficeStore } from '../stores/backoffice.js';
import { useDataStore } from '../stores/data.js';
import { useHomeroomStore } from '../stores/homeroom.js';
import { useInteractionStore } from '../stores/interaction.js';
import { useMutualStore } from '../stores/mutual.js';
import { useOutputStore } from '../stores/output.js';
import { useSessionStore } from '../stores/session.js';
import { useTimetableStore } from '../stores/timetable.js';

const TeachersTable = defineAsyncComponent(() => import('./TeachersTable.vue'));
const adminStore = useAdminStore();
const { showImportTeachersModal } = storeToRefs(adminStore);
const { deleteTeacher, fillFixedOvertimeForAllTeachers, openAddTeacherModal, openEditTeacherModal, openOvertimePlanModal, openQuotaLedger, openTeacherExpenseAuditModal, updateTeacherBaseHours } = adminStore;
const backofficeStore = useBackofficeStore();
const { classAwayEventRuleSummary, deleteClassAwayEvent, openAddClassAwayModal, openEditClassAwayModal, openManualQuotaAdjust } = backofficeStore;
const dataStore = useDataStore();
const { accountingExportLoading, monthlyReportData, monthlyReportLoading, monthlyReportTotals, period8ExportLoading, period8Loading, period8RosterRows, proxyGrantCandidateTeachers, reportEndDate, reportStartDate, reportWeeksCount } = storeToRefs(dataStore);
const { clearAllProxySubmitEmails, deleteSemester, formatDateMMDD, formatMoney, getSubjectStyle, getTeacherNameByEmail, getTeacherTimetableHours, isProxySubmitEmailGranted, openAddSemesterModal, openEditSemesterModal, period8CellsFor, period8StatusLabel, setDefaultSemester } = dataStore;
const homeroomStore = useHomeroomStore();
const { assignHomeroomTeacher, deleteHomeroomRecord, onHomeroomInputSelect, openManualHomeroomModal } = homeroomStore;
const interactionStore = useInteractionStore();
const { filteredSchoolExportTeachers, schoolExportEnd, schoolExportIncludeWeekend, schoolExportOnlyChanged, schoolExportSelectedEmails, schoolExportStart, schoolExportTeacherFilter } = storeToRefs(interactionStore);
const { changePeriod8Week, goToPeriod8ThisWeek, handlePeriod8CellClick } = interactionStore;
const mutualStore = useMutualStore();
const { period8WeekDates, period8WeekNumber } = storeToRefs(mutualStore);
const outputStore = useOutputStore();
const { calculateMonthlyReport, clearSchoolExportTeachers, exportActivityCoverWord, exportInvigilationClassWorkbook, exportInvigilationWorkbook, exportPeriod8Accounting, exportSchoolTimetableWord, exportSubFeeToExcel, isSchoolExportTeacherSelected, selectAllSchoolExportTeachers, setSchoolExportThisWeek, shiftReportPeriod, toggleSchoolExportTeacher } = outputStore;
const sessionStore = useSessionStore();
const { adminSubTab, classAwayEvents, gasApiUrl, googleClientId, homeroomAssignSelections, homeroomRecordsLoading, isAdmin, loading, onlineSubstitutionEnabled, proxyGrantQuery, proxySubmitEmails, proxySubmitEnabled, proxySubmitEnabledAt, proxySubmitEnabledBy, schoolSwapRows, semestersList, subsidyProjectPlans, teachersList } = storeToRefs(sessionStore);
const { saveSubsidyProjectPlans, schoolSwapWeekdayText, setOnlineSubstitutionEnabled, toggleProxySubmitEmail } = sessionStore;
const timetableStore = useTimetableStore();
const { currentMonthHomeroomAssignedCount, currentMonthHomeroomFeeTotal, currentMonthHomeroomPendingCount, currentMonthHomeroomRecords, pagedTeachersListDetails, teachersListDetails, teachersNeedPager, teachersPage, teachersPageSize, teachersTotalPages } = storeToRefs(timetableStore);
const { changeTeachersPage, deleteSchoolSwap, formatPeriodText, getExpensePlanSummary, getHomeroomCoverCandidates, openAddSchoolSwapModal, openEditSchoolSwapModal } = timetableStore;
</script>
