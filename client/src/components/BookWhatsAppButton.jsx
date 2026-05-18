import React from 'react';

export default function BookWhatsAppButton({ clinicPhone }) {
  const presetMessage = encodeURIComponent("Hello, I'd like to book an appointment.\nName:\nPreferred date/time:\nAny notes:");
  const phone = clinicPhone || '1234567890';
  const href = `https://wa.me/${phone}?text=${presetMessage}`;

  return (
    <a href={href} className="btn btn-primary" target="_blank" rel="noreferrer">Book on WhatsApp</a>
  );
}
