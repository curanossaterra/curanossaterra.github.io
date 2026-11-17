// PORTAL DA MÍDIA: ponte entre a página midia.html e as planilhas do Google.
// Este arquivo NÃO roda no GitHub: ele é colado em script.google.com (passo a passo em apps-script/LEIA-ME.md).
//
// O que ele guarda e onde:
//  - Banner dos eventos -> coluna "Banner" da planilha da agenda (a mesma que a Ariane alimenta).
//  - Equipe e Escala   -> uma planilha particular, "Portal da Mídia (dados)", criada sozinha no seu Drive.
//    Ela não é pública: os e-mails da equipe não aparecem para ninguém de fora.
//    Para criar uma função nova na escala, basta acrescentar uma coluna nela (antes de "Descanso").

// Código do cliente do "Fazer login com o Google" (Google Cloud). Não é segredo: pode ficar aqui.
const CLIENT_ID = "40038838902-r4jcn68bgja5bs7jb4q13ekur1s69kr3.apps.googleusercontent.com";
const AGENDA_ID = "1W-44JHBbi8hxsPrDh14T-W76qqavTwYkMUBf5EdHcVQ";
const FUSO = "America/Sao_Paulo";

// Usado só na primeira vez, para montar a planilha de dados.
const FUNCOES_INICIAIS = ["Live", "Staff Live / Luzes", "Foto / Vídeo / Postagem", "Telão", "Som"];
const EQUIPE_INICIAL = [
  ["Bia", "Live"],
  ["Ana", "Staff Live / Luzes"],
  ["Mel", "Foto / Vídeo / Postagem"],
  ["Jhow", "Telão"],
  ["Agno", "Som"],
];

// Rode esta função UMA vez pelo editor (botão "Executar"): ela pede as permissões e cria a planilha de dados.
function instalar() {
  const planilha = planilhaDeDados();
  Logger.log("Pronto! Planilha de dados: " + planilha.getUrl());
}

function doPost(e) {
  let resposta;
  try {
    const pedido = JSON.parse(e.postData.contents);
    const eu = quemEstaUsando(pedido.token);
    resposta = executar(pedido, eu);
  } catch (err) {
    resposta = { erro: err.message, codigo: err.codigo || "" };
  }
  return ContentService.createTextOutput(JSON.stringify(resposta)).setMimeType(ContentService.MimeType.JSON);
}

function executar(pedido, eu) {
  const exigirCoordenador = () => { if (!eu.coordenador) throw falha("Só a coordenação pode fazer isso."); };
  const trava = LockService.getScriptLock();
  if (pedido.acao !== "dados") trava.waitLock(20000);
  try {
    if (pedido.acao === "salvarBanner") salvarBanner(pedido);
    else if (pedido.acao === "salvarEscala") { exigirCoordenador(); salvarEscala(pedido, eu); }
    else if (pedido.acao === "salvarMembro") { exigirCoordenador(); salvarMembro(pedido); }
    else if (pedido.acao === "removerMembro") { exigirCoordenador(); removerMembro(pedido); }
    else if (pedido.acao !== "dados") throw falha("Ação desconhecida.");
  } finally {
    if (pedido.acao !== "dados") trava.releaseLock();
  }
  return tudo(eu);
}

// Tudo o que a página precisa, de uma vez. E-mails da equipe só vão para a coordenação.
function tudo(eu) {
  const equipe = lerEquipe().map((m) => eu.coordenador ? m : { nome: m.nome, funcoes: m.funcoes, coordenador: m.coordenador });
  const { funcoes, linhas } = lerEscala();
  const ontem = hojeISO(-1);
  return {
    eu: { nome: eu.nome, email: eu.email, funcoes: eu.funcoes, coordenador: eu.coordenador },
    funcoes,
    equipe,
    escala: linhas.filter((l) => l.data >= ontem),
    eventos: lerAgenda().eventos,
  };
}

