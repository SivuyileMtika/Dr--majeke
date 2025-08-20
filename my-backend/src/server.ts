import express from 'express';
export default express;

import { connect } from './utils/db.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import authMiddleware from './middleware/authMiddleware.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(authMiddleware);

app.use('/api/appointments', appointmentRoutes);

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });