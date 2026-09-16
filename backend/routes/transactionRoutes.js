const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const transactionController = require('../controllers/transactionController');

// All transaction endpoints require JWT authentication
router.use(authMiddleware);

// GET /api/transactions/my - Active customer's transactions
router.get('/my', transactionController.getMyTransactions);

// GET /api/transactions/:verificationId - Transactions for verification case
router.get('/:verificationId', transactionController.getTransactionsByCaseId);

module.exports = router;
