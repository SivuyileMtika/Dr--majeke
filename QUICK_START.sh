#!/bin/bash
# Quick Start: Dr WhatsApp After Security Fixes

echo "🚀 DR WHATSAPP - QUICK START"
echo ""

# Generate secure token
TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "manual-token-32-chars-minimum")

echo "📌 Generated DOCTOR_AUTH_TOKEN: $TOKEN"
echo ""

echo "1️⃣  Server Setup:"
echo "   cd server"
echo "   cp .env.example .env"
echo "   # Edit .env and add:"
echo "   DOCTOR_AUTH_TOKEN=$TOKEN"
echo "   WHATSAPP_TOKEN=your_meta_token"
echo "   WHATSAPP_PHONE_ID=your_phone_id"
echo "   FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccountKey.json"
echo "   npm install && npm start"
echo ""

echo "2️⃣  Client Setup:"
echo "   cd client"
echo "   cp .env.example .env"
echo "   # Edit .env and add:"
echo "   REACT_APP_DOCTOR_TOKEN=$TOKEN"
echo "   REACT_APP_API_URL=http://localhost:3000"
echo "   npm install && npm start"
echo ""

echo "3️⃣  Test Authentication:"
echo "   curl -X POST http://localhost:3000/confirm-appointment \\"
echo "     -H \"Authorization: Bearer $TOKEN\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"appointmentId\": \"test\", \"confirm\": true}'"
echo ""

echo "✅ All security fixes applied!"
echo "📖 See FIXES_SUMMARY.md for detailed changes"
