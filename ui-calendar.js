/**
 * ui-calendar.js — 行事曆匯出（Google 日曆／ICS）（從 app.js 抽出，2A）
 *
 * Eager 載入（模板 @click 綁定，需先於 app.js）。
 * getCalendarDetails 與匯出三件皆在此；state（user／課表）由 app 經 deps 傳入。
 *
 * 對外 API 不變：
 * UiCalendar.{ getCalendarDetails, addToGoogleCalendar, downloadIcsCalendar, addEventToCalendar }
 */
window.UiCalendar = (function () {
  'use strict';

  function create(deps) {
    deps = deps || {};

    var user = deps.user;
    var substitutionRecords = deps.substitutionRecords;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var isExchangeLikeRequest = deps.isExchangeLikeRequest || function () { return false; };
    var isTriangleRequest = deps.isTriangleRequest
      || (typeof window !== 'undefined' && window.UiListHelpers && window.UiListHelpers.isTriangleRequest)
      || function () { return false; };
    var getTriangleGroupRequests = deps.getTriangleGroupRequests || function () { return []; };
    var getTargetClassAndSubject = deps.getTargetClassAndSubject || function () { return { className: '', subject: '' }; };
    var isCombinedReturnRequest = deps.isCombinedReturnRequest
      || (typeof window !== 'undefined' && window.UiLineTemplate && window.UiLineTemplate.isCombinedReturnRequest)
      || function () { return false; };
    var formatPeriodText = deps.formatPeriodText
      || (typeof window !== 'undefined' && window.DateUtils && window.DateUtils.formatPeriodText)
      || function (p) { return '第' + p + '節'; };

    const getCalendarDetails = (req) => {
      if (!req) return null;
      const userName = user.value ? String(getTeacherNameByEmail(user.value.email) || '').toLowerCase() : '';
      const requesterName = req.requesterName ? String(req.requesterName).toLowerCase() : '';
      const targetTeacherName = req.targetTeacherName ? String(req.targetTeacherName).toLowerCase() : '';
      const isExchange = isExchangeLikeRequest(req);

      if (isTriangleRequest(req)) {
        const group = getTriangleGroupRequests(req);
        const ownName = user.value
          ? String(getTeacherNameByEmail(user.value.email) || '').toLowerCase()
          : '';
        const own = group.find(row => String(row.requesterName || '').toLowerCase() === ownName) || group[0];
        if (!own || !own.targetDate || own.targetPeriod == null) return null;

        const timeSpan = window.DateUtils.getPeriodTimeSpan(own.targetPeriod);
        if (!timeSpan) return null;
        const timeParts = timeSpan.split('-');
        const datePart = String(own.targetDate).replace(/-/g, '');
        const startIso = datePart + 'T' + timeParts[0].replace(':', '') + '00';
        const endIso = datePart + 'T' + timeParts[1].replace(':', '') + '00';
        const routeLines = group.map(row =>
          `${row.requesterName || ''}：${row.requestDate || ''}第${row.requestPeriod || ''}節 → ${row.targetDate || ''}第${row.targetPeriod || ''}節`
        ).join('\n');
        const slotLabel = `${own.className || ''}${own.subject || ''}`.trim() || '三角調課';
        return {
          title: `【三角調入】${slotLabel}`,
          startIso,
          endIso,
          details: `本節請調入另一位教師的課程。\n${routeLines}\n\n參與教師：${group.map(row => row.requesterName || row.targetTeacherName || '').filter(Boolean).join('、')}\n單號：${req.serial || ''}\n（建成國中線上課表系統）`,
          titleTag: '三角調入'
        };
      }

      const isLeaveSide = !!(userName && userName === requesterName);
      const isCoverSide = !!(userName && userName === targetTeacherName);

      const subs = (substitutionRecords.value || []).filter(r => r && String(r.requestId) === String(req.id));
      const findSubAt = (dateStr, period, asActual) => {
        const p = parseInt(period, 10);
        return subs.find(r =>
          String(r.date || '') === String(dateStr || '')
          && parseInt(r.period, 10) === p
          && (asActual
             ? (r.actualTeacherName && String(r.actualTeacherName).toLowerCase() === userName)
             : (r.originalTeacherName && String(r.originalTeacherName).toLowerCase() === userName))
        ) || null;
      };
      const pickClassSubject = (rec, fallbackClass, fallbackSubj) => {
        if (rec && (rec.className || rec.subject)) {
          return {
            className: rec.className || fallbackClass || '',
            subject: rec.subject || fallbackSubj || ''
          };
        }
        return { className: fallbackClass || '', subject: fallbackSubj || '' };
      };

      // eventDate/Period：寫進行事曆的時間（對使用者有意義的那一節）
      let eventDate = req.requestDate;
      let eventPeriod = req.requestPeriod;
      let titleTag = '代課';
      let className = req.className || '';
      let subject = req.subject || '';
      let actionLine = '';

        if (isCombinedReturnRequest(req)) {
          eventDate = req.requestDate;
          eventPeriod = req.requestPeriod;
          className = req.className || '';
          subject = req.subject || '';
          if (isLeaveSide) {
            titleTag = '不用上';
            actionLine = `本節不用上。\n由 ${req.targetTeacherName || '其他併班任課教師'} 代課。`;
          } else if (isCoverSide) {
            titleTag = '代課';
            actionLine = `本節請代課。\n請假教師：${req.requesterName || ''}。`;
          } else {
             titleTag = '併班上課';
            actionLine = `請假：${req.requesterName || ''}　代課：${req.targetTeacherName || ''}`;
          }
       } else if (isExchange) {
        if (isLeaveSide) {
          // 申請人調入：時間＝對方節；班科＝自己的課
          eventDate = req.targetDate || req.requestDate;
          eventPeriod = req.targetPeriod != null ? req.targetPeriod : req.requestPeriod;
          const cs = pickClassSubject(null, req.className, req.subject);
          className = cs.className;
          subject = cs.subject;
          titleTag = '調入';
          actionLine = `本則為您的上課節次（您的課程：${req.className || ''} ${req.subject || ''}）。\n原節 ${req.requestDate || ''}第${req.requestPeriod || ''}節不用上，由 ${req.targetTeacherName || '對方'} 上。`;
        } else if (isCoverSide) {
          // 受邀人調入：時間＝申請人原節；班科＝自己的課（對調目標節原課）
          eventDate = req.requestDate;
          eventPeriod = req.requestPeriod;
          const tgtInfo = getTargetClassAndSubject(req);
          const cs = pickClassSubject(null, tgtInfo.className || req.targetClassName || '', tgtInfo.subject || req.targetSubject || '');
          className = cs.className;
          subject = cs.subject;
          titleTag = '調入';
          actionLine = `本則為您的上課節次（您的課程：${className || ''} ${subject || ''}）。\n您原 ${req.targetDate || ''}第${req.targetPeriod || ''}節不用上，由 ${req.requesterName || '對方'} 上。`;
        } else {
          eventDate = req.requestDate;
          eventPeriod = req.requestPeriod;
          titleTag = '調課';
          className = req.className || '';
          subject = req.subject || '';
          actionLine = `對調：${req.requestDate || ''}第${req.requestPeriod || ''}節 ⇄ ${req.targetDate || ''}第${req.targetPeriod || ''}節`;
        }
      } else {
        // 代課
        if (isLeaveSide) {
          eventDate = req.requestDate;
          eventPeriod = req.requestPeriod;
          const outRec = findSubAt(eventDate, eventPeriod, false) || subs[0];
          const cs = pickClassSubject(outRec, req.className, req.subject);
          className = cs.className;
          subject = cs.subject;
          titleTag = '不用上';
          actionLine = `本節不用上。\n由 ${req.targetTeacherName || '代課教師'} 代課。`;
        } else if (isCoverSide) {
          eventDate = req.requestDate;
          eventPeriod = req.requestPeriod;
          const inRec = findSubAt(eventDate, eventPeriod, true) || subs[0];
          const cs = pickClassSubject(inRec, req.className, req.subject);
          className = cs.className;
          subject = cs.subject;
          titleTag = '代課';
          actionLine = `本節請代課。\n請假教師：${req.requesterName || ''}。`;
        } else {
          eventDate = req.requestDate;
          eventPeriod = req.requestPeriod;
          titleTag = '代課';
          className = req.className || '';
          subject = req.subject || '';
          actionLine = `請假：${req.requesterName || ''}　代課：${req.targetTeacherName || ''}`;
        }
      }

      if (!eventDate || eventPeriod == null || eventPeriod === '') return null;
      const timeSpan = window.DateUtils.getPeriodTimeSpan(eventPeriod);
      if (!timeSpan) return null;
      const parts = timeSpan.split('-');
      const datePart = String(eventDate).replace(/-/g, '');
      const startIso = datePart + 'T' + parts[0].replace(':', '') + '00';
      const endIso = datePart + 'T' + parts[1].replace(':', '') + '00';

       const slotLabel = `${className || ''}${subject || ''}`.trim() || '課堂';
       const periodText = formatPeriodText(eventPeriod);
       const title = `【${titleTag}】${slotLabel}`;
       let details = `${actionLine}\n\n請假教師：${req.requesterName || ''}\n代課／對調教師：${req.targetTeacherName || ''}\n假別事由：${req.reason || '請假'}\n單號：${req.serial || ''}`;
       details += `\n節次：${periodText}`;
        if (isCombinedReturnRequest(req)) {
           details += `\n流程：併班上課（請假教師由其他併班任課教師代課）`;
        }
       if (isExchange) {
         details += `\n對調：${req.requestDate || ''}${formatPeriodText(req.requestPeriod)} ⇄ ${req.targetDate || ''}${formatPeriodText(req.targetPeriod)}`;
      }
      details += `\n（建成國中線上課表系統）`;

      return {
        title,
        startIso,
        endIso,
        details,
        titleTag
      };
    };

    // 測試接縫：允許覆寫 getCalendarDetails（paper-flow 以 fixture 驗證匯出）
    var getCalendarDetailsFn = deps.getCalendarDetails || getCalendarDetails;

    function addToGoogleCalendar(req) {
      const cal = getCalendarDetailsFn(req);
      if (!cal) {
        showToast('無法產生行事曆（缺少日期或節次）', 'warning');
        return;
      }

      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(cal.title)}&dates=${cal.startIso}/${cal.endIso}&details=${encodeURIComponent(cal.details)}`;
      let popup = null;
      try {
        popup = window.open(url, '_blank');
      } catch (error) {
        console.warn('開啟 Google 日曆新分頁失敗', error);
      }
      if (popup) {
        try { popup.opener = null; } catch (error) {}
        return;
      }
      // 瀏覽器封鎖 window.open 時，仍以 target=_blank 嘗試開新分頁，不改動目前頁面。
      try {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('若未出現新分頁，請允許瀏覽器開啟彈出視窗後再試。', 'info');
      } catch (error) {
        console.warn('開啟 Google 日曆新分頁失敗', error);
        showToast('無法開啟 Google 日曆新分頁，請允許瀏覽器開啟彈出視窗後再試。', 'warning');
      }
    }

    function downloadIcsCalendar(req) {
      const cal = getCalendarDetailsFn(req);
      if (!cal) {
        showToast('無法產生行事曆（缺少日期或節次）', 'warning');
        return;
      }

      const icsDetails = cal.details.replace(/\n/g, '\\n');
      const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//建成國中線上課表系統//NONSGML v1.0//EN',
        'BEGIN:VEVENT',
        `UID:${req.id || Date.now()}@substitution.sys`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${cal.startIso}`,
        `DTEND:${cal.endIso}`,
        `SUMMARY:${cal.title}`,
        `DESCRIPTION:${icsDetails}`,
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      // 針對 iOS 進行特別體驗優化：直接以 data URI 開啟，Safari 會自動彈出原生「加入行事曆」畫面，免除下載後再去檔案 App 打開的繁瑣步驟
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent);
      } else {
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `${req.serial || 'event'}_substitution.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }

    function addEventToCalendar(req) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        downloadIcsCalendar(req);
      } else {
        addToGoogleCalendar(req);
      }
    }

    return {
      addToGoogleCalendar: addToGoogleCalendar,
      getCalendarDetails: getCalendarDetails,
      downloadIcsCalendar: downloadIcsCalendar,
      addEventToCalendar: addEventToCalendar
    };
  }

  return { create: create };
})();
