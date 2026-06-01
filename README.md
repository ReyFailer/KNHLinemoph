# KNHLinemoph — ระบบแจ้งเตือน LINE

ระบบส่งข้อความแจ้งเตือนอัตโนมัติผ่าน LINE สำหรับโรงพยาบาล พัฒนาด้วย **AdonisJS v6** (TypeScript) บนฐานข้อมูล MySQL เดิม

---

## Stack

| ชั้น | เทคโนโลยี |
|------|-----------|
| Framework | AdonisJS v6 + TypeScript (ESM) |
| View | Edge.js 6 (server-rendered) |
| ORM | Lucid 21 + mysql2 (APP DB) |
| HIS DB | mysql2 connection pools (UI-managed) |
| Auth | @adonisjs/auth session guard + bcryptjs |
| Scheduler | node-cron (in-process) |
| Frontend | Bootstrap 5.3 |

---

## ติดตั้ง

```powershell
cd c:\xampp\htdocs\noncenter\KNHLinemoph
npm install
copy .env.example .env
```

แก้ไขค่าใน `.env`:

```env
# APP database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_DATABASE=line_notify_system

# HIS database (fallback)
HIS_DB_HOST=...
HIS_DB_USER=...
HIS_DB_PASSWORD=...
HIS_DB_DATABASE=hos
HIS_DB_CHARSET=tis620

# ต้องตั้ง
CRON_TOKEN=...          # token สำหรับ POST /cron/run
MAX_LOG_DAYS=30
```

สร้าง APP_KEY (ถ้ายังว่าง):
```powershell
node ace generate:key
```

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|--------|--------|
| `npm run dev` | dev server + HMR ที่ `http://localhost:3333` |
| `npm run build` | compile TS → `build/` |
| `npm start` | production server (ต้อง build ก่อน) |
| `npm run typecheck` | ตรวจ TypeScript |
| `npm run cron:run` | รัน cron pipeline 1 รอบ (manual) |
| `node ace list` | ดู ace commands ทั้งหมด |

---

## Login เริ่มต้น

ใช้ข้อมูลผู้ใช้เดิมจากตาราง `users` ใน DB — bcrypt `$2y$` จาก PHP อ่านได้ตรงๆ ไม่ต้องตั้งรหัสใหม่

```
ID 1 : admin  (role: admin)
ID 2 : knh    (role: admin)
```

---

## Cron — 3 วิธีเรียก

### 1. In-process (default)
`npm run dev` / `npm start` จะ boot SchedulerProvider → node-cron tick ทุกนาที (TZ=Asia/Bangkok)

### 2. CLI / OS Scheduler
```powershell
npm run cron:run
# หรือ: node ace cron:run
```

### 3. HTTP Token
```
POST http://localhost:3333/cron/run?token=YOUR_CRON_TOKEN
```
Exempt จาก CSRF + auth — ใช้กับ uptime monitor หรือ external trigger

---

## Roles

| Role | สิทธิ์ |
|------|--------|
| `viewer` | ดูข้อมูลอย่างเดียว |
| `operator` | CRUD schedules/templates/items + รัน cron |
| `admin` | ทุกอย่าง + จัดการ users/groups/settings |

---

## Health Check

```
GET /health
→ {"ok":true,"checks":{"app":true,"app_db":true,...}}
```

---

## Production Deploy

```powershell
npm run build
$env:NODE_ENV = "production"
node bin/server.js
```

หรือใช้ PM2:
```powershell
npm i -g pm2
pm2 start "node bin/server.js" --name KNHLinemoph
pm2 save
pm2 startup
```

---

## License

UNLICENSED — internal use only
