<template>

    
    <!-- §UI-0 全螢幕載入遮罩 → components/LoadingOverlay.vue -->
    <LoadingOverlay :loading="loading" :loading-message="loadingMessage" />

    <!-- §UI-1 登入畫面 → components/LoginCard.vue -->
    <LoginCard
      v-if="!user && !classReadonlyMode"
      :gsi-logging-in="gsiLoggingIn"
      :gsi-button-error="gsiButtonError"
      @login="loginWithGoogle"
    />

    <!-- ════════════════════════════════════════
         §UI-2 主畫面（導覽 + 各 Tab）／公開班級唯讀
         ════════════════════════════════════════ -->
    <div v-else class="app-container">
      
      <!-- §UI-2.0 頂部導航欄 -->
      <nav class="navbar">
        <div class="nav-brand">
          <div class="nav-logo-icon">JC</div>
          <span class="nav-title-full">{{ classReadonlyMode && !user ? '建成國中班級課表' : '建成國中線上課表系統' }}</span>
          <span class="nav-title-short">{{ classReadonlyMode && !user ? '班級課表' : '課表系統' }}</span>
        </div>
        
        <!-- Tab 選單（公開唯讀只顯示班級課表） -->
        <div class="nav-menu" v-if="user" data-tour="nav-menu">
          <button
            class="nav-item"
            :class="{ active: activeTab === 'timetable' }"
            :aria-current="activeTab === 'timetable' ? 'page' : undefined"
            data-tour="nav-timetable"
            @click="setActiveTab('timetable')"
            title="課表總覽"
          >
            <span class="nav-label-full">課表總覽</span><span class="nav-label-short">課表</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: activeTab === 'pending' }"
            :aria-current="activeTab === 'pending' ? 'page' : undefined"
            data-tour="nav-pending"
            @click="setActiveTab('pending')"
             :title="paperMode ? '紙本申請進度' : '待辦簽核'"
           >
             <span class="nav-label-full">{{ paperMode ? '申請進度' : '待辦簽核' }}</span><span class="nav-label-short">{{ paperMode ? '進度' : '待辦' }}</span>
            <span v-if="myInviteCount > 0" class="nav-badge nav-badge-invite" :title="'待您回覆 ' + myInviteCount + ' 筆'">{{ myInviteCount }}</span>
            <span v-if="adminTodoCount > 0" class="nav-badge nav-badge-admin" :title="'待核准 ' + adminTodoCount + ' 筆'">{{ adminTodoCount }}</span>
          </button>
          <button
            class="nav-item"
            :class="{ active: activeTab === 'records' }"
            :aria-current="activeTab === 'records' ? 'page' : undefined"
            data-tour="nav-records"
            @click="setActiveTab('records')"
            title="歷史紀錄"
          >
            <span class="nav-label-full">歷史紀錄</span><span class="nav-label-short">歷史</span>
          </button>
          <button 
            v-if="user || classReadonlyMode"
            class="nav-item"
            :class="{ active: activeTab === 'class' }"
            :aria-current="activeTab === 'class' ? 'page' : undefined"
            data-tour="nav-class"
            @click="setActiveTab('class')"
            title="班級課表"
          >
            <span class="nav-label-full">班級課表</span><span class="nav-label-short">班級</span>
          </button>
          <button 
            v-if="isAdmin"
            class="nav-item"
            :class="{ active: activeTab === 'admin' }"
            :aria-current="activeTab === 'admin' ? 'page' : undefined"
            data-tour="nav-admin"
            @click="setActiveTab('admin')"
            title="後台管理"
          >
            <span class="nav-label-full">後台管理</span><span class="nav-label-short">後台</span>
          </button>
        </div>
        <div class="nav-menu" v-else>
          <span class="nav-item active nav-item-readonly" title="班級課表（唯讀）">
            <span class="nav-label-full">班級課表（唯讀）</span><span class="nav-label-short">班級</span>
          </span>
        </div>

        <!-- 使用者資訊與學期切換 -->
        <div class="user-profile">
          <div class="user-info" v-if="user">
            <img class="user-avatar" :src="avatarSrc" @error="handleAvatarError" alt="Avatar">
            <span class="user-name">{{ user.displayName }}</span>
            <span v-if="isAdmin" class="badge-admin">教學組</span>
            <span v-else-if="isStaff" class="badge-staff">行政</span>
            <span v-else class="badge-teacher">{{ userRoleText }}</span>
          </div>
          <div class="user-info" v-else>
            <span class="user-name user-name-guest">訪客唯讀</span>
          </div>
          
          <!-- 學期選擇 -->
          <div v-if="isAdmin" class="flex-row-center">
            <select class="form-select nav-semester-select" v-model="currentSemester">
              <option v-for="sem in semestersList" :key="sem.id" :value="sem.id">{{ sem.name }}</option>
            </select>
          </div>
          <div v-else class="nav-semester-label">
            {{ currentSemesterName }}
          </div>

          <!-- 代申請：僅「已授權的行政」可選代理對象 -->
          <div v-if="isStaff" class="nav-pos-rel">
            <button
              type="button"
              class="btn btn-secondary nav-action-btn"
              :disabled="!canStaffProxySubmit"
              :title="canStaffProxySubmit ? '選擇要代誰申請' : '您尚未被教學組授權代申請'"
              @click.stop="canStaffProxySubmit && (showProxyTargetDropdown = !showProxyTargetDropdown)"
            >
              {{ isProxySubmitActive ? ('代申請：' + proxyTargetName) : (canStaffProxySubmit ? '📋 代申請…' : '📋 代申請（未授權）') }}
            </button>
            <div
              v-if="showProxyTargetDropdown && canStaffProxySubmit"
              class="card nav-dropdown-panel nav-dropdown-panel-wide"
              @click.stop
            >
              <input v-model="proxyTargetQuery" type="search" class="form-input nav-dropdown-search" placeholder="搜尋姓名／科目" @click.stop>
              <ul class="nav-dropdown-list">
                <li
                  v-if="isProxySubmitActive"
                  class="nav-dropdown-item-action recommend-item"
                  @click="clearProxyTarget()"
                >⬅ 改回自己的課</li>
                <li
                  v-for="t in filteredProxyTeachers"
                  :key="'proxy-' + t.email"
                  class="nav-dropdown-item recommend-item"
                  @click="setProxyTarget(t.email)"
                >
                  <span>{{ t.name }}</span>
                  <span class="badge tag-blue badge-mini-tag">{{ t.subject || '教師' }}</span>
                </li>
                <li v-if="!filteredProxyTeachers.length" class="nav-dropdown-empty">無符合教師</li>
              </ul>
            </div>
          </div>

          <!-- 模擬切換身份 (僅限管理員；開下拉才掛 DOM) -->
          <div v-if="isAdmin || isSimulating" class="nav-pos-rel">
            <button type="button" class="btn btn-secondary nav-action-btn" @click.stop="showDevDropdown = !showDevDropdown">
              🧪 模擬身份...
            </button>
            <div v-if="showDevDropdown" class="card nav-dropdown-panel" @click.stop>
              <input v-model="devTeacherQuery" type="search" class="form-input nav-dropdown-search" placeholder="搜尋姓名／Email" @click.stop>
              <ul class="nav-dropdown-list">
                <li v-if="isSimulating" class="nav-dropdown-item-action recommend-item" @click="restoreAdmin(); showDevDropdown = false;">
                  ⬅ 還原管理員
                </li>
                 <li v-for="t in filteredDevTeachers" :key="t.loginEmail || t.email" class="nav-dropdown-item recommend-item" @click="devSwitchUser(t.loginEmail); showDevDropdown = false; devTeacherQuery = '';">
                  <span>{{ t.name }}</span>
                  <span class="badge badge-mini-tag" :class="t.role === 'admin' ? 'tag-red' : (t.role === 'staff' ? 'tag-amber' : 'tag-blue')">{{ t.role === 'admin' ? '教學組' : (t.role === 'staff' ? '行政' : '教師') }}</span>
                </li>
                <li v-if="!filteredDevTeachers.length" class="nav-dropdown-empty">無符合教師</li>
              </ul>
            </div>
          </div>

                                    <span
            v-if="user && softSyncing && !dataRefreshing"
            class="nav-soft-sync"
            title="背景同步中（不需關閉頁面）"
          >同步中…</span>
          <button
            v-if="user"
            type="button"
            class="btn-nav-icon btn-data-refresh"
            :disabled="dataRefreshing || loading"
            @click="manualRefreshData"
            :title="dataRefreshing ? '同步中…' : (softSyncing ? '背景同步中…' : (dataUpdatedLabel + '　點擊重新整理'))"
            :aria-busy="dataRefreshing || softSyncing ? 'true' : 'false'"
            aria-label="重新整理資料"
          >{{ dataRefreshing ? '…' : '↻' }}</button>
          <button
            v-if="user"
            type="button"
            class="btn-nav-icon btn-help"
            data-tour="help-btn"
            @click="startOnboarding"
             :title="notificationsSuppressed ? '紙本流程操作教學' : '線上簽核操作教學'"
             :aria-label="notificationsSuppressed ? '紙本流程操作教學' : '線上簽核操作教學'"
          >?</button>
          <button v-if="user" type="button" class="btn-logout" @click="logout">登出</button>
        </div>
      </nav>

      <!-- 主體內容 -->
      <main class="main-content">

        <!-- ════════════════════════════════════
             §UI-2.1 Tab：課表總覽與智慧媒合
             ════════════════════════════════════ -->
        <div v-if="user && activeTab === 'timetable'">
          <div class="two-column-layout">

            <!-- 手機：快速待辦置頂（課表上方；含管理員） -->
            <div
              v-if="hasQuickTodo && isMobile"
              class="card mobile-quick-todo-top"
              style="margin:0 0 4px;order:-1;"
            >
              <div class="match-header side-panel-head">快速待辦</div>
              <div class="quick-todo-list">
                <div v-for="req in myPendingRequests.slice(0, 5)" :key="'mqp-'+req.id" class="quick-todo-row">
                  <div class="quick-todo-main">
                    <div class="quick-todo-top">
                      <span class="status-badge tag-red badge-mini">待簽核</span>
                      <span class="status-badge badge-mini" :class="req.type === 'exchange' ? 'tag-blue' : 'tag-red'">{{ req.type === 'exchange' ? '調課' : '代課' }}</span>
                    </div>
                    <div class="quick-todo-title">{{ formatQuickTodoTitle(req, 'incoming') }}</div>
                  </div>
                  <div class="quick-todo-actions">
                    <button v-if="req.batchId" class="btn btn-success btn-xs-batch" @click="respondToBatch(req.batchId, 'agree')" title="同批次全部同意">全同意</button>
                    <button class="btn btn-success btn-xs-tight-nowrap" @click="respondToRequest(req.id, 'agree')">同意</button>
                    <button class="btn btn-danger btn-xs-tight-nowrap" @click="respondToRequest(req.id, 'decline')">拒絕</button>
                  </div>
                </div>
                <div v-for="req in quickTodoSentOpen.slice(0, 3)" :key="'mqs-'+req.id" class="quick-todo-row cursor-pointer" @click="detailRequest = req; detailSubRecord = null; showDetailModal = true">
                  <div class="quick-todo-main">
                    <div class="quick-todo-top">
                      <span class="status-badge tag-yellow badge-mini">{{ getStatusText(req.status) }}</span>
                      <span class="status-badge badge-mini" :class="req.type === 'exchange' ? 'tag-blue' : 'tag-red'">{{ req.type === 'exchange' ? '調課' : '代課' }}</span>
                    </div>
                    <div class="quick-todo-title">{{ formatQuickTodoTitle(req, 'sent') }}</div>
                  </div>
                  <div class="quick-todo-actions" @click.stop>
                    <button type="button" class="btn btn-secondary btn-xs-tight" @click.stop="openPaperPrintForRequest(req)">🖨️</button>
                    <button v-if="req.status === 'pending_teacher' || isPaperFlowRequest(req)" type="button" class="btn btn-success btn-xs-line" @click.stop="copyLineMessageForRequest(req)">LINE</button>
                    <button type="button" class="btn btn-secondary btn-xs-tight-danger" @click.stop="cancelRequest(req.id)">撤回</button>
                  </div>
                </div>
                <div class="text-right-mt-6">
                  <a href="#" class="link-view-all" @click.prevent="activeTab = 'pending'">查看全部 →</a>
               </div>
             </div>
           </div>
            
            <!-- 左欄：課表主畫面 -->
              <div class="card" style="grid-column: span 1;">
               <div class="card-title">
                 <span>📅 課表主畫面</span>
                  <div class="action-buttons action-buttons-wrap timetable-toolbar-actions">
                   <div class="tt-display-switch" role="group" aria-label="課表資訊顯示">
                     <button
                       type="button"
                       class="tt-display-option"
                       :class="{ active: timetableDisplayMode === 'clean' }"
                       :aria-pressed="timetableDisplayMode === 'clean' ? 'true' : 'false'"
                       title="只顯示班級與科目；抽離、綁課以標記表示"
                       @click="timetableDisplayMode = 'clean'"
                     >簡潔</button>
                     <button
                       type="button"
                       class="tt-display-option"
                       :class="{ active: timetableDisplayMode === 'detail' }"
                       :aria-pressed="timetableDisplayMode === 'detail' ? 'true' : 'false'"
                       title="顯示課程的完整屬性標籤"
                       @click="timetableDisplayMode = 'detail'"
                     >詳細</button>
                   </div>
                   <div class="batch-operation-picker" role="group" aria-label="批次處理方式">
                     <button
                       type="button"
                       class="btn btn-sm batch-operation-toggle"
                        :class="batchSelectMode ? 'btn-primary' : 'btn-secondary'"
                       :aria-pressed="batchSelectMode ? 'true' : 'false'"
                       data-tour="batch-btn"
                       :title="batchSelectMode ? '關閉批次選課' : '開始批次選課'"
                       @click="toggleBatchSelectMode"
                     >{{ batchSelectMode ? '批次' : '📦 批次處理' }}</button>
                     <template v-if="batchSelectMode">
                       <span class="batch-operation-divider" aria-hidden="true"></span>
                       <button
                         type="button"
                         class="btn btn-sm batch-operation-type"
                         :class="{ 'is-active': batchFlowMode === 'substitution' }"
                         :aria-pressed="batchFlowMode === 'substitution' ? 'true' : 'false'"
                         title="批次代課"
                         @click="setBatchFlowMode('substitution')"
                       >代課</button>
                       <button
                         type="button"
                         class="btn btn-sm batch-operation-type"
                         :class="{ 'is-active': batchFlowMode === 'exchange' }"
                         :aria-pressed="batchFlowMode === 'exchange' ? 'true' : 'false'"
                         :disabled="isMutualCover && batchFlowMode !== 'exchange'"
                         title="批次調課"
                         @click="setBatchFlowMode('exchange')"
                       >調課</button>
                     </template>
                   </div>
                   <button
                    v-if="batchSelectMode && batchSlots.length"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="clearBatchSlots"
                  >清空 ({{ batchSlots.length }})</button>
                  <button
                    v-if="batchSelectMode && batchSlots.length >= 2"
                    type="button"
                    class="btn btn-success btn-sm"
                    @click="openBatchMatch"
                  >{{ batchFlowMode === 'exchange' ? '配對調課' : '智慧媒合' }} ({{ batchSlots.length }})</button>
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="btn btn-sm"
                    data-tour="mutual-btn"
                    :class="isMutualCover ? 'btn-primary' : 'btn-secondary'"
                    @click="toggleMutualCover"
                    title="公假外出活動互代：雙方不結鐘點"
                  >{{ isMutualCover ? '🔁 互代中' : '🔁 活動互代' }}</button>
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="btn btn-sm btn-secondary"
                    title="組合有效但單步規則擋下的特例（含同節互換），由管理員背書建單"
                    @click="openExceptionComposer"
                  >🛠️ 特例調代</button>
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="btn btn-sm"
                    :class="isScheduleEditMode ? 'btn-success' : 'btn-secondary'"
                    @click="isScheduleEditMode = !isScheduleEditMode"
                  >
                    <span>{{ isScheduleEditMode ? '💾 退出基礎課表編輯' : '✏️ 編輯基礎課表' }}</span>
                  </button>
                 </div>
               </div>
                 <div v-if="paperMode && !isAdmin && !isProxySubmitActive" class="batch-hint-bar" style="border-color:#f59e0b;background:#fffbeb;color:#92400e;">
                   🖨️ 目前為紙本審核模式：送出後會建立待教學組核准的申請，並開啟紙本通知供調代課教師簽名。
                </div>
                <div v-else-if="notificationsSuppressed && isAdmin" class="batch-hint-bar" style="border-color:#f59e0b;background:#fffbeb;color:#92400e;">
                   🔧 紙本作業模式：可線上提出申請、列印調代課單，但仍需進行紙本簽核程序，請務必提交簽名後調代課單至教學組。
                </div>
                <div v-if="batchSelectMode" class="batch-hint-bar">
                  <template v-if="batchFlowMode === 'exchange'">
                    批次調課：選取最多 20 堂調出課，可依權限選不同教師；進入配對後逐組選對調教師與課堂。已選 {{ batchSlots.length }} 組。
                  </template>
                  <template v-else>
                    批次代課：點選<strong>同一位教師</strong>多節 → 可選「同一人全代」或「每節不同人」→ 填寫申請表。已選 {{ batchSlots.length }} 節。
                  </template>
               </div>
              <div v-if="isAdmin && isMutualCover" class="batch-hint-bar mutual-away-panel">
                <div class="mutual-panel-head">
                   <div class="mutual-panel-title">🔁 活動互代：設日期／節次 → 選外出班 → 媒合優先「釋出空堂」</div>
                  <button type="button" class="btn btn-secondary mutual-btn-clear" @click="clearMutualPanel" title="清空外出班、帶隊、暫定、備註；期間改回本週">
                    🗑️ 一鍵清空
                  </button>
                </div>
                <div class="mutual-panel-lead">
                  釋出空堂去代 → <strong>扣額度</strong>；本來就空堂去代 → <strong>活動公費</strong>（可領費）；請假老師<strong>一律不扣</strong>鐘點。
                </div>
                <div class="flex-wrap-gap-8-mb">
                  <label class="label-inline-date">
                    起日
                    <input type="date" class="form-control form-date-xs" v-model="mutualActivityStart">
                  </label>
                  <label class="label-inline-date">
                    迄日
                    <input type="date" class="form-control form-date-xs" v-model="mutualActivityEnd">
                  </label>
                  <label class="label-inline-date">
                    節次模式
                    <select class="form-select" style="min-width:104px;padding:4px 7px;" v-model="mutualActivityPeriodMode" @change="setMutualActivityPeriodMode(mutualActivityPeriodMode)">
                      <option value="daily">每日指定</option>
                      <option value="range">連續起迄</option>
                    </select>
                  </label>
                  <template v-if="mutualActivityPeriodMode === 'daily'">
                    <span style="font-size:0.75rem;color:var(--text-secondary);">每天適用：</span>
                    <button type="button" class="btn btn-secondary btn-xs" :class="{ 'btn-success': isMutualActivityPeriodSelected('all') }" @click="toggleMutualActivityPeriod('all')">全部</button>
                    <button v-for="option in classAwayPeriodOptions" :key="'mutual-daily-'+option.value" type="button" class="btn btn-secondary btn-xs" :class="{ 'btn-success': isMutualActivityPeriodSelected(option.value) }" @click="toggleMutualActivityPeriod(option.value)">{{ option.label }}</button>
                  </template>
                  <template v-else>
                  <label class="label-inline-date">
                    起點節次
                    <select class="form-select" style="min-width:104px;padding:4px 7px;" v-model="mutualActivityStartPeriod" @change="setMutualActivityPeriodBoundary('start', mutualActivityStartPeriod)">
                      <option v-for="option in classAwayPeriodOptions" :key="'mutual-start-'+option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                  </label>
                  <label class="label-inline-date">
                    終點節次
                    <select class="form-select" style="min-width:104px;padding:4px 7px;" v-model="mutualActivityEndPeriod" @change="setMutualActivityPeriodBoundary('end', mutualActivityEndPeriod)">
                      <option v-for="option in classAwayPeriodOptions" :key="'mutual-end-'+option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                  </label>
                  </template>
                  <button type="button" class="btn btn-secondary btn-xs" @click="setMutualActivityThisWeek">本週</button>
                   <span class="text-mutual-hint">期間：{{ mutualCoverStats.rangeLabel || '未設定' }}（{{ mutualCoverStats.rangeDays || 0 }} 天）</span>
                </div>
                <div v-if="mutualImportableEvents.length" class="mutual-import-row">
                  <label class="mutual-import-label">
                    <span class="mutual-import-label-text">空堂事件</span>
                    <select
                      class="form-select mutual-import-select"
                      :value="mutualImportEventId"
                      @change="applyClassAwayEventById($event.target.value)"
                    >
                       <option value="">請選擇事件，自動帶入日期與班級</option>
                      <option v-for="ev in mutualImportableEvents" :key="'imp-'+ev.id" :value="ev.id">
                         {{ ev.name }}（{{ ev.startDate }}～{{ ev.endDate || '學期結束' }} · {{ classAwayPeriodLabel(ev) }} · {{ (ev.classes || []).length }} 班）
                      </option>
                    </select>
                  </label>
                </div>
                <div v-else class="mutual-hint-soft">
                  尚無可進互代的空堂事件（後台「空堂事件」請勾可進互代）
                </div>
                <div class="form-group mb-8">
                  <label class="form-label mutual-note-label">統一備註（寫入本批每筆申請）</label>
                  <input
                    type="text"
                    class="form-control mutual-note-input"
                    v-model="mutualNote"
                     placeholder="例：九年級畢旅 4/21～4/22"
                  >
                </div>
                <div class="mb-8">
                  <div class="flex-wrap-gap-6-mb4">
                    <span class="text-xs">外出班：</span>
                    <button type="button" class="btn btn-secondary btn-xs" @click="selectAwayGrade('7')">七年級</button>
                    <button type="button" class="btn btn-secondary btn-xs" @click="selectAwayGrade('8')">八年級</button>
                    <button type="button" class="btn btn-secondary btn-xs" @click="selectAwayGrade('9')">九年級</button>
                    <button type="button" class="btn btn-secondary btn-xs" @click="mutualAwayClasses = []; persistMutualPanelDraft()">清空班級</button>
                    <button type="button" class="btn btn-primary btn-xs" @click="recalculateMutualQuotasFromActivity()" title="依期間與外出班寫入「額度帳本」發放紀錄（排除帶隊與小鐘點；同活動不重複）">
                      ＋發放額度
                    </button>
                    <span class="text-mutual-hint">已選 {{ mutualAwayClasses.length }} 班</span>
                  </div>
                  <div class="mutual-away-chips mutual-chips-away">
                    <button
                      v-for="c in classList"
                      :key="'away-'+c"
                      type="button"
                      class="mutual-away-chip"
                      :class="{ active: mutualAwayClasses.includes(c) }"
                      @click="toggleMutualAwayClass(c)"
                    >{{ c }}</button>
                  </div>
                </div>
                <div class="mb-8">
                  <div class="flex-wrap-gap-6-mb4">
                    <span class="mutual-section-label">帶隊老師（不寫入額度）：</span>
                    <button type="button" class="btn btn-secondary btn-xs" @click="mutualLeadEmails = []; persistMutualPanelDraft()">清空帶隊</button>
                    <span class="text-mutual-hint">已選 {{ mutualLeadEmails.length }} 人</span>
                  </div>
                  <div class="mutual-lead-tip">點選加入帶隊；再點一次取消。跳課表請用下方「各帶隊老師課務」姓名按鈕。</div>
                  <div class="mutual-away-chips mutual-chips-lead">
                    <button
                      v-for="t in teachersList"
                      :key="'lead-'+t.email"
                      type="button"
                      class="mutual-away-chip mutual-lead-chip"
                      :class="{ active: isMutualLead(t.email) }"
                      :title="isMutualLead(t.email) ? '再點一次：取消帶隊' : '點選：加入帶隊'"
                      @click="onMutualLeadChipClick(t.email)"
                    >{{ t.name }}</button>
                  </div>
                </div>
                <div class="mutual-progress-box">
                  <div>
                    <strong>活動期間進度</strong>
                    <span v-if="mutualCoverStats.leaveTeachers"> · 帶隊 {{ mutualCoverStats.leaveTeachers }} 人 · 外出 {{ mutualCoverStats.awayClasses }} 班</span>
                  </div>
                  <div v-if="mutualCoverStats.leaveTeachers" class="mutual-stat-row">
                    <span>需求 <strong>{{ mutualCoverStats.demand }}</strong></span>
                    <span>已送出 <strong>{{ mutualCoverStats.arranged }}</strong>
                      <span class="text-xs-muted-70">（互代{{ mutualCoverStats.mutualDone }}·公費{{ mutualCoverStats.publicDone }}）</span>
                    </span>
                    <span>暫定 <strong :class="(mutualCoverStats.drafted||0) > 0 ? 'text-draft-on' : ''">{{ mutualCoverStats.drafted || 0 }}</strong></span>
                    <span>尚缺 <strong class="text-danger-deep">{{ mutualCoverStats.remaining }}</strong></span>
                  </div>
                  <div v-else class="mutual-need-lead">
                    請先勾選帶隊老師，才會計算：需求／已送出／暫定／尚缺。
                  </div>
                  <div v-if="mutualCoverStats.byLeaders && mutualCoverStats.byLeaders.length" class="mutual-leaders-block">
                    <div class="mutual-leaders-title">各帶隊老師課務</div>
                    <div
                      v-for="L in mutualCoverStats.byLeaders"
                      :key="'ld-'+L.email"
                      class="mutual-leader-row"
                    >
                      <button
                        type="button"
                        class="btn btn-secondary btn-xs"
                        @click="jumpToTeacherTimetable(L.email, { useActivityWeek: true })"
                        :title="'跳到 '+L.name+' 課表，並切到活動期間週次'+(mutualActivityStart ? '（'+mutualActivityStart+'）' : '')"
                      >
                        {{ L.name }}
                      </button>
                      <span>需求 <strong>{{ L.demand }}</strong></span>
                      <span>已送出 <strong>{{ L.arranged }}</strong>
                        <span class="text-xs-muted-70">（互代{{ L.mutualDone }}·公費{{ L.publicDone }}{{ L.period8Done ? '·第8節'+L.period8Done : '' }}）</span>
                      </span>
                      <span>暫定 <strong :class="(L.drafted||0) > 0 ? 'text-draft-on' : 'text-muted'">{{ L.drafted || 0 }}</strong></span>
                      <span>尚缺 <strong :class="L.remaining > 0 ? 'text-danger-deep' : 'text-ok-green'">{{ L.remaining }}</strong></span>
                    </div>
                  </div>
                  <div v-else class="mutual-hint-soft mutual-hint-mt">
                    請先勾選「帶隊老師」。需求＝期間內課表應代節（不含巡堂／外出班）；尚缺＝需求−已送出−暫定。
                  </div>
                  <div class="mutual-quota-note">
                     ＊額度寫在「教師名單」；明細在試算表「額度帳本」。同活動不重複發放；扣額度 FIFO。帶隊不發放。一般課表釋出 1 節＝1 額度；代課（小鐘點）不發額度，未授課另扣。1～7 節：餘額≥1→扣額度（扣 1）；不足 1→活動公費。第8節不吃額度。
                  </div>
                  <label class="mutual-skip-label">
                    <input type="checkbox" v-model="mutualSkipNotify" class="chk-md">
                    <span>先不寄系統信，排完後用 LINE 手動通知（建議）</span>
                  </label>
                  <div v-if="mutualDrafts.length" class="mutual-drafts-block">
                    <div class="mutual-drafts-head">
                      <strong class="text-violet-deep">暫定安排 {{ mutualDrafts.length }} 節</strong>
                        <button v-if="!paperMode || isAdmin" type="button" class="btn btn-success mutual-btn-submit" :disabled="isSubmitting || loading" @click="submitAllMutualDrafts">
                         {{ (isSubmitting || loading) ? '送出中…' : '🚀 一次送出全部暫定' }}
                       </button>
                       <button v-else type="button" class="btn btn-primary mutual-btn-submit" :disabled="isSubmitting || loading" @click="openPaperPrintMutualDrafts">🖨️ 列印紙本單</button>
                      <button type="button" class="btn btn-secondary btn-xs" @click="clearMutualDrafts">清空暫定</button>
                    </div>
                    <div class="mutual-drafts-list">
                      <div
                        v-for="d in mutualDrafts"
                        :key="d.key"
                        class="mutual-draft-row"
                      >
                        <span>{{ d.leaveName }}</span>
                        <span class="text-muted">{{ formatDateMMDD(d.dateStr) }} {{ formatPeriodText(d.period) }} {{ d.className }}</span>
                        <span>→ <strong class="text-draft-on">{{ d.subName }}</strong></span>
                        <span :class="(d.fee==='扣額度' || d.fee==='互代不結') ? 'text-draft-on' : (d.fee==='第8節代課' ? 'text-period8' : (d.fee===TIMETABLE_ONLY_FEE ? 'text-timetable-only' : 'text-amber'))">{{ d.fee === '互代不結' ? '扣額度' : d.fee }}</span>
                        <button
                          type="button"
                          class="btn btn-secondary mutual-btn-x"
                          title="模擬對方課表"
                          @click="previewMutualDraft(d)"
                        >模擬</button>
                        <button type="button" class="btn btn-secondary mutual-btn-x" @click="removeMutualDraft(d.key)">清除</button>
                      </div>
                    </div>
                  </div>
                  <div v-else class="mutual-hint-soft mutual-hint-mt2">
                    操作：點帶隊老師課格 → 選代課老師 → 格子顯示「暫定」→ 全部排完按「一次送出」。選取與暫定會自動暫存。
                  </div>
                </div>
              </div>
              
              <!-- 行政代申請提示（僅未授權／進行中顯示） -->
              <div v-if="isStaff && (!canStaffProxySubmit || isProxySubmitActive)" class="batch-hint-bar mb-8" >
                <template v-if="!canStaffProxySubmit">
                  行政可瀏覽全校課表。代他人申請需教學組在「後台 → 系統設定」勾選授權<strong>您這位行政</strong>（不是一次開全部行政）。
                </template>
                <template v-else>
                  目前代申請：<strong>{{ proxyTargetName }}</strong>。送出後跳過受邀確認，直接送教學組核准。
                  <button type="button" class="btn btn-secondary btn-xs-tight" style="margin-left:8px;" @click="clearProxyTarget">改回自己</button>
                </template>
              </div>

              <!-- 教學組／行政：搜尋與範圍 -->
              <div class="toolbar toolbar-row-mb" v-if="canViewAllTimetables" data-tour="timetable-toolbar">
                <div class="search-input-wrap" style="flex:2;min-width:140px;">
                  <input
                    type="text"
                    class="form-control search-input-with-clear"
                    style="width:100%;padding:6px 32px 6px 10px;font-size:0.85rem;"
                    placeholder="搜尋教師姓名…"
                    v-model="searchQuery"
                    title="輸入姓名快速定位"
                  >
                  <button
                    v-if="searchQuery"
                    type="button"
                    class="search-clear-btn"
                    title="清空搜尋"
                    aria-label="清空搜尋"
                    @click="searchQuery = ''"
                  >&times;</button>
                </div>
                <select
                  class="form-control"
                  style="width:auto;min-width:140px;padding:6px 10px;font-size:0.85rem;"
                  v-model="selectedSubject"
                  title="顯示範圍"
                >
                  <option value="mine">我的課表</option>
                  <option value="all">全部教師（分頁）</option>
                  <option v-for="subj in subjectsList" :key="subj" :value="subj">{{ subj }}</option>
                </select>
              </div>

              <!-- 週次 + 課表（導覽可一併框選） -->
              <div data-tour="week-and-grid">
              <!-- 週別與日期切換列 -->
              <div class="week-picker-bar" data-tour="week-nav">
                <button class="btn btn-secondary btn-week-round" @click="changeWeek(-1)" title="上一週">◀</button>
                <div class="week-label">
                  🗓️ 當週：{{ formatDateMMDD(currentWeekDates[0]) }} ~ {{ formatDateMMDD(currentWeekDates[4]) }} <span v-if="currentWeekNumber" class="text-primary-bold">（{{ currentWeekNumber }}）</span>
                </div>
                <button class="btn btn-secondary btn-week-round" @click="changeWeek(1)" title="下一週">▶</button>
                <input type="date" class="form-control form-control-week-date" v-model="selectedWeekDate">
              </div>


              <!-- 課表格線 -->
              <div class="timetable-wrapper" data-tour="timetable">
                <div v-if="filteredTeachers.length === 0" class="empty-state-center">
                  <span class="empty-state-title">沒有可顯示的課表</span><span class="empty-state-hint">請先至後台上傳課表，或調整搜尋範圍</span>
                </div>
                
                <div v-else>
                  <!-- 全校／多師：分頁列（≤ 一頁人數時隱藏） -->
                  <div v-if="ttNeedPager" class="tt-pager-bar">
                    <span style="font-size:0.8rem;color:var(--text-secondary);">
                       顯示 {{ (ttPage - 1) * ttPageSize + 1 }}～{{ Math.min(ttPage * ttPageSize, displayTimetableTeachers.length) }}
                      ／共 {{ displayTimetableTeachers.length }} 位
                    </span>
                    <select class="form-control" style="width:auto;padding:4px 8px;font-size:0.78rem;" v-model.number="ttPageSize" title="每頁人數">
                      <option :value="8">每頁 8 人</option>
                      <option :value="10">每頁 10 人</option>
                      <option :value="12">每頁 12 人</option>
                      <option :value="20">每頁 20 人</option>
                    </select>
                    <button type="button" class="btn btn-secondary btn-sm-75" :disabled="ttPage <= 1" @click="changeTtPage(ttPage - 1)">上一頁</button>
                    <span style="font-size:0.78rem;font-weight:600;">{{ ttPage }} / {{ ttTotalPages }}</span>
                    <button type="button" class="btn btn-secondary btn-sm-75" :disabled="ttPage >= ttTotalPages" @click="changeTtPage(ttPage + 1)">下一頁</button>
                    <span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;">提示：可用上方搜尋姓名，不必一次開全校</span>
                  </div>
                  <div class="tt-teacher-list">
                  <div
                    v-for="teacher in visibleTimetableTeachers"
                    :key="teacher.email"
                    :id="'tt-teacher-' + String(teacher.email).replace(/[^a-zA-Z0-9_-]/g, '_')"
                    class="tt-teacher-block"
                     v-memo="[(weekScheduleGrid[teacher.email] || null), getTeacherTimetableHours(teacher), isScheduleEditMode, isMobile, isMutualCover, batchSelectMode, timetableDisplayMode]"
                  >
                    <h4 class="tt-teacher-head">
                      <span aria-hidden="true">👤</span>
                      <span class="tt-teacher-name">{{ teacher.name }} 老師</span>
                      <span class="badge badge-subj" :class="teacher.role === 'admin' ? 'tag-red' : (teacher.role === 'staff' ? 'tag-amber' : 'tag-blue')">{{ teacher.subject }}科</span>
                      <span class="tt-teacher-hours">（基本鐘點 {{ getTeacherTimetableHours(teacher).basicHours }} 節／超鐘點 {{ getTeacherTimetableHours(teacher).overtimeHours }} 節）</span>
                    </h4>
                    
                     <div class="timetable-grid" :class="{ 'edit-mode': isScheduleEditMode, 'tt-clean-mode': timetableDisplayMode === 'clean' }">
                      <div class="grid-header">節</div>
                      <div class="grid-header">一<span class="date-sub" v-if="!isMobile"><br>{{ formatDateMMDD(currentWeekDates[0]) }}</span></div>
                      <div class="grid-header">二<span class="date-sub" v-if="!isMobile"><br>{{ formatDateMMDD(currentWeekDates[1]) }}</span></div>
                      <div class="grid-header">三<span class="date-sub" v-if="!isMobile"><br>{{ formatDateMMDD(currentWeekDates[2]) }}</span></div>
                      <div class="grid-header">四<span class="date-sub" v-if="!isMobile"><br>{{ formatDateMMDD(currentWeekDates[3]) }}</span></div>
                      <div class="grid-header">五<span class="date-sub" v-if="!isMobile"><br>{{ formatDateMMDD(currentWeekDates[4]) }}</span></div>
                      
                      <template v-for="period in timetablePeriods" :key="'tt-p-'+period">
                        <div class="grid-cell-time" :class="getPeriodClass(period)">
                          <span class="period">{{ getPeriodLabel(period) }}</span>
                          <span class="time-span" v-if="!isMobile">{{ getPeriodTimeSpan(period) }}</span>
                        </div>
                        
                        <!-- 每格只取一次 slot（cell+cls+draft 已預先算好） -->
                        <div 
                          v-for="day in 5" 
                          :key="day" 
                          class="grid-cell-class"
                          :data-tt-email="String(teacher.email || '').toLowerCase()"
                          :data-tt-day="day"
                          :data-tt-period="period"
                          :data-tt-date="currentWeekDates[day-1]"
                           :class="[getPeriodClass(period), ((weekScheduleGrid[teacher.email] || {})[day + '-' + period] || {}).cls || 'is-empty']"
                          :title="getCellPlainStatus(((weekScheduleGrid[teacher.email] || {})[day + '-' + period] || {}).cell)"
                          @click="handleCellClick(teacher.email, day, period, currentWeekDates[day-1])"
                        >
                           <template v-for="slot in [((weekScheduleGrid[teacher.email] || {})[day + '-' + period] || null)]" :key="'s'+day+period">
                             <template v-if="slot && slot.cell">
                               <span v-if="timetableDisplayMode === 'clean' && isTimetablePullout(slot.cell)" class="tt-cell-marker tt-cell-marker-pullout" aria-hidden="true"></span>
                               <span v-if="timetableDisplayMode === 'clean' && isTimetableRestricted(slot.cell)" class="tt-cell-marker tt-cell-marker-restricted" aria-hidden="true"></span>
                               <template v-if="slot.cell.isPatrol || slot.cell.attr === '巡堂'">
                                <span class="cell-empty-label">巡堂</span>
                              </template>
                              <template v-else>
                                 <div class="cell-main" :class="{ 'cell-main-concurrent': slot.cell.hasConcurrentDuty }">
                                   <div v-if="slot.cell.hasConcurrentDuty" class="cell-overlap-current-label">{{ slot.cell.subType === 'exchange' || slot.cell.subType === 'triangle' ? '本節調入課' : '本節代課' }}</div>
                                  <div class="cell-class-name" v-if="slot.cell.className && String(slot.cell.className).trim()">
                                    <span class="class-color-badge" :style="getClassBadgeStyle(slot.cell.className)">
                                      {{ formatClassName(slot.cell.className) || slot.cell.className }}
                                    </span>
                                  </div>
                                   <div class="cell-subject" :class="{ 'cell-subject-away': slot.isAwayLabel }">
                                      {{ slot.cell.subject }}<span v-if="slot.cell.isSubstitute || slot.cell.attr === '代課'" title="代課">（代）</span><span v-else-if="slot.cell.isOvertime || slot.cell.attr === '超鐘點'" title="超鐘點">（超）</span>
                                      <span v-if="slot.isAwayLabel" class="away-class-badge">{{ getClassAwayEventName(slot.cell.className, currentWeekDates[day-1], period) || '空堂事件' }}</span>
                                   </div>
                                  <div v-if="slot.draft" class="cell-sub-text mutual-draft-label">
                                    暫定：{{ slot.draftSubName }}
                                    <span class="opacity-85">（{{ slot.draftFeeShort }}）</span>
                                  </div>
                                  <div v-if="!isMobile && slot.cell.subText && String(slot.cell.subText).replace(/[📌\s]/g, '') !== String(slot.cell.subject || '').replace(/[📌\s]/g, '')" class="cell-sub-text cell-sub-muted">{{ slot.cell.subText }}</div>
                                   <div v-if="!isMobile && slot.cell.pendingText" class="cell-sub-text cell-sub-pending">{{ slot.cell.pendingText }}</div>
                                    <div v-if="slot.cell.hasConcurrentDuty && slot.cell.outgoingDuty" class="cell-overlap-outgoing">
                                      <div class="cell-overlap-label">原課調出</div>
                                      <div v-if="slot.cell.outgoingDuty.className && String(slot.cell.outgoingDuty.className).trim()" class="cell-overlap-class">
                                        <span class="class-color-badge" :style="getClassBadgeStyle(slot.cell.outgoingDuty.className)">
                                          {{ formatClassName(slot.cell.outgoingDuty.className) || slot.cell.outgoingDuty.className }}
                                        </span>
                                      </div>
                                      <div v-if="slot.cell.outgoingDuty.subject" class="cell-overlap-subject">{{ slot.cell.outgoingDuty.subject }}</div>
                                    <div v-if="!isMobile && slot.cell.outgoingDuty.subText" class="cell-overlap-subtext">{{ slot.cell.outgoingDuty.subText }}</div>
             </div>
                                    <div v-if="slot.cell.hasMultipleOutgoing && slot.cell.outgoingDuties && slot.cell.outgoingDuties.length > 1" class="cell-overlap-outgoing">
                                      <div class="cell-overlap-label">多重調出（{{ slot.cell.outgoingDuties.length }}筆）</div>
                                      <div v-for="(d, di) in slot.cell.outgoingDuties" :key="'mo'+di" class="cell-overlap-multi">
                                        <span v-if="d.className" class="class-color-badge" :style="getClassBadgeStyle(d.className)">{{ formatClassName(d.className) || d.className }}</span>
                                        <span v-if="d.subject" class="cell-overlap-subject">{{ d.subject }}</span>
                                        <div v-if="!isMobile && d.subText" class="cell-overlap-subtext">{{ d.subText }}</div>
                                      </div>
             </div>
          </div>
                                   <div class="cell-badges">
                                      <span v-if="slot.cell.hasConcurrentDuty" class="cell-badge tag-gray" title="原課已調出，本節改上掉入課">原課調出</span>
                                      <span v-if="slot.cell.isReturnDuty" class="cell-badge tag-green" title="代回本人原課">代回</span>
                                      <span v-if="slot.cell.hasMultipleOutgoing" class="cell-badge tag-warning" :title="'本節共調出' + (slot.cell.outgoingDuties ? slot.cell.outgoingDuties.length : 2) + '筆'">多重調出</span>
                                      <span v-if="slot.cell.isCombinedReturn" class="cell-badge tag-combined">併班上課</span>
                                    <span v-if="slot.cell.isSubstituted"
                                    class="cell-badge"
                                    :class="slot.cell.subType === 'exchange' ? 'tag-warning' : (slot.cell.isMutualCover ? 'tag-purple' : 'tag-red')"
                                  >{{ slot.cell.subType === 'exchange' ? '調出' : (slot.cell.isMutualCover ? '互代/外出' : '被代') }}</span>
                                  <span v-if="slot.cell.isSubstitutionDuty" class="cell-badge" :class="slot.cell.isEmptySlotAssign ? 'tag-purple' : (slot.cell.isMutualCover ? 'tag-purple' : 'tag-green')">
                                    {{ slot.cell.subType === 'exchange' ? '調入' : (slot.cell.isEmptySlotAssign ? '空堂任務' : (slot.cell.isMutualCover ? '互代' : '代課')) }}
                                  </span>
                                    <span v-if="timetableDisplayMode === 'detail' && slot.cell.isElastic" class="cell-badge tag-green badge-elastic">實支</span>
                                    <span v-if="timetableDisplayMode === 'detail' && (slot.cell.isSubstitute || slot.cell.attr === '代課')" class="cell-badge tag-amber">代課</span>
                                   <span v-if="timetableDisplayMode === 'detail' && slot.cell.attr === '單週'" class="cell-badge tag-week">單週</span>
                                   <span v-if="timetableDisplayMode === 'detail' && slot.cell.attr === '雙週'" class="cell-badge tag-week">雙週</span>
                                   <span
                                     v-if="timetableDisplayMode === 'detail' && period === 8 && slot.cell.attr !== '單週' && slot.cell.attr !== '雙週' && !slot.cell.isSubstituted && !slot.cell.isSubstitutionDuty && !slot.cell.isPending && !(slot.cell.isPatrol || slot.cell.attr === '巡堂')"
                                     class="cell-badge tag-blue"
                                   >課輔</span>
                                    <span v-if="timetableDisplayMode === 'detail' && (slot.cell.isPullOut || slot.cell.attr === '抽離')" class="cell-badge tag-pullout">抽離</span>
                                    <span v-if="slot.cell.schoolSwap" class="cell-badge tag-warning" :title="slot.cell.schoolSwap.name">全校對調</span>
                                     <span v-if="timetableDisplayMode === 'detail' && (slot.cell.restriction === 'restricted' || hasScheduleSpecialTag(slot.cell, '綁課'))" class="cell-badge tag-restricted">綁課</span>
                                    <span v-if="timetableDisplayMode === 'detail' && hasScheduleSpecialTag(slot.cell, '預排')" class="cell-badge tag-preplanned">預排</span>
                                  <span 
                                    v-if="slot.cell.isPending"
                                    class="cell-badge"
                                    :class="slot.cell.pendingRecord && slot.cell.pendingRecord.status === 'pending_admin' ? 'badge-pending-admin' : 'badge-pending-teacher'"
                                  >{{ slot.cell.pendingRecord && slot.cell.pendingRecord.status === 'pending_admin' ? '審核' : '申請' }}</span>
                                </div>
                              </template>
                            </template>
                            <template v-else>
                              <span class="cell-empty-label">空堂</span>
                            </template>
                          </template>
                        </div>
                      </template>
                    </div>
                  </div>
                  </div><!-- /.tt-teacher-list -->
                  <!-- 全校／多師：底部分頁列，方便看完一頁後直接換頁 -->
                  <div v-if="ttNeedPager" class="tt-pager-bar tt-pager-bar-bottom">
                    <span style="font-size:0.8rem;color:var(--text-secondary);">
                       顯示 {{ (ttPage - 1) * ttPageSize + 1 }}～{{ Math.min(ttPage * ttPageSize, displayTimetableTeachers.length) }}
                      ／共 {{ displayTimetableTeachers.length }} 位
                    </span>
                    <select class="form-control" style="width:auto;padding:4px 8px;font-size:0.78rem;" v-model.number="ttPageSize" title="每頁人數">
                      <option :value="8">每頁 8 人</option>
                      <option :value="10">每頁 10 人</option>
                      <option :value="12">每頁 12 人</option>
                      <option :value="20">每頁 20 人</option>
                    </select>
                    <button type="button" class="btn btn-secondary btn-sm-75" :disabled="ttPage <= 1" @click="changeTtPage(ttPage - 1)">上一頁</button>
                    <span style="font-size:0.78rem;font-weight:600;">{{ ttPage }} / {{ ttTotalPages }}</span>
                    <button type="button" class="btn btn-secondary btn-sm-75" :disabled="ttPage >= ttTotalPages" @click="changeTtPage(ttPage + 1)">下一頁</button>
                    <span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;">提示：可用上方搜尋姓名，不必一次開全校</span>
                  </div>
                </div>
              </div>
              </div><!-- /data-tour=week-and-grid -->
            </div>

            <!-- 右欄：今日提示 + 快速待辦 + 個人異動摘要 -->
            <div class="stack-col-12">
              <div
                v-if="activeAwayBanner"
                class="card away-side-compact"
                style="margin:0;padding:6px 10px;display:flex;align-items:center;gap:6px;flex-wrap:nowrap;line-height:1.25;"
                :title="'今日空堂事件：' + activeAwayBanner.names + '（' + activeAwayBanner.count + ' 班）'"
              >
                <span style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);white-space:nowrap;">📭 今日空堂</span>
                <span style="font-size:0.72rem;color:var(--text-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ activeAwayBanner.names }}</span>
                <span style="font-size:0.68rem;color:var(--text-muted);margin-left:auto;white-space:nowrap;flex-shrink:0;">{{ activeAwayBanner.count }} 班</span>
              </div>
              <!-- 桌機：右側快速待辦；手機已置頂，此處隱藏避免重複 -->
              <div class="card desktop-quick-todo" v-if="hasQuickTodo && !isMobile">
                <div class="match-header side-panel-head">
                  快速待辦
                </div>
                <div class="quick-todo-list">
                  <div v-for="req in myPendingRequests.slice(0, 5)" :key="'qp-'+req.id" class="quick-todo-row">
                    <div class="quick-todo-main">
                      <div class="quick-todo-top">
                        <span class="status-badge tag-red badge-mini">待簽核</span>
                        <span class="status-badge badge-mini" :class="req.type === 'exchange' ? 'tag-blue' : 'tag-red'">{{ req.type === 'exchange' ? '調課' : '代課' }}</span>
                        <span v-for="tag in getRequestTypeTags(req)" :key="tag.key" class="risk-tag" :class="'risk-'+tag.key">{{ tag.label }}</span>
                      </div>
                      <div class="quick-todo-title">{{ formatQuickTodoTitle(req, 'incoming') }}</div>
                    </div>
                    <div class="quick-todo-actions">
                      <button v-if="req.batchId" class="btn btn-success btn-xs-batch" @click="respondToBatch(req.batchId, 'agree')" title="同批次全部同意">全同意</button>
                      <button class="btn btn-success btn-xs-tight-nowrap" @click="respondToRequest(req.id, 'agree')">同意</button>
                      <button class="btn btn-danger btn-xs-tight-nowrap" @click="respondToRequest(req.id, 'decline')">拒絕</button>
                    </div>
                  </div>
                  <div v-for="req in quickTodoSentOpen.slice(0, 3)" :key="'qs-'+req.id" class="quick-todo-row cursor-pointer" @click="detailRequest = req; detailSubRecord = null; showDetailModal = true">
                    <div class="quick-todo-main">
                      <div class="quick-todo-top">
                        <span class="status-badge tag-yellow badge-mini">{{ getStatusText(req.status) }}</span>
                        <span class="status-badge badge-mini" :class="req.type === 'exchange' ? 'tag-blue' : 'tag-red'">{{ req.type === 'exchange' ? '調課' : '代課' }}</span>
                        <span v-for="tag in getRequestTypeTags(req)" :key="tag.key" class="risk-tag" :class="'risk-'+tag.key">{{ tag.label }}</span>
                      </div>
                      <div class="quick-todo-title">{{ formatQuickTodoTitle(req, 'sent') }}</div>
                      <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">{{ getRequestProgressSteps(req).summary }}</div>
                    </div>
                    <div class="quick-todo-actions" @click.stop>
                      <button type="button" class="btn btn-secondary btn-xs-tight" @click.stop="openPaperPrintForRequest(req)">🖨️</button>
                      <button v-if="req.status === 'pending_teacher' || isPaperFlowRequest(req)" type="button" class="btn btn-success btn-xs-line" @click.stop="copyLineMessageForRequest(req)">LINE</button>
                      <button type="button" class="btn btn-secondary btn-xs-tight-danger" @click.stop="cancelRequest(req.id)">撤回</button>
                    </div>
                  </div>
                  <div class="text-right-mt-6">
                    <a href="#" class="link-view-all" @click.prevent="activeTab = 'pending'">查看全部 →</a>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="match-header side-panel-head">
                  個人異動摘要
                </div>
              <div class="summary-list-container">
                <table class="summary-table">
                  <thead>
                    <tr>
                      <th style="width: 70px;">狀態</th>
                      <th>日期/內容</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="rec in personalChanges" :key="rec.id" :class="{ 'opacity-50': rec.isPast, 'cursor-pointer': !!rec.requestId }" @click="rec.requestId && showDetailForRecord(rec.id, rec.requestId)">
                      <td>
                         <span class="status-badge badge-status-xs" :class="rec.statusClass">
                          {{ rec.statusText }}
                        </span>
                      </td>
                      <td>
                        <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-primary);">
                          {{ rec.classLine }}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">
                          {{ rec.desc }}
                        </div>
                      </td>
                    </tr>
                    <tr v-if="personalChanges.length === 0">
                      <td colspan="2" class="table-empty">
                        <span class="empty-state-title">目前沒有異動</span>
                        <span class="empty-state-hint">核准後的調代課會顯示在這裡</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          </div>
        </div>

        <!-- ════════════════════════════════════
             §UI-2.2 Tab：班級課表總覽
             ════════════════════════════════════ -->
    <!-- 班級課表面板 → components/ClassPanel.vue -->
    <ClassPanel
      v-if="activeTab === 'class'"
      :class-readonly-mode="classReadonlyMode"
      :class-viewer-readonly="classViewerReadonly"
      :is-admin="isAdmin"
      :class-list="classList"
      :selected-class-week-dates="selectedClassWeekDates"
      :class-week-number="classWeekNumber"
      :timetable-periods="timetablePeriods"
      :is-mobile="isMobile"
      :class-schedules="classSchedules"
      :class-substitution-map="classSubstitutionMap"
      :is-combined-class="isCombinedClass"
      :class-change-summary="classChangeSummary"
      :copy-class-readonly-link="copyClassReadonlyLink"
      :change-class-week="changeClassWeek"
      :format-date-m-m-d-d="formatDateMMDD"
      :select-class-for-view="selectClassForView"
      :get-period-class="getPeriodClass"
      :get-period-label="getPeriodLabel"
      :get-period-time-span="getPeriodTimeSpan"
      :get-class-cell-class-for-class="getClassCellClassForClass"
      :handle-class-cell-click="handleClassCellClick"
      :get-subject-style="getSubjectStyle"
      :is-match-source-entry="isMatchSourceEntry"
      :is-match-hover-entry="isMatchHoverEntry"
      :has-schedule-special-tag="hasScheduleSpecialTag"
      :is-class-away-on-date="isClassAwayOnDate"
      :get-class-away-event-name="getClassAwayEventName"
      :get-real-teacher-name="getRealTeacherName"
      :get-class-change-type-label="getClassChangeTypeLabel"
      :go-to-class-this-week="goToClassThisWeek"
      v-model:selected-class="selectedClass"
    />

        <!-- ════════════════════════════════════
             §UI-2.3 Tab：待辦與簽核
             ════════════════════════════════════ -->
        <div v-if="user && activeTab === 'pending'">
          
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
              <span v-if="pendingSearchQuery" class="text-xs-muted-78">已套用篩選</span>
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
                        <input type="checkbox" class="admin-select-all chk-sm" @change="toggleSelectAllAdminPending($event)">
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
                        <div class="batch-group-inline-meta">批次申請 · {{ row.items.length }} 筆</div>
                      </td>
                      <td>{{ formatRequestApplicationDate(row.items[0]) }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge tag-blue" v-if="row.items[0].type === 'triangle'">三角調</span>
                          <span class="status-badge tag-blue" v-else-if="row.items[0].type === 'exchange'">調課</span>
                          <span class="status-badge tag-red" v-else>代課</span>
                          <span class="status-badge tag-gray fs-65">批次 {{ row.items.length }} 筆</span>
                        </div>
                      </td>
                      <td>{{ row.items[0].requesterName }}</td>
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
                          <input type="checkbox" class="admin-select-cb chk-sm" :value="row.id" :data-req-id="row.id" :checked="isAdminPendingSelected(row.id)" :title="row.type === 'triangle' ? '選取整組三角調申請' : ''" @click.stop>
                          <strong>{{ row.serial || '---' }}</strong>
                        </div>
                        <div v-if="row.note" class="req-note-cell" :title="row.note">{{ row.note }}</div>
                      </td>
                      <td>{{ formatRequestApplicationDate(row) }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                            <span class="status-badge tag-blue" v-if="row.type === 'triangle'">三角調</span>
                            <span class="status-badge tag-blue" v-else-if="row.type === 'exchange'">調課</span>
                            <span class="status-badge tag-red" v-else>代課</span>
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
                         <span class="status-badge tag-blue" v-if="req.type === 'triangle'">三角調</span>
                         <span class="status-badge tag-blue" v-else-if="req.type === 'exchange'">調課</span>
                         <span class="status-badge tag-red" v-else>代課</span>
                         <span v-if="req.batchId && req.type !== 'triangle'" class="status-badge tag-gray fs-65" title="同批次可全部同意">批次</span>
                         <span v-if="req.type === 'triangle'" class="status-badge tag-gray fs-65" title="三位教師全部同意後才送行政">整組</span>
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
                            <strong>{{ row.items[0].serial || '批次申請' }}</strong>
                          </button>
                        </div>
                        <div class="batch-group-inline-meta">批次申請 · {{ row.items.length }} 筆</div>
                      </td>
                      <td>{{ formatRequestApplicationDate(row.items[0]) }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge tag-blue" v-if="row.items[0].type === 'triangle'">三角調</span>
                          <span class="status-badge tag-blue" v-else-if="row.items[0].type === 'exchange'">調課</span>
                          <span class="status-badge tag-red" v-else>代課</span>
                          <span class="status-badge tag-gray fs-65">批次 {{ row.items.length }} 筆</span>
                        </div>
                      </td>
                      <td>{{ row.items[0].requesterName }}</td>
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
                             <span class="status-badge tag-blue" v-if="row.type === 'triangle'">三角調</span>
                            <span class="status-badge tag-blue" v-else-if="row.type === 'exchange'">調課</span>
                            <span class="status-badge tag-red" v-else>代課</span>
                            <span v-if="row.batchId && row.type !== 'triangle'" class="status-badge tag-gray fs-65" title="同批次">批次</span>
                            <span v-if="row.type === 'triangle'" class="status-badge tag-gray fs-65" title="三位教師全部同意後才送行政">整組</span>
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

        <!-- ════════════════════════════════════
             §UI-2.4 Tab：歷史紀錄與列印
             ════════════════════════════════════ -->
        <div v-if="user && activeTab === 'records'" data-tour="history-panel">
          <div class="card">
            <div class="card-title">
              <span>📅 歷史紀錄與列印</span>
              <div class="action-buttons">
                <!-- 一鍵列印勾選的單據 -->
                <button
                  v-if="isAdmin && !notificationsSuppressed"
                  class="btn btn-success btn-md"
                  :disabled="!selectedRecordIds.length"
                  @click="sendSelectedBatchNotices"
                  title="依代課老師合併寄出（後發通知，適合活動互代先排後寄）"
                >📧 批次發通知信</button>
                <button class="btn btn-primary btn-md" @click="openHistoryPrintPreview" title="依待辦批核相同的分組規則預覽並列印">🖨️ 預覽／列印代（調、補）課單</button>
              </div>
            </div>

            <!-- 篩選工具列（手機不撐滿 100%） -->
            <div class="toolbar history-filter-bar" style="align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="history-filter-label">類型</span>
              <div class="filter-chip-group" aria-label="紀錄類型篩選">
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'all' }" @click="setHistoryTypeFilter('all')">全部</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'substitution' }" @click="setHistoryTypeFilter('substitution')">代課</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'exchange' }" @click="setHistoryTypeFilter('exchange')">調課</button>
                <button v-if="isAdmin" type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyTypeFilter === 'exception' }" @click="setHistoryTypeFilter('exception')">特例</button>
              </div>
              <span class="history-filter-label">日期</span>
              <div class="filter-chip-group">
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'all' }" @click="setHistoryFilterMode('all')">全部</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'day' }" @click="setHistoryFilterMode('day')">本日</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'week' }" @click="setHistoryFilterMode('week')">本週</button>
                <button type="button" class="btn btn-secondary filter-chip" :class="{ 'btn-primary': historyFilterMode === 'month' }" @click="setHistoryFilterMode('month')">本月</button>
              </div>
              <input type="date" class="form-control filter-date" style="padding: 4px 8px; font-size: 0.75rem; max-width: 140px;" v-model="historyFilterDate">
              <input type="search" class="form-control filter-search" style="padding: 4px 8px; font-size: 0.75rem; max-width: 220px;" v-model="historySearchQuery" placeholder="單號／教師／班級／科目／日期" @input="historyPage=1">
              <button
                type="button"
                class="btn btn-secondary btn-sm-tight"
                :disabled="historyMonthLoading"
                @click="loadHistoryMonth()"
                title="依左側日期所在月份，從伺服器合併該月全部申請（較完整學期輕）"
              >{{ historyMonthLoading ? '載入中…' : '載入此月' }}</button>
              <button
                v-if="!historyFullLoaded"
                type="button"
                class="btn btn-secondary btn-sm-tight"
                :disabled="historyLoadingFull"
                @click="loadFullSemesterHistory"
                title="一次載入整學期（較慢，必要時再用）"
              >{{ historyLoadingFull ? '載入中…' : '完整學期' }}</button>
              <button
                v-if="historyFullLoaded || historyLoadedMonths.length"
                type="button"
                class="btn btn-secondary btn-sm-tight"
                @click="reloadWindowedHistory"
                title="恢復近兩週視窗以加速"
              >恢復近兩週</button>
              <span class="filter-count" style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">
                共 {{ dateFilteredHistoryRecords.length }} 筆
                <span v-if="historyFullLoaded" class="opacity-85">（完整學期）</span>
                <span v-else-if="historyLoadedMonths.length" class="opacity-85">（已併 {{ historyLoadedMonths.join('、') }}）</span>
                <span v-else-if="requestWindowInfo && requestWindowInfo.cutoffDate" class="opacity-85">（近{{ requestWindowInfo.windowDays || 14 }}天＋未結案）</span>
              </span>
            </div>

            <div class="table-responsive">
              <table class="custom-table history-table">
                <colgroup>
                  <col class="hist-col-serial">
                  <col class="hist-col-date">
                  <col class="hist-col-type">
                  <col class="hist-col-teacher">
                  <col class="hist-col-teacher">
                  <col class="hist-col-slot">
                  <col class="hist-col-slot">
                  <col class="hist-col-status">
                  <col v-if="isAdmin || isStaff" class="hist-col-actions">
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <div class="flex-row-gap-6">
                        <input type="checkbox" class="hist-select-all chk-14-shrink" @change="toggleSelectAllRecords($event)">
                        <span>單號</span>
                      </div>
                    </th>
                    <th>申請日期</th>
                    <th>類型</th>
                    <th>請假教師</th>
                    <th>代課/對調教師</th>
                    <th>請假課堂</th>
                    <th>對調課堂</th>
                    <th>狀態</th>
                    <th v-if="isAdmin || isStaff">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in paginatedHistoryRecords" :key="row.displayKey">
                    <tr v-if="row.displayKind === 'batch'" class="batch-group-row batch-group-data-row" @click="toggleBatchGroup('history', row.batchId)">
                      <td>
                        <div class="batch-group-first-cell">
                          <input
                            type="checkbox"
                            class="batch-group-checkbox chk-14-shrink"
                            :checked="isHistoryBatchGroupSelected(row)"
                            :aria-label="'選取批次 ' + row.batchId + ' 的全部紀錄'"
                            title="選取此批次全部紀錄"
                            @click.stop
                            @change.stop="toggleHistoryBatchGroupSelection(row, $event)"
                          >
                          <button type="button" class="batch-group-expand" :aria-expanded="isBatchGroupExpanded('history', row.batchId)" @click.stop="toggleBatchGroup('history', row.batchId)">
                            <span class="batch-group-chevron" :class="{ 'is-open': isBatchGroupExpanded('history', row.batchId) }" aria-hidden="true">›</span>
                            <strong>{{ row.items[0].serial || '批次申請' }}</strong>
                          </button>
                        </div>
                        <div class="batch-group-inline-meta">批次申請 · {{ row.items.length }} 筆</div>
                      </td>
                      <td>{{ row.items[0].createdDate }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge tag-blue" v-if="isHistoryExchangeType(row.items[0])">調課</span>
                          <span class="status-badge tag-red" v-else>代課</span>
                          <span class="status-badge tag-gray fs-65">批次 {{ row.items.length }} 筆</span>
                        </div>
                      </td>
                      <td>{{ row.items[0].requesterName }}</td>
                       <td>{{ getBatchGroupTeacherSummary(row) }}</td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatHistoryLeaveSlot) }}</span></td>
                      <td><span class="hist-slot-inline">{{ getBatchGroupSlotSummary(row, formatHistoryExchangeSlot) }}</span></td>
                      <td>
                        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                          <span class="status-badge" :class="getBatchGroupStatusClass(row)">{{ getBatchGroupStatusText(row) }}</span>
                          <span class="badge-print badge-unprinted">批次</span>
                        </div>
                      </td>
                      <td v-if="isAdmin || isStaff">
                        <button type="button" class="btn btn-secondary btn-md-nowrap batch-group-action-button" @click.stop="toggleBatchGroup('history', row.batchId)">{{ isBatchGroupExpanded('history', row.batchId) ? '收合' : '展開' }}</button>
                      </td>
                    </tr>
                    <tr v-else :class="['cursor-pointer', { 'batch-child-row': row.batchGroupKey }]" @click="showDetailForRecord(row.id, row.requestId)">
                      <td class="hist-td-serial">
                        <div class="hist-serial-row">
                          <input type="checkbox" class="hist-select-cb chk-14-shrink" :value="row.id" :data-rec-id="row.id" :checked="isHistoryRecordSelected(row.id)" @click.stop>
                          <strong class="hist-serial-text" :title="row.serial">{{ row.serial }}</strong>
                        </div>
                        <div v-if="row.note" class="req-note-cell" :title="row.note">{{ row.note }}</div>
                      </td>
                      <td>{{ row.createdDate }}</td>
                      <td>
                        <div class="flex-wrap-gap">
                          <span class="status-badge tag-blue" v-if="isHistoryExchangeType(row)">調課</span>
                          <span class="status-badge tag-red" v-else>代課</span>
                           <span v-for="tag in getRequestTypeTags(row)" :key="tag.key" class="risk-tag risk-tag-xs" :class="'risk-'+tag.key">{{ tag.label }}</span>
                        </div>
                      </td>
                      <td>{{ row.requesterName }}</td>
                      <td>{{ row.targetTeacherName }}</td>
                      <td>
                        <span class="hist-slot-inline">
                          {{ formatHistoryLeaveSlot(row) }}
                          <span v-if="isHistoryLeaveRestricted(row)" class="status-badge tag-restricted">綁課</span>
                            <span v-if="isHistoryLeaveRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <span class="hist-slot-inline">
                           {{ formatHistoryExchangeSlot(row) }}
                           <span v-if="isHistoryExchangeRestricted(row)" class="status-badge tag-restricted">綁課</span>
                           <span v-if="isHistoryExchangeRechanged(row)" class="risk-tag risk-chain">再異動</span>
                        </span>
                      </td>
                      <td>
                        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                          <span class="status-badge" :class="'status-' + (row.status ? row.status.toLowerCase() : 'approved')">
                            {{ getStatusText(row.status || 'approved') }}
                          </span>
                          <span class="badge-print" :class="row.printed ? 'badge-printed' : 'badge-unprinted'">
                            {{ row.printed ? '已列印' : '未列印' }}
                          </span>
                        </div>
                      </td>
                        <td v-if="isAdmin || isStaff" @click.stop>
                          <div class="hist-actions">
                            <button type="button" class="btn btn-secondary" title="列印此筆通知單" aria-label="列印此筆通知單" @click="printSingleRequest({ recordId: row.id }, 'Notice')">🖨️</button>
                            <template v-if="isAdmin">
                              <button type="button" class="btn btn-secondary" @click="openHistoryEditModal(row)">編輯</button>
                              <button type="button" class="btn btn-secondary" style="color: var(--color-danger); border-color: rgba(220, 38, 38, 0.18);" @click="deleteSubstitutionRecord(row.id, row.requestId)">撤銷</button>
                            </template>
                          </div>
                        </td>
                    </tr>
                  </template>
                  <tr v-if="dateFilteredHistoryRecords.length === 0">
                    <td :colspan="isAdmin || isStaff ? 9 : 8" class="table-empty">
                      <span class="empty-state-title">沒有符合條件的紀錄</span>
                      <span class="empty-state-hint">可調整日期範圍或搜尋條件</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 分頁控制 -->
             <div v-if="historyTotalPages > 1" class="flex-center-pad" style="margin-top:16px;">
              <button class="btn btn-secondary" :disabled="historyPage<=1" @click="changeHistoryPage(historyPage-1)">‹ 上一頁</button>
              <span class="text-xs-muted">第 {{ historyPage }} / {{ historyTotalPages }} 頁</span>
              <button class="btn btn-secondary btn-sm-75" :disabled="historyPage >= historyTotalPages" @click="changeHistoryPage(historyPage + 1)">下一頁 ›</button>
            </div>
          </div>
        </div>

        <!-- ════════════════════════════════════
             §UI-2.5 Tab：後台管理與月底結算
             ════════════════════════════════════ -->
        <div v-if="activeTab === 'admin' && isAdmin">
          
          <!-- 後台管理子頁籤 -->
          <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px; flex-wrap: wrap;">
            <button
              class="btn btn-pill"
              :class="adminSubTab === 'billing' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'billing'"
            >
              💰 鐘點結算
            </button>
            <button
              class="btn btn-pill"
              :class="adminSubTab === 'period8' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'period8'"
            >
              🕗 第八節
            </button>
             <button
              class="btn btn-pill" 
              :class="adminSubTab === 'teachers' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'teachers'"
            >
              👤 教師管理
            </button>
             <button
               class="btn btn-pill"
               :class="adminSubTab === 'classAway' ? 'btn-primary' : 'btn-secondary'"
               @click="adminSubTab = 'classAway'"
            >
               📭 空堂事件
             </button>
             <button
               class="btn btn-pill"
               :class="adminSubTab === 'schoolSwap' ? 'btn-primary' : 'btn-secondary'"
               @click="adminSubTab = 'schoolSwap'"
             >
               🔁 全校對調
             </button>
              <button
               class="btn btn-pill"
               :class="adminSubTab === 'settings' ? 'btn-primary' : 'btn-secondary'"
              @click="adminSubTab = 'settings'"
            >
              ⚙️ 系統設定
            </button>
             <button
               class="btn btn-pill"
               :class="adminSubTab === 'schoolExport' ? 'btn-primary' : 'btn-secondary'"
               @click="adminSubTab = 'schoolExport'"
             >
               📄 課表匯出
             </button>
            </div>

           <!-- 子分頁：第八節班級週表與核銷匯出 -->
           <div v-if="adminSubTab === 'period8'" class="period8-admin-page">
             <div class="card">
               <div class="card-title card-title-between">
                 <span>🕗 第八節班級課表</span>
                 <button
                   type="button"
                   class="btn btn-primary btn-sm-pad"
                   :disabled="period8Loading || period8ExportLoading"
                   @click="exportPeriod8Accounting"
                 >
                   {{ period8ExportLoading ? '正在整理清冊…' : '匯出第八節核銷清冊' }}
                 </button>
               </div>
               <div class="period8-toolbar">
                 <button type="button" class="btn btn-secondary btn-week-round" @click="changePeriod8Week(-1)" title="上一週">◀</button>
                 <div class="week-label">
                   🗓️ {{ formatDateMMDD(period8WeekDates[0]) }} ~ {{ formatDateMMDD(period8WeekDates[4]) }}
                   <span v-if="period8WeekNumber" class="text-primary-bold">（{{ period8WeekNumber }}）</span>
                 </div>
                 <button type="button" class="btn btn-secondary btn-week-round" @click="changePeriod8Week(1)" title="下一週">▶</button>
                 <button type="button" class="btn btn-secondary btn-sm-78" @click="goToPeriod8ThisWeek">本週</button>
                 <span class="period8-range-note">核銷區間：{{ reportStartDate }} ～ {{ reportEndDate }}，單價 NT$ 600／節</span>
               </div>
               <div v-if="period8Loading" class="billing-empty">正在載入第八節資料，請稍候…</div>
               <div v-else-if="period8RosterRows.length === 0" class="billing-empty">目前沒有可顯示的班級第八節資料。</div>
               <div v-else class="period8-table-wrap">
                 <div class="period8-grid">
                   <div class="period8-grid-header period8-class-header">班級</div>
                    <div v-for="(dateStr, dateIndex) in period8WeekDates" :key="'p8-head-' + dateStr" class="period8-grid-header">
                     {{ formatDateMMDD(dateStr) }}<br><span>{{ ['一','二','三','四','五'][dateIndex] }}</span>
                   </div>
                   <template v-for="row in period8RosterRows" :key="'p8-row-' + row.className">
                     <div class="period8-class-label">{{ row.className }}</div>
                      <div v-for="(dateStr, dateIndex) in period8WeekDates" :key="row.className + '-' + dateStr" class="period8-grid-cell">
                       <template v-if="period8CellsFor(row, dateStr).length">
                         <button
                           v-for="cell in period8CellsFor(row, dateStr)"
                           :key="row.className + '-' + dateStr + '-' + cell.teacherEmail + '-' + cell.status"
                            type="button"
                            class="period8-cell-button"
                            :class="['period8-status-' + cell.status, { 'period8-cell-disabled': cell.status === 'away' }]"
                            :disabled="cell.status === 'away'"
                            :title="cell.status === 'away' ? (cell.awayName || '空堂事件') : (cell.subject ? (cell.teacherName + '／' + cell.subject) : cell.teacherName)"
                            @click="handlePeriod8CellClick(cell)"
                         >
                            <strong>{{ cell.teacherName }}</strong>
                            <span v-if="cell.subject" class="subject-color-tag period8-subject" :style="getSubjectStyle(cell.subject)">{{ cell.subject }}</span>
                            <span v-if="cell.status === 'away'" class="away-class-badge">{{ period8StatusLabel(cell) }}</span>
                            <span v-else-if="period8StatusLabel(cell)" class="period8-status-badge">{{ period8StatusLabel(cell) }}</span>
                         </button>
                       </template>
                        <span v-else class="period8-empty-cell"></span>
                     </div>
                   </template>
                 </div>
               </div>
               <div class="period8-help-text">點擊有教師的格子即可進入既有調代課媒合；已有異動的格子會開啟異動詳情。</div>
             </div>
           </div>

           <!-- 子分頁：課表匯出（共用日期） -->
          <div v-if="adminSubTab === 'schoolExport'">
            <div class="card">
              <div class="card-title">
                <span>📄 課表匯出</span>
              </div>
              <div class="report-toolbar" style="flex-wrap:wrap;gap:12px;align-items:flex-end;">
                <div class="form-group m-0-min-140">
                  <label class="form-label">起日</label>
                  <input type="date" class="form-input" v-model="schoolExportStart">
                </div>
                <div class="form-group m-0-min-140">
                  <label class="form-label">迄日</label>
                  <input type="date" class="form-input" v-model="schoolExportEnd">
                </div>
                <button type="button" class="btn btn-secondary p-9-12" @click="setSchoolExportThisWeek">本週一～五</button>
                <label class="label-check-82">
                  <input type="checkbox" v-model="schoolExportIncludeWeekend" class="chk-md">
                  <span>含週末</span>
                </label>
                <label class="label-check-82">
                  <input type="checkbox" v-model="schoolExportOnlyChanged" class="chk-md">
                  <span>只匯出有異動教師</span>
                </label>
                <button type="button" class="btn btn-success" style="padding:10px 16px;" @click="exportSchoolTimetableWord">
                  匯出全校課表（.docx）
                </button>
                <button type="button" class="btn btn-primary" style="padding:10px 16px;" @click="exportInvigilationWorkbook">
                  匯出監考表（.xlsx）
                </button>
              </div>

              <div style="margin-top:16px;border-top:1px solid var(--border-color);padding-top:12px;">
                <div class="flex-wrap-gap-8-mb">
                  <strong style="font-size:0.88rem;">選擇教師</strong>
                  <span class="text-xs-muted-78">已選 {{ schoolExportSelectedEmails.length }}／{{ teachersList.length }}（課表、監考表皆只匯出勾選列）</span>
                  <button type="button" class="btn btn-secondary p-3-10-75" @click="selectAllSchoolExportTeachers">全選</button>
                  <button type="button" class="btn btn-secondary p-3-10-75" @click="clearSchoolExportTeachers">全不選</button>
                  <input
                    type="text"
                    class="form-input"
                    style="padding:4px 10px;font-size:0.8rem;max-width:180px;margin-left:auto;"
                    placeholder="篩選姓名／科目"
                    v-model="schoolExportTeacherFilter"
                  >
                </div>
                <div style="max-height:280px;overflow:auto;border:1px solid var(--border-color);border-radius:10px;padding:8px 10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 10px;">
                  <label
                    v-for="t in filteredSchoolExportTeachers"
                    :key="t.email"
                    style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;user-select:none;padding:3px 2px;"
                  >
                    <input
                      type="checkbox"
                      style="width:15px;height:15px;margin:0;flex-shrink:0;"
                      :checked="isSchoolExportTeacherSelected(t.email)"
                      @change="toggleSchoolExportTeacher(t.email)"
                    >
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" :title="t.subject || ''">{{ t.name }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- 子分頁 1：月底大鐘點與代課費統計中心 -->
          <div v-if="adminSubTab === 'billing'" class="billing-report">
            <div class="card">
              <div class="card-title billing-report-title">
                <div class="billing-report-title-main">
                  <span>💰 大鐘點與代課費結算</span>
                  <div class="billing-month-control">
                    <button type="button" class="btn btn-secondary billing-period-arrow" title="上一個結算月份" aria-label="上一個結算月份" @click="shiftReportPeriod(-1)">‹</button>
                    <label class="form-label" for="billing-report-start">結算起日</label>
                    <input id="billing-report-start" type="date" class="form-input" v-model="reportStartDate" @change="calculateMonthlyReport">
                    <span class="billing-range-separator">至</span>
                    <label class="form-label" for="billing-report-end">結算迄日</label>
                    <input id="billing-report-end" type="date" class="form-input" v-model="reportEndDate" @change="calculateMonthlyReport">
                    <button type="button" class="btn btn-secondary billing-period-arrow" title="下一個結算月份" aria-label="下一個結算月份" @click="shiftReportPeriod(1)">›</button>
                  </div>
                  <div class="billing-weeks-control" aria-live="polite">
                    <span class="form-label">自動週數</span>
                    <strong class="billing-weeks-value">{{ reportWeeksCount }}</strong>
                    <span class="billing-weeks-suffix">週</span>
                  </div>
                </div>
                <div class="billing-report-actions">
                  <button type="button" class="btn btn-primary" style="padding:8px 14px;font-size:0.85rem;" :disabled="accountingExportLoading" @click="exportSubFeeToExcel">
                    {{ accountingExportLoading ? '⏳ 準備會計檔…' : '📊 下載會計版 Excel' }}
                  </button>
                </div>
              </div>

              <div class="report-toolbar billing-toolbar billing-toolbar-note">
                <p class="billing-toolbar-hint">請設定結算起日與迄日（建議週一至週五）；同一週只計 1 週，週數會自動計算。月報與下載會計版 Excel 會沿用同一日期區間，不需重複設定。</p>
              </div>

              <div v-if="isAdmin" class="card" style="margin:14px 0;padding:16px;background:#fffdf6;border:1px solid #ebd9a2;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #f2e4bd;">
                  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;">
                    <strong style="font-size:1.02rem;color:#5a4310;">👩‍🏫 本期代導紀錄與費用管理（{{ reportStartDate || '起日' }}～{{ reportEndDate || '迄日' }}）</strong>
                    <span class="status-badge" style="background:#e8f4ff;color:#1864ab;font-size:0.78rem;">共 {{ currentMonthHomeroomRecords.length }} 筆</span>
                    <span class="status-badge" style="background:#e6fcf5;color:#0ca678;font-size:0.78rem;">已指定 {{ currentMonthHomeroomAssignedCount }} 筆</span>
                    <span v-if="currentMonthHomeroomPendingCount > 0" class="status-badge status-pending-admin" style="font-size:0.78rem;">待指定 {{ currentMonthHomeroomPendingCount }} 筆</span>
                     <span style="font-size:0.9rem;font-weight:bold;color:#c92a2a;margin-left:4px;">小計 NT$ {{ formatMoney(currentMonthHomeroomFeeTotal) }} 元</span>
                  </div>
                  <button type="button" class="btn btn-secondary" style="padding:6px 12px;font-size:0.82rem;background:#fff;border:1px solid #d9b86c;color:#6b4e0a;" @click="openManualHomeroomModal">
                    ➕ 手動新增代導費
                  </button>
                </div>

                <div v-if="homeroomRecordsLoading" style="font-size:0.84rem;color:var(--text-secondary);padding:8px 0;">正在同步最新代導清冊…</div>
                <div v-else-if="currentMonthHomeroomRecords.length === 0" style="font-size:0.84rem;color:var(--text-secondary);padding:10px 0;">
                   目前本期尚無代導紀錄。若有導師無課或已調課請假，可點選上方「➕ 手動新增代導費」補建。
                </div>
                <div v-else style="display:flex;flex-direction:column;gap:10px;">
                  <div v-for="r in currentMonthHomeroomRecords" :key="r.id" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;background:#fff;border:1px solid #f0e2b8;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                    <div style="flex:1;min-width:260px;font-size:0.85rem;">
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                        <span style="font-weight:bold;color:#2b2b2b;">{{ r.date }}</span>
                        <span style="background:#f1f3f5;padding:2px 6px;border-radius:4px;font-weight:600;color:#495057;">{{ r.className || '導師班' }}</span>
                        <strong>{{ r.originalTeacherName || '未指定' }}</strong>
                        <span v-if="r.sourceRequestId === 'manual'" class="status-badge" style="background:#fff3bf;color:#f59f00;font-size:0.72rem;padding:1px 5px;">手動建立</span>
                      </div>
                      <div class="text-xs-sec-78" >
                          請假時間：{{ r.leaveTimeType || '' }} {{ r.leaveTime || '未填' }}｜鐘點費：1節（NT$ {{ formatMoney(r.feeAmount || 455) }}）
                        <span v-if="r.note" style="margin-left:6px;color:#868e96;">({{ r.note }})</span>
                      </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;">
                      <div v-if="!r.actualTeacherName" style="display:flex;align-items:center;gap:6px;">
                        <input 
                          type="text" 
                          class="form-input" 
                          style="width:180px;padding:6px 10px;font-size:0.82rem;" 
                           placeholder="搜尋或選擇代導教師"
                          :list="'dl-hr-cand-'+r.id"
                          :value="getTeacherNameByEmail(homeroomAssignSelections[r.id])"
                          @input="onHomeroomInputSelect(r, $event.target.value)"
                        >
                        <datalist :id="'dl-hr-cand-'+r.id">
                          <option v-for="t in getHomeroomCoverCandidates(r)" :key="'hr-cand-opt-'+r.id+'-'+t.email" :value="t.name + '（' + (t.subject || '教師') + '）'"></option>
                        </datalist>
                        <button type="button" class="btn btn-primary" style="padding:6px 12px;font-size:0.8rem;" :disabled="homeroomRecordsLoading || loading || !homeroomAssignSelections[r.id]" @click="assignHomeroomTeacher(r)">{{ homeroomRecordsLoading || loading ? '⏳ 存檔中...' : '指定存檔' }}</button>
                      </div>
                      <div v-else style="font-size:0.83rem;color:#0ca678;font-weight:600;display:flex;align-items:center;gap:8px;">
                        <span>✅ 代導：{{ r.actualTeacherName || '未指定' }}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary" style="padding:2px 6px;font-size:0.75rem;" title="重新指定代導教師" @click="r.actualTeacherName = ''; homeroomAssignSelections[r.id] = '';">修改</button>
                      </div>
                      <button type="button" class="btn btn-sm btn-outline-danger" style="padding:4px 8px;font-size:0.78rem;margin-left:4px;" title="撤銷這筆代導紀錄" @click="deleteHomeroomRecord(r)">撤銷</button>
                    </div>
                  </div>
                </div>
              </div>
               <div class="report-table-container billing-table-wrap">
                 <table class="custom-table billing-table">
                  <thead>
                    <tr class="billing-th-group">
                       <th colspan="3" class="billing-th-id">教師</th>
                       <th colspan="9" class="billing-th-17">1～7＋早自習／午休 鐘點</th>
                       <th colspan="6" class="billing-th-sub">早自習／1～7／午休 我去代課</th>
                      <th colspan="2" class="billing-th-p8">第 8 節</th>
                    </tr>
                    <tr class="billing-th-cols">
                       <th class="billing-sticky-name">姓名</th>
                       <th class="billing-th-job">職務</th>
                       <th class="billing-th-subject">科目</th>
                        <th title="每週早自習＋1～7＋午休；基本／一般／抽離（超鐘點另以標記判定；不含巡堂／第8）">排課</th>
                      <th title="教師基本授課鐘點">基鐘</th>
                       <th title="已設定固定超鐘點時採學期設定；未設定才使用排課 − 基鐘">超鐘點/週</th>
                      <th title="超鐘點固定為每週超鐘點 × 結算週數；放假／空堂不扣">空堂扣減</th>
                          <th title="超鐘點表的扣節合計（自費超鐘點＋公費超鐘點）">超鐘扣</th>
                         <th title="自付表中的自費代課節數（原課非超鐘點）">自費扣</th>
                       <th title="小鐘點課程請假或放假未授課的另扣">代課另扣</th>
                      <th title="本月實得超時節數" class="billing-th-result">實得超時</th>
                      <th title="實得超時 × 455" class="billing-th-result">超鐘點費</th>
                       <th title="代他人且經費為公費／活動公費的實際授課節次；不含課表代課">公代節</th>
                       <th title="公代節 × 455">公代費</th>
                       <th title="代他人且經費為自費">自代節</th>
                        <th title="自代節 × 455；懸停可看明細">自代費</th>
                       <th title="課表屬性為代課的小鐘點實際授課節數，與超鐘點分開計算">課代節</th>
                       <th title="課代節 × 455">課代費</th>
                       <th title="實際上課節數（誰上誰拿）">節數</th>
                      <th title="600 元／節" class="billing-th-result">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in monthlyReportData" :key="row.email">
                       <td class="billing-sticky-name"><strong>{{ row.name }}</strong></td>
                       <td class="billing-job" :title="row.jobTitle || '教師'">{{ row.jobTitle || '教師' }}</td>
                       <td class="billing-subj" :title="row.subject || ''">{{ row.subject }}</td>
                      <td class="num">{{ row.weeklyPeriods }}</td>
                      <td class="num">{{ row.baseHours }}</td>
                      <td class="num">{{ row.weeklyOvertime }}</td>
                       <td class="num muted">{{ row.reduceDeduction ? ('−' + row.reduceDeduction) : '無' }}</td>
                        <td class="num warn">{{ ((row.selfPaidDeduction || 0) + (row.publicOvertimeUsed || 0)) ? ('−' + ((row.selfPaidDeduction || 0) + (row.publicOvertimeUsed || 0))) : '無' }}</td>
                         <td class="num danger">{{ row.selfSubDeduction ? ('−' + row.selfSubDeduction) : '無' }}</td>
                       <td class="num warn">{{ row.substituteAdditionalDeduction ? ('−' + row.substituteAdditionalDeduction) : '無' }}</td>
                      <td class="num result" :class="{ danger: row.actualOvertime < 0 }" :title="row.actualOvertime < 0 ? '超鐘不足，自費請假請自行付代課費' : ''">{{ row.actualOvertime }}</td>
                        <td class="num result" :class="{ danger: row.overtimeFee < 0 }" :title="row.overtimeFee < 0 ? '負數＝應自付代課費約此金額' : ''">{{ row.overtimeFee ? ('$' + formatMoney(row.overtimeFee)) : (row.overtimeFee === 0 ? '$0' : '無') }}</td>
                       <td class="num">{{ row.pubSubCount || '無' }}</td>
                        <td class="num ok">{{ row.pubSubFee ? ('$' + formatMoney(row.pubSubFee)) : '無' }}</td>
                        <td class="num">{{ row.selfSubCount || '無' }}</td>
                         <td class="num ok" :title="row.selfSubDetail && row.selfSubDetail !== '無' ? row.selfSubDetail : ''">{{ row.selfSubFee ? ('$' + formatMoney(row.selfSubFee)) : '無' }}</td>
                       <td class="num">{{ row.substitutePaidCount || '無' }}</td>
                       <td class="num ok">{{ row.substitutePaidFee ? ('$' + formatMoney(row.substitutePaidFee)) : '無' }}</td>
                        <td class="num">{{ row.period8SubCount || '無' }}</td>
                      <td class="num result-p8">{{ row.period8Fee ? ('$' + formatMoney(row.period8Fee)) : '無' }}</td>
                     </tr>
                     <tr v-if="monthlyReportData.length > 0" class="billing-total-row">
                       <td colspan="3" class="billing-sticky-name"><strong>合計</strong></td>
                       <td class="num">{{ monthlyReportTotals.weeklyPeriods }}</td>
                       <td class="num">{{ monthlyReportTotals.baseHours }}</td>
                       <td class="num">{{ monthlyReportTotals.weeklyOvertime }}</td>
                       <td class="num muted">{{ monthlyReportTotals.reduceDeduction }}</td>
                        <td class="num warn">{{ (monthlyReportTotals.selfPaidDeduction || 0) + (monthlyReportTotals.publicOvertimeUsed || 0) }}</td>
                         <td class="num danger">{{ monthlyReportTotals.selfSubDeduction }}</td>
                       <td class="num warn">{{ monthlyReportTotals.substituteAdditionalDeduction }}</td>
                       <td class="num result">{{ monthlyReportTotals.actualOvertime }}</td>
                        <td class="num result">${{ formatMoney(monthlyReportTotals.overtimeFee) }}</td>
                       <td class="num">{{ monthlyReportTotals.pubSubCount }}</td>
                        <td class="num ok">${{ formatMoney(monthlyReportTotals.pubSubFee) }}</td>
                        <td class="num">{{ monthlyReportTotals.selfSubCount }}</td>
                         <td class="num ok">${{ formatMoney(monthlyReportTotals.selfSubFee) }}</td>
                       <td class="num">{{ monthlyReportTotals.substitutePaidCount }}</td>
                       <td class="num ok">${{ formatMoney(monthlyReportTotals.substitutePaidFee) }}</td>
                        <td class="num">{{ monthlyReportTotals.period8SubCount }}</td>
                        <td class="num result-p8">${{ formatMoney(monthlyReportTotals.period8Fee) }}</td>
                     </tr>
                      <tr v-if="monthlyReportLoading && monthlyReportData.length === 0">
                          <td colspan="20" class="billing-empty">正在整理本期月報，請稍候…</td>
                      </tr>
                      <tr v-else-if="monthlyReportData.length === 0">
                          <td colspan="20" class="billing-empty">請先在「教師名單」設定基本授課鐘點，再設定有效的結算日期區間。</td>
                      </tr>
                  </tbody>
                 </table>
               </div>
               <div v-if="monthlyReportData.some(row => row.expensePlanConflicts && row.expensePlanConflicts.length)" style="margin-top:10px;padding:10px 12px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;color:#92400e;font-size:0.82rem;line-height:1.6;">
                 <strong>⚠ 經費來源待核對</strong>
                 <div v-for="row in monthlyReportData.filter(item => item.expensePlanConflicts && item.expensePlanConflicts.length)" :key="'expense-conflict-' + row.email">
                   {{ row.name }}：{{ row.expensePlanWarnings.join('；') }}
                 </div>
               </div>
            </div>
          </div>

          <!-- 子分頁 2：教師名單管理與基本授課鐘點設定 -->
          <div v-if="adminSubTab === 'teachers'">
            <!-- 2. 教師名單管理與基本授課鐘點設定 -->
            <div class="card">
            <div class="card-title">
              <span>👤 教師帳號與基本鐘點管理</span>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-success btn-md" @click="showImportTeachersModal = true">📥 批次匯入教師</button>
                <button class="btn btn-secondary btn-md" @click="fillFixedOvertimeForAllTeachers">⚡ 全部代入固定超鐘點</button>
                <button class="btn btn-secondary btn-md" @click="openTeacherExpenseAuditModal">🔎 檢查經費來源</button>
                <button class="btn btn-primary btn-md" @click="openAddTeacherModal">➕ 新增教師</button>
              </div>
            </div>
            
                        <TeachersTable
              :paged-teachers-list-details="pagedTeachersListDetails"
              :teachers-list-details="teachersListDetails"
              :teachers-need-pager="teachersNeedPager"
              :teachers-page="teachersPage"
              :teachers-total-pages="teachersTotalPages"
              :get-expense-plan-summary="getExpensePlanSummary"
              :get-teacher-timetable-hours="getTeacherTimetableHours"
              :update-teacher-base-hours="updateTeacherBaseHours"
              :open-quota-ledger="openQuotaLedger"
              :open-manual-quota-adjust="openManualQuotaAdjust"
              :open-overtime-plan-modal="openOvertimePlanModal"
              :open-edit-teacher-modal="openEditTeacherModal"
              :delete-teacher="deleteTeacher"
              :change-teachers-page="changeTeachersPage"
              v-model:teachersPageSize="teachersPageSize"
            />
          </div>
          </div>

                     <!-- 子分頁：空堂事件 -->
          <div v-if="adminSubTab === 'classAway'">
                        <div class="card">
              <div class="card-title">
                <span>📭 空堂事件</span>
                <button class="btn btn-primary btn-sm-pad" @click="openAddClassAwayModal">＋ 新增事件</button>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.5;margin:0 0 12px 0;">
                 期間內符合範圍與節次的班級：課表<strong>淡化顯示</strong>，媒合／衝堂視同空堂；小鐘點匯出依實際未授課扣減。
                 超鐘點以教師名單的學期固定每週節數 × 結算週數計算；尚未設定者暫以課表推算。放假／空堂<strong>不扣超鐘點</strong>，只有固定節次的代課才扣除。小鐘點依實際未授課日扣減。迄日空白＝學期結束。可進互代者可在活動互代面板選事件帶入。
                   節次可選<strong>每日指定</strong>或<strong>連續起迄</strong>：例如兩天每天只停第8節可用一筆事件；若要從第一天某節一路停到末日某節，選連續起迄。各事件可匯出<strong>活動輪值通知單</strong>（只匯已送出；第1～7節入表、第8節附註）。
              </p>
              <div class="table-responsive">
                <table class="custom-table fs-85" >
                  <thead>
                    <tr>
                      <th>名稱</th>
                       <th>起日</th>
                       <th>迄日</th>
                       <th>範圍</th>
                       <th>班級</th>
                       <th>停課節次（每天）</th>
                       <th>起始節次</th>
                       <th>結束節次</th>
                       <th>鐘點</th>
                      <th>互代</th>
                      <th>啟用</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="ev in classAwayEvents" :key="ev.id">
                      <td><strong>{{ ev.name }}</strong></td>
                       <td>{{ ev.startDate || '未設定' }}</td>
                       <td>{{ ev.endDate || '學期結束' }}</td>
                       <td>{{ ev.scope === 'all' ? '全校' : '指定班級' }}</td>
                        <td style="max-width:180px;font-size:0.78rem;">{{ (ev.classes || []).join('、') || '無' }}</td>
                         <td>{{ classAwayDailyPeriodLabel(ev) }}</td>
                         <td>{{ classAwayBoundaryPeriodLabel(ev, 'start') }}</td>
                         <td>{{ classAwayBoundaryPeriodLabel(ev, 'end') }}</td>
                       <td>{{ ev.billingRule === 'reduce' ? '扣超鐘點' : '不扣超鐘點' }}</td>
                      <td>{{ ev.forMutual ? '是' : '否' }}</td>
                      <td>{{ ev.enabled !== false ? '是' : '否' }}</td>
                      <td>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;">
                          <button class="btn btn-success btn-xs-tight" @click="exportActivityCoverWord(ev)" title="匯出教師代理遺留課務輪值通知單">匯出輪值單</button>
                          <button class="btn btn-secondary btn-xs-tight" @click="openEditClassAwayModal(ev)">編輯</button>
                          <button class="btn btn-secondary" style="padding:3px 8px;font-size:0.7rem;color:var(--color-danger);" @click="deleteClassAwayEvent(ev)">刪除</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!classAwayEvents.length">
                        <td colspan="12" style="text-align:center;padding:20px;color:var(--text-secondary);"><span class="empty-state-title">尚無空堂事件</span><span class="empty-state-hint">畢業／畢旅可新增事件並勾選班級；段考可設定每日指定節次或連續起迄</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 子分頁：全校日期節次對調 -->
          <div v-if="adminSubTab === 'schoolSwap'">
            <div class="card">
              <div class="card-title">
                <span>🔁 全校日期節次對調</span>
                <button type="button" class="btn btn-primary btn-sm-pad" @click="openAddSchoolSwapModal">＋ 新增對調</button>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin:0 0 12px;">
                只在指定日期交換兩個節次的固定週課表內容，不會改寫「教師課表」。啟用中的設定不可共用同一個實際日期／節次；停用後保留歷史紀錄。
              </p>
              <div class="table-responsive">
                <table class="custom-table fs-85">
                  <thead>
                    <tr>
                      <th>名稱</th>
                      <th>端點 A</th>
                      <th>端點 B</th>
                      <th>狀態</th>
                      <th>更新時間</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in schoolSwapRows" :key="row.id">
                      <td>
                        <strong>{{ row.name }}</strong>
                        <div v-if="row.note" class="req-note-cell">{{ row.note }}</div>
                      </td>
                      <td>{{ formatDateMMDD(row.dateA) }}({{ schoolSwapWeekdayText(row.dateA) }}) {{ formatPeriodText(row.periodA) }}</td>
                      <td>{{ formatDateMMDD(row.dateB) }}({{ schoolSwapWeekdayText(row.dateB) }}) {{ formatPeriodText(row.periodB) }}</td>
                      <td><span class="status-badge" :class="row.enabled ? 'status-approved' : 'status-pending-teacher'">{{ row.enabled ? '啟用' : '停用' }}</span></td>
                      <td>{{ row.updatedAt || row.createdAt || '尚無時間' }}</td>
                      <td>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;">
                          <button type="button" class="btn btn-secondary btn-xs-tight" @click="openEditSchoolSwapModal(row)">編輯</button>
                          <button type="button" class="btn btn-secondary btn-xs-tight" style="color:var(--color-danger);" @click="deleteSchoolSwap(row)">刪除</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!schoolSwapRows.length">
                      <td colspan="6" style="text-align:center;padding:20px;color:var(--text-secondary);">
                        <span class="empty-state-title">尚無全校對調設定</span>
                        <span class="empty-state-hint">新增後，指定日期的教師與班級課表會自動套用。</span>
                      </td>
                    </tr>
                  </tbody>
              </table>
            </div>
          </div>
          </div>

