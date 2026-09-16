const db = require('../config/database');
const aiAssistantService = require('../services/aiAssistantService');

/**
 * POST /api/chat
 * Handles an incoming customer chat message.
 */
const sendMessage = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message text is required.',
      });
    }

    if (message.trim().length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Message is too long. Please keep your question under 1,000 characters.',
      });
    }

    const userId = req.user.id;

    // 1. Retrieve safe, customer-specific verification context
    const safeContext = await aiAssistantService.getCustomerSafeContext(userId);

    // 2. Fetch recent conversation history for continuity
    const history = await db.getChatHistory(userId, 10);

    // 3. Generate grounded AI response
    const reply = await aiAssistantService.generateResponse(
      message.trim(),
      safeContext,
      history
    );

    // 4. Save both user message and assistant reply in chat_messages table
    await db.saveChatMessage(userId, safeContext.verificationId, 'user', message.trim());
    await db.saveChatMessage(userId, safeContext.verificationId, 'assistant', reply);

    return res.json({
      success: true,
      reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ChatController] Error processing chat message:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to process your question at this moment. Please try again.',
      details: error.message,
    });
  }
};

/**
 * GET /api/chat/history
 * Retrieves customer's chat message history.
 */
const getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const messages = await db.getChatHistory(userId, 50);

    return res.json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error('[ChatController] Error retrieving chat history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation history.',
      details: error.message,
    });
  }
};

/**
 * DELETE /api/chat/history
 * Clears customer's chat message history.
 */
const clearHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    await db.clearChatHistory(userId);

    return res.json({
      success: true,
      message: 'Chat history cleared successfully.',
    });
  } catch (error) {
    console.error('[ChatController] Error clearing chat history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clear chat history.',
      details: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getHistory,
  clearHistory,
};
