import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center theme-premium" style={{ background: "var(--bg)", fontFamily: "var(--font-body)" }}>
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--accent)" }}>
            <svg className="w-7 h-7" style={{ color: "var(--accent-text)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-heading)" }}>Privatrente vs. Trading</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Vergleichsrechner</p>
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Bitte anmelden um fortzufahren</p>
        <form action={async () => { "use server"; await signIn("authentik", { redirectTo: "/" }); }}>
          <button type="submit" className="px-6 py-3 rounded-xl font-medium transition-colors shadow-lg" style={{ background: "var(--accent)", color: "var(--accent-text)" }}>
            Mit Authentik anmelden
          </button>
        </form>
      </div>
    </div>
  );
}
