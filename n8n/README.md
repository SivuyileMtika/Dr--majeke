# n8n Automation — Dr Majeke Booking System

Three workflows that automate notifications and reminders around the booking system.

---

## Workflows

| File | What it does | Trigger |
|------|-------------|---------|
| `01-new-appointment-alert.json` | Sends doctor a WhatsApp message the moment a patient books | Server POST webhook |
| `02-daily-schedule-summary.json` | Sends doctor today's full schedule every weekday at 7 am | Cron Mon–Fri 07:00 |
| `03-patient-reminders.json` | Sends each confirmed patient a reminder the day before at 8 am | Cron Mon–Fri 08:00 |

---

## One-time Setup

### 1. Create Variables in n8n
Go to **Settings → Variables** (n8n Cloud) or set these in your `.env` (self-hosted):

| Variable | Value |
|----------|-------|
| `WA_ACCESS_TOKEN` | Your permanent WhatsApp system user token |
| `WA_PHONE_NUMBER_ID` | `1062767003597568` |
| `DOCTOR_PHONE` | `27834289828` (no `+`) |
| `SERVER_URL` | `https://dr-majeke-production.up.railway.app` |
| `DOCTOR_AUTH_TOKEN` | The value of `DOCTOR_AUTH_TOKEN` from your Railway server env |

### 2. Import the Workflows
In n8n: **Workflows → Import from File** → select each JSON file.

### 3. Activate Workflow 01 and copy the webhook URL
- Open **01 - Dr Majeke New Appointment Alert**
- Click the **Webhook** node → copy the **Production URL**
  - It will look like: `https://your-instance.app.n8n.cloud/webhook/majeke-new-booking`
- Paste that URL into your Railway server environment variable:
  ```
  N8N_WEBHOOK_URL=https://your-instance.app.n8n.cloud/webhook/majeke-new-booking
  ```
- Railway will redeploy automatically.

### 4. Activate all three workflows
Toggle the **Active** switch on each workflow.

---

## How they connect to the server

```
Patient sends WhatsApp / books via website
          ↓
   Express server (Railway)
          ↓  creates appointment in Firestore
          ↓  calls N8N_WEBHOOK_URL (fire-and-forget)
                    ↓
            n8n Workflow 01
                    ↓
       WhatsApp message to Doctor 📲

Cron 7am weekdays → n8n Workflow 02
   → GET /appointments/today  (Bearer DOCTOR_AUTH_TOKEN)
   → WhatsApp summary to Doctor 📋

Cron 8am weekdays → n8n Workflow 03
   → GET /appointments/tomorrow  (Bearer DOCTOR_AUTH_TOKEN)
   → WhatsApp reminder to each patient 📲
```

---

## API Endpoints added to the server

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| `GET` | `/appointments/today` | Bearer token | Today's confirmed + pending appointments |
| `GET` | `/appointments/tomorrow` | Bearer token | Tomorrow's confirmed appointments |

Both require the `Authorization: Bearer <DOCTOR_AUTH_TOKEN>` header — the same token the dashboard uses.
