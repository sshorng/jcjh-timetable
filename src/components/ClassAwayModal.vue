<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width:560px;">
          <div class="modal-header">
            <h3>{{ classAwayModalMode === 'add' ? '新增空堂事件' : '編輯空堂事件' }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">事件名稱</label>
              <input type="text" class="form-input" placeholder="例：九年級畢旅、九年級畢業" v-model="classAwayForm.name">
            </div>
            <div class="form-group">
              <label class="form-label">節次設定方式</label>
              <div style="display:flex;flex-wrap:wrap;gap:12px;">
                <label class="label-check-sm">
                  <input type="radio" value="daily" v-model="classAwayForm.periodMode" @change="setClassAwayPeriodMode('daily')" class="chk-box-15">
                  每日指定節次
                </label>
                <label class="label-check-sm">
                  <input type="radio" value="range" v-model="classAwayForm.periodMode" @change="setClassAwayPeriodMode('range')" class="chk-box-15">
                  連續起迄時段
                </label>
              </div>
              <span style="font-size:0.73rem;color:var(--text-muted);display:block;margin-top:5px;">每日指定適用於日期範圍內的每一天；連續起迄會將首日、末日限制在所選節次，中間日期全日適用。</span>
            </div>
            <div v-if="classAwayForm.periodMode === 'range'" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
              <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:9px;padding:10px;">
                <strong style="display:block;color:#1d4ed8;font-size:0.82rem;margin-bottom:8px;">起點</strong>
                <div class="form-group" style="margin-bottom:8px;">
                  <label class="form-label">日期</label>
                  <input type="date" class="form-input" v-model="classAwayForm.startDate">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">節次</label>
                  <select class="form-select" v-model="classAwayForm.startPeriod" @change="setClassAwayPeriodBoundary('startPeriod', classAwayForm.startPeriod)">
                    <option v-for="option in classAwayPeriodOptions" :key="'cae-start-'+option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </div>
              </div>
              <div style="border:1px solid #c4b5fd;background:#f5f3ff;border-radius:9px;padding:10px;">
                <strong style="display:block;color:#6d28d9;font-size:0.82rem;margin-bottom:8px;">終點</strong>
                <div class="form-group" style="margin-bottom:8px;">
                  <label class="form-label">日期（空白＝學期結束）</label>
                  <input type="date" class="form-input" v-model="classAwayForm.endDate">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">節次</label>
                  <select class="form-select" v-model="classAwayForm.endPeriod" @change="setClassAwayPeriodBoundary('endPeriod', classAwayForm.endPeriod)">
                    <option v-for="option in classAwayPeriodOptions" :key="'cae-end-'+option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </div>
              </div>
            </div>
            <div v-else>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-bottom:10px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label">起日</label>
                  <input type="date" class="form-input" v-model="classAwayForm.startDate">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">迄日（空白＝學期結束）</label>
                  <input type="date" class="form-input" v-model="classAwayForm.endDate">
                </div>
              </div>
              <div class="form-group">
              <label class="form-label">每天停課節次（可複選）</label>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <label class="label-check-sm">
                  <input type="checkbox" class="chk-box-15" :checked="isClassAwayPeriodSelected('all')" @change="toggleClassAwayPeriod('all')">
                  全部節次
                </label>
                <button type="button" class="btn btn-secondary btn-xs" @click="selectClassAwayPeriodRange">全選早自習至第8節</button>
                <button type="button" class="btn btn-secondary btn-xs" @click="clearClassAwayPeriods">清空</button>
                <span class="text-xs-muted-75">已選 {{ isClassAwayPeriodSelected('all') ? '全部節次' : ((classAwayForm.periods || []).length + ' 個節次') }}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:6px;border:1px solid var(--border-color);border-radius:8px;padding:8px;">
                <label v-for="option in classAwayPeriodOptions" :key="'cae-period-' + option.value" class="label-check-sm" style="margin:0;">
                  <input type="checkbox" class="chk-box-15" :checked="isClassAwayPeriodSelected(option.value)" :disabled="isClassAwayPeriodSelected('all')" @change="toggleClassAwayPeriod(option.value)">
                  {{ option.label }}
                </label>
              </div>
              </div>
            </div>
             <div class="form-group">
               <label class="form-label">適用範圍</label>
               <div style="display:flex;flex-wrap:wrap;gap:16px;">
                 <label class="label-check-sm">
                   <input type="radio" value="all" v-model="classAwayForm.scope" class="chk-box-15">
                   全校
                 </label>
                 <label class="label-check-sm">
                   <input type="radio" value="classes" v-model="classAwayForm.scope" class="chk-box-15">
                   指定班級
                 </label>
               </div>
             </div>
             <div class="form-group">
              <label class="form-label">鐘點規則</label>
              <select class="form-select" v-model="classAwayForm.billingRule">
                  <option value="keep">不扣超鐘點（事件期間仍依原週節數計）</option>
                  <option value="reduce">扣超鐘點（依事件期間未授課調降）</option>
              </select>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;">
              <label class="label-check-sm">
                <input type="checkbox" v-model="classAwayForm.forMutual" class="chk-box-15">
                  可進活動互代<span style="color:var(--text-muted);">（僅限事件起訖時段）</span>
              </label>
              <label class="label-check-sm">
                <input type="checkbox" v-model="classAwayForm.enabled" class="chk-box-15">
                啟用
              </label>
            </div>
             <div v-if="classAwayForm.scope === 'classes'" class="form-group">
               <label class="form-label">班級（核取多選）</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                <button type="button" class="btn btn-secondary btn-xs" @click="selectClassAwayGrade('7')">全選七年級</button>
                <button type="button" class="btn btn-secondary btn-xs" @click="selectClassAwayGrade('8')">全選八年級</button>
                <button type="button" class="btn btn-secondary btn-xs" @click="selectClassAwayGrade('9')">全選九年級</button>
                <button type="button" class="btn btn-secondary btn-xs" @click="classAwayForm.classes = []">清空</button>
                <span class="text-xs-muted-75" >已選 {{ (classAwayForm.classes || []).length }} 班</span>
              </div>
              <div style="max-height:160px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:4px;">
                <label
                  v-for="c in classList"
                  :key="'cae-'+c"
                  style="display:flex;align-items:center;gap:4px;font-size:0.78rem;cursor:pointer;"
                >
                  <input
                    type="checkbox"
                    class="chk-sm"
                    :checked="isClassAwayFormClassSelected(c)"
                    @change="toggleClassAwayFormClass(c)"
                  >
                  {{ c }}
                </label>
               </div>
             </div>
             <div v-else class="form-group" style="margin-bottom:12px;color:var(--text-secondary);font-size:0.82rem;">
               此事件會套用到學期內所有班級，不必逐班勾選。
             </div>
            <div class="form-group">
              <label class="form-label">備註</label>
              <input type="text" class="form-input" v-model="classAwayForm.note" placeholder="選填">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveClassAwayEvent">儲存</button>
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 空堂事件 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  classAwayModalMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classAwayPeriodOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  setClassAwayPeriodMode: { type: Function, required: true },
  setClassAwayPeriodBoundary: { type: Function, required: true },
  isClassAwayPeriodSelected: { type: Function, required: true },
  toggleClassAwayPeriod: { type: Function, required: true },
  selectClassAwayGrade: { type: Function, required: true },
  isClassAwayFormClassSelected: { type: Function, required: true },
  toggleClassAwayFormClass: { type: Function, required: true },
  selectClassAwayPeriodRange: { type: Function, required: true },
  clearClassAwayPeriods: { type: Function, required: true },
  saveClassAwayEvent: { type: Function, required: true },
});
defineEmits(['close']);
const classAwayForm = defineModel('classAwayForm');
</script>
