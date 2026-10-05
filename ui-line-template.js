/**
 * ui-line-template.js — LINE 邀請／詢問模板純函式（從 app.js 抽出，2A）
 *
 * Eager 載入（app.js setup 期即解構，需排在 app.js 之前；唯一外部依賴 window.DateUtils，
 * date-utils.js 為首屏 defer，恆先於此檔執行）。
 * 純字串組裝，無 Vue refs，可被 Node/vm 測試直接驗證。
 *
 * 對外 API 不變：
 * UiLineTemplate.{ formatLineSlot, cleanLineTeacherName, getLineExchangePartner,
 *   buildLineInviteText, shortTeacherName, getLineHandledSlot,
 *   buildAskFirstLineText, buildLineBatchInviteText }
 */
window.UiLineTemplate = (function () {
  'use strict';

  function formatDateMMDD(value) { return window.DateUtils.formatDateMMDD(value); }
  function formatPeriodText(p) {
    return (window.DateUtils && window.DateUtils.formatPeriodText)
      ? window.DateUtils.formatPeriodText(p)
      : (Number(p) === 0 ? '早自習' : (Number(p) === 45 ? '午休' : ('第' + p + '節')));
  }
  function getWeekDayText(d) { return window.DateUtils.getWeekDayText(d); }

  // —— 以下為 2A 第二批：節次／課程顯示文字（自 app.js verbatim 搬移） ——
  // 經費判定一律走 FeeUtils（eager 常駐；與 app.js 內包裝語義等價，見 FeeUtils 註解）

  function isCombinedReturnRequest(request) {
    if (window.FieldMap && typeof window.FieldMap.isCombinedReturn === 'function') {
      return window.FieldMap.isCombinedReturn(request);
    }
    let raw = request && request.specialFlow;
    if (String(raw == null ? '' : raw).trim() === '') raw = request && request['特殊流程'];
    const value = String(raw == null ? '' : raw).trim().toLowerCase();
    return value === 'combined_return' || value === '合班回原班';
  }

  function getRequestTypeTags(req) {
    if (!req) return [];
    const tags = [];
    const FeeUtils = window.FeeUtils;
    if (isCombinedReturnRequest(req)) {
       tags.push({ key: 'combined-return', label: '併班上課' });
    }
    const period = parseInt(req.requestPeriod != null ? req.requestPeriod : req.period, 10);
    // 代申請已在申請人欄下方標示，不再加 Tag
     const requestFee = req.subFee || req['經費來源'];
     if (req.type !== 'exchange' && FeeUtils.isTimetableOnlyFee(requestFee)) {
      tags.push({ key: 'timetable-only', label: '僅課表呈現' });
     } else if (req.type !== 'exchange' && FeeUtils.isQuotaDeductFee(requestFee)) {
      tags.push({ key: 'quota', label: '扣額度' });
     } else if (req.type !== 'exchange' && requestFee === FeeUtils.ACTIVITY_PUBLIC) {
      tags.push({ key: 'actpub', label: '活動公費' });
     } else if (req.type !== 'exchange' && (requestFee === '公費代課' || requestFee === '學校移撥' || requestFee === '活動公費')) {
      tags.push({ key: 'public', label: '公費' });
    }
    if (period === 8) tags.push({ key: 'p8', label: '第8節' });
    return tags;
  }

  // 相容舊呼叫（快速待辦等）
  function getRequestRiskTags(req) { return getRequestTypeTags(req); }

  // 歷史紀錄列 → 請假課堂字串
  function formatCourseDisplayText(className, subject, teacherName) {
    const course = [className, subject].filter(value => String(value || '').trim()).join('');
    const teacher = String(teacherName || '').replace(/\s*老師\s*$/, '').trim();
    return course + (teacher ? `（${teacher}老師）` : '');
  }

  function _fmtSlot(dateStr, day, period, clsSubj) {
    const m = dateStr && dateStr !== '—' && dateStr.length >= 10 ? dateStr.slice(5, 10).replace('-', '/') : (dateStr || '—');
    const rawDay = String(day == null ? '' : day).trim();
    const dayText = /^\d+$/.test(rawDay)
      ? getWeekDayText(Number(rawDay))
      : rawDay.replace(/^週/, '');
    const daySuffix = dayText && dayText !== '—' ? `(${dayText})` : '';
    const periodText = period == null || period === '' ? '—' : formatPeriodText(period);
    const course = formatCourseDisplayText(clsSubj, '');
    return `${m}${daySuffix} ${periodText}${course ? ` ${course}` : ''}`.trim();
  }

  function formatLeaveClassSlot(req) {
    if (!req) return '—';
    const day = getWeekDayText(req.requestPeriodDay);
     const cls = formatCourseDisplayText(req.className, req.subject);
    return _fmtSlot(req.requestDate, day, req.requestPeriod, cls || '');
  }

  /** 快速待辦節次：7/24(五)第7節國文 */
  function formatQuickSlotCompact(dateStr, dayHint, period, className, subject) {
    let md = '—';
    if (dateStr && String(dateStr).length >= 10) {
      const mm = parseInt(String(dateStr).slice(5, 7), 10);
      const dd = parseInt(String(dateStr).slice(8, 10), 10);
      if (!isNaN(mm) && !isNaN(dd)) md = mm + '/' + dd;
    }
    let day = '';
    if (typeof dayHint === 'number' || (dayHint != null && String(dayHint).match(/^\d+$/))) {
      day = getWeekDayText(parseInt(dayHint, 10)) || '';
    } else if (dayHint) {
      day = String(dayHint);
    } else if (dateStr) {
      try {
        const d = new Date(String(dateStr).replace(/-/g, '/'));
        if (!isNaN(d.getTime())) day = getWeekDayText(d.getDay() === 0 ? 7 : d.getDay()) || '';
      } catch (e) { /* ignore */ }
    }
    const dayPart = day ? '(' + day + ')' : '';
    const perPart = formatPeriodText(period) || '';
    const subj = String(subject || className || '').replace(/\s+/g, '');
    return [md + dayPart, perPart, subj].filter(Boolean).join(' ');
  }

  function formatLineSlot(date, day, period, className, subject, teacherName) {
    const dateText = formatDateMMDD(date) || date || '';
    const dayText = getWeekDayText(day);
    const periodText = formatPeriodText(period);
    const lesson = [className, subject].filter(value => String(value || '').trim()).join('');
    const teacher = cleanLineTeacherName(teacherName);
    const teacherSuffix = teacher ? `（${teacher}老師）` : '';
    return `${dateText}${dayText ? `(${dayText})` : ''} ${periodText}${lesson ? ` ${lesson}${teacherSuffix}` : ''}`.trim();
  }

  function cleanLineTeacherName(value) { return String(value || '').replace(/\s*老師\s*$/, '').trim(); }

  function getLineExchangePartner(value) {
    const name = shortTeacherName(value);
    return name && name !== '我' ? `${name}老師` : '我';
  }

  function buildLineInviteText(opts) {
    // 紙本流程只保留詢問內容，避免呼叫端漏掉分流時重新產生線上連結。
    if (opts.paperFlow) return buildAskFirstLineText(opts);
    const name = shortTeacherName(opts.targetName) || cleanLineTeacherName(opts.targetName) || '對方';
    const requesterName = cleanLineTeacherName(opts.requesterName);
    const courseTeacherA = opts.courseTeacherA || opts.teacherA || opts.requesterName;
    const courseTeacherB = opts.courseTeacherB || opts.teacherB || opts.targetTeacherName || opts.targetName;
    const leaveLine = formatLineSlot(opts.dateA, opts.dayA, opts.periodA, opts.classA, opts.subjectA, courseTeacherA);
    const opening = opts.isExchange
      ? `${name}老師，想問您是否方便和${getLineExchangePartner(requesterName)}調課，`
      : `${name}老師，想問您是否可以協助代課：`;
    let text = `${opening}\n`;
    if (opts.isExchange) {
      const swapLine = formatLineSlot(opts.dateB, opts.dayB, opts.periodB, opts.classB, opts.subjectB, courseTeacherB);
      text += `\n${leaveLine}<->\n${swapLine}`;
    } else {
      text += leaveLine;
    }
    if (opts.notificationOnly) {
      text += '\n\n這筆安排已完成，請依排定時間上課。';
    } else if (opts.agreeLink || opts.declineLink) {
      text += '\n\n請回覆：';
      if (opts.agreeLink) text += `\n✅ 可以：${opts.agreeLink}`;
      if (opts.declineLink) text += `\n❌ 不方便：${opts.declineLink}`;
    }
    if (opts.systemUrl && opts.notificationOnly) text += `\n\n查看詳情：${opts.systemUrl}`;
    text += '\n\n感謝🙏🏻';
    return text;
  }

  /** 取姓名後兩字（先剔除括號註記，避免尾巴被切到） */
  function shortTeacherName(fullName) {
    const base = cleanLineTeacherName(String(fullName || '').replace(/[（(].*$/, ''));
    return base.length > 2 ? base.slice(-2) : base;
  }

  // LINE 描述實際處理的課堂；明細列優先用 date/period，申請列才回退 requestDate/requestPeriod。
  function getLineHandledSlot(row) {
    const source = row || {};
    const date = source.handledDate || source.dutyDate || source.date
      || source.requestDate || source['異動日期'] || '';
    let period = source.handledPeriod != null ? source.handledPeriod
      : (source.dutyPeriod != null ? source.dutyPeriod
        : (source.period != null ? source.period
          : (source.requestPeriod != null ? source.requestPeriod : source['異動節次'])));
    let day = source.handledDayOfWeek != null ? source.handledDayOfWeek
      : (source.dutyDayOfWeek != null ? source.dutyDayOfWeek
        : (source.dayOfWeek != null ? source.dayOfWeek : source.requestPeriodDay));
    if ((day == null || day === '' || period == null || period === '') && source.timeKey
        && window.DateUtils && typeof window.DateUtils.decodeTimeKey === 'function') {
      const decoded = window.DateUtils.decodeTimeKey(source.timeKey);
      if (day == null || day === '') day = decoded.day;
      if (period == null || period === '') period = decoded.period;
    }
    if ((day == null || day === '') && date) {
      const parsed = new Date(String(date).replace(/-/g, '/'));
      if (!Number.isNaN(parsed.getTime())) day = parsed.getDay() === 0 ? 7 : parsed.getDay();
    }
    return {
      date,
      day,
      period,
      className: source.handledClassName || source.dutyClassName || source.className || source.cls || source['班級'] || '',
      subject: source.handledSubject || source.dutySubject || source.subject || source['科目'] || ''
    };
  }

  /**
   * 送出前「先問對方」LINE 範本：只有詢問，沒有同意／拒絕連結（尚未送出）
   * opts: { targetName, isExchange, dateA, dayA, periodA, classA, subjectA,
   *         dateB, dayB, periodB, classB, subjectB, leaveTime }
   */
  function buildAskFirstLineText(opts) {
    const name = shortTeacherName(opts.targetName) || cleanLineTeacherName(opts.targetName) || '對方';
    const requesterName = cleanLineTeacherName(opts.requesterName);
    const courseTeacherA = opts.courseTeacherA || opts.teacherA || opts.requesterName;
    const courseTeacherB = opts.courseTeacherB || opts.teacherB || opts.targetTeacherName || opts.targetName;
    if (opts.isExchange) {
      const lineA = formatLineSlot(opts.dateA, opts.dayA, opts.periodA, opts.classA, opts.subjectA, courseTeacherA);
      const lineB = formatLineSlot(opts.dateB, opts.dayB, opts.periodB, opts.classB, opts.subjectB, courseTeacherB);
      return `${name}老師，想問您是否方便和${getLineExchangePartner(requesterName)}調課，\n\n${lineA}<->\n${lineB}\n\n如果可以，我再拿調課單給您，感謝🙏🏻`;
    }
    const slots = Array.isArray(opts.slots) && opts.slots.length
      ? opts.slots
      : [{
        date: opts.dateA,
        day: opts.dayA,
        period: opts.periodA,
        className: opts.classA,
        subject: opts.subjectA,
        teacherName: courseTeacherA
      }];
    const lines = slots.map((slot, index) => {
      const line = formatLineSlot(slot.date, slot.day, slot.period, slot.className, slot.subject, slot.teacherName || courseTeacherA);
      return `${slots.length > 1 ? `${index + 1}. ` : ''}${line}`;
    });
    return `${name}老師，想問您是否可以協助代課：\n${lines.join('\n')}\n\n如果可以，我再拿代課單給您，感謝🙏🏻`;
  }

  /**
   * 批次 LINE：一則訊息只含「該受邀人」的節次
   * 若該人只有 1 節 → 改用一般單節邀請格式（不出現批次用語）
   * opts: { targetName, requesterName, reason, subFee, systemUrl, batchId, paperFlow, slots: [{ id, date, day, period, className, subject }] }
   */
  function buildLineBatchInviteText(opts) {
    const name = shortTeacherName(opts.targetName) || cleanLineTeacherName(opts.targetName) || '對方';
    const slots = opts.slots || [];
    const n = slots.length;
    if (opts.paperFlow) {
      return buildAskFirstLineText({
        targetName: name,
        requesterName: opts.requesterName,
        isExchange: false,
        slots: slots.map((slot) => ({
          date: slot.date,
          day: slot.day,
          period: slot.period,
          className: slot.className,
          subject: slot.subject,
          teacherName: slot.teacherName || opts.requesterName
        }))
      });
    }
    const currentUrl = opts.systemUrl || (window.location.origin + window.location.pathname);
    const batchId = opts.batchId || '';

    // 單節：與一般代課邀請共用短版格式
    if (n === 1) {
      const s = slots[0];
      return buildLineInviteText({
        targetName: name,
        requesterName: opts.requesterName,
        dateA: s.date,
        dayA: s.day,
        periodA: s.period,
        classA: s.className,
        subjectA: s.subject,
        courseTeacherA: s.teacherName || opts.courseTeacherA || opts.requesterName,
        agreeLink: `${currentUrl}?action=respond&id=${encodeURIComponent(s.id)}&status=agree`,
        declineLink: `${currentUrl}?action=respond&id=${encodeURIComponent(s.id)}&status=decline`,
        systemUrl: currentUrl,
        isExchange: false
      });
    }

    let text = `${name}老師，想問您是否可以幫忙協助以下代課：`;
    if (batchId) {
      text += '\n\n請回覆：';
      text += `\n✅ 全部可以：${currentUrl}?action=respondBatch&batchId=${encodeURIComponent(batchId)}&status=agree`;
      text += `\n❌ 全部不便：${currentUrl}?action=respondBatch&batchId=${encodeURIComponent(batchId)}&status=decline`;
    }
    slots.forEach((s, i) => {
      const line = formatLineSlot(s.date, s.day, s.period, s.className, s.subject, s.teacherName || opts.courseTeacherA || opts.requesterName);
      const agree = `${currentUrl}?action=respond&id=${encodeURIComponent(s.id)}&status=agree`;
      const decline = `${currentUrl}?action=respond&id=${encodeURIComponent(s.id)}&status=decline`;
      text += `\n\n${i + 1}. ${line}\n　✅ 可以：${agree}\n　❌ 不方便：${decline}`;
    });
    text += '\n\n感謝🙏🏻';
    return text;
  }

  // —— 以下為 2A 第四批：課表細胞屬性／狀態文字（自 app.js verbatim 搬移，純函式） ——

  function getScheduleSpecialTags(entry) {
    const raw = entry && (entry.specialTags || entry['特殊標記'] || '');
    if (window.FieldMap && typeof window.FieldMap.normalizeSpecialTags === 'function') {
      return window.FieldMap.normalizeSpecialTags(raw).split('、').filter(Boolean);
    }
    return String(raw || '').split(/[,，、;；\/／|｜\n]+/).map(value => String(value || '').trim()).filter(Boolean);
  }

  function hasScheduleSpecialTag(entry, tag) {
    return getScheduleSpecialTags(entry).includes(String(tag || '').trim());
  }

  function isTimetablePullout(entry) {
    return !!(entry && (
      entry.isPullOut
      || entry.attr === '抽離'
      || hasScheduleSpecialTag(entry, '抽離')
    ));
  }

  function isTimetableRestricted(entry) {
    return !!(entry && (
      entry.restriction === 'restricted'
      || entry.restriction === '限制'
      || hasScheduleSpecialTag(entry, '綁課')
    ));
  }

  function getCellPlainStatus(cell) {
    // 空堂：不提示可調代課（空堂本身不能當申請來源）
    if (!cell) return '';
    const isPatrol = cell.isPatrol || cell.attr === '巡堂';
    if (isPatrol) return '巡堂';
    const cls = `${cell.className || ''} ${cell.subject || ''}`.trim();
    const swapName = cell.schoolSwap && cell.schoolSwap.name ? String(cell.schoolSwap.name) : '';
    const attributes = [];
    const addAttribute = (label) => {
      if (label && !attributes.includes(label)) attributes.push(label);
    };
    if (isTimetablePullout(cell)) addAttribute('抽離');
    if (isTimetableRestricted(cell)) addAttribute('綁課');
    if (cell.isOvertime || cell.attr === '超鐘點' || hasScheduleSpecialTag(cell, '超鐘點')) addAttribute('超鐘點');
    if (cell.isElastic || cell.attr === '實支') addAttribute('實支');
    if (cell.attr === '單週' || cell.attr === '雙週') addAttribute(cell.attr);
    if (hasScheduleSpecialTag(cell, '預排')) addAttribute('預排');
    const head = (cls || '有課')
      + (attributes.length ? `\n${attributes.join('、')}` : '')
      + (swapName ? `\n↔ 全校對調：${swapName}` : '');
    if (cell.isPending) {
      if (cell.pendingType === 'combined_return_out') {
         return `${head}\n⏳ 併班上課申請中\n${cell.pendingText || '待教學組核准'}`;
      }
      if (cell.pendingType === 'substitution_out') {
        return `${head}\n⏳ 代課申請中\n${cell.pendingText || '待對方或行政確認'}`;
      }
      if (cell.pendingType === 'substitution_in') {
        return `${head}\n⏳ 待代課\n${cell.pendingText || '請至待辦簽核'}`;
      }
      if (cell.pendingType === 'combined_return_in') {
        return `${head}\n⏳ 合班代課申請中\n${cell.pendingText || '待教學組核准'}`;
      }
      if (cell.pendingType === 'exchange_out') {
        return `${head}\n⏳ 調出申請中\n${cell.pendingText || ''}`;
      }
      if (cell.pendingType === 'exchange_in') {
        return `${head}\n⏳ 調入申請中\n${cell.pendingText || ''}`;
      }
      if (cell.pendingType === 'triangle' || cell.pendingType === 'triangle_out' || cell.pendingType === 'triangle_in') {
        return `${head}\n⏳ 三角調申請中\n${cell.pendingText || '等待三位教師完成同意'}`;
      }
      return `${head}\n${cell.pendingText || '申請處理中'}`;
    }
    if (cell.hasConcurrentDuty && cell.outgoingDuty) {
      const outgoing = cell.outgoingDuty;
      const incomingLabel = cell.subType === 'exchange' || cell.subType === 'triangle'
        ? '⇄ 本節調入課'
        : '➔ 本節代課';
      const outgoingCourse = `${outgoing.className || ''} ${outgoing.subject || ''}`.trim();
      return [
        head,
        incomingLabel,
        cell.subText || '',
        '↩ 原課已調出',
        outgoingCourse,
        outgoing.subText || ''
      ].filter(Boolean).join('\n');
    }
    if (cell.isCombinedReturn) {
       return `${head}\n↩ 併班上課\n${cell.subText || ''}`;
    }
    if (cell.isSubstituted) {
      if (cell.subType === 'exchange' || cell.subType === 'triangle') {
        return `${head}\n⇄ 本節已調出\n${cell.subText || ''}`;
      }
      // 被代課：不一定是請假（公假／活動／課務異動等）
      return `${head}\n➔ 本節已由他人代課\n${cell.subText || ''}`;
    }
    if (cell.isSubstitutionDuty) {
      if (cell.subType === 'exchange' || cell.subType === 'triangle') {
        return `${head}\n⇄ 本節為調入課\n${cell.subText || ''}`;
      }
      if (cell.isEmptySlotAssign) {
        return `${head}\n📌 本節為空堂任務\n${cell.subText || ''}`;
      }
      return `${head}\n➔ 本節為代課\n${cell.subText || ''}`;
    }
    return head;
  }

  return {
    formatLineSlot: formatLineSlot,
    cleanLineTeacherName: cleanLineTeacherName,
    getLineExchangePartner: getLineExchangePartner,
    buildLineInviteText: buildLineInviteText,
    shortTeacherName: shortTeacherName,
    getLineHandledSlot: getLineHandledSlot,
    buildAskFirstLineText: buildAskFirstLineText,
    buildLineBatchInviteText: buildLineBatchInviteText,
    isCombinedReturnRequest: isCombinedReturnRequest,
    getRequestTypeTags: getRequestTypeTags,
    getRequestRiskTags: getRequestRiskTags,
    formatCourseDisplayText: formatCourseDisplayText,
    _fmtSlot: _fmtSlot,
    formatLeaveClassSlot: formatLeaveClassSlot,
    formatQuickSlotCompact: formatQuickSlotCompact,
    getScheduleSpecialTags: getScheduleSpecialTags,
    hasScheduleSpecialTag: hasScheduleSpecialTag,
    isTimetablePullout: isTimetablePullout,
    isTimetableRestricted: isTimetableRestricted,
    getCellPlainStatus: getCellPlainStatus,
    formatTriangleSlot: formatTriangleSlot,
    buildTriangleLineText: buildTriangleLineText
  };
  // 2A：以下三角顯示自 app.js 搬移（formatLineSlot／buildAskFirstLineText 本模組既有）
  function formatTriangleSlot(slot, course, teacherName) {
    if (!slot) return '—';
    const source = course || {};
    return formatLineSlot(
      slot.date,
      slot.day != null ? slot.day : slot.dayOfWeek,
      slot.period,
      source.className,
      source.subject,
      teacherName || source.teacherName || source.teacher
    );
  }

  function buildTriangleLineText(request, groupRows) {
    const row = request || {};
    const rows = groupRows || [];
    const paperFlag = row.paperFlow != null ? row.paperFlow : row['紙本流程'];
    const normalizedPaperFlag = String(paperFlag == null ? '' : paperFlag).trim().toLowerCase();
    if (paperFlag === true || paperFlag === 1
        || normalizedPaperFlag === 'true' || normalizedPaperFlag === '1'
        || normalizedPaperFlag === '是' || normalizedPaperFlag === '紙本') {
      return buildAskFirstLineText({
        targetName: row.targetTeacherName,
        requesterName: '',
        slots: (rows.length ? rows : [row]).map((item) => ({
          date: item.requestDate || item.date,
          day: item.requestPeriodDay != null ? item.requestPeriodDay : item.dayOfWeek,
          period: item.requestPeriod != null ? item.requestPeriod : item.period,
          className: item.className,
          subject: item.subject,
          teacherName: item.requesterName || item.originalTeacherName || ''
        }))
      });
    }
    const participants = rows.map((item) => `${item.requesterName || ''}→${item.targetTeacherName || ''}`).join('、');
    const lines = rows.map((item, index) => {
       const source = formatLineSlot(item.requestDate, item.requestPeriodDay, item.requestPeriod, item.className, item.subject, item.requesterName || item.originalTeacherName);
       // 三角調是整堂課跟著來源教師走，目標時段仍顯示這條 leg 移入的原課。
        const target = formatLineSlot(item.targetDate, item.targetDayOfWeek, item.targetPeriod, item.className, item.subject, item.requesterName || item.originalTeacherName);
      const agree = `${window.location.origin}${window.location.pathname}?action=respond&id=${encodeURIComponent(item.id)}&status=agree`;
      const decline = `${window.location.origin}${window.location.pathname}?action=respond&id=${encodeURIComponent(item.id)}&status=decline`;
      return `${index + 1}. ${item.requesterName || '教師'}：${source} → ${target}\n　✅ 同意：${agree}\n　❌ 拒絕整組：${decline}`;
    });
    return `${row.targetTeacherName || '老師'}老師，這是一組三位教師的三角調課，需全部同意後才送教學組核准。\n\n假別／課務類型：${row.reason || '請假'}\n\n參與關係：${participants}\n\n${lines.join('\n\n')}\n\n感謝。`;
  }
})();
