/**
 * HRM HYDRAULIC MANAGEMENT — mobile entry (Google Apps Script + Google Sheets)
 * ---------------------------------------------------------------------------
 * - Phones open the Web App URL, enter the TEAM CODE once, and send readings.
 * - Readings are stored in the "Inbox" sheet.
 * - The desktop program pulls new rows with the SYNC KEY and marks them imported.
 *
 * Setup: run setup() once (menu Run ▶), then Deploy ▸ New deployment ▸ Web app
 *        (Execute as: Me · Who has access: Anyone). Full guide: README_TH.md
 */

const INBOX = 'Inbox';
const CONFIG = 'Config';
const EVENTS = 'Events';
const HEAD_EV = ['id', 'receivedAt', 'shiftDate', 'shift', 'time', 'recorder', 'team', 'system', 'type', 'tanks',
  'beforeL', 'afterL', 'reason', 'reasonText', 'device', 'imported', 'drainedL', 'location', 'cause', 'action'];
const IMP_EV = HEAD_EV.indexOf('imported');
const LOGS = 'Log';                                   // history of entries taken back / fixed from phones
const HEAD_LOG = ['id', 'at', 'action', 'entryId', 'kind', 'recorder', 'team', 'shiftDate', 'shift', 'time', 'summary', 'by', 'replacedBy', 'data', 'imported'];           // 0-based column of the "imported" stamp
const EV_TYPES = {                                    // phone actions and the reasons each one allows
  refill: ['oil_leakage', 'mt_drain', 'other'],
  oil_change: ['scheduled_oil_change', 'oil_degradation', 'other'],
  leak: null,
  maint: null
};
const HEAD = ['id', 'receivedAt', 'shiftDate', 'shift', 'time', 'recorder', 'team', 'status',
  'servoL', 'servoT', 'auxL', 'auxT', 'lubL', 'lubT', 'note', 'device', 'imported'];
/* members: NAME:TEAM — the team comes from the name. The PC program keeps the RECORDERS row in Config up to date */
const RECORDERS = 'NES:A NU:A JOE:A SONG:A WAT:B NOOM:B BAS:B TIME:B JILL:C SUT:C OIL:C MOS:C';
function members_(c) {
  const parse = s => String(s || '').toUpperCase().split(/[\s,;]+/).map(x => /^([A-Z0-9]{1,12})(?::([ABC]))?$/.exec(x)).filter(Boolean).map(m => ({ name: m[1], team: m[2] || '' }));
  const l = parse(c && c.RECORDERS);
  return l.length ? l : parse(RECORDERS);
}
function teamFor_(name, c) { const k = String(name || '').trim().toUpperCase(); const m = members_(c).filter(x => x.name === k)[0]; return m ? m.team : ''; }
function recorders_(c) {
  return members_(c).map(m => m.name);
}
const SYS = [['servo', 'servoL', 'servoT'], ['auxiliary', 'auxL', 'auxT'], ['lubrication', 'lubL', 'lubT']];

/* ---------- one-time setup ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let inbox = ss.getSheetByName(INBOX);
  if (!inbox) inbox = ss.insertSheet(INBOX);
  if (inbox.getLastRow() === 0) {
    inbox.appendRow(HEAD);
    inbox.setFrozenRows(1);
    inbox.getRange(1, 1, 1, HEAD.length).setFontWeight('bold').setBackground('#E4ECFD');
  }
  evSheet_();
  let cfg = ss.getSheetByName(CONFIG);
  if (!cfg) cfg = ss.insertSheet(CONFIG);
  if (cfg.getLastRow() === 0) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    cfg.getRange(1, 1, 6, 3).setValues([
      ['Setting', 'Value', 'คำอธิบาย / Note'],
      ['TEAM_CODE', code, 'รหัสทีม 6 หลักขึ้นไป ให้พนักงานกรอกครั้งแรกในมือถือ (เปลี่ยนได้ตลอด)'],
      ['SYNC_KEY', Utilities.getUuid(), 'กุญแจสำหรับโปรแกรมบนคอม ห้ามให้คนอื่น'],
      ['DAY_START', '08:00', 'เวลาเริ่มกะเช้า'],
      ['DAY_END', '20:00', 'เวลาเริ่มกะดึก'],
      ['MACHINE', 'HRM Process', 'ชื่อที่แสดงบนหน้ามือถือ']
    ]);
    cfg.getRange('A1:C1').setFontWeight('bold').setBackground('#E4ECFD');
    cfg.getRange('B2:B5').setNumberFormat('@');
    cfg.setColumnWidth(2, 320); cfg.setColumnWidth(3, 460);
  }
  return 'OK — TEAM_CODE and SYNC_KEY are in the Config sheet';
}

/* refill events sent from phones (created on first use, so older installs need no new setup) */
function evSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(EVENTS);
  if (!sh) sh = ss.insertSheet(EVENTS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEAD_EV);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD_EV.length).setFontWeight('bold').setBackground('#E4F5EC');
  } else {                                            // older sheet: add any new header cells
    const hd = sh.getRange(1, 1, 1, HEAD_EV.length).getValues()[0];
    if (hd.some((h, i) => String(h) !== HEAD_EV[i])) sh.getRange(1, 1, 1, HEAD_EV.length).setValues([HEAD_EV]).setFontWeight('bold').setBackground('#E4F5EC');
  }
  return sh;
}

function logSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LOGS);
  if (!sh) sh = ss.insertSheet(LOGS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEAD_LOG);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD_LOG.length).setFontWeight('bold').setBackground('#FDF0E4');
  }
  return sh;
}
const SYS_SHORT = { servo: 'Servo', auxiliary: 'Aux', lubrication: 'Lube' };
const REASON_TH = { oil_leakage: 'น้ำมันรั่ว', mt_drain: 'MT มีการ Drain น้ำมัน', other: 'ระบุเอง', scheduled_oil_change: 'เปลี่ยนตามรอบ', oil_degradation: 'น้ำมันเสื่อมสภาพ' };
function summary_(kind, o) {
  if (kind === 'reading') return [['servoL', 'servoT', 'S'], ['auxL', 'auxT', 'A'], ['lubL', 'lubT', 'L']].filter(x => String(o[x[0]]) !== '')
    .map(x => x[2] + ' ' + o[x[0]] + ' L' + (String(o[x[1]]) !== '' ? ' ' + o[x[1]] + '°C' : '')).join(' · ');
  const s = SYS_SHORT[o.system] || o.system, t = o.type || 'refill';
  if (t === 'refill') return 'เติม ' + s + ' +' + o.tanks + ' ถัง · ' + o.beforeL + ' → ' + o.afterL + ' L · ' + (o.reason === 'other' && o.reasonText ? o.reasonText : (REASON_TH[o.reason] || o.reason) + (o.reasonText ? ': ' + o.reasonText : ''));
  if (t === 'oil_change') return 'เปลี่ยนน้ำมัน ' + s + ' ' + o.tanks + ' ถัง · ' + o.beforeL + ' → ' + o.afterL + ' L';
  if (t === 'leak') return 'รั่ว ' + s + ' · ' + o.location + ' · ' + o.beforeL + ' → ' + o.afterL + ' L';
  return 'ซ่อม ' + s + ' · ' + o.action;
}
/* a corrected entry points the history row of the one it replaces at itself */
function linkReplaced_(oldId, newId) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(oldId || ''))) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGS);
  if (!sh || sh.getLastRow() < 2) return;
  const n = sh.getLastRow() - 1, v = sh.getRange(2, 1, n, HEAD_LOG.length).getValues();
  const iE = HEAD_LOG.indexOf('entryId'), iA = HEAD_LOG.indexOf('action'), iR = HEAD_LOG.indexOf('replacedBy');
  for (let i = n - 1; i >= 0; i--) if (String(v[i][iE]) === oldId && v[i][iA] === 'edit' && !v[i][iR]) { sh.getRange(i + 2, iR + 1).setValue(newId); return; }
}

