import { useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { api, ApiError } from "../api";
import { navigate } from "../router";
import { readToken, store, useAppState } from "../store";
import {
  hasErrors,
  mapAuthError,
  passwordStrength,
  STRENGTH_LABEL,
  validateForm,
} from "./authLogic";
import type { AuthMode, FormErrors, ServerField } from "./authLogic";
import "./auth.css";

type Touched = Record<"username" | "password" | "confirm", boolean>;
const NOT_TOUCHED: Touched = { username: false, password: false, confirm: false };

const svgProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const ARGUMENTS = [
  {
    title: "Un classement Elo",
    text: "Grimpez de Novice à Maître en gagnant des parties classées.",
    icon: (
      <svg {...svgProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    title: "Vos amis, en direct",
    text: "Voyez qui est en ligne et lancez un défi en un clic.",
    icon: (
      <svg {...svgProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2 .7 3.5 2.6 3.5 5.6" />
      </svg>
    ),
  },
  {
    title: "Votre deck vous suit",
    text: "Vos compétences sont conservées sur tous vos appareils.",
    icon: (
      <svg {...svgProps}>
        <rect x="3" y="6" width="12" height="15" rx="2" />
        <path d="M8 3h11a2 2 0 0 1 2 2v12" />
      </svg>
    ),
  },
];

export function Auth() {
  const uid = useId();
  const { account } = useAppState();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState<Touched>(NOT_TOUCHED);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<{ field: ServerField; message: string } | null>(null);
  const tabRefs = useRef<Record<AuthMode, HTMLButtonElement | null>>({ login: null, register: null });

  const errors: FormErrors = validateForm(mode, { username, password, confirm });
  const strength = passwordStrength(password);
  const register = mode === "register";

  // Une erreur est visible une fois le champ quitté, ou après une tentative d'envoi.
  // La confirmation réagit en direct dès qu'elle contient quelque chose.
  const visible = (f: keyof Touched): string | null => {
    const shown = touched[f] || submitted || (f === "confirm" && confirm.length > 0);
    return shown ? errors[f] : null;
  };
  const usernameErr = visible("username") ?? (serverError?.field === "username" ? serverError.message : null);
  const passwordErr = visible("password") ?? (serverError?.field === "password" ? serverError.message : null);
  const confirmErr = register ? visible("confirm") : null;

  const touch = (f: keyof Touched) => setTouched((t) => (t[f] ? t : { ...t, [f]: true }));
  const clearServer = () => setServerError(null);

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setTouched(NOT_TOUCHED);
    setSubmitted(false);
    setServerError(null);
    setConfirm("");
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: AuthMode = mode === "login" ? "register" : "login";
    switchMode(next);
    tabRefs.current[next]?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setSubmitted(true);
    setServerError(null);
    if (hasErrors(errors)) return;
    setLoading(true);
    try {
      let res;
      if (register) {
        // Un jeton d'invité permet de promouvoir l'invité en gardant son deck.
        const stored = readToken();
        const guestToken = stored && (!account || account.guest) ? stored : undefined;
        res = await api.register({ username, password, ...(guestToken ? { guest_token: guestToken } : {}) });
      } else {
        res = await api.login({ username, password });
      }
      store.applyAuth(res.token);
      navigate({ name: "home" });
    } catch (err) {
      setServerError(mapAuthError(err instanceof ApiError ? err.code : "unknown"));
      setLoading(false);
    }
  }

  const id = (name: string) => `${uid}-${name}`;
  const formError = serverError?.field === "form" ? serverError.message : null;

  return (
    <main className="au-page">
      <div className="au-wrap">
        <section className="au-pitch" aria-labelledby={id("title")}>
          <p className="eyebrow">Chessy</p>
          <h1 id={id("title")} className="au-title">
            Rejoignez l'arène.
          </h1>
          <p className="au-lead">
            Les échecs, avec des compétences. Créez un compte pour jouer en classé et retrouver vos amis.
          </p>
          <ul className="au-args">
            {ARGUMENTS.map((a) => (
              <li key={a.title}>
                <span className="au-ico">{a.icon}</span>
                <span>
                  <strong>{a.title}</strong>
                  <span className="au-arg-text">{a.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card au-card" aria-label="Authentification">
          <div className="seg" role="tablist" aria-label="Mode">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                ref={(el) => {
                  tabRefs.current[m] = el;
                }}
                type="button"
                role="tab"
                id={id(`tab-${m}`)}
                aria-selected={mode === m}
                aria-controls={id("panel")}
                tabIndex={mode === m ? 0 : -1}
                onClick={() => switchMode(m)}
                onKeyDown={onTabKey}
              >
                {m === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          <form
            id={id("panel")}
            role="tabpanel"
            aria-labelledby={id(`tab-${mode}`)}
            className="au-form"
            onSubmit={onSubmit}
            noValidate
          >
            <div className="au-field">
              <label className="field-label" htmlFor={id("username")}>
                Pseudo
              </label>
              <input
                id={id("username")}
                className={`input${usernameErr ? " err" : ""}`}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  clearServer();
                }}
                onBlur={() => touch("username")}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
                aria-invalid={!!usernameErr}
                aria-describedby={id("username-msg")}
                disabled={loading}
              />
              <div id={id("username-msg")} aria-live="polite">
                {usernameErr ? (
                  <p className="field-msg">{usernameErr}</p>
                ) : register ? (
                  <p className="au-hint">3 à 16 caractères : lettres, chiffres ou _.</p>
                ) : null}
              </div>
            </div>

            <div className="au-field">
              <label className="field-label" htmlFor={id("password")}>
                Mot de passe
              </label>
              <div className="au-pw">
                <input
                  id={id("password")}
                  className={`input${passwordErr ? " err" : ""}`}
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearServer();
                  }}
                  onBlur={() => touch("password")}
                  autoComplete={register ? "new-password" : "current-password"}
                  maxLength={160}
                  aria-invalid={!!passwordErr}
                  aria-describedby={id("password-msg")}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="au-eye"
                  onClick={() => setShowPw((s) => !s)}
                  aria-pressed={showPw}
                  aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPw ? "Masquer" : "Afficher"}
                </button>
              </div>
              <div id={id("password-msg")} aria-live="polite">
                {passwordErr && <p className="field-msg">{passwordErr}</p>}
              </div>
              {register && (
                <div className="au-meter" data-level={strength}>
                  <div className="au-meter-bars" role="img" aria-label={`Robustesse : ${STRENGTH_LABEL[strength] || "vide"}`}>
                    {[1, 2, 3, 4].map((n) => (
                      <span key={n} className={n <= strength ? "on" : ""} />
                    ))}
                  </div>
                  <span className="au-meter-label mono">{STRENGTH_LABEL[strength] || "8 caractères minimum"}</span>
                </div>
              )}
            </div>

            {register && (
              <div className="au-field">
                <label className="field-label" htmlFor={id("confirm")}>
                  Confirmation
                </label>
                <input
                  id={id("confirm")}
                  className={`input${confirmErr ? " err" : ""}`}
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={() => touch("confirm")}
                  autoComplete="new-password"
                  maxLength={160}
                  aria-invalid={!!confirmErr}
                  aria-describedby={id("confirm-msg")}
                  disabled={loading}
                />
                <div id={id("confirm-msg")} aria-live="polite">
                  {confirmErr && <p className="field-msg">{confirmErr}</p>}
                </div>
              </div>
            )}

            <div aria-live="assertive">
              {formError && (
                <p className="au-form-err" role="alert">
                  {formError}
                </p>
              )}
            </div>

            <button type="submit" className="btn pri au-submit" disabled={loading} aria-busy={loading}>
              {loading ? (register ? "Création du compte…" : "Connexion…") : register ? "Créer mon compte" : "Se connecter"}
            </button>
          </form>

          <div className="au-sep" role="separator">
            <span>ou</span>
          </div>
          <button type="button" className="btn ghost au-guest" onClick={() => navigate({ name: "home" })} disabled={loading}>
            Continuer en invité
          </button>
          <p className="au-note">Sans compte : parties amicales uniquement, ni classement ni amis.</p>
        </section>
      </div>
    </main>
  );
}
