<template>
        <div>
          <div class="card">
            <div class="card-title card-title-between">
              <span>🏫 班級課表總覽<span v-if="classReadonlyMode || classViewerReadonly" class="text-xs-muted-78" style="font-weight:500;margin-left:8px;">（唯讀）</span></span>
              <button v-if="selectedClass && isAdmin" type="button" class="btn btn-secondary btn-sm-78" @click="copyClassReadonlyLink(selectedClass)">複製唯讀連結</button>
            </div>
            <div style="padding: 0 0 12px 0;">
              <div v-if="classList.length === 0" class="empty-state-muted">無班級資料，請先至後台上傳課表。</div>
              <div v-else>
                <!-- 週別與日期切換列 -->
                <div class="week-picker-bar">
                  <button class="btn btn-secondary btn-week-round" @click="changeClassWeek(-1)" title="上一週">◀</button>
                  <div class="week-label">
                    🗓️ {{ formatDateMMDD(selectedClassWeekDates[0]) }} ~ {{ formatDateMMDD(selectedClassWeekDates[4]) }}
                    <span v-if="classWeekNumber" class="text-primary-bold">（{{ classWeekNumber }}）</span>
                  </div>
                  <button class="btn btn-secondary btn-week-round" @click="changeClassWeek(1)" title="下一週">▶</button>
                  <button class="btn btn-secondary btn-sm-78-ml" @click="goToClassThisWeek">本週</button>
                </div>
                <!-- 班級按鈕（唯讀深連結時鎖定該班；併班項目不設按鈕，其課程併入各單班顯示） -->
                <div v-if="!classReadonlyMode" class="flex-wrap-gap-6" style="margin:12px 0;">
                  <template v-for="cls in classList" :key="cls">
                    <button v-if="!isCombinedClass(cls)"
                      class="btn class-pick-btn"
                      :class="selectedClass === cls ? 'class-pick-btn-active' : 'btn-secondary'"
                      style="padding:4px 12px;font-size:0.8rem;"
                      @click="selectedClass === cls ? (selectedClass = '') : selectClassForView(cls)"
                    >{{ cls }}</button>
                  </template>
                </div>
                <div v-else style="margin:12px 0;font-size:0.85rem;color:var(--text-secondary);">
                  目前檢視：<strong>{{ selectedClass }}</strong>
                </div>
                <div v-if="!selectedClass" style="text-align:center;padding:20px;color:var(--text-muted);">👆 點選上方班級按鈕查看該班課表</div>
                <div v-else class="class-timetable-layout" role="region" aria-label="班級課表內容">
                  <div class="timetable-wrapper class-timetable-main" style="overflow-x:auto;">
                    <div class="class-timetable" :class="{ 'is-readonly': classReadonlyMode || classViewerReadonly }">
                      <div class="grid-header">節</div>
                      <div v-for="(dateStr, idx) in selectedClassWeekDates" :key="'h'+idx" class="grid-header">
                        {{ formatDateMMDD(dateStr) }}<br><span style="font-weight:400;">{{ ['一','二','三','四','五'][idx] }}</span>
                      </div>
                      <template v-for="period in timetablePeriods" :key="'ct-p-'+period">
                        <div class="grid-cell-time" :class="getPeriodClass(period)">
                          <span class="period">{{ getPeriodLabel(period) }}</span>
                          <span class="time-span" v-if="!isMobile" style="font-size:0.62rem;">{{ getPeriodTimeSpan(period) }}</span>
                        </div>
                        <div v-for="(dateStr, dayIdx) in selectedClassWeekDates" :key="dayIdx"
                          class="grid-cell-class"
                           :class="[getPeriodClass(period), getClassCellClassForClass(selectedClass, dayIdx+1, period)]">
                          <template v-if="classSchedules[selectedClass] && classSchedules[selectedClass][(dayIdx+1) + '-' + period]">
                            <template v-if="classSubstitutionMap[selectedClass + '|' + dateStr + '|' + period]">
                              <div class="class-entry-block" :class="{ 'is-readonly': classReadonlyMode || classViewerReadonly }" @click="handleClassCellClick(selectedClass, dayIdx+1, period, 0)">
                                 <div class="cell-subject">
                                  <span class="subject-color-tag" :style="getSubjectStyle(classSubstitutionMap[selectedClass + '|' + dateStr + '|' + period].subject || classSchedules[selectedClass][(dayIdx+1) + '-' + period][0].subject)">
                                    {{ classSubstitutionMap[selectedClass + '|' + dateStr + '|' + period].subject || classSchedules[selectedClass][(dayIdx+1) + '-' + period][0].subject }}
                                  </span>
                                </div>
                                <div class="cell-class-name">
                                   {{ classSubstitutionMap[selectedClass + '|' + dateStr + '|' + period].actualTeacherName || '未指定' }}
                                </div>
                                   <div class="cell-sub-badge">
                                     {{ classSubstitutionMap[selectedClass + '|' + dateStr + '|' + period].specialFlow === 'combined_return' ? '併班上課' : (classSubstitutionMap[selectedClass + '|' + dateStr + '|' + period].type === 'exchange' ? '已調課' : '已代課') }}
                                   <span v-if="classSchedules[selectedClass] && classSchedules[selectedClass][(dayIdx+1) + '-' + period] && classSchedules[selectedClass][(dayIdx+1) + '-' + period][0] && classSchedules[selectedClass][(dayIdx+1) + '-' + period][0]._schoolSwap" class="cell-badge tag-warning">全校對調</span>
                                 </div>
                              </div>
                            </template>
                            <template v-else>
                              <template v-if="classSchedules[selectedClass][(dayIdx+1) + '-' + period].some(e => e.attr === '巡堂' || e.isPatrol)">
                                <span class="cell-empty-label">巡堂</span>
                              </template>
                              <template v-else>
                                <div v-for="(entry, ei) in classSchedules[selectedClass][(dayIdx+1) + '-' + period]" :key="entry.id || ei"
                                  class="class-entry-block"
                                  :class="{ 'is-match-source': isMatchSourceEntry(entry, dayIdx+1, period), 'is-match-hover': isMatchHoverEntry(entry, dayIdx+1, period), 'is-readonly': classReadonlyMode || classViewerReadonly }"
                                  @click.stop="handleClassCellClick(selectedClass, dayIdx+1, period, entry)">
                                  <div class="cell-subject">
                                    <span class="subject-color-tag" :style="getSubjectStyle(entry.subject)">
                                      {{ entry.subject }}
                                    </span>
                                    <span v-if="entry.attr === '單週' || entry.attr === '雙週'" style="font-size:0.65rem;color:var(--text-muted);margin-left:2px;">({{ entry.attr }})</span>
                                     <span v-if="entry.restriction === 'restricted' || hasScheduleSpecialTag(entry, '綁課')" class="cell-badge tag-restricted">綁課</span>
                                      <span v-if="hasScheduleSpecialTag(entry, '預排')" class="cell-badge tag-preplanned">預排</span>
                                     <span v-if="entry._schoolSwap" class="cell-badge tag-warning" :title="entry._schoolSwap.name">全校對調</span>
                                       <span v-if="isClassAwayOnDate(selectedClass, dateStr, period)" class="away-class-badge">{{ getClassAwayEventName(selectedClass, dateStr, period) || '空堂事件' }}</span>
                                  </div>
                                  <div class="cell-class-name">
                                    {{ getRealTeacherName(entry) }}
                                    <span v-if="entry._combinedWith" style="font-size:0.65rem;color:var(--text-muted);">（與{{ entry._combinedWith }}）</span>
                                  </div>
                                </div>
                              </template>
                            </template>
                          </template>
                          <template v-else>
                            <!-- 空堂：留白，不顯示 --- -->
                          </template>
                        </div>
                      </template>
                    </div>
                  </div>
                  <aside class="class-change-summary">
                    <div class="class-change-summary-title">{{ selectedClass }} 班級異動摘要</div>
                    <div v-if="classChangeSummary.length === 0" class="class-change-empty"><span class="empty-state-title">本班目前無異動</span><span class="empty-state-hint">有核准的調代課或全校調課時會顯示在此</span></div>
                    <div v-else class="class-change-list">
                      <div v-for="item in classChangeSummary" :key="item.id" class="class-change-item" :class="{ 'is-week': item.inWeek }">
                        <span class="class-change-type" :class="item.type === '調課' ? 'type-exchange' : (item.type === '全校對調' ? 'type-school-swap' : 'type-sub')">{{ getClassChangeTypeLabel(item.type) }}</span>
                        <span class="class-change-line">{{ item.line }}</span>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </div>
        </div>
