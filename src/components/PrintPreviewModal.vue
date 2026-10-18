<template>
       <div class="modal-overlay print-preview-overlay" data-tour="print-preview-modal" @click.self="closePrintPreview(true)">
         <div class="modal-card print-preview-modal-card">
          <div class="modal-header">
           <div class="print-preview-title-row">
             <h3>👁️ 調代課單列印預覽</h3>
             <div v-if="printPreview" class="print-preview-meta">
               {{ printPreview.recordCount }} 筆 · 教學組／教師 {{ printPreview.staffFormCount }} 組 · 班級 {{ printPreview.classCopyCount }} 張 · 列印 {{ printPreview.pageCount }} 頁 · 共分送 {{ printPreview.copyCount }} 張
             </div>
           </div>
            <button class="btn-close" @click="closePrintPreview(true)">&times;</button>
          </div>
           <div class="modal-body print-preview-modal-body">
             <iframe
              v-if="printPreview"
              class="print-preview-frame"
              :srcdoc="printPreview.documentHtml"
              title="調代課單單欄列印預覽"
              sandbox="allow-scripts"
            ></iframe>
          </div>
         <div class="modal-footer print-preview-modal-footer">
            <div class="print-preview-footer-left">
              <div v-if="printPreview && printPreview.canPrint !== false" class="print-preview-image-actions">
                  <button type="button" class="btn btn-secondary" title="複製單頁確認版，不影響正式列印份數" :disabled="printPreviewImageBusy" @click="copyPrintPreviewImage">
                   {{ printPreviewImageBusy ? '處理中…' : '複製單頁' }}
                 </button>
                  <button type="button" class="btn btn-secondary" title="下載單頁確認版，不影響正式列印份數" :disabled="printPreviewImageBusy" @click="downloadPrintPreviewImage">下載單頁</button>
              </div>
              <!-- 要印的聯別：可複選下拉，緊鄰「下載單頁」；點面板外或按 Esc 收合。 -->
              <div v-if="printPreview" ref="kindMenuRoot" class="print-preview-kind-select">
                <button
                  type="button"
                  class="btn btn-secondary print-preview-kind-toggle"
                  :disabled="printPreview.canPrint === false"
                  aria-haspopup="true"
                  :aria-expanded="kindMenuOpen ? 'true' : 'false'"
                  title="選擇要印出的聯別（可複選）"
                  @click="toggleKindMenu"
                >
                  要印的聯別：{{ kindSelectionText }} ▾
                </button>
                <div v-show="kindMenuOpen" class="print-preview-kind-bar" role="group" aria-label="要印的聯別">
                  <label v-for="option in printPreview.copyKindOptions || []" :key="option.kind" class="print-preview-kind-chip">
                    <input
                      type="checkbox"
                      :value="option.kind"
                      :checked="isPrintPreviewCopyKindSelected(option.kind)"
                      :disabled="printPreview.canPrint === false"
                      @change="onTogglePrintCopyKind(option.kind)"
                    >
                    <span>{{ option.label }}（{{ option.count }}）</span>
                  </label>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm-tight"
                    :disabled="printPreview.canPrint === false"
                    @click="onTogglePrintCopyKind('__all__')"
                  >全選</button>
                </div>
              </div>
            </div>
            <div class="print-preview-confirm-actions">
              <button type="button" class="btn btn-secondary" @click="closePrintPreview(true)">返回</button>
               <div v-if="printPreview && printPreview.canPrint === false" class="print-preview-lock-note">
                 目前為送出前預覽，只能查看內容；送出申請成功後才能列印、下載或複製調代課單。
               </div>
                <button v-if="printPreview && printPreview.canPrint !== false" type="button" class="btn btn-primary" data-tour="print-confirm" @click="confirmPrintPreview">🖨️ 確認列印</button>
            </div>
         </div>
        </div>
      </div>
</template>

<!-- 列印預覽 modal（自 App.vue 抽出，其餘 props 注入） -->
<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps({
  printPreview: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  printPreviewImageBusy: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  closePrintPreview: { type: Function, required: true },
  copyPrintPreviewImage: { type: Function, required: true },
  downloadPrintPreviewImage: { type: Function, required: true },
  confirmPrintPreview: { type: Function, required: true },
  setPrintPreviewCopyKinds: { type: Function, required: true },
  isPrintPreviewCopyKindSelected: { type: Function, default: () => true },
});
defineEmits(['close']);

const allKinds = computed(() => (props.printPreview && props.printPreview.copyKindOptions || [])
  .map(option => option.kind));

// 目前勾選的聯別。copyKinds 為空陣列在資料層代表「四種聯全印」，
// 這裡必須展開成完整清單，否則取消勾選會被誤判成「加入」而把狀態倒轉。
const selectedKinds = computed(() => {
  const list = props.printPreview && props.printPreview.copyKinds;
  if (!Array.isArray(list) || !list.filter(Boolean).length) return allKinds.value;
  return list.filter(Boolean);
});

/** 切換單一聯；傳 '__all__' 為全選。至少要留一聯，避免印出空白。 */
const onTogglePrintCopyKind = (kind) => {
  const all = allKinds.value;
  if (!all.length) return;
  if (kind === '__all__') {
    props.setPrintPreviewCopyKinds(all);
    return;
  }
  const current = selectedKinds.value;
  const next = current.includes(kind)
    ? current.filter(item => item !== kind)
    : all.filter(item => item === kind || current.includes(item));
  // 最後一聯不可取消，否則會印出空白。
  props.setPrintPreviewCopyKinds(next.length ? next : [kind]);
};
// 要印的聯別改為頁尾可複選下拉：面板預設收合，點面板外或按 Esc 收合。
const kindMenuOpen = ref(false);
const kindMenuRoot = ref(null);
let kindMenuDismissHandlers = null;

/** 觸發鈕摘要：全選顯示「全部（N 種）」，部分勾選顯示「M／N 種」。 */
const kindSelectionText = computed(() => {
  const all = allKinds.value;
  if (!all.length) return '無聯別';
  const picked = all.filter(kind => selectedKinds.value.indexOf(kind) >= 0);
  if (picked.length >= all.length) return '全部（' + all.length + ' 種）';
  return picked.length + '／' + all.length + ' 種';
});

/** 收合下拉，並解除外部點擊／Esc 監聽。 */
const closeKindMenu = () => {
  kindMenuOpen.value = false;
  if (!kindMenuDismissHandlers) return;
  document.removeEventListener('mousedown', kindMenuDismissHandlers.pointer, true);
  window.removeEventListener('keydown', kindMenuDismissHandlers.key, true);
  kindMenuDismissHandlers = null;
};

/**
 * 開合下拉；開啟時才掛監聽。
 * Esc 掛在 window 攔截階段，比 modal 的 Esc 關閉（掛在 document）更早攔到，
 * 只收合下拉，不會順手把整個預覽視窗關掉。
 */
const toggleKindMenu = () => {
  if (kindMenuOpen.value) {
    closeKindMenu();
    return;
  }
  const pointer = (event) => {
    const root = kindMenuRoot.value;
    if (root && event.target && root.contains(event.target)) return;
    closeKindMenu();
  };
  const key = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeKindMenu();
  };
  kindMenuOpen.value = true;
  kindMenuDismissHandlers = { pointer, key };
  document.addEventListener('mousedown', pointer, true);
  window.addEventListener('keydown', key, true);
};

onBeforeUnmount(closeKindMenu);

</script>
