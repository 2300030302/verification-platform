const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const chatController = require('../controllers/chatController');

// All chat routes require valid JWT authentication
router.post('/', authMiddleware, chatController.sendMessage);
router.get('/history', authMiddleware, chatController.getHistory);
router.delete('/history', authMiddleware, chatController.clearHistory);

module.exports = router;
