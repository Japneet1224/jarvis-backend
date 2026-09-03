import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

type RegisterResponse = {
  access_token?: string;
  token_type?: string;
  user?: unknown;
  detail?: string;
  message?: string;
};

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRegister(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    // ------------------------------------------------------------
    // CLIENT-SIDE VALIDATION
    // ------------------------------------------------------------

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    // bcrypt has a 72-BYTE password limit, not a 72-character limit.
    const passwordBytes = getUtf8ByteLength(password);

    if (passwordBytes > MAX_PASSWORD_BYTES) {
      setError(
        `Password is too long. It must be ${MAX_PASSWORD_BYTES} bytes or fewer.`,
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!API_URL) {
      setError(
        "Backend API URL is not configured. Please check VITE_API_URL.",
      );
      return;
    }

    setLoading(true);

    try {
      // ----------------------------------------------------------
      // REGISTER
      // ----------------------------------------------------------

      const response = await fetch(
        `${API_URL}/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            username: normalizedUsername || null,
            password,
          }),
        },
      );

      let data: RegisterResponse = {};

      try {
        data = await response.json();
      } catch {
        // Backend returned no JSON response.
      }

      // ----------------------------------------------------------
      // HANDLE REGISTRATION ERROR
      // ----------------------------------------------------------

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            `Registration failed (${response.status}).`,
        );
      }

      // ----------------------------------------------------------
      // JWT STORAGE
      // ----------------------------------------------------------
      //
      // The backend returns:
      //
      // {
      //   access_token: "...",
      //   token_type: "bearer",
      //   user: {...}
      // }
      //
      // This matches the existing Login.tsx authentication
      // convention:
      //
      // access_token -> authentication token
      // jarvis_user  -> authenticated user information
      //
      // sessionStorage is used here because registration does not
      // have a "Remember me" option. This also matches the default
      // non-persistent authentication behavior in Login.tsx.
      // ----------------------------------------------------------

      const token = data.access_token;

      if (!token) {
        throw new Error(
          "Account was created, but no authentication token was returned.",
        );
      }

      try {
        window.sessionStorage.setItem(
          "access_token",
          token,
        );

        if (data.user) {
          window.sessionStorage.setItem(
            "jarvis_user",
            JSON.stringify(data.user),
          );
        }
      } catch {
        throw new Error(
          "Account was created, but the authentication session could not be saved.",
        );
      }

      // ----------------------------------------------------------
      // SUCCESS
      // ----------------------------------------------------------

      setSuccess(
        "Account created successfully. Redirecting...",
      );

      setEmail("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");

      // ----------------------------------------------------------
      // REDIRECT TO CHAT
      // ----------------------------------------------------------
      //
      // IMPORTANT:
      // The JWT has already been stored before this executes.
      // Therefore Chat.tsx can immediately retrieve:
      //
      // sessionStorage.getItem("access_token")
      //
      // and use:
      //
      // Authorization: Bearer <token>
      //
      // for authenticated backend requests.
      // ----------------------------------------------------------

      navigate("/chat", { replace: true });
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          "Unable to connect to the server. Please try again.",
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to create your account.",
        );
      }
    } finally {
      setLoading(false);
    }
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
           LANDING PAGE
           ============================================================ */

        .jarvis-landing {
          min-height: 100vh;
          display: flex;

          background:
            radial-gradient(
              circle at 18% 30%,
              rgba(255, 255, 255, 0.055),
              transparent 32%
            ),
            #08090b;
        }

        /* ============================================================
           LEFT SIDE — JARVIS LANDING EXPERIENCE
           ============================================================ */

        .jarvis-introduction {
          position: relative;

          width: calc(100% - 480px);
          min-height: 100vh;

          padding: 56px 7vw 48px;

          display: flex;
          flex-direction: column;
          justify-content: space-between;

          overflow: hidden;
        }

        .jarvis-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .jarvis-orb {
          width: 34px;
          height: 34px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid rgba(255, 255, 255, 0.32);
          border-radius: 50%;
        }

        .jarvis-orb span {
          width: 10px;
          height: 10px;

          border-radius: 50%;
          background: #ffffff;

          box-shadow:
            0 0 12px rgba(255, 255, 255, 0.8),
            0 0 30px rgba(255, 255, 255, 0.25);
        }

        .jarvis-name {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.32em;
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

          font-size: clamp(48px, 6vw, 92px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 600;
        }

        .jarvis-hero h1 span {
          color: rgba(255, 255, 255, 0.38);
        }

        .jarvis-description {
          max-width: 620px;

          margin: 30px 0 0;

          font-size: 16px;
          line-height: 1.7;

          color: rgba(255, 255, 255, 0.58);
        }

        /* ============================================================
           STATUS
           ============================================================ */

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
           COMING SOON
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
        }

        /* ============================================================
           RIGHT REGISTER AREA
           ============================================================ */

        .register-section {
          width: 480px;
          min-height: 100vh;

          display: flex;
          align-items: center;
          justify-content: flex-end;

          padding: 24px;

          background: rgba(255, 255, 255, 0.018);
        }

        /* ============================================================
           GLASS PANEL
           ============================================================ */

        .register-glass {
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
        }

        /* ============================================================
           REGISTER HEADER
           ============================================================ */

        .register-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.2em;

          color: rgba(255, 255, 255, 0.42);
        }

        .register-header h2 {
          margin: 14px 0 12px;

          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -0.035em;
        }

        .register-header h2 span {
          color: rgba(255, 255, 255, 0.45);
        }

        .register-header p {
          margin: 0;

          font-size: 12px;

          color: rgba(255, 255, 255, 0.42);
        }

        /* ============================================================
           FORM
           ============================================================ */

        .register-form {
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

        .input-group input {
          width: 100%;
          height: 47px;

          padding: 0 14px;

          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;

          outline: none;

          background: rgba(0, 0, 0, 0.2);

          color: #ffffff;

          font: inherit;
          font-size: 12px;

          transition:
            border-color 0.2s ease,
            background 0.2s ease;
        }

        .input-group input::placeholder {
          color: rgba(255, 255, 255, 0.23);
        }

        .input-group input:focus {
          border-color: rgba(255, 255, 255, 0.32);
          background: rgba(0, 0, 0, 0.28);
        }

        .input-group input:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        /* ============================================================
           PASSWORD BYTE COUNTER
           ============================================================ */

        .password-hint {
          display: flex;
          justify-content: space-between;
          align-items: center;

          margin-top: 1px;

          font-size: 9px;

          color: rgba(255, 255, 255, 0.28);
        }

        .password-hint.warning {
          color: rgba(255, 190, 190, 0.8);
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

        .form-message.success {
          border: 1px solid rgba(150, 255, 190, 0.18);
          background: rgba(100, 255, 160, 0.06);

          color: rgba(190, 255, 210, 0.9);
        }

        /* ============================================================
           BUTTON
           ============================================================ */

        .register-button {
          width: 100%;
          height: 48px;

          margin-top: 5px;

          border: none;
          border-radius: 12px;

          background: #ffffff;

          color: #090a0c;

          font: inherit;
          font-size: 12px;
          font-weight: 700;

          cursor: pointer;

          transition:
            transform 0.2s ease,
            opacity 0.2s ease;
        }

        .register-button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .register-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .register-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        /* ============================================================
           LOGIN
           ============================================================ */

        .login-prompt {
          display: flex;
          justify-content: center;
          gap: 6px;

          margin-top: 25px;

          font-size: 11px;

          color: rgba(255, 255, 255, 0.35);
        }

        .login-link {
          padding: 0;

          border: none;
          background: transparent;

          color: #ffffff;

          font: inherit;
          font-size: inherit;
          font-weight: 600;

          cursor: pointer;
        }

        .login-link:hover {
          text-decoration: underline;
        }

        .security-note {
          margin: 28px 0 0;

          font-size: 9px;
          line-height: 1.6;
          text-align: center;

          color: rgba(255, 255, 255, 0.22);
        }

        /* ============================================================
           RESPONSIVE
           ============================================================ */

        @media (max-width: 1050px) {
          .jarvis-introduction {
            width: calc(100% - 420px);
            padding-left: 40px;
            padding-right: 40px;
          }

          .register-section {
            width: 420px;
          }

          .register-glass {
            padding: 32px;
          }

          .jarvis-features {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }

        @media (max-width: 800px) {
          .jarvis-landing {
            flex-direction: column;
          }

          .jarvis-introduction {
            width: 100%;
            min-height: auto;
            padding: 35px 25px 50px;
          }

          .jarvis-hero {
            margin-top: 70px;
          }

          .jarvis-hero h1 {
            font-size: 52px;
          }

          .jarvis-features {
            margin-top: 45px;
          }

          .register-section {
            width: 100%;
            min-height: auto;
            padding: 20px 18px 40px;
          }

          .register-glass {
            max-width: none;
          }
        }

        @media (max-width: 450px) {
          .register-glass {
            padding: 27px 22px;
            border-radius: 22px;
          }

          .register-header h2 {
            font-size: 29px;
          }
        }
      `}</style>

      <main className="jarvis-landing">
        {/* ============================================================
            LEFT: JARVIS LANDING EXPERIENCE
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

          <div className="jarvis-hero">
            <p className="jarvis-eyebrow">
              YOUR PERSONAL AI KNOWLEDGE ASSISTANT
            </p>

            <h1>
              Intelligence that
              <br />
              <span>knows your world.</span>
            </h1>

            <p className="jarvis-description">
              Jarvis turns your own documents, knowledge,
              conversations and information into an
              intelligent assistant you can actually talk to.
            </p>
          </div>

          <div className="jarvis-status">
            <span className="status-dot" />

            <span>
              Jarvis is being reformed.
            </span>
          </div>

          <div className="jarvis-features">
            <article>
              <span className="feature-number">
                01
              </span>

              <div>
                <h3>Knowledge Grounded</h3>

                <p>
                  Ask questions and receive answers
                  based on the knowledge you provide.
                </p>
              </div>
            </article>

            <article>
              <span className="feature-number">
                02
              </span>

              <div>
                <h3>Document Intelligence</h3>

                <p>
                  Upload your files and turn their
                  contents into searchable knowledge.
                </p>
              </div>
            </article>

            <article>
              <span className="feature-number">
                03
              </span>

              <div>
                <h3>Personal Memory</h3>

                <p>
                  Jarvis is designed to remember useful
                  information from your interactions.
                </p>
              </div>
            </article>
          </div>

          <div className="coming-soon">
            <span>COMING NEXT</span>

            <div className="coming-items">
              <span>Knowledge Graph</span>
              <span>Semantic Search</span>
              <span>Long-Term Memory</span>
              <span>Multi-Modal AI</span>
            </div>
          </div>
        </section>

        {/* ============================================================
            RIGHT: GLASSMORPHIC REGISTER PANEL
            ============================================================ */}

        <section className="register-section">
          <div className="register-glass">
            <div className="register-header">
              <span className="register-label">
                GET STARTED
              </span>

              <h2>
                Create your
                <br />
                <span>Jarvis account.</span>
              </h2>

              <p>
                Build your private AI knowledge space.
              </p>
            </div>

            <form
              className="register-form"
              onSubmit={handleRegister}
            >
              {/* USERNAME */}

              <div className="input-group">
                <label htmlFor="username">
                  Username
                </label>

                <input
                  id="username"
                  type="text"
                  placeholder="Your name"
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value)
                  }
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              {/* EMAIL */}

              <div className="input-group">
                <label htmlFor="email">
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>

              {/* PASSWORD */}

              <div className="input-group">
                <label htmlFor="password">
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  required
                  disabled={loading}
                  maxLength={72}
                />

                {password && (
                  <div
                    className={
                      getUtf8ByteLength(password) >
                      MAX_PASSWORD_BYTES
                        ? "password-hint warning"
                        : "password-hint"
                    }
                  >
                    <span>
                      Secure password
                    </span>

                    <span>
                      {getUtf8ByteLength(password)} /{" "}
                      {MAX_PASSWORD_BYTES} bytes
                    </span>
                  </div>
                )}
              </div>

              {/* CONFIRM PASSWORD */}

              <div className="input-group">
                <label htmlFor="confirm-password">
                  Confirm password
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  required
                  disabled={loading}
                  maxLength={72}
                />
              </div>

              {/* ERROR */}

              {error && (
                <div
                  className="form-message error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* SUCCESS */}

              {success && (
                <div
                  className="form-message success"
                  role="status"
                >
                  {success}
                </div>
              )}

              {/* SUBMIT */}

              <button
                type="submit"
                className="register-button"
                disabled={loading}
              >
                {loading
                  ? "Creating account..."
                  : "Create account"}
              </button>
            </form>

            {/* LOGIN */}

            <div className="login-prompt">
              <span>
                Already have an account?
              </span>

              <Link
                to="/login"
                className="login-link"
              >
                Sign in
              </Link>
            </div>

            <p className="security-note">
              Your account is protected with secure
              password hashing and authenticated access.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}