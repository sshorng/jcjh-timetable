<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="width:min(1180px,96vw);max-width:1180px;max-height:92vh;overflow:auto;">
          <div class="modal-header">
            <div>
              <h3>👥 三角調三人課表預覽</h3>
              <div style="font-size:0.74rem;color:var(--text-muted);">調動後課表；綠色框為各教師調動後的新授課位置，原位置顯示為調出。</div>
            </div>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body" style="padding:12px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;">
                         <section v-for="teacher in triangleTimetablePreview" :key="'tri-timetable-' + teacher.role" style="min-width:0;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;padding:8px;">
                 <div style="font-weight:700;color:#1d4ed8;font-size:0.82rem;margin-bottom:3px;">{{ teacher.role }}．{{ teacher.teacherName }}</div>
                  <div style="font-size:0.68rem;color:#2563eb;margin-bottom:7px;">原課：{{ formatTriangleSlot(teacher.sourceSlot, teacher.sourceCourse, teacher.teacherName) }}</div>
                <div style="overflow-x:auto;background:#fff;border-radius:6px;">
                  <table style="width:100%;min-width:390px;border-collapse:collapse;table-layout:fixed;font-size:0.68rem;">
                    <thead>
                      <tr>
                         <th style="width:54px;padding:5px 3px;text-align:center;background:#dbeafe;color:#1e3a8a;border-bottom:1px solid #bfdbfe;">節次</th>
                         <th v-for="dayInfo in trianglePreviewWeekDates" :key="'tri-day-' + teacher.role + '-' + dayInfo.day" style="padding:5px 2px;text-align:center;background:#dbeafe;color:#1e3a8a;border-bottom:1px solid #bfdbfe;">{{ dayInfo.weekDay }}<br><span style="font-weight:500;color:var(--text-muted);">{{ dayInfo.shortDate }}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in teacher.rows" :key="'tri-period-' + teacher.role + '-' + row.period">
                        <th style="padding:4px 3px;text-align:center;color:var(--text-secondary);font-weight:600;border-bottom:1px solid #f1f5f9;">{{ getPeriodLabel(row.period) }}</th>
                        <td v-for="cell in row.cells" :key="'tri-cell-' + teacher.role + '-' + cell.date + '-' + cell.period" :style="{ padding: '4px 3px', verticalAlign: 'top', borderLeft: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', background: cell.isMovedTo ? '#ecfdf5' : '#fff', boxShadow: cell.isMovedTo ? 'inset 0 0 0 2px #10b981' : 'none', opacity: cell.isSubstituted ? '0.65' : '1' }">
                          <template v-if="cell.className || cell.subject">
                            <strong style="display:block;white-space:normal;overflow-wrap:anywhere;">{{ cell.className || '未提供' }}</strong>
                            <span style="display:block;color:var(--text-secondary);white-space:normal;overflow-wrap:anywhere;">{{ cell.subject || '未提供' }}</span>
                            <span v-if="cell.isMovedTo" style="display:inline-block;margin-top:2px;padding:1px 3px;border-radius:3px;background:#d1fae5;color:#047857;font-size:0.6rem;">調入</span>
                            <span v-if="cell.isPullOut" style="display:inline-block;margin-top:2px;padding:1px 3px;border-radius:3px;background:#ccfbf1;color:#0f766e;font-size:0.6rem;">抽離</span>
                            <span v-if="cell.isRestricted" style="display:inline-block;margin-top:2px;padding:1px 3px;border-radius:3px;background:#fef3c7;color:#92400e;font-size:0.6rem;">綁課</span>
                          </template>
                          <span v-else :style="{ color: cell.isMovedFrom ? '#b45309' : '#cbd5e1' }">{{ cell.isMovedFrom ? '調出' : '空堂' }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
             <div style="margin-top:12px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#fff;font-size:0.76rem;line-height:1.5;">
               <strong style="color:#1d4ed8;">交換路線</strong>
              <div v-for="row in trianglePreviewRows" :key="'tri-timetable-route-' + row.index" style="padding:5px 0;border-top:1px solid #f1f5f9;">
                 {{ row.sourceTeacher }}：{{ formatTriangleSlot(row.sourceSlot, row.sourceCourse, row.sourceTeacher) }} → {{ row.targetTeacher }}時段（{{ formatTriangleSlot(row.targetSlot, row.sourceCourse, row.sourceTeacher) }}）
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="$emit('close')">關閉</button>
             <button type="button" class="btn btn-primary" @click="openTrianglePaperPreview">👁️ 預覽調課單</button>
          </div>
        </div>
      </div>
</template>

<!-- 三角調三人課表預覽 modal（自 App.vue 抽出；展示＋操作委派，狀態全由 props 注入） -->
<script setup>
defineProps({
  triangleTimetablePreview: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  trianglePreviewWeekDates: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  trianglePreviewRows: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  formatTriangleSlot: { type: Function, required: true },
  getPeriodLabel: { type: Function, required: true },
  openTrianglePaperPreview: { type: Function, required: true },
});
defineEmits(['close']);
</script>
