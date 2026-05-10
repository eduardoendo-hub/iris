type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  eventType: string;
  rdCrmDealId: string | null;
  capturedAt: Date;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

function formatDate(d: Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function LeadsTable({ leads, totalCount }: { leads: LeadRow[]; totalCount: number }) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <header
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <div className="flex items-center gap-3">
          <h3 style={{ fontWeight: 700, fontSize: 14 }}>Leads recebidos</h3>
          <span
            style={{
              fontSize: 11,
              color: "var(--fg2)",
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(10,186,181,0.10)",
              color2: "var(--brand)",
              border: "1px solid rgba(10,186,181,0.25)",
            } as React.CSSProperties}
          >
            {totalCount} {totalCount === 1 ? "lead" : "leads"} no total
          </span>
        </div>
        <span style={{ fontSize: 10, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700 }}>
          via formulário da LP · RD CRM
        </span>
      </header>

      {leads.length === 0 ? (
        <div className="px-5 py-10 text-center" style={{ color: "var(--fg2)", fontSize: 13 }}>
          Nenhum lead recebido ainda.
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
            Quando alguém preencher o formulário &quot;Falar com especialista&quot; na LP,
            o lead aparece aqui em tempo real.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--fg2)", fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700 }}>
                <th style={{ textAlign: "left", padding: "10px 16px" }}>Nome</th>
                <th style={{ textAlign: "left", padding: "10px 16px" }}>Contato</th>
                <th style={{ textAlign: "left", padding: "10px 16px" }}>Origem</th>
                <th style={{ textAlign: "left", padding: "10px 16px" }}>Canal</th>
                <th style={{ textAlign: "left", padding: "10px 16px" }}>RD CRM</th>
                <th style={{ textAlign: "right", padding: "10px 16px" }}>Recebido</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid var(--cockpit-border)" }}>
                  <td style={{ padding: "12px 16px", color: "var(--fg1)", fontWeight: 600 }}>
                    {l.name || <span style={{ opacity: 0.5 }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--fg2)", fontSize: 12 }}>
                    {l.email && <div>{l.email}</div>}
                    {l.phone && <div style={{ opacity: 0.7 }}>{l.phone}</div>}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--fg2)", fontSize: 11 }}>
                    {l.utmSource || l.utmMedium || l.utmCampaign ? (
                      <div>
                        {l.utmSource && <span style={{ color: "var(--brand)" }}>{l.utmSource}</span>}
                        {l.utmMedium && <span> · {l.utmMedium}</span>}
                        {l.utmCampaign && <div style={{ opacity: 0.6, fontSize: 10 }}>{l.utmCampaign}</div>}
                      </div>
                    ) : (
                      <span style={{ opacity: 0.4 }}>direto</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: l.eventType === "FORM_SUBMIT" ? "rgba(217,119,87,0.15)" : "rgba(46,204,113,0.15)",
                        color: l.eventType === "FORM_SUBMIT" ? "#D97757" : "#2ecc71",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {l.eventType === "FORM_SUBMIT" ? "Form" : "WhatsApp"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 11 }}>
                    {l.rdCrmDealId ? (
                      <a
                        href={`https://crm.rdstation.com/app/deals/${l.rdCrmDealId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Abrir Deal ${l.rdCrmDealId} no RD CRM`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: "rgba(10,186,181,0.10)",
                          border: "1px solid rgba(10,186,181,0.25)",
                          color: "var(--brand)",
                          fontFamily: "var(--font-mono)",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        Abrir RD
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M7 17L17 7M17 7H8M17 7v9" />
                        </svg>
                      </a>
                    ) : (
                      <span style={{ opacity: 0.4 }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--fg2)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                    {formatDate(l.capturedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
