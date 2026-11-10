<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width:620px;">
          <div class="modal-header">
            <h3>{{ classAwayModalMode === 'add' ? '新增空堂事件' : '編輯空堂事件' }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body" style="max-height:calc(100vh - 200px);overflow-y:auto;">
            <!-- 事件資料 -->
            <div class="cae-section">
              <div class="cae-section-title">事件資料</div>
              <div class="form-group">
                <label class="form-label">事件名稱</label>
                <input type="text" class="form-input" placeholder="例：九年級畢旅、九年級畢業" v-model="classAwayForm.name">
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label">起日</label>
                  <input type="date" class="form-input" v-model="classAwayForm.startDate">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">迄日（空白＝學期結束）</label>
                  <input type="date" class="form-input" v-model="classAwayForm.endDate">
                </div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:10px;">
                <label class="label-check-sm">
                  <input type="checkbox" v-model="classAwayForm.forMutual" class="chk-box-15">
                    可進活動互代<span style="color:var(--text-muted);">（僅限事件起訖時段）</span>
                </label>
                <label class="label-check-sm">
                  <input type="checkbox" v-model="classAwayForm.enabled" class="chk-box-15">
                  啟用
                </label>
              </div>
              <div class="form-group" style="margin:10px 0 0;">
                <label class="form-label">備註</label>
                <input type="text" class="form-input" v-model="classAwayForm.note" placeholder="選填">
              </div>
            </div>

            <!-- 停課規則 -->
            <div class="cae-section">
              <div class="cae-section-title">
                停課規則
                <span class="cae-section-hint">任一規則命中即停課；共用上方起迄日期</span>
              </div>

              <div
                v-for="(rule, idx) in rules"
                :key="'cae-rule-' + idx"
                class="cae-rule"
                :class="{ 'is-open': rule.expanded !== false }"
              >
                <div class="cae-rule-head" @click="toggleRuleExpanded(idx)">
                  <span class="cae-rule-no">規則 {{ idx + 1 }}</span>
                  <span class="cae-rule-summary">{{ ruleSummary(rule) }}</span>
                  <span class="cae-rule-actions">
                    <button type="button" class="btn btn-secondary btn-xs" @click.stop="duplicateClassAwayRule(idx)">複製</button>
                    <button
                      v-if="idx > 0"
                      type="button"
                      class="btn btn-secondary btn-xs cae-danger"
                      @click.stop="removeClassAwayRule(idx)"
                    >刪除</button>
                    <span class="cae-rule-chevron">{{ rule.expanded !== false ? '▾' : '▸' }}</span>
                  </span>
                </div>

                <div v-show="rule.expanded !== false" class="cae-rule-body">
                  <div class="cae-field">
                    <span class="cae-field-label">範圍</span>
                    <div class="cae-inline">
                      <label class="label-check-sm"><input type="radio" class="chk-box-15" value="all" v-model="rule.scope"> 全校</label>
                      <label class="label-check-sm"><input type="radio" class="chk-box-15" value="classes" v-model="rule.scope"> 指定班級</label>
                    </div>
                  </div>

                  <div v-if="rule.scope === 'classes'" class="cae-field">
                    <span class="cae-field-label">班級</span>
                    <div style="flex:1;min-width:0;">
                      <div class="cae-inline" style="margin-bottom:6px;">
                        <button type="button" class="btn btn-secondary btn-xs" @click="toggleRulePicker(idx)">
                          {{ rule.pickerOpen ? '收起班級清單' : '選擇班級' }}（已選 {{ (rule.classes || []).length }} 班）
                        </button>
                        <button type="button" class="btn btn-secondary btn-xs" @click="selectRuleGrade(idx, '7')">七年級</button>
                        <button type="button" class="btn btn-secondary btn-xs" @click="selectRuleGrade(idx, '8')">八年級</button>
                        <button type="button" class="btn btn-secondary btn-xs" @click="selectRuleGrade(idx, '9')">九年級</button>
                        <button type="button" class="btn btn-secondary btn-xs" @click="clearRuleClasses(idx)">清空</button>
                      </div>
                      <div v-if="rule.pickerOpen" class="cae-class-grid">
                        <label v-for="c in (classList || [])" :key="'cae-cls-' + idx + '-' + c" class="cae-class-item">
                          <input
                            type="checkbox"
                            class="chk-sm"
                            :checked="isRuleClassSelected(idx, c)"
                            @change="toggleRuleClass(idx, c)"
                          >
                          {{ c }}
                        </label>
                      </div>
                    </div>
                  </div>

                  <div class="cae-field">
                    <span class="cae-field-label">科目</span>
                    <div style="flex:1;min-width:0;">
                      <input
                        type="text"
                        class="form-input"
                        list="class-away-subject-options"
                        placeholder="留空＝全部課堂；例：本土語-台語（多個用、分隔）"
                        v-model="rule.subjectsText"
                      >
                    </div>
                  </div>

                  <div class="cae-field">
                    <span class="cae-field-label">節次</span>
                    <div style="flex:1;min-width:0;">
                      <div v-if="idx === 0" class="cae-inline" style="margin-bottom:6px;">
                        <label class="label-check-sm"><input type="radio" class="chk-box-15" value="daily" v-model="rule.periodMode"> 每日指定節次</label>
                        <label class="label-check-sm"><input type="radio" class="chk-box-15" value="range" v-model="rule.periodMode"> 連續起迄時段</label>
                      </div>
                      <template v-if="idx === 0 && rule.periodMode === 'range'">
                        <div class="cae-inline" style="margin-bottom:6px;">
                          <label class="label-check-sm">起點
                            <select class="form-select" style="width:110px;display:inline-block;" v-model="rule.startPeriod">
                              <option v-for="option in classAwayPeriodOptions" :key="'cae-start-' + option.value" :value="option.value">{{ option.label }}</option>
                            </select>
                          </label>
                          <label class="label-check-sm">終點
                            <select class="form-select" style="width:110px;display:inline-block;" v-model="rule.endPeriod">
                              <option v-for="option in classAwayPeriodOptions" :key="'cae-end-' + option.value" :value="option.value">{{ option.label }}</option>
                            </select>
                          </label>
                        </div>
                        <div class="cae-help">連續起迄：首日、末日限制在所選節次，中間日期全日適用。</div>
                      </template>
                      <template v-else>
                        <div class="cae-inline" style="margin-bottom:6px;">
                          <label class="label-check-sm">
                            <input type="checkbox" class="chk-box-15" :checked="isRuleAllPeriods(idx)" @change="toggleRuleAllPeriods(idx)">
                            全部節次
                          </label>
                          <button type="button" class="btn btn-secondary btn-xs" @click="selectRulePeriodRange(idx)">全選早自習至第8節</button>
                          <button type="button" class="btn btn-secondary btn-xs" @click="clearRulePeriods(idx)">清空</button>
                        </div>
                        <div class="cae-period-grid">
                          <label v-for="option in classAwayPeriodOptions" :key="'cae-rule-period-' + idx + '-' + option.value" class="label-check-sm" style="margin:0;">
                            <input
                              type="checkbox"
                              class="chk-box-15"
                              :checked="isRulePeriodSelected(idx, option.value)"
                              :disabled="isRuleAllPeriods(idx)"
                              @change="toggleRulePeriod(idx, option.value)"
                            >
                            {{ option.label }}
                          </label>
                        </div>
                      </template>
                    </div>
                  </div>

                  <div class="cae-field">
                    <span class="cae-field-label">鐘點</span>
                    <div style="flex:1;min-width:0;">
                      <select class="form-select" v-model="rule.billingRule">
                        <option value="keep">不扣超鐘點</option>
                        <option value="reduce">扣超鐘點</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <button type="button" class="btn btn-secondary btn-xs" @click="addClassAwayRule">＋ 新增規則</button>
              <datalist id="class-away-subject-options">
                <option v-for="s in (subjectOptions || [])" :key="'cae-subject-' + s" :value="s"></option>
              </datalist>
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
import { computed } from 'vue';

const props = defineProps({
  classAwayModalMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classAwayPeriodOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  subjectOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  setClassAwayPeriodMode: { type: Function, required: false, default: undefined },
  setClassAwayPeriodBoundary: { type: Function, required: false, default: undefined },
  isClassAwayPeriodSelected: { type: Function, required: false, default: undefined },
  toggleClassAwayPeriod: { type: Function, required: false, default: undefined },
  selectClassAwayGrade: { type: Function, required: false, default: undefined },
  isClassAwayFormClassSelected: { type: Function, required: false, default: undefined },
  toggleClassAwayFormClass: { type: Function, required: false, default: undefined },
  selectClassAwayPeriodRange: { type: Function, required: false, default: undefined },
  clearClassAwayPeriods: { type: Function, required: false, default: undefined },
  saveClassAwayEvent: { type: Function, required: true },
});
defineEmits(['close']);
const classAwayForm = defineModel('classAwayForm');

// ── 規則卡片 ─────────────────────────────────────────────
const rules = computed(() => {
  const list = classAwayForm.value && classAwayForm.value.rules;
  return Array.isArray(list) ? list : [];
});

function commitRules(next) {
  classAwayForm.value = Object.assign({}, classAwayForm.value, { rules: next });
}

function patchRule(index, patch) {
  const next = rules.value.slice();
  next[index] = Object.assign({}, next[index], patch);
  commitRules(next);
}

function newRule(patch) {
  return Object.assign({
    scope: 'classes',
    classes: [],
    classesText: '',
    subjectsText: '',
    periodMode: 'daily',
    periods: ['all'],
    startPeriod: '0',
    endPeriod: '8',
    billingRule: 'keep',
    expanded: true,
    pickerOpen: false
  }, patch || {});
}

function addClassAwayRule() {
  const next = rules.value.slice();
  next.push(newRule({ expanded: true }));
  commitRules(next);
}

function duplicateClassAwayRule(index) {
  const src = rules.value[index] || {};
  const next = rules.value.slice();
  next.splice(index + 1, 0, newRule(Object.assign({}, src, {
    classes: (src.classes || []).slice(),
    periods: (src.periods || ['all']).slice(),
    expanded: true,
    pickerOpen: false
  })));
  commitRules(next);
}

function removeClassAwayRule(index) {
  if (index <= 0) return;
  const next = rules.value.slice();
  next.splice(index, 1);
  commitRules(next);
}

function toggleRuleExpanded(index) {
  const rule = rules.value[index];
  patchRule(index, { expanded: rule.expanded === false });
}

function periodLabel(value) {
  const options = props.classAwayPeriodOptions || [];
  const hit = options.find(function (option) { return String(option.value) === String(value); });
  return hit ? hit.label : String(value == null ? '' : value);
}

function ruleSummary(rule) {
  if (!rule) return '';
  const scopeText = rule.scope === 'all'
    ? '全校'
    : ((rule.classes || []).length ? (rule.classes || []).length + ' 班' : '未選班級');
  let periodText = '全部節次';
  if (rule.periodMode === 'range' && rule.startPeriod && rule.endPeriod) {
    periodText = '連續 ' + periodLabel(rule.startPeriod) + '～' + periodLabel(rule.endPeriod);
  } else if (!isRuleAllPeriods(rules.value.indexOf(rule))) {
    const list = (rule.periods || []).map(periodLabel).join('、');
    periodText = list || '未選節次';
  }
  const subjectText = String(rule.subjectsText || '').trim() || '全部科目';
  return scopeText + ' · ' + periodText + ' · ' + subjectText;
}

// ── 班級 ────────────────────────────────────────────────
function isRuleClassSelected(index, cls) {
  const rule = rules.value[index] || {};
  return (rule.classes || []).indexOf(String(cls || '').trim()) >= 0;
}

function toggleRuleClass(index, cls) {
  const rule = rules.value[index] || {};
  const key = String(cls || '').trim();
  if (!key) return;
  const list = (rule.classes || []).slice();
  const pos = list.indexOf(key);
  if (pos >= 0) list.splice(pos, 1);
  else list.push(key);
  patchRule(index, { classes: list });
}

function selectRuleGrade(index, grade) {
  const rule = rules.value[index] || {};
  const list = (rule.classes || []).slice();
  const targets = (props.classList || []).filter(function (c) {
    return String(c || '').trim().charAt(0) === String(grade);
  });
  const allSelected = targets.length > 0 && targets.every(function (c) { return list.indexOf(String(c).trim()) >= 0; });
  targets.forEach(function (c) {
    const key = String(c).trim();
    const pos = list.indexOf(key);
    if (allSelected && pos >= 0) list.splice(pos, 1);
    if (!allSelected && pos < 0) list.push(key);
  });
  patchRule(index, { classes: list });
}

function clearRuleClasses(index) {
  patchRule(index, { classes: [] });
}

function toggleRulePicker(index) {
  const rule = rules.value[index] || {};
  patchRule(index, { pickerOpen: !rule.pickerOpen });
}

// ── 節次 ────────────────────────────────────────────────
function isRuleAllPeriods(index) {
  const rule = rules.value[index];
  if (!rule || !Array.isArray(rule.periods) || !rule.periods.length) return true;
  return rule.periods.indexOf('all') >= 0;
}

function isRulePeriodSelected(index, value) {
  const rule = rules.value[index];
  if (!rule || !Array.isArray(rule.periods)) return false;
  return rule.periods.indexOf(String(value)) >= 0;
}

function patchRulePeriods(index, periods) {
  patchRule(index, { periods: periods.length ? periods : ['all'] });
}

function toggleRuleAllPeriods(index) {
  patchRulePeriods(index, isRuleAllPeriods(index) ? [] : ['all']);
}

function toggleRulePeriod(index, value) {
  const key = String(value);
  const rule = rules.value[index] || {};
  const current = (Array.isArray(rule.periods) ? rule.periods : [])
    .filter(function (item) { return item !== 'all'; });
  const pos = current.indexOf(key);
  if (pos >= 0) current.splice(pos, 1);
  else current.push(key);
  patchRulePeriods(index, current);
}

function selectRulePeriodRange(index) {
  const all = (props.classAwayPeriodOptions || []).map(function (option) { return String(option.value); });
  patchRulePeriods(index, all);
}

function clearRulePeriods(index) {
  patchRulePeriods(index, []);
}
</script>

<style scoped>
.cae-section {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fff;
}
.cae-section-title {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 10px;
}
.cae-section-hint {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 6px;
}
.cae-rule {
  border: 1px solid var(--border-color);
  border-left: 4px solid #cbd5e1;
  border-radius: 9px;
  margin-bottom: 10px;
  background: #f8fafc;
  overflow: hidden;
}
.cae-rule.is-open {
  border-left-color: #0f766e;
  background: #fff;
}
.cae-rule-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  cursor: pointer;
  background: rgba(15, 118, 110, 0.04);
}
.cae-rule-no {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0f766e;
  white-space: nowrap;
}
.cae-rule-summary {
  flex: 1;
  min-width: 0;
  font-size: 0.74rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cae-rule-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cae-rule-chevron {
  font-size: 0.8rem;
  color: var(--text-muted);
  width: 14px;
  text-align: center;
}
.cae-danger {
  color: var(--color-danger, #b91c1c);
}
.cae-rule-body {
  padding: 10px;
  border-top: 1px dashed var(--border-color);
}
.cae-field {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 9px;
}
.cae-field-label {
  flex: 0 0 42px;
  padding-top: 5px;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.cae-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.cae-class-grid {
  max-height: 150px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 4px;
  background: #fff;
}
.cae-class-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.76rem;
  cursor: pointer;
}
.cae-period-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  gap: 4px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px;
  background: #fff;
}
.cae-help {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