function cfg_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG);
  if (!sh) throw new Error('Run setup() first');
  const o = {};
  sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 2).getDisplayValues().forEach(r => { if (r[0]) o[String(r[0]).trim()] = String(r[1]).trim(); });
  return o;
}
const hm_ = s => { const p = String(s || '0:0').split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };

/* ---------- web entry points ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) return json_(api_(p));
  const t = HtmlService.createTemplateFromFile('Index');
  const c = cfg_();
  const pc = String(p.c || '').trim();
  let url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (err) { url = ''; }
  t.boot = JSON.stringify({ dayStart: c.DAY_START || '08:00', dayEnd: c.DAY_END || '20:00', machine: c.MACHINE || 'HRM Process', recorders: recorders_(c), members: members_(c),
    url: url, code: pc && pc === c.TEAM_CODE ? pc : '', codeErr: pc && pc !== c.TEAM_CODE ? 'bad_code' : '', check: !!p.check });
  return t.evaluate().setTitle('HRM Hydraulic · บันทึกระดับน้ำมัน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
function doPost(e) {   // desktop may also use POST {action,key,ids}
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { p = {}; }
  if (p.action === 'phone') return json_(phoneApi_(p));
  if (p.action === 'desk') return json_(deskApi_(p));
  if (Array.isArray(p.events) && p.destination) return json_(lineHook_(p));   // LINE webhook
  return json_(api_(p));
}

/* ======================================================================
 * PC web app (desk/ on GitHub Pages): the whole program data lives here
 *  - sheet "DB"        : the data file (JSON) split into cells of 40,000 characters
 *  - sheet "DB_Backup" : first copy of every day (last 14 days)
 *  - sheets "Records" / "PC_Events" : readable copy for people (refreshed at most every 15 minutes)
 * Every call needs SYNC_KEY. Saves use a revision number: a PC that saved over an older copy gets the newer one back to merge.
 * ====================================================================== */
