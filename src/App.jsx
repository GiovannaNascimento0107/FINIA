import { useState, useEffect, useRef } from "react";

const CATEGORIES = {
  receita:     { label: "Receita",      color: "#00E5A0", icon: "💸" },
  moradia:     { label: "Moradia",      color: "#FF6B6B", icon: "🏠" },
  alimentacao: { label: "Alimentação",  color: "#FFB347", icon: "🍽️" },
  transporte:  { label: "Transporte",   color: "#87CEEB", icon: "🚌" },
  lazer:       { label: "Lazer",        color: "#DDA0DD", icon: "🎉" },
  saude:       { label: "Saúde",        color: "#98FB98", icon: "💊" },
  educacao:    { label: "Educação",     color: "#F0E68C", icon: "📚" },
  outros:      { label: "Outros",       color: "#C0C0C0", icon: "📦" },
};

async function callClaude(messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system, messages }),
  });
  const d = await res.json();
  return d.content?.[0]?.text || "";
}

function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

const today = new Date().toISOString().split("T")[0];

function DonutChart({ data, size = 110 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: "#333", fontSize: 12, textAlign: "center" }}>Sem dados</div>;
  let cum = -90;
  const cx = size / 2, cy = size / 2, r = size * 0.38, stroke = size * 0.18;
  const paths = data.map((d) => {
    const angle = (d.value / total) * 360;
    const s = (cum * Math.PI) / 180, e = ((cum + angle) * Math.PI) / 180;
    const path = `M ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)}`;
    cum += angle;
    return { ...d, path };
  });
  return (
    <svg width={size} height={size}>
      {paths.map((p, i) => <path key={i} d={p.path} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap="butt" />)}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#EEE" fontSize={size * 0.11} fontWeight="900" fontFamily="Outfit">
        R${(total / 1000).toFixed(1)}k
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#555" fontSize={size * 0.09} fontFamily="Outfit">gastos</text>
    </svg>
  );
}

