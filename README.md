# ระบบ LINE Notification (AdonisJS Edition)

Rewrite ของ [line-notify-system](../line-notify-system) (PHP) เป็น **AdonisJS v6** (TypeScript, ESM) + **Edge.js** views + **Lucid ORM** บนสคีมา MySQL เดิม

---

## Stack

- **AdonisJS v6** (`@adonisjs/core` 6.18) — HTTP server, DI, env validator
- **Edge.js** 6 — server-rendered views
- **Lucid ORM** 21 (mysql2) — APP database
- **mysql2 pools** — HIS database connections (UI-managed via `his_databases`)
- **@adonisjs/auth** session guard + **bcryptjs** (compat กับ `$2y$` hashes จาก PHP)
- **@adonisjs/shield** CSRF
- **@adonisjs/session** cookie store
- **@vinejs/vine** validation
- **node-cron** in-process scheduler
- **Bootstrap 5.3** + custom theme.css (port จาก PHP)

---

## โครงสร้าง

```
app/
  controllers/      # 12 controllers (auth, dashboard, schedules, templates, items,
                    #                  groups, logs, audit, users, settings, hisdb, cron, health)
  models/           # 9 Lucid models map ตารางเดิม 1:1
  services/         # cron, notification, line_api, his_manager, schedule_calculator,
                    # audit, settings
  middleware/       # auth, role, guest, share_view_globals, container_bindings
  validators/       # VineJS schemas ต่อ action
  exceptions/       # global handler (404/500/503)
  commands/         # node ace cron:run
config/             # app, auth, database, session, shield, hash, static, logger, bodyparser
providers/          # his_provider, scheduler_provider
resources/views/    # layouts (app, auth) + partials (sidebar, topbar, modals, flash)
                    # + pages (10 หน้า) + errors (404, 500, 503)
public/assets/      # theme.css, app.js, schedules.js (verbatim port จาก PHP)
start/              # env, kernel, routes, view
database/           # migrations (เปล่า — เก็บ schema เดิม)
logs/               # cron log per day (cron_YYYY-MM-DD.log)
backups/            # auto SQL backup ที่ 23:xx ทุกวัน
```

---

## Setup

```powershell
cd c:\xampp\htdocs\noncenter\line-notify-adonis
npm install
copy .env.example .env
notepad .env       # ใส่ APP_DB_* + HIS_DB_* + CRON_TOKEN
node ace generate:key   # ถ้า APP_KEY ยังว่าง
```

---

## รัน

| คำสั่ง | ทำอะไร |
|--------|--------|
| `npm run dev` | dev server + HMR ที่ `http://localhost:3333` |
| `npm start` | production server (ต้อง `npm run build` ก่อน) |
| `npm run build` | compile TS → `build/` สำหรับ deploy |
| `npm run typecheck` | tsc --noEmit |
| `npm run cron:run` | รัน cron pipeline 1 รอบ (manual / OS scheduler) |
| `node ace list` | ดู ace commands ทั้งหมด |

### Login เริ่มต้น

ใช้ user เดิมจากระบบ PHP — `users` table ใน DB `line_notify_system`

```
ID 1: admin     (admin)
ID 2: knh       (admin)
```

bcrypt `$2y$` hashes จาก PHP **อ่านได้ตรงๆ** ด้วย bcryptjs ใน Node — ไม่ต้องตั้งรหัสใหม่

---

## Cron — 3 ทาง

### 1. In-process scheduler (ค่า default)

`npm run dev` หรือ `npm start` → SchedulerProvider boot node-cron tick ทุกนาที (TZ=Asia/Bangkok)

ดูจาก log:
```
SchedulerProvider: in-process cron tick started (every minute, TZ=Asia/Bangkok)
```

### 2. CLI (OS scheduler)

ถ้าไม่อยากให้ server-process รัน scheduler ให้ external scheduler เป็นคน trigger:

```powershell
# Windows Task Scheduler: ทุก 1 นาที
node ace cron:run

# หรือใช้ npm script
npm run cron:run
```

### 3. HTTP token (uptime monitor)

```
POST http://localhost:3333/cron/run?token=YOUR_CRON_TOKEN
```

ต้องตรงกับ `CRON_TOKEN` ใน `.env` — exempted จาก CSRF + auth gate (controller ตรวจ token เอง)

---

## ปรับปรุงจากระบบเดิม (PHP)

| # | จุดเดิม | ระบบใหม่ |
|---|---------|-----------|
| 1 | URL `?page=schedules&action=save` | RESTful: `POST /schedules/save` |
| 2 | mysqli raw error เป็น `false` | Lucid ORM + Exception throw + Pino logger |
| 3 | Validation กระจาย ในแต่ละ handler | VineJS schema ต่อ action ที่ boundary |
| 4 | JSON columns encode/decode ด้วยมือ | Lucid `prepare/consume` casting |
| 5 | Cron 3 กลไก (CLI + web token + browser auto-tick) | node-cron in-process + CLI + token endpoint (เอา browser auto-tick ออก) |
| 6 | bcrypt $2y$ จาก PHP | bcryptjs (อ่าน $2y$ ได้) |
| 7 | HIS = mysqli single connection | mysql2 connection **pool** ต่อ name |
| 8 | session = PHP $_SESSION | @adonisjs/session + regenerate on login |
| 9 | Env กระจาย | Adonis env validator (strict, type-checked) |
| 10 | Error page เป็น include PHP | 404/500/503 templates ตาม Adonis exception handler |

---

## Smoke test

```powershell
# 1. Health check
curl http://localhost:3333/health
# → {"ok":true,"checks":{"app":true,"time":"...","app_db":true}}

# 2. Login flow ผ่าน browser
# http://localhost:3333/login → admin / <รหัสจาก PHP เดิม>

# 3. ทดสอบ schedule
# /schedules → กดทดสอบ schedule ที่มี → ดูข้อความใน LINE

# 4. ทดสอบ HIS query
# /items → กด ▶ ที่ item ใดๆ → ดูผล query

# 5. ทดสอบ cron
node ace cron:run
# → log ออก step ทั้ง 8 ขั้นใน console + ใน logs/cron_YYYY-MM-DD.log
```

---

## Production deploy

```powershell
# 1. Build
npm run build

# 2. Set NODE_ENV
$env:NODE_ENV = "production"

# 3. Run
node bin/server.js

# หรือใช้ pm2:
npm i -g pm2
pm2 start npm --name line-notify -- start
pm2 save
pm2 startup
```

ถ้าอยู่หลัง Apache (XAMPP) ใช้ reverse proxy:

```apache
# httpd-vhosts.conf
<VirtualHost *:80>
  ServerName line-notify.local
  ProxyPass / http://localhost:3333/
  ProxyPassReverse / http://localhost:3333/
</VirtualHost>
```

---

## License

UNLICENSED — internal use only
