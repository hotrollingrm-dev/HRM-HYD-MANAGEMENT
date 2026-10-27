# HRM HYD MANAGEMENT · หน้าบันทึกบนมือถือ

หน้าเว็บสำหรับพนักงานบันทึก **ระดับน้ำมัน / อุณหภูมิ / การเติมน้ำมัน** ด้วยมือถือ ของโปรแกรม HRM HYDRAULIC MANAGEMENT

- **หน้าเว็บ (GitHub Pages):** https://hotrollingrm-dev.github.io/HRM-HYD-MANAGEMENT/
- **ข้อมูล:** ส่งเข้า Google Sheet ผ่าน Apps Script (ชีตเป็นที่เก็บและสำรองข้อมูล) แล้วโปรแกรมบนคอมดึงไปทุก 1 นาที
- **เช็กมือถือ:** ต่อท้ายลิงก์ด้วย `?check=1`

```
มือถือ ──เปิดหน้าเว็บ──▶ GitHub Pages (repo นี้)
   └──ส่งข้อมูล──▶ Apps Script Web App ──▶ Google Sheet (Inbox · Events · Log · ClientErrors) ◀── โปรแกรมบนคอม
```

## ไฟล์ใน repo

| ไฟล์ | หน้าที่ |
|---|---|
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

## แก้แอปมือถือภายหลัง

- แก้ `index.html` บนหน้าเว็บ GitHub (ปุ่มดินสอ ✏) → **Commit changes** → มือถือได้หน้าใหม่ใน 1–2 นาที ไม่ต้อง Deploy Apps Script
- ถ้าเปลี่ยนสิ่งที่ส่งไป Google Sheet (ช่องข้อมูลใหม่) ต้องแก้ `apps-script/Code.gs` แล้ววางใน Apps Script + Deploy เวอร์ชันใหม่ด้วย

## ความปลอดภัย

- repo นี้เป็น **สาธารณะ** — **ห้ามใส่ TEAM_CODE หรือ SYNC_KEY** ในไฟล์ใดๆ
- การส่งข้อมูลต้องใช้รหัสทีม (TEAM_CODE ในแผ่น Config) · การดึงข้อมูลเข้าคอมต้องใช้ SYNC_KEY ซึ่งอยู่แค่ในโปรแกรมบนคอม
