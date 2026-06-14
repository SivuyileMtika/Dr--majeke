# Dr Majeke – Appointment Booking System

Patient-facing booking site and doctor dashboard for a general practice in Mt Frere.

## Stack

- **Frontend** – React + TypeScript + Tailwind CSS (Vite)
- **Backend** – Node.js / Express
- **Database** – Firebase / Firestore
- **Messaging** – WhatsApp Cloud API
- **Deployment** – Railway

## Project structure

```
server/    Express webhook + appointment logic
client/    React doctor dashboard (WhatsApp bookings)
project/   Main patient-facing site
```

## Running locally

**Server**
```bash
cd server
cp .env.example .env   # fill in credentials
npm install
npm run dev
```

**Patient site**
```bash
cd project
npm install
npm run dev
```

**Doctor dashboard**
```bash
cd client
npm install
npm start
```

## Environment variables

See `server/.env.example` for required server config (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `FIREBASE_SERVICE_ACCOUNT`, `DOCTOR_AUTH_TOKEN`).
