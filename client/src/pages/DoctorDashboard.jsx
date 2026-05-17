import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.REACT_APP_DOCTOR_TOKEN || '';

const STATUS_COLOR = {
  pending_approval: '#f59e0b',
  confirmed: '#10b981',
  rejected: '#ef4444',
};
const STATUS_LABEL = {
  pending_approval: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

const Avatar = ({ name, size = 38 }) => {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0
    }}>{initials}</div>
  );
};

const StatusBadge = ({ status }) => (
  <span style={{
    background: STATUS_COLOR[status] + '22',
    color: STATUS_COLOR[status],
    border: `1px solid ${STATUS_COLOR[status]}55`,
    borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600
  }}>{STATUS_LABEL[status] || status}</span>
);

const SourceBadge = ({ source }) => (
  <span style={{
    background: source === 'website' ? '#0ea5e922' : '#22c55e22',
    color: source === 'website' ? '#0ea5e9' : '#22c55e',
    border: `1px solid ${source === 'website' ? '#0ea5e955' : '#22c55e55'}`,
    borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600
  }}>{source === 'website' ? 'Web' : 'WhatsApp'}</span>
);

const formatTimestamp = ts => {
  if (!ts) return '—';
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const formatDateLong = dateStr => {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
};

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!AUTH_TOKEN) { setError('REACT_APP_DOCTOR_TOKEN not configured'); setLoading(false); return; }
    const q = query(collection(db, 'appointments'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => { setError('Failed to load appointments'); setLoading(false); });
    return () => unsub();
  }, []);

  const handleAction = async (id, confirm) => {
    setActionLoading(s => ({ ...s, [id]: true }));
    setActionError(s => ({ ...s, [id]: null }));
    try {
      await axios.post(`${API_BASE}/confirm-appointment`,
        { appointmentId: id, confirm, doctorName: 'Dr. Majeke' },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      setActionError(s => ({ ...s, [id]: err.response?.data?.error || err.message }));
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  };

  const today = now.toISOString().split('T')[0];
  const stats = {
    total: appointments.length,
    pending: appointments.filter(a => a.status === 'pending_approval').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    rejected: appointments.filter(a => a.status === 'rejected').length,
    today: appointments.filter(a => a.date === today).length,
  };

  const getAppointmentsForDay = d => appointments.filter(a => a.date === d);

  const hasClash = d => {
    const times = getAppointmentsForDay(d)
      .filter(a => a.status !== 'rejected')
      .map(a => a.time);
    return times.length !== new Set(times).size;
  };

  const buildCalendar = () => {
    const yr = currentMonth.getFullYear(), mo = currentMonth.getMonth();
    const first = new Date(yr, mo, 1).getDay();
    const days = new Date(yr, mo + 1, 0).getDate();
    const weeks = [];
    let d = 1 - first;
    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let i = 0; i < 7; i++, d++) {
        if (d < 1 || d > days) { week.push(null); continue; }
        const dateStr = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        week.push({ day: d, dateStr });
      }
      weeks.push(week);
      if (d > days) break;
    }
    return weeks;
  };

  const toggleSort = f => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  const filteredAppointments = appointments
    .filter(a => filterStatus === 'all' || a.status === filterStatus)
    .filter(a => !search || (a.patient_name || '').toLowerCase().includes(search.toLowerCase()) || (a.phone || '').includes(search))
    .sort((a, b) => {
      let va = sortField === 'date' ? a.date + a.time : (a[sortField] || '');
      let vb = sortField === 'date' ? b.date + b.time : (b[sortField] || '');
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const weeks = buildCalendar();
  const monthName = currentMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  // ─── styles ───────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
    body { background: #f1f5f9; margin: 0; }
    .dash-card { background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .dash-tab { border: none; background: none; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 14px; color: #64748b; cursor: pointer; transition: all .15s; }
    .dash-tab.active { background: #f97316; color: #fff; }
    .dash-tab:hover:not(.active) { background: #f1f5f9; color: #1e293b; }
    .apt-row:hover { background: #f8fafc; }
    .sort-btn { background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569; padding: 0; }
    .sort-btn:hover { color: #f97316; }
    .cal-cell { height: 80px; border: 1px solid #e2e8f0; padding: 6px 8px; cursor: pointer; vertical-align: top; transition: background .1s; border-radius: 8px; }
    .cal-cell:hover { background: #fef3c7; }
    .cal-cell.today { background: #fff7ed; border-color: #f97316; }
    .cal-cell.selected { background: #eff6ff; border-color: #3b82f6; }
    .cal-day-num { font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
    .cal-day-num.today { color: #f97316; }
    .filter-btn { border: 1.5px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 5px 14px; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; transition: all .15s; }
    .filter-btn.active { background: #f97316; border-color: #f97316; color: #fff; }
    input[type=text]:focus, input[type=search]:focus { outline: none; border-color: #f97316 !important; }
    .action-btn { border: none; border-radius: 8px; padding: 6px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
    .action-btn:disabled { opacity: .5; cursor: not-allowed; }
    .approve-btn { background: #10b981; color: #fff; }
    .approve-btn:hover:not(:disabled) { background: #059669; }
    .reject-btn { background: #ef4444; color: #fff; }
    .reject-btn:hover:not(:disabled) { background: #dc2626; }
    .pending-card { border-radius: 16px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08); border-left: 4px solid #f59e0b; overflow: hidden; }
    ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
  `;

  if (loading) return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f1f5f9' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#64748b', fontWeight: 600 }}>Loading appointments…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );

  if (error) return (
    <>
      <style>{css}</style>
      <div style={{ padding: 32, color: '#ef4444', fontWeight: 600 }}>{error}</div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

        {/* ── Top Nav ── */}
        <nav style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          padding: '0 28px', height: 64, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,.2)', position: 'sticky', top: 0, zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>+</span>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, lineHeight: 1 }}>Dr. Majeke Clinic</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>Booking Management System</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 600 }}>
                {now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>
                {now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            {stats.pending > 0 && (
              <div style={{ background: '#f59e0b', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, animation: 'pulse 2s infinite' }}>
                {stats.pending} pending
              </div>
            )}
          </div>
        </nav>

        <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

          {/* ── Stat Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
            {[
              { label: 'Total Bookings', value: stats.total, grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)', icon: '#' },
              { label: 'Pending', value: stats.pending, grad: 'linear-gradient(135deg,#f59e0b,#f97316)', icon: '~' },
              { label: 'Confirmed', value: stats.confirmed, grad: 'linear-gradient(135deg,#10b981,#059669)', icon: '+' },
              { label: 'Rejected', value: stats.rejected, grad: 'linear-gradient(135deg,#ef4444,#dc2626)', icon: 'x' },
              { label: "Today", value: stats.today, grad: 'linear-gradient(135deg,#3b82f6,#2563eb)', icon: '*' },
            ].map(s => (
              <div key={s.label} style={{ background: s.grad, borderRadius: 16, padding: '20px 18px', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, opacity: .85, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'calendar', label: 'Calendar' },
              { key: 'table', label: 'All Bookings' },
              { key: 'pending', label: `Pending${stats.pending ? ` (${stats.pending})` : ''}` },
            ].map(t => (
              <button key={t.key} className={`dash-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ══════════════ OVERVIEW ══════════════ */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Today's schedule */}
              <div className="dash-card" style={{ padding: 24 }}>
                <h6 style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 16 }}>
                  Today's Schedule — {now.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}
                </h6>
                {getAppointmentsForDay(today).length === 0
                  ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0', fontSize: 14 }}>No appointments today</div>
                  : getAppointmentsForDay(today).sort((a, b) => a.time?.localeCompare(b.time)).map(apt => (
                    <div key={apt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <Avatar name={apt.patient_name} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{apt.patient_name || 'Unknown'}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{apt.phone}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#f97316' }}>{apt.time}</div>
                        <StatusBadge status={apt.status} />
                      </div>
                    </div>
                  ))
                }
              </div>

              {/* Pending approvals */}
              <div className="dash-card" style={{ padding: 24 }}>
                <h6 style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 16 }}>Needs Approval</h6>
                {appointments.filter(a => a.status === 'pending_approval').length === 0
                  ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0', fontSize: 14 }}>All clear — no pending approvals</div>
                  : appointments.filter(a => a.status === 'pending_approval')
                      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                      .slice(0, 4)
                      .map(apt => (
                        <div key={apt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <Avatar name={apt.patient_name} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{apt.patient_name || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{apt.date} · {apt.time}</div>
                            <SourceBadge source={apt.source} />
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="action-btn approve-btn" onClick={() => handleAction(apt.id, true)} disabled={actionLoading[apt.id]}>
                              {actionLoading[apt.id] ? '…' : '✓'}
                            </button>
                            <button className="action-btn reject-btn" onClick={() => handleAction(apt.id, false)} disabled={actionLoading[apt.id]}>
                              {actionLoading[apt.id] ? '…' : '✗'}
                            </button>
                          </div>
                        </div>
                      ))
                }
                {appointments.filter(a => a.status === 'pending_approval').length > 4 && (
                  <button className="dash-tab active" style={{ width: '100%', marginTop: 12 }} onClick={() => setActiveTab('pending')}>
                    View all {stats.pending} pending →
                  </button>
                )}
              </div>

              {/* Recent bookings */}
              <div className="dash-card" style={{ padding: 24, gridColumn: '1 / -1' }}>
                <h6 style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 16 }}>Recent Bookings</h6>
                {appointments.slice(0, 5).map(apt => (
                  <div key={apt.id} className="apt-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 8px', borderBottom: '1px solid #f1f5f9', borderRadius: 8 }}>
                    <Avatar name={apt.patient_name} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{apt.patient_name || 'Unknown'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{apt.phone}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{apt.date}</div>
                      <div style={{ color: '#f97316', fontWeight: 700 }}>{apt.time}</div>
                    </div>
                    <SourceBadge source={apt.source} />
                    <StatusBadge status={apt.status} />
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{apt.payment_method === 'medical_aid' ? apt.medical_aid : 'Cash'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════ CALENDAR ══════════════ */}
          {activeTab === 'calendar' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
              <div className="dash-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <button className="action-btn" style={{ background: '#f1f5f9', color: '#1e293b' }}
                    onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}>← Prev</button>
                  <h5 style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', margin: 0 }}>{monthName}</h5>
                  <button className="action-btn" style={{ background: '#f1f5f9', color: '#1e293b' }}
                    onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}>Next →</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
                  ))}
                  {weeks.flatMap((wk, wi) => wk.map((cell, di) => {
                    if (!cell) return <div key={`${wi}-${di}`} />;
                    const dayApts = getAppointmentsForDay(cell.dateStr);
                    const clash = hasClash(cell.dateStr);
                    const isToday = cell.dateStr === today;
                    const isSel = cell.dateStr === selectedDay;
                    return (
                      <div key={cell.dateStr}
                        className={`cal-cell ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}`}
                        onClick={() => setSelectedDay(isSel ? null : cell.dateStr)}>
                        <div className={`cal-day-num ${isToday ? 'today' : ''}`}>{cell.day}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {clash && <span style={{ fontSize: 10, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 4px', fontWeight: 700 }}>!</span>}
                          {dayApts.filter(a => a.status === 'pending_approval').length > 0 &&
                            <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 4px', fontWeight: 700 }}>
                              {dayApts.filter(a => a.status === 'pending_approval').length}P
                            </span>}
                          {dayApts.filter(a => a.status === 'confirmed').length > 0 &&
                            <span style={{ fontSize: 10, background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '1px 4px', fontWeight: 700 }}>
                              {dayApts.filter(a => a.status === 'confirmed').length}C
                            </span>}
                        </div>
                      </div>
                    );
                  }))}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 3, display: 'inline-block' }} /> Today</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ background: '#fef3c7', borderRadius: 4, padding: '0 4px', fontSize: 10, fontWeight: 700 }}>P</span> Pending</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ background: '#d1fae5', borderRadius: 4, padding: '0 4px', fontSize: 10, fontWeight: 700 }}>C</span> Confirmed</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ background: '#ef4444', borderRadius: 4, padding: '0 4px', fontSize: 10, fontWeight: 700, color: '#fff' }}>!</span> Time Clash</span>
                </div>
              </div>

              {/* Day detail */}
              <div className="dash-card" style={{ padding: 24 }}>
                <h6 style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 16 }}>
                  {selectedDay ? formatDateLong(selectedDay) : 'Click a day'}
                </h6>
                <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                  {!selectedDay && <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>Select a date on the calendar</div>}
                  {selectedDay && getAppointmentsForDay(selectedDay).length === 0 && (
                    <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>No appointments on this day</div>
                  )}
                  {selectedDay && getAppointmentsForDay(selectedDay)
                    .sort((a, b) => a.time?.localeCompare(b.time))
                    .map(apt => (
                      <div key={apt.id} style={{ borderRadius: 12, border: `1.5px solid ${STATUS_COLOR[apt.status]}44`, padding: 14, marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <Avatar name={apt.patient_name} size={34} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{apt.patient_name || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{apt.phone}</div>
                          </div>
                          <StatusBadge status={apt.status} />
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
                          <span>Time: {apt.time}</span>
                          <span>Payment: {apt.payment_method === 'medical_aid' ? 'Medical Aid' : 'Cash'}</span>
                          {apt.medical_aid && <span style={{ gridColumn: '1/-1' }}>Aid: {apt.medical_aid} #{apt.membership_number}</span>}
                        </div>
                        <SourceBadge source={apt.source} />
                        {apt.status === 'pending_approval' && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button className="action-btn approve-btn" style={{ flex: 1 }} onClick={() => handleAction(apt.id, true)} disabled={actionLoading[apt.id]}>
                              {actionLoading[apt.id] ? 'Processing…' : '✓ Approve'}
                            </button>
                            <button className="action-btn reject-btn" style={{ flex: 1 }} onClick={() => handleAction(apt.id, false)} disabled={actionLoading[apt.id]}>
                              {actionLoading[apt.id] ? 'Processing…' : '✗ Reject'}
                            </button>
                          </div>
                        )}
                        {actionError[apt.id] && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{actionError[apt.id]}</div>}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ TABLE ══════════════ */}
          {activeTab === 'table' && (
            <div className="dash-card">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <input type="search" placeholder="Search patient or phone…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: 200, border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 14 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['all','All'],['pending_approval','Pending'],['confirmed','Confirmed'],['rejected','Rejected']].map(([k, l]) => (
                    <button key={k} className={`filter-btn ${filterStatus === k ? 'active' : ''}`} onClick={() => setFilterStatus(k)}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                      {[['patient_name','Patient'],['phone','Phone'],['date','Date & Time'],['payment_method','Payment'],['status','Status']].map(([f, l]) => (
                        <th key={f} style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          <button className="sort-btn" onClick={() => toggleSort(f)}>
                            {l} {sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </button>
                        </th>
                      ))}
                      <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Booked At</th>
                      <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppointments.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 15 }}>No appointments found</td></tr>
                    )}
                    {filteredAppointments.map(apt => (
                      <tr key={apt.id} className="apt-row" style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={apt.patient_name} size={34} />
                            <div>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>{apt.patient_name || 'Unknown'}</div>
                              <SourceBadge source={apt.source} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13 }}>{apt.phone}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{apt.date}</div>
                          <div style={{ color: '#f97316', fontWeight: 700, fontSize: 13 }}>{apt.time}</div>
                          {hasClash(apt.date) && apt.status !== 'rejected' &&
                            <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>! Clash</span>}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>
                          {apt.payment_method === 'medical_aid'
                            ? <div><div style={{ fontWeight: 600 }}>{apt.medical_aid}</div><div style={{ color: '#64748b', fontSize: 12 }}>#{apt.membership_number}</div></div>
                            : <span style={{ color: '#10b981', fontWeight: 600 }}>Cash</span>}
                        </td>
                        <td style={{ padding: '12px 16px' }}><StatusBadge status={apt.status} /></td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>{formatTimestamp(apt.created_at)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {apt.status === 'pending_approval' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="action-btn approve-btn" onClick={() => handleAction(apt.id, true)} disabled={actionLoading[apt.id]}>{actionLoading[apt.id] ? '…' : '✓'}</button>
                              <button className="action-btn reject-btn" onClick={() => handleAction(apt.id, false)} disabled={actionLoading[apt.id]}>{actionLoading[apt.id] ? '…' : '✗'}</button>
                            </div>
                          )}
                          {apt.status !== 'pending_approval' && <span style={{ color: '#cbd5e1' }}>—</span>}
                          {actionError[apt.id] && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{actionError[apt.id]}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: 13 }}>
                Showing {filteredAppointments.length} of {appointments.length} appointments
              </div>
            </div>
          )}

          {/* ══════════════ PENDING ══════════════ */}
          {activeTab === 'pending' && (
            <div>
              {stats.pending === 0 && (
                <div className="dash-card" style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 12, color: '#10b981', fontWeight: 800 }}>✓</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', marginBottom: 6 }}>All clear!</div>
                  <div style={{ color: '#64748b' }}>No pending appointments to review.</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 16 }}>
                {appointments.filter(a => a.status === 'pending_approval')
                  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                  .map(apt => (
                    <div key={apt.id} className="pending-card">
                      <div style={{ padding: '14px 18px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                          <Avatar name={apt.patient_name} size={44} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{apt.patient_name || 'Unknown'}</div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>{apt.phone}</div>
                            <SourceBadge source={apt.source} />
                          </div>
                          {hasClash(apt.date) && (
                            <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>! Clash</span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, fontSize: 13 }}>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Date</div>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{apt.date}</div>
                          </div>
                          <div style={{ background: '#fff7ed', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Time</div>
                            <div style={{ fontWeight: 700, color: '#f97316' }}>{apt.time}</div>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', gridColumn: '1/-1' }}>
                            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Payment</div>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                              {apt.payment_method === 'medical_aid' ? `${apt.medical_aid} · #${apt.membership_number}` : 'Cash'}
                            </div>
                          </div>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 14 }}>Booked {formatTimestamp(apt.created_at)}</div>
                      </div>
                      {actionError[apt.id] && <div style={{ margin: '0 18px 10px', color: '#ef4444', fontSize: 12 }}>{actionError[apt.id]}</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
                        <button className="action-btn approve-btn" style={{ borderRadius: '0 0 0 12px', padding: '14px 0', fontSize: 14 }}
                          onClick={() => handleAction(apt.id, true)} disabled={actionLoading[apt.id]}>
                          {actionLoading[apt.id] ? 'Processing…' : '✓ Approve'}
                        </button>
                        <button className="action-btn reject-btn" style={{ borderRadius: '0 0 12px 0', padding: '14px 0', fontSize: 14 }}
                          onClick={() => handleAction(apt.id, false)} disabled={actionLoading[apt.id]}>
                          {actionLoading[apt.id] ? 'Processing…' : '✗ Reject'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.7; } }`}</style>
    </>
  );
}
