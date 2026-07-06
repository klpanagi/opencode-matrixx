import type { WelcomeMessageProps } from "./types";

/* ------------------------------------------------------------------ */
/*  Inline styles                                                      */
/* ------------------------------------------------------------------ */
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: 32,
    textAlign: "center",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: 600,
    color: "#111827",
    margin: "0 0 8px",
  },
  message: {
    fontSize: 16,
    color: "#6b7280",
    margin: "0 0 24px",
    lineHeight: 1.5,
  },
  dismissButton: {
    padding: "8px 20px",
    backgroundColor: "#e5e7eb",
    color: "#374151",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
};

/**
 * WelcomeMessage — Post-login welcome display component.
 *
 * Displayed after successful authentication per the feedback step:
 *   "a welcome message should be displayed"
 *
 * Intended to be rendered on the /dashboard page after login redirect.
 */
export function WelcomeMessage({ email, onDismiss }: WelcomeMessageProps) {
  return (
    <div style={styles.container}>
      <div style={styles.icon} aria-hidden="true">
        &#10003;
      </div>
      <h1 style={styles.heading}>Welcome back!</h1>
      <p style={styles.message}>
        You are now signed in as <strong>{email}</strong>.
      </p>
      {onDismiss && (
        <button
          type="button"
          style={styles.dismissButton}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
