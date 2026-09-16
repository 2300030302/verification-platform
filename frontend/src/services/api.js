import axios from 'axios';

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to requests if present in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle unauthenticated responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If token expired or invalid, clear local auth
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password });
    return response.data;
  },
  register: async (name, email, password, role) => {
    const response = await api.post('/api/auth/register', { name, email, password, role });
    return response.data;
  },
  getCurrentUser: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
};

export const documentAPI = {
  upload: async (file, documentType) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('documentType', documentType);
    const response = await api.post('/api/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  getMyDocuments: async () => {
    const response = await api.get('/api/documents/my');
    return response.data;
  },
  getExtractedData: async (documentId) => {
    const response = await api.get(`/api/extracted-data/${documentId}`);
    return response.data;
  },
  getDocumentBlob: async (documentId) => {
    const response = await api.get(`/api/documents/${documentId}/file`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export const validationAPI = {
  getMyValidation: async () => {
    const response = await api.get('/api/validation/my');
    return response.data;
  },
  getValidationResults: async (verificationId) => {
    const response = await api.get(`/api/validation/${verificationId}`);
    return response.data;
  },
  runValidation: async (verificationId) => {
    const response = await api.post(`/api/validation/${verificationId}/run`);
    return response.data;
  },
};

export const riskAPI = {
  getMyRisk: async () => {
    const response = await api.get('/api/risk/my');
    return response.data;
  },
  getRiskAssessment: async (verificationId) => {
    const response = await api.get(`/api/risk/${verificationId}`);
    return response.data;
  },
  calculateRisk: async (verificationId) => {
    const response = await api.post(`/api/risk/${verificationId}/calculate`);
    return response.data;
  },
};

export const transactionAPI = {
  getMyTransactions: async () => {
    const response = await api.get('/api/transactions/my');
    return response.data;
  },
  getTransactions: async (verificationId) => {
    const response = await api.get(`/api/transactions/${verificationId}`);
    return response.data;
  },
  getMyFinancialAnalysis: async () => {
    const response = await api.get('/api/financial-analysis/my');
    return response.data;
  },
  getFinancialAnalysis: async (verificationId) => {
    const response = await api.get(`/api/financial-analysis/${verificationId}`);
    return response.data;
  },
};

export const officerAPI = {
  getCases: async () => {
    const response = await api.get('/api/officer/cases');
    return response.data;
  },
  getCaseDetails: async (verificationId) => {
    const response = await api.get(`/api/officer/cases/${verificationId}`);
    return response.data;
  },
  submitDecision: async (verificationId, status, note) => {
    const response = await api.post(`/api/officer/cases/${verificationId}/decision`, {
      status,
      note,
    });
    return response.data;
  },
  addNote: async (verificationId, note) => {
    const response = await api.post(`/api/officer/cases/${verificationId}/notes`, { note });
    return response.data;
  },
  getNotes: async (verificationId) => {
    const response = await api.get(`/api/officer/cases/${verificationId}/notes`);
    return response.data;
  },
  getAuditTrail: async (verificationId) => {
    const response = await api.get(`/api/officer/cases/${verificationId}/audit-trail`);
    return response.data;
  },
  getDocumentBlob: async (documentId) => {
    const response = await api.get(`/api/documents/${documentId}/file`, {
      responseType: 'blob',
    });
    return response.data;
  },
  askCopilot: async (verificationId, message) => {
    const response = await api.post(`/api/officer/cases/${verificationId}/copilot`, { message });
    return response.data;
  },
  getCopilotHistory: async (verificationId) => {
    const response = await api.get(`/api/officer/cases/${verificationId}/copilot/history`);
    return response.data;
  },
  clearCopilotHistory: async (verificationId) => {
    const response = await api.delete(`/api/officer/cases/${verificationId}/copilot/history`);
    return response.data;
  },
};

export const chatAPI = {
  sendMessage: async (message) => {
    const response = await api.post('/api/chat', { message });
    return response.data;
  },
  getHistory: async () => {
    const response = await api.get('/api/chat/history');
    return response.data;
  },
  clearHistory: async () => {
    const response = await api.delete('/api/chat/history');
    return response.data;
  },
};

export default api;
