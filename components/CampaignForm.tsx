"use client";

/**
 * CampaignForm — formulario de criar/editar campanha.
 *
 * Modo:
 *   - sem `initial`  → cria via POST /api/admin/campaigns
 *   - com `initial`  → atualiza via PATCH /api/admin/campaigns/[id]
 *
 * Campos:
 *   - Nome + slug + produto + datas
 *   - Investimentos (mídia + LP + ads + outros)
 *   - Metas (matrículas, receita, CAC, ROAS, CPL)
 *   - Plano de marketing (textarea grande + upload placeholder)
 *   - Toggle "ativa" (com aviso que vai desativar outra)
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export type CampaignInitial = {
  id: string;
  slug: string;
  productSlug: string;
  name: string;
  startDate: string; // ISO
  endDate: string;
  mediaBudget: number | null;
  productionCostLP: number | null;
  productionCostAds: number | null;
  productionCostOther: number | null;
  goalEnrollments: number | null;
  goalRevenue: number | null;
  goalCac: number | null;
  goalRoas: number | null;
  goalCpl: number | null;
  marketingPlan: string | null;
  marketingPlanFilename: string | null;
  isActive: boolean;
};

function isoToInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function n(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

export function CampaignForm({ initial }: { initial?: CampaignInitial }) {
  const router = useRouter();
  const editing = !!initial;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [productSlug, setProductSlug] = useState(initial?.productSlug ?? "claude-pro");
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(isoToInputDate(initial?.startDate));
  const [endDate, setEndDate] = useState(isoToInputDate(initial?.endDate));
  const [mediaBudget, setMediaBudget] = useState(n(initial?.mediaBudget));
  const [productionCostLP, setProductionCostLP] = useState(n(initial?.productionCostLP));
  const [productionCostAds, setProductionCostAds] = useState(n(initial?.productionCostAds));
  const [productionCostOther, setProductionCostOther] = useState(n(initial?.productionCostOther));
  const [goalEnrollments, setGoalEnrollments] = useState(n(initial?.goalEnrollments));
  const [goalRevenue, setGoalRevenue] = useState(n(initial?.goalRevenue));
  const [goalCac, setGoalCac] = useState(n(initial?.goalCac));
  const [goalRoas, setGoalRoas] = useState(n(initial?.goalRoas));
  const [goalCpl, setGoalCpl] = useState(n(initial?.goalCpl));
  const [marketingPlan, setMarketingPlan] = useState(initial?.marketingPlan ?? "");
  const [marketingPlanFilename, setMarketingPlanFilename] = useState(
    initial?.marketingPlanFilename ?? ""
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? false);

  // Custos totais calculados
  const num = (s: string): number => (s === "" ? 0 : Number(s) || 0);
  const totalProducao = num(productionCostLP) + num(productionCostAds) + num(productionCostOther);
  const totalCampanha = num(mediaBudget) + totalProducao;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      slug: slug.trim(),
      productSlug: productSlug.trim(),
      name: name.trim(),
      startDate,
      endDate,
      isActive,
    };
    const nullable = (s: string) => (s === "" ? null : Number(s));
    body.mediaBudget = nullable(mediaBudget);
    body.productionCostLP = nullable(productionCostLP);
    body.productionCostAds = nullable(productionCostAds);
    body.productionCostOther = nullable(productionCostOther);
    body.goalEnrollments = nullable(goalEnrollments);
    body.goalRevenue = nullable(goalRevenue);
    body.goalCac = nullable(goalCac);
    body.goalRoas = nullable(goalRoas);
    body.goalCpl = nullable(goalCpl);
    body.marketingPlan = marketingPlan === "" ? null : marketingPlan;
    body.marketingPlanFilename = marketingPlanFilename === "" ? null : marketingPlanFilename;

    try {
      const url = editing
        ? `/api/admin/campaigns/${initial!.id}`
        : `/api/admin/campaigns`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "Falha ao salvar");
        setSubmitting(false);
        return;
      }
      router.push("/admin/campaigns");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirm(`Apagar a campanha "${name}"? Esta ação não pode ser desfeita.`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${initial!.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "Falha ao deletar");
        setSubmitting(false);
        return;
      }
      router.push("/admin/campaigns");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <div
          className="rounded-md px-3 py-2"
          style={{ background: "rgba(236,96,136,0.15)", color: "#EC6088", fontSize: 12 }}
        >
          {error}
        </div>
      )}

      <Section title="Identificação">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nome da campanha *" hint="ex: Lançamento Claude Pro Maio/2026">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required {...inputProps} />
          </Field>
          <Field label="Slug (URL) *" hint="ex: claude-pro-maio-2026 — único">
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9-]+" {...inputProps} />
          </Field>
          <Field label="Produto *" hint="bate com lib/products.ts">
            <input type="text" value={productSlug} onChange={(e) => setProductSlug(e.target.value)} required {...inputProps} />
          </Field>
          <Field label="Campanha ativa?" hint="apenas 1 ativa por produto">
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span style={{ fontSize: 13, color: "var(--fg1)" }}>
                {isActive ? "Ativa (vai desativar a anterior)" : "Inativa"}
              </span>
            </label>
          </Field>
        </div>
      </Section>

      <Section title="Datas">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Data de início *">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required {...inputProps} />
          </Field>
          <Field label="Data de fim (último dia de matrícula) *">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required {...inputProps} />
          </Field>
        </div>
      </Section>

      <Section title="Investimentos">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Mídia paga (R$)" hint="Meta + Google budget total">
            <input type="number" step="0.01" min="0" value={mediaBudget} onChange={(e) => setMediaBudget(e.target.value)} {...inputProps} />
          </Field>
          <Field label="LP (R$)" hint="custo da landing page">
            <input type="number" step="0.01" min="0" value={productionCostLP} onChange={(e) => setProductionCostLP(e.target.value)} {...inputProps} />
          </Field>
          <Field label="Peças/criativos (R$)">
            <input type="number" step="0.01" min="0" value={productionCostAds} onChange={(e) => setProductionCostAds(e.target.value)} {...inputProps} />
          </Field>
          <Field label="Outros (R$)" hint="consultoria, etc">
            <input type="number" step="0.01" min="0" value={productionCostOther} onChange={(e) => setProductionCostOther(e.target.value)} {...inputProps} />
          </Field>
        </div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Summary label="Total produção" value={totalProducao} />
          <Summary label="Total campanha (mídia + produção — usado pro ROAS)" value={totalCampanha} bold />
        </div>
      </Section>

      <Section title="Metas">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Field label="Matrículas alvo">
            <input type="number" step="1" min="0" value={goalEnrollments} onChange={(e) => setGoalEnrollments(e.target.value)} {...inputProps} />
          </Field>
          <Field label="Receita alvo (R$)">
            <input type="number" step="0.01" min="0" value={goalRevenue} onChange={(e) => setGoalRevenue(e.target.value)} {...inputProps} />
          </Field>
          <Field label="CAC máximo (R$)" hint="limite">
            <input type="number" step="0.01" min="0" value={goalCac} onChange={(e) => setGoalCac(e.target.value)} {...inputProps} />
          </Field>
          <Field label="ROAS alvo (×)" hint="ex: 5.0">
            <input type="number" step="0.1" min="0" value={goalRoas} onChange={(e) => setGoalRoas(e.target.value)} {...inputProps} />
          </Field>
          <Field label="CPL alvo (R$)" hint="limite">
            <input type="number" step="0.01" min="0" value={goalCpl} onChange={(e) => setGoalCpl(e.target.value)} {...inputProps} />
          </Field>
        </div>
      </Section>

      <Section title="Plano de marketing">
        <Field label="Nome do arquivo (opcional)" hint="ex: plano-maio-2026.docx">
          <input type="text" value={marketingPlanFilename} onChange={(e) => setMarketingPlanFilename(e.target.value)} {...inputProps} />
        </Field>
        <Field label="Conteúdo do plano (markdown ou texto)" hint="Cole o plano aqui. Auto-fill via LLM virá em breve.">
          <textarea
            value={marketingPlan}
            onChange={(e) => setMarketingPlan(e.target.value)}
            rows={10}
            {...inputProps}
            style={{ ...inputProps.style, fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
        </Field>
        <p style={{ fontSize: 11, color: "var(--fg2)", marginTop: 4 }}>
          🚧 Upload de arquivo + extração automática de metas via LLM será adicionado em breve.
          Por enquanto cole o texto e preencha as metas manualmente acima.
        </p>
      </Section>

      <div className="flex items-center gap-3 justify-end">
        {editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            style={{
              fontSize: 12,
              padding: "8px 16px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid #EC6088",
              color: "#EC6088",
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Apagar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            fontSize: 13,
            padding: "8px 20px",
            borderRadius: 6,
            background: "var(--brand)",
            color: "var(--fg-on-brand)",
            border: "none",
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Salvando..." : editing ? "Salvar alterações" : "Criar campanha"}
        </button>
      </div>
    </form>
  );
}

const inputProps = {
  style: {
    width: "100%",
    background: "var(--cockpit-card-strong)",
    border: "1px solid var(--cockpit-border)",
    borderRadius: 6,
    padding: "8px 10px",
    color: "var(--fg1)",
    fontSize: 13,
    outline: "none",
  } as React.CSSProperties,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "var(--ls-eyebrow)",
          color: "var(--brand-soft)",
          fontWeight: 700,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10, color: "var(--fg2)" }}>{hint}</span>}
    </label>
  );
}

function Summary({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div
      className="rounded-md px-3 py-2 flex items-center justify-between"
      style={{
        background: "var(--cockpit-card-strong)",
        border: "1px solid var(--cockpit-border)",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--fg2)" }}>{label}</span>
      <span
        style={{
          fontSize: bold ? 14 : 12,
          fontWeight: bold ? 700 : 500,
          fontFamily: "var(--font-mono)",
          color: "var(--fg1)",
        }}
      >
        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)}
      </span>
    </div>
  );
}
