// PORTAL DA MÍDIA: ponte entre a página midia.html e as planilhas do Google.
// Este arquivo NÃO roda no GitHub: ele é colado em script.google.com (passo a passo em apps-script/LEIA-ME.md).
//
// O que ele guarda e onde:
//  - Banner dos eventos -> coluna "Banner" da planilha da agenda (a mesma que a Ariane alimenta).
//    A imagem enviada pelo portal fica na pasta de banners do Drive (PASTA_BANNERS).
//  - Equipe, Escala, Disponibilidade e Tarefas -> uma planilha particular, "Portal da Mídia (dados)", criada sozinha no seu Drive.
//    Ela não é pública: os e-mails da equipe não aparecem para ninguém de fora.
//    Para criar uma função nova na escala, basta acrescentar uma coluna nela (antes de "Descanso").

// Código do cliente do "Fazer login com o Google" (Google Cloud). Não é segredo: pode ficar aqui.
const CLIENT_ID = "40038838902-r4jcn68bgja5bs7jb4q13ekur1s69kr3.apps.googleusercontent.com";
const AGENDA_ID = "1W-44JHBbi8hxsPrDh14T-W76qqavTwYkMUBf5EdHcVQ";
const FUSO = "America/Sao_Paulo";
const PASTA_BANNERS = "1DaQeI7zVccO5z1eIeX5PmqsRyU8najSt";

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
// Rode de novo sempre que o código pedir uma permissão nova (ex.: a do Drive, para enviar banners).
function instalar() {
  const planilha = planilhaDeDados();
  Logger.log("Pronto! Planilha de dados: " + planilha.getUrl());
  Logger.log("Pasta de banners: " + DriveApp.getFolderById(PASTA_BANNERS).getName());
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
  const exigirCoordenador = () => { if (!eu.coordenador) throw falha("Só o líder pode fazer isso."); };
  const trava = LockService.getScriptLock();
  if (pedido.acao !== "dados") trava.waitLock(20000);
  try {
    if (pedido.acao === "salvarBanner") salvarBanner(pedido);
    else if (pedido.acao === "enviarBanner") enviarBanner(pedido);
    else if (pedido.acao === "salvarEscala") { exigirCoordenador(); salvarEscala(pedido, eu); }
    else if (pedido.acao === "salvarMembro") { exigirCoordenador(); salvarMembro(pedido); }
    else if (pedido.acao === "removerMembro") { exigirCoordenador(); removerMembro(pedido); }
    else if (pedido.acao === "marcarPresenca") marcarPresenca(pedido, eu);
    else if (pedido.acao === "salvarTarefa") { exigirCoordenador(); salvarTarefa(pedido, eu); }
    else if (pedido.acao === "concluirTarefa") concluirTarefa(pedido, eu);
    else if (pedido.acao === "removerTarefa") { exigirCoordenador(); removerTarefa(pedido); }
    else if (pedido.acao !== "dados") throw falha("Ação desconhecida.");
  } finally {
    if (pedido.acao !== "dados") trava.releaseLock();
  }
  return tudo(eu);
}

