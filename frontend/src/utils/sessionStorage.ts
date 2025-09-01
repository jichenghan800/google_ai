import { v4 as uuidv4 } from 'uuid';

export class SessionStorage {
  private static readonly SESSION_ID_KEY = 'ai_image_generator_session_id';
  private static readonly SESSION_DATA_KEY = 'ai_image_generator_session_data';

  static getSessionId(): string | null {
    return sessionStorage.getItem(this.SESSION_ID_KEY);
  }

  static setSessionId(sessionId: string): void {
    sessionStorage.setItem(this.SESSION_ID_KEY, sessionId);
  }

  static generateAndSetSessionId(): string {
    const sessionId = uuidv4();
    this.setSessionId(sessionId);
    return sessionId;
  }

  static clearSessionId(): void {
    sessionStorage.removeItem(this.SESSION_ID_KEY);
  }

  static getSessionData<T = any>(): T | null {
    const data = sessionStorage.getItem(this.SESSION_DATA_KEY);
    if (!data) return null;
    
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse session data:', error);
      return null;
    }
  }

  static setSessionData<T = any>(data: T): void {
    try {
      sessionStorage.setItem(this.SESSION_DATA_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to store session data:', error);
    }
  }

  static clearSessionData(): void {
    sessionStorage.removeItem(this.SESSION_DATA_KEY);
  }

  static clearAll(): void {
    this.clearSessionId();
    this.clearSessionData();
  }

  static isSupported(): boolean {
    try {
      const test = '__sessionStorage_test__';
      sessionStorage.setItem(test, 'test');
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }
}