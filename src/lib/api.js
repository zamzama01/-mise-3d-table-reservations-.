export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = 'mise_jwt_token';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

async function request(url, options = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error || `Request failed (${res.status})`,
      data?.code,
    );
  }
  return data;
}

export const api = {
  auth: {
    register: (payload) =>
      request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    login: (payload) =>
      request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    google: (payload) =>
      request('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    me: () => request('/api/auth/me'),
  },

  restaurants: {
    list: (params) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.cuisine && params.cuisine !== 'All') qs.set('cuisine', params.cuisine);
      if (params?.location && params.location !== 'All') qs.set('location', params.location);
      if (params?.partySize) qs.set('partySize', String(params.partySize));
      if (params?.date) qs.set('date', params.date);
      if (params?.startTime) qs.set('startTime', params.startTime);
      if (params?.endTime) qs.set('endTime', params.endTime);
      const query = qs.toString();
      return request(`/api/restaurants${query ? `?${query}` : ''}`);
    },

    detail: (id, params) => {
      const qs = new URLSearchParams();
      if (params?.date) qs.set('date', params.date);
      if (params?.startTime) qs.set('startTime', params.startTime);
      if (params?.endTime) qs.set('endTime', params.endTime);
      if (params?.partySize) qs.set('partySize', String(params.partySize));
      const query = qs.toString();
      return request(`/api/restaurants/${id}${query ? `?${query}` : ''}`);
    },

    availability: (id, params) => {
      const qs = new URLSearchParams({
        date: params.date,
        startTime: params.startTime,
        endTime: params.endTime,
        partySize: String(params.partySize),
      });
      return request(`/api/restaurants/${id}/availability?${qs.toString()}`);
    },
  },

  bookings: {
    create: (payload, gmailAccessToken = '') =>
      request('/api/bookings', {
        method: 'POST',
        headers: gmailAccessToken
          ? { 'x-gmail-access-token': gmailAccessToken }
          : undefined,
        body: JSON.stringify(payload),
      }),

    sendConfirmation: (id, gmailAccessToken = '') =>
      request(`/api/bookings/${id}/send-confirmation`, {
        method: 'POST',
        headers: gmailAccessToken
          ? { 'x-gmail-access-token': gmailAccessToken }
          : undefined,
      }),

    my: () => request('/api/bookings/my'),

    cancel: (id) =>
      request(`/api/bookings/${id}/cancel`, {
        method: 'PATCH',
      }),
  },

  owner: {
    restaurants: () => request('/api/owner/restaurants'),

    uploadImage: (file) => {
      const formData = new FormData();
      formData.append('image', file);
      return request('/api/upload/restaurant-image', {
        method: 'POST',
        body: formData,
      });
    },

    createRestaurant: (payload) =>
      request('/api/restaurants', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateRestaurant: (id, payload) =>
      request(`/api/restaurants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),

    createTable: (restaurantId, payload) =>
      request(`/api/restaurants/${restaurantId}/tables`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateTable: (tableId, payload) =>
      request(`/api/tables/${tableId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),

    bookings: () => request('/api/owner/bookings'),

    updateBookingStatus: (bookingId, status) =>
      request(`/api/owner/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  },

  notifications: {
    list: () => request('/api/notifications'),
    markAllRead: () =>
      request('/api/notifications/read', { method: 'PATCH' }),
  },

  ai: {
    recommend: (payload) =>
      request('/api/ai/recommend', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
};
