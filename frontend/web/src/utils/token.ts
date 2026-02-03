/**
 * Token utility helpers
 * Centralized access to JWT token from localStorage
 */

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function requireToken(): string {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required. Please log in.');
  }
  return token;
}

