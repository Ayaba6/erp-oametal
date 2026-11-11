import { CSSProperties, FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import './login.css'

const P = {
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  eye1: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  eye2: 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  eyeOff:
    'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21',
  phone:
    'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
}

function Svg({ paths, size = 17, width = 1.75, style }: { paths: string[]; size?: number; width?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={width} viewBox="0 0 24 24" style={style} aria-hidden="true">
      {paths.map((d) => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
      ))}
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Ces identifiants ne correspondent à aucun compte.')
    setLoading(false)
  }

  async function onForgot() {
    setError(null)
    setInfo(null)
    if (!email) {
      setError("Saisissez d'abord votre adresse e-mail.")
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (error) setError("L'e-mail de réinitialisation n'a pas pu être envoyé.")
    else setInfo('Un lien de réinitialisation vous a été envoyé par e-mail.')
  }

  const year = new Date().getFullYear()

  return (
    <div className="guest-page">
      <div className="scene">
        <div className="logo-wrap animate-up-logo">
          <div className="logo-glow" />
          <div className="logo-text">A3 ERP</div>
        </div>

        <div className="card animate-up-card">
          {error && <div className="g-alert g-alert-err">{error}</div>}
          {info && <div className="g-alert g-alert-ok">{info}</div>}

          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label htmlFor="email" className="g-label">
                Nom d'utilisateur
              </label>
              <div className={`g-field ${error ? 'has-error' : ''}`}>
                <span className="g-icon">
                  <Svg paths={[P.user]} />
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="Nom d'utilisateur"
                  className="g-input"
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <label htmlFor="password" className="g-label" style={{ marginBottom: 0 }}>
                  Mot de passe
                </label>
                <button type="button" className="g-forgot" onClick={onForgot}>
                  Oublié ?
                </button>
              </div>
              <div className={`g-field ${error ? 'has-error' : ''}`}>
                <span className="g-icon">
                  <Svg paths={[P.lock]} />
                </span>
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Mot de passe"
                  className="g-input"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="g-toggle" tabIndex={-1} aria-label="Afficher/masquer">
                  {show ? <Svg paths={[P.eyeOff]} /> : <Svg paths={[P.eye1, P.eye2]} />}
                </button>
              </div>
            </div>

            <div className="g-check-wrap">
              <input
                id="remember_me"
                type="checkbox"
                className="g-check"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <label htmlFor="remember_me" className="g-check-label">
                Se souvenir de moi
              </label>
            </div>

            <button type="submit" className="g-btn" disabled={loading}>
              {loading ? 'CONNEXION…' : 'SE CONNECTER'}
            </button>
          </form>

          <div className="g-footer">
            <span className="g-footer-brand">A3-ERP</span>
            <span>© {year} A3 ERP &nbsp;·&nbsp; Tous droits réservés</span>
            <br />
            <span>
              <Svg
                paths={[P.phone]}
                size={11}
                width={2}
                style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3, opacity: 0.5 }}
              />
              +226 70 03 76 22
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