const DB = 'DB', DB_BK = 'DB_Backup', DB_CHUNK = 40000, DB_KEEP_DAYS = 14;
function deskApi_(p) {
  const c = cfg_();
  if (!p.key || p.key !== c.SYNC_KEY) return { ok: false, error: 'bad_key' };
  const fn = { info: deskInfo_, load: deskLoad_, save: deskSave_, rev: deskRev_ }[String(p.fn || '')];
  if (!fn) return { ok: false, error: 'unknown_fn' };
  try { return fn(p); } catch (err) { return { ok: false, error: 'server_error', detail: String(err && err.message || err).slice(0, 200) }; }
}
function dbProps_() { return PropertiesService.getScriptProperties(); }
function dbMeta_() {
  const pr = dbProps_();
  return { rev: Number(pr.getProperty('DB_REV') || 0), at: pr.getProperty('DB_AT') || '', by: pr.getProperty('DB_BY') || '', parts: Number(pr.getProperty('DB_PARTS') || 0) };
}
function dbSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(DB);
  if (!sh) { sh = ss.insertSheet(DB); try { sh.hideSheet(); } catch (e) {} }
  return sh;
}
function dbRead_() {
  const m = dbMeta_();
  if (!m.parts) return '';
  return dbSheet_().getRange(1, 1, m.parts, 1).getValues().map(r => String(r[0])).join('');
}
function dbWrite_(text) {
  const sh = dbSheet_(), parts = [];
  for (let i = 0; i < text.length; i += DB_CHUNK) parts.push([text.slice(i, i + DB_CHUNK)]);
  if (!parts.length) parts.push(['']);
  sh.getRange(1, 1, parts.length, 1).setNumberFormat('@').setValues(parts);
  const old = Number(dbProps_().getProperty('DB_PARTS') || 0);
  if (old > parts.length) sh.getRange(parts.length + 1, 1, old - parts.length, 1).clearContent();
  return parts.length;
}
function deskInfo_() {
  const m = dbMeta_(), ss = SpreadsheetApp.getActiveSpreadsheet();
  return { ok: true, exists: m.parts > 0, rev: m.rev, modified: m.at, savedBy: m.by, sheet: ss.getName(), url: ss.getUrl() };
}
function deskRev_() { const m = dbMeta_(); return { ok: true, rev: m.rev, exists: m.parts > 0 }; }
function deskLoad_() {
  const m = dbMeta_();
  if (!m.parts) return { ok: true, exists: false, rev: 0, text: null };
  return { ok: true, exists: true, rev: m.rev, text: dbRead_() };
}
function deskSave_(p) {
  const text = String(p.payload || '');
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: 'bad_json' }; }
  if (!obj || !Array.isArray(obj.records) || !Array.isArray(obj.events)) return { ok: false, error: 'bad_data' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, busy: true, error: 'locked' };
  try {
    const m = dbMeta_();
    if (m.parts && Number(p.base_rev || 0) !== m.rev) return { ok: false, conflict: true, rev: m.rev, text: dbRead_() };
    const now = new Date(), tz = Session.getScriptTimeZone(), at = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
    if (m.parts) dbDailyBackup_(m, Utilities.formatDate(now, tz, 'yyyy-MM-dd'));
    obj.rev = m.rev + 1; obj.savedBy = String(p.by || 'PC').slice(0, 40); obj.savedAt = at;
    const parts = dbWrite_(JSON.stringify(obj));
    dbProps_().setProperties({ DB_REV: String(obj.rev), DB_AT: at, DB_BY: obj.savedBy, DB_PARTS: String(parts) });
    try { dbMirror_(obj, false); } catch (e) { /* readable copy is a convenience only */ }
    return { ok: true, rev: obj.rev, savedBy: obj.savedBy, savedAt: at };
  } finally { lock.releaseLock(); }
}
/* first save of each day keeps a full copy of the previous data */
function dbDailyBackup_(m, day) {
  const pr = dbProps_();
  if (pr.getProperty('DB_BK_DAY') === day) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let bk = ss.getSheetByName(DB_BK);
  if (!bk) { bk = ss.insertSheet(DB_BK); bk.appendRow(['day', 'rev', 'savedAt', 'savedBy', 'part', 'data']); bk.setFrozenRows(1); try { bk.hideSheet(); } catch (e) {} }
  const text = dbRead_(), rows = [];
  for (let i = 0, k = 0; i < text.length; i += DB_CHUNK, k++) rows.push([day, m.rev, m.at, m.by, k, text.slice(i, i + DB_CHUNK)]);
  if (rows.length) bk.getRange(bk.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  const cut = Utilities.formatDate(new Date(Date.now() - DB_KEEP_DAYS * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const n = bk.getLastRow() - 1;
  if (n > 0) {
    const days = bk.getRange(2, 1, n, 1).getDisplayValues();
    let old = 0; while (old < n && days[old][0] < cut) old++;
    if (old) bk.deleteRows(2, old);
  }
  pr.setProperty('DB_BK_DAY', day);
}
/* readable copy for people (not used by the program) */
function dbMirror_(obj, force) {
  const pr = dbProps_(), last = Number(pr.getProperty('DB_MIRROR_AT') || 0);
  if (!force && Date.now() - last < 15 * 60000) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet(), tz = Session.getScriptTimeZone();
  const put = (name, head, rows) => {
    let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
    sh.clearContents(); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1);
    if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  };
  const d = ts => Utilities.formatDate(new Date(Number(ts)), tz, 'yyyy-MM-dd'), t = ts => Utilities.formatDate(new Date(Number(ts)), tz, 'HH:mm');
  const recs = obj.records.filter(r => r && isFinite(Number(r.ts))).sort((a, b) => a.ts - b.ts)
    .map(r => [d(r.ts), t(r.ts), r.shift || '', r.systemType || '', r.level, r.temperature == null ? '' : r.temperature, r.status || '', r.recorder || r.operator || '', r.team || '', r.source || (r.fromEvent ? 'event' : 'pc'), r.note || '']);
  put('Records', ['date', 'time', 'shift', 'system', 'level L', 'temp °C', 'status', 'recorder', 'team', 'source', 'note'], recs);
  const evs = obj.events.filter(e => e && isFinite(Number(e.ts))).sort((a, b) => a.ts - b.ts)
    .map(e => [d(e.ts), t(e.ts), e.systemType || '', e.eventType || '', e.beforeLevel == null ? '' : e.beforeLevel, e.afterLevel == null ? '' : e.afterLevel, e.tankCount || '', e.addedVolume || '', e.totalCost || '', e.reason || '', e.otherDetail || e.cause || '', e.location || '', e.action || '', e.recorder || e.operator || '', e.source || 'pc']);
  put('PC_Events', ['date', 'time', 'system', 'event', 'before L', 'after L', 'tanks', 'added L', 'cost THB', 'reason', 'detail / cause', 'location', 'action', 'recorder', 'source'], evs);
  pr.setProperty('DB_MIRROR_AT', String(Date.now()));
}

/* phone page hosted outside Apps Script (e.g. GitHub Pages) calls the same functions through POST {action:'phone', fn, args} */
const PHONE_FNS = { phoneLast: phoneLast, phoneBoot: phoneBoot, checkCode: checkCode, submitReading: submitReading, submitEvent: submitEvent,
  cancelEntry: cancelEntry, recent: recent, logClientError: logClientError, phoneCheck: phoneCheck };
function phoneApi_(p) {
  const fn = PHONE_FNS[String(p.fn || '')];
  if (!fn) return { ok: false, error: 'unknown_fn' };
  try { return fn.apply(null, Array.isArray(p.args) ? p.args.slice(0, 4) : []); }
  catch (err) { return { ok: false, error: 'server_error', detail: String(err && err.message || err).slice(0, 200) }; }
}
/* settings the phone page needs; the recorder list only after the right team code */
/* last level of each system (PC data, phone readings, phone refills) + abnormal-drop limits (L/hour) for the phone's check */
function tsBkk_(date, time, shift, c) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(normDate_(date)), t = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (!d || !t) return null;
  let ms = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - 7 * 3600000;
  if (shift === 'night' && (+t[1] * 60 + +t[2]) < hm_(c.DAY_START || '08:00')) ms += 864e5;
  return ms;
}
function sysRates_(c) {
  const o = { servo: 5, auxiliary: 4, lubrication: 4 };
  String(c.SYS_RATES || '').split(/[\s,;]+/).forEach(x => { const m = /^(servo|auxiliary|lubrication):(\d+(\.\d+)?)$/.exec(x); if (m) o[m[1]] = Number(m[2]); });
  return o;
}
function phoneLast(code) {
  const c = cfg_();
  if (String(code || '').trim() !== c.TEAM_CODE) return { ok: false, error: 'bad_code' };
  const last = {}, put = (k, level, ts) => { if (!isFinite(level) || !isFinite(ts)) return; if (!last[k] || ts > last[k].ts) last[k] = { level: Math.round(Number(level)), ts: ts }; };
  try { const txt = dbRead_(); if (txt) (JSON.parse(txt).records || []).forEach(r => { if (r && r.systemType && r.level != null) put(r.systemType, Number(r.level), Number(r.ts)); }); } catch (e) { }
  const ss = SpreadsheetApp.getActiveSpreadsheet(), ib = ss.getSheetByName(INBOX);
  if (ib && ib.getLastRow() > 1) ib.getRange(2, 1, ib.getLastRow() - 1, HEAD.length).getDisplayValues().forEach(v => {
    const ts = tsBkk_(v[2], v[4], v[3], c); if (ts == null) return;
    SYS.forEach(x => { const L = String(v[HEAD.indexOf(x[1])]).replace(/,/g, '').trim(); if (L !== '') put(x[0], Number(L), ts); });
  });
  const ev = ss.getSheetByName(EVENTS);
  if (ev && ev.getLastRow() > 1) ev.getRange(2, 1, ev.getLastRow() - 1, HEAD_EV.length).getDisplayValues().forEach(v => {
    const ts = tsBkk_(v[HEAD_EV.indexOf('shiftDate')], v[HEAD_EV.indexOf('time')], v[HEAD_EV.indexOf('shift')], c), a = String(v[HEAD_EV.indexOf('afterL')]).replace(/,/g, '').trim();
    if (ts != null && a !== '') put(v[HEAD_EV.indexOf('system')], Number(a), ts);
  });
  return { ok: true, last: last, rates: sysRates_(c) };
}
function phoneBoot(code) {
  const c = cfg_(), ok = !!code && String(code).trim() === c.TEAM_CODE;
  return { ok: true, codeOk: ok, dayStart: c.DAY_START || '08:00', dayEnd: c.DAY_END || '20:00', machine: c.MACHINE || 'HRM Process',
    recorders: ok ? recorders_(c) : [], members: ok ? members_(c) : [], version: SERVER_VER };
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* desktop API: ping / pull / ack — all need SYNC_KEY */
function api_(p) {
  const c = cfg_();
  if (!p.key || p.key !== c.SYNC_KEY) return { ok: false, error: 'bad_key' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INBOX);
  if (p.action === 'ping') return { ok: true, rows: Math.max(0, sh.getLastRow() - 1), machine: c.MACHINE || '', team: c.TEAM_CODE || '' };
  if (p.action === 'pull') {
    const n = sh.getLastRow() - 1;
    const vals = n > 0 ? sh.getRange(2, 1, n, HEAD.length).getDisplayValues() : [];
    const rows = [];
    for (const v of vals) {
      if (v[16]) continue;                                   // already imported
      const o = {}; HEAD.forEach((h, i) => o[h] = v[i]); rows.push(o);
      if (rows.length >= 500) break;
    }
    const ev = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS);
    const events = [];
    if (ev && ev.getLastRow() > 1) {
      ev.getRange(2, 1, ev.getLastRow() - 1, HEAD_EV.length).getDisplayValues().forEach(v => {
        if (v[IMP_EV] || events.length >= 300) return;
        const o = {}; HEAD_EV.forEach((h, i) => o[h] = v[i]); events.push(o);
      });
    }
    const lg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGS);
    const logs = [];
    if (lg && lg.getLastRow() > 1) {
      const iI = HEAD_LOG.indexOf('imported');
      lg.getRange(2, 1, lg.getLastRow() - 1, HEAD_LOG.length).getDisplayValues().forEach(v => {
        if (v[iI] || logs.length >= 200) return;
        const o = {}; HEAD_LOG.forEach((h, i) => { if (h !== 'data') o[h] = v[i]; }); logs.push(o);
      });
    }
    return { ok: true, rows, events, logs, team: c.TEAM_CODE || '' };
  }
  if (p.action === 'ack') {
    const ids = (Array.isArray(p.ids) ? p.ids : String(p.ids || '').split(',')).map(String).filter(Boolean);
    if (!ids.length) return { ok: true, acked: 0 };
    const lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      const n = sh.getLastRow() - 1;
      const want = new Set(ids), stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') + ' ' + String(p.by || 'PC');
      let k = 0;
      if (n > 0) {
        const idCol = sh.getRange(2, 1, n, 1).getValues(), impCol = sh.getRange(2, 17, n, 1).getValues();
        for (let i = 0; i < n; i++) if (want.has(String(idCol[i][0])) && !impCol[i][0]) { impCol[i][0] = stamp; k++; }
        sh.getRange(2, 17, n, 1).setValues(impCol);
      }
      const ev = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS);
      if (ev && ev.getLastRow() > 1) {
        const m = ev.getLastRow() - 1, col = IMP_EV + 1;
        const eid = ev.getRange(2, 1, m, 1).getValues(), eimp = ev.getRange(2, col, m, 1).getValues();
        for (let i = 0; i < m; i++) if (want.has(String(eid[i][0])) && !eimp[i][0]) { eimp[i][0] = stamp; k++; }
        ev.getRange(2, col, m, 1).setValues(eimp);
      }
      const lg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGS);
      if (lg && lg.getLastRow() > 1) {
        const m = lg.getLastRow() - 1, col = HEAD_LOG.indexOf('imported') + 1;
        const lid = lg.getRange(2, 1, m, 1).getValues(), limp = lg.getRange(2, col, m, 1).getValues();
        for (let i = 0; i < m; i++) if (want.has(String(lid[i][0])) && !limp[i][0]) { limp[i][0] = stamp; k++; }
        lg.getRange(2, col, m, 1).setValues(limp);
      }
      return { ok: true, acked: k };
    } finally { lock.releaseLock(); }
  }
  if (p.action === 'line') return lineApi_(p, c);
  if (p.action === 'names') {   // the PC program sends its recorder list
    const list = String(p.names || '').toUpperCase().split(/[\s,;]+/).filter(n => /^[A-Z0-9]{1,12}(:[ABC])?$/.test(n));
    if (!list.length) return { ok: false, error: 'bad_names' };
    const cs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG);
    const keys = cs.getRange(1, 1, Math.max(1, cs.getLastRow()), 1).getValues().map(r => String(r[0]).trim());
    let row = keys.indexOf('RECORDERS') + 1;
    if (!row) { row = cs.getLastRow() + 1; cs.getRange(row, 1).setValue('RECORDERS'); cs.getRange(row, 3).setValue('สมาชิก ชื่อ:ทีม (ส่งมาจากโปรแกรมบนคอม)'); }
    cs.getRange(row, 2).setNumberFormat('@').setValue(list.join(' '));
    const hmOk = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
    if (hmOk(p.dayStart) && hmOk(p.dayEnd) && hm_(p.dayStart) < hm_(p.dayEnd)) { setCfg_('DAY_START', p.dayStart, 'เวลาเริ่มกะเช้า'); setCfg_('DAY_END', p.dayEnd, 'เวลาเริ่มกะดึก'); }
    if (p.rota != null && /^(\d{4}-\d{2}-\d{2}\|[ABC-]{2}(,[ABC-]{2}){0,59})?$/.test(String(p.rota))) setCfg_('ROTA', String(p.rota), 'ตารางหมุนกะ: วันเริ่มรอบ|เช้าดึก,… (ส่งมาจากโปรแกรมบนคอม)');
    if (p.rotaCal != null && /^(\d{4}-\d{2}-\d{2}\|[ABC-]{2}(,[ABC-]{2}){0,1499})?$/.test(String(p.rotaCal))) setCfg_('ROTA_CAL', String(p.rotaCal), 'ปฏิทินกะรายวัน: วันแรก|เช้าดึก,… (ส่งมาจากโปรแกรมบนคอม)');
    if (p.rates != null && /^((servo|auxiliary|lubrication):\d+(\.\d+)?,?){0,3}$/.test(String(p.rates))) setCfg_('SYS_RATES', String(p.rates), 'เกณฑ์ลดผิดปกติ L/ชม. (ส่งมาจากโปรแกรมบนคอม)');
    if (p.link != null && /^(https:\/\/[^\s"'<>]{8,300})?$/.test(String(p.link))) setCfg_('PHONE_LINK', String(p.link), 'ลิงก์หน้ามือถือ (แนบในข้อความแจ้งเตือน LINE)');
    return { ok: true, names: list };
  }
  return { ok: false, error: 'unknown_action' };
}

function setCfg_(key, val, note) {
  const cs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG);
  const keys = cs.getRange(1, 1, Math.max(1, cs.getLastRow()), 1).getValues().map(r => String(r[0]).trim());
  let row = keys.indexOf(key) + 1;
  if (!row) { row = cs.getLastRow() + 1; cs.getRange(row, 1).setValue(key); if (note) cs.getRange(row, 3).setValue(note); }
  cs.getRange(row, 2).setNumberFormat('@').setValue(String(val));
}

