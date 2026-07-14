"use client";

/**
 * RecoveryTemplatesManager — edita os templates da cadência de recuperação.
 *
 * Cada card = 1 chave (passo × status). Campos:
 *   - Texto da mensagem (fallback/preview; placeholders {nome} {curso} {link} {cupom})
 *   - Template ChatPro/Meta (nome do template aprovado — envio proativo oficial)
 *   - Parâmetros: ordem das variáveis que preenchem {{1}},{{2}},... do template
 *   - Ativo: desliga o passo sem apagar a config
 */
import { useEffect, useState } from "react";

type Template = {
  key: string;
  label: string;
  defaultParams: string[];
  defaultText: string;
  chatproTemplate: string | null;
  params: string[];
  fallbackText: string;
  active: boolean;
  customized: boolean;
};

const PARAM_OPTIONS = ["nome", "curso", "link", "cupom"] as const;

export function RecoveryTemplatesManager() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/recovery-templates")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`);
        setTemplates(j.templates);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="rounded-md px-3 py-2" style={{ background: "rgba(236,96,136,0.15)", color: "#EC6088", fontSize: 12 }}>
        {error}
      </div>
    );
  }
  if (!templates) {
    return <div style={{ color: "var(--fg2)", fontSize: 13 }}>Carregando…</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {templates.map((t) => (
        <TemplateCard key={t.key} t={t} />
      ))}
    </div>
  );
}

function TemplateCard({ t }: { t: Template }) {
  const [text, setText] = useState(t.fallbackText);
  const [tpl, setTpl] = useState(t.chatproTemplate ?? "");
  const [params, setParams] = useState(t.params.join(", "));
  const [active, setActive] = useState(t.active);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    text !== t.fallbackText ||
    tpl !== (t.chatproTemplate ?? "") ||
    params !== t.params.join(", ") ||
    active !== t.active;

  async function save() {
    setSaving(true);
    setMsg(null);
    const parsedParams = params
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is (typeof PARAM_OPTIONS)[number] =>
        (PARAM_OPTIONS as readonly string[]).includes(p)
      );
    try {
      const r = await fetch("/api/admin/recovery-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: t.key,
          chatproTemplate: tpl.trim() === "" ? null : tpl.trim(),
          params: parsedParams,
          fallbackText: text,
          active,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`);
      setMsg({ ok: true, text: "Salvo ✓" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        opacity: active ? 1 : 0.6,
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--fg1)" }}>{t.label}</h3>
          <code style={{ fontSize: 10, color: "var(--fg2)" }}>{t.key}</code>
          {t.customized && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, background: "rgba(94,132,241,0.15)", color: "var(--brand)" }}>
              CUSTOMIZADO
            </span>
          )}
        </div>
        <label className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--fg1)" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Ativo
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>
          Texto da mensagem (preview/fallback)
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.5 }}
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>
            Template ChatPro/Meta (nome aprovado)
          </span>
          <input
            type="text"
            value={tpl}
            onChange={(e) => setTpl(e.target.value)}
            placeholder="ex: recuperacao_carrinho_1"
            style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>
            Parâmetros do template, na ordem {"{{1}}, {{2}}"}… (opções: nome, curso, link, cupom)
          </span>
          <input
            type="text"
            value={params}
            onChange={(e) => setParams(e.target.value)}
            placeholder="nome, curso, link"
            style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        {msg && (
          <span style={{ fontSize: 11, color: msg.ok ? "#30D158" : "#EC6088" }}>{msg.text}</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          style={{
            fontSize: 12, padding: "6px 16px", borderRadius: 6,
            background: dirty ? "var(--brand)" : "transparent",
            color: dirty ? "var(--fg-on-brand)" : "var(--fg2)",
            border: dirty ? "none" : "1px solid var(--cockpit-border)",
            fontWeight: 700,
            cursor: saving || !dirty ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--cockpit-card-strong)",
  border: "1px solid var(--cockpit-border)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--fg1)",
  fontSize: 13,
  outline: "none",
};
