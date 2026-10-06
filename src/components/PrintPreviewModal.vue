<template>
       <div class="modal-overlay print-preview-overlay" data-tour="print-preview-modal" @click.self="closePrintPreview(true)">
         <div class="modal-card print-preview-modal-card">
          <div class="modal-header">
            <div>
              <h3>👁️ 調代課單列印預覽</h3>
              <div v-if="printPreview" class="print-preview-meta">
                 共 {{ printPreview.recordCount }} 筆；教學組／教師合併為 {{ printPreview.staffFormCount }} 組，班級分送 {{ printPreview.classCopyCount }} 張；正式列印 {{ printPreview.pageCount }} 頁，共 {{ printPreview.copyCount }} 張分送單據。
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
             <div v-if="printPreview && printPreview.canPrint !== false" class="print-preview-image-actions">
                 <button type="button" class="btn btn-secondary" title="複製單頁確認版，不影響正式列印份數" :disabled="printPreviewImageBusy" @click="copyPrintPreviewImage">
                  {{ printPreviewImageBusy ? '處理中…' : '複製單頁' }}
                </button>
                 <button type="button" class="btn btn-secondary" title="下載單頁確認版，不影響正式列印份數" :disabled="printPreviewImageBusy" @click="downloadPrintPreviewImage">下載單頁</button>
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
defineProps({
  printPreview: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  printPreviewImageBusy: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  closePrintPreview: { type: Function, required: true },
  copyPrintPreviewImage: { type: Function, required: true },
  downloadPrintPreviewImage: { type: Function, required: true },
  confirmPrintPreview: { type: Function, required: true },
});
defineEmits(['close']);
</script>