// ---------------------------------------------------------------------------
// QUEM ESTÁ USANDO: confere o login do Google e procura o e-mail na equipe.
function quemEstaUsando(token) {
  if (!token) throw falha("Entre com sua conta Google.", "entrar");
  const cache = CacheService.getScriptCache();
  const chave = "t" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  let email = cache.get(chave);
  if (!email) {
    const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true });
    const info = JSON.parse(r.getContentText() || "{}");
    if (r.getResponseCode() !== 200 || info.aud !== CLIENT_ID || String(info.email_verified) !== "true") {
      throw falha("Sua entrada expirou. Entre de novo.", "entrar");
    }
    email = String(info.email).toLowerCase();
    const segundosRestantes = Math.floor(Number(info.exp) - Date.now() / 1000);
    if (segundosRestantes > 5) cache.put(chave, email, Math.min(600, segundosRestantes));
  }
  const dono = Session.getEffectiveUser().getEmail().toLowerCase();
  const membro = lerEquipe().find((m) => m.email === email);
  if (membro) return Object.assign({}, membro, { coordenador: membro.coordenador || email === dono });
  if (email === dono) return { email, nome: "Coordenação", funcoes: [], coordenador: true };
  throw falha(`O e-mail ${email} ainda não está na equipe da Mídia. Peça para a coordenação cadastrar você.`, "sem-acesso");
}

// ---------------------------------------------------------------------------
// AGENDA (planilha da Ariane): só lê os eventos e escreve na coluna Banner.
function abaDaAgenda() {
  return SpreadsheetApp.openById(AGENDA_ID).getSheets()[0];
}

function colunasDaAgenda(cabecalho) {
  const nomes = cabecalho.map(normalizar);
  const achar = (...chaves) => nomes.findIndex((n) => chaves.some((c) => n.includes(c)));
  const feito = nomes.findIndex((n) => n.includes("✓"));
  return {
    feito: feito >= 0 ? feito : achar("conclu"),
    data: achar("data", "dia"),
    hora: achar("hor"),
    evento: achar("evento"),
    ministerio: achar("minist"),
    banner: achar("banner"),
  };
}

function lerAgenda() {
  const aba = abaDaAgenda();
  const intervalo = aba.getDataRange();
  const textos = intervalo.getDisplayValues();
  const valores = intervalo.getValues();
  const col = colunasDaAgenda(textos[0]);
  if (col.evento < 0 || col.banner < 0) throw falha('A planilha da agenda precisa das colunas "Evento" e "Banner".');
  const hoje = hojeISO();
  const eventos = [];
  for (let i = 1; i < textos.length; i++) {
    const t = textos[i];
    const evento = t[col.evento].trim();
    if (!evento) continue;
    if (col.feito >= 0 && marcado(valores[i][col.feito])) continue;
    const data = col.data >= 0 ? lerData(t[col.data]) : "";
    if (data && data < hoje) continue;
    eventos.push({
      linha: i + 1,
      data,
      hora: col.hora >= 0 ? t[col.hora].trim() : "",
      evento,
      ministerio: col.ministerio >= 0 ? t[col.ministerio].trim() : "",
      banner: t[col.banner].trim(),
    });
  }
  return { aba, col, eventos };
}

function salvarBanner(pedido) {
  const link = String(pedido.link || "").trim();
  if (link && !/drive\.google\.com|docs\.google\.com|googleusercontent\.com/.test(link)) {
    throw falha("Use o link do arquivo no Google Drive.");
  }
  const aba = abaDaAgenda();
  const col = colunasDaAgenda(aba.getRange(1, 1, 1, aba.getLastColumn()).getDisplayValues()[0]);
  const linha = Number(pedido.linha);
  // confere se a linha ainda é o mesmo evento (a Ariane pode ter mexido na planilha nesse meio-tempo)
  const evento = linha > 1 ? aba.getRange(linha, col.evento + 1).getDisplayValue().trim() : "";
  if (!evento || evento !== String(pedido.evento || "").trim()) {
    throw falha("A agenda mudou enquanto você editava. Atualize a página e tente de novo.");
  }
  aba.getRange(linha, col.banner + 1).setValue(link);
}

// ---------------------------------------------------------------------------
// PLANILHA DE DADOS (particular): Equipe e Escala.
function planilhaDeDados() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("DADOS_ID");
  if (id) return SpreadsheetApp.openById(id);

  // A conta que instala (a da igreja) é sempre coordenação, mesmo sem estar na lista.
  // Os e-mails pessoais da equipe são preenchidos depois, pelo portal.
  const planilha = SpreadsheetApp.create("Portal da Mídia (dados)");
  const equipe = planilha.getSheets()[0].setName("Equipe");
  equipe.appendRow(["E-mail", "Nome", "Funções", "Coordenador"]);
  EQUIPE_INICIAL.forEach(([nome, funcao]) => equipe.appendRow(["", nome, funcao, nome === "Jhow" ? "Sim" : ""]));
  const escala = planilha.insertSheet("Escala");
  escala.getRange("A:A").setNumberFormat("@"); // data como texto (aaaa-mm-dd), sem o Sheets converter
  escala.appendRow(["Data", "Culto / Evento", ...FUNCOES_INICIAIS, "Descanso", "Atualizado por", "Atualizado em"]);
  [equipe, escala].forEach((aba) => aba.setFrozenRows(1));
  props.setProperty("DADOS_ID", planilha.getId());
  return planilha;
}

