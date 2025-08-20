import { Router } from 'express';
import { AppointmentController } from '../controllers/appointmentController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const appointmentController = new AppointmentController();

const appointmentRoutes = Router();

appointmentRoutes.post('/', authMiddleware, appointmentController.createAppointment.bind(appointmentController));
appointmentRoutes.get('/', authMiddleware, appointmentController.getAppointments.bind(appointmentController));
appointmentRoutes.put('/:id', authMiddleware, appointmentController.updateAppointment.bind(appointmentController));

export default appointmentRoutes;