/* ======================================================================
 * LINE group alert: before each shift ends, if a system has no reading yet,
 * the LINE Official Account bot posts to the group, e.g.
 *   "กะเช้า 28 ต.ค. · ทีม A ยังไม่ได้ลง: Servo, Lube"
 *  - token / on-off / minutes before the end: set from the PC program (Settings → แจ้งเตือน LINE)
 *  - group: found by itself when the bot is invited into the LINE group (webhook = this Web App link)
 *  - timer: run setupLine() once in the editor (makes a 5-minute timer for lineTick)
 * ====================================================================== */
const LINE_API = 'https://api.line.me/v2/bot';
const SYS_NAME = { servo: 'Servo', auxiliary: 'Aux', lubrication: 'Lube' };
function lineProps_() { const p = PropertiesService.getScriptProperties(); return { token: p.getProperty('LINE_TOKEN') || '', group: p.getProperty('LINE_GROUP') || '', groupName: p.getProperty('LINE_GROUP_NAME') || '', on: p.getProperty('LINE_ON') === '1', before: Math.max(5, Math.min(120, Number(p.getProperty('LINE_BEFORE') || 15))), last: p.getProperty('LINE_LAST') || '', lastAt: p.getProperty('LINE_LAST_AT') || '', lastMsg: p.getProperty('LINE_LAST_MSG') || '', err: p.getProperty('LINE_ERR') || '' }; }
function lineFetch_(path, method, body, token) {
  const o = { method: method || 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch(LINE_API + path, o);
  let j = {}; try { j = JSON.parse(r.getContentText() || '{}'); } catch (e) { j = {}; }
  return { code: r.getResponseCode(), body: j };
}
function linePush_(text, flex) {
  const L = lineProps_();
  if (!L.token) return { ok: false, error: 'no_token' };
  if (!L.group) return { ok: false, error: 'no_group' };
  const plain = { type: 'text', text: String(text).slice(0, 4900) };
  let r = lineFetch_('/message/push', 'post', { to: L.group, messages: [flex || plain] }, L.token);
  if (flex && r.code === 400) r = lineFetch_('/message/push', 'post', { to: L.group, messages: [plain] }, L.token);   // card refused → plain text
  const pr = PropertiesService.getScriptProperties();
  if (r.code !== 200) { const e = 'LINE ' + r.code + ': ' + (r.body.message || ''); pr.setProperty('LINE_ERR', e); return { ok: false, error: 'line_' + r.code, message: r.body.message || '' }; }
  pr.setProperties({ LINE_ERR: '', LINE_LAST_AT: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss').slice(0, 16), LINE_LAST_MSG: String(text).slice(0, 300) });
  return { ok: true };
}
/* rota "2026-10-27|AB,AB,CA" → team on a shift (A/B/C or '') */
function calTeam_(c, shiftDate, shift) {   // per-date calendar (ROTA_CAL): team, '' = nobody works, null = date not in the calendar
  const m = /^(\d{4})-(\d{2})-(\d{2})\|(.+)$/.exec(String(c.ROTA_CAL || '')), q = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shiftDate);
  if (!m || !q) return null;
  const days = m[4].split(','), k = Math.round((Date.UTC(+q[1], +q[2] - 1, +q[3]) - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 864e5);
  if (k < 0 || k >= days.length) return null;
  const t = (days[k] || '--').charAt(shift === 'day' ? 0 : 1);
  return t === '-' ? '' : t;
}
function rotaTeam_(c, shiftDate, shift) {
  const ct = calTeam_(c, shiftDate, shift);
  if (ct !== null) return ct;
  const m = /^(\d{4})-(\d{2})-(\d{2})\|(.+)$/.exec(String(c.ROTA || ''));
  if (!m) return '';
  const days = m[4].split(','), d0 = Date.UTC(+m[1], +m[2] - 1, +m[3]), q = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shiftDate);
  if (!q || !days.length) return '';
  const k = Math.round((Date.UTC(+q[1], +q[2] - 1, +q[3]) - d0) / 864e5), i = ((k % days.length) + days.length) % days.length;
  const t = (days[i] || '--').charAt(shift === 'day' ? 0 : 1);
  return t === '-' ? '' : t;
}
/* the shift running at `now`, its date and minutes left (Bangkok time from the script time zone) */
function shiftNow_(c, now) {
  const tz = Session.getScriptTimeZone(), f = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss').slice(0, 16);
  const t = f(now), today = t.slice(0, 10), mins = hm_(t.slice(11, 16)), ds = hm_(c.DAY_START || '08:00'), de = hm_(c.DAY_END || '20:00');
  const yday = f(new Date(now.getTime() - 864e5)).slice(0, 10);
  if (mins >= ds && mins < de) return { shift: 'day', shiftDate: today, left: de - mins };
  if (mins >= de) return { shift: 'night', shiftDate: today, left: 1440 - mins + ds };
  return { shift: 'night', shiftDate: yday, left: ds - mins };
}
/* which systems already have a reading in this shift (PC data in DB + phone rows in Inbox) */
function shiftMissing_(shiftDate, shift) {
  const have = {};
  try {
    const txt = dbRead_();
    if (txt) { const o = JSON.parse(txt); (o.records || []).forEach(r => { if (r && !r.fromEvent && r.shiftDate === shiftDate && r.shift === shift && r.systemType) have[r.systemType] = 1; }); }
  } catch (e) { /* DB not readable → phone rows only */ }
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INBOX);
  if (sh && sh.getLastRow() > 1) {
    const iD = HEAD.indexOf('shiftDate'), iS = HEAD.indexOf('shift');
    sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getDisplayValues().forEach(v => {
      if (normDate_(v[iD]) !== shiftDate || v[iS] !== shift) return;
      SYS.forEach(x => { if (String(v[HEAD.indexOf(x[1])]).trim() !== '') have[x[0]] = 1; });
    });
  }
  return SYS.map(x => x[0]).filter(k => !have[k]);
}
function normDate_(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thDay_(ymd) { const p = ymd.split('-'); return (+p[2]) + ' ' + TH_MON[+p[1] - 1] + ' ' + String(+p[0] + 543).slice(-2); }
/* ---- LINE card (Flex Message): coloured header, big team/shift, ✅/❌ per system, time left, button to the phone page ---- */
const SYS_FULL = { servo: 'Servo Hydraulic', auxiliary: 'Auxiliary Hydraulic', lubrication: 'Oil Lubrication' };
const leftText_ = m => m >= 60 ? Math.floor(m / 60) + ' ชม. ' + (m % 60) + ' นาที' : m + ' นาที';
function shiftCard_(c, sn, miss, kind) {   // kind: alert | check | test
  const team = rotaTeam_(c, sn.shiftDate, sn.shift), shName = sn.shift === 'day' ? 'กะเช้า' : 'กะดึก';
  const range = sn.shift === 'day' ? (c.DAY_START || '08:00') + '–' + (c.DAY_END || '20:00') : (c.DAY_END || '20:00') + '–' + (c.DAY_START || '08:00');
  const done = !miss.length, RED = '#E53935', GREEN = '#1E9E5B', BLUE = '#3E6AC9';
  const head = kind === 'test' ? '✅ ทดสอบระบบแจ้งเตือน' : done ? '✅ ลงระดับน้ำมันครบแล้ว' : kind === 'alert' ? '⚠️ แจ้งเตือน! ยังไม่ลงระดับน้ำมัน' : '📋 สถานะกะตอนนี้';
  const color = done ? GREEN : BLUE;   // design 2 (หุ่นไฮโดร): blue card, green when everything is in
  const txt = (t, o) => Object.assign({ type: 'text', text: String(t), wrap: true }, o || {});
  const rows = SYS.map(x => { const bad = miss.indexOf(x[0]) >= 0; return { type: 'box', layout: 'horizontal', spacing: 'md', paddingAll: '8px', cornerRadius: '8px', backgroundColor: bad ? '#FDECEC' : '#EAF7F0',
    contents: [txt(bad ? '❌' : '✅', { flex: 0, size: 'md' }), txt(SYS_FULL[x[0]], { flex: 5, size: 'md', weight: 'bold', color: bad ? '#B42318' : '#14653F' }), txt(bad ? 'ยังไม่ลง' : 'ลงแล้ว', { flex: 2, size: 'sm', align: 'end', color: bad ? '#B42318' : '#14653F', gravity: 'center' })] }; });
  const body = [txt((team ? 'ทีม ' + team + ' · ' : '') + shName, { size: 'xxl', weight: 'bold', color: '#1D2533' }), txt(thDay_(sn.shiftDate) + '  (' + range + ')', { size: 'sm', color: '#6B7280', margin: 'xs' }),
    { type: 'separator', margin: 'lg' }, { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg', contents: rows }];
  if (kind === 'test') body.push(txt('บอทจะเตือนกลุ่มนี้ก่อนหมดกะ ' + lineProps_().before + ' นาที ถ้ายังลงไม่ครบ 3 ระบบ · พิมพ์ "เช็ค" ดูสถานะได้ทุกเมื่อ', { size: 'sm', color: '#4B5563', margin: 'lg' }));
  else if (!done) body.push({ type: 'box', layout: 'horizontal', margin: 'lg', paddingAll: '10px', cornerRadius: '8px', backgroundColor: '#FFF4E5', contents: [txt('⏰ เหลือเวลา ' + leftText_(sn.left) + (kind === 'alert' ? ' ลงด้วยจ้า 🙏' : ''), { weight: 'bold', color: '#B45309', size: 'md' })] });
  const link = /^https:\/\/[^\s]{8,900}$/.test(c.PHONE_LINK || '') ? c.PHONE_LINK : '';
  const bubble = { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: color, paddingAll: '16px', contents: [txt(head, { color: '#FFFFFF', weight: 'bold', size: 'lg' }), txt('HRM Hydraulic · ระดับน้ำมันไฮดรอลิก', { color: '#FFFFFFCC', size: 'xs', margin: 'xs' })] },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body } };
  const site = /^(https:\/\/[^\/?#]+)/.exec(c.PHONE_LINK || '');
  if (site) bubble.hero = { type: 'image', url: site[1] + '/line/' + (done ? 'robot-ok.png' : 'robot-alert.png'), size: 'full', aspectRatio: '20:13', aspectMode: 'cover' };
  if (link && !done) bubble.footer = { type: 'box', layout: 'vertical', paddingAll: '12px', contents: [{ type: 'button', style: 'primary', color: color, height: 'md', action: { type: 'uri', label: '📱 เปิดหน้าบันทึก', uri: link } }] };
  const alt = (kind === 'test' ? '✅ ทดสอบระบบแจ้งเตือน · ' : '') + (team ? 'ทีม ' + team + ' ' : '') + shName + ' ' + thDay_(sn.shiftDate) + ' · ' + (done ? 'ลงครบ 3 ระบบแล้ว' : '⚠️ ยังไม่ลง: ' + miss.map(k => SYS_NAME[k]).join(', '));
  return { type: 'flex', altText: alt.slice(0, 390), contents: bubble };
}
function alertText_(c, sn, miss) {
  const team = rotaTeam_(c, sn.shiftDate, sn.shift), shName = sn.shift === 'day' ? 'กะเช้า' : 'กะดึก';
  const range = sn.shift === 'day' ? (c.DAY_START || '08:00') + '–' + (c.DAY_END || '20:00') : (c.DAY_END || '20:00') + '–' + (c.DAY_START || '08:00');
  const all = miss.length === SYS.length;
  return '⚠️ แจ้งเตือนลงระดับน้ำมันไฮดรอลิก\n' + shName + ' ' + thDay_(sn.shiftDate) + ' (' + range + ')' + (team ? ' · ทีม ' + team : '') + '\n' +
    (all ? (team ? 'ทีม ' + team + ' ' : '') + 'ยังไม่ได้ลงข้อมูลกะนี้เลย' : 'ยังไม่ได้ลง: ' + miss.map(k => SYS_NAME[k]).join(', ')) +
    '\nเหลือเวลาอีก ' + sn.left + ' นาที ลงด้วยจ้า 🙏' + (c.PHONE_LINK ? '\n' + c.PHONE_LINK : '');
}
/* timer (every 5 minutes): post once per shift, inside the last N minutes */
function lineTick(nowMs) {
  const L = lineProps_();
  if (!L.on || !L.token || !L.group) return { ok: true, skip: 'off' };
  const c = cfg_(), sn = shiftNow_(c, nowMs ? new Date(nowMs) : new Date()), key = sn.shiftDate + '_' + sn.shift;
  if (sn.left > L.before || L.last === key) return { ok: true, skip: 'not_now', shift: sn };
  if (calTeam_(c, sn.shiftDate, sn.shift) === '') return { ok: true, skip: 'no_shift', shift: sn };   // holiday / shutdown in the shift calendar
  const miss = shiftMissing_(sn.shiftDate, sn.shift);
  PropertiesService.getScriptProperties().setProperty('LINE_LAST', key);
  if (!miss.length) return { ok: true, complete: true, shift: sn };
  const r = linePush_(alertText_(c, sn, miss), shiftCard_(c, sn, miss, 'alert'));
  return { ok: r.ok, sent: r.ok, missing: miss, shift: sn, error: r.error };
}
/* run once from the editor: allows sending to LINE and makes the 5-minute timer */
function setupLine() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'lineTick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('lineTick').timeBased().everyMinutes(5).create();
  try { UrlFetchApp.fetch('https://api.line.me/v2/bot/info', { muteHttpExceptions: true }); } catch (e) { }
  return 'OK — LINE timer is on (every 5 minutes)';
}
function lineTimerOn_() { try { return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'lineTick'); } catch (e) { return null; } }
/* PC program: {action:'line', key, fn: status|save|test|preview} */
function lineApi_(p, c) {
  const pr = PropertiesService.getScriptProperties();
  if (p.fn === 'save') {
    if (p.token != null && String(p.token).trim()) {
      const tok = String(p.token).trim();
      if (!/^[A-Za-z0-9+/=._-]{20,400}$/.test(tok)) return { ok: false, error: 'bad_token' };
      const chk = lineFetch_('/info', 'get', null, tok);
      if (chk.code !== 200) return { ok: false, error: 'token_refused', code: chk.code };
      pr.setProperties({ LINE_TOKEN: tok, LINE_BOT: chk.body.displayName || '' });
    }
    if (p.clearGroup) { pr.setProperty('LINE_GROUP', ''); pr.setProperty('LINE_GROUP_NAME', ''); }
    if (p.on != null) pr.setProperty('LINE_ON', p.on ? '1' : '0');
    if (p.before != null && isFinite(Number(p.before))) pr.setProperty('LINE_BEFORE', String(Math.max(5, Math.min(120, Math.round(Number(p.before))))));
  }
  const L = lineProps_();
  if (p.fn === 'test') {
    const sn = shiftNow_(c, new Date());
    const r = linePush_('✅ ทดสอบระบบแจ้งเตือน HRM Hydraulic\nบอทพร้อมแจ้งเตือนกลุ่มนี้แล้ว\nจะเตือนก่อนหมดกะ ' + L.before + ' นาที ถ้ายังลงระดับน้ำมันไม่ครบ\n(ตอนนี้ ' + (sn.shift === 'day' ? 'กะเช้า' : 'กะดึก') + (rotaTeam_(c, sn.shiftDate, sn.shift) ? ' ทีม ' + rotaTeam_(c, sn.shiftDate, sn.shift) : '') + ')', shiftCard_(c, sn, shiftMissing_(sn.shiftDate, sn.shift), 'test'));
    if (!r.ok) return Object.assign({ ok: false }, r);
  }
  const out = { ok: true, hasToken: !!L.token, bot: pr.getProperty('LINE_BOT') || '', group: !!L.group, groupName: L.groupName, on: L.on, before: L.before, timer: lineTimerOn_(), lastAt: L.lastAt, lastMsg: L.lastMsg, err: L.err, hookAt: pr.getProperty('LINE_HOOK_AT') || '', hookLast: pr.getProperty('LINE_HOOK_LAST') || '' };
  {
    const sn = shiftNow_(c, new Date());
    out.now = { shift: sn.shift, shiftDate: sn.shiftDate, left: sn.left, team: rotaTeam_(c, sn.shiftDate, sn.shift), missing: shiftMissing_(sn.shiftDate, sn.shift) };
    out.now.text = out.now.missing.length ? alertText_(c, sn, out.now.missing) : '';
  }
  if (L.token) {
    try { const q = lineFetch_('/message/quota', 'get', null, L.token), u = lineFetch_('/message/quota/consumption', 'get', null, L.token); if (q.code === 200) out.quota = { type: q.body.type, limit: q.body.value == null ? null : q.body.value, used: u.body.totalUsage == null ? null : u.body.totalUsage }; } catch (e) { }
  }
  return out;
}
/* LINE webhook (LINE posts here): remember the group when the bot joins; "เช็ค" in the group replies the shift status (replies are free) */
function lineHook_(p) {
  const L = lineProps_(), pr = PropertiesService.getScriptProperties();
  pr.setProperties({ LINE_HOOK_AT: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss').slice(0, 16), LINE_HOOK_LAST: (p.events || []).map(e => e.type + ((e.source || {}).type ? '@' + e.source.type : '')).join(',').slice(0, 80) || 'verify' });
  (p.events || []).forEach(ev => {
    const src = ev.source || {}, gid = src.groupId || '';
    const txt = ev.type === 'message' && ev.message && ev.message.type === 'text' ? String(ev.message.text || '').trim() : '';
    /* link this group: when the bot joins, or someone types "ตั้งกลุ่ม" (also the first message seen in a group if none is linked yet) */
    if (gid && (ev.type === 'join' || /^(ตั้งกลุ่ม|ตั้งกลุ่มนี้|hrm)$/i.test(txt) || (!L.group && ev.type === 'message'))) {
      pr.setProperty('LINE_GROUP', gid);
      let name = ''; try { const g = lineFetch_('/group/' + gid + '/summary', 'get', null, L.token); name = (g.body && g.body.groupName) || ''; } catch (e) { }
      pr.setProperty('LINE_GROUP_NAME', name);
      L.group = gid;
      if (ev.replyToken && L.token) lineFetch_('/message/reply', 'post', { replyToken: ev.replyToken, messages: [{ type: 'text', text: 'สวัสดีครับ 👋 บอทแจ้งเตือน HRM Hydraulic เชื่อมกับกลุ่มนี้แล้ว\nจะเตือนก่อนหมดกะถ้ายังลงระดับน้ำมันไม่ครบ\nพิมพ์ "เช็ค" เพื่อดูสถานะกะตอนนี้' }] }, L.token);
    } else if (ev.type === 'leave' && gid && gid === L.group) {
      pr.setProperty('LINE_GROUP', ''); pr.setProperty('LINE_GROUP_NAME', '');
    } else if (ev.type === 'message' && /^(เช็ค|เช็ก|check|สถานะ)$/i.test(txt) && ev.replyToken && L.token && (!L.group || gid === L.group)) {
      const c = cfg_(), sn = shiftNow_(c, new Date()), miss = shiftMissing_(sn.shiftDate, sn.shift), team = rotaTeam_(c, sn.shiftDate, sn.shift);
      const t = (sn.shift === 'day' ? 'กะเช้า ' : 'กะดึก ') + thDay_(sn.shiftDate) + (team ? ' · ทีม ' + team : '') + '\n' +
        (miss.length ? 'ยังไม่ได้ลง: ' + miss.map(k => SYS_NAME[k]).join(', ') : '✅ ลงครบ 3 ระบบแล้ว') + '\nเหลือเวลา ' + Math.floor(sn.left / 60) + ' ชม. ' + (sn.left % 60) + ' นาที';
      const rr = lineFetch_('/message/reply', 'post', { replyToken: ev.replyToken, messages: [shiftCard_(c, sn, miss, 'check')] }, L.token);
      if (rr.code === 400) lineFetch_('/message/reply', 'post', { replyToken: ev.replyToken, messages: [{ type: 'text', text: t }] }, L.token);
    }
  });
  return { ok: true };
}

/* ---------- called from the phone page (google.script.run) ---------- */
function checkCode(code) {
  return { ok: String(code || '').trim() === cfg_().TEAM_CODE };
}

function submitReading(code, r) {
  const c = cfg_();
  if (String(code || '').trim() !== c.TEAM_CODE) return { ok: false, error: 'bad_code' };
  if (r && typeof r === 'object') r.team = teamFor_(r.recorder, c) || r.team;   // the team comes from the name
  const err = validate_(r, c);
  if (err) return { ok: false, error: err };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INBOX);
    const n = sh.getLastRow() - 1;
    if (n > 0) {   // same id sent twice (retry after a weak signal) → already stored
      const ids = sh.getRange(Math.max(2, n - 1500 + 2), 1, Math.min(n, 1500), 1).getValues();
      if (ids.some(x => String(x[0]) === r.id)) return { ok: true, id: r.id, duplicate: true };
    }
    const num = v => (v === '' || v == null) ? '' : Number(v);
    const row = [r.id, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      r.shiftDate, r.shift, r.time, String(r.recorder).trim().toUpperCase(), r.team, r.status,
      num(r.servoL), num(r.servoT), num(r.auxL), num(r.auxT), num(r.lubL), num(r.lubT),
      String(r.note || '').slice(0, 200), String(r.device || '').slice(0, 80), ''];
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), 3, 1, 3).setNumberFormat('@');
    if (r.replaces) linkReplaced_(String(r.replaces), r.id);
    return { ok: true, id: r.id };
  } finally { lock.releaseLock(); }
}

