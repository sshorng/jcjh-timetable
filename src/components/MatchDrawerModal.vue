<template>
      <div class="match-drawer-overlay" @click.self="closeMatchModal">
        <div class="match-drawer" data-tour="match-drawer" @click.stop>
          <div class="modal-header match-drawer-header">
            <h3>🔍 智慧媒合與調代課建議</h3>
            <button class="btn-close" @click="closeMatchModal">&times;</button>
          </div>
          <div class="modal-body match-drawer-body" style="padding-top: 8px;" data-tour="match-list">
            <div class="match-mode-selector" data-tour="match-mode-tabs" style="margin-bottom: 12px; display: flex; gap: 8px;" v-if="!isBatchMatchFlow && matchMode !== 'triangle'">
              <button class="match-mode-btn flex-1" :class="{ active: matchMode === 'substitution' }" @click="changeMatchMode('substitution')">
                找人代課
              </button>
              <button
                class="match-mode-btn flex-1"
                data-tour="exchange-mode-btn"
                :class="{ active: matchMode === 'exchange' }"
                :disabled="activeCell.classData && (activeCell.classData.isPatrol || activeCell.classData.attr === '巡堂')"
                :title="(activeCell.classData && (activeCell.classData.isPatrol || activeCell.classData.attr === '巡堂')) ? '巡堂不可調課' : ((activeCell.classData && activeCell.classData.restriction === 'restricted') ? '綁課可調課，點選後會提醒確認' : '')"
                @click="changeMatchMode('exchange')"
              >
                找人調課
              </button>
            </div>
            <div v-if="!isBatchMatchFlow && activeCell.classData && (activeCell.classData.isPatrol || activeCell.classData.attr === '巡堂')" style="font-size:0.75rem;color:#5b21b6;margin:-4px 0 10px;padding:6px 10px;background:#f5f3ff;border-radius:6px;border:1px solid #ddd6fe;">
              本節為巡堂：不計鐘點、不需系統代課；若要請人代巡，請私下安排
            </div>
            <div v-if="!isBatchMatchFlow && activeCell.classData && (activeCell.classData.isPullOut || activeCell.classData.attr === '抽離')" style="font-size:0.75rem;color:#0f766e;margin:-4px 0 10px;padding:6px 10px;background:#f0fdfa;border-radius:6px;border:1px solid #99f6e4;">
              本節為抽離：調課僅可與另一節「抽離」互調，不可與一般課調課；可找人代課
            </div>
             <div v-if="!isBatchMatchFlow && activeCell.classData && activeCell.classData.restriction === 'restricted'" style="font-size:0.75rem;color:#b45309;margin:-4px 0 10px;padding:6px 10px;background:#fffbeb;border-radius:6px;border:1px solid #fde68a;">
               此堂為綁課：建議代課；特殊狀況仍可調課（切換時會提醒）
             </div>
             <div
               v-if="!isBatchMatchFlow && isAdmin && activeCell.classData && (isCombinedClass(activeCell.classData.className) || hasScheduleSpecialTag(activeCell.classData, '併班'))"
               style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:-4px 0 12px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;"
             >
               <div style="font-size:0.78rem;color:#9a3412;line-height:1.45;">
                  <strong>合班課堂</strong>：任課教師請假，由同節原本有課的其他併班任課教師代課。
               </div>
                <button type="button" class="btn btn-primary btn-sm" @click="startCombinedReturn">↩ 併班上課</button>
             </div>
              <!-- 批次調課固定逐組配對，每組可各自選對調教師。 -->
              <div v-if="isBatchExchangeFlow" class="match-mode-selector" style="margin-bottom: 12px; display:flex; flex-direction:column; gap:8px;">
                <div class="match-mode-btn active" style="width:100%;text-align:center;cursor:default;">
                  ⇄ 批次調課（{{ batchSlots.length }} 組）
                </div>
                <div class="batch-slot-list" style="max-height:200px;">
                 <div v-for="s in batchSlots" :key="'be'+s.key" class="batch-slot-item" :class="{ 'is-active-slot': batchActiveSlotKey === s.key, 'is-assigned-slot': !!(s.subTeacherEmail && s.targetDate) }" @click="selectBatchSlotForMatch(s.key)">
                   <span>
                     {{ s.teacherName }}　{{ formatDateMMDD(s.dateStr) }}({{ getWeekDayText(s.dayOfWeek) }}) {{ formatPeriodText(s.period) }} {{ s.className }}{{ s.subject }}
                     <small v-if="s.subTeacherEmail && s.targetDate" style="display:block;color:var(--color-success);margin-top:2px;">
                       ↔ {{ s.subTeacherName }}　{{ formatDateMMDD(s.targetDate) }}({{ getWeekDayText(s.targetDayOfWeek) }}) {{ formatPeriodText(s.targetPeriod) }} {{ s.targetClassName }}{{ s.targetSubject }}
                     </small>
                     <small v-else style="display:block;color:var(--text-muted);margin-top:2px;">尚未指定對調課堂</small>
                     <small v-if="s.exchangeSubmissionUnknown" style="display:block;color:#b91c1c;margin-top:2px;">送出結果不明，請重整確認歷程</small>
                     <small v-else-if="s.exchangeValidationError || s.exchangeSubmitError" style="display:block;color:#b91c1c;margin-top:2px;">{{ s.exchangeValidationError || s.exchangeSubmitError }}</small>
                     <small v-if="s.exchangeSubmitted" style="display:block;color:var(--color-success);margin-top:2px;">已送出</small>
                   </span>
                   <button v-if="s.subTeacherEmail && s.targetDate && !s.exchangeSubmitted && !s.exchangeSubmissionUnknown" type="button" class="btn btn-secondary" style="padding:2px 6px;font-size:0.68rem;" @click.stop="clearBatchSlotSub(s.key)">清除</button>
                 </div>
               </div>
               <div class="exchange-weekday-filter" role="group" aria-label="批次調課目標週次">
                 <label class="history-filter-label" for="batch-exchange-week-offset">目標週次：</label>
                 <select id="batch-exchange-week-offset" class="form-control" style="padding:4px 8px;font-size:0.8rem;max-width:150px;" v-model.number="exchangeWeekOffset">
                   <option :value="0">本週</option><option :value="1">下週</option><option :value="-1">上週</option><option :value="2">下下週</option>
                 </select>
                 <span class="history-filter-label">篩選星期：</span>
                 <div class="filter-chip-group">
                   <button v-for="option in exchangeWeekdayOptions" :key="'batch-exchange-day-' + option.value" type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': exchangeWeekdayFilter === option.value }" @click="setExchangeWeekdayFilter(option.value)">{{ option.label }}</button>
                 </div>
               </div>
                <div style="display:flex;justify-content:flex-end;margin-top:4px;">
                 <button type="button" class="btn btn-success" :disabled="!batchAllSlotsAssigned || loading || isSubmitting" @click="prepBatchExchangeCompare">預覽批次調課（{{ batchAssignedCount }}/{{ batchSlots.length }}）</button>
               </div>
             </div>
             <!-- 僅真正批次（≥2 節）才顯示；勿用 v-else 接在綁課提示後面，否則單節也會誤顯 -->
             <div v-else-if="isBatchMatchFlow" class="match-mode-selector" style="margin-bottom: 12px; display:flex; flex-direction:column; gap:8px;">
              <div class="match-mode-btn active" style="width:100%;text-align:center;cursor:default;">
                📦 批次找人代課（{{ batchSlots.length }} 節）
              </div>
              <div class="flex-gap-6">
                <button
                  type="button"
                  class="match-mode-btn flex-1-fs-82"
                  :class="{ active: batchAssignMode === 'same' }"
                  @click="setBatchAssignMode('same')"
                >同一人全代</button>
                <button
                  type="button"
                  class="match-mode-btn flex-1-fs-82"
                  :class="{ active: batchAssignMode === 'perSlot' }"
                  @click="setBatchAssignMode('perSlot')"
                >每節不同人</button>
              </div>
            </div>

            <div v-if="!isBatchExchangeFlow" class="match-filter-area" style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
              <div v-if="!activeCell.dayOfWeek" style="color: var(--text-muted); text-align: center; padding: 10px 0;">
                💡 請點擊課表任一堂有課的節次
              </div>
              <div v-else-if="isBatchMatchFlow && !isBatchExchangeFlow">
                <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px; font-size: 0.95rem;">
                  📦 批次代課：{{ batchSlots[0].teacherName }} 老師 · 共 {{ batchSlots.length }} 節
                  <span v-if="isBatchPerSlotMode" style="font-weight:600;color:var(--color-primary);font-size:0.8rem;margin-left:6px;">
                    （已指定 {{ batchAssignedCount }}/{{ batchSlots.length }}）
                  </span>
                </div>
                <!-- 每節不同人：可點選節次列 -->
                <div v-if="isBatchPerSlotMode" class="batch-slot-list" style="max-height:160px;">
                  <div
                    v-for="s in batchSlots"
                    :key="'ps'+s.key"
                    class="batch-slot-item cursor-pointer"
                    :class="{ 'is-active-slot': batchActiveSlotKey === s.key, 'is-assigned-slot': !!s.subTeacherEmail }"
                    @click="selectBatchSlotForMatch(s.key)"
                  >
                    <span>
                      {{ formatDateMMDD(s.dateStr) }}({{ getWeekDayText(s.dayOfWeek) }}) {{ formatPeriodText(s.period) }} {{ s.className }}{{ s.subject }}
                    </span>
                    <span style="display:flex;align-items:center;gap:6px;">
                      <strong v-if="s.subTeacherEmail" style="color:var(--color-success);">{{ s.subTeacherName }}</strong>
                      <span v-else style="color:var(--text-muted);font-size:0.75rem;">尚未指定</span>
                      <button
                        v-if="s.subTeacherEmail"
                        type="button"
                        class="btn btn-secondary"
                        style="padding:2px 6px;font-size:0.68rem;"
                        @click.stop="clearBatchSlotSub(s.key)"
                      >清除</button>
                    </span>
                  </div>
                </div>
                <div v-else class="batch-slot-chips">
                  <span v-for="s in batchSlots" :key="'m'+s.key" class="batch-slot-chip">
                    {{ formatDateMMDD(s.dateStr) }}({{ getWeekDayText(s.dayOfWeek) }}) {{ formatPeriodText(s.period) }} {{ s.className }}{{ s.subject }}
                  </span>
                </div>
                <div class="text-xs-muted-75-mt">
                  <template v-if="isBatchPerSlotMode">
                    請點上方節次，再從下方名單為<strong>該節</strong>選代課老師。全部指定後按「確認申請」。
                  </template>
                  <template v-else>
                    下列為<strong>全部選定節次皆空堂</strong>的教師（同課／同科／同班標籤為各節聯集）
                  </template>
                </div>
                <div v-if="isBatchPerSlotMode" style="margin-top:10px;display:flex;justify-content:flex-end;">
                  <button
                    type="button"
                    class="btn btn-success"
                    style="padding:6px 14px;font-size:0.82rem;"
                    :disabled="!batchAllSlotsAssigned"
                    @click="prepBatchPerSlotCompare"
                  >確認申請（{{ batchAssignedCount }}/{{ batchSlots.length }}）</button>
                </div>
              </div>
              <div v-else>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;">
                  <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">
                    已選定：{{ activeCell.teacherName }} 老師
                  </div>
                  <div v-if="matchMode === 'exchange'" style="display:flex;align-items:center;gap:6px;flex:0 0 auto;">
                    <button
                      v-if="isAdmin && !isBatchMatchFlow"
                      type="button"
                      class="btn btn-secondary"
                      style="height:34px;padding:0 9px;border-radius:9px;font-size:0.76rem;line-height:1;"
                      title="管理員直接建立同一天、同一節的雙向互換"
                      @click="openSamePeriodSwapModal"
                    >同節互換</button>
                    <button
                      type="button"
                      class="btn btn-primary"
                      style="min-width:64px;height:34px;padding:0 10px;border-radius:9px;font-size:0.82rem;line-height:1;"
                      title="進階：三角調"
                      aria-label="開啟三角調"
                      @click="changeMatchMode('triangle')"
                    >三角調</button>
                  </div>
                </div>
                <div style="color: var(--text-secondary); font-size: 0.8rem; line-height: 1.4;">
                  {{ inputRequestDate }}({{ getWeekDayText(activeCell.dayOfWeek) }}) {{ formatPeriodText(activeCell.period) }} {{ activeCell.classData ? activeCell.classData.className : '' }}{{ activeCell.classData ? activeCell.classData.subject : '' }}
                </div>
                <!-- 跨週調課週次選擇 -->
                <div v-if="matchMode === 'exchange'" data-tour="exchange-controls">
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                    <label class="form-label" style="margin: 0; font-size: 0.8rem; white-space: nowrap;">對調至週次：</label>
                    <select class="form-control" style="padding: 4px 8px; font-size: 0.8rem; max-width: 150px;" v-model.number="exchangeWeekOffset">
                       <option :value="0">本週（同週對調）</option>
                       <option :value="1">下週（往後一週）</option>
                       <option :value="-1">上週（往前一週）</option>
                       <option :value="2">下下週（往後兩週）</option>
                    </select>
                  </div>
                  <div class="exchange-weekday-filter" role="group" aria-label="調課星期篩選">
                    <span class="history-filter-label">篩選星期：</span>
                    <div class="filter-chip-group">
                      <button
                        v-for="option in exchangeWeekdayOptions"
                        :key="'exchange-day-' + option.value"
                        type="button"
                        class="btn btn-secondary filter-chip"
                        :class="{ 'btn-primary': exchangeWeekdayFilter === option.value }"
                        :aria-pressed="exchangeWeekdayFilter === option.value"
                        @click="setExchangeWeekdayFilter(option.value)"
                      >{{ option.label }}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 媒合列表 -->
             <div class="match-list-container" v-if="!(isBatchExchangeFlow && !batchActiveSlotKey && batchAllSlotsAssigned)">
              <div v-if="recommendationLoading" style="text-align: center; padding: 40px;">
                <div class="spinner"></div>
                <p style="font-size: 0.85rem; color: var(--text-muted);">正在計算媒合名單...</p>
              </div>
              <div v-else>
                <!-- 代課模式：搜尋 + 列表 -->
                <template v-if="matchMode === 'substitution'">
                  <!-- 無空堂警告 + 可能原因 -->
                  <div v-if="matchShowNoTeacherWarning && recommendedTeachers.length === 0" class="match-empty-box">
                    <div class="match-empty-icon">🚫</div>
                    <div class="match-empty-title">
                      {{ isBatchMatchFlow && !isBatchPerSlotMode ? '無教師能同時代全部選定節次' : '該時段無空堂教師' }}
                    </div>
                    <div class="match-empty-body">
                      <template v-if="isBatchMatchFlow && !isBatchPerSlotMode">
                        目前 {{ batchSlots.length }} 節找不到「全節皆空」的同一位代課老師。
                      </template>
                      <template v-else>
                        全校 {{ teachersList.length }} 位中，{{ inputRequestDate }}({{ getWeekDayText(activeCell.dayOfWeek) }}) {{ formatPeriodText(activeCell.period) }}目前無可代人選。
                      </template>
                    </div>
                    <ul v-if="matchEmptyReasons && matchEmptyReasons.length" class="match-empty-reasons">
                      <li v-for="(r, i) in matchEmptyReasons" :key="i">{{ r }}</li>
                    </ul>
                    <button class="btn match-empty-btn" @click="closeMatchModal">我知道了，關閉視窗</button>
                  </div>

                  <!-- 搜尋列 -->
                  <div class="mb-10">
                    <input type="text" class="form-control" style="padding:8px 12px;font-size:0.85rem;" placeholder="🔍 搜尋教師姓名或科目..." v-model="matchSearchQuery">
                  </div>
                  <table class="match-table w-100-collapse">
                    <thead>
                      <tr class="tr-match-head">
                        <th class="th-match th-match-teacher">教師</th>
                        <th class="th-match">授課/空堂狀態</th>
                        <th class="th-match-op">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="t in displayedRecommendedTeachers" :key="t.email" class="match-row tr-row-soft"
                        data-match-mode="sub"
                        :data-match-email="t.email"
                        :data-match-name="t.name">
                        <td class="td-match-main">
                          <input type="radio" class="match-pick-radio" name="match-pick-sub" :id="'mps-' + t.email" :value="t.email" tabindex="-1">
                          <label class="match-pick-hit" :for="'mps-' + t.email" :aria-label="'選取 ' + t.name" :title="getTeacherIdentityTooltip(t.email)"></label>
                           <strong class="text-primary-strong" :title="getTeacherIdentityTooltip(t.email)">{{ t.name }}</strong>
                           <span v-if="isHomeroomTeacher(t, activeCell.classData && activeCell.classData.className)" class="badge-match badge-homeroom">導師</span>
                          <span v-if="t.isReleasedByAway" class="badge-match badge-released">外出班空堂</span>
                          <span v-if="t.isSameCourse" class="badge-match badge-same-course">同課</span>
                          <span v-if="t.isSameSubject" class="badge-match badge-same-subject">同科</span>
                          <span v-if="t.isSameClass" class="badge-match badge-same-class">同班</span>
                          <span v-if="activeCell.classData && activeCell.classData.restriction === 'restricted'" class="badge-match badge-restricted">原課綁課</span>
                        </td>
                        <td style="padding: 10px 4px; color: var(--text-muted); font-size: 0.8rem;">
                          <template v-if="isBatchMatchFlow && !isBatchPerSlotMode">
                             全節可代 <span class="text-secondary">（參考日已排：{{ t.todayPeriodCount }}節）</span>
                            <span v-if="isMutualCover" class="text-mutual-sub">
                              折抵額度：{{ typeof t.remainingReleased === 'number' ? t.remainingReleased : (t.mutualQuota || 0) }}
                              <span v-if="t.pendingDraft" class="text-violet-soft">（已暫定佔 {{ t.pendingDraft }}）</span>
                              <span v-if="t.suggestedFee" :style="{color: (t.suggestedFee==='扣額度' || t.suggestedFee==='互代不結') ? '#6b21a8' : '#b45309'}"> → {{ t.suggestedFee === '互代不結' ? '扣額度' : t.suggestedFee }}</span>
                            </span>
                          </template>
                          <template v-else>
                            <span v-if="t.isReleasedByAway" style="color:#6b21a8;font-weight:600;">外出班釋出</span>
                            <span v-else>空堂</span>
                             <span class="text-secondary">（當日已排：{{ t.todayPeriodCount }}節）</span>
                            <span v-if="isMutualCover" class="text-mutual-sub">
                              折抵額度：{{ typeof t.remainingReleased === 'number' ? t.remainingReleased : (t.mutualQuota || 0) }}
                              <span v-if="t.pendingDraft" class="text-violet-soft">（已暫定佔 {{ t.pendingDraft }}）</span>
                              <span v-if="t.suggestedFee" :style="{color: (t.suggestedFee==='扣額度' || t.suggestedFee==='互代不結') ? '#6b21a8' : '#b45309'}">
                                → {{ t.suggestedFee === '互代不結' ? '扣額度' : t.suggestedFee }}
                              </span>
                            </span>
                          </template>
                        </td>
                        <td class="td-match-op">
                          <div v-if="isMutualCover && !isBatchMatchFlow" class="match-op-pair">
                            <button
                              type="button"
                              class="btn btn-secondary match-op-btn"
                              title="對照雙方課表（不寫入暫定）"
                              @click.stop="prepCompare('substitution', t.email)"
                            >模擬</button>
                            <button
                              type="button"
                              class="btn btn-primary match-op-btn match-op-btn-draft"
                              title="加入暫定安排"
                              @click.stop="assignMutualDraftFromMatch(t.email)"
                            >暫定</button>
                          </div>
                          <div v-else-if="isBatchMatchFlow && isBatchPerSlotMode" class="match-op-pair match-op-pair-horizontal">
                            <button type="button" class="btn btn-secondary match-op-btn" @click.stop.prevent="previewBatchCandidate('substitution', t.email)">模擬</button>
                            <button type="button" class="btn btn-primary match-op-btn" @click.stop.prevent="assignBatchSlotSub(t.email)">指定此節</button>
                          </div>
                          <div v-else-if="isBatchMatchFlow" class="match-op-pair match-op-pair-horizontal">
                            <button type="button" class="btn btn-secondary match-op-btn" @click.stop.prevent="previewBatchCandidate('substitution', t.email)">模擬</button>
                            <button type="button" class="btn btn-primary match-op-btn" @click.stop.prevent="prepBatchCompare(t.email)">選用</button>
                          </div>
                          <button
                            v-else
                            class="btn btn-primary btn-sm-compact"
                            @click.stop="prepCompare('substitution', t.email)"
                          >模擬</button>
                        </td>
                      </tr>
                      <tr v-if="filteredRecommendedTeachers.length === 0 && !matchShowNoTeacherWarning">
                        <td colspan="3" class="empty-center-pad"><span class="empty-state-title">沒有符合的教師</span><span class="empty-state-hint">可改關鍵字或清空搜尋</span></td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-if="filteredRecommendedTeachers.length > displayedRecommendedTeachers.length" class="center-pad-10">
                    <button class="btn btn-secondary btn-sm-20" @click="loadMoreMatches">
                      載入更多（{{ displayedRecommendedTeachers.length }} / {{ filteredRecommendedTeachers.length }}）
                    </button>
                  </div>
                </template>

                 <!-- 三角調模式：選兩堂原課，組成 A → B → C → A 閉環 -->
                  <template v-else-if="matchMode === 'triangle'">
                    <div class="triangle-builder" data-tour="triangle-builder">
                     <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
                       <strong style="font-size:0.9rem;color:#1d4ed8;">進階功能：三角調</strong>
                       <button type="button" class="btn btn-secondary btn-sm-tight" @click="changeMatchMode('exchange')">← 返回一般調課</button>
                     </div>
                      <div style="padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:12px;line-height:1.5;color:#1e3a8a;font-size:0.8rem;">
                         <strong>三角調是整堂課循環交換</strong>：系統只列同班的有效原課，請先選 B，再選 C。三方都同意、教學組核准後才會整組生效。
                     </div>

                      <div style="display:grid;grid-template-columns:1fr;gap:10px;align-items:start;">
                         <div class="card" style="margin:0;padding:12px;background:#fff;border:1px solid #bfdbfe;">
                           <div style="font-weight:700;color:#1d4ed8;font-size:0.82rem;margin-bottom:6px;">A．目前原課</div>
                          <div style="font-size:0.82rem;line-height:1.5;">
                            <strong>{{ activeCell.teacherName }}</strong><br>
                            {{ formatTriangleSlot({ date: inputRequestDate, day: activeCell.dayOfWeek, period: activeCell.period }, activeCell.classData, activeCell.teacherName) }}
                          </div>
                        </div>
                         <div class="card" style="margin:0;padding:12px;background:#fff;border:1px solid #bfdbfe;">
                          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                             <span style="font-weight:700;color:#1d4ed8;font-size:0.82rem;">依序選擇 B、C 的原課</span>
                            <span style="font-size:0.72rem;color:var(--text-muted);">{{ triangleCandidateB ? triangleCandidateCReadyCount + ' / ' + triangleCandidateCOptions.length + ' 堂 C 可選' : triangleCandidateBReadyCount + ' / ' + triangleCandidateBOptions.length + ' 堂 B 可選' }}</span>
                          </div>
                          <input
                            type="text"
                            class="form-control"
                            style="padding:7px 10px;font-size:0.8rem;margin-bottom:8px;"
                            placeholder="搜尋教師、班級、科目或日期…"
                            v-model="triangleCandidateSearch"
                            aria-label="搜尋三角調原課"
                          >
                          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">先選 B：A 的課會移到 B 的原課時段。</div>
                          <div v-if="displayedTriangleBOptions.length" style="display:grid;gap:6px;max-height:190px;overflow:auto;padding-right:2px;">
                            <button
                              v-for="candidate in displayedTriangleBOptions"
                              :key="'tri-b-' + candidate.key"
                              type="button"
                              :disabled="!candidate.triangleHasC"
                               :style="{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: '1px solid ' + (trianglePickB === candidate.key ? '#2563eb' : (candidate.triangleHasC ? '#e2e8f0' : '#e5e7eb')), borderRadius: '8px', background: trianglePickB === candidate.key ? '#eff6ff' : (candidate.triangleHasC ? '#fff' : '#f3f4f6'), cursor: candidate.triangleHasC ? 'pointer' : 'not-allowed', color: candidate.triangleHasC ? 'var(--text-primary)' : '#9ca3af', opacity: candidate.triangleHasC ? '1' : '0.78' }"
                              @click="selectTriangleCandidateB(candidate)"
                            >
                              <strong style="font-size:0.78rem;">B．{{ candidate.teacherName }}</strong>
                              <span style="display:block;font-size:0.74rem;margin-top:2px;color:var(--text-secondary);">{{ formatTriangleSlot(candidate, candidate, candidate.teacherName) }}</span>
                              <span v-if="candidate.triangleCanDirectExchange || candidate.isPullOut || candidate.attr === '抽離' || triangleCandidateIsRestricted(candidate)" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                                <span v-if="candidate.triangleCanDirectExchange" class="badge-match" style="background:#dcfce7;color:#166534;">可直接對調</span>
                                <span v-if="candidate.isPullOut || candidate.attr === '抽離'" class="badge-match badge-pullout">抽離</span>
                                <span v-if="triangleCandidateIsRestricted(candidate)" class="badge-match badge-restricted">綁課</span>
                              </span>
                              <span style="display:block;font-size:0.68rem;margin-top:3px;color:var(--text-muted);">{{ candidate.triangleHasC ? '可接 C' : '沒有 C 可接' }}</span>
                            </button>
                          </div>
                          <div v-else style="padding:12px 8px;text-align:center;color:var(--text-muted);font-size:0.8rem;">找不到可作為 B 的同班有效原課。</div>
                           <div v-if="triangleCandidateB" style="font-size:0.75rem;color:var(--text-secondary);margin:10px 0 6px;border-top:1px solid #dbeafe;padding-top:9px;">再選 C：B 的課會移到 C 的原課時段，C 的課會回到 A 的原課時段。</div>
                          <div v-if="triangleCandidateB && displayedTriangleCOptions.length" style="display:grid;gap:6px;max-height:190px;overflow:auto;padding-right:2px;">
                            <button
                              v-for="candidate in displayedTriangleCOptions"
                              :key="'tri-c-' + candidate.key"
                              type="button"
                              :disabled="!candidate.triangleHasB"
                               :style="{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: '1px solid ' + (trianglePickC === candidate.key ? '#2563eb' : (candidate.triangleHasB ? '#e2e8f0' : '#e5e7eb')), borderRadius: '8px', background: trianglePickC === candidate.key ? '#eff6ff' : (candidate.triangleHasB ? '#fff' : '#f3f4f6'), cursor: candidate.triangleHasB ? 'pointer' : 'not-allowed', color: candidate.triangleHasB ? 'var(--text-primary)' : '#9ca3af', opacity: candidate.triangleHasB ? '1' : '0.78' }"
                              @click="selectTriangleCandidateC(candidate)"
                            >
                              <strong style="font-size:0.78rem;">C．{{ candidate.teacherName }}</strong>
                               <span style="display:block;font-size:0.74rem;color:var(--text-secondary);margin-top:2px;">{{ formatTriangleSlot(candidate, candidate, candidate.teacherName) }}</span>
                              <span v-if="candidate.isPullOut || candidate.attr === '抽離' || triangleCandidateIsRestricted(candidate)" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                                <span v-if="candidate.isPullOut || candidate.attr === '抽離'" class="badge-match badge-pullout">抽離</span>
                                <span v-if="triangleCandidateIsRestricted(candidate)" class="badge-match badge-restricted">綁課</span>
                              </span>
                              <span style="display:block;font-size:0.68rem;margin-top:3px;color:var(--text-muted);">{{ candidate.triangleHasB ? '可完成三角調' : '選定 B 後無法完成' }}</span>
                            </button>
                          </div>
                          <div v-if="triangleCandidateB && !displayedTriangleCOptions.length" style="padding:12px 8px;text-align:center;color:var(--text-muted);font-size:0.8rem;">目前找不到能完成三角調的 C。</div>
                          <div v-if="(triangleCandidateB ? triangleCandidateCOptions.length : triangleCandidateBOptions.length) > triangleCandidateDisplayCount" style="text-align:center;margin-top:8px;">
                            <button type="button" class="btn btn-secondary btn-sm-tight" @click="loadMoreTriangleCandidates">載入更多原課</button>
                          </div>
                        </div>
                      </div>

                     <div v-if="trianglePreviewRows.length" style="margin-top:14px;padding:12px 14px;background:#fff;border:1px solid var(--border-color);border-radius:10px;">
                       <div style="font-weight:700;color:var(--text-primary);font-size:0.86rem;margin-bottom:8px;">交換前後預覽</div>
                       <div v-for="row in trianglePreviewRows" :key="'tri-preview-' + row.index" style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #f1f5f9;font-size:0.78rem;line-height:1.45;">
                         <span><strong>{{ row.sourceTeacher }}</strong><br>{{ formatTriangleSlot(row.sourceSlot, row.sourceCourse, row.sourceTeacher) }}</span>
                          <span style="font-size:1.05rem;color:#64748b;">→</span>
                         <span><strong>{{ row.targetTeacher }} 時段</strong><br>{{ formatTriangleSlot(row.targetSlot, row.sourceCourse, row.sourceTeacher) }}</span>
                       </div>
                       <div style="margin-top:8px;font-size:0.75rem;color:var(--text-secondary);">三位教師完成交換後，每位教師只保留一個最終授課時段；中間步驟的暫時衝堂不單獨否決。</div>
                     </div>

                      <div v-if="triangleValidation && triangleValidation.errors && triangleValidation.errors.length" style="margin-top:12px;padding:10px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;color:#9f1239;font-size:0.78rem;line-height:1.5;">
                        <strong>尚不能送出：</strong>
                        <span v-for="(error, index) in triangleValidation.errors" :key="'tri-error-' + index">{{ index ? '；' : ' ' }}{{ error }}</span>
                      </div>

                       <div v-if="triangleReady" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid #dbeafe;">
                        <button type="button" class="btn btn-secondary btn-sm-tight" @click="openTriangleTimetablePreview">👥 預覽三人課表</button>
                        <button type="button" class="btn btn-secondary btn-sm-tight" @click="openTrianglePaperPreview">👁️ 預覽調課單</button>
                      </div>

                      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:12px;padding:12px;background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;">
                       <label style="display:block;font-size:0.8rem;color:var(--text-secondary);">
                         假別／課務類型
                         <select class="form-select" v-model="triangleReason" style="margin-top:5px;">
                           <option value="" disabled>請選擇假別／課務類型（未填寫時預設請假）</option>
                           <option value="課務調整">課務調整（無請假）</option>
                           <option v-for="r in leaveReasonOptions" :key="'tri-r-' + r" :value="r">{{ r }}</option>
                         </select>
                        </label>
                        <label style="display:block;font-size:0.8rem;color:var(--text-secondary);">
                         事由
                         <textarea class="form-input" rows="3" v-model="triangleNote" placeholder="例如：三位教師已先行確認交換安排"></textarea>
                        </label>
                      </div>

                      <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px;">
                       <button type="button" class="btn btn-secondary" @click="closeMatchModal">取消</button>
                       <button type="button" class="btn btn-primary" :disabled="!triangleReady || triangleSubmitting" @click="submitTriangleRequest">
                         {{ triangleSubmitting ? '送出中…' : '確認送出三角調' }}
                       </button>
                     </div>
                   </div>
                 </template>

                  <!-- 調課模式列表 -->
                  <template v-else>
                   <div class="mb-10" style="display:flex;gap:8px;align-items:center;">
                     <input type="text" class="form-control" style="padding:8px 12px;font-size:0.85rem;" placeholder="🔍 搜尋教師、班級、科目或節次…" v-model="matchSearchQuery">
                     <button v-if="matchSearchQuery" type="button" class="btn btn-secondary btn-sm-tight" @click="matchSearchQuery = ''">清除</button>
                   </div>
                   <table class="match-table w-100-collapse">
                    <thead>
                      <tr class="tr-match-head">
                        <th class="th-match th-match-teacher">教師</th>
                        <th class="th-match">授課/空堂狀態</th>
                        <th class="th-match-op">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in displayedExchangeList" :key="r.teacherEmail + r.periodKey" class="match-row tr-row-soft"
                        data-match-mode="exc"
                        :data-match-email="r.teacherEmail"
                        :data-match-day="r.dayOfWeek"
                        :data-match-period="r.period"
                        :data-match-class="r.className || ''"
                        :data-match-subject="r.subject || ''"
                        :data-match-name="getRealTeacherName(r)">
                        <td class="td-match-main">
                          <input type="radio" class="match-pick-radio" name="match-pick-exc" :id="'mpe-' + r.teacherEmail + '-' + r.dayOfWeek + '-' + r.period" :value="r.teacherEmail + '|' + r.dayOfWeek + '|' + r.period" tabindex="-1">
                          <label class="match-pick-hit" :for="'mpe-' + r.teacherEmail + '-' + r.dayOfWeek + '-' + r.period" :aria-label="'選取 ' + getRealTeacherName(r)" :title="getTeacherIdentityTooltip(r.teacherEmail || getRealTeacherName(r))"></label>
                          <strong :title="getTeacherIdentityTooltip(r.teacherEmail || getRealTeacherName(r))">{{ getRealTeacherName(r) }}</strong>
                          <div v-if="hasSubTeacherConflict" style="color: var(--color-danger); font-size: 0.7rem; font-weight: bold;">⚠️ 教師課務衝突</div>
                          <div style="font-size: 0.7rem; color: var(--text-muted);">{{ r.className }} ({{ r.subject }})</div>
                          <span v-if="r.freeByAway" class="badge-match badge-released">外出班釋出</span>
                          <span v-if="r.isPullOut || r.attr === '抽離'" class="badge-match badge-pullout">抽離</span>
                          <span v-if="activeCell.classData && (activeCell.classData.isPullOut || activeCell.classData.attr === '抽離')" class="badge-match badge-pullout">原課抽離</span>
                          <span v-if="activeCell.classData && activeCell.classData.restriction === 'restricted'" class="badge-match badge-restricted">原課綁課</span>
                          <span v-if="r.restriction === 'restricted'" class="badge-match badge-restricted">對調課綁課</span>
                        </td>
                        <td style="padding: 10px 4px; font-size: 0.8rem; color: var(--text-secondary);">
                          可調：<span v-if="getMatchSlotDateMMDD(r.dayOfWeek)" style="font-weight: 600; color: var(--text-primary); margin-right: 2px;">{{ getMatchSlotDateMMDD(r.dayOfWeek) }}</span>({{ getWeekDayText(r.dayOfWeek) }}) {{ formatPeriodText(r.period) }}
                        </td>
                        <td class="td-match-op">
                          <div v-if="isBatchExchangeFlow" class="match-op-pair match-op-pair-horizontal">
                            <button type="button" class="btn btn-secondary match-op-btn" @click.stop.prevent="previewBatchCandidate('exchange', r.teacherEmail, r.periodKey, r.subject, r.className)">模擬</button>
                            <button type="button" class="btn btn-primary match-op-btn" @click.stop.prevent="prepCompare('exchange', r.teacherEmail, r.periodKey, r.subject, r.className)">選為本組</button>
                          </div>
                          <button v-else type="button" class="btn btn-primary btn-sm-compact" @click.stop.prevent="prepCompare('exchange', r.teacherEmail, r.periodKey, r.subject, r.className)">模擬</button>
                        </td>
                      </tr>
                      <tr v-if="filteredExchangeList.length === 0">
                        <td colspan="3" class="empty-center-pad">
                          <span class="empty-state-title">{{ recommendedExchangeList.length === 0 ? '目前沒有符合條件的對調課堂' : '這個星期沒有可對調課堂' }}</span>
                          <span class="empty-state-hint">
                            <template v-if="recommendedExchangeList.length === 0">請改選目標週次，並確認同班課程與雙方在交換時段皆可上課。</template>
                            <template v-else>其他星期有候選課堂，可切回「全部」查看。</template>
                          </span>
                          <button v-if="exchangeWeekdayFilter" type="button" class="btn btn-secondary btn-sm-tight" style="margin-top:6px;" @click="setExchangeWeekdayFilter(0)">顯示全部星期</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-if="filteredExchangeList.length > displayedExchangeList.length" class="center-pad-10">
                    <button class="btn btn-secondary btn-sm-20" @click="loadMoreMatches">
                      載入更多（{{ displayedExchangeList.length }} / {{ filteredExchangeList.length }}）
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
</template>

