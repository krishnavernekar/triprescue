const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      let data;
      try {
        data = await response.json();
      } catch {
        data = { success: false, error: 'Server returned non-JSON response' };
      }

      if (!response.ok) {
        const errorMsg =
          data.error?.message ||
          (typeof data.error === 'string' ? data.error : null) ||
          data.message ||
          `Request failed with HTTP ${response.status}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      console.error(`[TripRescue API] ${error.message}`);
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async patch(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Health check
  async getHealth() {
    return this.get('/health');
  }

  // Trips
  async getTrips() {
    return this.get('/trips');
  }

  async getTrip(id) {
    return this.get(`/trips/${id}`);
  }

  async createTrip(tripData) {
    return this.post('/trips', tripData);
  }

  async patchTrip(id, tripData) {
    return this.patch(`/trips/${id}`, tripData);
  }

  async updateTrip(id, tripData) {
    return this.put(`/trips/${id}`, tripData);
  }

  async deleteTrip(id) {
    return this.delete(`/trips/${id}`);
  }

  // Segments
  async addSegment(tripId, segmentData) {
    return this.post(`/trips/${tripId}/segments`, segmentData);
  }

  // Disruption
  async reportDisruption(tripId, disruptionData) {
    return this.post(`/trips/${tripId}/disruption`, disruptionData);
  }

  // Recovery Session
  async createRecoverySession(tripId) {
    return this.post(`/trips/${tripId}/recovery-session`);
  }

  async getRecoverySession(id) {
    return this.get(`/recovery-sessions/${id}`);
  }

  // Agent Recovery Operations
  async startRecovery(tripId, options = {}) {
    return this.post(`/trips/${tripId}/recovery/start`, options);
  }

  async replanRecovery(sessionId, options = {}) {
    return this.post(`/recovery-sessions/${sessionId}/replan`, options);
  }

  async simulateRecovery(sessionId, options = {}) {
    return this.post(`/recovery-sessions/${sessionId}/simulate`, options);
  }

  // Monitoring Operations
  async getMonitoringStatus(sessionId) {
    return this.get(`/recovery/${sessionId}/monitor/status`);
  }

  async startMonitoring(sessionId, intervalMs) {
    return this.post(`/recovery/${sessionId}/monitor/start`, { intervalMs });
  }

  async stopMonitoring(sessionId) {
    return this.post(`/recovery/${sessionId}/monitor/stop`);
  }

  async pauseMonitoring(sessionId) {
    return this.post(`/recovery/${sessionId}/monitor/pause`);
  }

  async checkMonitoringNow(sessionId, mockOverride = null) {
    return this.post(`/recovery/${sessionId}/monitor/check`, mockOverride ? { mockOverride } : {});
  }

  async getRecoveryEvents(sessionId) {
    return this.get(`/recovery-sessions/${sessionId}/events`);
  }

  async getRecoveryPlans(sessionId) {
    return this.get(`/recovery-sessions/${sessionId}/plans`);
  }

  // External Handoff Operations
  async approveRecovery(sessionId, planId = null) {
    return this.post(`/recovery-sessions/${sessionId}/approve`, { planId });
  }

  async executeRecoveryHandoff(sessionId, planId = null) {
    return this.post(`/recovery-sessions/${sessionId}/handoff`, { planId });
  }

  // Insurance & Statutory Compensation Operations
  async getInsurance(tripId) {
    return this.get(`/insurance/${tripId}`);
  }

  async analyzeInsurance(payload) {
    return this.post('/insurance/analyze', payload);
  }

  async getCompensation(tripId) {
    return this.get(`/compensation/${tripId}`);
  }

  async checkCompensation(payload) {
    return this.post('/compensation/check', payload);
  }

  // Notifications & Calendar Operations
  async getNotifications(tripId) {
    return this.get('/notifications' + (tripId ? `?tripId=${tripId}` : ''));
  }

  async markNotificationRead(id) {
    return this.patch(`/notifications/${id}/read`, {});
  }

  async getCalendarEvents() {
    return this.get('/calendar/events');
  }

  async prepareCalendarUpdate(payload) {
    return this.post('/calendar/prepare-update', payload);
  }

  async updateCalendar(payload) {
    return this.post('/calendar/update', payload);
  }
}

export const apiService = new ApiService();
export default apiService;