function lerEquipe() {
  const aba = planilhaDeDados().getSheetByName("Equipe");
  return aba.getDataRange().getDisplayValues().slice(1)
    .map((l, i) => ({
      linha: i + 2,
      email: l[0].trim().toLowerCase(),
      nome: l[1].trim(),
      funcoes: l[2].split(/[,;]/).map((f) => f.trim()).filter(Boolean),
      coordenador: marcado(l[3]),
    }))
    .filter((m) => m.nome);
}

function salvarMembro(pedido) {
  const nome = String(pedido.nome || "").trim();
  const email = String(pedido.email || "").trim().toLowerCase();
  if (!nome) throw falha("Escreva o nome.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw falha("E-mail inválido.");
  const aba = planilhaDeDados().getSheetByName("Equipe");
  const linha = Number(pedido.linha) || 0;
  const repetido = lerEquipe().find((m) => m.linha !== linha && ((email && m.email === email) || m.nome.toLowerCase() === nome.toLowerCase()));
  if (repetido) throw falha(`Já existe alguém com esse ${repetido.email === email ? "e-mail" : "nome"} na equipe.`);
  const valores = [[email, nome, (pedido.funcoes || []).join(", "), pedido.coordenador ? "Sim" : ""]];
  if (linha > 1) aba.getRange(linha, 1, 1, 4).setValues(valores);
  else aba.appendRow(valores[0]);
}

function removerMembro(pedido) {
  const aba = planilhaDeDados().getSheetByName("Equipe");
  const linha = Number(pedido.linha);
  if (linha < 2 || aba.getRange(linha, 2).getDisplayValue().trim() !== pedido.nome) {
    throw falha("A equipe mudou. Atualize a página e tente de novo.");
  }
  aba.deleteRow(linha);
}

function lerEscala() {
  const aba = planilhaDeDados().getSheetByName("Escala");
  const tabela = aba.getDataRange().getDisplayValues();
  const cabecalho = tabela[0].map((c) => c.trim());
  const fimFuncoes = cabecalho.findIndex((c) => normalizar(c) === "descanso");
  const funcoes = cabecalho.slice(2, fimFuncoes);
  const linhas = tabela.slice(1).map((l, i) => {
    const pessoas = {};
    funcoes.forEach((f, j) => { if (l[2 + j].trim()) pessoas[f] = l[2 + j].trim(); });
    return { linha: i + 2, data: l[0].trim(), nome: l[1].trim(), pessoas, descanso: l[fimFuncoes].trim() };
  }).filter((l) => l.data && l.nome);
  return { aba, funcoes, fimFuncoes, linhas };
}

function salvarEscala(pedido, eu) {
  const data = String(pedido.data || "");
  const nome = String(pedido.nome || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !nome) throw falha("Data ou culto inválido.");
  const { aba, funcoes, linhas } = lerEscala();
  const pessoas = pedido.pessoas || {};
  const quando = Utilities.formatDate(new Date(), FUSO, "dd/MM/yyyy HH:mm");
  const valores = [[data, nome, ...funcoes.map((f) => pessoas[f] || ""), String(pedido.descanso || "").trim(), eu.nome, quando]];
  const existente = linhas.find((l) => l.data === data && l.nome === nome);
  if (existente) aba.getRange(existente.linha, 1, 1, valores[0].length).setValues(valores);
  else aba.appendRow(valores[0]);
}

// ---------------------------------------------------------------------------
// AJUDANTES
function falha(mensagem, codigo) {
  const erro = new Error(mensagem);
  erro.codigo = codigo;
  return erro;
}

function normalizar(texto) {
  return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function marcado(valor) {
  return valor === true || /^(true|verdadeiro|sim|s|x|✓)$/i.test(String(valor).trim());
}

function hojeISO(somarDias) {
  const d = new Date(Date.now() + (somarDias || 0) * 86400000);
  return Utilities.formatDate(d, FUSO, "yyyy-MM-dd");
}

// "06/02/2027" ou "6/2" (sem ano: este ano, ou o próximo se já passou faz tempo) -> "2027-02-06"
function lerData(texto) {
  const m = String(texto).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return "";
  const hoje = hojeISO();
  let ano = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : Number(hoje.slice(0, 4));
  const montar = (a) => `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!m[3] && montar(ano) < hojeISO(-60)) ano++;
  return montar(ano);
}
