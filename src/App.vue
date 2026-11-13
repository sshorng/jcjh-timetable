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
                   <span class="status-badge" style="background:#fef3c7;color:#92400e;">紙本簽核</span> 送出後由教學組核准，請列印通知供簽名。
                </div>
                <div v-else-if="notificationsSuppressed && isAdmin" class="batch-hint-bar" style="border-color:#f59e0b;background:#fffbeb;color:#92400e;">
                   <span class="status-badge" style="background:#fef3c7;color:#92400e;">紙本簽核</span> 線上提出並列印調代課單，簽名後送教學組。
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
                   <div class="mutual-panel-title">🔁 活動互代</div>
                  <button type="button" class="btn btn-secondary mutual-btn-clear" @click="clearMutualPanel" title="清空外出班、帶隊、暫定、備註；期間改回本週">
                    🗑️ 一鍵清空
                  </button>
                </div>
                <div class="mutual-panel-lead">
                  釋出空堂代課<strong>扣額度</strong>；本來空堂代課算<strong>活動公費</strong>；請假老師<strong>不扣</strong>鐘點。
                </div>

                <div class="mutual-step">
                  <div class="mutual-step-head">
                    <span class="mutual-step-no">1</span>空堂事件<span class="mutual-step-req">必填</span>
                  </div>
                  <select
                    class="form-select mutual-import-select"
                    :value="mutualImportEventId"
                    @change="applyClassAwayEventById($event.target.value)"
                  >
                     <option value="">請選擇空堂事件</option>
                    <option v-for="ev in mutualImportableEvents" :key="'imp-'+ev.id" :value="ev.id">
                       {{ ev.name }}（{{ ev.startDate }}～{{ ev.endDate || '學期結束' }} · {{ classAwayPeriodLabel(ev) }} · {{ (ev.classes || []).length }} 班）
                    </option>
                  </select>
                  <div v-if="!mutualImportableEvents.length" class="ui-caption">
                    後台「空堂事件」尚無可進互代的項目
                  </div>
                  <div v-else-if="mutualImportEventId" class="ui-caption">
                    期間 {{ mutualCoverStats.rangeLabel || '未設定' }}（{{ mutualCoverStats.rangeDays || 0 }} 天）· 由事件帶入
                  </div>
                </div>

                <div class="mutual-step">
                  <div class="mutual-step-head">
                    <span class="mutual-step-no">2</span>外出班
                    <span class="mutual-step-count">已選 {{ mutualAwayClasses.length }} 項（班級／課堂）</span>
                  </div>
                  <div class="flex-wrap-gap-6-mb4">
                    <button type="button" class="btn btn-secondary btn-xs" @click="selectAwayGrade('7')">七年級</button>
                    <button type="button" class="btn btn-secondary btn-xs" @click="selectAwayGrade('8')">八年級</button>
                    <button type="button" class="btn btn-secondary btn-xs" @click="selectAwayGrade('9')">九年級</button>
                    <button type="button" class="btn btn-secondary btn-xs" @click="mutualAwayClasses = []; persistMutualPanelDraft()">清空班級</button>
                    <button type="button" class="btn btn-primary btn-xs" @click="recalculateMutualQuotasFromActivity()" title="依期間與外出班寫入「額度帳本」發放紀錄（排除帶隊與小鐘點；同活動不重複）">
                      ＋發放額度
                    </button>
                  </div>
                  <div class="mutual-away-chips mutual-chips-away">
                    <button
                      v-for="c in classList.filter((c) => String(c || '').trim() !== '' && String(c).indexOf('·') < 0 && !isCombinedClass(c))"
                      :key="'away-'+c"
                      type="button"
                      class="mutual-away-chip"
                      :class="{ active: mutualAwayClasses.includes(c) }"
                      @click="toggleMutualAwayClass(c)"
                    >{{ c }}</button>
                  </div>
                  <div v-if="mutualAwayCourseChips.length" class="mutual-away-chips mutual-chips-course" style="margin-top:6px;">
                    <button
                      v-for="chip in mutualAwayCourseChips"
                      :key="'away-course-' + chip.value"
                      type="button"
                      class="mutual-away-chip"
                      :class="{ active: mutualAwayClasses.includes(chip.value) }"
                      :title="'只停這一堂：' + chip.label"
                      @click="toggleMutualAwayClass(chip.value)"
                    >{{ chip.label }}</button>
                  </div>
                </div>

                <div class="mutual-step">
                  <div class="mutual-step-head">
                    <span class="mutual-step-no">3</span>帶隊老師
                    <span class="mutual-step-count">已選 {{ mutualLeadEmails.length }} 人</span>
                  </div>
                  <div class="flex-wrap-gap-6-mb4">
                    <button type="button" class="btn btn-secondary btn-xs" @click="mutualLeadEmails = []; persistMutualPanelDraft()">清空帶隊</button>
                  </div>
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

                <div class="form-group mb-8">
                  <label class="form-label mutual-note-label" title="會寫入本批每一筆申請">統一備註</label>
                  <input
                    type="text"
                    class="form-control mutual-note-input"
                    v-model="mutualNote"
                     placeholder="例：九年級畢旅 4/21～4/22"
                  >
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
                    勾選帶隊老師後計算需求與尚缺
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
                  <div v-else class="ui-caption">
                    需求＝期間內課表應代節（不含巡堂／外出班）；尚缺＝需求−已送出−暫定。
                  </div>
                  <details class="mutual-quota-note">
                    <summary>計費與額度規則</summary>
                    <div class="mutual-quota-note-body">
                      額度寫在「教師名單」，明細在試算表「額度帳本」。同活動不重複發放；扣額度 FIFO，帶隊不發放。早自習／1～7／午休釋出 1 節＝1 額度；代課（小鐘點）不發額度，未授課另扣。早自習／1～7／午休：餘額≥1→扣額度（扣 1），不足 1→活動公費。第8節不吃額度。
                    </div>
                  </details>
                  <label class="mutual-skip-label">
                    <input type="checkbox" v-model="mutualSkipNotify" class="chk-md">
                    <span>先不寄系統信，排完後用 LINE 手動通知（建議）</span>
                  </label>
                  <div v-if="mutualDrafts.length" class="mutual-drafts-block">
                    <div class="mutual-drafts-head">
                      <strong class="text-violet-deep">暫定安排 {{ mutualDrafts.length }} 節</strong>
                        <button v-if="!paperMode || isAdmin" type="button" class="btn btn-success mutual-btn-submit" :disabled="isSubmitting || loading || !mutualImportEventId" :title="!mutualImportEventId ? '請先選擇一個空堂事件' : ''" @click="submitAllMutualDrafts">
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
                <select
                  class="form-control"
                  style="width:auto;min-width:132px;padding:6px 10px;font-size:0.85rem;"
                  v-model="selectedCommunity"
                  title="社群（與科目分開篩選）"
                >
                  <option value="all">全部社群</option>
                  <option v-for="community in communitiesOptions()" :key="community" :value="community">{{ community }}</option>
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
                <button type="button" class="btn btn-secondary btn-this-week" @click="selectedWeekDate = toLocalDateStr(new Date())" title="跳回本週">本週</button>
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
                        
                        <!-- 每格只取一次 slot（cell+cls+draft+conflicts 已預先算好） -->
                        <template v-for="day in 5" :key="day">
                          <template v-for="slot in [((weekScheduleGrid[teacher.email] || {})[day + '-' + period] || null)]" :key="'s'+day+period">
                            <div 
                              class="grid-cell-class"
                              :data-tt-email="String(teacher.email || '').toLowerCase()"
                              :data-tt-day="day"
                              :data-tt-period="period"
                              :data-tt-date="currentWeekDates[day-1]"
                              :class="[getPeriodClass(period), (slot && slot.cls) || 'is-empty']"
                              :title="getCellPlainStatus(slot && slot.cell)"
                              @click="handleCellClick(teacher.email, day, period, currentWeekDates[day-1])"
                            >
                              <div v-if="slot && slot.conflicts && slot.conflicts.length" class="cell-conflict">
                                <button
                                  v-for="(cf, ci) in slot.conflicts"
                                  :key="'cf' + ci"
                                  type="button"
                                  class="cell-conflict-row"
                                  title="本節衝堂，點一下可進排課編輯調整"
                                  @click.stop="handleConflictSlotClick(teacher.email, day, period, currentWeekDates[day-1], cf)"
                                >
                                  <span class="cell-conflict-tag">衝堂</span>
                                  <span class="cell-conflict-text">{{ formatClassName(cf.className) || cf.className || '未填班級' }} · {{ cf.subject || '未填科目' }}</span>
                                </button>
                              </div>
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
                                  >{{ slot.cell.subType === 'exchange' ? '調出' : (slot.cell.isMutualCover ? '額度/外出' : '被代') }}</span>
                                  <span v-if="slot.cell.isSubstitutionDuty" class="cell-badge" :class="slot.cell.isEmptySlotAssign ? 'tag-purple' : (slot.cell.isMutualCover ? 'tag-purple' : 'tag-green')">
                                    {{ slot.cell.subType === 'exchange' ? '調入' : (slot.cell.isEmptySlotAssign ? '空堂任務' : (slot.cell.isMutualCover ? '額度' : '代課')) }}
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
                            </div>
                          </template>
                        </template>
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
        <PendingTabPanel v-if="user && activeTab === 'pending'" />

        <!-- ════════════════════════════════════
             §UI-2.4 Tab：歷史紀錄與列印
             ════════════════════════════════════ -->
        <RecordsTabPanel v-if="user && activeTab === 'records'" />

        <!-- ════════════════════════════════════
             §UI-2.5 Tab：後台管理與月底結算
             ════════════════════════════════════ -->
        <AdminTabPanel v-if="activeTab === 'admin' && isAdmin" />

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
      :mutual-event-id="mutualImportEventId"
      :mutual-event-quota-error="eventQuotaError"
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
      :subsidy-project-plans="subsidyProjectPlans"
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
      :set-print-preview-copy-kinds="setPrintPreviewCopyKinds"
      :is-print-preview-copy-kind-selected="isPrintPreviewCopyKindSelected"
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
      :communities-list="communitiesOptions()"
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
      :subject-options="classAwaySubjectOptions"
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
      :subsidy-project-plans="subsidyProjectPlans"
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
import { computed, defineAsyncComponent, getCurrentInstance, onMounted, watch } from 'vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import { showToast } from './ui/toast.js';
import LoginCard from './components/LoginCard.vue';
// 分頁內容（教師名單、班級課表）改成非同步：只在切到該頁時才抓 chunk，不佔首屏主包。
const PendingTabPanel = defineAsyncComponent(() => import('./components/PendingTabPanel.vue'));
const RecordsTabPanel = defineAsyncComponent(() => import('./components/RecordsTabPanel.vue'));
const AdminTabPanel = defineAsyncComponent(() => import('./components/AdminTabPanel.vue'));
const ClassPanel = defineAsyncComponent(() => import('./components/ClassPanel.vue'));
// modal 一律改非同步載入：不進首屏主包，掛載時才抓各自的 chunk。
// LoadingOverlay／LoginCard 為首屏必要，維持同步載入。
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
const { loginWithGoogle, setActiveTab, setProxyTarget } = sessionStore;
const { handleAvatarError, isClassAwayOnDate, schoolSwapWeekdayText, toLocalDateStr } = sessionStore;
const { activeAwayBanner, activeTab, allSchedules, avatarSrc, canViewAllTimetables, classAwayEvents, currentSemester, currentSemesterName, currentWeekNumber, gsiButtonError, gsiLoggingIn, homeroomRecordsLoading, isAdmin, isMobile, isStaff, loading, loadingMessage, proxyTargetQuery, schoolSwapForm, schoolSwapModalMode, schoolSwapSaving, searchQuery, selectedSubject, selectedWeekDate, semesterEndDate, semesterForm, semesterModalMode, semesterStartDate, semestersList, showMatchModal, showProxyTargetDropdown, showSchoolSwapModal, showSemesterModal, subsidyProjectPlans, teachersList, timetableDisplayMode, user } = storeToRefs(sessionStore);
// 社群篩選（與科目分開）：選項由教師名單的社群標籤聚合，不改動 subjectsList。
const { selectedCommunity } = storeToRefs(sessionStore);
const { parseTeacherCommunities } = sessionStore;
const communitiesOptions = () => {
  const set = new Set();
  (teachersList.value || []).forEach(t => {
    (typeof parseTeacherCommunities === 'function' ? parseTeacherCommunities(t.communities) : [])
      .forEach(c => set.add(c));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
};
const { changeMatchMode, getRealTeacherName, getTeacherTimetableHours, getTriangleGroupRequests, manualRefreshData, saveSemester } = dataStore;
const { changeWeek, clearProxyTarget, formatClassName, formatDateMMDD, formatExchangeClassSlot, formatQuickTodoTitle, getClassBadgeStyle, getLeaveTimePresetRange, getPeriodClass, getPeriodLabel, getPeriodTimeSpan, getSubjectStyle, getTeacherIdentityTooltip, getTeacherNameByEmail, getWeekDayText, selectClassForView, setCompareWeekSelection, shiftBatchCompareWeek, updatePendingLeaveTime } = dataStore;
const { batchCompareWeekIndex, batchCompareWeekSlotCount, batchCompareWeekTotal, compareDisplayDatesA, compareDisplayDatesB, dataRefreshing, dataUpdatedLabel, devTeacherQuery, directApproveMode, emptySlotForm, filteredDevTeachers, filteredProxyTeachers, filteredTeachers, historyEditForm, isCrossWeekExchange, isScheduleEditMode, proxyTargetName, showEmptySlotModal, showHistoryEditModal, softSyncing, subjectsList, userRoleText } = storeToRefs(dataStore);
const { addEventToCalendar, copyLineMessageForRequest, getClassAwayEventName, getClassCellClassForClass, getScheduleForDate, loadMoreTriangleCandidates, openTriangleTimetablePreview, saveSchoolSwap, selectTriangleCandidateB, selectTriangleCandidateC, triangleCandidateIsRestricted } = timetableStore;
const { changeTtPage, formatPeriodText, getExpensePlanSummary, isCombinedClass, isExpensePlanSlotConfig, timetablePeriods } = timetableStore;
const { accountingPlanOptions, adminTodoCount, currentWeekDates, displayTimetableTeachers, hasQuickTodo, homeroomTeachersList, isPeriod8FeeLocked, manualHomeroomForm, myInviteCount, quickTodoSentOpen, quotaDeductInsufficient, quotaDeductPreview, recommendedExchangeList, showManualHomeroomModal, teachersListDetails, ttNeedPager, ttPage, ttPageSize, ttTotalPages, visibleTimetableTeachers } = storeToRefs(timetableStore);
const { closeMatchModal, getMatchSlotDateMMDD, loadMoreMatches, setBatchExchangePreviewSlot } = matchStore;
const { batchCompareSubGroups, batchCompareViewEmail, batchExchangePreviewSlotKey, compareWeekSelectionA, compareWeekSelectionB, displayedExchangeList, displayedRecommendedTeachers, eventQuotaError, filteredExchangeList, filteredRecommendedTeachers, hasSubTeacherConflict, personalChanges, quotaFifoPackageId, quotaPackError, quotaPackLoading, quotaPackOptions } = storeToRefs(matchStore);
const { assignBatchSlotSub, clearBatchSlotSub, clearBatchSlots, closeCompareModal, executeBatchSubmit, executeSubmitRequest, getCompareCellClass, getCompareCellText, getExchangeEndpointText, openBatchMatch, prepBatchCompare, prepBatchExchangeCompare, prepBatchPerSlotCompare, prepCompare, previewBatchCandidate, resolveCompareBEmail, selectBatchSlotForMatch, sendLineBatchPart, setBatchAssignMode, setBatchCompareViewEmail, setBatchFlowMode, setLeaveTimePreset, toggleBatchSelectMode, toggleCourseAdjustmentOnly } = submitStore;

const { batchAllSlotsAssigned, batchAssignedCount, canStaffProxySubmit, compareWeekDatesA, compareWeekDatesB, isBatchExchangeFlow, isBatchMatchFlow, isBatchPerSlotMode, isProxySubmitActive, notificationsSuppressed, paperFlow, paperMode } = storeToRefs(submitStore);
const { adminApprove, adminReject, cancelRequest, deleteSubstitutionRecord, dismissBatchPrintPrompt, executeEmptySlotAssign, getRequestProgressSteps, isPaperFlowRequest, printLastBatchNotices, respondToBatch, respondToRequest, startCombinedReturn, submitTriangleRequest } = requestsStore;
const { lastBatchPrintIds, showBatchPrintPrompt } = storeToRefs(requestsStore);



/** 套用歷史紀錄的明確日期區間（起日大於迄日時自動對調）。 */


/** 點衝堂列：先提示撞到哪一筆，教學組可直接進排課編輯調整。 */
const handleConflictSlotClick = (teacherEmail, day, period, dateStr, conflict) => {
  const cf = conflict || {};
  const clsName = formatClassName(cf.className) || cf.className || '未填班級';
  const subject = cf.subject || '未填科目';
  const teacherName = getTeacherNameByEmail(teacherEmail) || teacherEmail;
  showToast(`本節衝堂：${teacherName} 同時排在 ${clsName} · ${subject}，請調整排課`, 'warning');
  if (isAdmin && isAdmin.value && openScheduleEditModal) {
    openScheduleEditModal(teacherEmail, day, period);
  }
};
// 類型標籤（三角調／調課／空堂任務／代課）集中在 ui-list-helpers，這裡只取用。

const { classAwayPeriodLabel, classAwayPeriodOptions, clearClassAwayPeriods, devSwitchUser, isClassAwayFormClassSelected, isClassAwayPeriodSelected, logout, onLeaveReasonChange, openEmptySlotFromDetail, openManualQuotaAdjust, previewMutualDraft, restoreAdmin, saveClassAwayEvent, saveManualQuotaAdjust, selectClassAwayGrade, selectClassAwayPeriodRange, setClassAwayPeriodBoundary, setClassAwayPeriodMode, submitAllMutualDrafts, toggleClassAwayFormClass, toggleClassAwayPeriod, toggleMutualCover } = backofficeStore;
const { closeEmptySlotModal, closeSuccessGoPending, closeSuccessGoRecords, closeSuccessStayTimetable } = backofficeStore;
const { classAwayForm, classAwayModalMode, isSimulating, showClassAwayModal } = storeToRefs(backofficeStore);
const { clearScheduleCell, fillFixedOvertimeFromCurrentSchedule, handleTeacherExcelChange, importTeachersBatch, normalizeScheduleFormFlags, normalizeTeacherExpenseData, onHistoryEditDateChange, onHistoryEditPeriodChange, onHistoryEditReasonChange, onHistoryEditTypeChange, openExceptionComposer, openOvertimePlanModal, openScheduleEditModal, pickScheduleAttr, runTeacherImportPreview, saveHistoryEdit, saveOvertimePlan, saveScheduleCell, saveTeacher, submitAdminException } = adminStore;
const { closeManualQuotaAdjust, closeQuotaLedger, getOvertimeExpenseSourceOptions, getScheduleAttrLabel, leaveReasonOptions, quotaTypeClass } = adminStore;
const { emptySlotQuotaZero, overtimePlanPeriodEnd, overtimePlanRows, overtimePlanTeacher, overtimePlanUsesFixedSlots, quotaAdjustForm, quotaAdjustPreview, quotaAdjustSaving, quotaLedgerLoading, quotaLedgerRows, quotaLedgerTeacher, scheduleForm, showExceptionComposer, showImportTeachersModal, showOvertimePlanModal, showQuotaAdjustModal, showQuotaLedgerModal, showScheduleEditModal, showTeacherExpenseAuditModal, showTeacherModal, teacherExcelData, teacherExcelHeaders, teacherExpenseAuditRows, teacherExpenseAuditSummary, teacherForm, teacherImportPreview, teacherMappingFields, teacherModalMode } = storeToRefs(adminStore);
const { addSuccessToCalendar, closePrintPreview, confirmPrintPreview, copyPrintPreviewImage, downloadPrintPreviewImage, openPaperPrintForRequest, openPaperPrintMutualDrafts, openSuccessPrintPreview, openTrianglePaperPreview, printSingleRequest } = outputStore;
const { openPaperPrintDraftFromCompare, isPrintPreviewCopyKindSelected, setPrintPreviewCopyKinds } = outputStore;
const { displayedTriangleBOptions, displayedTriangleCOptions, triangleCandidateB, triangleCandidateBOptions, triangleCandidateBReadyCount, triangleCandidateCOptions, triangleCandidateCReadyCount, triangleCandidateDisplayCount, triangleCandidateSearch, trianglePreviewRows, trianglePreviewWeekDates, triangleReady, triangleTimetablePreview, triangleValidation, weekScheduleGrid } = storeToRefs(outputStore);
const { copyClassReadonlyLink, handleCellClick, handleClassCellClick, jumpToTeacherTimetable, showDetailForRecord, startSecondSub } = interactionStore;
const { changeClassWeek, goToClassThisWeek, isMatchHoverEntry, isMatchSourceEntry } = interactionStore;
const { canStartSecondSubFromDetail, classSchedules, classViewerReadonly } = storeToRefs(interactionStore);
const { isHomeroomTeacher, onManualCoverTeacherInput, onManualHomeroomLeaveTeacherChange, saveManualHomeroomRecord, switchQuotaDeductToSelfPay } = homeroomStore;
const { applyClassAwayEventById, assignMutualDraftFromMatch, clearMutualDrafts, clearMutualPanel, isMutualLead, persistMutualPanelDraft, recalculateMutualQuotasFromActivity, removeMutualDraft, selectAwayGrade, toggleMutualAwayClass } = mutualStore;
const { copyEditedLineMessage, copyLineBatchPart, copyLineMessage, exchangeWeekdayOptions, getClassChangeTypeLabel, getOriginalRequestClass, getOriginalRequestSubject, getOriginalTargetClass, getOriginalTargetSubject, onMutualLeadChipClick, sendEditedLineMessage, sendLineMessage, setExchangeWeekdayFilter } = mutualStore;
const { askFirstLineDraft, askFirstLineText, classChangeSummary, classList, classReadonlyMode, classSubstitutionMap, classWeekNumber, consecAlertsA, consecAlertsB, detailRequest, detailSubRecord, exchangeWeekOffset, exchangeWeekdayFilter, hasLineTemplate, isSubmitting, lineBatchParts, lineCopyText, lineMessageText, lineMessageTitle, matchEmptyReasons, matchSearchQuery, matchShowNoTeacherWarning, mutualCoverStats, mutualImportEventId, mutualImportableEvents, pendingRequestData, printPreview, printPreviewImageBusy, selectedClass, selectedClassWeekDates, showCompareModal, showDetailModal, showDevDropdown, showLineMessageModal, showPrintPreviewModal, showSuccessModal, showTriangleTimetablePreview, successActionRequests, successFlowMode, successModalMessage, successModalTitle } = storeToRefs(mutualStore);
const { activeCell, batchActiveSlotKey, batchAssignMode, batchFlowMode, batchSelectMode, batchSlots, directApproveSkipNotify, inputRequestDate, isMutualCover, matchMode, mutualActivityStart, mutualAwayClasses, mutualDrafts, mutualLeadEmails, mutualNote, mutualSkipNotify, myPendingRequests, recommendationLoading, recommendedTeachers, triangleNote, trianglePickB, trianglePickC, triangleReason, triangleSubmitting } = storeToRefs(tourStore);

// 空堂事件「科目」選項：直接取課表科目，避免打錯字
const classAwaySubjectOptions = computed(() => {
  const set = new Set();
  (allSchedules.value || []).forEach((s) => {
    const subject = String(s.subject || '').trim();
    if (subject && subject !== '巡堂') set.add(subject);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
});

// 活動互代：科目型空堂以「課堂」出現一顆 chip（802、805、806 本土語-台語）
// 一個事件可能含多條規則（規則清單），逐條取科目條件與範圍。
const mutualAwayCourseChips = computed(() => {
  if (!isMutualCover.value) return [];
  const events = (classAwayEvents.value || []).filter((ev) => ev && ev.enabled !== false && ev.forMutual);
  if (!events.length) return [];
  const out = [];
  const seen = new Set();
  events.forEach((ev) => {
    const rules = (Array.isArray(ev.rules) && ev.rules.length)
      ? ev.rules
      : [{ scope: ev.scope, classes: ev.classes || [], subjects: ev.subjects || [] }];
    rules.forEach((rule) => {
      const subjects = (rule && Array.isArray(rule.subjects)) ? rule.subjects : [];
      if (!subjects.length) return;
      const ruleClasses = (rule.scope === 'all' ? [] : (rule.classes || []))
        .map((c) => String(c || '').trim()).filter(Boolean);
      (allSchedules.value || []).forEach((s) => {
        const subject = String(s.subject || '').trim();
        if (!subject) return;
        if (!subjects.some((w) => subject === w || subject.indexOf(w) >= 0)) return;
        const tokens = String(s.className || '').split(/[,，、/／\s]+/).map((x) => x.trim()).filter(Boolean);
        if (!tokens.length) return;
        if (ruleClasses.length && !tokens.some((t) => ruleClasses.indexOf(t) >= 0)) return;
        const value = tokens.join('、') + '::' + subject;
        if (seen.has(value)) return;
        seen.add(value);
        out.push({ value: value, label: tokens.join('、') + ' ' + subject });
      });
    });
  });
  return out.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
});
const { PERIOD8_FEE, TIMETABLE_ONLY_FEE } = tourStore;
const { startOnboarding } = tourStore;
const { formatLeaveClassSlot, formatTriangleSlot, getCellPlainStatus, getRequestTypeTags, hasScheduleSpecialTag, isTimetablePullout, isTimetableRestricted } = UiLineTemplate;
const { getStatusText } = UiListHelpers;
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