</template>

<!-- 班級課表面板（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  classReadonlyMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classViewerReadonly: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isAdmin: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isCombinedClass: { type: Function, required: true },
  selectedClassWeekDates: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classWeekNumber: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  timetablePeriods: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isMobile: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classSchedules: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classSubstitutionMap: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  classChangeSummary: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  copyClassReadonlyLink: { type: Function, required: true },
  changeClassWeek: { type: Function, required: true },
  formatDateMMDD: { type: Function, required: true },
  selectClassForView: { type: Function, required: true },
  getPeriodClass: { type: Function, required: true },
  getPeriodLabel: { type: Function, required: true },
  getPeriodTimeSpan: { type: Function, required: true },
  getClassCellClassForClass: { type: Function, required: true },
  handleClassCellClick: { type: Function, required: true },
  getSubjectStyle: { type: Function, required: true },
  isMatchSourceEntry: { type: Function, required: true },
  isMatchHoverEntry: { type: Function, required: true },
  hasScheduleSpecialTag: { type: Function, required: true },
  isClassAwayOnDate: { type: Function, required: true },
  getClassAwayEventName: { type: Function, required: true },
  getRealTeacherName: { type: Function, required: true },
  getClassChangeTypeLabel: { type: Function, required: true },
  goToClassThisWeek: { type: Function, required: true },
});
const selectedClass = defineModel('selectedClass');
</script>
