/**
 * export-lazy.js — 相容舊名的轉接層。
 *
 * 閘門實作已移到 export-gates.js（見該檔的分包契約說明）：本檔只做轉接，
 * 讓既有文件與引用點不必一次改完。新程式碼請直接引 export-gates.js。
 * 這裡刻意寫成 import＋export 兩段（不用 export ... from），
 * 好讓 tests/module-deps-tests 的未綁定識別符掃描看得懂。
 */
import {
  ensureActivityCover,
  ensureInvigilation,
  ensureAccounting,
  ensurePeriod8,
  ensureSchoolTimetable
} from './export-gates.js';

export {
  ensureActivityCover,
  ensureInvigilation,
  ensureAccounting,
  ensurePeriod8,
  ensureSchoolTimetable
};
