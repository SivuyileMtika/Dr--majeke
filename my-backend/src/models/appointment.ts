import { v4 as uuidv4 } from 'uuid';

export class Appointment {
  id: string;
  date: string;
  time: string;
  userId: string;
  status: 'pending' | 'approved' | 'canceled';

  constructor(date: string, time: string, userId: string) {
    this.id = uuidv4();
    this.date = date;
    this.time = time;
    this.userId = userId;
    this.status = 'pending';
  }

  updateStatus(newStatus: 'pending' | 'approved' | 'canceled') {
    this.status = newStatus;
  }
}