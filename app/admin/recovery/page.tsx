/**
 * /admin/recovery — templates da cadência de recuperação de checkout.
 *
 * Edita, por passo da cadência (step1..3 × status), o texto da mensagem,
 * o nome do template aprovado no ChatPro/Meta (obrigatório pra envio
 * proativo em número oficial) e a ordem dos parâmetros {{n}}.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { RecoveryTemplatesManager } from "@/components/RecoveryTemplatesManager";

export const dynamic = "force-dynamic";

export default async function RecoveryAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/recovery");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-6 py-6 flex flex-col gap-4">
        <header
          className="flex items-baseline justify-between flex-wrap gap-3 pb-2"
          style={{ borderBottom: "1px solid var(--cockpit-border-strong)" }}
        >
          <div className="flex items-baseline gap-3" style={{ paddingLeft: 12, position: "relative" }}>
            <span
              aria-hidden
              style={{
                position: "absolute", left: 0, top: 1, bottom: 1, width: 3,
                borderRadius: 2, background: "var(--brand)",
              }}
            />
            <span
              style={{
                fontSize: 10, textTransform: "uppercase",
                letterSpacing: "var(--ls-eyebrow)", color: "var(--brand)", fontWeight: 800,
              }}
            >
              Admin · Recuperação
            </span>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>
              Templates da cadência (WhatsApp)
            </h1>
          </div>
          <Link href="/admin" style={{ fontSize: 11, color: "var(--fg2)", textDecoration: "none" }}>
            ← voltar ao admin
          </Link>
        </header>

        <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.5 }}>
          Número oficial (WhatsApp Business API) só aceita mensagem proativa via <b>template
          aprovado</b> — cadastre o template no painel do ChatPro/Meta e informe aqui o
          <b> nome</b> dele e a <b>ordem dos parâmetros</b> ({"{{1}}, {{2}}"}…). Sem nome de
          template, o cron tenta texto livre (só entrega com janela de 24h aberta).
          Variáveis disponíveis: <code>nome</code>, <code>curso</code>, <code>link</code>,{" "}
          <code>cupom</code>.
        </p>

        <RecoveryTemplatesManager />
      </main>
    </div>
  );
}
