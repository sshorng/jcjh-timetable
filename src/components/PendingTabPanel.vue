<template>
        <div>
          
          <div class="card" style="margin-bottom:12px;padding:12px 16px;">
            <div class="flex-wrap-gap-8-mb" style="margin-bottom:0;">
              <label class="form-label m-0" style="font-size:0.85rem;white-space:nowrap;">搜尋申請單</label>
              <input
                type="search"
                class="form-control"
                style="flex:1;min-width:180px;max-width:360px;padding:6px 10px;font-size:0.85rem;"
                v-model="pendingSearchQuery"
                placeholder="單號／教師／班級／科目／日期／假別"
              >
            </div>
          </div>

           <!-- 0. 全校待處理單據；staff 只讀，管理員可簽核 -->
           <div class="card" v-if="isAdmin || isStaff" data-tour="pending-admin">
             <div class="card-title" style="flex-wrap: wrap; gap: 8px;">
                 <span>📝 {{ isAdmin ? '待核准發放' : '全校待處理申請' }}（共 {{ pendingSearchQuery ? (filteredAdminPendingRequests.length + '／篩選') : (adminPendingRequests.length + ' 筆') }}）</span>
               <div class="batch-bar" v-if="adminPendingRequests.length > 0">
                 <button type="button" class="btn btn-secondary pad-6-10-78"  @click="toggleSelectAllAdminPending">
                   {{ isAdminPendingPageFullySelected() ? '取消本頁全選' : '本頁全選' }}
                 </button>
                <button v-if="isAdmin" type="button" class="btn btn-secondary btn-sm-78" :disabled="selectedAdminPendingIds.length < 2" title="把勾選的申請單寫上同一個新的批次ID（併批後一起簽核、一起列印）" @click="mergeSelectedAdminPendingBatch">
                  🧷 併單
                </button>
                 <button type="button" class="btn btn-secondary btn-sm-78" :disabled="!selectedAdminPendingIds.length" @click="openBatchPendingPrintPreview">
                   🖨️ 批次預覽列印 ({{ selectedAdminPendingIds.length }})
                 </button>
                 <button v-if="isAdmin" type="button" class="btn btn-success btn-sm-78" :disabled="!selectedAdminPendingIds.length" @click="batchAdminApprove">
                   ✔ 批次核准 ({{ selectedAdminPendingIds.length }})
                 </button>
                 <button v-if="isAdmin" type="button" class="btn btn-danger btn-sm-78" :disabled="!selectedAdminPendingIds.length" @click="batchAdminReject">
                   ✘ 批次駁回 ({{ selectedAdminPendingIds.length }})
                 </button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="custom-table req-table-aligned">
                <colgroup>
                  <col class="col-serial"><col class="col-date"><col class="col-type"><col class="col-teacher"><col class="col-teacher"><col class="col-slot"><col class="col-slot"><col class="col-status"><col class="col-actions">
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <div class="flex-row-gap-6">
                        <input type="checkbox" class="admin-select-all chk-sm" :checked="isAdminPendingPageFullySelected()" @change="toggleSelectAllAdminPending($event)">
                        <span>單號</span>
                      </div>
                    </th>
                    <th>申請日期</th>
                    <th>類型</th>
                    <th>申請教師</th>
                    <th>代課/對調教師</th>
                    <th>請假課堂</th>
                    <th>對調課堂</th>
                    <th>狀態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in paginatedAdminPending" :key="row.displayKey">
                    <tr v-if="row.displayKind === 'batch'" class="batch-group-row batch-group-data-row" @click="toggleBatchGroup('admin', row.batchId)">
                      <td>
                        <div class="batch-group-first-cell">
                          <input
                            type="checkbox"
                            class="batch-group-checkbox chk-sm"
                            :checked="isAdminBatchGroupSelected(row)"
                            :aria-label="'選取批次 ' + row.batchId + ' 的全部申請'"
                            title="選取此批次全部申請"
                            @click.stop
                            @change.stop="toggleAdminBatchGroupSelection(row, $event)"
                          >
                          <button type="button" class="batch-group-expand" :aria-expanded="isBatchGroupExpanded('admin', row.batchId)" @click.stop="toggleBatchGroup('admin', row.batchId)">
                            <span class="batch-group-chevron" :class="{ 'is-open': isBatchGroupExpanded('admin', row.batchId) }" aria-hidden="true">›</span>
                            <strong>{{ row.items[0].serial || '批次申請' }}</strong>
                          </button>
                        </div>
                        <div class="batch-group-inline-meta">{{ row.isTriangle ? '三角調整組' : '批次申請' }} · {{ row.items.length }} 筆</div>
                      </td>
                      <td>{{ formatRequestApplicationDate(row.items[0]) }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge" :class="requestTypeBadgeClass(row.items[0])">{{ requestTypeLabel(row.items[0]) }}</span>
                          <span class="status-badge tag-gray fs-65">{{ row.isTriangle ? '整組' : '批次' }} {{ row.items.length }} 筆</span>
                        </div>
                      </td>
                      <td>{{ row.isTriangle ? getBatchGroupRequesterSummary(row) : row.items[0].requesterName }}</td>
                       <td>{{ getBatchGroupTeacherSummary(row) }}</td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatLeaveClassSlot) }}</span></td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatExchangeClassSlot) }}</span></td>
                      <td><span class="status-badge w-fit-fs-75" :class="getBatchGroupStatusClass(row)">{{ getBatchGroupStatusText(row) }}</span></td>
                      <td>
                        <button type="button" class="btn btn-secondary btn-md-nowrap batch-group-action-button" @click.stop="toggleBatchGroup('admin', row.batchId)">{{ isBatchGroupExpanded('admin', row.batchId) ? '收合' : '展開' }}</button>
                      </td>
                    </tr>
                    <tr v-else :class="['cursor-pointer', { 'batch-child-row': row.batchGroupKey }]" @click="detailRequest = row; detailSubRecord = null; showDetailModal = true">
                      <td>
                        <div class="flex-row-gap-6">
                          <input type="checkbox" class="admin-select-cb chk-sm" :value="row.id" :data-req-id="row.id" :checked="isAdminPendingSelected(row.id)" :title="row.type === 'triangle' ? '選取整組三角調申請' : ''" @change="toggleAdminPendingSelect(row.id, $event)" @click.stop>
                          <strong>{{ row.serial || '---' }}</strong>
                        </div>
                        <div v-if="row.note" class="req-note-cell" :title="row.note">{{ row.note }}</div>
                      </td>
                      <td>{{ formatRequestApplicationDate(row) }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                            <span class="status-badge" :class="requestTypeBadgeClass(row)">{{ requestTypeLabel(row) }}</span>
                          <span v-if="row.type === 'triangle'" class="status-badge tag-gray fs-65" title="三角調整組：共 3 筆輪替（每一位教師各一筆）">{{ triangleLegLabel(row) }}</span>
                           <span v-for="tag in getRequestTypeTags(row)" :key="tag.key" class="risk-tag" :class="'risk-'+tag.key">{{ tag.label }}</span>
                          <span
                             v-for="rf in getApproveRiskFlags(row).filter(f => (f.level === 'warn' || f.level === 'danger') && f.key !== 'chain')"
                            :key="'arf-'+rf.key"
                            class="risk-tag"
                            :class="rf.level === 'danger' ? 'risk-danger' : 'risk-warn'"
                          >{{ rf.label }}</span>
                        </div>
                      </td>
                      <td>
                        {{ row.requesterName }}
                        <div v-if="row.isProxySubmit || (row.note && row.note.indexOf('[行政代申請') >= 0)" class="req-note-cell no-checkbox" style="color:#b45309;">
                          代申請{{ row.proxyByName ? '：' + row.proxyByName : '' }}
                        </div>
                      </td>
                      <td>{{ row.targetTeacherName }}</td>
                      <td>
                        <span class="hist-slot-inline">
                          {{ formatLeaveClassSlot(row) }}
                          <span v-if="isLeaveClassRestricted(row)" class="status-badge tag-restricted">綁課</span>
                          <span v-if="isRequestLeaveRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <span class="hist-slot-inline">
                          {{ formatExchangeClassSlot(row) }}
                          <span v-if="isExchangeClassRestricted(row)" class="status-badge tag-restricted">綁課</span>
                          <span v-if="isRequestExchangeRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <span class="status-badge w-fit-fs-75" :class="'status-' + (row.status ? row.status.toLowerCase() : 'pending_admin')">
                          {{ getStatusText(row.status) }}
                        </span>
                      </td>
                      <td @click.stop>
                        <div class="action-buttons action-buttons-row">
                          <button v-if="isAdmin" class="btn btn-secondary btn-md-nowrap" title="編輯申請" aria-label="編輯申請" @click="openHistoryEditModal(row)">編輯</button>
                          <button v-if="row.type !== 'triangle' || isPaperFlowRequest(row)" class="btn btn-secondary btn-md-nowrap" title="列印通知" aria-label="列印通知" @click="openPaperPrintForRequest(row)">🖨️</button>
                           <button v-if="isAdmin" class="btn btn-success btn-md-nowrap" title="核准並出單" aria-label="核准並出單" @click="adminApprove(row.id)">✓</button>
                           <button v-if="isAdmin" class="btn btn-danger btn-md-nowrap" title="退回申請" aria-label="退回申請" @click="adminReject(row.id)">❌</button>
                        </div>
                      </td>
                    </tr>
                  </template>
                  <tr v-if="paginatedAdminPending.length === 0">
                    <td colspan="9" class="empty-table-cell">沒有待核准的單據。</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="pendingAdminTotal > 1" class="flex-center-pad">
                <button class="btn btn-secondary btn-xs-tight" :disabled="pendingAdminPage<=1" @click="changePendingPage('admin', pendingAdminPage-1)">‹</button>
                <span class="text-xs-muted">{{ pendingAdminPage }}/{{ pendingAdminTotal }}</span>
                <button class="btn btn-secondary btn-xs-tight" :disabled="pendingAdminPage>=pendingAdminTotal" @click="changePendingPage('admin', pendingAdminPage+1)">›</button>
              </div>
            </div>
          </div>

          <!-- 1. 待我簽核 (受邀教師確認) -->
          <div class="card" data-tour="pending-invite">
            <div class="card-title">
              <span>📝 收到的邀請</span>
            </div>
            
            <div class="table-responsive">
              <table class="custom-table req-table-aligned">
                <colgroup>
                  <col class="col-serial"><col class="col-date"><col class="col-type"><col class="col-teacher"><col class="col-teacher"><col class="col-slot"><col class="col-slot"><col class="col-status"><col class="col-actions">
                </colgroup>
                <thead>
                  <tr>
                    <th>單號</th>
                    <th>申請日期</th>
                    <th>類型</th>
                    <th>申請教師</th>
                    <th>代課/對調教師</th>
                    <th>請假課堂</th>
                    <th>對調課堂</th>
                    <th>狀態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- 導覽用虛擬邀請（不寫入資料庫） -->
                  <tr v-if="tourDemoInvite" data-tour="pending-invite-demo" style="background:#fffbeb;">
                    <td>
                      <strong>{{ tourDemoInvite.serial }}</strong>
                      <div class="req-note-cell no-checkbox" style="color:#b45309;">※ 導覽示範，非真實申請</div>
                    </td>
                    <td>{{ tourDemoInvite.createdAt }}</td>
                    <td>
                      <div class="flex-wrap-gap">
                        <span class="status-badge tag-red">代課</span>
                        <span class="risk-tag" style="font-size:0.68rem;padding:1px 4px;background:#fef3c7;color:#92400e;">示範</span>
                      </div>
                    </td>
                    <td>{{ tourDemoInvite.requesterName }}</td>
                     <td>{{ tourDemoInvite.targetTeacherName }} <span class="text-xs-muted">（您）</span></td>
                    <td>
                      <span class="hist-slot-inline">{{ tourDemoInvite.leaveSlot }}</span>
                    </td>
                    <td>
                       <span class="hist-slot-inline text-muted">無</span>
                    </td>
                    <td>
                      <span class="status-badge tag-orange w-fit-fs-75">待您簽核</span>
                    </td>
                    <td>
                      <div class="action-buttons action-buttons-col">
                        <div class="flex-gap-6">
                          <button class="btn btn-success btn-md-nowrap" @click="tourDemoInviteRespond('agree')">同意</button>
                          <button class="btn btn-danger btn-md-nowrap" @click="tourDemoInviteRespond('decline')">拒絕</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr v-for="req in paginatedMyPending" :key="req.id" class="cursor-pointer" @click="detailRequest = req; detailSubRecord = null; showDetailModal = true">
                    <td>
                      <strong>{{ req.serial || '---' }}</strong>
                      <div v-if="req.note" class="req-note-cell no-checkbox" :title="req.note">{{ req.note }}</div>
                    </td>
                    <td>{{ formatRequestApplicationDate(req) }}</td>
                    <td>
                      <div class="flex-wrap-gap">
                         <span class="status-badge" :class="requestTypeBadgeClass(req)">{{ requestTypeLabel(req) }}</span>
                         <span v-if="req.batchId && req.type !== 'triangle'" class="status-badge tag-gray fs-65" title="同批次可全部同意">批次</span>
                         <span v-if="req.type === 'triangle'" class="status-badge tag-gray fs-65" title="三角調整組：共 3 筆輪替，三位教師全部同意後才送教學組">{{ triangleLegLabel(req) }}</span>
                        <span v-for="tag in getRequestTypeTags(req)" :key="tag.key" class="risk-tag badge-micro" :class="'risk-'+tag.key">{{ tag.label }}</span>
                      </div>
                    </td>
                    <td>{{ req.requesterName }}</td>
                     <td>{{ req.targetTeacherName }} <span class="text-xs-muted">（您）</span></td>
                    <td>
                      <span class="hist-slot-inline">
                        {{ formatLeaveClassSlot(req) }}
                        <span v-if="isLeaveClassRestricted(req)" class="status-badge tag-restricted">綁課</span>
                        <span v-if="isRequestLeaveRechanged(req)" class="risk-tag risk-chain">再異動</span>
                      </span>
                    </td>
                    <td>
                      <span class="hist-slot-inline">
                        {{ formatExchangeClassSlot(req) }}
                        <span v-if="isExchangeClassRestricted(req)" class="status-badge tag-restricted">綁課</span>
                        <span v-if="isRequestExchangeRechanged(req)" class="risk-tag risk-chain">再異動</span>
                      </span>
                    </td>
                    <td>
                      <span class="status-badge tag-orange w-fit-fs-75">待您簽核</span>
                    </td>
                    <td @click.stop>
                      <div class="action-buttons action-buttons-col">
                        <button v-if="isAdmin" class="btn btn-secondary btn-md-nowrap" @click="openHistoryEditModal(req)">編輯</button>
                        <button class="btn btn-secondary btn-md-nowrap" @click="openPaperPrintForRequest(req)">🖨️ 列印</button>
                        <button v-if="req.batchId && req.type !== 'triangle'" class="btn btn-success" style="padding: 5px 8px; font-size: 0.72rem; white-space: nowrap;" @click="respondToBatch(req.batchId, 'agree')">全部同意</button>
                        <div class="flex-gap-6">
                          <button class="btn btn-success btn-md-nowrap" @click="respondToRequest(req.id, 'agree')">同意</button>
                          <button class="btn btn-danger btn-md-nowrap" @click="respondToRequest(req.id, 'decline')">拒絕</button>
                        </div>
                         <button v-if="req.batchId && req.type !== 'triangle'" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.7rem; white-space: nowrap; color: var(--color-danger);" @click="respondToBatch(req.batchId, 'decline')">全部拒絕</button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="paginatedMyPending.length === 0 && !tourDemoInvite">
                    <td colspan="9" class="empty-table-cell">沒有待處理的簽核邀請。</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="pendingMyPendingTotal > 1" class="flex-center-pad">
                <button class="btn btn-secondary btn-xs-tight" :disabled="pendingMyPendingPage<=1" @click="changePendingPage('pending', pendingMyPendingPage-1)">‹</button>
                <span class="text-xs-muted">{{ pendingMyPendingPage }}/{{ pendingMyPendingTotal }}</span>
                <button class="btn btn-secondary btn-xs-tight" :disabled="pendingMyPendingPage>=pendingMyPendingTotal" @click="changePendingPage('pending', pendingMyPendingPage+1)">›</button>
              </div>
            </div>
          </div>

          <!-- 2. 我發起的申請 -->
          <div class="card" data-tour="pending-sent">
            <div class="card-title">
              <span>📝 送出的申請</span>
            </div>
            
            <div class="table-responsive">
              <table class="custom-table req-table-aligned">
                <colgroup>
                  <col class="col-serial"><col class="col-date"><col class="col-type"><col class="col-teacher"><col class="col-teacher"><col class="col-slot"><col class="col-slot"><col class="col-status"><col class="col-actions">
                </colgroup>
                <thead>
                  <tr>
                    <th>單號</th>
                    <th>申請日期</th>
                    <th>類型</th>
                    <th>申請教師</th>
                    <th>代課/對調教師</th>
                    <th>請假課堂</th>
                    <th>對調課堂</th>
                    <th>狀態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in paginatedMySent" :key="row.displayKey">
                    <tr v-if="row.displayKind === 'batch'" class="batch-group-row batch-group-data-row" @click="toggleBatchGroup('sent', row.batchId)">
                      <td>
                        <div class="batch-group-first-cell">
                          <button type="button" class="batch-group-expand" :aria-expanded="isBatchGroupExpanded('sent', row.batchId)" @click.stop="toggleBatchGroup('sent', row.batchId)">
                            <span class="batch-group-chevron" :class="{ 'is-open': isBatchGroupExpanded('sent', row.batchId) }" aria-hidden="true">›</span>
                            <strong>{{ row.items[0].serial || (row.isTriangle ? '三角調整組' : '批次申請') }}</strong>
                          </button>
                        </div>
                        <div class="batch-group-inline-meta">{{ row.isTriangle ? '三角調整組' : '批次申請' }} · {{ row.items.length }} 筆</div>
                      </td>
                      <td>{{ formatRequestApplicationDate(row.items[0]) }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge" :class="requestTypeBadgeClass(row.items[0])">{{ requestTypeLabel(row.items[0]) }}</span>
                          <span class="status-badge tag-gray fs-65">{{ row.isTriangle ? '整組' : '批次' }} {{ row.items.length }} 筆</span>
                        </div>
                      </td>
                      <td>{{ row.isTriangle ? getBatchGroupRequesterSummary(row) : row.items[0].requesterName }}</td>
                       <td>{{ getBatchGroupTeacherSummary(row) }}</td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatLeaveClassSlot) }}</span></td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatExchangeClassSlot) }}</span></td>
                      <td><span class="status-badge w-fit-fs-75" :class="getBatchGroupStatusClass(row)">{{ getBatchGroupStatusText(row) }}</span></td>
                      <td>
                        <button type="button" class="btn btn-secondary btn-md-nowrap batch-group-action-button" @click.stop="toggleBatchGroup('sent', row.batchId)">{{ isBatchGroupExpanded('sent', row.batchId) ? '收合' : '展開' }}</button>
                      </td>
                    </tr>
                    <tr v-else :class="['cursor-pointer', { 'batch-child-row': row.batchGroupKey }]" @click="detailRequest = row; detailSubRecord = null; showDetailModal = true">
                      <td>
                        <strong>{{ row.serial || '---' }}</strong>
                        <div v-if="row.note" class="req-note-cell no-checkbox" :title="row.note">{{ row.note }}</div>
                      </td>
                      <td>{{ formatRequestApplicationDate(row) }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                            <span class="status-badge" :class="requestTypeBadgeClass(row)">{{ requestTypeLabel(row) }}</span>
                            <span v-if="row.batchId && row.type !== 'triangle'" class="status-badge tag-gray fs-65" title="同批次">批次</span>
                            <span v-if="row.type === 'triangle'" class="status-badge tag-gray fs-65" title="三角調整組：共 3 筆輪替，三位教師全部同意後才送教學組">{{ triangleLegLabel(row) }}</span>
                          <span v-for="tag in getRequestTypeTags(row)" :key="tag.key" class="risk-tag badge-micro" :class="'risk-'+tag.key">{{ tag.label }}</span>
                        </div>
                      </td>
                      <td>
                        {{ row.requesterName }}
                        <span
                          v-if="!(row.isProxySubmit || row.proxyByEmail || (row.note && row.note.indexOf('[行政代申請') >= 0))"
                          class="text-xs-muted"
                         >（您）</span>
                        <div
                          v-if="row.isProxySubmit || row.proxyByEmail || (row.note && row.note.indexOf('[行政代申請') >= 0)"
                          class="req-note-cell no-checkbox"
                          style="color:#b45309;"
                        >代申請{{ row.proxyByName ? '：' + row.proxyByName : (user && user.displayName ? '：' + user.displayName : '') }}</div>
                      </td>
                      <td>{{ row.targetTeacherName }}</td>
                      <td>
                        <span class="hist-slot-inline">
                          {{ formatLeaveClassSlot(row) }}
                          <span v-if="isLeaveClassRestricted(row)" class="status-badge tag-restricted">綁課</span>
                          <span v-if="isRequestLeaveRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <span class="hist-slot-inline">
                           {{ formatExchangeClassSlot(row) }}
                           <span v-if="isExchangeClassRestricted(row)" class="status-badge tag-restricted">綁課</span>
                           <span v-if="isRequestExchangeRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <span class="status-badge w-fit-fs-75" :class="'status-' + (row.status ? row.status.toLowerCase() : 'pending_teacher')">
                          {{ getStatusText(row.status) }}
                        </span>
                      </td>
                      <td class="td-actions" @click.stop>
                        <div class="req-action-stack">
                          <button
                            v-if="isAdmin"
                            type="button"
                            class="btn btn-secondary btn-req-action"
                            @click="openHistoryEditModal(row)"
                          >編輯</button>
                          <button
                            type="button"
                            class="btn btn-secondary btn-req-action"
                            @click="detailRequest = row; detailSubRecord = null; showDetailModal = true"
                           >詳情</button>
                          <button
                            type="button"
                            class="btn btn-secondary btn-req-action"
                            @click="openPaperPrintForRequest(row)"
                          >🖨️ 列印</button>
                          <button
                             v-if="row.status === 'pending_teacher' || isPaperFlowRequest(row)"
                            type="button"
                            class="btn btn-success btn-req-action"
                            style="background: #22c55e; border-color: #16a34a;"
                            @click="copyLineMessageForRequest(row)"
                          >LINE</button>
                          <button
                            v-if="row.status === 'pending_teacher' || row.status === 'pending_admin'"
                            type="button"
                            class="btn btn-secondary btn-req-action"
                            style="color: var(--color-danger); border-color: rgba(239, 68, 68, 0.2);"
                            @click="cancelRequest(row.id)"
                          >撤回</button>
                        </div>
                      </td>
                    </tr>
                  </template>
                  <tr v-if="paginatedMySent.length === 0">
                    <td colspan="9" class="empty-table-cell">沒有發起的申請紀錄。</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="pendingMySentTotal > 1" class="flex-center-pad">
                <button class="btn btn-secondary btn-xs-tight" :disabled="pendingMySentPage<=1" @click="changePendingPage('sent', pendingMySentPage-1)">‹</button>
                <span class="text-xs-muted">{{ pendingMySentPage }}/{{ pendingMySentTotal }}</span>
                <button class="btn btn-secondary btn-xs-tight" :disabled="pendingMySentPage>=pendingMySentTotal" @click="changePendingPage('sent', pendingMySentPage+1)">›</button>
              </div>
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
import { useMutualStore } from '../stores/mutual.js';
import { useOutputStore } from '../stores/output.js';
import { useRequestsStore } from '../stores/requests.js';
import { useSessionStore } from '../stores/session.js';
import { useTimetableStore } from '../stores/timetable.js';
import { useTourStore } from '../stores/tour.js';

const { formatLeaveClassSlot, getRequestTypeTags } = UiLineTemplate;
const { formatRequestApplicationDate, getBatchGroupRequesterSummary, getBatchGroupSlotSummary, getBatchGroupStatusClass, getBatchGroupStatusText, getBatchGroupTeacherSummary, getStatusText, requestTypeBadgeClass, requestTypeLabel, triangleLegLabel } = UiListHelpers;
const adminStore = useAdminStore();
const { openHistoryEditModal } = adminStore;
const backofficeStore = useBackofficeStore();
const { changePendingPage, isAdminPendingPageFullySelected, openBatchPendingPrintPreview } = backofficeStore;
const dataStore = useDataStore();
const { formatExchangeClassSlot, isExchangeClassRestricted, isLeaveClassRestricted } = dataStore;
const mutualStore = useMutualStore();
const { detailRequest, detailSubRecord, showDetailModal } = storeToRefs(mutualStore);
const outputStore = useOutputStore();
const { openPaperPrintForRequest } = outputStore;
const requestsStore = useRequestsStore();
const { selectedAdminPendingIds } = storeToRefs(requestsStore);
const { adminApprove, adminReject, batchAdminApprove, batchAdminReject, cancelRequest, getApproveRiskFlags, isAdminBatchGroupSelected, isAdminPendingSelected, isPaperFlowRequest, mergeSelectedAdminPendingBatch, respondToBatch, respondToRequest, toggleAdminBatchGroupSelection, toggleAdminPendingSelect, toggleSelectAllAdminPending } = requestsStore;
const sessionStore = useSessionStore();
const { isAdmin, isStaff, user } = storeToRefs(sessionStore);
const timetableStore = useTimetableStore();
const { filteredAdminPendingRequests, paginatedAdminPending, paginatedMyPending, paginatedMySent, pendingAdminPage, pendingAdminTotal, pendingMyPendingPage, pendingMyPendingTotal, pendingMySentPage, pendingMySentTotal, pendingSearchQuery } = storeToRefs(timetableStore);
const { copyLineMessageForRequest, isBatchGroupExpanded, isRequestExchangeRechanged, isRequestLeaveRechanged, toggleBatchGroup } = timetableStore;
const tourStore = useTourStore();
const { adminPendingRequests, tourDemoInvite } = storeToRefs(tourStore);
const { tourDemoInviteRespond } = tourStore;
</script>