<!-- 子分頁 4：系統設定（空堂事件 → 學期 → 連線唯讀置底） -->
          <div v-if="adminSubTab === 'settings'">
            <div class="card mb-16" style="border-color:#f59e0b;background:#fffbeb;">
              <div class="card-title">
                <span>🖨️ 調代課作業模式</span>
                <span
                  class="status-badge"
                  :class="onlineSubstitutionEnabled ? 'status-approved' : 'status-pending-teacher'"
                  style="font-size:0.75rem;padding:2px 8px;"
                >{{ onlineSubstitutionEnabled ? '線上申請開放' : '紙本模式' }}</span>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin:0 0 10px;">
                關閉後，一般教師仍可查詢適合人選、模擬雙方課表；送出後會建立待教學組核准的申請並列印紙本通知。教學組仍可線上核准，但所有流程不寄通知信，既有歷史紀錄不受影響。
              </p>
              <label style="display:flex;align-items:center;gap:10px;font-size:0.9rem;font-weight:700;cursor:pointer;">
                <input
                  type="checkbox"
                  class="chk-md"
                  :checked="onlineSubstitutionEnabled"
                  @change="setOnlineSubstitutionEnabled($event.target.checked)"
                >
                <span>{{ onlineSubstitutionEnabled ? '目前允許線上調代課申請' : '一般教師送出紙本流程，教學組線上核准且不寄信' }}</span>
              </label>
            </div>

            <!-- 行政代申請：指定行政授權（非一鍵全開） -->
            <div class="card mb-16">
              <div class="card-title">
                <span>📋 行政代申請</span>
                <span
                  class="status-badge"
                  :class="proxySubmitEnabled ? 'status-approved' : 'status-pending-teacher'"
                  style="font-size:0.75rem;padding:2px 8px;"
                >{{ proxySubmitEnabled ? ('已授權 ' + (proxySubmitEmails || []).length + ' 位') : '未授權任何人' }}</span>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin:0 0 12px 0;">
                只開放給<strong>您勾選的行政</strong>（不是一次開全部行政）。
                被授權者可代全校教師送調代課，送出後<strong>跳過受邀確認、直接送教學組核准</strong>，行政<strong>不可</strong>直接出單。
                未勾選的行政仍可看全校課表，但只能申請自己的課。
              </p>
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;">
                <input
                  v-model="proxyGrantQuery"
                  type="search"
                  class="form-input"
                  placeholder="搜尋行政姓名…"
                  style="max-width:220px;padding:6px 10px;font-size:0.85rem;"
                >
                <button
                  v-if="(proxySubmitEmails || []).length"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="clearAllProxySubmitEmails"
                >清空全部授權</button>
                <span class="text-xs-muted-75" v-if="proxySubmitEnabledBy" >
                  最近由 {{ proxySubmitEnabledBy }} 更新
                  <template v-if="proxySubmitEnabledAt">（{{ String(proxySubmitEnabledAt).slice(0, 16).replace('T', ' ') }}）</template>
                </span>
              </div>
              <div v-if="!proxyGrantCandidateTeachers.length" style="font-size:0.85rem;color:var(--text-muted);padding:8px 0;">
                尚無「行政」角色同仁。請先到「教師管理」把人選角色改成<strong>行政</strong>，再回來勾選授權。
              </div>
              <ul v-else style="list-style:none;margin:0;padding:0;max-height:240px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;">
                <li
                  v-for="t in proxyGrantCandidateTeachers"
                    :key="'grant-' + t.loginEmail"
                  style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border-color);"
                >
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;margin:0;font-size:0.88rem;">
                    <input
                      type="checkbox"
                        :checked="isProxySubmitEmailGranted(t.loginEmail)"
                        @change="toggleProxySubmitEmail(t.loginEmail)"
                    >
                    <span class="fw-600" >{{ t.name }}</span>
                    <span class="text-xs-muted-78" >{{ t.loginEmail }}</span>
                    <span class="badge-staff" style="margin-left:auto;">行政</span>
                  </label>
                </li>
              </ul>
            </div>

            <!-- 學期管理 -->
            <div class="card mb-16">
              <div class="card-title">
                <span>📅 學期管理</span>
                <button class="btn btn-primary btn-sm-pad" @click="openAddSemesterModal">＋ 新增學期</button>
              </div>
              <div class="table-responsive">
                <table class="custom-table">
                  <thead>
                    <tr>
                      <th>學期代號</th>
                      <th>學期名稱</th>
                      <th>開始日期</th>
                      <th>結束日期</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="sem in semestersList" :key="sem.id" :style="sem.isDefault ? 'background: #dcfce7;' : ''">
                      <td><strong>{{ sem.id }}</strong></td>
                      <td>{{ sem.name }}</td>
                      <td>{{ sem.startDate || '---' }}</td>
                      <td>{{ sem.endDate || '---' }}</td>
                      <td>
                        <div style="display: flex; gap: 4px;">
                          <button class="btn btn-secondary btn-xs-tight" @click="openEditSemesterModal(sem)">編輯</button>
                          <button class="btn btn-success btn-xs-tight" :disabled="sem.isDefault" @click="setDefaultSemester(sem.id)">設為預設</button>
                          <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 0.7rem; color: var(--color-danger);" @click="deleteSemester(sem.id)">刪除</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="semestersList.length === 0">
                      <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);"><span class="empty-state-title">尚無學期資料</span><span class="empty-state-hint">請新增第一個學期後開始使用</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 連線設定：固定唯讀、置底、不寫 localStorage -->
            <div class="card">
              <div class="card-title"><span>🔗 連線設定</span></div>
              <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0 8px;">
                <div>
                  <label class="form-label fs-78">GAS Web App 網址</label>
                  <input type="text" class="form-input btn-ghost-muted" :value="gasApiUrl" readonly>
                </div>
                <div>
                  <label class="form-label fs-78">Google OAuth Client ID</label>
                  <input type="text" class="form-input btn-ghost-muted" :value="googleClientId" readonly>
                </div>
                <p style="font-size:0.72rem;color:var(--text-muted);margin:0;">固定內建連線，不可於介面修改，亦不寫入本機。</p>
              </div>
            </div>
          </div>
        </div>

      </main>

      <!-- ════════════════════════════════════
           §UI-3 Modal：智慧媒合 / 對比 / 成功 / 後台表單
           ════════════════════════════════════ -->
      <!-- 3.1 智慧媒合建議：右側抽屜（不遮主課表） -->
    <!-- 媒合抽屜（代／調課候選） → components/MatchDrawerModal.vue -->
    <MatchDrawerModal
      v-if="showMatchModal"
      :is-batch-match-flow="isBatchMatchFlow"
      :match-mode="matchMode"
      :active-cell="activeCell"
      :is-admin="isAdmin"
      :is-batch-exchange-flow="isBatchExchangeFlow"
      :batch-slots="batchSlots"
      :batch-active-slot-key="batchActiveSlotKey"
      :exchange-weekday-options="exchangeWeekdayOptions"
      :exchange-weekday-filter="exchangeWeekdayFilter"
      :batch-all-slots-assigned="batchAllSlotsAssigned"
      :loading="loading"
      :is-submitting="isSubmitting"
      :batch-assigned-count="batchAssignedCount"
      :batch-assign-mode="batchAssignMode"
      :is-batch-per-slot-mode="isBatchPerSlotMode"
      :input-request-date="inputRequestDate"
      :recommendation-loading="recommendationLoading"
      :match-show-no-teacher-warning="matchShowNoTeacherWarning"
      :recommended-teachers="recommendedTeachers"
      :teachers-list="teachersList"
      :match-empty-reasons="matchEmptyReasons"
      :displayed-recommended-teachers="displayedRecommendedTeachers"
      :is-mutual-cover="isMutualCover"
      :filtered-recommended-teachers="filteredRecommendedTeachers"
      :triangle-candidate-b="triangleCandidateB"
      :triangle-candidate-c-ready-count="triangleCandidateCReadyCount"
      :triangle-candidate-c-options="triangleCandidateCOptions"
      :triangle-candidate-b-ready-count="triangleCandidateBReadyCount"
      :triangle-candidate-b-options="triangleCandidateBOptions"
      :displayed-triangle-b-options="displayedTriangleBOptions"
      :triangle-pick-b="trianglePickB"
      :displayed-triangle-c-options="displayedTriangleCOptions"
      :triangle-pick-c="trianglePickC"
      :triangle-candidate-display-count="triangleCandidateDisplayCount"
      :triangle-preview-rows="trianglePreviewRows"
      :triangle-validation="triangleValidation"
      :triangle-ready="triangleReady"
      :leave-reason-options="leaveReasonOptions"
      :triangle-submitting="triangleSubmitting"
      :displayed-exchange-list="displayedExchangeList"
      :has-sub-teacher-conflict="hasSubTeacherConflict"
      :filtered-exchange-list="filteredExchangeList"
      :recommended-exchange-list="recommendedExchangeList"
      :change-match-mode="changeMatchMode"
      :is-combined-class="isCombinedClass"
      :has-schedule-special-tag="hasScheduleSpecialTag"
      :select-batch-slot-for-match="selectBatchSlotForMatch"
      :format-date-m-m-d-d="formatDateMMDD"
      :get-week-day-text="getWeekDayText"
      :format-period-text="formatPeriodText"
      :clear-batch-slot-sub="clearBatchSlotSub"
      :set-exchange-weekday-filter="setExchangeWeekdayFilter"
      :set-batch-assign-mode="setBatchAssignMode"
      :get-teacher-identity-tooltip="getTeacherIdentityTooltip"
      :is-homeroom-teacher="isHomeroomTeacher"
      :prep-compare="prepCompare"
      :assign-mutual-draft-from-match="assignMutualDraftFromMatch"
      :preview-batch-candidate="previewBatchCandidate"
      :assign-batch-slot-sub="assignBatchSlotSub"
      :prep-batch-compare="prepBatchCompare"
      :format-triangle-slot="formatTriangleSlot"
      :select-triangle-candidate-b="selectTriangleCandidateB"
      :triangle-candidate-is-restricted="triangleCandidateIsRestricted"
      :select-triangle-candidate-c="selectTriangleCandidateC"
      :get-real-teacher-name="getRealTeacherName"
      :get-match-slot-date-m-m-d-d="getMatchSlotDateMMDD"
      :close-match-modal="closeMatchModal"
      :start-combined-return="startCombinedReturn"
      :prep-batch-exchange-compare="prepBatchExchangeCompare"
      :prep-batch-per-slot-compare="prepBatchPerSlotCompare"
      :load-more-matches="loadMoreMatches"
      :load-more-triangle-candidates="loadMoreTriangleCandidates"
      :open-triangle-timetable-preview="openTriangleTimetablePreview"
      :open-triangle-paper-preview="openTrianglePaperPreview"
      :submit-triangle-request="submitTriangleRequest"
      v-model:exchange-week-offset="exchangeWeekOffset"
      v-model:match-search-query="matchSearchQuery"
      v-model:triangle-candidate-search="triangleCandidateSearch"
      v-model:triangle-reason="triangleReason"
      v-model:triangle-note="triangleNote"
      @close="closeMatchModal"
    />
      <!-- 三角調：三位教師課表預覽 -->
    <!-- 三角調三人課表預覽 modal → components/TrianglePreviewModal.vue -->
    <TrianglePreviewModal
      v-if="showTriangleTimetablePreview"
      :triangle-timetable-preview="triangleTimetablePreview"
      :triangle-preview-week-dates="trianglePreviewWeekDates"
      :triangle-preview-rows="trianglePreviewRows"
      :format-triangle-slot="formatTriangleSlot"
      :get-period-label="getPeriodLabel"
      :open-triangle-paper-preview="openTrianglePaperPreview"
      @close="showTriangleTimetablePreview = false"
    />
      <!-- 3.2 雙人對比 Modal (compareModal) -->
    <!-- 送出前對照確認 modal → components/CompareModal.vue -->
    <CompareModal
      v-if="showCompareModal"
      :has-sub-teacher-conflict="hasSubTeacherConflict"
      :is-admin="isAdmin"
      :is-proxy-submit-active="isProxySubmitActive"
      :user="user"
      :notifications-suppressed="notificationsSuppressed"
      :batch-compare-week-total="batchCompareWeekTotal"
      :batch-compare-week-index="batchCompareWeekIndex"
      :compare-week-dates-a="compareWeekDatesA"
      :batch-compare-week-slot-count="batchCompareWeekSlotCount"
      :batch-exchange-preview-slot-key="batchExchangePreviewSlotKey"
      :is-cross-week-exchange="isCrossWeekExchange"
      :compare-week-selection-a="compareWeekSelectionA"
      :compare-week-dates-b="compareWeekDatesB"
      :compare-display-dates-a="compareDisplayDatesA"
      :timetable-periods="timetablePeriods"
      :consec-alerts-a="consecAlertsA"
      :compare-week-selection-b="compareWeekSelectionB"
      :compare-display-dates-b="compareDisplayDatesB"
      :consec-alerts-b="consecAlertsB"
      :batch-compare-sub-groups="batchCompareSubGroups"
      :batch-compare-view-email="batchCompareViewEmail"
      :batch-slots="batchSlots"
      :leave-reason-options="leaveReasonOptions"
      :is-period8-fee-locked="isPeriod8FeeLocked"
      :-p-e-r-i-o-d8_-f-e-e="PERIOD8_FEE"
      :is-mutual-cover="isMutualCover"
      :-t-i-m-e-t-a-b-l-e_-o-n-l-y_-f-e-e="TIMETABLE_ONLY_FEE"
      :quota-deduct-preview="quotaDeductPreview"
      :quota-pack-loading="quotaPackLoading"
      :quota-pack-error="quotaPackError"
      :quota-pack-options="quotaPackOptions"
      :quota-fifo-package-id="quotaFifoPackageId"
      :quota-deduct-insufficient="quotaDeductInsufficient"
      :ask-first-line-text="askFirstLineText"
      :paper-mode="paperMode"
      :is-submitting="isSubmitting"
      :loading="loading"
      :paper-flow="paperFlow"
      :get-teacher-name-by-email="getTeacherNameByEmail"
      :shift-batch-compare-week="shiftBatchCompareWeek"
      :format-date-m-m-d-d="formatDateMMDD"
      :set-batch-exchange-preview-slot="setBatchExchangePreviewSlot"
      :get-exchange-endpoint-text="getExchangeEndpointText"
      :set-compare-week-selection="setCompareWeekSelection"
      :get-period-label="getPeriodLabel"
      :get-compare-cell-class="getCompareCellClass"
      :get-compare-cell-text="getCompareCellText"
      :resolve-compare-b-email="resolveCompareBEmail"
      :set-batch-compare-view-email="setBatchCompareViewEmail"
      :get-week-day-text="getWeekDayText"
      :format-period-text="formatPeriodText"
      :set-leave-time-preset="setLeaveTimePreset"
      :get-leave-time-preset-range="getLeaveTimePresetRange"
      :copy-line-message="copyLineMessage"
      :send-line-message="sendLineMessage"
      :assign-mutual-draft-from-match="assignMutualDraftFromMatch"
      :execute-batch-submit="executeBatchSubmit"
      :execute-submit-request="executeSubmitRequest"
      :close-compare-modal="closeCompareModal"
      :toggle-course-adjustment-only="toggleCourseAdjustmentOnly"
      :on-leave-reason-change="onLeaveReasonChange"
      :update-pending-leave-time="updatePendingLeaveTime"
      :switch-quota-deduct-to-self-pay="switchQuotaDeductToSelfPay"
      :open-paper-print-draft-from-compare="openPaperPrintDraftFromCompare"
      v-model:direct-approve-mode="directApproveMode"
      v-model:direct-approve-skip-notify="directApproveSkipNotify"
      v-model:pending-request-data="pendingRequestData"
      v-model:ask-first-line-draft="askFirstLineDraft"
      @close="closeCompareModal"
    />

      <!-- 單欄列印預覽：確認後才開啟正式左右雙聯列印視窗 -->
    <!-- 列印預覽 modal → components/PrintPreviewModal.vue -->
    <PrintPreviewModal
      v-if="showPrintPreviewModal"
      :print-preview="printPreview"
      :print-preview-image-busy="printPreviewImageBusy"
      :close-print-preview="closePrintPreview"
      :copy-print-preview-image="copyPrintPreviewImage"
      :download-print-preview-image="downloadPrintPreviewImage"
      :confirm-print-preview="confirmPrintPreview"
      @close="closePrintPreview(true)"
    />

      <!-- LINE 訊息編輯器：列表／詳情開啟後可先修改再複製或傳送 -->
    <!-- LINE 訊息編輯 modal → components/LineMessageModal.vue -->
    <LineMessageModal
      v-if="showLineMessageModal"
      :line-message-title="lineMessageTitle"
      v-model:line-message-text="lineMessageText"
      :copy-edited-line-message="copyEditedLineMessage"
      :send-edited-line-message="sendEditedLineMessage"
      @close="showLineMessageModal = false"
    />

      <!-- 3.3 成功提示與 LINE 訊息複製對話框 (successModal) -->
    <!-- 送出成功＋LINE 傳送 modal → components/SuccessModal.vue -->
    <SuccessModal
      v-if="showSuccessModal"
      :success-modal-title="successModalTitle"
      :success-modal-message="successModalMessage"
      :success-flow-mode="successFlowMode"
      :has-line-template="hasLineTemplate"
      :success-action-requests="successActionRequests"
      :copy-line-batch-part="copyLineBatchPart"
      :send-line-batch-part="sendLineBatchPart"
      :copy-line-message="copyLineMessage"
      :send-line-message="sendLineMessage"
      :open-success-print-preview="openSuccessPrintPreview"
      :add-success-to-calendar="addSuccessToCalendar"
      :close-success-go-records="closeSuccessGoRecords"
      :close-success-go-pending="closeSuccessGoPending"
      :close-success-stay-timetable="closeSuccessStayTimetable"
      v-model:line-batch-parts="lineBatchParts"
      v-model:line-copy-text="lineCopyText"
      @close="showSuccessModal = false"
    />

      <!-- 批次核准後列印提示 -->
    <!-- 批次已核准列印提示 modal → components/BatchPrintPromptModal.vue -->
    <BatchPrintPromptModal
      v-if="showBatchPrintPrompt"
      :last-batch-print-ids="lastBatchPrintIds"
      :dismiss-batch-print-prompt="dismissBatchPrintPrompt"
      :print-last-batch-notices="printLastBatchNotices"
      @close="dismissBatchPrintPrompt"
    />

      <!-- 批次匯入教師 Modal -->
    <!-- 特例調代 composer → components/ExceptionComposerModal.vue -->
    <ExceptionComposerModal
      v-if="showExceptionComposer"
      :teachers-list="teachersList"
      :all-schedules="allSchedules"
      :get-schedule-for-date="getScheduleForDate"
      :get-teacher-name-by-email="getTeacherNameByEmail"
      :submit-admin-exception="submitAdminException"
      @close="showExceptionComposer = false"
    />

    <!-- 批次匯入教師 modal → components/ImportTeachersModal.vue -->
    <ImportTeachersModal
      v-if="showImportTeachersModal"
      :teacher-excel-data="teacherExcelData"
      :teacher-import-preview="teacherImportPreview"
      v-model:teacher-mapping-fields="teacherMappingFields"
      :teacher-excel-headers="teacherExcelHeaders"
      :handle-teacher-excel-change="handleTeacherExcelChange"
      :run-teacher-import-preview="runTeacherImportPreview"
      :import-teachers-batch="importTeachersBatch"
      @close="showImportTeachersModal = false"
    />

      <!-- 4. 教師新增/編輯的 Modal -->
    <!-- 教師新增／編輯 modal → components/TeacherModal.vue -->
    <TeacherModal
      v-if="showTeacherModal"
      :teacher-modal-mode="teacherModalMode"
      :get-expense-plan-summary="getExpensePlanSummary"
      v-model:teacher-form="teacherForm"
      :overtime-plan-teacher="overtimePlanTeacher"
      :accounting-plan-options="accountingPlanOptions"
      :is-expense-plan-slot-config="isExpensePlanSlotConfig"
      :open-overtime-plan-modal="openOvertimePlanModal"
      :fill-fixed-overtime-from-current-schedule="fillFixedOvertimeFromCurrentSchedule"
      :save-teacher="saveTeacher"
      @close="showTeacherModal = false"
    />

      <!-- 4.1. 超鐘點課格經費來源設定 Modal -->
    <!-- 超鐘點計畫 modal → components/OvertimePlanModal.vue -->
    <OvertimePlanModal
      v-if="showOvertimePlanModal"
      :overtime-plan-teacher="overtimePlanTeacher"
      :overtime-plan-period-end="overtimePlanPeriodEnd"
      v-model:overtime-plan-rows="overtimePlanRows"
      :overtime-plan-uses-fixed-slots="overtimePlanUsesFixedSlots"
      :loading="loading"
      :get-overtime-expense-source-options="getOvertimeExpenseSourceOptions"
      :save-overtime-plan="saveOvertimePlan"
      @close="showOvertimePlanModal = false"
    />

      <!-- 4.1b. 教師經費來源檢查與整理 Modal -->
    <!-- 教師經費來源檢查 modal → components/ExpenseAuditModal.vue -->
    <ExpenseAuditModal
      v-if="showTeacherExpenseAuditModal"
      :teacher-expense-audit-summary="teacherExpenseAuditSummary"
      :teacher-expense-audit-rows="teacherExpenseAuditRows"
      :loading="loading"
      :normalize-teacher-expense-data="normalizeTeacherExpenseData"
      @close="showTeacherExpenseAuditModal = false"
    />

      <!-- 4.1a. 學期新增/編輯 Modal -->
    <!-- 學期新增／編輯 modal → components/SemesterModal.vue -->
    <SemesterModal
      v-if="showSemesterModal"
      :semester-modal-mode="semesterModalMode"
      v-model:semester-form="semesterForm"
      :save-semester="saveSemester"
      @close="showSemesterModal = false"
    />

      <!-- 全校日期節次對調 Modal -->
    <!-- 校對調 modal → components/SchoolSwapModal.vue -->
    <SchoolSwapModal
      v-if="showSchoolSwapModal"
      :school-swap-modal-mode="schoolSwapModalMode"
      :school-swap-saving="schoolSwapSaving"
      :school-swap-weekday-text="schoolSwapWeekdayText"
      :format-period-text="formatPeriodText"
      v-model:school-swap-form="schoolSwapForm"
      :timetable-periods="timetablePeriods"
      :save-school-swap="saveSchoolSwap"
      @close="showSchoolSwapModal = false"
    />

      <!-- 空堂事件 Modal -->
    <!-- 空堂事件 modal → components/ClassAwayModal.vue -->
    <ClassAwayModal
      v-if="showClassAwayModal"
      :class-away-modal-mode="classAwayModalMode"
      :class-away-period-options="classAwayPeriodOptions"
      :class-list="classList"
      :set-class-away-period-mode="setClassAwayPeriodMode"
      :set-class-away-period-boundary="setClassAwayPeriodBoundary"
      :is-class-away-period-selected="isClassAwayPeriodSelected"
      :toggle-class-away-period="toggleClassAwayPeriod"
      :select-class-away-grade="selectClassAwayGrade"
      :is-class-away-form-class-selected="isClassAwayFormClassSelected"
      :toggle-class-away-form-class="toggleClassAwayFormClass"
      :select-class-away-period-range="selectClassAwayPeriodRange"
      :clear-class-away-periods="clearClassAwayPeriods"
      :save-class-away-event="saveClassAwayEvent"
      v-model:class-away-form="classAwayForm"
      @close="showClassAwayModal = false"
    />

      <!-- 4.1b. 管理員編輯歷史紀錄 Modal（可改全部代／調課欄位） -->
    <!-- 歷史異動編輯 modal → components/HistoryEditModal.vue -->
    <HistoryEditModal
      v-if="showHistoryEditModal"
      :teachers-list="teachersList"
      :class-list="classList"
      :timetable-periods="timetablePeriods"
      :leave-reason-options="leaveReasonOptions"
      :-t-i-m-e-t-a-b-l-e_-o-n-l-y_-f-e-e="TIMETABLE_ONLY_FEE"
      :on-history-edit-date-change="onHistoryEditDateChange"
      :format-period-text="formatPeriodText"
      :on-history-edit-type-change="onHistoryEditTypeChange"
      :on-history-edit-period-change="onHistoryEditPeriodChange"
      :on-history-edit-reason-change="onHistoryEditReasonChange"
      :save-history-edit="saveHistoryEdit"
      v-model:history-edit-form="historyEditForm"
      @close="showHistoryEditModal = false"
    />

      <!-- 4.1. 異動狀態與詳情 Modal -->
    <!-- §UI-3.1 異動詳情 modal → components/DetailModal.vue -->
    <DetailModal
      v-if="showDetailModal"
      :detail-request="detailRequest"
      :detail-sub-record="detailSubRecord"
      :user="user"
      :is-admin="isAdmin"
      :can-start-second-sub-from-detail="canStartSecondSubFromDetail"
      :get-status-text="getStatusText"
      :format-date-m-m-d-d="formatDateMMDD"
      :get-week-day-text="getWeekDayText"
      :get-original-request-class="getOriginalRequestClass"
      :get-original-request-subject="getOriginalRequestSubject"
      :get-original-target-class="getOriginalTargetClass"
      :get-original-target-subject="getOriginalTargetSubject"
      :get-triangle-group-requests="getTriangleGroupRequests"
      :format-leave-class-slot="formatLeaveClassSlot"
      :format-exchange-class-slot="formatExchangeClassSlot"
      :is-paper-flow-request="isPaperFlowRequest"
      :get-request-progress-steps="getRequestProgressSteps"
      :get-teacher-name-by-email="getTeacherNameByEmail"
      :add-event-to-calendar="addEventToCalendar"
      :print-single-request="printSingleRequest"
      :open-paper-print-for-request="openPaperPrintForRequest"
      :copy-line-message-for-request="copyLineMessageForRequest"
      :respond-to-batch="respondToBatch"
      :respond-to-request="respondToRequest"
      :cancel-request="cancelRequest"
      :admin-approve="adminApprove"
      :admin-reject="adminReject"
      :delete-substitution-record="deleteSubstitutionRecord"
      :start-second-sub="startSecondSub"
      :open-empty-slot-from-detail="openEmptySlotFromDetail"
      @close="showDetailModal = false"
    />


      <!-- 新手導覽：懶載入 onboarding-tour.js（不佔殼 DOM） -->

      <!-- 5. 基礎課表編輯的 Modal -->
    <!-- 基礎課表編輯 modal → components/ScheduleEditModal.vue -->
    <ScheduleEditModal
      v-if="showScheduleEditModal"
      :get-week-day-text="getWeekDayText"
      :format-period-text="formatPeriodText"
      :get-schedule-attr-label="getScheduleAttrLabel"
      v-model:schedule-form="scheduleForm"
      :semester-start-date="semesterStartDate"
      :semester-end-date="semesterEndDate"
      :pick-schedule-attr="pickScheduleAttr"
      :normalize-schedule-form-flags="normalizeScheduleFormFlags"
      :save-schedule-cell="saveScheduleCell"
      :clear-schedule-cell="clearScheduleCell"
      @close="showScheduleEditModal = false"
    />

      <!-- 空堂排班 Modal（扣額度；預設不寄信；班級可選） -->
    <!-- 空堂任務 modal → components/EmptySlotModal.vue -->
    <EmptySlotModal
      v-if="showEmptySlotModal"
      :format-date-m-m-d-d="formatDateMMDD"
      :get-week-day-text="getWeekDayText"
      :format-period-text="formatPeriodText"
      v-model:empty-slot-form="emptySlotForm"
      :empty-slot-quota-zero="emptySlotQuotaZero"
      :is-submitting="isSubmitting"
      :loading="loading"
      :close-empty-slot-modal="closeEmptySlotModal"
      :execute-empty-slot-assign="executeEmptySlotAssign"
      @close="closeEmptySlotModal"
    />

      <!-- 手動新增代導費 Modal -->
    <!-- 手動導師代課 modal → components/ManualHomeroomModal.vue -->
    <ManualHomeroomModal
      v-if="showManualHomeroomModal"
      :homeroom-records-loading="homeroomRecordsLoading"
      :loading="loading"
      v-model:manual-homeroom-form="manualHomeroomForm"
      :homeroom-teachers-list="homeroomTeachersList"
      :teachers-list-details="teachersListDetails"
      :on-manual-homeroom-leave-teacher-change="onManualHomeroomLeaveTeacherChange"
      :get-teacher-name-by-email="getTeacherNameByEmail"
      :on-manual-cover-teacher-input="onManualCoverTeacherInput"
      :save-manual-homeroom-record="saveManualHomeroomRecord"
      @close="showManualHomeroomModal = false"
    />

      <!-- 折抵額度歷程 Modal（後台教師管理） -->
    <!-- 額度歷程 modal → components/QuotaLedgerModal.vue -->
    <QuotaLedgerModal
      v-if="showQuotaLedgerModal"
      :quota-ledger-teacher="quotaLedgerTeacher"
      :quota-ledger-loading="quotaLedgerLoading"
      :quota-ledger-rows="quotaLedgerRows"
      :quota-type-class="quotaTypeClass"
      :close-quota-ledger="closeQuotaLedger"
      :open-manual-quota-adjust="openManualQuotaAdjust"
      @close="closeQuotaLedger"
    />

      <!-- 管理員手動增減額度 -->
    <!-- 手動調整額度 modal → components/QuotaAdjustModal.vue -->
    <QuotaAdjustModal
      v-if="showQuotaAdjustModal"
      :quota-adjust-preview="quotaAdjustPreview"
      :quota-adjust-saving="quotaAdjustSaving"
      v-model:quota-adjust-form="quotaAdjustForm"
      :close-manual-quota-adjust="closeManualQuotaAdjust"
      :save-manual-quota-adjust="saveManualQuotaAdjust"
      @close="closeManualQuotaAdjust"
    />

    </div>

  
