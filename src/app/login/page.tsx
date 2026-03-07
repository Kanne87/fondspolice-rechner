"use client"

import { useState } from "react"

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/csrf")
      const { csrfToken } = await res.json()

      const popup = window.open("about:blank", "auth-popup", "width=500,height=700,scrollbars=yes,resizable=yes")
      if (!popup) {
        window.location.href = "/api/auth/signin/authentik"
        return
      }

      const form = popup.document.createElement("form")
      form.method = "POST"
      form.action = "/api/auth/signin/authentik"

      const csrf = popup.document.createElement("input")
      csrf.type = "hidden"
      csrf.name = "csrfToken"
      csrf.value = csrfToken
      form.appendChild(csrf)

      const cb = popup.document.createElement("input")
      cb.type = "hidden"
      cb.name = "callbackUrl"
      cb.value = window.location.origin + "/auth/success"
      form.appendChild(cb)

      popup.document.body.appendChild(form)
      form.submit()

      const onMessage = (e: MessageEvent) => {
        if (e.origin === window.location.origin && e.data?.type === "auth-success") {
          window.removeEventListener("message", onMessage)
          popup.close()
          window.location.href = "/"
        }
      }
      window.addEventListener("message", onMessage)

      const check = setInterval(() => {
        if (popup.closed) {
          clearInterval(check)
          window.removeEventListener("message", onMessage)
          setLoading(false)
        }
      }, 500)
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8f7f4" }}>
      <div className="w-full max-w-sm px-6">
        <div className="rounded-2xl border p-8 space-y-6 shadow-lg" style={{ borderColor: "#d0cdc4", background: "#ffffff" }}>
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto" style={{ background: "rgba(154,123,46,0.1)", border: "1px solid rgba(154,123,46,0.2)" }}>
              <svg className="w-5 h-5" style={{ color: "#9a7b2e" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "#9a7b2e", letterSpacing: "0.2em", textTransform: "uppercase" as const, fontWeight: 500 }}>Konzeptvorsorge</div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1a1a2e", marginTop: "4px", fontFamily: "'Playfair Display', Georgia, serif" }}>
                Privatrente vs. Trading
              </h1>
            </div>
            <p style={{ fontSize: "12px", color: "#6a6a7a" }}>Bitte anmelden um fortzufahren</p>
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-11 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            style={{ background: "#9a7b2e", color: "#ffffff", border: "none" }}
          >
            {loading ? "Wird geladen..." : "Login"}
          </button>
          <p className="text-center" style={{ fontSize: "11px", color: "#9a9a9a" }}>Sichere Anmeldung über Authentik</p>
        </div>
      </div>
    </div>
  )
}
