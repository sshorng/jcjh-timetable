<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width:1100px;">
          <div class="modal-header">
            <h3>🔎 教師經費來源檢查</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body">
            <p style="margin:0 0 12px;color:var(--text-secondary);font-size:0.82rem;line-height:1.6;">
              這是乾跑預覽，不會改寫課表或歷史月份。可整理資料會先備份原值，再只標準化來源 JSON 與固定超鐘點欄位；格式錯誤資料保留原值，空白經費計畫依規則視為預設經費，不需另行確認。
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-size:0.82rem;">
              <span class="status-badge status-approved">一致 {{ teacherExpenseAuditSummary.ok }}</span>
              <span class="status-badge status-pending-admin">可整理 {{ teacherExpenseAuditSummary.normalizable }}</span>
              <span class="status-badge status-pending-teacher">待確認 {{ teacherExpenseAuditSummary.review }}</span>
              <span class="status-badge status-rejected">暫不整理 {{ teacherExpenseAuditSummary.blocked }}</span>
            </div>
            <div v-if="!teacherExpenseAuditRows.length" class="empty-state" style="padding:24px 12px;">
              目前沒有教師資料可檢查。
            </div>
            <div v-else class="table-responsive">
              <table class="custom-table" style="font-size:0.8rem;min-width:900px;">
                <thead>
                  <tr>
                    <th>狀態</th>
                    <th style="text-align:left;">教師</th>
                    <th style="text-align:left;">來源目前值</th>
                    <th style="text-align:left;">標準化後</th>
                    <th style="text-align:left;">固定超鐘點目前值</th>
                    <th style="text-align:left;">處理說明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in teacherExpenseAuditRows" :key="'expense-audit-' + row.email">
                    <td style="white-space:nowrap;">
                      <span class="status-badge" :class="row.status === 'ok' ? 'status-approved' : (row.status === 'normalizable' ? 'status-pending-admin' : (row.status === 'blocked' ? 'status-rejected' : 'status-pending-teacher'))">
                        {{ row.status === 'ok' ? '一致' : (row.status === 'normalizable' ? '可整理' : (row.status === 'blocked' ? '暫不整理' : '待確認')) }}
                      </span>
                    </td>
                    <td style="text-align:left;vertical-align:top;">
                      <strong>{{ row.name || '未命名' }}</strong><small style="display:block;color:var(--text-muted);word-break:break-all;">{{ row.email }}</small>
                    </td>
                    <td style="text-align:left;vertical-align:top;word-break:break-word;">{{ row.planBefore }}</td>
                    <td style="text-align:left;vertical-align:top;word-break:break-word;">{{ row.planAfter }}</td>
                    <td style="text-align:left;vertical-align:top;word-break:break-word;">{{ row.fixedBefore }}</td>
                    <td style="text-align:left;vertical-align:top;color:var(--text-secondary);">{{ row.issues.concat(row.changes).join('；') || '無需處理' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" :disabled="loading || !teacherExpenseAuditSummary.normalizable" @click="normalizeTeacherExpenseData">備份並整理可處理資料（{{ teacherExpenseAuditSummary.normalizable }} 位）</button>
            <button class="btn btn-secondary" @click="$emit('close')">關閉</button>
          </div>
        </div>
      </div>
</template>

<!-- 教師經費來源檢查 modal（自 App.vue 抽出；展示＋操作委派，狀態全由 props 注入） -->
<script setup>
defineProps({
  teacherExpenseAuditSummary: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  teacherExpenseAuditRows: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  loading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  normalizeTeacherExpenseData: { type: Function, required: true },
});
defineEmits(['close']);
</script>
