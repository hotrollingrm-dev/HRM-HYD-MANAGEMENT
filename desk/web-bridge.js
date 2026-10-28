/* HRM HYDRAULIC MANAGEMENT · PC web app bridge
 * The program was built for a desktop window that offers window.pywebview.api (shared data file, save dialogs …).
 * In the browser this file offers the same functions, but the shared data lives in the Google Sheet
 * (Apps Script Web App, action "desk"). Sign-in once per browser: Web App link + SYNC_KEY + a name for this PC.
 */
(function () {
  'use strict';
  var LSK = 'hrmWeb_';
  var ls = {
    get: function (k) { try { return localStorage.getItem(LSK + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(LSK + k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(LSK + k); } catch (e) {} }
  };
  var API_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  var DEV_RE = /^http:\/\/localhost:\d+\/exec$/;
  function okApi(u) { return API_RE.test(u || '') || (/^localhost$|^127\./.test(location.hostname) && DEV_RE.test(u || '')); }
  function conf() { return window.HRM_CONFIG || {}; }
  var S = { api: '', key: '', pc: '', info: null, rev: null, revAt: 0, sheetUrl: '' };

  function post(body, timeout) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('POST', S.api, true);
      try { x.setRequestHeader('Content-Type', 'text/plain;charset=utf-8'); } catch (e) {}
      x.timeout = timeout || 60000;
      x.onload = function () {
        if (x.status < 200 || x.status >= 300) { rej(new Error('http_' + x.status)); return; }
        var o; try { o = JSON.parse(x.responseText); } catch (e) { rej(new Error('bad_reply')); return; }
        res(o);
      };
      x.onerror = function () { rej(new Error('network')); };
      x.ontimeout = function () { rej(new Error('timeout')); };
      x.send(JSON.stringify(body));
    });
  }
  function desk(fn, extra) {
    var b = { action: 'desk', key: S.key, fn: fn };
    for (var k in extra) b[k] = extra[k];
    return post(b);
  }

  /* ---- the functions the program expects (same answers as the desktop version) ---- */
  var api = {
    storage_info: function () {
      var p = S.infoP && Date.now() - S.infoAt < 20000 ? S.infoP : desk('info'); S.infoP = null;   // reuse the start-up check
      return p.then(function (r) {
        if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'error' };
        S.sheetUrl = r.url || '';
        return { ok: true, dir: 'Google Sheet · ' + (r.sheet || ''), file: r.url || '', exists: !!r.exists, computer: S.pc, writable: true, network: true, rev: r.rev, modified: r.modified };
      }, function (e) { return { ok: false, error: e.message }; });
    },
    web_conf: function () { return { api: S.api, key: S.key }; },   // the program pulls phone entries from the same Web App
    data_load: function () { return desk('load').catch(function (e) { return { ok: false, error: e.message }; }); },
    data_rev: function () {
      /* polling: ask Google at most every 30 s, and not while the tab is hidden */
      if (S.rev && (Date.now() - S.revAt < 30000 || document.hidden)) return Promise.resolve(S.rev);
      return desk('rev').then(function (r) { if (r && r.ok) { S.rev = r; S.revAt = Date.now(); } return r; }, function (e) { return { ok: false, error: e.message }; });
    },
    data_save: function (payload, base_rev) {
      return desk('save', { payload: payload, base_rev: base_rev, by: S.pc }).then(function (r) {
        if (r && r.ok) { S.rev = { ok: true, rev: r.rev, exists: true }; S.revAt = Date.now(); }
        return r;
      }, function (e) { return { ok: false, error: e.message }; });
    },
    /* local safety copy in this browser (the Google Sheet keeps daily copies too) */
    backup: function (payload) { ls.set('backup', payload); return Promise.resolve({ ok: true }); },
    load_backup: function () { return Promise.resolve(ls.get('backup')); },
    open_data_folder: function () { if (S.sheetUrl) window.open(S.sheetUrl, '_blank'); return Promise.resolve(); },
    choose_data_dir: function () { signOut(); return Promise.resolve({ ok: false, cancelled: true }); },
    toggle_fullscreen: function () {
      try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) {}
      return Promise.resolve();
    },
    app_info: function () { return Promise.resolve({ name: 'HRM Hydraulic Management (web)', version: 'web', data: 'Google Sheet' }); },
    app_ready: function () { return Promise.resolve(); },
    log_js: function (m) { try { console.warn('[HRM]', m); } catch (e) {} return Promise.resolve(); },
    set_dirty: function () { return Promise.resolve(); },
    close_ack: function () { return Promise.resolve(); },
    close_app: function () { try { window.close(); } catch (e) {} return Promise.resolve(); }
  };

  function signOut() { ls.del('key'); location.reload(); }
  window.hrmWebSignOut = signOut;

  /* ---- sign-in panel (once per browser) ---- */
  function css() {
    var s = document.createElement('style');
    s.textContent = '#hrm-web{position:fixed;top:0;right:0;bottom:0;left:0;z-index:100000;display:grid;place-items:center;background:rgba(233,237,244,.94);font-family:Thonburi,"Noto Sans Thai",Tahoma,sans-serif;color:#111722}' +
      '#hrm-web .bx{width:min(520px,92vw);background:#fff;border-radius:24px;padding:26px 28px;box-shadow:0 24px 60px rgba(18,28,48,.18)}' +
      '#hrm-web h2{margin:0 0 4px;font-size:22px}#hrm-web p{margin:0 0 16px;color:#535D6D;font-size:14px;line-height:1.5}' +
      '#hrm-web label{display:block;font-size:13px;font-weight:700;color:#535D6D;margin:12px 0 6px}#hrm-web label span{font-weight:500;color:#828B9A;margin-left:4px}' +
      '#hrm-web input{width:100%;box-sizing:border-box;height:48px;border:1.5px solid #DDE2EA;border-radius:14px;padding:0 14px;font:inherit;font-size:15px;outline:none}' +
      '#hrm-web input:focus{border-color:#2A64E8;box-shadow:0 0 0 4px #E4ECFD}' +
      '#hrm-web button{margin-top:18px;width:100%;height:52px;border:0;border-radius:16px;background:#2A64E8;color:#fff;font:inherit;font-size:16px;font-weight:800;cursor:pointer}#hrm-web button:disabled{opacity:.6}' +
      '#hrm-web .er{display:none;margin-top:12px;padding:10px 12px;border-radius:12px;background:#FDF0F0;color:#9B2328;font-size:14px}' +
      '#hrm-web .ok{display:none;margin-top:12px;padding:10px 12px;border-radius:12px;background:#EAF7F0;color:#0F6B39;font-size:14px}';
    document.head.appendChild(s);
  }
  var WHY = { bad_key: 'SYNC_KEY ไม่ถูกต้อง (ดูในแผ่น Config ของ Google Sheet)', network: 'ติดต่อ Web App ไม่ได้ (เน็ต หรือลิงก์ Web App ผิด / ยังไม่ได้ Deploy ให้ทุกคน)', timeout: 'Google ตอบช้าเกินไป ลองใหม่', bad_reply: 'ลิงก์นี้ไม่ใช่ Web App ของระบบ', unknown_fn: 'Code.gs ใน Apps Script ยังเป็นเวอร์ชันเก่า ต้องวางใหม่แล้ว Deploy เวอร์ชันใหม่' };
  function why(k) { return WHY[k] || (/^http_/.test(k) ? 'Web App ตอบกลับ ' + k.slice(5) : k); }

  function panel(msg) {
    var el = document.getElementById('hrm-web');
    if (!el) { el = document.createElement('div'); el.id = 'hrm-web'; document.body.appendChild(el); }
    el.innerHTML = '<div class="bx"><h2>HRM HYDRAULIC MANAGEMENT</h2><p>เปิดใช้งานบนเว็บครั้งแรกของเครื่องนี้ · ข้อมูลเก็บใน Google Sheet ใช้ร่วมกันทุกเครื่อง</p>' +
      '<label>ลิงก์ Web App<span>Apps Script /exec</span></label><input id="hw-api" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec">' +
      '<label>SYNC_KEY<span>จากแผ่น Config</span></label><input id="hw-key" type="password" autocomplete="off" spellcheck="false">' +
      '<label>ชื่อเครื่องนี้<span>เช่น HRM-PC1 · แสดงว่าใครบันทึก</span></label><input id="hw-pc" maxlength="30" autocomplete="off">' +
      '<button id="hw-go">เข้าใช้งาน · Sign in</button><div class="er" id="hw-er"></div><div class="ok" id="hw-ok"></div></div>';
    document.getElementById('hw-api').value = S.api || (okApi(conf().api) ? conf().api : '');
    document.getElementById('hw-key').value = S.key || '';
    document.getElementById('hw-pc').value = S.pc || '';
    if (msg) { var er = document.getElementById('hw-er'); er.textContent = msg; er.style.display = 'block'; }
    document.getElementById('hw-go').onclick = signIn;
    (document.getElementById(S.key ? 'hw-pc' : 'hw-key')).focus();
  }
  function signIn() {
    var a = document.getElementById('hw-api').value.trim(), k = document.getElementById('hw-key').value.trim(), pc = document.getElementById('hw-pc').value.trim();
    var er = document.getElementById('hw-er'), b = document.getElementById('hw-go');
    er.style.display = 'none';
    if (!okApi(a)) { er.textContent = 'ลิงก์ Web App ต้องเป็นแบบ https://script.google.com/macros/s/…/exec'; er.style.display = 'block'; return; }
    if (!k) { er.textContent = 'กรุณาใส่ SYNC_KEY'; er.style.display = 'block'; return; }
    if (!pc) { er.textContent = 'กรุณาตั้งชื่อเครื่องนี้'; er.style.display = 'block'; return; }
    S.api = a; S.key = k; S.pc = pc; b.disabled = true; b.textContent = 'กำลังตรวจสอบ…';
    desk('info').then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'bad_reply');
      ls.set('api', a); ls.set('key', k); ls.set('pc', pc);
      if (r.exists) { finish(); return; }
      importStep();
    }).catch(function (e) { b.disabled = false; b.textContent = 'เข้าใช้งาน · Sign in'; er.textContent = why(e.message); er.style.display = 'block'; });
  }
  /* first PC: the Google Sheet has no program data yet → bring it in from the desktop version */
  function importStep() {
    var el = document.getElementById('hrm-web');
    el.innerHTML = '<div class="bx"><h2>นำข้อมูลเดิมเข้า Google Sheet</h2><p>ระบบบนเว็บยังไม่มีข้อมูล เลือกไฟล์ข้อมูลจากโปรแกรมเดิม 1 ครั้ง:<br>• ไฟล์ <b>hrm_hydraulic_data.json</b> ในโฟลเดอร์ <b>Data</b> ข้างโปรแกรม .exe<br>• หรือไฟล์ที่ได้จาก ตั้งค่า → ข้อมูล → บันทึกไฟล์ข้อมูล</p>' +
      '<input id="hw-file" type="file" accept=".json,application/json" style="height:auto;padding:12px">' +
      '<button id="hw-up" disabled>นำเข้าและเริ่มใช้งาน</button><button id="hw-empty" style="background:#fff;color:#2A64E8;border:1.5px solid #DDE2EA">เริ่มแบบไม่มีข้อมูล</button><div class="er" id="hw-er"></div><div class="ok" id="hw-ok"></div></div>';
    var f = document.getElementById('hw-file'), up = document.getElementById('hw-up'), text = null;
    f.onchange = function () {
      var file = f.files && f.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        var er = document.getElementById('hw-er'), okb = document.getElementById('hw-ok');
        try {
          var o = JSON.parse(rd.result);
          if (!o || !Array.isArray(o.records) || !Array.isArray(o.events)) throw new Error('x');
          o.format = o.format || 'hrm-hydraulic-data';
          text = JSON.stringify(o); up.disabled = false; er.style.display = 'none';
          okb.textContent = 'พบข้อมูลระดับน้ำมัน ' + o.records.length + ' รายการ · เหตุการณ์ ' + o.events.length + ' รายการ'; okb.style.display = 'block';
        } catch (e) { text = null; up.disabled = true; okb.style.display = 'none'; er.textContent = 'ไฟล์นี้ไม่ใช่ไฟล์ข้อมูลของโปรแกรม'; er.style.display = 'block'; }
      };
      rd.readAsText(file);
    };
    up.onclick = function () {
      if (!text) return; up.disabled = true; up.textContent = 'กำลังอัปโหลด…';
      desk('save', { payload: text, base_rev: 0, by: S.pc }).then(function (r) {
        if (r && (r.ok || r.conflict)) { finish(); return; }
        throw new Error((r && r.error) || 'bad_reply');
      }).catch(function (e) { up.disabled = false; up.textContent = 'นำเข้าและเริ่มใช้งาน'; var er = document.getElementById('hw-er'); er.textContent = why(e.message); er.style.display = 'block'; });
    };
    document.getElementById('hw-empty').onclick = function () {
      /* start clean (no demo data) */
      var empty = { format: 'hrm-hydraulic-data', app: 'HRM HYDRAULIC MANAGEMENT', ver: 3, saved: Date.now(), records: [], events: [] };
      desk('save', { payload: JSON.stringify(empty), base_rev: 0, by: S.pc }).then(function () { finish(); }, function (e) { var er = document.getElementById('hw-er'); er.textContent = why(e.message); er.style.display = 'block'; });
    };
  }
  function finish() {
    var el = document.getElementById('hrm-web'); if (el) el.remove();
    window.pywebview = { api: api };
    var fire = function () { try { window.dispatchEvent(new Event('pywebviewready')); } catch (e) { var ev = document.createEvent('Event'); ev.initEvent('pywebviewready', true, true); window.dispatchEvent(ev); } };
    if (document.readyState === 'complete') setTimeout(fire, 0); else window.addEventListener('load', function () { setTimeout(fire, 0); });
  }

  function start() {
    css();
    S.api = okApi(ls.get('api')) ? ls.get('api') : (okApi(conf().api) ? conf().api : '');
    S.key = ls.get('key') || ''; S.pc = ls.get('pc') || '';
    if (!S.api || !S.key || !S.pc) { panel(''); return; }
    S.infoP = desk('info'); S.infoAt = Date.now();
    /* this browser already has the program's data → open straight away, Google is checked in the background */
    var hasLocal = false; try { hasLocal = (JSON.parse(localStorage.getItem('oilMonitorRecords') || '[]') || []).length > 0; } catch (e) { }
    if (hasLocal) { finish(); S.infoP.then(function (r) { if (r && !r.ok && r.error === 'bad_key') { S.key = ''; ls.set('key', ''); panel(why('bad_key')); } }, function () { }); return; }
    S.infoP.then(function (r) {
      if (r && r.ok && r.exists) { finish(); return; }
      if (r && r.ok) { importStep(); return; }
      panel(why((r && r.error) || 'bad_reply'));
    }, function (e) {
      /* no internet: keep working on this browser's copy; it is saved to Google when the line is back */
      if (e.message === 'network' || e.message === 'timeout') { finish(); return; }
      panel(why(e.message));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
