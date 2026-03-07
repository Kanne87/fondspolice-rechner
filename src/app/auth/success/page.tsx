"use client"

import { useEffect } from "react"

export default function AuthSuccess() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "auth-success" }, window.location.origin)
      setTimeout(() => window.close(), 500)
    } else {
      window.location.href = "/"
    }
  }, [])

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f7f4" }}>
      <div style={{ textAlign: "center", color: "#6a6a7a", fontSize: "14px" }}>
        <div style={{ fontSize: "24px", marginBottom: "8px" }}>✓</div>
        Anmeldung erfolgreich...
      </div>
    </div>
  )
}
