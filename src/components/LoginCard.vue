<template>
  <!-- §UI-1 登入畫面（自 App.vue 抽出；純展示，登入流程仍由 login 事件委派） -->
  <div class="login-container">
    <div class="login-card">
      <div class="app-logo">🏫</div>
      <h1 class="login-title">建成國中線上課表系統</h1>
      <p class="login-subtitle">請使用學校 Google 帳號登入系統，<br>即可線上發起調代課並查看每週課表狀況。</p>
      <div class="login-gsi-wrap">
        <!-- 外觀比照官方 GSI；流程用 OAuth prompt=select_account，才能每次強制選帳 -->
        <button
          type="button"
          class="btn-google btn-google-official"
          :disabled="gsiLoggingIn"
          @click="$emit('login')"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="18" height="18">
          <span>{{ gsiLoggingIn ? '正在前往 Google…' : '使用 Google 帳號登入' }}</span>
        </button>
        <p v-if="gsiButtonError" class="login-gsi-status">{{ gsiButtonError }}</p>
      </div>

      <p class="domain-hint">
        * 注意：本系統僅限本校 G Workspace 網域帳號登入。<br>非本校網域帳號將無法通過身分驗證。
      </p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  gsiLoggingIn: { type: Boolean, default: false },
  gsiButtonError: { type: String, default: '' }
});
defineEmits(['login']);
</script>