function submitEvent(code, e) {
  const c = cfg_();
  if (String(code || '').trim() !== c.TEAM_CODE) return { ok: false, error: 'bad_code' };
  if (e && typeof e === 'object') e.team = teamFor_(e.recorder, c) || e.team;
  const err = validateEv_(e, c);
  if (err) return { ok: false, error: err };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const sh = evSheet_();
    const n = sh.getLastRow() - 1;
    if (n > 0) {
      const ids = sh.getRange(Math.max(2, n - 1500 + 2), 1, Math.min(n, 1500), 1).getValues();
      if (ids.some(x => String(x[0]) === e.id)) return { ok: true, id: e.id, duplicate: true };
    }
    const ty = e.type || 'refill', lv = ty !== 'maint', tk = ty === 'refill' || ty === 'oil_change';
    const txt = (v, n) => String(v || '').trim().slice(0, n || 200);
    sh.appendRow([e.id, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      e.shiftDate, e.shift, e.time, String(e.recorder).trim().toUpperCase(), e.team, e.system, ty, tk ? Math.round(Number(e.tanks)) : '',
      lv ? Number(e.beforeL) : '', lv ? Number(e.afterL) : '', tk ? e.reason : '', tk ? txt(e.reasonText) : '', txt(e.device, 80), '',
      ty === 'oil_change' ? Number(e.drainedL) : '', txt(e.location, 120), ty === 'leak' ? txt(e.cause) : '', ty === 'leak' || ty === 'maint' ? txt(e.action) : '']);
    sh.getRange(sh.getLastRow(), 3, 1, 3).setNumberFormat('@');
    if (e.replaces) linkReplaced_(String(e.replaces), e.id);
    return { ok: true, id: e.id };
  } finally { lock.releaseLock(); }
}