// Tudo o que a página precisa, de uma vez. E-mails da equipe só vão para o líder.
function tudo(eu) {
  const equipe = lerEquipe().map((m) => eu.coordenador ? m : { nome: m.nome, funcoes: m.funcoes, coordenador: m.coordenador });
  const { funcoes, linhas } = lerEscala();
  const ontem = hojeISO(-1);
  const umMesAtras = hojeISO(-30);
  return {
    eu: { nome: eu.nome, email: eu.email, funcoes: eu.funcoes, coordenador: eu.coordenador },
    funcoes,
    equipe,
    escala: linhas.filter((l) => l.data >= ontem),
    disponibilidade: lerDisponibilidade().linhas.filter((l) => l.data >= ontem)
      .map((l) => ({ data: l.data, ocasiao: l.ocasiao, nome: l.nome, resposta: l.resposta })),
    // o líder vê todas; cada pessoa só as dela. Feitas somem depois de 30 dias.
    tarefas: lerTarefas().linhas
      .filter((t) => (eu.coordenador || mesmoNome(t.para, eu.nome)) && (!t.feitaEm || t.feitaEm >= umMesAtras))
      .map((t) => ({ id: t.id, para: t.para, tarefa: t.tarefa, prazo: t.prazo, ocasiao: t.ocasiao, criadaPor: t.criadaPor, feitaEm: t.feitaEm })),
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
  if (email === dono) return { email, nome: "Líder", funcoes: [], coordenador: true };
  throw falha(`O e-mail ${email} ainda não está na equipe da Mídia. Peça para o líder cadastrar você.`, "sem-acesso");
}

// ---------------------------------------------------------------------------
// AGENDA (planilha da Ariane): só lê os eventos e escreve na coluna Banner.
function abaDaAgenda() {
  return SpreadsheetApp.openById(AGENDA_ID).getSheets()[0];
}

// Os títulos não ficam necessariamente na linha 1 (hoje a linha 1 tem só o contador "9/17 concluído").
// Procura a primeira linha com "Evento" e "Banner"; o título de cada coluna junta essa linha e as de cima.
function colunasDaAgenda(textos) {
  const cabecalho = textos.slice(0, 10).findIndex((l) => {
    const n = l.map(normalizar);
    return n.some((c) => c.includes("evento")) && n.some((c) => c.includes("banner"));
  });
  if (cabecalho < 0) throw falha('A planilha da agenda precisa das colunas "Evento" e "Banner".');
  const nomes = textos[0].map((_, j) => normalizar(textos.slice(0, cabecalho + 1).map((l) => l[j]).join(" ")));
  const achar = (...chaves) => nomes.findIndex((n) => chaves.some((c) => n.includes(c)));
  const feito = nomes.findIndex((n) => n.includes("✓"));
  return {
    cabecalho, // índice da linha dos títulos (0 = linha 1)
    feito: feito >= 0 ? feito : nomes.findIndex((n) => n.includes("conclu") && !n.includes("evento")),
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
  const col = colunasDaAgenda(textos);
  const hoje = hojeISO();
  const eventos = [];
  for (let i = col.cabecalho + 1; i < textos.length; i++) {
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

// A célula Banner do evento pedido. Confere se a linha ainda é o mesmo evento
// (a Ariane pode ter mexido na planilha enquanto a Mídia editava).
function celulaDoBanner(pedido) {
  const aba = abaDaAgenda();
  const col = colunasDaAgenda(aba.getRange(1, 1, Math.min(10, aba.getLastRow()), aba.getLastColumn()).getDisplayValues());
  const linha = Number(pedido.linha);
  const evento = linha > col.cabecalho + 1 ? aba.getRange(linha, col.evento + 1).getDisplayValue().trim() : "";
  if (!evento || evento !== String(pedido.evento || "").trim()) {
    throw falha("A agenda mudou enquanto você editava. Atualize a página e tente de novo.");
  }
  return aba.getRange(linha, col.banner + 1);
}

function salvarBanner(pedido) {
  const link = String(pedido.link || "").trim();
  if (link && !/drive\.google\.com|docs\.google\.com|googleusercontent\.com/.test(link)) {
    throw falha("Use o link do arquivo no Google Drive.");
  }
  celulaDoBanner(pedido).setValue(link);
}

// Recebe a imagem (JPG já diminuído pela página), salva na pasta de banners,
// libera "Qualquer pessoa com o link" e coloca o link na coluna Banner.
function enviarBanner(pedido) {
  const celula = celulaDoBanner(pedido); // confere antes de criar o arquivo
  const bytes = Utilities.base64Decode(String(pedido.base64 || ""));
  if (!bytes.length) throw falha("A imagem chegou vazia. Tente de novo.");
  if (bytes.length > 8 * 1024 * 1024) throw falha("Imagem grande demais.");
  const nome = `${pedido.data || "sem data"} - ${String(pedido.evento).trim()}`.replace(/[\/:*?"<>|]/g, "-") + ".jpg";
  const arquivo = DriveApp.getFolderById(PASTA_BANNERS).createFile(Utilities.newBlob(bytes, "image/jpeg", nome));
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  celula.setValue(`https://drive.google.com/file/d/${arquivo.getId()}/view`);
}

// ---------------------------------------------------------------------------
// PLANILHA DE DADOS (particular): Equipe e Escala.
function planilhaDeDados() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("DADOS_ID");
  if (id) return SpreadsheetApp.openById(id);

  // A conta que instala (a da igreja) é sempre líder, mesmo sem estar na lista.
  // Os e-mails pessoais da equipe são preenchidos depois, pelo portal.
  const planilha = SpreadsheetApp.create("Portal da Mídia (dados)");
  const equipe = planilha.getSheets()[0].setName("Equipe");
  equipe.appendRow(["E-mail", "Nome", "Funções", "Líder"]);
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
// DISPONIBILIDADE: cada pessoa diz se vai estar. Só informa o líder; não impede escalar.
function lerDisponibilidade() {
  const aba = abaDeDados("Disponibilidade", ["Data", "Culto / Evento", "Nome", "Resposta", "Atualizado em"]);
  const linhas = aba.getDataRange().getDisplayValues().slice(1)
    .map((l, i) => ({ linha: i + 2, data: l[0].trim(), ocasiao: l[1].trim(), nome: l[2].trim(), resposta: normalizar(l[3]) }))
    .filter((l) => l.data && l.nome);
  return { aba, linhas };
}

function marcarPresenca(pedido, eu) {
  const data = String(pedido.data || "");
  const ocasiao = String(pedido.ocasiao || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !ocasiao) throw falha("Data ou culto inválido.");
  const resposta = { sim: "Sim", nao: "Não" }[pedido.resposta] || ""; // vazio = apagar a resposta
  const { aba, linhas } = lerDisponibilidade();
  const existente = linhas.find((l) => l.data === data && l.ocasiao === ocasiao && mesmoNome(l.nome, eu.nome));
  const valores = [data, ocasiao, eu.nome, resposta, agora()];
  if (existente && resposta) aba.getRange(existente.linha, 1, 1, valores.length).setValues([valores]);
  else if (existente) aba.deleteRow(existente.linha);
  else if (resposta) aba.appendRow(valores);
}

// ---------------------------------------------------------------------------
// TAREFAS: o líder cria (com prazo: um culto/evento ou uma data); a pessoa marca como feita.
function lerTarefas() {
  const aba = abaDeDados("Tarefas", ["ID", "Para", "Tarefa", "Prazo", "Culto / Evento", "Criada por", "Criada em", "Feita em"]);
  const linhas = aba.getDataRange().getDisplayValues().slice(1)
    .map((l, i) => ({
      linha: i + 2, id: l[0].trim(), para: l[1].trim(), tarefa: l[2].trim(), prazo: l[3].trim(),
      ocasiao: l[4].trim(), criadaPor: l[5].trim(), feitaEm: l[7].trim(),
    }))
    .filter((t) => t.id && t.tarefa);
  return { aba, linhas };
}

function salvarTarefa(pedido, eu) {
  const para = String(pedido.para || "").trim();
  const tarefa = String(pedido.tarefa || "").trim();
  const prazo = String(pedido.prazo || "");
  if (!tarefa) throw falha("Escreva a tarefa.");
  if (!lerEquipe().some((m) => mesmoNome(m.nome, para))) throw falha("Escolha uma pessoa da equipe.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) throw falha("Escolha para quando é a tarefa.");
  const ocasiao = String(pedido.ocasiao || "").trim();
  lerTarefas().aba.appendRow([Utilities.getUuid().slice(0, 8), para, tarefa, prazo, ocasiao, eu.nome, agora(), ""]);
}

function acharTarefa(pedido) {
  const dados = lerTarefas();
  const tarefa = dados.linhas.find((t) => t.id === pedido.id);
  if (!tarefa) throw falha("Essa tarefa não existe mais. Atualize a página.");
  return { aba: dados.aba, tarefa };
}

function concluirTarefa(pedido, eu) {
  const { aba, tarefa } = acharTarefa(pedido);
  if (!eu.coordenador && !mesmoNome(tarefa.para, eu.nome)) throw falha("Essa tarefa é de outra pessoa.");
  aba.getRange(tarefa.linha, 8).setValue(pedido.feita ? agora() : ""); // coluna "Feita em"
}

function removerTarefa(pedido) {
  const { aba, tarefa } = acharTarefa(pedido);
  aba.deleteRow(tarefa.linha);
}

// ---------------------------------------------------------------------------
// AJUDANTES

// Abas que nasceram depois da planilha de dados: são criadas na primeira vez que alguém usa.
// Tudo como texto, para o Sheets não transformar datas e horários.
function abaDeDados(nome, cabecalho) {
  const planilha = planilhaDeDados();
  let aba = planilha.getSheetByName(nome);
  if (!aba) {
    aba = planilha.insertSheet(nome);
    aba.getRange(1, 1, aba.getMaxRows(), cabecalho.length).setNumberFormat("@");
    aba.appendRow(cabecalho);
    aba.setFrozenRows(1);
  }
  return aba;
}

// "2026-11-22 18:30": dá para ordenar e comparar como texto
function agora() {
  return Utilities.formatDate(new Date(), FUSO, "yyyy-MM-dd HH:mm");
}

function mesmoNome(a, b) {
  return !!a && normalizar(a) === normalizar(b || "");
}

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
