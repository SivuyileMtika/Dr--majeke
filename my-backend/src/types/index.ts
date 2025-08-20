export interface Appointment {
  id: string;
  date: string;
  time: string;
  userId: string;
  status: 'pending' | 'approved' | 'canceled';
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'patient';
}