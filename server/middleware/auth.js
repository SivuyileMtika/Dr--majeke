const DOCTOR_TOKEN = process.env.DOCTOR_AUTH_TOKEN || 'change-me-in-production';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== DOCTOR_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

module.exports = { authMiddleware };
