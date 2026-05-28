import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div
        className="w-full max-w-md rounded-2xl p-8 flex flex-col gap-6"
        style={{
          background: "var(--cockpit-card-strong)",
          border: "1px solid var(--cockpit-border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="rounded-md grid place-items-center"
            style={{ width: 40, height: 40, background: "var(--grad-brand)", boxShadow: "var(--glow-tiffany)" }}
          >
            <span style={{ fontWeight: 900, fontSize: 18, color: "var(--fg-on-brand)" }}>I</span>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: "var(--ls-headline)" }}>IRIS</div>
            <div style={{ fontSize: 11, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
              TechNow Cockpit
            </div>
          </div>
        </div>

        <p style={{ color: "var(--fg2)", fontSize: 14, lineHeight: 1.5 }}>
          Entre com sua conta Google corporativa.
          O acesso é restrito aos domínios autorizados.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 rounded-md py-3 text-sm font-semibold"
            style={{
              background: "var(--brand)",
              color: "var(--fg-on-brand)",
              border: "1px solid transparent",
              boxShadow: "var(--glow-tiffany)",
            }}
          >
            <GoogleIcon /> Entrar com Google
          </button>
        </form>

        <div className="flex items-center gap-3" style={{ color: "var(--fg2)", fontSize: 11 }}>
          <span style={{ flex: 1, height: 1, background: "var(--cockpit-border)" }} />
          OU
          <span style={{ flex: 1, height: 1, background: "var(--cockpit-border)" }} />
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            const email = String(formData.get("email") || "").trim().toLowerCase();
            if (!email) return;
            await signIn("nodemailer", { email, redirectTo: "/" });
          }}
          className="flex flex-col gap-3"
        >
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            className="w-full rounded-md px-3 py-3 text-sm"
            style={{
              background: "var(--cockpit-card)",
              color: "var(--fg)",
              border: "1px solid var(--cockpit-border)",
            }}
          />
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 rounded-md py-3 text-sm font-semibold"
            style={{
              background: "transparent",
              color: "var(--fg)",
              border: "1px solid var(--cockpit-border)",
            }}
          >
            Receber link de acesso por email
          </button>
        </form>

        <p style={{ color: "var(--fg2)", fontSize: 11, textAlign: "center" }}>
          Sem acesso? Fale com o admin do TechNow Hub.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 1 1-3.4-13.1l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4 5.5l6.1 5.2c-.4.4 6.6-4.8 6.6-14.7 0-1.2-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
