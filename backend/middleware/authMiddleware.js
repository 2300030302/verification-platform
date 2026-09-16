const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  return process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_key';
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication token is required. Format: Bearer <token>',
    });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication token is missing.',
    });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token has expired. Please log in again.',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.',
    });
  }
};

module.exports = authMiddleware;
