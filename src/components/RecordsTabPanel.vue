<template>
        <div data-tour="history-panel">
          <div class="card">
            <div class="card-title">
              <span>📅 歷史紀錄與列印</span>
              <div class="action-buttons">
                <!-- 一鍵列印勾選的單據 -->
                <button
                  v-if="isAdmin && !notificationsSuppressed"
                  class="btn btn-success btn-md"
                  :disabled="!selectedRecordIds.length"
                  @click="sendSelectedBatchNotices"
                  title="依代課老師合併寄出（後發通知，適合活動互代先排後寄）"
                >📧 批次發通知信</button>
                <button class="btn btn-primary btn-md" @click="openHistoryPrintPreview" title="依待辦批核相同的分組規則預覽並列印">🖨️ 預覽／列印代（調、補）課單</button>
              </div>
            </div>

            <!-- 篩選工具列（手機不撐滿 100%） -->
            <div class="toolbar history-filter-bar" style="align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="history-filter-label">類型</span>
              <div class="filter-chip-group" aria-label="紀錄類型篩選">
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'all' }" @click="setHistoryTypeFilter('all')">全部</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'substitution' }" @click="setHistoryTypeFilter('substitution')">代課</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'exchange' }" @click="setHistoryTypeFilter('exchange')">調課</button>
                <button v-if="isAdmin" type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'exception' }" @click="setHistoryTypeFilter('exception')">特例</button>
              </div>
              <span class="history-filter-label">日期</span>
              <div class="filter-chip-group">
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'all' }" @click="setHistoryFilterMode('all')">全部</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'day' }" @click="setHistoryFilterMode('day')">本日</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'week' }" @click="setHistoryFilterMode('week')">本週</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'month' }" @click="setHistoryFilterMode('month')">本月</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'range' }" @click="setHistoryFilterMode('range')" title="明確日期區間：自訂起日與迄日">區間</button>
              </div>
              <template v-if="historyFilterMode === 'range'">
                <input
                  type="date"
                  class="form-control filter-date"
                  style="padding: 4px 8px; font-size: 0.75rem; max-width: 140px;"
                  v-model="historyRangeStart"
                  aria-label="區間起日"
                >
                <span style="font-size: 0.75rem; color: var(--text-muted);">～</span>
                <input
                  type="date"
                  class="form-control filter-date"
                  style="padding: 4px 8px; font-size: 0.75rem; max-width: 140px;"
                  v-model="historyRangeEnd"
                  aria-label="區間迄日"
                >
                <button
                  type="button"
                  class="btn btn-secondary btn-sm-tight"
                  @click="applyHistoryRangeFilter"
                  title="套用日期區間並自動補載該區間涵蓋月份的紀錄"
                >套用區間</button>
              </template>
              <input type="search" class="form-control filter-search" style="padding: 4px 8px; font-size: 0.75rem; max-width: 220px;" v-model="historySearchQuery" placeholder="單號／教師／班級／科目／日期" @input="historyPage=1">
              <button
                v-if="!historyFullLoaded"
                type="button"
                class="btn btn-secondary btn-sm-tight"
                :disabled="historyLoadingFull"
                @click="loadFullSemesterHistory"
                title="一次載入整學期（較慢，必要時再用）"
              >{{ historyLoadingFull ? '載入中…' : '完整學期' }}</button>
              <button
                v-if="historyFullLoaded || historyLoadedMonths.length"
                type="button"
                class="btn btn-secondary btn-sm-tight"
                @click="reloadWindowedHistory"
                title="恢復近兩週視窗以加速"
              >恢復近兩週</button>
              <span class="filter-count" style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">
                共 {{ dateFilteredHistoryRecords.length }} 筆
                <span v-if="historyFullLoaded" class="opacity-85">（完整學期）</span>
                <span v-else-if="historyLoadedMonths.length" class="opacity-85">（已併 {{ historyLoadedMonths.join('、') }}）</span>
                <span v-else-if="requestWindowInfo && requestWindowInfo.cutoffDate" class="opacity-85">（近{{ requestWindowInfo.windowDays || 14 }}天＋未結案）</span>
              </span>
            </div>

            <div class="table-responsive">
              <table class="custom-table history-table">
                <colgroup>
                  <col class="hist-col-serial">
                  <col class="hist-col-date">
                  <col class="hist-col-type">
                  <col class="hist-col-teacher">
                  <col class="hist-col-teacher">
                  <col class="hist-col-slot">
                  <col class="hist-col-slot">
                  <col class="hist-col-status">
                  <col v-if="isAdmin || isStaff" class="hist-col-actions">
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <div class="flex-row-gap-6">
                        <input type="checkbox" class="hist-select-all chk-14-shrink" @change="toggleSelectAllRecords($event)">
                        <span>單號</span>
                      </div>
                    </th>
                    <th>申請日期</th>
                    <th>類型</th>
                    <th>請假教師</th>
                    <th>代課/對調教師</th>
                    <th>請假課堂</th>
                    <th>對調課堂</th>
                    <th>狀態</th>
                    <th v-if="isAdmin || isStaff">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in paginatedHistoryRecords" :key="row.displayKey">
                    <tr v-if="row.displayKind === 'batch'" class="batch-group-row batch-group-data-row" @click="toggleBatchGroup('history', row.batchId)">
                      <td>
                        <div class="batch-group-first-cell">
                          <input
                            type="checkbox"
                            class="batch-group-checkbox chk-14-shrink"
                            :checked="isHistoryBatchGroupSelected(row)"
                            :aria-label="'選取批次 ' + row.batchId + ' 的全部紀錄'"
                            title="選取此批次全部紀錄"
                            @click.stop
                            @change.stop="toggleHistoryBatchGroupSelection(row, $event)"
                          >
                          <button type="button" class="batch-group-expand" :aria-expanded="isBatchGroupExpanded('history', row.batchId)" @click.stop="toggleBatchGroup('history', row.batchId)">
                            <span class="batch-group-chevron" :class="{ 'is-open': isBatchGroupExpanded('history', row.batchId) }" aria-hidden="true">›</span>
                            <strong>{{ row.items[0].serial || (row.isTriangle ? '三角調整組' : '批次申請') }}</strong>
                          </button>
                        </div>
                        <div class="batch-group-inline-meta">{{ row.isTriangle ? '三角調整組' : '批次申請' }} · {{ row.items.length }} 筆</div>
                      </td>
                      <td>{{ row.items[0].createdDate }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge" :class="requestTypeBadgeClass(row.items[0])">{{ requestTypeLabel(row.items[0]) }}</span>
                          <span class="status-badge tag-gray fs-65">{{ row.isTriangle ? '整組' : '批次' }} {{ row.items.length }} 筆</span>
                        </div>
                      </td>
                      <td>{{ row.isTriangle ? getBatchGroupRequesterSummary(row) : row.items[0].requesterName }}</td>
                       <td>{{ getBatchGroupTeacherSummary(row) }}</td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatHistoryLeaveSlot) }}</span></td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatHistoryExchangeSlot) }}</span></td>
                      <td>
                        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                          <span class="status-badge" :class="getBatchGroupStatusClass(row)">{{ getBatchGroupStatusText(row) }}</span>
                          <span class="badge-print badge-unprinted">批次</span>
                        </div>
                      </td>
                      <td v-if="isAdmin || isStaff">
                        <button type="button" class="btn btn-secondary btn-md-nowrap batch-group-action-button" @click.stop="toggleBatchGroup('history', row.batchId)">{{ isBatchGroupExpanded('history', row.batchId) ? '收合' : '展開' }}</button>
                      </td>
                    </tr>
                    <tr v-else :class="['cursor-pointer', { 'batch-child-row': row.batchGroupKey }]" @click="showDetailForRecord(row.id, row.requestId)">
                      <td class="hist-td-serial">
                        <div class="hist-serial-row">
                          <input type="checkbox" class="hist-select-cb chk-14-shrink" :value="row.id" :data-rec-id="row.id" :checked="isHistoryRecordSelected(row.id)" @click.stop>
                          <strong class="hist-serial-text" :title="row.serial">{{ row.serial }}</strong>
                        </div>
                        <div v-if="row.note" class="req-note-cell" :title="row.note">{{ row.note }}</div>
                      </td>
                      <td>{{ row.createdDate }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge" :class="requestTypeBadgeClass(row)">{{ requestTypeLabel(row) }}</span>
                          <span v-if="row.type === 'triangle'" class="status-badge tag-gray fs-65" title="三角調整組：共 3 筆輪替">{{ triangleLegLabel(row) }}</span>
                           <span v-for="tag in getRequestTypeTags(row)" :key="tag.key" class="risk-tag risk-tag-xs" :class="'risk-'+tag.key">{{ tag.label }}</span>
                        </div>
                      </td>
                      <td>{{ row.requesterName }}</td>
                      <td>{{ row.targetTeacherName }}</td>
                      <td>
                        <span class="hist-slot-inline">
                          {{ formatHistoryLeaveSlot(row) }}
                          <span v-if="isHistoryLeaveRestricted(row)" class="status-badge tag-restricted">綁課</span>
                            <span v-if="isHistoryLeaveRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <span class="hist-slot-inline">
                           {{ formatHistoryExchangeSlot(row) }}
                           <span v-if="isHistoryExchangeRestricted(row)" class="status-badge tag-restricted">綁課</span>
                           <span v-if="isHistoryExchangeRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                          <span class="status-badge" :class="'status-' + (row.status ? row.status.toLowerCase() : 'approved')">
                            {{ getStatusText(row.status || 'approved') }}
                          </span>
                          <span class="badge-print" :class="row.printed ? 'badge-printed' : 'badge-unprinted'">
                            {{ row.printed ? '已列印' : '未列印' }}
                          </span>
                        </div>
                      </td>
                        <td v-if="isAdmin || isStaff" @click.stop>
                          <div class="hist-actions">
                            <button type="button" class="btn btn-secondary" title="列印此筆通知單" aria-label="列印此筆通知單" @click="printSingleRequest({ recordId: row.id }, 'Notice')">🖨️</button>
                            <template v-if="isAdmin">
                              <button type="button" class="btn btn-secondary" @click="openHistoryEditModal(row)">編輯</button>
                              <button type="button" class="btn btn-secondary" style="color: var(--color-danger); border-color: rgba(220, 38, 38, 0.18);" @click="deleteSubstitutionRecord(row.id, row.requestId)">撤銷</button>
                            </template>
                          </div>
                        </td>
                    </tr>
                  </template>
                  <tr v-if="dateFilteredHistoryRecords.length === 0">
                    <td :colspan="isAdmin || isStaff ? 9 : 8" class="table-empty">
                      <span class="empty-state-title">沒有符合條件的紀錄</span>
                      <span class="empty-state-hint">可調整日期範圍或搜尋條件</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 分頁控制 -->
             <div v-if="historyTotalPages > 1" class="flex-center-pad" style="margin-top:16px;">
              <button class="btn btn-secondary" :disabled="historyPage<=1" @click="changeHistoryPage(historyPage-1)">‹ 上一頁</button>
              <span class="text-xs-muted">第 {{ historyPage }} / {{ historyTotalPages }} 頁</span>
              <button class="btn btn-secondary btn-sm-75" :disabled="historyPage >= historyTotalPages" @click="changeHistoryPage(historyPage + 1)">下一頁 ›</button>
            </div>
          </div>
        </div>
</template>

<script setup>
import { storeToRefs } from 'pinia';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';
import { useAdminStore } from '../stores/admin.js';
import { useBackofficeStore } from '../stores/backoffice.js';
import { useDataStore } from '../stores/data.js';
import { useHistoryStore } from '../stores/history.js';
import { useInteractionStore } from '../stores/interaction.js';
import { useMutualStore } from '../stores/mutual.js';
import { useOutputStore } from '../stores/output.js';
import { useRequestsStore } from '../stores/requests.js';
import { useSessionStore } from '../stores/session.js';
import { useSubmitStore } from '../stores/submit.js';
import { useTimetableStore } from '../stores/timetable.js';

const { getRequestTypeTags } = UiLineTemplate;
const { getBatchGroupRequesterSummary, getBatchGroupSlotSummary, getBatchGroupStatusClass, getBatchGroupStatusText, getBatchGroupTeacherSummary, getStatusText, requestTypeBadgeClass, requestTypeLabel, triangleLegLabel } = UiListHelpers;
const adminStore = useAdminStore();
const { openHistoryEditModal } = adminStore;
const backofficeStore = useBackofficeStore();
const { changeHistoryPage, isHistoryBatchGroupSelected, isHistoryRecordSelected, toggleHistoryBatchGroupSelection, toggleSelectAllRecords } = backofficeStore;
const dataStore = useDataStore();
const { historyFullLoaded, historyLoadedMonths, historyLoadingFull, requestWindowInfo } = storeToRefs(dataStore);
const historyStore = useHistoryStore();
const { loadFullSemesterHistory, reloadWindowedHistory, setHistoryFilterMode, setHistoryRangeFilter, setHistoryTypeFilter } = historyStore;
const interactionStore = useInteractionStore();
const { showDetailForRecord } = interactionStore;
const mutualStore = useMutualStore();
const { historyFilterMode, historyPage, historyRangeEnd, historyRangeStart, historySearchQuery, historyTypeFilter, selectedRecordIds } = storeToRefs(mutualStore);
const outputStore = useOutputStore();
const { openHistoryPrintPreview, printSingleRequest } = outputStore;
const requestsStore = useRequestsStore();
const { deleteSubstitutionRecord, sendSelectedBatchNotices } = requestsStore;
const sessionStore = useSessionStore();
const { isAdmin, isStaff } = storeToRefs(sessionStore);
const submitStore = useSubmitStore();
const { notificationsSuppressed } = storeToRefs(submitStore);
const timetableStore = useTimetableStore();
const { dateFilteredHistoryRecords, historyTotalPages, paginatedHistoryRecords } = storeToRefs(timetableStore);
const { formatHistoryExchangeSlot, formatHistoryLeaveSlot, isBatchGroupExpanded, isHistoryExchangeRechanged, isHistoryExchangeRestricted, isHistoryLeaveRechanged, isHistoryLeaveRestricted, toggleBatchGroup } = timetableStore;

const applyHistoryRangeFilter = () => {
  setHistoryRangeFilter(historyRangeStart.value, historyRangeEnd.value);
};
</script>