const SERVER_VER = 'v1.8.4';
/* phone check page asks this to prove the phone can reach the sheet */
function phoneCheck() {
  return { ok: true, version: SERVER_VER, time: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') };
}

/* phone: script errors seen on a phone (for checking phones that do not work) */
function logClientError(info) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('ClientErrors');
    if (!sh) { sh = ss.insertSheet('ClientErrors'); sh.appendRow(['at', 'where', 'message', 'phone / browser', 'page']); sh.setFrozenRows(1); }
    if (sh.getLastRow() > 500) sh.deleteRow(2);
    const t = (v, n) => String((info && info[v]) || '').slice(0, n);
    sh.appendRow([Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'), t('where', 60), t('msg', 300), t('ua', 200), t('url', 100).replace(/([?&]c=)[^&]*/, '$1***')]);
  } catch (err) { /* never fail the phone because of logging */ }
  return { ok: true };
}

/* phone: take back an entry it sent, as long as the PC program has not pulled it yet */
function cancelEntry(code, id, why, by) {
  if (String(code || '').trim() !== cfg_().TEAM_CODE) return { ok: false, error: 'bad_code' };
  id = String(id || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return { ok: false, error: 'bad_id' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const where = [[INBOX, HEAD.indexOf('imported') + 1], [EVENTS, IMP_EV + 1]];
    for (const w of where) {
      const sh = ss.getSheetByName(w[0]);
      if (!sh || sh.getLastRow() < 2) continue;
      const n = sh.getLastRow() - 1, ids = sh.getRange(2, 1, n, 1).getValues();
      for (let i = n - 1; i >= 0; i--) {
        if (String(ids[i][0]) !== id) continue;
        if (sh.getRange(i + 2, w[1]).getValue()) return { ok: false, error: 'already_imported' };
        const head = w[0] === INBOX ? HEAD : HEAD_EV, kind = w[0] === INBOX ? 'reading' : 'event';
        const vals = sh.getRange(i + 2, 1, 1, head.length).getDisplayValues()[0], o = {};
        head.forEach((h, j) => o[h] = vals[j]);
        logSheet_().appendRow(['LOG-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20), Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
          why === 'edit' ? 'edit' : 'cancel', id, kind === 'reading' ? 'reading' : (o.type || 'refill'), o.recorder, o.team, o.shiftDate, o.shift, o.time,
          summary_(kind, o), String(by || '').trim().toUpperCase().slice(0, 20), '', JSON.stringify(o), '']);
        sh.deleteRow(i + 2);
        return { ok: true, id: id };
      }
    }
    return { ok: false, error: 'not_found' };
  } finally { lock.releaseLock(); }
}

function validateEv_(e, c) {
  if (!e || typeof e !== 'object') return 'bad_data';
  const base = validate_(Object.assign({}, e, { status: 'run', servoL: '1', servoT: '', auxL: '', auxT: '', lubL: '', lubT: '' }), c);
  if (base) return base;
  const ty = e.type || 'refill';
  if (!(ty in EV_TYPES)) return 'bad_type';
  if (SYS.map(s => s[0]).indexOf(e.system) < 0) return 'bad_system';
  if (ty === 'maint') return String(e.action || '').trim() ? '' : 'no_action';
  const b = Number(e.beforeL), a = Number(e.afterL);
  if (e.beforeL === '' || e.afterL === '' || e.beforeL == null || e.afterL == null || !isFinite(b) || !isFinite(a) || b < 0 || a < 0 || b > 20000 || a > 20000) return 'bad_level';
  if (ty === 'leak') {
    if (a >= b) return 'leak_not_lower';
    return String(e.location || '').trim() ? '' : 'no_location';
  }
  const k = Number(e.tanks);
  if (!isFinite(k) || k < 1 || k > 50 || Math.round(k) !== k) return 'bad_tanks';
  if (ty === 'refill' && a <= b) return 'after_not_higher';
  if (ty === 'oil_change') {
    const dr = Number(e.drainedL);
    if (e.drainedL === '' || e.drainedL == null || !isFinite(dr) || dr < 0 || dr > 20000) return 'bad_drained';
  }
  if (EV_TYPES[ty].indexOf(e.reason) < 0) return 'bad_reason';
  if (e.reason === 'other' && !String(e.reasonText || '').trim()) return 'no_reason_text';
  return '';
}

function recent(code) {
  if (String(code || '').trim() !== cfg_().TEAM_CODE) return { ok: false, error: 'bad_code' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INBOX);
  const out = [];
  const take = (sheet, head, kind) => {
    if (!sheet) return;
    const n = sheet.getLastRow() - 1; if (n < 1) return;
    const k = Math.min(n, 8);
    sheet.getRange(n - k + 2, 1, k, head.length).getDisplayValues().forEach(v => {
      const o = {}; head.forEach((h, i) => { if (h === 'kind') o.entryKind = v[i]; else if (h !== 'device' && h !== 'data') o[h] = v[i]; }); o.kind = kind; if (!o.receivedAt) o.receivedAt = o.at; out.push(o);
    });
  };
  take(sh, HEAD, 'reading');
  take(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGS), HEAD_LOG, 'log');
  take(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS), HEAD_EV, 'event');
  out.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return { ok: true, rows: out.slice(0, 8) };
}

