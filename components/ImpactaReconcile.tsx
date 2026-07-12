"use client";

/**
 * ImpactaReconcile — painel na tela da campanha pra conciliar as matrículas
 * da turma (API interna da Impacta) com as vendas da IRIS.
 *
 * Fluxo: "Conciliar" (GET dry-run, não grava) → mostra o de-para → "Importar
 * faltantes" (POST, cria as vendas SISTEMA). Auth via X-Admin-Secret guardado
 * no localStorage (mesmo padrão da SalesTable).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type MatchInfo = { kind: "sale" | "engaged"; id: string; source?: string; by: string };
type Row = {
  externalId: string;
  name: string;
  email: string | null;
  cpf: string | null;
  valorPago: number | null;
  enrolledAt: string | null;
  viaEngaged: boolean;
  status: "ja_na_iris" | "faltando" | "sem_valor";
  match?: MatchInfo | null;
  engagedMissing?: boolean;
};
type Summary = {
  turmaId: string; campaignSlug: string; productSlug: string;
  totalNaApi: number; pagas: number; jaNaIris: number; faltando: number;
  semValor: number; engagedAusente: number;
};
type Result = { mode: string; created: number; summary: Summary; rows: Row[] };

function brl(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function dateBR(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}
function maskCpf(cpf: string | null): string {
  if (!cpf || cpf.length < 11) return cpf || "—";
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
}

function getSecret(): string | null {
  let secret = "";
  try { secret = localStorage.getItem("iris_admin_secret") || ""; } catch {}
  if (!secret) {
    const s = window.prompt("Cole o IRIS_WEBHOOK_SECRET pra conciliar:");
    if (!s) return null;
    secret = s;
    try { localStorage.setItem("iris_admin_secret", secret); } catch {}
  }
  return secret;
}

export function ImpactaReconcile({
  campaignId,
  turmaId,
}: {
  campaignId: string;
  turmaId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function call(method: "GET" | "POST") {
    const secret = getSecret();
    if (!secret) return null;
    const res = await fetch(`/api/admin/campaigns/${campaignId}/reconcile`, {
      method,
      headers: { "X-Admin-Secret": secret },
    });
    if (res.status === 401) {
      try { localStorage.removeItem("iris_admin_secret"); } catch {}
      throw new Error("Secret inválido. Tente de novo.");
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || json.detail || json.error || `HTTP ${res.status}`);
    return json as Result;
  }

  async function handlePreview() {
    setError(null); setLoading(true);
    try {
      const r = await call("GET");
      if (r) setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  async function handleApply() {
    if (!result) return;
    if (!confirm(`Importar ${result.summary.faltando} venda(s) faltante(s) como origem "Sistema"?`)) return;
    setError(null); setApplying(true);
    try {
      const r = await call("POST");
      if (r) { setResult(r); router.refresh(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setApplying(false); }
  }

  const s = result?.summary;

  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <header
        className="px-5 py-3 flex items-center justify-between flex-wrap gap-2"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <div className="flex items-center gap-3">
          <h3 style={{ fontWeight: 700, fontSize: 14 }}>Conciliar matrículas (Impacta)</h3>
          {turmaId ? (
            <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
              turma {turmaId}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "#E0A800" }}>
              configure a “Turma (sistema interno)” acima e salve
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={!turmaId || loading || applying}
            style={btn(!turmaId || loading || applying)}
          >
            {loading ? "Buscando…" : "Conciliar (prévia)"}
          </button>
          {s && s.faltando > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || loading}
              style={btnPrimary(applying || loading)}
            >
              {applying ? "Importando…" : `Importar ${s.faltando} faltante(s)`}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="px-5 py-2" style={{ background: "rgba(231,76,60,0.10)", color: "#e74c3c", fontSize: 12 }}>
          {error}
        </div>
      )}

      {s && (
        <div className="px-5 py-3 flex flex-wrap gap-4" style={{ fontSize: 12, borderBottom: "1px solid var(--cockpit-border)" }}>
          <Stat label="Na API (pagas)" value={s.pagas} />
          <Stat label="Já na IRIS" value={s.jaNaIris} color="#30D158" />
          <Stat label="Faltando" value={s.faltando} color="#B08CFF" />
          <Stat label="Sem valor" value={s.semValor} color="#9ABABA" />
          <Stat label="Engaged ausente" value={s.engagedAusente} color="#E0A800" />
          {result?.mode === "applied" && <Stat label="Importadas" value={result.created} color="#30D158" />}
        </div>
      )}

      {result && result.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--brand-soft)", fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700 }}>
                <th style={th}>Aluno</th>
                <th style={th}>CPF</th>
                <th style={th}>Matrícula</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
                <th style={th}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.externalId} style={{ borderTop: "1px solid var(--cockpit-border)" }}>
                  <td style={td}>
                    <div style={{ color: "var(--fg1)", fontWeight: 600 }}>{r.name}</div>
                    {r.email && <div style={{ color: "var(--fg2)", fontSize: 11 }}>{r.email}</div>}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--fg2)" }}>{maskCpf(r.cpf)}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{dateBR(r.enrolledAt)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{brl(r.valorPago)}</td>
                  <td style={td}><StatusCell r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.rows.length === 0 && (
        <div className="px-5 py-6 text-center" style={{ color: "var(--fg2)", fontSize: 13 }}>
          Nenhuma matrícula paga retornada pra esta turma.
        </div>
      )}
    </section>
  );
}

function StatusCell({ r }: { r: Row }) {
  if (r.status === "ja_na_iris") {
    const label = r.match
      ? `Já na IRIS · ${r.match.kind === "engaged" ? "Engaged" : r.match.source ?? "venda"} (${r.match.by})`
      : "Já na IRIS";
    return <Badge color="#30D158" bg="rgba(48,209,88,0.15)" label={label} />;
  }
  if (r.status === "sem_valor") {
    return <Badge color="#9ABABA" bg="rgba(154,186,186,0.15)" label="Sem valor — não importa" />;
  }
  return (
    <div className="flex flex-col gap-1">
      <Badge color="#B08CFF" bg="rgba(176,140,255,0.16)" label="Faltando → Sistema" />
      {r.engagedMissing && (
        <span style={{ fontSize: 10, color: "#E0A800" }}>⚠ API diz via Engaged, mas não está na IRIS</span>
      )}
    </div>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ display: "inline-block", fontSize: 10, padding: "2px 8px", borderRadius: 4, background: bg, color, fontWeight: 700, width: "fit-content" }}>
      {label}
    </span>
  );
}
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: color ?? "var(--fg1)" }}>{value}</span>
      <span style={{ color: "var(--fg2)" }}>{label}</span>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 16px" };
const td: React.CSSProperties = { padding: "10px 16px", color: "var(--fg1)" };
function btn(disabled: boolean): React.CSSProperties {
  return { fontSize: 12, padding: "6px 14px", borderRadius: 6, background: "transparent", border: "1px solid var(--cockpit-border-strong)", color: "var(--fg1)", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 };
}
function btnPrimary(disabled: boolean): React.CSSProperties {
  return { fontSize: 12, padding: "6px 14px", borderRadius: 6, background: "#B08CFF", border: "none", color: "#1a1030", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 };
}
