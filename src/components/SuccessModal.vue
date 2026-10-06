<template>
      <div class="modal-overlay" data-tour="success-modal" @click.self="$emit('close')">
        <div class="modal-card" style="max-width: 500px;" data-tour="success-card">
          <div class="modal-header">
            <h3 class="text-success">{{ successModalTitle }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          
          <div class="modal-body">
            <p style="font-size: 0.9rem; color: var(--text-primary); margin-bottom: 12px; font-weight: 500; line-height: 1.5;">
              {{ successModalMessage }}
            </p>

            <!-- 固定流程說明：依送出類型顯示不同後續 -->
            <div class="success-flow" data-tour="success-flow">
              <!-- 教學組直接核准 -->
              <template v-if="successFlowMode === 'direct'">
                <div class="success-flow-title">目前狀態</div>
                <ol class="success-flow-steps">
                  <li class="is-done"><span class="sf-n">1</span><span class="sf-t">已直接出單</span></li>
                  <li class="is-done"><span class="sf-n">2</span><span class="sf-t">課表已正式變更</span></li>
                </ol>
                 <p class="success-flow-note">若需通知相關教師，可直接用下方按鈕預覽／列印、加入日曆，或到歷史紀錄查看。</p>
              </template>
              <!-- 行政代申請：跳過受邀確認，直接等教學組 -->
              <template v-else-if="successFlowMode === 'proxy'">
                <div class="success-flow-title">接下來怎麼辦</div>
                <ol class="success-flow-steps">
                  <li class="is-done"><span class="sf-n">1</span><span class="sf-t">已代送申請（跳過受邀確認）</span></li>
                  <li class="is-current"><span class="sf-n">2</span><span class="sf-t">等教學組在「待辦」核准或退回</span></li>
                  <li><span class="sf-n">3</span><span class="sf-t">教學組出單後，課表才正式變更</span></li>
                </ol>
                <p class="success-flow-note">不需等代課／調課對方同意。教學組退回 → 不生效。進度可在「待辦／歷史」查看。</p>
              </template>
              <!-- 一般教師送出 -->
              <template v-else>
                <div class="success-flow-title">接下來怎麼辦</div>
                <ol class="success-flow-steps">
                  <li class="is-done"><span class="sf-n">1</span><span class="sf-t">已送出申請（可用 LINE 再通知對方）</span></li>
                  <li class="is-current"><span class="sf-n">2</span><span class="sf-t">等對方在「待辦」同意或拒絕</span></li>
                  <li><span class="sf-n">3</span><span class="sf-t">等教學組出單後，課表才正式變更</span></li>
                </ol>
                <p class="success-flow-note">對方拒絕、行政退回或您撤回 → 不生效。進度可在「待辦／歷史」查看。</p>
              </template>
            </div>
            
            <!-- LINE 訊息範本：標題與複製／傳送同排 -->
            <div v-if="hasLineTemplate" data-tour="line-template" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-top: 12px;">
              <!-- 多位代課老師：分卡顯示 -->
              <div v-if="lineBatchParts && lineBatchParts.length > 1" style="display:flex;flex-direction:column;gap:12px;">
                <div style="font-weight: 600; color: #15803d; font-size: 0.85rem;">
                  💬 LINE 邀請訊息範本
                </div>
                <div
                  v-for="(part, idx) in lineBatchParts"
                  :key="'lp-'+idx"
                  style="background:#fff;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;"
                >
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                    <span style="font-weight:700;color:#166534;font-size:0.85rem;">
                      🏷️ 給 {{ part.name }} 老師（{{ part.count }} 節）
                    </span>
                    <div class="flex-gap-6-shrink">
                      <button type="button" class="btn btn-secondary btn-sm-75" @click="copyLineBatchPart(idx)">📋 複製</button>
                      <button type="button" class="btn btn-success" style="padding:4px 10px;font-size:0.75rem;background:#06c755;border-color:#05b04b;" @click="sendLineBatchPart(idx)">💬 LINE 傳送</button>
                    </div>
                  </div>
                  <textarea
                     class="form-input"
                    rows="6"
                    style="width:100%;font-family:monospace;font-size:0.78rem;background:#f8fafc;border:1px solid #d1fae5;border-radius:6px;padding:8px;resize:none;line-height:1.4;"
                     v-model="part.text"
                    @focus="$event.target.select()"
                  ></textarea>
                </div>
                <span style="font-size:0.72rem;color:#166534;line-height:1.4;">
                  * 每位老師一段，請分開複製／傳 LINE，避免內容混在一起。
                </span>
              </div>

              <!-- 單一受邀人：標題＋複製＋LINE 同一排 -->
              <div v-else>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                  <span style="font-weight: 600; color: #15803d; font-size: 0.85rem; white-space:nowrap;">
                    💬 LINE 邀請訊息範本
                  </span>
                  <div data-tour="line-actions" class="flex-gap-6-shrink">
                    <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:0.75rem;line-height:1.2;" @click="copyLineMessage()">
                      📋 複製
                    </button>
                    <button type="button" class="btn btn-success" style="padding:4px 10px;font-size:0.75rem;line-height:1.2;background:#06c755;border-color:#05b04b;" @click="sendLineMessage()">
                      💬 LINE 傳送
                    </button>
                  </div>
                </div>
                <textarea
                   class="form-input"
                  rows="10"
                  style="width: 100%; font-family: monospace; font-size: 0.8rem; background: #fff; border: 1px solid #d1fae5; border-radius: 6px; padding: 8px; resize: none; line-height: 1.4;"
                   v-model="lineCopyText"
                  @focus="$event.target.select()"
                ></textarea>
                <span style="font-size: 0.72rem; color: #166534; display: block; margin-top: 6px; line-height: 1.4;">
                  * 可複製後用 LINE 傳給對方老師，加快簽核。
                </span>
              </div>
            </div>
          </div>
          
          <div class="modal-footer success-modal-footer">
            <div
              v-if="successFlowMode === 'direct' && successActionRequests && successActionRequests.length"
              class="success-followup-actions"
              data-tour="success-followup-actions"
            >
              <button
                type="button"
                class="btn btn-primary"
                title="先預覽單欄內容，再依原版格式列印"
                @click="openSuccessPrintPreview"
              >🖨️ 預覽／列印</button>
              <button
                v-if="successActionRequests.length === 1"
                type="button"
                class="btn btn-secondary"
                title="依您的角色加入不用上課或代課行程"
                @click="addSuccessToCalendar"
              >📅 加入日曆</button>
            </div>
            <div class="success-actions">
              <button v-if="successFlowMode === 'direct'" class="btn btn-secondary" @click="closeSuccessGoRecords">
                📚 看歷史紀錄
              </button>
              <button v-else class="btn btn-primary" @click="closeSuccessGoPending">
                📋 看我的申請
              </button>
              <button class="btn btn-secondary" @click="closeSuccessStayTimetable">
                ➕ 再申請一筆
              </button>
            </div>
          </div>
        </div>
      </div>
</template>

<!-- 送出成功＋LINE 傳送 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  successModalTitle: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  successModalMessage: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  successFlowMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  hasLineTemplate: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  successActionRequests: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  copyLineBatchPart: { type: Function, required: true },
  sendLineBatchPart: { type: Function, required: true },
  copyLineMessage: { type: Function, required: true },
  sendLineMessage: { type: Function, required: true },
  openSuccessPrintPreview: { type: Function, required: true },
  addSuccessToCalendar: { type: Function, required: true },
  closeSuccessGoRecords: { type: Function, required: true },
  closeSuccessGoPending: { type: Function, required: true },
  closeSuccessStayTimetable: { type: Function, required: true },
});
defineEmits(['close']);
const lineBatchParts = defineModel('lineBatchParts');
const lineCopyText = defineModel('lineCopyText');
</script>
