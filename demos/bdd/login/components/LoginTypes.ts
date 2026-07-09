export interface LoginPageProps {
  /** When true, shows an amber 'Quick Login Expired' banner above the form */
  quickLoginExpired?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface LoginError {
  status: number;
  message: string;
  code?: string;
}
