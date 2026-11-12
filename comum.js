// Código usado pelas duas páginas (index.html e agenda.html).
// Inclua com <script src="comum.js"></script> no fim do <body>, antes do script da página.

// CULTOS FIXOS: único lugar para mudar os horários (aparecem na agenda e ligam a barra "ao vivo").
// dia: 0 = domingo … 6 = sábado. primeiroDomingo: só no 1º domingo do mês.
// aoVivo: true = é transmitido no YouTube (mostra o selo e liga a barra no horário).
// Atenção: a frase da prévia de compartilhamento (og:description no index.html) também cita os horários.
const CULTOS = [
  { nome: "Culto de Oração", dia: 5, hora: 20, minuto: 0 },
  { nome: "Culto da Família", dia: 0, hora: 18, minuto: 0, aoVivo: true },
  { nome: "Santa Ceia", dia: 0, hora: 9, minuto: 0, aoVivo: true, primeiroDomingo: true, obs: "Primeiro domingo do mês" },
];

const LINK_AO_VIVO = "https://www.youtube.com/@CuraNossaTerra/live";
const YOUTUBE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.8 15.1V8.9l5.4 3.1-5.4 3.1z"/></svg>';

// PLANILHA DA AGENDA: precisa estar compartilhada como "Qualquer pessoa com o link pode ver".
const PLANILHA_ID = "1W-44JHBbi8hxsPrDh14T-W76qqavTwYkMUBf5EdHcVQ";
const PLANILHA_CSV = `https://docs.google.com/spreadsheets/d/${PLANILHA_ID}/gviz/tq?tqx=out:csv`;