function validate_(r, c) {
  if (!r || typeof r !== 'object') return 'bad_data';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(r.id || ''))) return 'bad_id';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.shiftDate || ''))) return 'bad_date';
  if (r.shift !== 'day' && r.shift !== 'night') return 'bad_shift';
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(r.time || ''));
  if (!m) return 'bad_time';
  const mins = +m[1] * 60 + +m[2], ds = hm_(c.DAY_START || '08:00'), de = hm_(c.DAY_END || '20:00');
  if (r.shift === 'day' ? !(mins >= ds && mins < de) : !(mins >= de || mins < ds)) return 'time_shift';
  if (!String(r.recorder || '').trim()) return 'no_recorder';
  if (recorders_(c).indexOf(String(r.recorder).trim().toUpperCase()) < 0) return 'bad_recorder';
  if (['A', 'B', 'C'].indexOf(r.team) < 0) return 'bad_team';
  if (r.status !== 'run' && r.status !== 'stop') return 'bad_status';
  let any = false;
  for (const s of SYS) {
    const L = r[s[1]], T = r[s[2]];
    if (L !== '' && L != null) { const v = Number(L); if (!isFinite(v) || v < 0 || v > 20000) return 'bad_level'; any = true; }
    else if (T !== '' && T != null) return 'temp_without_level';
    if (T !== '' && T != null) { const v = Number(T); if (!isFinite(v) || v < -20 || v > 200) return 'bad_temp'; }
  }
  if (!any) return 'no_values';
  // not in the future (more than 10 minutes ahead), not older than 62 days
  const p = r.shiftDate.split('-').map(Number);
  let ts = new Date(p[0], p[1] - 1, p[2], +m[1], +m[2]).getTime();
  if (r.shift === 'night' && mins < ds) ts += 86400000;
  const now = Date.now();
  if (ts > now + 10 * 60000) return 'future';
  if (ts < now - 62 * 86400000) return 'too_old';
  return '';
}

function include(f) { return HtmlService.createHtmlOutputFromFile(f).getContent(); }
