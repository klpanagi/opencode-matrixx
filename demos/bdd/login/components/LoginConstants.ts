// Generated from BDD Contract: 1001_username_password.feature.contract.json
// @ui:string and @ui:testid annotations

export const UI_STRINGS = {
  button: {
    sign_in: "Sign in",
    signing_in: "Signing in...",
  },
  message: {
    login_successful: "Login successful!",
    empty_fields: "Please enter both username and password.",
    invalid_credentials:
      "Invalid username or password. Please try again.",
    account_locked:
      "Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.",
    quick_login_expired:
      "Quick Login Expired. For your security, please sign in again with your email and password.",
  },
} as const

export const TEST_IDS = {
  username_field: "username_field",
  password_field: "password_field",
  sign_in_button: "sign_in_button",
  biometric_shortcut_button: "biometric_shortcut_button",
  error_message: "error_message",
  success_message: "success_message",
  lockout_banner: "lockout_banner",
} as const

export const ROUTES = {
  login: "/login",
  home: "/home",
} as const

export const API_ENDPOINTS = {
  login: "POST /auth/login",
  session: "GET /auth/session",
} as const

export const API_RESPONSES = {
  login_success: 200,
  invalid_credentials: 401,
  account_locked: 423,
  account_suspended: 403,
  network_error: "network_error",
} as const