// Lê CSV respeitando campos entre aspas (que podem ter vírgula ou quebra de linha)
function lerCSV(texto) {
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

const normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Baixa a planilha: [cabecalho, ...linhas]. Chamadas próximas reaproveitam o mesmo download.
let planilhaEmAndamento = null;
function lerPlanilha() {
  if (!planilhaEmAndamento) {
    planilhaEmAndamento = fetch(PLANILHA_CSV, { cache: "no-store" })
      .then((resp) => {
        if (!resp.ok) throw new Error(resp.status);
        return resp.text();
      })
      .then(lerCSV)
      .finally(() => setTimeout(() => { planilhaEmAndamento = null; }, 60000));
  }
  return planilhaEmAndamento;
}

// ARRUMAR TEXTO DA PLANILHA: corrige o que é digitado com pressa, sem mudar a planilha.
// Tira espaços sobrando, começa com letra maiúscula, desfaz TUDO EM MAIÚSCULAS e põe os acentos
// das palavras comuns da igreja que vierem sem acento. Não é um corretor completo: palavra
// fora da lista fica como foi digitada. Para incluir uma palavra: "sem acento": "com acento".
const ACENTOS = {
  ultimo: "último", ultima: "última", reuniao: "reunião", reunioes: "reuniões",
  celebracao: "celebração", oracao: "oração", familia: "família", familias: "famílias",
  ministerio: "ministério", ministerios: "ministérios", conferencia: "conferência",
  vigilia: "vigília", midia: "mídia", danca: "dança", crianca: "criança", criancas: "crianças",
  apresentacao: "apresentação", confraternizacao: "confraternização", comunhao: "comunhão",
  adoracao: "adoração", missao: "missão", missoes: "missões", intercessao: "intercessão",
  pregacao: "pregação", irmaos: "irmãos", irmas: "irmãs", mae: "mãe", maes: "mães",
  varoes: "varões", aniversario: "aniversário", comemoracao: "comemoração",
  sabado: "sábado", terca: "terça", ministracao: "ministração", cafe: "café", cha: "chá",
  bebe: "bebê", evangelizacao: "evangelização", consagracao: "consagração",
  programacao: "programação", inscricao: "inscrição", inscricoes: "inscrições",
  lideranca: "liderança", lideres: "líderes", biblico: "bíblico", biblica: "bíblica",
  biblia: "Bíblia", gratidao: "gratidão", acao: "ação", acoes: "ações", gracas: "graças",
  uncao: "unção", musica: "música", musicas: "músicas", mes: "mês", servico: "serviço",
  voluntarios: "voluntários", visitacao: "visitação", celula: "célula", celulas: "células",
  edificacao: "edificação", restauracao: "restauração", libertacao: "libertação",
  saude: "saúde", espirito: "Espírito", pascoa: "Páscoa", reconciliacao: "reconciliação",
  // nomes próprios sempre com maiúscula
  deus: "Deus", jesus: "Jesus", cristo: "Cristo", natal: "Natal",
};
// nomes escritos sempre do mesmo jeito
const NOMES_FIXOS = ["Cura Nossa Terra", "Portal da Cura", "Espírito Santo"];

function arrumarTexto(texto) {
  let t = (texto || "").replace(/\s+/g, " ").trim();
  if (!t) return t;
  // TUDO EM MAIÚSCULAS (com mais de uma palavra) vira frase normal
  if (t === t.toUpperCase() && /\p{L}{2,}.*\s.*\p{L}{2,}/u.test(t)) t = t.toLowerCase();
  // acentos: só troca palavra digitada SEM acento (palavra já acentuada fica como está)
  t = t.replace(/\p{L}+/gu, (palavra) => {
    const chave = palavra.toLowerCase();
    const certa = ACENTOS[chave];
    if (!certa || normalizar(palavra) !== chave) return palavra;
    if (palavra === palavra.toUpperCase() && palavra.length > 1) return certa.toUpperCase();
    if (palavra[0] === palavra[0].toUpperCase()) return certa[0].toUpperCase() + certa.slice(1);
    return certa;
  });
  // (roda depois dos acentos: "espirito santo" já virou "Espírito santo" aqui)
  for (const nome of NOMES_FIXOS) t = t.replace(new RegExp(nome.replace(/ /g, "\\s+"), "gi"), nome);
  return t[0].toUpperCase() + t.slice(1);
}

// Coluna "Ao vivo" marcada: caixinha (TRUE) ou texto "sim", "x", "✓"
const marcado = (texto) => /^(true|sim|s|x|✓)$/i.test(texto);

// "SEX 20h", "DOM 09h"
const DIAS_CURTOS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
function horarioDoCulto(c) {
  return `${DIAS_CURTOS[c.dia]} ${String(c.hora).padStart(2, "0")}h${c.minuto ? String(c.minuto).padStart(2, "0") : ""}`;
}

// ---------------------------------------------------------------------------
// BARRA "AO VIVO": faixa vermelha no topo durante os cultos transmitidos.
// Duas fontes: os CULTOS com aoVivo + os eventos da planilha com a coluna "Ao vivo" marcada.
// Aparece 10 min antes do início e fica até 2h30 depois. Para testar: coloque ?aovivo=1 no endereço.
(function barraAoVivo() {
  const ANTES_MIN = 10, DEPOIS_MIN = 150;
  let eventosAoVivo = []; // [{ nome, inicio: Date }] vindos da planilha

  const estilo = document.createElement("style");
  estilo.textContent = `
    .aovivo {
      position: fixed; top: 0; left: 0; right: 0; z-index: 10;
      padding-top: env(safe-area-inset-top, 0px);
      display: block; overflow: hidden; background: #e00000; color: #fff;
      text-decoration: none; box-shadow: 0 2px 12px rgba(0,0,0,.35);
    }
    .aovivo[hidden] { display: none; }
    .aovivo .faixa { display: flex; width: max-content; animation: passar 40s linear infinite; }
    .aovivo span {
      display: inline-flex; align-items: center; gap: 10px; padding: 12px 28px;
      font-size: 15px; font-weight: 800; letter-spacing: .04em; white-space: nowrap;
    }
    .aovivo .ponto { width: 10px; height: 10px; border-radius: 50%; background: #fff; animation: piscar 1s ease-in-out infinite; }
    @keyframes passar { to { transform: translateX(-50%); } }
    @keyframes piscar { 50% { opacity: .25; } }
    /* --respiro-topo: o espaço normal do topo de cada página */
    body.com-aovivo { padding-top: calc(env(safe-area-inset-top, 0px) + var(--respiro-topo, 48px) + 46px); }
    @media (prefers-reduced-motion: reduce) { .aovivo .faixa, .aovivo .ponto { animation: none; } }
  `;
  document.head.append(estilo);

  const barra = document.createElement("a");
  barra.className = "aovivo";
  barra.href = LINK_AO_VIVO;
  barra.dataset.clique = "Barra ao vivo";
  barra.hidden = true;
  const faixa = document.createElement("div");
  faixa.className = "faixa";
  barra.append(faixa);
  document.body.prepend(barra);

  function dentroDaJanela(agora, inicio) {
    const min = (agora - inicio) / 60000;
    return min >= -ANTES_MIN && min <= DEPOIS_MIN;
  }

  function cultoAoVivo(agora) {
    if (new URLSearchParams(location.search).has("aovivo")) return { nome: "Culto" };
    const fixo = CULTOS.find((c) => {
      if (!c.aoVivo || c.dia !== agora.getDay()) return false;
      if (c.primeiroDomingo && agora.getDate() > 7) return false;
      const inicio = new Date(agora);
      inicio.setHours(c.hora, c.minuto, 0, 0);
      return dentroDaJanela(agora, inicio);
    });
    return fixo || eventosAoVivo.find((e) => dentroDaJanela(agora, e.inicio));
  }

  async function carregarEventosAoVivo() {
    try {
      const [cabecalho, ...linhas] = await lerPlanilha();
      const nomes = cabecalho.map(normalizar);
      const achar = (...chaves) => nomes.findIndex((n) => chaves.some((c) => n.includes(c)));
      const col = {
        feito: achar("✓", "conclu"), dia: achar("data", "dia"), hora: achar("hor"),
        evento: achar("evento"), aovivo: achar("ao vivo", "transmi"),
      };
      if (col.aovivo < 0) return; // planilha ainda sem a coluna "Ao vivo"
      const pegar = (l, i) => (i >= 0 ? (l[i] || "").trim() : "");
      const hoje = new Date();

      eventosAoVivo = linhas.flatMap((l) => {
        if (!marcado(pegar(l, col.aovivo))) return [];
        if (pegar(l, col.feito).toUpperCase() === "TRUE") return [];
        const d = pegar(l, col.dia).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        const h = pegar(l, col.hora).match(/^(\d{1,2})(?:[:h](\d{2}))?/i);
        if (!d || !h) return []; // sem data e horário não dá para saber quando ligar a barra
        const ano = d[3] ? Number(d[3].length === 2 ? "20" + d[3] : d[3]) : hoje.getFullYear();
        const inicio = new Date(ano, d[2] - 1, d[1], h[1], h[2] || 0);
        return [{ nome: arrumarTexto(pegar(l, col.evento)) || "Evento", inicio }];
      });
      atualizar();
    } catch {
      // planilha fora do ar: fica só com os cultos fixos
    }
  }

  function atualizar() {
    const culto = cultoAoVivo(new Date());
    barra.hidden = !culto;
    document.body.classList.toggle("com-aovivo", !!culto);
    if (!culto) return;
    const frase = `ESTAMOS AO VIVO · ${culto.nome} · Toque para assistir no YouTube`;
    barra.setAttribute("aria-label", frase);
    if (barra.dataset.frase === frase) return;
    barra.dataset.frase = frase;
    // o texto vai repetido: a animação anda metade da faixa e recomeça sem "pulo"
    faixa.replaceChildren();
    for (let i = 0; i < 8; i++) {
      const item = document.createElement("span");
      item.setAttribute("aria-hidden", "true");
      const ponto = document.createElement("i");
      ponto.className = "ponto";
      item.append(ponto, frase);
      faixa.append(item);
    }
  }

  atualizar();
  carregarEventosAoVivo();
  setInterval(atualizar, 60000); // confere a cada minuto (quem deixou a página aberta)
  setInterval(carregarEventosAoVivo, 15 * 60000); // e relê a planilha a cada 15 min
})();

// ---------------------------------------------------------------------------
// TEMA CLARO / ESCURO: botão no canto de cima. O escolhido fica salvo no aparelho.
// (Cada página também tem uma linha no <head> que aplica o tema salvo antes de desenhar, para não piscar.)
(function tema() {
  const CHAVE = "tema";
  const raiz = document.documentElement;
  const SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

  const estilo = document.createElement("style");
  estilo.textContent = `
    html[data-tema="claro"] {
      --fundo: #f4eee1; --fundo-2: #ffffff;
      --botao: #0f1a2b; --botao-texto: #f2ead8;
      --texto: #0f1a2b; --texto-suave: #4a5870;
      --destaque: #8a6629; /* dourado mais escuro, para ler bem no fundo claro */
      color-scheme: light;
    }
    html[data-tema="claro"] .btn.principal,
    html[data-tema="claro"] .banner .inscrever { background: #c9a463; color: #0f1a2b; }
    html[data-tema="claro"] .agenda li:not(.mes),
    html[data-tema="claro"] .cultos li { background: #fff; box-shadow: 0 1px 3px rgba(15,26,43,.06); }
    html[data-tema="claro"] .min img { box-shadow: 0 0 0 1px rgba(15,26,43,.12); }
    html[data-tema="claro"] .cultos .live,
    html[data-tema="claro"] .agenda .live { color: #c4160c; }
    .tema {
      position: absolute; z-index: 5; right: 14px; top: calc(env(safe-area-inset-top, 0px) + 12px);
      width: 40px; height: 40px; display: grid; place-items: center; padding: 0; cursor: pointer;
      border-radius: 50%; border: 1px solid rgba(201,164,99,.5); background: transparent; color: var(--texto);
    }
    .tema svg { width: 20px; height: 20px; }
    body.com-aovivo .tema { top: calc(env(safe-area-inset-top, 0px) + 58px); }
  `;
  document.head.append(estilo);

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "tema";
  document.body.append(botao);

  function aplicar(claro) {
    if (claro) raiz.dataset.tema = "claro"; else delete raiz.dataset.tema;
    botao.innerHTML = claro ? LUA : SOL;
    botao.setAttribute("aria-label", claro ? "Mudar para tema escuro" : "Mudar para tema claro");
    botao.title = botao.getAttribute("aria-label");
    botao.dataset.clique = claro ? "Tema: escuro" : "Tema: claro";
    const cor = document.querySelector('meta[name="theme-color"]');
    if (cor) cor.content = claro ? "#f4eee1" : "#0f1a2b";
  }

  aplicar(raiz.dataset.tema === "claro");
  botao.addEventListener("click", () => {
    const claro = raiz.dataset.tema !== "claro";
    aplicar(claro);
    try { localStorage.setItem(CHAVE, claro ? "claro" : "escuro"); } catch (e) {}
  });
})();

// ---------------------------------------------------------------------------
// CONTAGEM DE VISITAS E CLIQUES (GoatCounter: sem cookies, sem aviso de LGPD).
// Painel: https://curanossaterra.goatcounter.com
// Para contar o clique de um botão ou link, basta pôr nele: data-clique="Nome que aparece no painel".
// Não conta quando o site é aberto no próprio computador (só no endereço publicado).
(function contagem() {
  if (location.hostname !== "curanossaterra.github.io") return;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = "https://curanossaterra.goatcounter.com/count";
  document.head.append(script);

  document.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-clique]");
    // window.goatcounter só existe depois que o script carregou (e não existe se um bloqueador barrar)
    if (!alvo || !window.goatcounter || !window.goatcounter.count) return;
    window.goatcounter.count({ path: alvo.dataset.clique, title: alvo.dataset.clique, event: true });
  });
})();
