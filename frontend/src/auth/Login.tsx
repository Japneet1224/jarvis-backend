import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

function ArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12H19M13 6L19 12L13 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 7L12 13L20 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 10V7.5C8 5.57 9.57 4 11.5 4H12.5C14.43 4 16 5.57 16 7.5V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 12C4.4 8.7 7.55 6.5 12 6.5C16.45 6.5 19.6 8.7 21.5 12C19.6 15.3 16.45 17.5 12 17.5C7.55 17.5 4.4 15.3 2.5 12Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle
          cx="12"
          cy="12"
          r="2.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3L21 21"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10.6 6.7C11.05 6.57 11.52 6.5 12 6.5C16.45 6.5 19.6 8.7 21.5 12C20.8 13.22 19.91 14.28 18.87 15.15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.1 6.1C4.58 7.15 3.38 8.55 2.5 10.1C4.4 13.4 7.55 15.6 12 15.6C13.05 15.6 14.03 15.47 14.94 15.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10.8"
        cy="10.8"
        r="6.3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M16 16L21 21"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 3.5H14.5L19 8V20.5H7V3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.5V8.5H19"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 12H16M10 15.5H16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 5.5C8 4.67 8.67 4 9.5 4H14.5C15.33 4 16 4.67 16 5.5V18.5C16 19.33 15.33 20 14.5 20H9.5C8.67 20 8 19.33 8 18.5V5.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 8V16M19 8V16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="9" r="1.2" fill="currentColor" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M21.35 12.23c0-.73-.07-1.44-.21-2.12H12v4.01h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.7 2.91-4.2 2.91-7.27Z"
      />
      <path
        fill="#34A853"
        d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.44c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.52A9.74 9.74 0 0 0 12 21.5Z"
      />
      <path
        fill="#FBBC05"
        d="M6.54 13.59A5.85 5.85 0 0 1 6.23 12c0-.55.1-1.09.31-1.59V7.89H3.3A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.11l3.24-2.52Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.38c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.48 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.52C7.31 8.1 9.46 6.38 12 6.38Z"
      />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    if (!API_URL) {
      setError("Backend API URL is not configured.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });

      let data: {
        detail?: string;
        message?: string;
        access_token?: string;
        token?: string;
        user?: unknown;
      } = {};

      try {
        data = await response.json();
      } catch {
        // Backend returned no JSON response.
      }

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            "Invalid email or password.",
        );
      }

      const token = data.access_token || data.token;

      const storage = rememberMe
        ? window.localStorage
        : window.sessionStorage;

      if (token) {
        storage.setItem("access_token", token);
      }

      if (data.user) {
        storage.setItem(
          "jarvis_user",
          JSON.stringify(data.user),
        );
      }

      navigate("/chat");
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the server. Please try again.",
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to sign in.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    if (!API_URL) {
      setError("Backend API URL is not configured.");
      return;
    }

    window.location.href = `${API_URL}/auth/google`;
  }

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
        }

        :root {
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;

          color: #f5f7fa;
          background: #08090b;

          font-synthesis: none;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        html,
        body,
        #root {
          width: 100%;
          min-height: 100%;
          margin: 0;
        }

        body {
          min-width: 320px;
          min-height: 100vh;
          background: #08090b;
        }

        button,
        input {
          font-family: inherit;
        }

        button,
        a {
          -webkit-tap-highlight-color: transparent;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        /* ============================================================
           MAIN LOGIN PAGE
           ============================================================ */

        .jarvis-login {
          min-height: 100vh;
          display: flex;

          background:
            radial-gradient(
              circle at 82% 20%,
              rgba(255, 255, 255, 0.035),
              transparent 32%
            ),
            #08090b;
        }

        /* ============================================================
           LEFT — LOGIN EXPERIENCE
           ============================================================ */

        .login-section {
          position: relative;

          width: 480px;
          min-height: 100vh;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: 24px;

          background: rgba(255, 255, 255, 0.018);

          border-right: 1px solid rgba(255, 255, 255, 0.08);
        }

        /* ============================================================
           GLASS LOGIN PANEL
           ============================================================ */

        .login-glass {
          width: 100%;
          max-width: 410px;

          padding: 42px;

          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 28px;

          background:
            linear-gradient(
              135deg,
              rgba(255, 255, 255, 0.095),
              rgba(255, 255, 255, 0.025)
            );

          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);

          box-shadow:
            0 30px 100px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);

          position: relative;
          overflow: hidden;
        }

        .login-glass::after {
          content: "";

          position: absolute;

          left: 18%;
          right: 18%;
          bottom: 0;

          height: 2px;

          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(120, 100, 255, 0.85),
              transparent
            );

          box-shadow:
            0 0 20px rgba(110, 90, 255, 0.65),
            0 0 55px rgba(110, 90, 255, 0.3);

          pointer-events: none;
        }

        /* ============================================================
           LOGIN BRAND
           ============================================================ */

        .login-logo {
          display: flex;
          justify-content: center;
        }

        .login-orb {
          width: 76px;
          height: 76px;

          display: flex;
          align-items: center;
          justify-content: center;

          position: relative;

          border: 1px solid rgba(255, 255, 255, 0.45);
          border-radius: 50%;

          background:
            radial-gradient(
              circle at 50% 42%,
              rgba(255, 255, 255, 0.12),
              rgba(255, 255, 255, 0.025) 58%,
              transparent 70%
            );

          box-shadow:
            0 0 0 5px rgba(100, 120, 255, 0.08),
            0 0 18px rgba(115, 135, 255, 0.5),
            0 0 45px rgba(100, 90, 255, 0.25),
            inset 0 0 22px rgba(100, 120, 255, 0.12);
        }

        .login-orb::before {
          content: "";

          position: absolute;
          inset: 4px;

          border: 1px solid rgba(150, 170, 255, 0.32);
          border-radius: 50%;
        }

        .login-orb::after {
          content: "";

          position: absolute;
          inset: -7px;

          border-radius: 50%;

          border: 1px solid rgba(130, 145, 255, 0.14);

          filter: blur(1px);
        }

        .login-orb span {
          position: relative;
          z-index: 2;

          display: flex;
          align-items: center;
          justify-content: center;

          width: 100%;
          height: 100%;

          padding-bottom: 2px;

          font-size: 42px;
          line-height: 1;
          font-weight: 600;
          letter-spacing: -0.06em;

          color: #ffffff;

          text-shadow:
            0 0 8px rgba(255, 255, 255, 0.85),
            0 0 22px rgba(125, 140, 255, 0.8);
        }

        /* ============================================================
           LOGIN HEADER
           ============================================================ */

        .login-header {
          margin-top: 25px;
          text-align: center;
        }

        .login-label {
          display: block;

          margin-bottom: 13px;

          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.2em;

          color: rgba(255, 255, 255, 0.42);
        }

        .login-header h2 {
          margin: 0;

          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -0.035em;
          font-weight: 650;
        }

        .login-header p {
          margin: 12px 0 0;

          font-size: 12px;
          line-height: 1.6;

          color: rgba(255, 255, 255, 0.42);
        }

        /* ============================================================
           FORM
           ============================================================ */

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 17px;

          margin-top: 32px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .input-group label {
          font-size: 10px;
          font-weight: 600;

          color: rgba(255, 255, 255, 0.55);
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;

          left: 14px;
          top: 50%;

          display: flex;

          transform: translateY(-50%);

          color: rgba(255, 255, 255, 0.48);

          pointer-events: none;

          z-index: 1;
        }

        .input-group input {
          width: 100%;
          height: 47px;

          padding: 0 14px 0 42px;

          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;

          outline: none;

          background: rgba(0, 0, 0, 0.2);

          color: #ffffff;

          font: inherit;
          font-size: 12px;

          transition:
            border-color 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
        }

        .input-group input.password-input {
          padding-right: 46px;
        }

        .input-group input::placeholder {
          color: rgba(255, 255, 255, 0.23);
        }

        .input-group input:focus {
          border-color: rgba(255, 255, 255, 0.32);

          background: rgba(0, 0, 0, 0.28);

          box-shadow:
            0 0 0 3px rgba(120, 110, 255, 0.055);
        }

        .input-group input:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .password-toggle {
          position: absolute;

          right: 10px;
          top: 50%;

          width: 30px;
          height: 30px;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: 0;

          border: none;
          border-radius: 7px;

          background: transparent;

          color: rgba(255, 255, 255, 0.5);

          cursor: pointer;

          transform: translateY(-50%);

          transition:
            color 0.2s ease,
            background 0.2s ease;
        }

        .password-toggle:hover:not(:disabled) {
          color: rgba(255, 255, 255, 0.9);
          background: rgba(255, 255, 255, 0.05);
        }

        .password-toggle:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        /* ============================================================
           LOGIN OPTIONS
           ============================================================ */

        .login-options {
          display: flex;
          align-items: center;
          justify-content: space-between;

          margin-top: 1px;
        }

        .remember-option {
          display: flex;
          align-items: center;
          gap: 9px;

          font-size: 11px;

          color: rgba(255, 255, 255, 0.46);

          cursor: pointer;
          user-select: none;
        }

        .remember-option input {
          position: absolute;

          width: 1px;
          height: 1px;

          opacity: 0;
          pointer-events: none;
        }

        .remember-box {
          width: 19px;
          height: 19px;

          display: flex;
          align-items: center;
          justify-content: center;

          flex-shrink: 0;

          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 5px;

          background: rgba(0, 0, 0, 0.2);

          transition:
            border-color 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
        }

        .remember-box::after {
          content: "";

          width: 7px;
          height: 4px;

          border-left: 1.5px solid transparent;
          border-bottom: 1.5px solid transparent;

          transform:
            rotate(-45deg)
            translateY(-1px);

          opacity: 0;

          transition: opacity 0.15s ease;
        }

        .remember-option input:checked + .remember-box {
          border-color: rgba(160, 145, 255, 0.75);

          background:
            linear-gradient(
              135deg,
              rgba(120, 110, 255, 0.8),
              rgba(160, 120, 255, 0.9)
            );

          box-shadow:
            0 0 12px rgba(110, 100, 255, 0.25);
        }

        .remember-option input:checked + .remember-box::after {
          border-color: #ffffff;
          opacity: 1;
        }

        .remember-option input:focus-visible + .remember-box {
          outline: 2px solid rgba(160, 145, 255, 0.7);
          outline-offset: 2px;
        }

        .forgot-link {
          font-size: 11px;

          color: rgba(160, 145, 255, 0.9);

          transition: color 0.2s ease;
        }

        .forgot-link:hover {
          color: #ffffff;
        }

        /* ============================================================
           MESSAGES
           ============================================================ */

        .form-message {
          padding: 11px 13px;

          border-radius: 10px;

          font-size: 11px;
          line-height: 1.5;
        }

        .form-message.error {
          border: 1px solid rgba(255, 120, 120, 0.18);

          background: rgba(255, 100, 100, 0.07);

          color: rgba(255, 190, 190, 0.9);
        }

        /* ============================================================
           SIGN IN BUTTON
           ============================================================ */

        .login-button {
          width: 100%;
          height: 48px;

          margin-top: 5px;

          display: flex;
          align-items: center;
          justify-content: center;

          position: relative;

          border: none;
          border-radius: 12px;

          background:
            linear-gradient(
              110deg,
              #ffffff 0%,
              #e6e9ff 45%,
              #9a87ff 100%
            );

          color: #090a0c;

          font: inherit;
          font-size: 12px;
          font-weight: 700;

          cursor: pointer;

          box-shadow:
            0 10px 30px rgba(90, 75, 210, 0.18);

          transition:
            transform 0.2s ease,
            opacity 0.2s ease,
            box-shadow 0.2s ease;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-1px);

          box-shadow:
            0 14px 35px rgba(90, 75, 210, 0.25);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:focus-visible {
          outline: 2px solid rgba(190, 180, 255, 0.9);
          outline-offset: 3px;
        }

        .login-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .button-arrow {
          display: flex;

          position: absolute;
          right: 13px;
        }

        /* ============================================================
           DIVIDER
           ============================================================ */

        .login-divider {
          display: flex;
          align-items: center;
          gap: 14px;

          margin: 25px 0 18px;

          font-size: 10px;

          color: rgba(255, 255, 255, 0.34);
        }

        .login-divider::before,
        .login-divider::after {
          content: "";

          flex: 1;

          height: 1px;

          background: rgba(255, 255, 255, 0.1);
        }

        /* ============================================================
           GOOGLE
           ============================================================ */

        .google-button {
          width: 100%;
          height: 48px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;

          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 12px;

          background: rgba(0, 0, 0, 0.12);

          color: rgba(255, 255, 255, 0.84);

          font: inherit;
          font-size: 12px;
          font-weight: 600;

          cursor: pointer;

          transition:
            border-color 0.2s ease,
            background 0.2s ease,
            transform 0.2s ease;
        }

        .google-button:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.25);

          background: rgba(255, 255, 255, 0.035);

          transform: translateY(-1px);
        }

        .google-button:focus-visible {
          outline: 2px solid rgba(160, 145, 255, 0.8);
          outline-offset: 3px;
        }

        .google-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .google-icon {
          display: flex;
          align-items: center;
        }

        /* ============================================================
           REGISTER PROMPT
           ============================================================ */

        .register-prompt {
          display: flex;
          justify-content: center;
          gap: 6px;

          margin-top: 25px;

          font-size: 11px;

          color: rgba(255, 255, 255, 0.35);
        }

        .register-link {
          color: rgba(160, 145, 255, 0.95);

          font-weight: 600;

          transition: color 0.2s ease;
        }

        .register-link:hover {
          color: #ffffff;
        }

        .security-note {
          margin: 28px 0 0;

          font-size: 9px;
          line-height: 1.6;
          text-align: center;

          color: rgba(255, 255, 255, 0.22);
        }

        /* ============================================================
           RIGHT — JARVIS INTRODUCTION
           ============================================================ */

        .jarvis-introduction {
          position: relative;

          flex: 1;
          min-width: 0;
          min-height: 100vh;

          padding: 56px 7vw 48px;

          display: flex;
          flex-direction: column;
          justify-content: space-between;

          overflow: hidden;
        }

        .jarvis-introduction::before {
          content: "";

          position: absolute;

          width: 500px;
          height: 500px;

          right: -180px;
          top: -190px;

          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(105, 95, 255, 0.08),
              transparent 68%
            );

          pointer-events: none;
        }

        .jarvis-brand {
          display: flex;
          align-items: center;
          gap: 14px;

          position: relative;
          z-index: 1;
        }

        .jarvis-orb {
          width: 34px;
          height: 34px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid rgba(255, 255, 255, 0.32);
          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(125, 115, 255, 0.16),
              transparent 70%
            );

          box-shadow:
            0 0 15px rgba(115, 105, 255, 0.18);
        }

        .jarvis-orb span {
          width: 8px;
          height: 8px;

          border-radius: 50%;

          background: #ffffff;

          box-shadow:
            0 0 12px rgba(255, 255, 255, 0.8),
            0 0 30px rgba(130, 120, 255, 0.4);
        }

        .jarvis-name {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.32em;
        }

        /* ============================================================
           HERO
           ============================================================ */

        .jarvis-content {
          position: relative;
          z-index: 1;
        }

        .jarvis-hero {
          max-width: 850px;
          margin-top: 60px;
        }

        .jarvis-eyebrow {
          margin: 0 0 24px;

          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;

          color: rgba(255, 255, 255, 0.48);
        }

        .jarvis-hero h1 {
          margin: 0;

          max-width: 850px;

          font-size: clamp(48px, 5vw, 78px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 600;
        }

        .jarvis-hero h1 span {
          color: rgba(255, 255, 255, 0.38);
        }

        .jarvis-description {
          max-width: 650px;

          margin: 30px 0 0;

          font-size: 16px;
          line-height: 1.7;

          color: rgba(255, 255, 255, 0.58);
        }

        .jarvis-status {
          display: flex;
          align-items: center;
          gap: 10px;

          margin-top: 45px;

          font-size: 12px;

          color: rgba(255, 255, 255, 0.5);
        }

        .status-dot {
          width: 7px;
          height: 7px;

          flex-shrink: 0;

          border-radius: 50%;

          background: #ffffff;

          box-shadow:
            0 0 12px rgba(255, 255, 255, 0.65);
        }

        /* ============================================================
           FEATURES
           ============================================================ */

        .jarvis-features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 28px;

          margin-top: 65px;
        }

        .jarvis-features article {
          display: flex;
          gap: 15px;

          padding-top: 18px;

          border-top: 1px solid rgba(255, 255, 255, 0.12);
        }

        .feature-number {
          font-size: 10px;
          letter-spacing: 0.12em;

          color: rgba(255, 255, 255, 0.35);
        }

        .feature-icon {
          width: 30px;
          height: 30px;

          display: flex;
          align-items: center;
          justify-content: center;

          flex-shrink: 0;

          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 9px;

          background: rgba(255, 255, 255, 0.035);

          color: rgba(175, 165, 255, 0.9);
        }

        .feature-content {
          margin-top: 12px;
        }

        .jarvis-features h3 {
          margin: 0 0 9px;

          font-size: 13px;
          font-weight: 600;
        }

        .jarvis-features p {
          margin: 0;

          font-size: 12px;
          line-height: 1.6;

          color: rgba(255, 255, 255, 0.42);
        }

        /* ============================================================
           COMING NEXT
           ============================================================ */

        .coming-soon {
          margin-top: 50px;
        }

        .coming-soon > span {
          display: block;

          margin-bottom: 15px;

          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.2em;

          color: rgba(255, 255, 255, 0.3);
        }

        .coming-items {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }

        .coming-items span {
          padding: 8px 12px;

          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 100px;

          font-size: 10px;

          color: rgba(255, 255, 255, 0.38);

          background: rgba(255, 255, 255, 0.012);
        }

        /* ============================================================
           RESPONSIVE
           ============================================================ */

        @media (max-width: 1100px) {
          .login-section {
            width: 430px;
          }

          .jarvis-introduction {
            padding-left: 45px;
            padding-right: 45px;
          }

          .jarvis-hero h1 {
            font-size: clamp(44px, 5vw, 68px);
          }

          .jarvis-features {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }

        @media (max-width: 900px) {
          .jarvis-login {
            flex-direction: column;
          }

          .login-section {
            width: 100%;
            min-height: auto;

            padding: 40px 20px;

            border-right: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          }

          .login-glass {
            max-width: 430px;
          }

          .jarvis-introduction {
            min-height: auto;

            padding: 70px 35px 60px;
          }

          .jarvis-hero {
            margin-top: 65px;
          }
        }

        @media (max-width: 600px) {
          .login-section {
            padding: 25px 16px 35px;
          }

          .login-glass {
            padding: 32px 25px;

            border-radius: 24px;
          }

          .login-header h2 {
            font-size: 30px;
          }

          .jarvis-introduction {
            padding: 55px 25px 50px;
          }

          .jarvis-hero {
            margin-top: 55px;
          }

          .jarvis-hero h1 {
            font-size: 48px;
          }

          .jarvis-description {
            font-size: 14px;
          }

          .jarvis-features {
            margin-top: 50px;
          }
        }

        @media (max-width: 450px) {
          .login-glass {
            padding: 28px 21px;

            border-radius: 22px;
          }

          .login-orb {
            width: 70px;
            height: 70px;
          }

          .login-orb span {
            font-size: 38px;
          }

          .login-header h2 {
            font-size: 28px;
          }

          .jarvis-introduction {
            padding-left: 21px;
            padding-right: 21px;
          }

          .jarvis-hero h1 {
            font-size: 43px;
          }

          .login-options {
            align-items: flex-start;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>

      <main className="jarvis-login">
        {/* ============================================================
            LEFT — LOGIN
            ============================================================ */}

        <section className="login-section">
          <div className="login-glass">
            <div className="login-logo">
              <div className="login-orb">
                <span>J</span>
              </div>
            </div>

            <div className="login-header">
              <h2>Welcome back</h2>

              <p>
                Sign in to continue your journey with Jarvis.
              </p>
            </div>

            <form
              className="login-form"
              onSubmit={handleLogin}
              noValidate
            >
              {/* EMAIL */}

              <div className="input-group">
                <label htmlFor="email">
                  Email
                </label>

                <div className="input-wrapper">
                  <span className="input-icon">
                    <MailIcon />
                  </span>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={loading}
                    aria-invalid={Boolean(error)}
                  />
                </div>
              </div>

              {/* PASSWORD */}

              <div className="input-group">
                <label htmlFor="password">
                  Password
                </label>

                <div className="input-wrapper">
                  <span className="input-icon">
                    <LockIcon />
                  </span>

                  <input
                    id="password"
                    name="password"
                    className="password-input"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    aria-invalid={Boolean(error)}
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword(
                        (current) => !current,
                      )
                    }
                    disabled={loading}
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    aria-pressed={showPassword}
                  >
                    <EyeIcon
                      visible={showPassword}
                    />
                  </button>
                </div>
              </div>

              {/* OPTIONS */}

              <div className="login-options">
                <label className="remember-option">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      setRememberMe(
                        event.target.checked,
                      )
                    }
                    disabled={loading}
                  />

                  <span className="remember-box" />

                  <span>Remember me</span>
                </label>

                <Link
                  to="/forgot-password"
                  className="forgot-link"
                >
                  Forgot password?
                </Link>
              </div>

              {/* ERROR */}

              {error && (
                <div
                  className="form-message error"
                  role="alert"
                  aria-live="polite"
                >
                  {error}
                </div>
              )}

              {/* LOGIN BUTTON */}

              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >
                <span>
                  {loading
                    ? "Signing in..."
                    : "Sign in"}
                </span>

                {!loading && (
                  <span className="button-arrow">
                    <ArrowIcon />
                  </span>
                )}
              </button>
            </form>

            {/* DIVIDER */}

            <div className="login-divider">
              <span>OR</span>
            </div>

            {/* GOOGLE */}

            <button
              type="button"
              className="google-button"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <span className="google-icon">
                <GoogleIcon />
              </span>

              <span>
                Continue with Google
              </span>
            </button>

            {/* REGISTER */}

            <div className="register-prompt">
              <span>
                Don't have an account?
              </span>

              <Link
                to="/register"
                className="register-link"
              >
                Create one
              </Link>
            </div>

            <p className="security-note">
              Your credentials are securely transmitted
              to Jarvis.
            </p>
          </div>
        </section>

        {/* ============================================================
            RIGHT — JARVIS INTRODUCTION
            ============================================================ */}

        <section className="jarvis-introduction">
          <div className="jarvis-brand">
            <div className="jarvis-orb">
              <span />
            </div>

            <span className="jarvis-name">
              JARVIS
            </span>
          </div>

          <div className="jarvis-content">
            <div className="jarvis-hero">
              <p className="jarvis-eyebrow">
                YOUR PERSONAL AI KNOWLEDGE ASSISTANT
              </p>

              <h1>
                Your knowledge.
                <br />
                <span>Your intelligence.</span>
                <br />
                <span>Your Jarvis.</span>
              </h1>

              <p className="jarvis-description">
                Jarvis turns the information you already
                have into an intelligent knowledge space
                you can search, understand and interact
                with.
              </p>
            </div>

            <div className="jarvis-status">
              <span className="status-dot" />

              <span>
                Jarvis is being reformed.
              </span>
            </div>

            <div className="jarvis-features">
              {/* FEATURE 01 */}

              <article>
                <span className="feature-number">
                  01
                </span>

                <div>
                  <div className="feature-icon">
                    <SearchIcon />
                  </div>

                  <div className="feature-content">
                    <h3>
                      Knowledge Grounded
                    </h3>

                    <p>
                      Ask questions and receive
                      answers based on the knowledge
                      you provide.
                    </p>
                  </div>
                </div>
              </article>

              {/* FEATURE 02 */}

              <article>
                <span className="feature-number">
                  02
                </span>

                <div>
                  <div className="feature-icon">
                    <DocumentIcon />
                  </div>

                  <div className="feature-content">
                    <h3>
                      Document Intelligence
                    </h3>

                    <p>
                      Upload your files and turn
                      their contents into searchable
                      knowledge.
                    </p>
                  </div>
                </div>
              </article>

              {/* FEATURE 03 */}

              <article>
                <span className="feature-number">
                  03
                </span>

                <div>
                  <div className="feature-icon">
                    <MemoryIcon />
                  </div>

                  <div className="feature-content">
                    <h3>
                      Personal Memory
                    </h3>

                    <p>
                      Jarvis is designed to remember
                      useful information from your
                      interactions.
                    </p>
                  </div>
                </div>
              </article>
            </div>

            {/* COMING NEXT */}

            <div className="coming-soon">
              <span>
                COMING NEXT
              </span>

              <div className="coming-items">
                <span>
                  Knowledge Graph
                </span>

                <span>
                  Semantic Search
                </span>

                <span>
                  Long-Term Memory
                </span>

                <span>
                  Multi-Modal AI
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}