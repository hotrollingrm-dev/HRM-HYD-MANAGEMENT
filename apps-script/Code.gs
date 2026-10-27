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
const RECORDERS = ['TOM', 'NES', 'NU', 'JOE', 'SONG', 'WAT', 'BAS', 'NOOM', 'TIME', 'JILL', 'OIL', 'SUT', 'MOS'];   // default list; the PC program keeps the RECORDERS row in Config up to date
function recorders_(c) {
  const l = String((c && c.RECORDERS) || '').toUpperCase().split(/[\s,;]+/).filter(n => /^[A-Z0-9]{1,12}$/.test(n));
  return l.length ? l : RECORDERS;
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
      ['DAY_START', '07:00', 'เวลาเริ่มกะเช้า'],
      ['DAY_END', '19:00', 'เวลาเริ่มกะดึก'],
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
  t.boot = JSON.stringify({ dayStart: c.DAY_START || '07:00', dayEnd: c.DAY_END || '19:00', machine: c.MACHINE || 'HRM Process', recorders: recorders_(c),
    url: url, code: pc && pc === c.TEAM_CODE ? pc : '', codeErr: pc && pc !== c.TEAM_CODE ? 'bad_code' : '', check: !!p.check });
  return t.evaluate().setTitle('HRM Hydraulic · บันทึกระดับน้ำมัน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
function doPost(e) {   // desktop may also use POST {action,key,ids}
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { p = {}; }
  if (p.action === 'phone') return json_(phoneApi_(p));
  return json_(api_(p));
}

/* phone page hosted outside Apps Script (e.g. GitHub Pages) calls the same functions through POST {action:'phone', fn, args} */
const PHONE_FNS = { phoneBoot: phoneBoot, checkCode: checkCode, submitReading: submitReading, submitEvent: submitEvent,
  cancelEntry: cancelEntry, recent: recent, logClientError: logClientError, phoneCheck: phoneCheck };
function phoneApi_(p) {
  const fn = PHONE_FNS[String(p.fn || '')];
  if (!fn) return { ok: false, error: 'unknown_fn' };
  try { return fn.apply(null, Array.isArray(p.args) ? p.args.slice(0, 4) : []); }
  catch (err) { return { ok: false, error: 'server_error', detail: String(err && err.message || err).slice(0, 200) }; }
}
/* settings the phone page needs; the recorder list only after the right team code */
function phoneBoot(code) {
  const c = cfg_(), ok = !!code && String(code).trim() === c.TEAM_CODE;
  return { ok: true, codeOk: ok, dayStart: c.DAY_START || '07:00', dayEnd: c.DAY_END || '19:00', machine: c.MACHINE || 'HRM Process',
    recorders: ok ? recorders_(c) : [], version: SERVER_VER };
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
  if (p.action === 'names') {   // the PC program sends its recorder list
    const list = String(p.names || '').toUpperCase().split(/[\s,;]+/).filter(n => /^[A-Z0-9]{1,12}$/.test(n));
    if (!list.length) return { ok: false, error: 'bad_names' };
    const cs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG);
    const keys = cs.getRange(1, 1, Math.max(1, cs.getLastRow()), 1).getValues().map(r => String(r[0]).trim());
    let row = keys.indexOf('RECORDERS') + 1;
    if (!row) { row = cs.getLastRow() + 1; cs.getRange(row, 1).setValue('RECORDERS'); cs.getRange(row, 3).setValue('รายชื่อผู้บันทึก (ส่งมาจากโปรแกรมบนคอม)'); }
    cs.getRange(row, 2).setNumberFormat('@').setValue(list.join(' '));
    return { ok: true, names: list };
  }
  return { ok: false, error: 'unknown_action' };
}

/* ---------- called from the phone page (google.script.run) ---------- */
function checkCode(code) {
  return { ok: String(code || '').trim() === cfg_().TEAM_CODE };
}

function submitReading(code, r) {
  const c = cfg_();
  if (String(code || '').trim() !== c.TEAM_CODE) return { ok: false, error: 'bad_code' };
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

const SERVER_VER = 'v1.7.2';
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
  const mins = +m[1] * 60 + +m[2], ds = hm_(c.DAY_START || '07:00'), de = hm_(c.DAY_END || '19:00');
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
