// VISITAS DO SITE: seção do Portal da Mídia (midia.html).
// Os números vêm do GoatCounter pelo Apps Script (ação "visitas"), que guarda a chave em segredo.
// Usa a função pedir() do midia.html para falar com o Apps Script.
const Visitas = (function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
  // a API pede data e hora completas, "redondas" na hora (ex.: 2026-11-02T03:00:00Z)
  const horaISO = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  let periodo = "7";
  let carregou = false;

  function intervalo(p) {
    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0); // meia-noite daqui
    if (p === "7") inicio.setDate(inicio.getDate() - 6);
    else if (p === "30") inicio.setDate(inicio.getDate() - 29);
    else if (p === "mes") inicio.setDate(1);
    else if (p === "ano") inicio.setMonth(0, 1);
    const fim = new Date(agora);
    fim.setMinutes(0, 0, 0);
    fim.setHours(fim.getHours() + 1); // até o fim da hora atual
    return { start: horaISO(inicio), end: horaISO(fim) };
  }

  // ---------- desenho ----------
  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function ranking(lista, itens, vazio) {
    const alvo = typeof lista === "string" ? $(lista) : lista;
    alvo.replaceChildren();
    if (!itens.length) { alvo.append(criar("p", "vazio", vazio)); return; }
    const max = Math.max(...itens.map((i) => i.valor), 1);
    const ul = criar("ul", "ranking");
    for (const i of itens) {
      const li = document.createElement("li");
      const trilho = criar("span", "trilho");
      const barra = document.createElement("i");
      barra.style.width = (i.valor / max) * 100 + "%";
      trilho.append(barra);
      li.append(criar("span", "nome", i.nome), criar("span", "valor", fmt(i.valor)), trilho);
      ul.append(li);
    }
    alvo.append(ul);
  }

  const SVG = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  // barras de visitas (por dia, ou por hora quando o período é "hoje")
  let ultimosPontos = [];
  // girou o celular ou mudou o tamanho da janela: redesenha na nova largura
  addEventListener("resize", () => { if (ultimosPontos.length && $("grafico").clientWidth) grafico(ultimosPontos); });

  function grafico(pontos) {
    ultimosPontos = pontos;
    const caixa = $("grafico");
    caixa.replaceChildren();
    // desenha na largura real da tela (assim as letras não ficam espremidas no celular)
    const W = Math.max(caixa.clientWidth, 280), H = 220, esq = 34, base = 196, topo = 12;
    const max = Math.max(...pontos.map((p) => p.valor), 1);
    // escala "redonda" para as linhas de grade
    const passo = Math.pow(10, Math.floor(Math.log10(max)));
    const teto = Math.ceil(max / passo) * passo || 1;
    const el = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": $("tituloGrafico").textContent });
    for (const f of [0, 0.5, 1]) {
      const y = base - (base - topo) * f;
      el.append(svg("line", { class: "grade", x1: esq, x2: W, y1: y, y2: y }));
      const t = svg("text", { class: "eixo", x: esq - 6, y: y + 4, "text-anchor": "end" });
      t.textContent = fmt(Math.round(teto * f));
      el.append(t);
    }
    const largura = (W - esq) / pontos.length;
    const gap = Math.min(largura * 0.25, 6);
    const dica = criar("div", "dica");
    dica.hidden = true;
    const rotuloCada = Math.ceil(pontos.length / Math.max(Math.floor(W / 60), 2)); // datas sem encavalar
    pontos.forEach((p, i) => {
      const x = esq + i * largura + gap / 2;
      const w = Math.max(largura - gap, 1);
      const h = p.valor ? Math.max(((base - topo) * p.valor) / teto, 2) : 0;
      // alvo invisível da altura toda: fácil de tocar mesmo em barra baixa
      const alvo = svg("rect", { class: "alvo", x: esq + i * largura, y: topo, width: largura, height: base - topo, tabindex: 0 });
      alvo.setAttribute("aria-label", `${p.rotulo}: ${fmt(p.valor)} visitas`);
      // barra com topo arredondado (4px) apoiada na base
      const r = Math.min(4, w / 2, h);
      const d = h ? `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + w - r} Q${x + w},${base - h} ${x + w},${base - h + r} V${base} Z` : "";
      const barra = svg("path", { class: "barra", d });
      const mostrar = () => {
        dica.replaceChildren(criar("strong", "", fmt(p.valor)), document.createTextNode(`visitas · ${p.rotulo}`));
        dica.style.left = Math.min(Math.max(x + w / 2, 70), W - 70) + "px";
        dica.style.top = (base - h - 6) + "px";
        dica.hidden = false;
      };
      const esconder = () => { dica.hidden = true; };
      alvo.addEventListener("pointerenter", mostrar);
      alvo.addEventListener("focus", mostrar);
      alvo.addEventListener("pointerleave", esconder);
      alvo.addEventListener("blur", esconder);
      el.append(alvo, barra);
      if (i % rotuloCada === 0) {
        const t = svg("text", { class: "eixo", x: x + w / 2, y: H - 6, "text-anchor": "middle" });
        t.textContent = p.curto;
        el.append(t);
      }
    });
    caixa.append(el, dica);
  }

  // ---------- dados ----------
  const APARELHOS = {
    phone: "Celular", largephone: "Celular", tablet: "Tablet",
    desktop: "Computador", desktophd: "Computador", unknown: "Não identificado",
  };
  const PAISES = { Brazil: "Brasil", Portugal: "Portugal", "United States": "Estados Unidos" };
  // origem como o GoatCounter manda -> nome conhecido ("ig" = link do Instagram)
  function nomeOrigem(nome) {
    const n = (nome || "").toLowerCase();
    if (!n) return "Direto (link salvo, digitado ou app)";
    if (/^(ig|instagram)$|instagram\./.test(n)) return "Instagram";
    if (/^(fb|facebook)$|facebook\.|fb\.me/.test(n)) return "Facebook";
    if (/^(wa|whatsapp)$|whatsapp|wa\.me/.test(n)) return "WhatsApp";
    if (/youtube|youtu\.be/.test(n)) return "YouTube";
    if (/google/.test(n)) return "Google";
    return nome;
  }
  // grupos de cliques, pelo começo do nome (data-clique no site)
  const GRUPOS = [
    { titulo: "Página principal", teste: (n) => /^(Botão|Barra ao vivo)/.test(n) },
    { titulo: "Ofertas (PIX)", teste: (n) => n.startsWith("Oferta:") },
    { titulo: "Redes sociais", teste: (n) => n.startsWith("Rede:") },
    { titulo: "Ministérios", teste: (n) => n.startsWith("Ministério:") },
    { titulo: "Tema claro/escuro", teste: (n) => n.startsWith("Tema:") },
    { titulo: "Agenda", teste: () => true },
  ];

  async function carregar() {
    carregou = true;
    $("visitasConteudo").classList.add("carregando");
    $("erroVisitas").textContent = "";
    try {
      const { total, hits, origens, aparelhos, locais } = await pedir("visitas", intervalo(periodo));

      // números do topo
      const paginas = (hits.hits || []).filter((h) => !h.event);
      const eventos = (hits.hits || []).filter((h) => h.event);
      const somar = (lista) => lista.reduce((s, h) => s + (h.count || 0), 0);
      $("nVisitas").textContent = fmt(total.total);
      $("nPrincipal").textContent = fmt(somar(paginas.filter((h) => h.path === "/" || h.path === "/index.html")));
      $("nAgenda").textContent = fmt(somar(paginas.filter((h) => h.path.startsWith("/agenda"))));
      $("nCliques").textContent = fmt(total.total_events ?? somar(eventos));

      // gráfico
      const dias = total.stats || [];
      let pontos;
      if (periodo === "hoje") {
        $("tituloGrafico").textContent = "Visitas por hora (hoje)";
        const horas = (dias[dias.length - 1] || {}).hourly || new Array(24).fill(0);
        pontos = horas.map((v, h) => ({ valor: v, rotulo: `${h}h às ${h + 1}h`, curto: `${h}h` }));
      } else {
        $("tituloGrafico").textContent = "Visitas por dia";
        pontos = dias.map((d) => {
          const [a, m, dd] = d.day.split("-");
          return { valor: d.daily, rotulo: `${dd}/${m}/${a}`, curto: `${dd}/${m}` };
        });
      }
      grafico(pontos);

      // cliques agrupados
      const caixa = $("cliques");
      caixa.replaceChildren();
      if (!eventos.length) caixa.append(criar("p", "vazio", "Nenhum clique registrado neste período."));
      const restantes = eventos.map((e) => ({ nome: e.path, valor: e.count })).sort((a, b) => b.valor - a.valor);
      for (const g of GRUPOS) {
        const doGrupo = restantes.filter((e) => !e.usado && g.teste(e.nome));
        doGrupo.forEach((e) => { e.usado = true; });
        if (!doGrupo.length) continue;
        caixa.append(criar("p", "grupo", g.titulo));
        // nome sem o prefixo repetido ("Botão: Agenda" -> "Agenda")
        const lista = document.createElement("div");
        caixa.append(lista);
        ranking(lista, doGrupo.map((e) => ({ nome: e.nome.replace(/^(Botão|Rede|Ministério|Oferta|Tema): /, ""), valor: e.valor })), "");
      }

      ranking("origens", (origens.stats || []).filter((o) => o.count > 0).map((o) => ({ nome: nomeOrigem(o.name), valor: o.count })),
        "Ainda sem dados neste período.");

      const porAparelho = {};
      for (const s of (aparelhos.stats || []).filter((s) => s.count > 0)) {
        const nome = APARELHOS[s.id] || s.name || "Outro";
        porAparelho[nome] = (porAparelho[nome] || 0) + s.count;
      }
      ranking("aparelhos", Object.entries(porAparelho).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
        "Ainda sem dados neste período.");

      ranking("locais", (locais.stats || []).filter((l) => l.count > 0).map((l) => ({ nome: PAISES[l.name] || l.name || "Não identificado", valor: l.count })),
        "Sem dados. Para ver cidades, ligue a coleta de local em Settings no GoatCounter.");
    } catch (erro) {
      carregou = false; // tenta de novo na próxima vez que abrir a seção
      $("erroVisitas").textContent = erro.message;
    } finally {
      $("visitasConteudo").classList.remove("carregando");
    }
  }

  function marcarPeriodo() {
    document.querySelectorAll("[data-periodo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.periodo === periodo));
  }

  document.querySelectorAll("[data-periodo]").forEach((b) => b.addEventListener("click", () => {
    periodo = b.dataset.periodo;
    marcarPeriodo();
    carregar();
  }));
  marcarPeriodo();

  return {
    // chamado quando a seção aparece: busca só na primeira vez (o botão Atualizar busca de novo)
    abrir() {
      if (!carregou) carregar();
      else if (ultimosPontos.length) grafico(ultimosPontos); // a seção estava escondida: redesenha na largura certa
    },
    carregar,
  };
})();
