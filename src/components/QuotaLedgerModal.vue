<template>
      <div class="modal-overlay" @click.self="closeQuotaLedger">
        <div class="modal-card quota-ledger-modal" role="dialog" aria-modal="true" aria-label="額度歷程">
          <div class="modal-header">
            <h3>📒 額度歷程
              <span v-if="quotaLedgerTeacher" class="quota-ledger-who">
                 ：{{ quotaLedgerTeacher.name }}
                <span class="quota-ledger-bal">餘額 {{ quotaLedgerTeacher.sheetQuota != null ? quotaLedgerTeacher.sheetQuota : quotaLedgerTeacher.balance }}</span>
              </span>
            </h3>
            <button type="button" class="btn-close" @click="closeQuotaLedger" aria-label="關閉">&times;</button>
          </div>
          <div class="modal-body">
            <p class="quota-ledger-hint">資料來自試算表「額度帳本」（發放／扣用／還原／手動調整）。僅管理員可見。事件＝顯示名稱；包ID＝實際扣自哪個額度包（同名事件可能分屬不同包）；事件ID＝系統分類（evt_sub 代課／evt_exam 段考／evt_empty_slot 空堂）。</p>
            <div v-if="quotaLedgerLoading" class="quota-ledger-loading">載入中…</div>
            <div v-if="!quotaLedgerLoading && !quotaLedgerRows.length" class="quota-ledger-empty">尚無歷程列</div>
            <div v-if="quotaLedgerRows.length" class="table-responsive quota-ledger-table-wrap" :class="{ 'is-refreshing': quotaLedgerLoading }">
              <table class="custom-table quota-ledger-table">
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>類型</th>
                    <th>異動</th>
                    <th>餘額後</th>
                    <th>事件</th>
                    <th title="實際扣自哪個額度包">包ID</th>
                    <th title="系統事件分類">事件ID</th>
                    <th>備註</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in quotaLedgerRows" :key="row.id || (row.time + row.delta + row.type)">
                    <td class="quota-ledger-time">{{ row.time }}</td>
                     <td><span class="quota-type-tag" :class="quotaTypeClass(row.type)">{{ row.typeLabel || row.type || '無' }}</span></td>
                    <td>
                      <strong :class="row.delta > 0 ? 'text-ok-green' : (row.delta < 0 ? 'text-danger-deep' : '')">
                        {{ row.delta > 0 ? ('+' + row.delta) : row.delta }}
                      </strong>
                    </td>
                    <td>{{ row.balanceAfter }}</td>
                    <td>
                      <span v-if="row.eventName">{{ row.eventName }}</span>
                       <span v-else class="text-muted">無</span>
                      <span v-if="row.startDate" class="quota-ledger-range"> {{ row.startDate }}{{ row.endDate && row.endDate !== row.startDate ? ('～' + row.endDate) : '' }}</span>
                    </td>
                    <td style="font-size:0.7rem;word-break:break-all;max-width:160px;">{{ row.packageId || '—' }}</td>
                    <td style="font-size:0.7rem;">{{ row.eventId || '—' }}</td>
                     <td class="quota-ledger-note">{{ row.note || (row.operator ? ('操作：' + row.operator) : '未填') }}<div v-if="row.requestId" style="font-size:0.68rem;color:var(--text-muted);">單 {{ row.requestId }}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;justify-content:space-between;gap:8px;">
            <button type="button" class="btn btn-secondary" @click="openManualQuotaAdjust(quotaLedgerTeacher)" :disabled="!quotaLedgerTeacher">± 手動調整</button>
            <button type="button" class="btn btn-secondary" @click="closeQuotaLedger">關閉</button>
          </div>
        </div>
      </div>
</template>

<!-- 額度歷程 modal（自 App.vue 抽出；展示＋操作委派，狀態全由 props 注入） -->
<script setup>
defineProps({
  quotaLedgerTeacher: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaLedgerLoading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaLedgerRows: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaTypeClass: { type: Function, required: true },
  closeQuotaLedger: { type: Function, required: true },
  openManualQuotaAdjust: { type: Function, required: true },
});
defineEmits(['close']);
</script>
