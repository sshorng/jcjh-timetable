/**
 * 自 v1 ui-style.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */

/**
 * ui-style.js — 科目／班級配色（從 app.js 抽出，2A）
 *
 * Eager 載入（模板綁定，需先於 app.js）。零依賴純函式。
 *
 * 對外 API 不變：
 * UiStyle.{ SUBJECT_COLOR_GROUPS, normalizeSubjectColorName, getSubjectStyle, getClassBadgeStyle }
 */
const UiStyle = (() => {
  'use strict';

  // 100% 複製排課系統 (scheduling-system) 的 11 大領域官方色票
  var SUBJECT_COLOR_GROUPS = [
    { key: 'chinese', label: '國文', aliases: ['國文', '國語文', '國語'], color: { bg: '#dbeafe', text: '#1e3a8a' } },
    { key: 'english', label: '英語', aliases: ['英語', '英文', '英語文'], color: { bg: '#dcfce7', text: '#166534' } },
    { key: 'local', label: '本土語', aliases: ['本土語', '本土語文', '閩南語', '台語', '臺語', '客語', '原住民族語', '族語'], color: { bg: '#ccfbf1', text: '#115e59' } },
    { key: 'math', label: '數學', aliases: ['數學'], color: { bg: '#fef3c7', text: '#92400e' } },
    { key: 'science', label: '自然、理化、生物', aliases: ['自然', '自然科', '自然科學', '理化', '物理', '化學', '生物', '地球科學'], color: { bg: '#e0f2fe', text: '#075985' } },
    { key: 'social', label: '地理、歷史、公民', aliases: ['地理', '歷史', '公民', '公民與社會', '社會'], color: { bg: '#ede9fe', text: '#5b21b6' } },
    { key: 'health', label: '體育、健康教育', aliases: ['體育', '健康教育', '健康與體育', '健康'], color: { bg: '#ffedd5', text: '#9a3412' } },
    { key: 'comprehensive', label: '家政、童軍、輔導', aliases: ['家政', '童軍', '輔導', '課輔', '綜合活動', '綜合'], color: { bg: '#fce7f3', text: '#9d174d' } },
    { key: 'technology', label: '生活科技、資訊科技', aliases: ['生活科技', '資訊科技', '資訊', '電腦', '科技'], color: { bg: '#e0e7ff', text: '#3730a3' } },
    { key: 'arts', label: '表演藝術、視覺藝術、音樂', aliases: ['表演藝術', '視覺藝術', '音樂', '藝術', '視覺藝'], color: { bg: '#fae8ff', text: '#86198f' } },
    { key: 'other', label: '其他彈性課程', aliases: ['其他彈性課程', '彈性課程', '彈性', '班週會', '週會', '班會', '社團', '閱讀', '閱讀課', '校訂課程'], color: { bg: '#f1f5f9', text: '#475569' } }
  ];

  function normalizeSubjectColorName(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/[（(]輔[）)]/gi, '');
  }

  function getSubjectStyle(subCode) {
    if (!subCode) return {};
    const normalized = normalizeSubjectColorName(subCode);
    const group = SUBJECT_COLOR_GROUPS.find(g => g.aliases.some(alias => {
      const candidate = normalizeSubjectColorName(alias);
      return normalized === candidate || normalized.startsWith(candidate);
    })) || SUBJECT_COLOR_GROUPS.find(g => g.key === 'other');

    return {
      backgroundColor: group.color.bg,
      color: group.color.text,
      border: 'none'
    };
  }

  function getClassBadgeStyle(className) {
    if (!className) return {};
    const cleanCls = String(className).trim();
    let hash = 0;
    for (let i = 0; i < cleanCls.length; i++) {
      hash = cleanCls.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % SUBJECT_COLOR_GROUPS.length;
    const group = SUBJECT_COLOR_GROUPS[idx];
    return {
      backgroundColor: group.color.bg,
      color: group.color.text,
      border: 'none'
    };
  }

  return {
    SUBJECT_COLOR_GROUPS: SUBJECT_COLOR_GROUPS,
    normalizeSubjectColorName: normalizeSubjectColorName,
    getSubjectStyle: getSubjectStyle,
    getClassBadgeStyle: getClassBadgeStyle
  };
})();

export { UiStyle };
