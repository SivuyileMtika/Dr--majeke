# WhatsApp Booking System for a Doctor

This repository is a scaffold for a WhatsApp-based appointment booking system.

Features:
- Node/Express webhook that receives WhatsApp Cloud API messages and writes to Firestore.
- Auto-creates appointment entries when patient messages include "book" or "appointment".
- React/Bootstrap doctor dashboard that shows pending bookings using Firestore onSnapshot.
- Doctor can confirm/reject appointments; server sends WhatsApp reply via Cloud API.

Folders:
- server/ - Express server, Firebase Admin helpers, WhatsApp sender util
- client/ - React app with doctor dashboard components

Quick start (local development):

1. Server
- Create a Firebase service account JSON and set it in the environment variable FIREBASE_SERVICE_ACCOUNT (as a JSON string or a path to file).
- Create a .env from server/.env.example and set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_VERIFY_TOKEN.
- Install and start server:

  # from repository root
  cd server
  npm install
  npm run dev

2. Client
- Add a Firebase web config to environment variables for React (REACT_APP_...)
- Install and start client:

  cd client
  npm install
  npm start

Firestore rules and example indexes are included in `firestore.rules` and `firestore.indexes.json`.

Production notes:
- Use Cloud Functions or Cloud Run for the webhook for better scaling.
- Keep WhatsApp API tokens and service accounts secure; do not check secrets into git.
- Validate webhook signature and apply rate limits before deploying.

