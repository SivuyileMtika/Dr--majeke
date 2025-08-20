import { Request, Response } from 'express';
import { Appointment } from '../models/appointment.js';
import authMiddleware from '../middleware/authMiddleware.js';

export class AppointmentController {
  private appointments: Appointment[] = [];

  public createAppointment(req: Request, res: Response): void {
    const { date, time, userId } = req.body;
    const newAppointment = new Appointment(date, time, userId);
    this.appointments.push(newAppointment);
    res.status(201).json(newAppointment);
  }

  public getAppointments(req: Request, res: Response): void {
    res.status(200).json(this.appointments);
  }

  public updateAppointment(req: Request, res: Response): void {
    const { id } = req.params;
    const { date, time, status } = req.body;
    const appointment = this.appointments.find(app => app.id === id);

    if (!appointment) {
      res.status(404).json({ message: 'Appointment not found' });
      return;
    }

    if (date) appointment.date = date;
    if (time) appointment.time = time;
    if (status) appointment.status = status;

    res.status(200).json(appointment);
  }
}