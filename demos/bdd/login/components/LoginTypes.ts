export interface LoginCallbacks {
  onLogin: (username: string, password: string) => Promise<LoginResult>
  onBiometricLogin: () => Promise<LoginResult>
  onNavigateHome: () => void
  onNavigateLogin: () => void
}

export interface LoginState {
  username: string
  password: string
  failedAttempts: number
  accountLockedUntil: Date | null
  accountSuspended: boolean
  isSubmitting: boolean
  sessionToken: string | null
}

export type LoginResult =
  | { success: true }
  | { success: false; error: LoginError }

export type LoginError =
  | "empty_fields"
  | "invalid_credentials"
  | "account_locked"
  | "account_suspended"
  | "network_error"
  | "quick_login_expired"

export interface LoginPageProps {
  callbacks: LoginCallbacks
  quickLoginExpired?: boolean
}

export interface LoginBannerProps {
  message: string
  type: "error" | "success" | "warning"
  testId?: string
}