</template>

<script setup>
import { defineAsyncComponent, getCurrentInstance, onMounted, watch } from 'vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import LoginCard from './components/LoginCard.vue';
import TeachersTable from './components/TeachersTable.vue';
import ClassPanel from './components/ClassPanel.vue';
// modal 一律改非同步載入：不進首屏主包，掛載時才抓各自的 chunk。
// LoadingOverlay／LoginCard／TeachersTable／ClassPanel 為首屏必要，維持同步載入。
const PrintPreviewModal = defineAsyncComponent(() => import('./components/PrintPreviewModal.vue'));
const HistoryEditModal = defineAsyncComponent(() => import('./components/HistoryEditModal.vue'));
const ClassAwayModal = defineAsyncComponent(() => import('./components/ClassAwayModal.vue'));
const SuccessModal = defineAsyncComponent(() => import('./components/SuccessModal.vue'));
const CompareModal = defineAsyncComponent(() => import('./components/CompareModal.vue'));
const MatchDrawerModal = defineAsyncComponent(() => import('./components/MatchDrawerModal.vue'));
const TeacherModal = defineAsyncComponent(() => import('./components/TeacherModal.vue'));
const ImportTeachersModal = defineAsyncComponent(() => import('./components/ImportTeachersModal.vue'));
const SchoolSwapModal = defineAsyncComponent(() => import('./components/SchoolSwapModal.vue'));
const ScheduleEditModal = defineAsyncComponent(() => import('./components/ScheduleEditModal.vue'));
const ManualHomeroomModal = defineAsyncComponent(() => import('./components/ManualHomeroomModal.vue'));
const SemesterModal = defineAsyncComponent(() => import('./components/SemesterModal.vue'));
const QuotaAdjustModal = defineAsyncComponent(() => import('./components/QuotaAdjustModal.vue'));
const EmptySlotModal = defineAsyncComponent(() => import('./components/EmptySlotModal.vue'));
const OvertimePlanModal = defineAsyncComponent(() => import('./components/OvertimePlanModal.vue'));
const LineMessageModal = defineAsyncComponent(() => import('./components/LineMessageModal.vue'));
const QuotaLedgerModal = defineAsyncComponent(() => import('./components/QuotaLedgerModal.vue'));
const ExpenseAuditModal = defineAsyncComponent(() => import('./components/ExpenseAuditModal.vue'));
const BatchPrintPromptModal = defineAsyncComponent(() => import('./components/BatchPrintPromptModal.vue'));
const TrianglePreviewModal = defineAsyncComponent(() => import('./components/TrianglePreviewModal.vue'));
const DetailModal = defineAsyncComponent(() => import('./components/DetailModal.vue'));
const ExceptionComposerModal = defineAsyncComponent(() => import('./components/ExceptionComposerModal.vue'));
import { storeToRefs } from 'pinia';
import { useSessionStore } from './stores/session.js';
import { useDataStore } from './stores/data.js';
import { useTimetableStore } from './stores/timetable.js';
import { useMatchStore } from './stores/match.js';
import { useSubmitStore } from './stores/submit.js';
import { useRequestsStore } from './stores/requests.js';
import { useHistoryStore } from './stores/history.js';
import { useBackofficeStore } from './stores/backoffice.js';
import { useAdminStore } from './stores/admin.js';
import { useOutputStore } from './stores/output.js';
import { useInteractionStore } from './stores/interaction.js';
import { useHomeroomStore } from './stores/homeroom.js';
import { useMutualStore } from './stores/mutual.js';
import { useTourStore } from './stores/tour.js';
import { useGasStore } from './stores/gas.js';
import { UiLineTemplate } from './modules/ui-line-template.js';
import { UiListHelpers } from './modules/ui-list-helpers.js';
import { installErrorReporting, installVueErrorHandler } from './modules/error-report.js';
const sessionStore = useSessionStore();
const dataStore = useDataStore();
const timetableStore = useTimetableStore();
const matchStore = useMatchStore();
const submitStore = useSubmitStore();
const requestsStore = useRequestsStore();
const historyStore = useHistoryStore();
const backofficeStore = useBackofficeStore();
const adminStore = useAdminStore();
const outputStore = useOutputStore();
const interactionStore = useInteractionStore();
const homeroomStore = useHomeroomStore();
const mutualStore = useMutualStore();
const tourStore = useTourStore();
const gasStore = useGasStore();
// 全域前端錯誤回報（fire-and-forget；免登入亦可報；見 modules/error-report.js）
const errorReporter = installErrorReporting({
  getEmail: () => {
    const u = sessionStore.user;
    return u && u.email ? String(u.email) : '';
  },
  send: (entry) => gasStore.callGasApi('logClientError', entry, { skipAuth: true }).catch(() => false)
});
// Vue 渲染／生命週期錯誤一併回報（附元件名＋當前景籤），以便定位生產問題
installVueErrorHandler(getCurrentInstance().appContext.app, errorReporter.report, {
  getContext: () => {
    try {
      const t = storeToRefs(sessionStore).activeTab;
      return 'tab=' + (t && t.value ? t.value : '');
    } catch (e) { return ''; }
  }
});
const { canOperateOnTeacherEmail, ensureProxyTargetForTeacher, initMobileDay, loginWithGoogle, persistProxySubmitEmails, reloadGsiLoginButton, setActiveTab, setOnlineSubstitutionEnabled, setProxyTarget, toggleProxySubmitEmail } = sessionStore;
const { checkMobile, handleAvatarError, isClassAwayOnDate, isSingleWeek, schoolSwapWeekdayText, toLocalDateStr } = sessionStore;
const { activeAwayBanner, activeTab, adminSubTab, allSchedules, availableSemesters, avatarSrc, canViewAllTimetables, classAwayEvents, currentSemester, currentSemesterName, currentWeekNumber, gasApiUrl, googleClientId, gsiButtonError, gsiButtonReady, gsiLoggingIn, homeroomAssignSelections, homeroomRecords, homeroomRecordsLoading, isAdmin, isMobile, isStaff, loading, loadingMessage, onlineSubstitutionEnabled, originalUser, proxyGrantQuery, proxySubmitEmails, proxySubmitEnabled, proxySubmitEnabledAt, proxySubmitEnabledBy, proxyTargetEmail, proxyTargetQuery, requestsList, schoolSwapForm, schoolSwapModalMode, schoolSwapRows, schoolSwapSaving, schoolSwaps, searchQuery, selectedMobileDay, selectedSubject, selectedWeekDate, semesterEndDate, semesterForm, semesterModalMode, semesterStartDate, semestersList, showMatchModal, showProxyTargetDropdown, showSchoolSwapModal, showSemesterModal, substitutionRecords, teachersList, timetableDisplayMode, user, userRole } = storeToRefs(sessionStore);
const { changeMatchMode, deleteSemester, getRealTeacherName, getTeacherTimetableHours, getTriangleGroupRequests, manualRefreshData, saveClientSettings, saveSemester, setDefaultSemester } = dataStore;
const { changeWeek, clearAllProxySubmitEmails, clearProxyTarget, ensureHistoryMonthLoaded, formatClassName, formatDateMMDD, formatExchangeClassSlot, formatMoney, formatQuickTodoTitle, getClassBadgeStyle, getLeaveTimePresetRange, getPeriodClass, getPeriodLabel, getPeriodTimeSpan, getSubjectStyle, getTeacherIdentityTooltip, getTeacherNameByEmail, getTeacherSubjectByEmail, getWeekDayText, isExchangeClassRestricted, isLeaveClassRestricted, isLunchPeriod, isProxySubmitEmailGranted, openAddSemesterModal, openEditSemesterModal, period8CellsFor, period8StatusLabel, selectClassForView, setCompareWeekSelection, setProxySubmitEnabled, shiftBatchCompareWeek, updatePendingLeaveTime } = dataStore;
const { accountingExportLoading, accountingPeriod, batchCompareWeekIndex, batchCompareWeekSlotCount, batchCompareWeekTotal, compareDisplayDatesA, compareDisplayDatesB, dataRefreshing, dataUpdatedLabel, devTeacherQuery, directApproveMode, emptySlotForm, filteredDevTeachers, filteredProxyTeachers, filteredTeachers, historyEditForm, historyFullLoaded, historyLoadedMonths, historyLoadingFull, historyMonthLoading, isCrossWeekExchange, isScheduleEditMode, monthlyReportData, monthlyReportLoading, monthlyReportTotals, period8ExportLoading, period8Loading, period8RosterRows, proxyGrantCandidateTeachers, proxyGrantedTeachers, proxyTargetName, reportEndDate, reportMonth, reportStartDate, reportWeeksCount, requestWindowInfo, showEmptySlotModal, showHistoryEditModal, softSyncing, subjectsList, userRoleText } = storeToRefs(dataStore);
const { addEventToCalendar, addToGoogleCalendar, cellFromGrid, copyLineMessageForRequest, deleteSchoolSwap, downloadIcsCalendar, formatHistoryExchangeSlot, formatHistoryLeaveSlot, getClassAwayEventName, getClassCellClassForClass, getClassCellClassForDate, getScheduleForDate, isAwayClassCell, isHistoryExchangeRechanged, isHistoryExchangeRestricted, isHistoryLeaveRechanged, isHistoryLeaveRestricted, isRequestExchangeRechanged, isRequestLeaveRechanged, loadMoreTriangleCandidates, openAddSchoolSwapModal, openEditSchoolSwapModal, openTriangleTimetablePreview, saveSchoolSwap, selectTriangleCandidateB, selectTriangleCandidateC, triangleCandidateIsRestricted } = timetableStore;
const { changeTtPage, changeTeachersPage, formatPeriodText, getExpensePlanSummary, getHomeroomCoverCandidates, isBatchGroupExpanded, isCombinedClass, isExpensePlanSlotConfig, isSubFeeLockedToSelf, timetablePeriods, toggleBatchGroup } = timetableStore;
const { accountingPlanOptions, adminTodoCount, allTeachersList, currentMonthHomeroomAssignedCount, currentMonthHomeroomFeeTotal, currentMonthHomeroomPendingCount, currentMonthHomeroomRecords, currentWeekDates, dateFilteredHistoryRecords, displayTimetableTeachers, exchangeTeachersList, filteredAdminPendingRequests, filteredHistoryRecords, hasQuickTodo, historyTotalPages, homeroomStatusFilter, homeroomTeachersList, isPeriod8FeeLocked, isRequestValid, manualHomeroomForm, myInviteCount, myTeacherProfile, paginatedAdminPending, paginatedHistoryRecords, paginatedMyPending, paginatedMySent, pendingAdminPage, pendingAdminTotal, pendingCount, pendingHomeroomRecords, pendingMyPendingPage, pendingMyPendingTotal, pendingMySentPage, pendingMySentTotal, pendingSearchQuery, quickTodoSentOpen, quotaDeductInsufficient, quotaDeductPreview, recommendedExchangeList, showManualHomeroomModal, teachersListDetails, TEACHERS_PAGE_SIZE_DEFAULT, teachersPageSize, teachersPage, teachersTotalPages, teachersNeedPager, pagedTeachersListDetails, ttNeedPager, ttPage, ttPageSize, ttTotalPages, visibleTimetableTeachers
 } = storeToRefs(timetableStore);
