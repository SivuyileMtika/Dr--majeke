import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ArrowLeft, CheckCircle, XCircle, AlertCircle, FileText, CreditCard } from 'lucide-react';
import { Appointment, User } from '../types/auth';

interface PatientDashboardProps {
  user: User;
  onBack: () => void;
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'declined';

const STATUS_CONFIG = {
  pending: {
    label: 'Pending Review',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: AlertCircle,
    iconColor: 'text-yellow-500',
    dot: 'bg-yellow-400',
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
    iconColor: 'text-green-500',
    dot: 'bg-green-500',
  },
  declined: {
    label: 'Declined',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
    iconColor: 'text-red-500',
    dot: 'bg-red-400',
  },
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatDateTime = (isoStr: string) =>
  new Date(isoStr).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const isUpcoming = (date: string, time: string) => {
  const dt = new Date(`${date}T${time}`);
  return dt >= new Date();
};

export const PatientDashboard: React.FC<PatientDashboardProps> = ({ user, onBack }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('all');

  useEffect(() => {
    const load = () => {
      const stored = localStorage.getItem('appointments');
      const all: Appointment[] = stored ? JSON.parse(stored) : [];
      const mine = all
        .filter(a => a.userId === user.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAppointments(mine);
    };
    load();
    const handleUpdate = () => load();
    window.addEventListener('appointmentsUpdated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    const interval = setInterval(load, 2000);
    return () => {
      window.removeEventListener('appointmentsUpdated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      clearInterval(interval);
    };
  }, [user.id]);

  const counts = {
    all: appointments.length,
    pending: appointments.filter(a => a.status === 'pending').length,
    approved: appointments.filter(a => a.status === 'approved').length,
    declined: appointments.filter(a => a.status === 'declined').length,
  };

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <div>
            <h1 className="text-base font-bold text-gray-900">My Appointments</h1>
            <p className="text-xs text-gray-400">{user.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {(['all', 'pending', 'approved', 'declined'] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`p-4 rounded-xl border text-left transition-all duration-150 ${
                filter === s
                  ? s === 'all' ? 'bg-gray-900 border-gray-900 text-white'
                  : s === 'approved' ? 'bg-green-600 border-green-600 text-white'
                  : s === 'declined' ? 'bg-red-500 border-red-500 text-white'
                  : 'bg-yellow-500 border-yellow-500 text-white'
                  : 'bg-white border-gray-100 text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === s ? 'text-white' : 'text-gray-900'}`}>
                {counts[s]}
              </div>
              <div className={`text-xs mt-0.5 capitalize ${filter === s ? 'text-white/80' : 'text-gray-400'}`}>
                {s === 'all' ? 'Total Bookings' : s}
              </div>
            </button>
          ))}
        </div>

        {/* Appointments list */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <Calendar className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No {filter === 'all' ? '' : filter} appointments found</p>
            <p className="text-gray-400 text-sm mt-1">
              {filter === 'all' ? 'Book your first appointment to get started.' : `You have no ${filter} appointments.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(appt => {
              const cfg = STATUS_CONFIG[appt.status];
              const StatusIcon = cfg.icon;
              const upcoming = isUpcoming(appt.date, appt.time);

              return (
                <div key={appt.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow">
                  {/* Status bar */}
                  <div className={`h-1 w-full ${cfg.dot}`} />

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Date block */}
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center w-14 flex-shrink-0 border border-gray-100">
                        <div className="text-[10px] text-gray-400 font-medium">
                          {new Date(appt.date).toLocaleDateString('en-ZA', { month: 'short' }).toUpperCase()}
                        </div>
                        <div className="text-xl font-bold text-gray-900 leading-none">
                          {new Date(appt.date).getDate()}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{appt.time}</div>
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-1.5 mb-1">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                          {upcoming && appt.status === 'approved' && (
                            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
                              Upcoming
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {formatDate(appt.date)} · {appt.time}
                        </p>
                        {appt.reason && (
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                            <FileText className="h-3 w-3 flex-shrink-0" />
                            {appt.reason}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <CreditCard className="h-3 w-3 flex-shrink-0" />
                          {appt.paymentType === 'medical'
                            ? `${appt.medicalAid || 'Medical Aid'}`
                            : 'Cash'}
                        </p>
                      </div>

                      {/* Submitted date */}
                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <p className="text-[10px] text-gray-400">Submitted</p>
                        <p className="text-[10px] text-gray-500 font-medium">{formatDateTime(appt.createdAt)}</p>
                      </div>
                    </div>

                    {/* Status timeline */}
                    <div className="mt-4 pt-4 border-t border-gray-50">
                      <div className="flex items-center gap-0">
                        {/* Step 1: Submitted */}
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
                            <CheckCircle className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-xs text-gray-500 mt-1 whitespace-nowrap">Submitted</span>
                        </div>
                        <div className={`flex-1 h-0.5 mx-1 mb-4 ${appt.status !== 'pending' ? 'bg-gray-900' : 'bg-gray-200'}`} />
                        {/* Step 2: Under Review */}
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            appt.status !== 'pending' ? 'bg-gray-900' : 'bg-gray-200'
                          }`}>
                            {appt.status !== 'pending'
                              ? <CheckCircle className="h-3.5 w-3.5 text-white" />
                              : <Clock className="h-3.5 w-3.5 text-gray-400" />}
                          </div>
                          <span className="text-xs text-gray-500 mt-1 whitespace-nowrap">Reviewed</span>
                        </div>
                        <div className={`flex-1 h-0.5 mx-1 mb-4 ${
                          appt.status === 'approved' ? 'bg-green-500'
                          : appt.status === 'declined' ? 'bg-red-400'
                          : 'bg-gray-200'
                        }`} />
                        {/* Step 3: Outcome */}
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            appt.status === 'approved' ? 'bg-green-500'
                            : appt.status === 'declined' ? 'bg-red-400'
                            : 'bg-gray-200'
                          }`}>
                            {appt.status === 'approved' && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                            {appt.status === 'declined' && <XCircle className="h-3.5 w-3.5 text-white" />}
                            {appt.status === 'pending' && <AlertCircle className="h-3.5 w-3.5 text-gray-400" />}
                          </div>
                          <span className={`text-xs mt-1 font-semibold whitespace-nowrap ${
                            appt.status === 'approved' ? 'text-green-600'
                            : appt.status === 'declined' ? 'text-red-500'
                            : 'text-gray-400'
                          }`}>
                            {appt.status === 'approved' ? 'Confirmed' : appt.status === 'declined' ? 'Declined' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Declined note */}
                    {appt.status === 'declined' && (
                      <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
                        Your appointment was not confirmed. Please book a new slot or contact the practice.
                      </div>
                    )}
                    {appt.status === 'approved' && upcoming && (
                      <div className="mt-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
                        Your appointment is confirmed. Please arrive 10 minutes early.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
