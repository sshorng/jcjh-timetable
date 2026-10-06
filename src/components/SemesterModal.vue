<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card max-w-440">
          <div class="modal-header">
            <h3>{{ semesterModalMode === 'add' ? '📅 新增學期' : '✏️ 編輯學期' }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">學期代號</label>
              <input type="text" class="form-input" placeholder="例如 114-2" v-model="semesterForm.id" :disabled="semesterModalMode === 'edit'">
              <span class="text-xs-muted-70">用於 Firestore 資料夾命名，設定後不可修改</span>
            </div>
            <div class="form-group">
              <label class="form-label">學期名稱（顯示用）</label>
              <input type="text" class="form-input" placeholder="例如 114學年度第2學期" v-model="semesterForm.name">
            </div>
            <div class="form-group">
              <label class="form-label">學期開始日期</label>
              <input type="date" class="form-input" v-model="semesterForm.startDate">
            </div>
            <div class="form-group">
              <label class="form-label">學期結束日期</label>
              <input type="date" class="form-input" v-model="semesterForm.endDate">
            </div>
            <p style="font-size:0.75rem;color:var(--text-muted);margin:0;">九年級畢業／畢旅請至「空堂事件」設定。</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveSemester">{{ semesterModalMode === 'add' ? '建立學期' : '儲存修改' }}</button>
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 學期新增／編輯 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  semesterModalMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  saveSemester: { type: Function, required: true },
});
defineEmits(['close']);
const semesterForm = defineModel('semesterForm');
</script>
