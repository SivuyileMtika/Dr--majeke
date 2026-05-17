import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.REACT_APP_DOCTOR_TOKEN || '';

const STATUS_COLORS = {
  pending_approval: 'warning',
  confirmed: 'success',
  rejected: 'danger',
};

const STATUS_LABELS = {
  pending_approval: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    if (!AUTH_TOKEN) {
      setError('REACT_APP_DOCTOR_TOKEN not configured');
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'appointments'),
      orderBy('created_at', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setAppointments(docs);
      setLoading(false);
    }, err => {
      setError('Failed to load appointments');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const formatTimestamp = ts => {
    if (!ts) return 'N/A';
    try {
      if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString('en-ZA');
      return new Date(ts).toLocaleString('en-ZA');
    } catch { return 'N/A'; }
  };

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

  const stats = {
    total: appointments.length,
    pending: appointments.filter(a => a.status === 'pending_approval').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    rejected: appointments.filter(a => a.status === 'rejected').length,
    today: appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length,
  };

  const getAppointmentsForDay = dateStr =>
    appointments.filter(a => a.date === dateStr);

  const hasClash = dateStr => {
    const dayApts = getAppointmentsForDay(dateStr);
    const times = dayApts.map(a => a.time);
    return times.length !== new Set(times).size;
  };

  const buildCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks = [];
    let day = 1 - firstDay;
    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 0; d < 7; d++, day++) {
        if (day < 1 || day > daysInMonth) {
          week.push(null);
        } else {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          week.push({ day, dateStr });
        }
      }
      weeks.push(week);
      if (day > daysInMonth) break;
    }
    return weeks;
  };

  const filteredAppointments = appointments
    .filter(a => filterStatus === 'all' || a.status === filterStatus)
    .sort((a, b) => {
      let va = a[sortField] || '';
      let vb = b[sortField] || '';
      if (sortField === 'date') { va = a.date + a.time; vb = b.date + b.time; }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const toggleSort = field => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const today = new Date().toISOString().split('T')[0];
  const weeks = buildCalendar();
  const monthName = currentMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  if (loading) return <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}><div className="spinner-border text-primary" /></div>;
  if (error) return <div className="alert alert-danger m-4">{error}</div>;

  return (
    <div className="min-vh-100 bg-light">
      {/* Header */}
      <nav className="navbar navbar-dark bg-primary px-4 py-3">
        <span className="navbar-brand fw-bold fs-4">Dr Majeke Clinic</span>
        <span className="text-white-50 small">Booking Management System</span>
      </nav>

      <div className="container-fluid p-4">
        {/* Stats Cards */}
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Bookings', value: stats.total, color: 'primary', icon: '📋' },
            { label: 'Pending Approval', value: stats.pending, color: 'warning', icon: '⏳' },
            { label: 'Confirmed', value: stats.confirmed, color: 'success', icon: '✅' },
            { label: 'Rejected', value: stats.rejected, color: 'danger', icon: '❌' },
            { label: "Today's Appointments", value: stats.today, color: 'info', icon: '📅' },
          ].map(s => (
            <div key={s.label} className="col-6 col-md-4 col-lg-2">
              <div className={`card border-${s.color} h-100`}>
                <div className="card-body text-center p-3">
                  <div className="fs-2">{s.icon}</div>
                  <div className={`fw-bold fs-3 text-${s.color}`}>{s.value}</div>
                  <div className="text-muted small">{s.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <ul className="nav nav-tabs mb-4">
          {[
            { key: 'calendar', label: '📅 Calendar' },
            { key: 'table', label: '📊 All Bookings' },
            { key: 'pending', label: `⏳ Pending (${stats.pending})` },
          ].map(tab => (
            <li key={tab.key} className="nav-item">
              <button
                className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Calendar View */}
        {activeTab === 'calendar' && (
          <div className="row g-4">
            <div className="col-lg-8">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <button className="btn btn-sm btn-outline-secondary"
                    onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}>
                    ← Prev
                  </button>
                  <h5 className="mb-0 fw-bold">{monthName}</h5>
                  <button className="btn btn-sm btn-outline-secondary"
                    onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}>
                    Next →
                  </button>
                </div>
                <div className="card-body p-0">
                  <table className="table table-bordered mb-0">
                    <thead className="table-light">
                      <tr>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <th key={d} className="text-center py-2 small">{d}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {weeks.map((week, wi) => (
                        <tr key={wi}>
                          {week.map((cell, di) => {
                            if (!cell) return <td key={di} className="bg-light" style={{ height: 80 }} />;
                            const dayApts = getAppointmentsForDay(cell.dateStr);
                            const clash = hasClash(cell.dateStr);
                            const isToday = cell.dateStr === today;
                            const isSelected = cell.dateStr === selectedDay;
                            return (
                              <td key={di}
                                style={{ height: 80, cursor: 'pointer', verticalAlign: 'top' }}
                                className={`p-1 ${isSelected ? 'table-primary' : ''} ${isToday ? 'table-warning' : ''}`}
                                onClick={() => setSelectedDay(isSelected ? null : cell.dateStr)}
                              >
                                <div className="fw-bold small mb-1">{cell.day}</div>
                                {dayApts.length > 0 && (
                                  <div>
                                    {clash && <span className="badge bg-danger me-1 small">⚠ Clash</span>}
                                    {dayApts.filter(a => a.status === 'pending_approval').length > 0 &&
                                      <span className="badge bg-warning text-dark me-1 small">
                                        {dayApts.filter(a => a.status === 'pending_approval').length} pending
                                      </span>}
                                    {dayApts.filter(a => a.status === 'confirmed').length > 0 &&
                                      <span className="badge bg-success me-1 small">
                                        {dayApts.filter(a => a.status === 'confirmed').length} confirmed
                                      </span>}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-footer d-flex gap-3 small text-muted">
                  <span><span className="badge bg-warning text-dark">●</span> Pending</span>
                  <span><span className="badge bg-success">●</span> Confirmed</span>
                  <span><span className="badge bg-danger">●</span> Time Clash</span>
                  <span className="ms-2 bg-warning px-2 rounded">Highlighted = Today</span>
                </div>
              </div>
            </div>

            {/* Day Detail Panel */}
            <div className="col-lg-4">
              <div className="card h-100">
                <div className="card-header">
                  <h6 className="mb-0 fw-bold">
                    {selectedDay ? `Appointments — ${new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Click a day to see appointments'}
                  </h6>
                </div>
                <div className="card-body overflow-auto" style={{ maxHeight: 500 }}>
                  {!selectedDay && <p className="text-muted text-center mt-4">Select a day on the calendar</p>}
                  {selectedDay && getAppointmentsForDay(selectedDay).length === 0 && (
                    <p className="text-muted text-center mt-4">No appointments this day</p>
                  )}
                  {selectedDay && getAppointmentsForDay(selectedDay)
                    .sort((a, b) => a.time?.localeCompare(b.time))
                    .map(apt => (
                      <div key={apt.id} className={`card border-${STATUS_COLORS[apt.status]} mb-3`}>
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <div className="fw-bold">{apt.patient_name || 'Unknown'}</div>
                              <div className="text-muted small">{apt.phone}</div>
                              <span className={`badge ${apt.source === 'website' ? 'bg-info' : 'bg-success'} small`}>
                                {apt.source === 'website' ? '🌐 Website' : '💬 WhatsApp'}
                              </span>
                            </div>
                            <span className={`badge bg-${STATUS_COLORS[apt.status]}`}>
                              {STATUS_LABELS[apt.status]}
                            </span>
                          </div>
                          <div className="small mb-2">
                            <div>⏰ {apt.time}</div>
                            <div>💳 {apt.payment_method === 'medical_aid' ? `${apt.medical_aid} (${apt.membership_number})` : 'Cash'}</div>
                          </div>
                          {apt.status === 'pending_approval' && (
                            <>
                              {actionError[apt.id] && <div className="alert alert-danger p-1 small mb-2">{actionError[apt.id]}</div>}
                              <div className="btn-group w-100">
                                <button className="btn btn-success btn-sm"
                                  onClick={() => handleAction(apt.id, true)}
                                  disabled={actionLoading[apt.id]}>
                                  {actionLoading[apt.id] ? '...' : '✓ Approve'}
                                </button>
                                <button className="btn btn-danger btn-sm"
                                  onClick={() => handleAction(apt.id, false)}
                                  disabled={actionLoading[apt.id]}>
                                  {actionLoading[apt.id] ? '...' : '✗ Reject'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table View */}
        {activeTab === 'table' && (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h6 className="mb-0 fw-bold">All Appointments</h6>
              <div className="btn-group">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'pending_approval', label: 'Pending' },
                  { key: 'confirmed', label: 'Confirmed' },
                  { key: 'rejected', label: 'Rejected' },
                ].map(f => (
                  <button key={f.key}
                    className={`btn btn-sm ${filterStatus === f.key ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setFilterStatus(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      {[
                        { key: 'patient_name', label: 'Patient' },
                        { key: 'phone', label: 'Phone' },
                        { key: 'date', label: 'Date & Time' },
                        { key: 'payment_method', label: 'Payment' },
                        { key: 'status', label: 'Status' },
                      ].map(col => (
                        <th key={col.key} style={{ cursor: 'pointer' }} onClick={() => toggleSort(col.key)}>
                          {col.label} {sortField === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </th>
                      ))}
                      <th>Booked At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppointments.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-muted py-4">No appointments found</td></tr>
                    )}
                    {filteredAppointments.map(apt => (
                      <tr key={apt.id}>
                        <td>
                          <div className="fw-semibold">{apt.patient_name || 'Unknown'}</div>
                          <span className={`badge ${apt.source === 'website' ? 'bg-info' : 'bg-success'} small`}>
                            {apt.source === 'website' ? '🌐 Website' : '💬 WhatsApp'}
                          </span>
                        </td>
                        <td className="text-muted small">{apt.phone}</td>
                        <td>
                          <div>{apt.date}</div>
                          <div className="text-muted small">{apt.time}</div>
                          {hasClash(apt.date) && apt.status !== 'rejected' &&
                            <span className="badge bg-danger small">⚠ Clash</span>}
                        </td>
                        <td>
                          {apt.payment_method === 'medical_aid'
                            ? <div><div className="small fw-semibold">{apt.medical_aid}</div><div className="text-muted small">{apt.membership_number}</div></div>
                            : 'Cash'}
                        </td>
                        <td>
                          <span className={`badge bg-${STATUS_COLORS[apt.status]}`}>
                            {STATUS_LABELS[apt.status]}
                          </span>
                        </td>
                        <td className="small text-muted">{formatTimestamp(apt.created_at)}</td>
                        <td>
                          {apt.status === 'pending_approval' && (
                            <div className="btn-group">
                              <button className="btn btn-success btn-sm"
                                onClick={() => handleAction(apt.id, true)}
                                disabled={actionLoading[apt.id]}>
                                {actionLoading[apt.id] ? '...' : '✓'}
                              </button>
                              <button className="btn btn-danger btn-sm"
                                onClick={() => handleAction(apt.id, false)}
                                disabled={actionLoading[apt.id]}>
                                {actionLoading[apt.id] ? '...' : '✗'}
                              </button>
                            </div>
                          )}
                          {apt.status !== 'pending_approval' && <span className="text-muted small">—</span>}
                          {actionError[apt.id] && <div className="text-danger small">{actionError[apt.id]}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card-footer text-muted small">
              Showing {filteredAppointments.length} of {appointments.length} appointments
            </div>
          </div>
        )}

        {/* Pending View */}
        {activeTab === 'pending' && (
          <div>
            {appointments.filter(a => a.status === 'pending_approval').length === 0 && (
              <div className="alert alert-success">No pending appointments — all clear!</div>
            )}
            <div className="row g-3">
              {appointments.filter(a => a.status === 'pending_approval')
                .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                .map(apt => (
                  <div key={apt.id} className="col-12 col-md-6 col-lg-4">
                    <div className="card border-warning h-100">
                      <div className="card-header bg-warning bg-opacity-25 d-flex justify-content-between">
                        <span className="fw-bold">{apt.patient_name || 'Unknown'}</span>
                        {hasClash(apt.date) && <span className="badge bg-danger">⚠ Time Clash</span>}
                      </div>
                      <div className="card-body">
                        <div className="mb-3">
                          <div>📞 {apt.phone}</div>
                          <div>📅 {apt.date} at {apt.time}</div>
                          <div>💳 {apt.payment_method === 'medical_aid'
                            ? `${apt.medical_aid} (${apt.membership_number})` : 'Cash'}</div>
                          <div className="text-muted small mt-1">Booked: {formatTimestamp(apt.created_at)}</div>
                        </div>
                        {actionError[apt.id] && <div className="alert alert-danger p-2 small">{actionError[apt.id]}</div>}
                        <div className="btn-group w-100">
                          <button className="btn btn-success"
                            onClick={() => handleAction(apt.id, true)}
                            disabled={actionLoading[apt.id]}>
                            {actionLoading[apt.id] ? 'Processing...' : '✓ Approve'}
                          </button>
                          <button className="btn btn-danger"
                            onClick={() => handleAction(apt.id, false)}
                            disabled={actionLoading[apt.id]}>
                            {actionLoading[apt.id] ? 'Processing...' : '✗ Reject'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