function BarChart({ receitas, despesas }) {
  const max = Math.max(receitas, despesas, 1);
  const bars = [
    { label: "Receitas", value: receitas, color: "#00E5A0" },
    { label: "Despesas", value: despesas, color: "#FF6B6B" },
    { label: "Saldo",    value: Math.abs(receitas - despesas), color: receitas - despesas >= 0 ? "#00B8D9" : "#FF4444" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 80 }}>
      {bars.map(b => (
        <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: b.color }}>
            {b.value > 0 ? `R$${(b.value/1000).toFixed(1)}k` : "—"}
          </div>
          <div style={{ width: "100%", background: "#181828", borderRadius: 8, height: 52, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
            <div style={{ width: "100%", height: `${(b.value / max) * 100}%`, background: b.color, borderRadius: 8, transition: "height 1s ease", minHeight: b.value > 0 ? 4 : 0 }} />
          </div>
          <div style={{ fontSize: 9, color: "#555", fontWeight: 600 }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [txs, setTxs]         = useState([]);
  const [view, setView]       = useState("chat");
  const [msgs, setMsgs]       = useState([{
    role: "assistant",
    text: "Olá! 👋 Vamos montar sua vida financeira do zero.\n\nMe conta o que você ganhou e gastou — pode falar do jeito que quiser:\n\n• \"ganhei 3000 de salário\"\n• \"gastei 1200 de aluguel\"\n• \"paguei 45 no mercado hoje\"\n• \"recebi 500 de freela\"\n\nCada coisa que você falar eu registro e monto os gráficos automaticamente! 🚀",
    type: "info",
  }]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [flash, setFlash]     = useState(false);
  const chatEnd               = useRef(null);
  const inputRef              = useRef(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const receitas  = txs.filter(t => t.type === "receita").reduce((s, t) => s + t.value, 0);
  const despesas  = txs.filter(t => t.type === "despesa").reduce((s, t) => s + t.value, 0);
  const saldo     = receitas - despesas;
  const pctGasto  = receitas > 0 ? Math.min((despesas / receitas) * 100, 100) : 0;

  const byCategory = Object.entries(CATEGORIES)
    .filter(([k]) => k !== "receita")
    .map(([key, meta]) => ({ key, ...meta, total: txs.filter(t => t.category === key).reduce((s, t) => s + t.value, 0) }))
    .filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const donutData = byCategory.map(c => ({ value: c.total, color: c.color }));

  async function handleSend() {
    const txt = input.trim();
    if (!txt || loading) return;
    setInput("");
    setLoading(true);
    setMsgs(prev => [...prev, { role: "user", text: txt }]);

    const summary = txs.length === 0
      ? "Nenhum lançamento ainda."
      : `Receitas:R$${receitas}|Despesas:R$${despesas}|Saldo:R$${saldo}|Categorias:${byCategory.map(c => `${c.label}R$${c.total}`).join(",")}`;

    const SYSTEM = `Você é assistente financeiro pessoal. Hoje:${today}.
Dados do usuário: ${summary}
Categorias disponíveis: receita, moradia, alimentacao, transporte, lazer, saude, educacao, outros.

REGRAS — responda SOMENTE JSON puro sem markdown:
1. Lançamento financeiro (ganhou/gastou/pagou/recebi/comprei etc) → {"action":"add","desc":"nome curto","value":123.45,"type":"despesa|receita","category":"categoria","date":"YYYY-MM-DD","reply":"confirmação curta com emoji"}
2. Análise/pergunta → {"action":"info","reply":"resposta curta"}
3. Ambíguo → {"action":"clarify","reply":"peça detalhes"}`;

    try {
      const raw = await callClaude([{ role: "user", content: txt }], SYSTEM);
      const parsed = extractJSON(raw);
      if (parsed?.action === "add" && parsed.value && parsed.desc) {
        const newT = { id: Date.now(), desc: parsed.desc, value: parseFloat(parsed.value), type: parsed.type || "despesa", category: parsed.category || "outros", date: parsed.date || today };
        setTxs(prev => [newT, ...prev]);
        setMsgs(prev => [...prev, { role: "assistant", text: parsed.reply || "Registrado! ✅", type: "success", transaction: newT }]);
        setFlash(true);
        setTimeout(() => { setView("dashboard"); setFlash(false); }, 400);
      } else if (parsed?.reply) {
        setMsgs(prev => [...prev, { role: "assistant", text: parsed.reply, type: "info" }]);
      } else {
        setMsgs(prev => [...prev, { role: "assistant", text: "Não entendi. Tente: \"gastei 50 no uber\" ou \"ganhei 2000 de salário\".", type: "info" }]);
      }
    } catch {
      setMsgs(prev => [...prev, { role: "assistant", text: "Erro. Tente novamente.", type: "error" }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  }

  const isEmpty = txs.length === 0;

  return (
    <div style={{ fontFamily: "'Outfit',sans-serif", background: "#080810", minHeight: "100vh", color: "#F0F0F5" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2A2A40;border-radius:4px}
        .card{background:#10101A;border:1px solid #1C1C2E;border-radius:18px;padding:20px}
        .btn{border:none;cursor:pointer;font-family:inherit;font-weight:700;border-radius:12px;transition:all .15s}
        .btn:hover{opacity:.85}.btn:active{transform:scale(.96)}
        input{background:#14141E;border:1.5px solid #22223A;color:#F0F0F5;font-family:inherit;border-radius:14px;padding:14px 18px;font-size:15px;outline:none;transition:border .2s,box-shadow .2s;width:100%}
        input:focus{border-color:#00E5A0;box-shadow:0 0 0 3px #00E5A018}
        input::placeholder{color:#444}
        .tab{background:none;border:none;color:#555;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:7px 12px;border-radius:10px;transition:all .2s}
        .tab.active{background:#181828;color:#00E5A0}
        .fadeIn{animation:fadeIn .35s cubic-bezier(.4,0,.2,1)}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .popIn{animation:popIn .5s cubic-bezier(.34,1.56,.64,1)}
        @keyframes popIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
        .dot1,.dot2,.dot3{animation:blink 1.2s infinite;display:inline-block;width:6px;height:6px;background:#7C3AED;border-radius:50%}
        .dot2{animation-delay:.2s}.dot3{animation-delay:.4s}
        @keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
      `}</style>

      {/* Header */}
      <div style={{ background: "#0A0A14", borderBottom: "1px solid #181828", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#00E5A0,#00B8D9)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>💰</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.5px" }}>Finia</div>
            <div style={{ fontSize: 10, color: "#00E5A0", fontWeight: 700, letterSpacing: "0.5px" }}>IA FINANCEIRA</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {[{ id: "dashboard", icon: "📊", label: "Dashboard" }, { id: "transactions", icon: "📋", label: "Lista" }, { id: "chat", icon: "✏️", label: "Anotar" }].map(t => (
            <button key={t.id} className={`tab ${view === t.id ? "active" : ""}`} onClick={() => setView(t.id)}>{t.icon} {t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 100px" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div className="fadeIn">
            <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
              {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-1px", marginBottom: 20 }}>Visão Geral</h1>

            {isEmpty ? (
              /* Estado vazio */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 16, textAlign: "center" }}>
                <div style={{ fontSize: 56 }}>📊</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#CCC" }}>Nada aqui ainda</div>
                <div style={{ fontSize: 14, color: "#555", maxWidth: 260, lineHeight: 1.6 }}>
                  Vá em <strong style={{ color: "#00E5A0" }}>✏️ Anotar</strong> e me conta seus ganhos e gastos — os gráficos aparecem aqui automaticamente!
                </div>
                <button className="btn" onClick={() => setView("chat")} style={{ marginTop: 8, padding: "14px 28px", background: "linear-gradient(135deg,#7C3AED,#3B82F6)", color: "#FFF", fontSize: 14 }}>
                  Começar a anotar →
                </button>
              </div>
            ) : (
              <>
                {/* Saldo */}
                <div className="card" style={{ background: "linear-gradient(140deg,#0C2A1C,#0A1828)", border: "1px solid #1A3A28", marginBottom: 14, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, background: "radial-gradient(circle,#00E5A028,transparent)", borderRadius: "50%", pointerEvents: "none" }} />
                  <div style={{ fontSize: 11, color: "#667", fontWeight: 700, letterSpacing: "1px", marginBottom: 6 }}>SALDO DO MÊS</div>
                  <div key={saldo} className="popIn" style={{ fontSize: 44, fontWeight: 900, color: saldo >= 0 ? "#00E5A0" : "#FF6B6B", letterSpacing: "-2px", lineHeight: 1 }}>
                    {saldo < 0 && "−"}R$ {Math.abs(saldo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 12, color: saldo >= 0 ? "#00A875" : "#CC4444", marginTop: 6 }}>
                    {saldo >= 0 ? "✓ Você está no positivo!" : "⚠ Gastos acima da renda"}
                  </div>
                  {receitas > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#556", marginBottom: 7 }}>
                        <span>Comprometido: {pctGasto.toFixed(0)}%</span>
                        <span style={{ color: pctGasto > 80 ? "#FF6B6B" : "#00E5A0" }}>{pctGasto > 80 ? "🔴 Alto" : "🟢 Saudável"}</span>
                      </div>
                      <div style={{ background: "#0D1A14", borderRadius: 8, height: 8, overflow: "hidden" }}>
                        <div style={{ width: `${pctGasto}%`, height: "100%", borderRadius: 8, transition: "width 1.2s ease", background: pctGasto > 80 ? "linear-gradient(90deg,#FF6B6B,#FF4040)" : "linear-gradient(90deg,#00E5A0,#00C8F0)" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Gráficos */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div className="card">
                    <div style={{ fontSize: 11, color: "#556", fontWeight: 700, marginBottom: 14, letterSpacing: "0.5px" }}>RECEITAS vs DESPESAS</div>
                    <BarChart receitas={receitas} despesas={despesas} />
                  </div>
                  <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <div style={{ fontSize: 11, color: "#556", fontWeight: 700, letterSpacing: "0.5px", alignSelf: "flex-start" }}>POR CATEGORIA</div>
                    <DonutChart data={donutData} size={110} />
                  </div>
                </div>

                {/* Categorias */}
                {byCategory.length > 0 && (
                  <div className="card" style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, color: "#CCC" }}>Detalhamento</div>
                    {byCategory.map((cat, i) => (
                      <div key={cat.key} style={{ marginBottom: i < byCategory.length - 1 ? 14 : 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 15 }}>{cat.icon}</span>
                            <span style={{ fontSize: 13, color: "#BBB" }}>{cat.label}</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span key={cat.total} className="popIn" style={{ fontSize: 14, fontWeight: 800, color: cat.color }}>
                              R$ {cat.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                            <div style={{ fontSize: 10, color: "#444" }}>{despesas > 0 ? ((cat.total / despesas) * 100).toFixed(0) : 0}% dos gastos</div>
                          </div>
                        </div>
                        <div style={{ background: "#181828", borderRadius: 6, height: 5, overflow: "hidden" }}>
                          <div style={{ width: `${despesas > 0 ? (cat.total / despesas) * 100 : 0}%`, height: "100%", background: cat.color, borderRadius: 6, transition: "width 1.2s ease" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Últimos */}
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#CCC" }}>Últimos lançamentos</div>
                    <button className="btn" onClick={() => setView("transactions")} style={{ background: "none", color: "#7C3AED", fontSize: 12, padding: "4px 8px" }}>ver todos →</button>
                  </div>
                  {txs.slice(0, 5).map((t, i) => {
                    const cat = CATEGORIES[t.category] || CATEGORIES.outros;
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < Math.min(txs.length, 5) - 1 ? "1px solid #181828" : "none" }}>
                        <div style={{ width: 36, height: 36, background: cat.color + "18", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{cat.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#DDD" }}>{t.desc}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{new Date(t.date + "T12:00").toLocaleDateString("pt-BR")} · {cat.label}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: t.type === "receita" ? "#00E5A0" : "#FF6B6B" }}>
                          {t.type === "receita" ? "+" : "−"}R${t.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <button className="btn" onClick={() => setView("chat")} style={{ width: "100%", padding: "16px", background: "linear-gradient(135deg,#181030,#0C1828)", border: "1px solid #2A1A40", color: "#EEE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, background: "linear-gradient(135deg,#7C3AED,#3B82F6)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✏️</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 800 }}>Anotar gasto ou receita</div>
                  <div style={{ fontSize: 12, color: "#666" }}>Fale naturalmente — a IA registra →</div>
                </div>
              </div>
              <span style={{ color: "#7C3AED", fontSize: 20 }}>›</span>
            </button>
          </div>
        )}

        {/* LISTA */}
        {view === "transactions" && (
          <div className="fadeIn">
            <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.8px", marginBottom: 6 }}>Transações</h1>
            <p style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>{txs.length} lançamentos</p>
            {txs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#444" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div>Nenhum lançamento ainda.</div>
              </div>
            ) : txs.map(t => {
              const cat = CATEGORIES[t.category] || CATEGORIES.outros;
              return (
                <div key={t.id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, background: cat.color + "18", border: `1px solid ${cat.color}30`, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#EEE" }}>{t.desc}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{new Date(t.date + "T12:00").toLocaleDateString("pt-BR")} · {cat.label}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: t.type === "receita" ? "#00E5A0" : "#FF6B6B", whiteSpace: "nowrap" }}>
                    {t.type === "receita" ? "+" : "−"}R$ {t.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CHAT */}
        {view === "chat" && (
          <div className="fadeIn" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)" }}>
            <div style={{ marginBottom: 14 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px" }}>Anotar</h1>
              <p style={{ color: "#555", fontSize: 13 }}>Fale naturalmente — os gráficos montam sozinhos</p>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
              {msgs.map((msg, i) => (
                <div key={i} className={i === msgs.length - 1 ? "fadeIn" : ""} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#7C3AED,#3B82F6)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>🤖</div>
                  )}
                  <div style={{
                    maxWidth: "80%", padding: "12px 15px",
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: msg.role === "user" ? "linear-gradient(135deg,#001E14,#001228)" : msg.type === "success" ? "linear-gradient(135deg,#0C2018,#0A1428)" : "#121220",
                    border: `1px solid ${msg.role === "user" ? "#00E5A025" : msg.type === "success" ? "#00E5A030" : "#1C1C2E"}`,
                    fontSize: 13, lineHeight: 1.65, color: "#CCC", whiteSpace: "pre-wrap"
                  }}>
                    {msg.transaction && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1C2C1C" }}>
                        <span style={{ fontSize: 18 }}>{CATEGORIES[msg.transaction.category]?.icon}</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: msg.transaction.type === "receita" ? "#00E5A0" : "#A78BFA" }}>
                            {msg.transaction.type === "receita" ? "RECEITA" : "DESPESA"} · {CATEGORIES[msg.transaction.category]?.label}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 900, color: msg.transaction.type === "receita" ? "#00E5A0" : "#FF6B6B" }}>
                            R$ {msg.transaction.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    )}
                    {msg.text}
                    {msg.type === "success" && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#445", display: "flex", alignItems: "center", gap: 4 }}>
                        → Dashboard atualizado automaticamente
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#7C3AED,#3B82F6)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
                  <div style={{ background: "#121220", border: "1px solid #1C1C2E", borderRadius: "16px 16px 16px 4px", padding: "14px 18px", display: "flex", gap: 5, alignItems: "center" }}>
                    <span className="dot1" /><span className="dot2" /><span className="dot3" />
                  </div>
                </div>
              )}
              <div ref={chatEnd} />
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: "1px solid #181828" }}>
              <input
                ref={inputRef}
                placeholder='ex: "ganhei 3000 de salário" ou "gastei 45 no mercado"'
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              />
              <button className="btn" onClick={handleSend} disabled={loading || !input.trim()} style={{ width: 48, height: 48, flexShrink: 0, fontSize: 20, background: loading || !input.trim() ? "#1A1A2A" : "linear-gradient(135deg,#7C3AED,#3B82F6)", color: loading || !input.trim() ? "#444" : "#FFF" }}>↑</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}