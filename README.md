# HRM HYD MANAGEMENT · เว็บแอป (คอม + มือถือ)

ระบบติดตามระดับน้ำมันไฮดรอลิก HRM เปิดผ่านเว็บ ไม่ต้องติดตั้งโปรแกรม ข้อมูลทั้งหมดเก็บใน Google Sheet

- **โปรแกรมบนคอม (เว็บแอป):** https://hotrollingrm-dev.github.io/HRM-HYD-MANAGEMENT/desk/
- **หน้าบันทึกบนมือถือ:** https://hotrollingrm-dev.github.io/HRM-HYD-MANAGEMENT/
- **ข้อมูล:** ส่งเข้า Google Sheet ผ่าน Apps Script (ชีตเป็นที่เก็บและสำรองข้อมูล) แล้วโปรแกรมบนคอมดึงไปทุก 1 นาที
- **เช็กมือถือ:** ต่อท้ายลิงก์ด้วย `?check=1`

```
มือถือ ──เปิดหน้าเว็บ──▶ GitHub Pages (repo นี้)
   └──ส่งข้อมูล──▶ Apps Script Web App ──▶ Google Sheet (Inbox · Events · Log · ClientErrors) ◀── โปรแกรมบนคอม
```

## ไฟล์ใน repo

| ไฟล์ | หน้าที่ |
|---|---|
| `desk/` | โปรแกรมบนคอม (เว็บแอป) · `desk/index.html` คือหน้าจอโปรแกรม · `desk/web-bridge.js` เชื่อมข้อมูลกับ Google Sheet |
| `desk/shortcut/` | `create_desktop_icon.bat` สร้างไอคอนบนหน้าจอคอม เปิดแล้วเข้าเว็บแอปเป็นหน้าต่างแยก |
| `index.html` | หน้าบันทึกบนมือถือทั้งหมด (แก้หน้าตา/ข้อความที่นี่) |
| `config.js` | ลิงก์ Web App ของ Apps Script (`api`) |
| `sw.js` | ทำให้เปิดหน้าได้แม้ไม่มีสัญญาณ (ข้อมูลรอส่งในเครื่อง) |
| `manifest.webmanifest`, `icon-*.png` | ชื่อและไอคอนเมื่อ "เพิ่มไปยังหน้าจอหลัก" |
| `apps-script/Code.gs`, `apps-script/Index.html`, `apps-script/appsscript.json` | สำเนาโค้ดฝั่ง Google Apps Script (ต้องวางใน Apps Script เอง) |

## ตั้งค่าครั้งแรก

1. **Apps Script:** วาง `apps-script/Code.gs` ทับโค้ดเดิม (และ `apps-script/Index.html` ในไฟล์ Index) → บันทึก → การทำให้ใช้งานได้ → จัดการการทำให้ใช้งานได้ → ✏ → **เวอร์ชันใหม่** → Deploy
   - ตรวจว่า Execute as: **Me** และ Who has access: **Anyone**
2. **config.js:** ใส่ "URL ของเว็บแอป" (ลงท้าย `/exec`) ในบรรทัด `api` → Commit changes
3. **เปิด GitHub Pages:** Settings → Pages → Source: **Deploy from a branch** → Branch: **main** / **(root)** → Save (รอ 1–2 นาที)
4. **โปรแกรมบนคอม:** ตั้งค่า → รับข้อมูลจากมือถือ → ช่อง **ลิงก์หน้ามือถือ (GitHub Pages)** ใส่ลิงก์หน้าเว็บด้านบน → ทดสอบการเชื่อมต่อ → เปิด QR เข้าใช้ทันที (ถ้าต้องการ) → **พิมพ์ QR ใหม่**
   - QR จากโปรแกรมมีลิงก์ Web App ติดไปด้วย ถึง `config.js` จะเก่าก็ยังใช้ได้

## โปรแกรมบนคอม (เว็บแอป)

**ข้อมูลอยู่ที่ไหน:** Google Sheet แผ่น `DB` (ข้อมูลโปรแกรมทั้งหมด) · `DB_Backup` (สำเนารายวัน 14 วัน) · `Records` และ `PC_Events` (ตารางให้คนอ่าน อัปเดตทุก 15 นาทีที่มีการบันทึก)

**เริ่มใช้ครั้งแรก (เครื่องแรก):**
1. วาง `apps-script/Code.gs` ใหม่ใน Apps Script → Deploy เวอร์ชันใหม่ (ครั้งแรกอาจถามสิทธิ์ ให้กดอนุญาต)
2. เปิด https://hotrollingrm-dev.github.io/HRM-HYD-MANAGEMENT/desk/ → ใส่ลิงก์ Web App, SYNC_KEY และชื่อเครื่อง
3. ระบบจะให้เลือกไฟล์ข้อมูลเดิม: `Data\hrm_hydraulic_data.json` ข้างโปรแกรม .exe เดิม → นำเข้า
4. เครื่องอื่น: เปิดลิงก์เดียวกัน ใส่ SYNC_KEY + ชื่อเครื่อง ก็เห็นข้อมูลเดียวกัน

**ไอคอนบนหน้าจอคอม:** ดาวน์โหลดโฟลเดอร์ `desk/shortcut/` (3 ไฟล์) แล้วดับเบิลคลิก `create_desktop_icon.bat` → ได้ไอคอน "HRM Hydraulic Management" เปิดเป็นหน้าต่างของตัวเอง (ใช้ Edge/Chrome) · หรือเปิดลิงก์ใน Edge → ⋯ → แอป → **ติดตั้งไซต์นี้เป็นแอป**

**แก้โปรแกรม:** แก้ไฟล์ใน `desk/` แล้ว Commit → ทุกเครื่องได้เวอร์ชันใหม่เมื่อรีเฟรช/เปิดใหม่ ไม่ต้องติดตั้งใหม่

## แก้แอปมือถือภายหลัง

- แก้ `index.html` บนหน้าเว็บ GitHub (ปุ่มดินสอ ✏) → **Commit changes** → มือถือได้หน้าใหม่ใน 1–2 นาที ไม่ต้อง Deploy Apps Script
- ถ้าเปลี่ยนสิ่งที่ส่งไป Google Sheet (ช่องข้อมูลใหม่) ต้องแก้ `apps-script/Code.gs` แล้ววางใน Apps Script + Deploy เวอร์ชันใหม่ด้วย

## ความปลอดภัย

- repo นี้เป็น **สาธารณะ** — **ห้ามใส่ TEAM_CODE หรือ SYNC_KEY** ในไฟล์ใดๆ
- **สมาชิกและทีม (v1.7.3):** ตั้งในโปรแกรมบนคอม → ตั้งค่า → สมาชิกและทีม · ทีมกำหนดจากชื่อผู้บันทึก ไม่ต้องเลือกทีมตอนบันทึก · รายชื่อจะถูกส่งไปที่แถว RECORDERS ในแผ่น Config แบบ `NAME:TEAM` (เช่น `NES:A WAT:B JILL:C`)
- การส่งข้อมูลต้องใช้รหัสทีม (TEAM_CODE ในแผ่น Config) · การดึงข้อมูลเข้าคอมต้องใช้ SYNC_KEY ซึ่งอยู่แค่ในโปรแกรมบนคอม
