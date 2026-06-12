import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import axios from 'axios';
import {
  ChevronLeft, ChevronRight, X, Check, Clock, Phone,
  CreditCard, Stethoscope, AlertCircle, CalendarDays,
  User, MessageCircle, Globe, Loader2,
} from 'lucide-react';

const API_BASE   = process.env.REACT_APP_API_URL    || 'http://localhost:3000';
const AUTH_TOKEN = process.env.REACT_APP_DOCTOR_TOKEN || '';

const pad      = n => String(n).padStart(2, '0');
const ymd      = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());

const fmtShort = s => {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); }
  catch { return s; }
};
const fmtLong = s => {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return s; }
};
const fmtTs = ts => {
  if (!ts) return '';
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS = {
  pending_approval: { label: 'Pending',   color: '#b45309' },
  confirmed:        { label: 'Confirmed', color: '#15803d' },
  rejected:         { label: 'Rejected',  color: '#9f1239' },
};

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 14px; -webkit-text-size-adjust: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f0f0f0;
    color: #111;
    height: 100vh;
    overflow: hidden;
  }

  .wrap { display: flex; flex-direction: column; height: 100vh; }

  /* Header */
  .hdr {
    background: #fff; border-bottom: 1px solid #ddd;
    padding: 0 20px; height: 50px;
    display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0; gap: 12px;
  }
  .hdr-brand { display: flex; align-items: center; gap: 10px; }
  .hdr-icon { color: #2563eb; }
  .hdr-name { font-weight: 700; font-size: 14px; color: #111; }
  .hdr-sub  { color: #999; font-size: 13px; }
  .hdr-right { display: flex; align-items: center; gap: 10px; }
  .hdr-date  { font-size: 13px; color: #666; }

  .ap-toggle {
    display: flex; align-items: center; gap: 5px;
    background: none; border: 1px solid #d0d0d0; border-radius: 4px;
    padding: 5px 11px; font-size: 12px; font-weight: 500;
    cursor: pointer; color: #555; transition: border-color .12s, color .12s;
  }
  .ap-toggle:hover { border-color: #999; color: #111; }
  .ap-toggle.on    { border-color: #15803d; color: #15803d; }
  .ap-dot { width: 7px; height: 7px; border-radius: 50%; background: #d0d0d0; flex-shrink: 0; }
  .ap-toggle.on .ap-dot { background: #15803d; }

  /* Layout */
  .body { display: flex; flex: 1; overflow: hidden; }

  /* Left — calendar */
  .cal-panel {
    width: 224px; min-width: 224px; flex-shrink: 0;
    background: #fff; border-right: 1px solid #ddd;
    padding: 16px 14px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 18px;
  }

  .mc-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .mc-month { font-size: 13px; font-weight: 600; color: #111; }
  .mc-btn {
    background: none; border: none; cursor: pointer;
    color: #999; padding: 3px; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    transition: color .1s, background .1s;
  }
  .mc-btn:hover { background: #f0f0f0; color: #111; }

  .mc-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
  .mc-dow { text-align: center; font-size: 10px; font-weight: 600; color: #bbb; padding: 3px 0; }
  .mc-day {
    text-align: center; font-size: 12px; color: #333;
    padding: 5px 2px; border-radius: 4px; cursor: pointer;
    position: relative; line-height: 1.3; user-select: none;
    transition: background .1s;
  }
  .mc-day:hover { background: #f5f5f5; }
  .mc-day.empty { pointer-events: none; }
  .mc-day.is-today { font-weight: 700; color: #2563eb; }
  .mc-day.selected { background: #2563eb; color: #fff !important; font-weight: 600; }
  .mc-day.selected:hover { background: #1d4ed8; }
  .mc-day .mc-dot {
    position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%);
    width: 3px; height: 3px; border-radius: 50%; background: #888;
  }
  .mc-day.selected .mc-dot { background: rgba(255,255,255,.6); }

  .cal-legend { border-top: 1px solid #eee; padding-top: 12px; display: flex; flex-direction: column; gap: 6px; }
  .legend-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #888; }
  .legend-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

  /* Right — day panel */
  .day-panel { flex: 1; overflow-y: auto; min-width: 0; }

  .section { border-bottom: 1px solid #ddd; background: #fff; }

  .sec-hdr {
    padding: 9px 20px 8px;
    background: #f7f7f7; border-bottom: 1px solid #e0e0e0;
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 700; letter-spacing: .55px;
    text-transform: uppercase; color: #666;
  }
  .sec-hdr-icon { color: #999; flex-shrink: 0; }
  .sec-count {
    border-radius: 10px; padding: 1px 8px;
    font-size: 10px; font-weight: 700;
    letter-spacing: 0; text-transform: none;
  }
  .sec-count.amber { background: #fef3c7; color: #92400e; }
  .sec-count.green { background: #dcfce7; color: #15532d; }

  /* Pending rows */
  .pend-row {
    padding: 13px 20px; border-bottom: 1px solid #f0f0f0;
    display: flex; align-items: flex-start; gap: 12px;
  }
  .pend-row:last-child { border-bottom: none; }
  .pend-body { flex: 1; min-width: 0; }
  .pend-name { font-weight: 600; font-size: 14px; color: #111; margin-bottom: 3px; }
  .pend-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: #666; }
  .pend-meta-item { display: flex; align-items: center; gap: 3px; }
  .pend-actions { display: flex; gap: 7px; align-items: flex-start; flex-shrink: 0; }

  .btn-approve {
    display: flex; align-items: center; gap: 5px;
    background: #2563eb; color: #fff; border: none; border-radius: 4px;
    padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
    white-space: nowrap; transition: background .1s;
  }
  .btn-approve:hover    { background: #1d4ed8; }
  .btn-approve:disabled { opacity: .5; cursor: not-allowed; }

  .btn-reject {
    display: flex; align-items: center; gap: 5px;
    background: #fff; color: #dc2626;
    border: 1px solid #dc2626; border-radius: 4px;
    padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
    white-space: nowrap; transition: background .1s;
  }
  .btn-reject:hover    { background: #fef2f2; }
  .btn-reject:disabled { opacity: .5; cursor: not-allowed; }

  /* Day heading */
  .day-head {
    padding: 13px 20px 11px; border-bottom: 1px solid #eee;
    display: flex; align-items: center; gap: 10px;
  }
  .day-head-icon { color: #2563eb; flex-shrink: 0; }
  .day-head-date { font-size: 15px; font-weight: 700; color: #111; }
  .day-head-sub  { font-size: 12px; color: #999; }

  /* Appointment rows */
  .apt-row {
    padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
    display: flex; gap: 12px; align-items: flex-start;
    cursor: pointer; transition: background .08s;
  }
  .apt-row:hover { background: #fafafa; }
  .apt-row:last-child { border-bottom: none; }
  .apt-time {
    display: flex; align-items: center; gap: 4px;
    font-size: 13px; font-weight: 600; color: #2563eb;
    width: 58px; flex-shrink: 0; padding-top: 1px;
  }
  .apt-body { flex: 1; min-width: 0; }
  .apt-name   { font-weight: 600; font-size: 14px; color: #111; margin-bottom: 2px; }
  .apt-detail { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 12px; color: #777; }
  .apt-detail-item { display: flex; align-items: center; gap: 3px; }
  .apt-status { font-size: 12px; font-weight: 600; flex-shrink: 0; padding-top: 2px; }

  .empty-day {
    padding: 40px 20px; text-align: center;
    color: #ccc; font-size: 13px; background: #fff;
  }

  /* Detail pane */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.25); z-index: 50; }
  .detail-pane {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 340px; background: #fff; border-left: 1px solid #ddd;
    z-index: 51; display: flex; flex-direction: column; overflow-y: auto;
  }
  .det-hdr {
    padding: 14px 16px; border-bottom: 1px solid #eee;
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .det-hdr-icon { color: #2563eb; flex-shrink: 0; }
  .det-title  { font-weight: 700; font-size: 15px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .det-close  {
    background: none; border: none; cursor: pointer;
    color: #bbb; padding: 2px; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    transition: color .1s;
  }
  .det-close:hover { color: #111; }
  .det-body  { padding: 16px; flex: 1; }
  .det-field { margin-bottom: 14px; }
  .det-label {
    display: flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; color: #bbb; margin-bottom: 4px;
  }
  .det-label svg { color: #ccc; }
  .det-value { font-size: 13px; color: #111; font-weight: 500; }
  .det-actions { display: flex; gap: 10px; padding: 14px 16px; border-top: 1px solid #eee; flex-shrink: 0; }

  .spinner {
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .msg-banner {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: #111; color: #fff; border-radius: 4px;
    padding: 8px 16px; font-size: 13px; font-weight: 500;
    z-index: 100; pointer-events: none;
    animation: fadeUp .15s ease;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  @media (max-width: 700px) {
    body { overflow: auto; }
    .wrap { height: auto; min-height: 100vh; }
    .body { flex-direction: column; overflow: visible; }
    .day-panel { overflow: visible; }
    .cal-panel {
      width: 100%; min-width: unset; border-right: none;
      border-bottom: 1px solid #ddd;
      padding: 12px 14px 10px; flex-direction: row; flex-wrap: wrap; gap: 12px;
    }
    .mini-cal-wrap { flex: 1; min-width: 200px; }
    .cal-legend { border-top: none; padding-top: 0; flex-direction: row; flex-wrap: wrap; }
    .detail-pane { width: 100%; border-left: none; border-top: 1px solid #ddd; }
    .pend-actions { flex-direction: column; }
    .hdr-sub { display: none; }
  }
`;

function MiniCalendar({ month, onPrev, onNext, selected, appointments, onSelect }) {
  const yr = month.getFullYear(), mo = month.getMonth();
  const firstDay = (new Date(yr, mo, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = todayStr();

  const aptMap = {};
  appointments.forEach(a => { aptMap[a.date] = (aptMap[a.date] || 0) + 1; });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="mini-cal-wrap">
      <div className="mc-nav">
        <button className="mc-btn" onClick={onPrev}><ChevronLeft size={14} /></button>
        <span className="mc-month">{MONTHS[mo]} {yr}</span>
        <button className="mc-btn" onClick={onNext}><ChevronRight size={14} /></button>
      </div>
      <div className="mc-grid">
        {DAYS.map(d => <div key={d} className="mc-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="mc-day empty" />;
          const ds      = `${yr}-${pad(mo + 1)}-${pad(d)}`;
          const isToday = ds === today;
          const isSel   = ds === selected;
          const hasDot  = !!aptMap[ds];
          return (
            <div key={ds}
              className={`mc-day${isToday ? ' is-today' : ''}${isSel ? ' selected' : ''}`}
              onClick={() => onSelect(ds)}>
              {d}
              {hasDot && <span className="mc-dot" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailPane({ apt, loading, onApprove, onReject, onClose }) {
  const s = STATUS[apt.status] || { label: apt.status, color: '#666' };
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="detail-pane">
        <div className="det-hdr">
          <User size={16} className="det-hdr-icon" />
          <span className="det-title">{apt.patient_name || 'Patient'}</span>
          <button className="det-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="det-body">
          <div className="det-field">
            <div className="det-label"><AlertCircle size={10} /> Status</div>
            <div className="det-value" style={{ color: s.color }}>{s.label}</div>
          </div>
          <div className="det-field">
            <div className="det-label"><CalendarDays size={10} /> Date &amp; Time</div>
            <div className="det-value">{fmtLong(apt.date)} · {apt.time}</div>
          </div>
          <div className="det-field">
            <div className="det-label"><Phone size={10} /> Phone</div>
            <div className="det-value">{apt.phone}</div>
          </div>
          <div className="det-field">
            <div className="det-label"><CreditCard size={10} /> Payment</div>
            <div className="det-value">{apt.payment_method === 'medical_aid' ? 'Medical Aid' : 'Cash'}</div>
          </div>
          {apt.payment_method === 'medical_aid' && (
            <>
              <div className="det-field">
                <div className="det-label"><CreditCard size={10} /> Medical Aid</div>
                <div className="det-value">{apt.medical_aid || '—'}</div>
              </div>
              <div className="det-field">
                <div className="det-label"><CreditCard size={10} /> Membership No.</div>
                <div className="det-value">{apt.membership_number || '—'}</div>
              </div>
            </>
          )}
          {apt.reason && (
            <div className="det-field">
              <div className="det-label"><MessageCircle size={10} /> Reason</div>
              <div className="det-value">{apt.reason}</div>
            </div>
          )}
          <div className="det-field">
            <div className="det-label">
              {apt.source === 'website' ? <Globe size={10} /> : <MessageCircle size={10} />} Source
            </div>
            <div className="det-value">{apt.source === 'website' ? 'Website' : 'WhatsApp'}</div>
          </div>
          <div className="det-field">
            <div className="det-label"><Clock size={10} /> Booked at</div>
            <div className="det-value">{fmtTs(apt.created_at)}</div>
          </div>
        </div>
        {apt.status === 'pending_approval' && (
          <div className="det-actions">
            <button className="btn-approve" style={{ flex: 1 }} disabled={loading}
              onClick={() => { onApprove(); onClose(); }}>
              {loading ? <Loader2 size={13} className="spinner" /> : <Check size={13} />}
              {loading ? '' : 'Approve'}
            </button>
            <button className="btn-reject" style={{ flex: 1 }} disabled={loading}
              onClick={() => { onReject(); onClose(); }}>
              {loading ? <Loader2 size={13} className="spinner" /> : <X size={13} />}
              {loading ? '' : 'Reject'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [month, setMonth]               = useState(new Date());
  const [selected, setSelected]         = useState(todayStr());
  const [actionLoading, setActionLoading] = useState({});
  const [autoPilot, setAutoPilot]       = useState(() => localStorage.getItem('autopilot') === 'true');
  const autoProcessed                   = useRef(new Set());
  const [detail, setDetail]             = useState(null);
  const [banner, setBanner]             = useState(null);
  const bannerTimer                     = useRef(null);

  const showBanner = useCallback(msg => {
    setBanner(msg);
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 2200);
  }, []);

  useEffect(() => { localStorage.setItem('autopilot', autoPilot); }, [autoPilot]);

  useEffect(() => {
    if (!autoPilot || appointments.length === 0) return;
    appointments.filter(a => a.status === 'pending_approval').forEach((apt, i) => {
      if (autoProcessed.current.has(apt.id)) return;
      autoProcessed.current.add(apt.id);
      const conflict = appointments.some(a => a.id !== apt.id && a.date === apt.date && a.time === apt.time && a.status === 'confirmed');
      setTimeout(() => act(apt.id, !conflict), i * 600);
    });
  }, [appointments, autoPilot]);

  useEffect(() => {
    if (!AUTH_TOKEN) { setError('REACT_APP_DOCTOR_TOKEN not set'); setLoading(false); return; }
    const q = query(collection(db, 'appointments'), orderBy('created_at', 'desc'));
    return onSnapshot(q,
      snap => { setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      ()   => { setError('Failed to load appointments'); setLoading(false); }
    );
  }, []);

  const act = async (id, confirm) => {
    setActionLoading(s => ({ ...s, [id]: true }));
    try {
      await axios.post(`${API_BASE}/confirm-appointment`,
        { appointmentId: id, confirm, doctorName: 'Dr. SG Majeke' },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      showBanner(confirm ? 'Appointment approved' : 'Appointment rejected');
    } catch (e) {
      showBanner(e.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  };

  const today    = todayStr();
  const pending  = appointments.filter(a => a.status === 'pending_approval');
  const dayApts  = appointments
    .filter(a => a.date === selected)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const confirmed = dayApts.filter(a => a.status === 'confirmed').length;
  const upcoming  = appointments
    .filter(a => a.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 12);
  const todayFull = new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return (
    <>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Loader2 size={28} color="#2563eb" className="spinner" />
      </div>
    </>
  );

  if (error) return (
    <>
      <style>{CSS}</style>
      <div style={{ padding: 24, color: '#b91c1c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={16} /> {error}
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>

      <div className="wrap">
        <header className="hdr">
          <div className="hdr-brand">
            <Stethoscope size={18} className="hdr-icon" />
            <span className="hdr-name">Dr. SG Majeke</span>
            <span className="hdr-sub"> — General Practitioner</span>
          </div>
          <div className="hdr-right">
            <span className="hdr-date">{todayFull}</span>
            <button className={`ap-toggle${autoPilot ? ' on' : ''}`}
              onClick={() => { if (!autoPilot) autoProcessed.current.clear(); setAutoPilot(p => !p); }}>
              <span className="ap-dot" />
              Auto {autoPilot ? 'On' : 'Off'}
            </button>
          </div>
        </header>

        <div className="body">
          <aside className="cal-panel">
            <MiniCalendar
              month={month}
              onPrev={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
              onNext={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
              selected={selected}
              appointments={appointments}
              onSelect={setSelected}
            />
            <div className="cal-legend">
              <div className="legend-row">
                <span className="legend-dot" style={{ background: '#888' }} />
                Has appointments
              </div>
              {pending.length > 0 && (
                <div className="legend-row" style={{ color: '#b45309', fontWeight: 600 }}>
                  <AlertCircle size={11} color="#b45309" />
                  {pending.length} pending approval
                </div>
              )}
            </div>
          </aside>

          <main className="day-panel">

            {pending.length > 0 && (
              <div className="section">
                <div className="sec-hdr">
                  <AlertCircle size={13} className="sec-hdr-icon" style={{ color: '#b45309' }} />
                  Pending Approval
                  <span className="sec-count amber">{pending.length}</span>
                </div>
                {pending.map(apt => (
                  <div className="pend-row" key={apt.id}>
                    <div className="pend-body">
                      <div className="pend-name">{apt.patient_name || 'Unknown'}</div>
                      <div className="pend-meta">
                        <span className="pend-meta-item"><CalendarDays size={11} /> {fmtShort(apt.date)}</span>
                        <span className="pend-meta-item"><Clock size={11} /> {apt.time}</span>
                        <span className="pend-meta-item">
                          <CreditCard size={11} />
                          {apt.payment_method === 'medical_aid'
                            ? `${apt.medical_aid || 'Medical Aid'}${apt.membership_number ? ` #${apt.membership_number}` : ''}`
                            : 'Cash'}
                        </span>
                        <span className="pend-meta-item">
                          {apt.source === 'website' ? <Globe size={11} /> : <MessageCircle size={11} />}
                          {apt.phone}
                        </span>
                      </div>
                    </div>
                    <div className="pend-actions">
                      <button className="btn-approve" disabled={!!actionLoading[apt.id]} onClick={() => act(apt.id, true)}>
                        {actionLoading[apt.id] ? <Loader2 size={12} className="spinner" /> : <Check size={12} />}
                        {!actionLoading[apt.id] && 'Approve'}
                      </button>
                      <button className="btn-reject" disabled={!!actionLoading[apt.id]} onClick={() => act(apt.id, false)}>
                        {actionLoading[apt.id] ? <Loader2 size={12} className="spinner" /> : <X size={12} />}
                        {!actionLoading[apt.id] && 'Reject'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="section">
              <div className="day-head">
                <CalendarDays size={16} className="day-head-icon" />
                <span className="day-head-date">
                  {selected === today ? 'Today — ' : ''}{fmtLong(selected)}
                </span>
                {dayApts.length > 0 && (
                  <span className="day-head-sub">
                    {dayApts.length} appointment{dayApts.length !== 1 ? 's' : ''}
                    {confirmed > 0 ? ` · ${confirmed} confirmed` : ''}
                  </span>
                )}
              </div>

              {dayApts.length === 0
                ? <div className="empty-day">No appointments scheduled</div>
                : dayApts.map(apt => {
                    const s = STATUS[apt.status] || { label: apt.status, color: '#666' };
                    return (
                      <div className="apt-row" key={apt.id} onClick={() => setDetail(apt)}>
                        <div className="apt-time"><Clock size={12} />{apt.time}</div>
                        <div className="apt-body">
                          <div className="apt-name">{apt.patient_name || 'Unknown'}</div>
                          <div className="apt-detail">
                            <span className="apt-detail-item"><Phone size={10} />{apt.phone}</span>
                            <span className="apt-detail-item">
                              <CreditCard size={10} />
                              {apt.payment_method === 'medical_aid' ? apt.medical_aid || 'Medical Aid' : 'Cash'}
                            </span>
                          </div>
                        </div>
                        <div className="apt-status" style={{ color: s.color }}>{s.label}</div>
                      </div>
                    );
                  })
              }
            </div>

            {upcoming.length > 0 && (
              <div className="section">
                <div className="sec-hdr">
                  <CalendarDays size={13} className="sec-hdr-icon" />
                  Upcoming
                  <span className="sec-count green">
                    {appointments.filter(a => a.date > today && a.status === 'confirmed').length} confirmed
                  </span>
                </div>
                {upcoming.map(apt => {
                  const s = STATUS[apt.status] || { label: apt.status, color: '#666' };
                  return (
                    <div className="apt-row" key={apt.id}
                      onClick={() => { setDetail(apt); setSelected(apt.date); }}>
                      <div className="apt-time"><Clock size={12} />{apt.time}</div>
                      <div className="apt-body">
                        <div className="apt-name">{apt.patient_name || 'Unknown'}</div>
                        <div className="apt-detail">
                          <span className="apt-detail-item"><CalendarDays size={10} />{fmtShort(apt.date)}</span>
                          <span className="apt-detail-item"><Phone size={10} />{apt.phone}</span>
                          <span className="apt-detail-item">
                            <CreditCard size={10} />
                            {apt.payment_method === 'medical_aid' ? apt.medical_aid || 'Medical Aid' : 'Cash'}
                          </span>
                        </div>
                      </div>
                      <div className="apt-status" style={{ color: s.color }}>{s.label}</div>
                    </div>
                  );
                })}
              </div>
            )}

          </main>
        </div>
      </div>

      {detail && (
        <DetailPane
          apt={detail}
          loading={!!actionLoading[detail.id]}
          onApprove={() => act(detail.id, true)}
          onReject={() => act(detail.id, false)}
          onClose={() => setDetail(null)}
        />
      )}

      {banner && <div className="msg-banner">{banner}</div>}
    </>
  );
}
