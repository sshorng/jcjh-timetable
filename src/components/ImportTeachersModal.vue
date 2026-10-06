<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width: 650px;">
          <div class="modal-header">
            <h3>📥 批次匯入教師名單 (Excel)</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          
          <div class="modal-body p-20">
            <div style="margin-bottom: 20px;">
              <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">
                  請上傳教師名單 Excel。以 Email 為登入帳號唯一鍵更新／新增。<strong>姓名、Email 為必填</strong>，任教科目可留白（行政或尚未分科教師仍會保留）。其他課表與申請資料一律以教師姓名連接。
              </p>
              
              <div style="display: flex; gap: 12px; align-items: center; background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 16px;">
                <input type="file" @change="handleTeacherExcelChange" accept=".xlsx, .xls">
              </div>

              <!-- 欄位映射對照區 (當上傳檔案後顯示) -->
              <div v-if="teacherExcelData.length > 0" class="card" style="background: #f8fafc; padding: 16px; margin-bottom: 16px; border-color: var(--border-color);">
                <h4 style="font-size: 0.9rem; margin-bottom: 12px; font-weight: 600; color: var(--text-primary);">📊 欄位對應設定</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;">
                  <div class="form-group mb-0">
                    <label class="form-label text-xs">教師姓名 *</label>
                    <select class="form-select btn-input-sm" v-model="teacherMappingFields.name">
                      <option value="">--請選擇--</option>
                      <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </div>
                  <div class="form-group mb-0">
                    <label class="form-label text-xs">帳號 Email *</label>
                    <select class="form-select btn-input-sm" v-model="teacherMappingFields.email">
                      <option value="">--請選擇--</option>
                      <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </div>
                  <div class="form-group mb-0">
                      <label class="form-label text-xs">任教科目（選填）</label>
                    <select class="form-select btn-input-sm" v-model="teacherMappingFields.subject">
                      <option value="">--請選擇--</option>
                      <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </div>
                  <div class="form-group mb-0">
                    <label class="form-label text-xs">職務（選填）</label>
                    <select class="form-select btn-input-sm" v-model="teacherMappingFields.jobTitle">
                      <option value="">--無／不填--</option>
                      <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </div>
                  <div class="form-group mb-0">
                     <label class="form-label text-xs">基本鐘點（選填）</label>
                    <select class="form-select btn-input-sm" v-model="teacherMappingFields.baseHours">
                      <option value="">--預設 16 節--</option>
                      <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </div>
                   <div class="form-group mb-0">
                      <label class="form-label text-xs">系統角色（選填）</label>
                     <select class="form-select btn-input-sm" v-model="teacherMappingFields.role">
                       <option value="">--預設一般教師--</option>
                       <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                     </select>
                   </div>
                   <div class="form-group mb-0">
                     <label class="form-label text-xs">固定超鐘點節數（選填）</label>
                     <select class="form-select btn-input-sm" v-model="teacherMappingFields.fixedOvertimeHours">
                       <option value="">--未設定--</option>
                       <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                     </select>
                   </div>
                   <div class="form-group mb-0">
                     <label class="form-label text-xs">固定超鐘點節次（選填）</label>
                     <select class="form-select btn-input-sm" v-model="teacherMappingFields.fixedOvertimeSlots">
                       <option value="">--未設定--</option>
                       <option v-for="h in teacherExcelHeaders" :key="h" :value="h">{{ h }}</option>
                     </select>
                   </div>
                </div>

                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 10px;">
                  已載入 {{ teacherExcelData.length }} 列。請確認欄位後先「預覽」，再確認匯入。
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                  <button type="button" class="btn btn-secondary" style="padding:6px 12px;font-size:0.82rem;" @click="runTeacherImportPreview">預覽（不寫入）</button>
                </div>
                <div v-if="teacherImportPreview" class="success-hint-box">
                  <div class="fw-700-mb-6">預覽結果</div>
                  <div>有效 <strong>{{ teacherImportPreview.ok }}</strong> 人（新增 {{ teacherImportPreview.newN }}／更新 {{ teacherImportPreview.updateN }}）　·　略過 {{ teacherImportPreview.skipped }} 列</div>
                  <div v-if="teacherImportPreview.sampleRows && teacherImportPreview.sampleRows.length" class="mt-8-ok">
                    範例：{{ teacherImportPreview.sampleRows.join('；') }}
                  </div>
                  <div v-if="teacherImportPreview.skipList && teacherImportPreview.skipList.length" class="mt-10-warn">
                    <div class="fw-600-mb-6">略過清單（共 {{ teacherImportPreview.skipList.length }} 列）</div>
                    <div style="max-height:200px;overflow-y:auto;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;padding:8px 10px;">
                      <table class="table-amber-sm">
                        <thead>
                          <tr class="th-amber-left">
                            <th class="p-4-6">列</th>
                            <th class="p-4-6">缺什麼</th>
                            <th class="p-4-6">原因</th>
                            <th class="p-4-6">內容</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(s, si) in teacherImportPreview.skipList" :key="si" class="td-amber-top">
                             <td class="p-5-6-nowrap">{{ s.line || '無' }}</td>
                             <td style="padding:5px 6px;font-weight:600;">{{ s.missing || '無' }}</td>
                            <td class="p-5-6">{{ s.reason }}</td>
                             <td class="p-5-6-amber">{{ s.snippet || '無' }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
            <button 
              class="btn btn-primary" 
               :disabled="!teacherExcelData.length || !teacherMappingFields.name || !teacherMappingFields.email || !teacherImportPreview || !teacherImportPreview.ok"
              @click="importTeachersBatch"
            >
              確認匯入（{{ teacherImportPreview && teacherImportPreview.ok ? teacherImportPreview.ok : 0 }} 人）
            </button>
          </div>
        </div>
      </div>
</template>

<!-- 批次匯入教師 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  teacherExcelData: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  teacherImportPreview: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  teacherExcelHeaders: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  handleTeacherExcelChange: { type: Function, required: true },
  runTeacherImportPreview: { type: Function, required: true },
  importTeachersBatch: { type: Function, required: true },
});
defineEmits(['close']);
const teacherMappingFields = defineModel('teacherMappingFields');
</script>