const { clearMatchPreview, closeMatchModal, fetchQuotaPackPreview, getMatchSlotDateMMDD, loadMoreMatches, resetQuotaPackOverride, selectMatchPreviewExchange, selectMatchPreviewSub, setBatchExchangePreviewSlot } = matchStore;
const { batchCompareSubGroups, batchCompareViewEmail, batchExchangePreviewSlotKey, compareWeekSelectionA, compareWeekSelectionB, displayedExchangeList, displayedRecommendedTeachers, filteredExchangeList, filteredRecommendedTeachers, hasSubTeacherConflict, personalChanges, quotaFifoPackageId, quotaPackError, quotaPackLoading, quotaPackOptions, quotaPackPreview, quotaSelectedPack } = storeToRefs(matchStore);
const { assignBatchSlotSub, clearBatchSlotSub, clearBatchSlots, closeCompareModal, executeBatchSubmit, executeSubmitRequest, getCompareCellClass, getCompareCellText, getExchangeEndpointText, isBatchSlotSelected, openBatchMatch, prepBatchCompare, prepBatchExchangeCompare, prepBatchPerSlotCompare, prepCompare, previewBatchCandidate, resolveCompareBEmail, selectBatchSlotForMatch, sendLineBatchPart, setBatchAssignMode, setBatchCompareViewEmail, setBatchFlowMode, setLeaveTimePreset, toggleBatchSelectMode, toggleCourseAdjustmentOnly } = submitStore;
const { getLeaveTimeDefaults } = submitStore;
const { batchActiveSlot, batchAllSlotsAssigned, batchAssignedCount, canStaffProxySubmit, compareWeekDatesA, compareWeekDatesB, isBatchExchangeFlow, isBatchMatchFlow, isBatchPerSlotMode, isProxySubmitActive, isProxySubmitGranted, notificationsSuppressed, paperFlow, paperMode } = storeToRefs(submitStore);
const { adminApprove, adminReject, batchAdminApprove, batchAdminReject, cancelRequest, clearAdminPendingSelection, deleteSubstitutionRecord, dismissBatchPrintPrompt, executeEmptySlotAssign, formatApproveBatchRiskSummary, formatRequestSummary, getApproveRiskFlags, getRequestProgressSteps, isAdminBatchGroupSelected, isAdminPendingSelected, isPaperFlowRequest, printLastBatchNotices, respondToBatch, respondToRequest, sendSelectedBatchNotices, startCombinedReturn, submitTriangleRequest, toggleAdminBatchGroupSelection, toggleAdminPendingSelect, toggleSelectAllAdminPending } = requestsStore;
const { lastBatchPrintIds, selectedAdminPendingIds, showBatchPrintPrompt } = storeToRefs(requestsStore);
const { loadFullSemesterHistory, loadHistoryMonth, reloadWindowedHistory, setHistoryFilterMode, setHistoryTypeFilter } = historyStore;
const { dashboardStats } = storeToRefs(historyStore);
const { changeHistoryPage, classAwayBoundaryPeriodLabel, classAwayDailyPeriodLabel, classAwayPeriodLabel, classAwayPeriodOptions, clearClassAwayPeriods, deleteClassAwayEvent, devSwitchUser, isAdminPendingPageFullySelected, isClassAwayFormClassSelected, isClassAwayFullDaySelected, isClassAwayPeriodSelected, isClassAwayRangeEvent, isHistoryBatchGroupSelected, isHistoryRecordSelected, logout, onLeaveReasonChange, openAddClassAwayModal, openBatchPendingPrintPreview, openEditClassAwayModal, openEmptySlotAssign, openEmptySlotFromDetail, openManualQuotaAdjust, previewMutualDraft, restoreAdmin, saveClassAwayEvent, saveManualQuotaAdjust, selectClassAwayGrade, selectClassAwayPeriodRange, setClassAwayPeriodBoundary, setClassAwayPeriodMode, submitAllMutualDrafts, toggleClassAwayFormClass, toggleClassAwayPeriod, toggleHistoryBatchGroupSelection, toggleMutualCover, toggleSelectAllRecords } = backofficeStore;
const { changePendingPage, closeEmptySlotModal, closeSuccessCopyLine, closeSuccessGoPending, closeSuccessGoRecords, closeSuccessStayTimetable, defaultSubFeeForReason } = backofficeStore;
const { classAwayForm, classAwayModalMode, isSimulating, showClassAwayModal } = storeToRefs(backofficeStore);
const { clearScheduleCell, deleteTeacher, downloadCurrentSchedules, downloadScheduleTemplate, fillFixedOvertimeForAllTeachers, fillFixedOvertimeFromCurrentSchedule, handleFileChange, handleTeacherExcelChange, importSchedules, importTeachersBatch, migrateNameKeySchema, normalizeScheduleFormFlags, normalizeTeacherExpenseData, onHistoryEditDateChange, onHistoryEditPeriodChange, onHistoryEditReasonChange, onHistoryEditTypeChange, openAddTeacherModal, openEditTeacherModal, openExceptionComposer, openHistoryEditModal, openOvertimePlanModal, openQuotaLedger, openScheduleEditModal, openTeacherExpenseAuditModal, pickScheduleAttr, runImportPreview, runTeacherImportPreview, saveHistoryEdit, saveOvertimePlan, saveScheduleCell, saveTeacher, submitAdminException, updateTeacherBaseHours } = adminStore;
const { closeManualQuotaAdjust, closeQuotaLedger, getMappingLabel, getOvertimeExpenseSourceOptions, getScheduleAttrLabel, leaveReasonOptions, quotaTypeClass } = adminStore;
const { dashboardScope, emptySlotQuotaZero, excelData, excelHeaders, importPreview, mappingFields, overtimePlanPeriodEnd, overtimePlanRows, overtimePlanTeacher, overtimePlanUsesFixedSlots, quotaAdjustForm, quotaAdjustPreview, quotaAdjustSaving, quotaLedgerLoading, quotaLedgerRows, quotaLedgerTeacher, scheduleForm, showExceptionComposer, showImportTeachersModal, showOvertimePlanModal, showQuotaAdjustModal, showQuotaLedgerModal, showScheduleEditModal, showTeacherExpenseAuditModal, showTeacherModal, teacherExcelData, teacherExcelHeaders, teacherExpenseAuditRows, teacherExpenseAuditSummary, teacherForm, teacherImportPreview, teacherMappingFields, teacherModalMode } = storeToRefs(adminStore);
const { addSuccessToCalendar, calculateMonthlyReport, clearSchoolExportTeachers, closePrintPreview, confirmPrintPreview, copyPrintPreviewImage, downloadPrintPreviewImage, exportActivityCoverWord, exportInvigilationWorkbook, exportPeriod8Accounting, exportReportToExcel, exportSchoolTimetableWord, exportSubFeeToExcel, isSchoolExportTeacherSelected, openHistoryPrintPreview, openPaperDraftPreview, openPaperPrintForRequest, openPaperPrintMutualDrafts, openPrintPreview, openSuccessPrintPreview, openTrianglePaperPreview, printPaperDraft, printSelectedForms, printSingleRequest, selectAllSchoolExportTeachers, setSchoolExportThisWeek, shiftReportPeriod, toggleSchoolExportTeacher } = outputStore;
const { openPaperPrintDraftFromCompare } = outputStore;
const { displayedTriangleBOptions, displayedTriangleCOptions, triangleCandidateB, triangleCandidateBOptions, triangleCandidateBReadyCount, triangleCandidateC, triangleCandidateCList, triangleCandidateCOptions, triangleCandidateCReadyCount, triangleCandidateDisplayCount, triangleCandidateOptions, triangleCandidateSearch, triangleCandidates, triangleLegs, triangleParticipants, trianglePreviewRows, trianglePreviewWeekDates, triangleReady, triangleTimetablePreview, triangleValidation, weekScheduleGrid } = storeToRefs(outputStore);
const { copyClassReadonlyLink, getClassReadonlyLink, handleCellClick, handleClassCellClick, handlePeriod8CellClick, jumpToTeacherTimetable, loadTeacherClassesForExchange, showDetailForRecord, startSecondSub } = interactionStore;
const { changeClassWeek, changePeriod8Week, goToClassThisWeek, goToPeriod8ThisWeek, isMatchHoverCell, isMatchHoverEntry, isMatchPreviewSelected, isMatchSourceCell, isMatchSourceEntry } = interactionStore;
const { canStartSecondSubFromDetail, classSchedules, classViewerReadonly, filteredSchoolExportTeachers, invigilationExportTitle, schoolExportEnd, schoolExportIncludeWeekend, schoolExportOnlyChanged, schoolExportSelectedEmails, schoolExportStart, schoolExportTeacherFilter } = storeToRefs(interactionStore);
const { assignHomeroomTeacher, deleteHomeroomRecord, getTeacherJobTitleByEmail, isHomeroomTeacher, loadHomeroomRecords, onHomeroomInputSelect, onManualCoverTeacherInput, onManualHomeroomLeaveTeacherChange, openManualHomeroomModal, saveManualHomeroomRecord, switchQuotaDeductToSelfPay } = homeroomStore;
const { applyClassAwayEventById, applyClassAwayToMutualPanel, assignMutualDraftFromMatch, clearMutualDrafts, clearMutualPanel, getMutualDraftAt, isMutualActivityPeriodSelected, isMutualLead, persistMutualPanelDraft, recalculateMutualQuotasFromActivity, removeMutualDraft, selectAwayGrade, setMutualActivityPeriodBoundary, setMutualActivityPeriodMode, setMutualActivityThisWeek, setMutualCover, toggleMutualActivityPeriod, toggleMutualAwayClass, toggleMutualLead } = mutualStore;
const { copyEditedLineMessage, copyLineBatchPart, copyLineMessage, exchangeWeekdayOptions, getClassChangeTypeLabel, getOriginalRequestClass, getOriginalRequestSubject, getOriginalTargetClass, getOriginalTargetSubject, getTargetClassAndSubject, getTargetSubject, isExchangeLikeRequest, isHistoryExchangeType, onMutualLeadChipClick, openLineMessageEditor, sendEditedLineMessage, sendLineMessage, setExchangeWeekdayFilter } = mutualStore;
const { askFirstLineDraft, askFirstLineText, classChangeSummary, classList, classReadonlyMode, classSubstitutionMap, classWeekNumber, combinedReturnCandidates, consecAlertsA, consecAlertsB, detailRequest, detailSubRecord, exchangePeriodId, exchangeTargetDate, exchangeTeacherClasses, exchangeTeacherEmail, exchangeWeekOffset, exchangeWeekdayFilter, hasLineTemplate, historyFilterDate, historyFilterMode, historyPage, historyPageSize, historySearchQuery, historyTypeFilter, isSubmitting, lineBatchParts, lineCopyText, lineMessageText, lineMessageTitle, matchDisplayCount, matchEmptyReasons, matchSearchQuery, matchShowNoTeacherWarning, mutualCoverStats, mutualImportEventId, mutualImportableEvents, paperPrintDraft, paperSignatureByTeacher, pendingRequestData, period8WeekDate, period8WeekDates, period8WeekNumber, printPreview, printPreviewImageBusy, selectedClass, selectedClassDate, selectedClassWeekDates, selectedRecordIds, showCompareModal, showDetailModal, showDevDropdown, showLineMessageModal, showPrintPreviewModal, showSuccessModal, showTriangleTimetablePreview, successActionRequests, successFlowMode, successModalMessage, successModalTitle } = storeToRefs(mutualStore);
const { skipOnboarding, startOnboarding, tourDemoInviteRespond } = tourStore;
const { ACTIVITY_PUBLIC_FEE, MUTUAL_COVER_FEE, PERIOD8_FEE, QUOTA_DEDUCT_FEE, TIMETABLE_ONLY_FEE, nextOnboardingStep, onboardingSteps, prevOnboardingStep } = tourStore;
const { activeCell, adminPendingRequests, allPendingRequests, batchActiveSlotKey, batchAssignMode, batchFlowMode, batchNote, batchReason, batchSelectMode, batchSlots, batchSubFee, batchSubTeacher, directApproveSkipNotify, inputRequestDate, isMutualCover, matchMode, matchPreview, mutualActivityEnd, mutualActivityEndPeriod, mutualActivityPeriodMode, mutualActivityPeriods, mutualActivityStart, mutualActivityStartPeriod, mutualAwayClasses, mutualDrafts, mutualLeadEmails, mutualNote, mutualSkipNotify, myPendingRequests, mySentRequests, onboardingStep, recommendationLoading, recommendedTeachers, showBatchConfirmModal, showOnboarding, tourDemoInvite, triangleNote, trianglePickB, trianglePickC, triangleReason, triangleSubmitting } = storeToRefs(tourStore);
const { formatLeaveClassSlot, formatTriangleSlot, getCellPlainStatus, getRequestRiskTags, getRequestTypeTags, getScheduleSpecialTags, hasScheduleSpecialTag, isTimetablePullout, isTimetableRestricted } = UiLineTemplate;
const { formatRequestApplicationDate, getBatchGroupSlotSummary, getBatchGroupStatusClass, getBatchGroupStatusText, getBatchGroupTeacherSummary, getStatusText, isTriangleRequest } = UiListHelpers;
sessionStore.initImmediateSession1();
sessionStore.initImmediateSession2();
sessionStore.initImmediateSession3();
sessionStore.initImmediateSession4();
mutualStore.initImmediateMutual1();
mutualStore.initImmediateMutual2();
mutualStore.initImmediateMutual3();
mutualStore.initImmediateMutual4();
mutualStore.initImmediateMutual5();
mutualStore.initImmediateMutual6();
mutualStore.initImmediateMutual7();
dataStore.initImmediateData1();
mutualStore.initImmediateMutual8();
dataStore.initImmediateData2();
matchStore.initImmediateMatch1();
dataStore.initImmediateData3();
sessionStore.initImmediateSession5();
timetableStore.initImmediateTimetable1();
timetableStore.initImmediateTimetable2();
mutualStore.initImmediateMutual9();
mutualStore.initImmediateMutual10();
sessionStore.initImmediateSession6();
sessionStore.initImmediateSession7();
sessionStore.initImmediateSession8();
interactionStore.initImmediateInteraction1();
sessionStore.initImmediateSession9();
sessionStore.initImmediateSession10();
submitStore.initImmediateSubmit1();
adminStore.initImmediateAdmin1();
mutualStore.initImmediateMutual11();
tourStore.initImmediateTour1();
tourStore.initImmediateTour2();
sessionStore.initImmediateSession11();
// 2.1c：媒合抽屜開啟即背景預載 match 模組（開啟點分散各靜態模組，此處單點涵蓋；列表經 ready 自動重算）。
watch(showMatchModal, (open) => {
  if (open) matchStore.ensureMatchModule().catch(() => {});
});
onMounted(() => {
  // 2.1c追補：媒合抽屜為高頻路徑，掛載後背景預熱 match 模組（不擋首屏；抽屜開啟時多半已就緒）。
  // （開啟時 watcher 仍會確保，預熱只是把載入提前到空閒時段。）
  try {
    const prewarm = () => { try { matchStore.ensureMatchModule().catch(() => {}); } catch (e) {} };
    // 2.1hotfix：首頁「個人異動摘要」首屏就要 history（＋其 flatten 依賴 homeroom），同捆預熱否則首登空白。
    const prewarmFirstPaint = () => {
      try { historyStore.ensureHistoryModule().catch(() => {}); } catch (e) {}
      try { homeroomStore.ensureHomeroomModule().catch(() => {}); } catch (e) {}
    };
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(prewarm, { timeout: 3000 });
      window.requestIdleCallback(prewarmFirstPaint, { timeout: 5000 });
    } else { setTimeout(prewarm, 1500); setTimeout(prewarmFirstPaint, 1800); }
  } catch (e) {}
  mutualStore.initMutual1();
  mutualStore.initMutual2();
  requestsStore.initRequests1();
  adminStore.initAdmin1();
  dataStore.initData1();
  sessionStore.initSession1();
});
</script>
