const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Public auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected auth routes
router.get('/me', authMiddleware, authController.getCurrentUser);

module.exports = router;