<!-- 媒合抽屜（代／調課候選）（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  isBatchMatchFlow: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  matchMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  activeCell: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isAdmin: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isBatchExchangeFlow: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchSlots: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchActiveSlotKey: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  exchangeWeekdayOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  exchangeWeekdayFilter: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchAllSlotsAssigned: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  loading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isSubmitting: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchAssignedCount: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  batchAssignMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isBatchPerSlotMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  inputRequestDate: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  recommendationLoading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  matchShowNoTeacherWarning: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  recommendedTeachers: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  teachersList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  matchEmptyReasons: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  displayedRecommendedTeachers: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isMutualCover: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  filteredRecommendedTeachers: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleCandidateB: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleCandidateCReadyCount: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleCandidateCOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleCandidateBReadyCount: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleCandidateBOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  displayedTriangleBOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  trianglePickB: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  displayedTriangleCOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  trianglePickC: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleCandidateDisplayCount: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  trianglePreviewRows: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleValidation: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleReady: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  leaveReasonOptions: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  triangleSubmitting: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  displayedExchangeList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  hasSubTeacherConflict: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  filteredExchangeList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  recommendedExchangeList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  changeMatchMode: { type: Function, required: true },
  isCombinedClass: { type: Function, required: true },
  hasScheduleSpecialTag: { type: Function, required: true },
  selectBatchSlotForMatch: { type: Function, required: true },
  formatDateMMDD: { type: Function, required: true },
  getWeekDayText: { type: Function, required: true },
  formatPeriodText: { type: Function, required: true },
  clearBatchSlotSub: { type: Function, required: true },
  setExchangeWeekdayFilter: { type: Function, required: true },
  setBatchAssignMode: { type: Function, required: true },
  getTeacherIdentityTooltip: { type: Function, required: true },
  isHomeroomTeacher: { type: Function, required: true },
  prepCompare: { type: Function, required: true },
  assignMutualDraftFromMatch: { type: Function, required: true },
  previewBatchCandidate: { type: Function, required: true },
  assignBatchSlotSub: { type: Function, required: true },
  prepBatchCompare: { type: Function, required: true },
  formatTriangleSlot: { type: Function, required: true },
  selectTriangleCandidateB: { type: Function, required: true },
  triangleCandidateIsRestricted: { type: Function, required: true },
  selectTriangleCandidateC: { type: Function, required: true },
  getRealTeacherName: { type: Function, required: true },
  getMatchSlotDateMMDD: { type: Function, required: true },
  closeMatchModal: { type: Function, required: true },
  startCombinedReturn: { type: Function, required: true },
  prepBatchExchangeCompare: { type: Function, required: true },
  prepBatchPerSlotCompare: { type: Function, required: true },
  openSamePeriodSwapModal: { type: Function, required: true },
  loadMoreMatches: { type: Function, required: true },
  loadMoreTriangleCandidates: { type: Function, required: true },
  openTriangleTimetablePreview: { type: Function, required: true },
  openTrianglePaperPreview: { type: Function, required: true },
  submitTriangleRequest: { type: Function, required: true },
});
defineEmits(['close']);
const exchangeWeekOffset = defineModel('exchangeWeekOffset');
const matchSearchQuery = defineModel('matchSearchQuery');
const triangleCandidateSearch = defineModel('triangleCandidateSearch');
const triangleReason = defineModel('triangleReason');
const triangleNote = defineModel('triangleNote');
</script>
