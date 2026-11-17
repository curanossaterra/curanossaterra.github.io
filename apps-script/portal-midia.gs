// PORTAL DA MÍDIA: ponte entre a página midia.html e as planilhas do Google.
// Este arquivo NÃO roda no GitHub: ele é colado em script.google.com (passo a passo em apps-script/LEIA-ME.md).
//
// O que ele guarda e onde:
//  - Banner dos eventos -> coluna "Banner" da planilha da agenda (a mesma que a Ariane alimenta).
//    A imagem enviada pelo portal fica na pasta de banners do Drive (PASTA_BANNERS).
//  - Equipe, Escala, Disponibilidade e Tarefas -> uma planilha particular, "Portal da Mídia (dados)", criada sozinha no seu Drive.
//    Ela não é pública: os e-mails da equipe não aparecem para ninguém de fora.
//    Para criar uma função nova na escala, basta acrescentar uma coluna nela (antes de "Descanso").
//  - Visitas do site    -> busca no GoatCounter com a chave GOATCOUNTER_CHAVE (abaixo).

// Código do cliente do "Fazer login com o Google" (Google Cloud). Não é segredo: pode ficar aqui.
const CLIENT_ID = "40038838902-r4jcn68bgja5bs7jb4q13ekur1s69kr3.apps.googleusercontent.com";
const AGENDA_ID = "1W-44JHBbi8hxsPrDh14T-W76qqavTwYkMUBf5EdHcVQ";
const FUSO = "America/Sao_Paulo";
const PASTA_BANNERS = "1DaQeI7zVccO5z1eIeX5PmqsRyU8najSt";
// Chave do GoatCounter (só "Ler estatísticas"). Atenção: este arquivo é público no GitHub, então quem
// achar a chave consegue ver os números de visitas. Para escondê-la, crie a propriedade GOATCOUNTER_CHAVE em
// Configurações do projeto → Propriedades do script: ela vale mais que esta linha.
const GOATCOUNTER_CHAVE = "hszivhndae8x23l8u0ysh6d0m1fv405l8nj6wi165ai3njsdgq";

// Usado só na primeira vez, para montar a planilha de dados.
// Uma função repetida = duas vagas na escala (ex.: duas pessoas na Foto / Vídeo / Postagem).
const FUNCOES_INICIAIS = ["Live", "Staff Live / Luzes", "Foto / Vídeo / Postagem", "Foto / Vídeo / Postagem", "Telão / Luzes", "Som"];
const EQUIPE_INICIAL = [
  ["Bia", "Live"],
  ["Ana", "Staff Live / Luzes"],
  ["Mel", "Foto / Vídeo / Postagem"],
  ["Jhow", "Telão / Luzes"],
  ["Agno", "Som"],
];

// Rode esta função UMA vez pelo editor (botão "Executar"): ela pede as permissões e cria a planilha de dados.
// Rode de novo sempre que o código pedir uma permissão nova (ex.: a do Drive, para enviar banners).
function instalar() {
  const planilha = planilhaDeDados();
  Logger.log("Pronto! Planilha de dados: " + planilha.getUrl());
  ajustarFuncoes();
  const pasta = DriveApp.getFolderById(PASTA_BANNERS);
  Logger.log("Pasta de banners: " + pasta.getName());
  // teste de envio: cria um arquivinho na pasta, tenta liberar o link e joga na lixeira
  const teste = pasta.createFile("teste do portal.txt", "pode apagar");
  Logger.log("Envio de banners: OK");
  try {
    liberarLink(teste);
    Logger.log("Liberar link: OK");
  } catch (e) {
    Logger.log("Liberar link: o Google não deixou (" + e.message + "). Sem problema se a pasta de banners já estiver como \"Qualquer pessoa com o link\".");
  }
  teste.setTrashed(true);
}

function doPost(e) {
  let resposta;
  try {
    const pedido = JSON.parse(e.postData.contents);
    const eu = quemEstaUsando(pedido.token);
    if (pedido.acao === "ping") resposta = { ok: true }; // só registra o acesso (feito em quemEstaUsando)
    else if (pedido.acao === "visitas") resposta = visitas(pedido);
    else if (/^(cofre|salvarSenha|removerSenha)$/.test(pedido.acao)) resposta = cofre(pedido, eu);
    else resposta = executar(pedido, eu);
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
    if (pedido.acao === "salvarBanner") salvarBanner(pedido, eu);
    else if (pedido.acao === "enviarBanner") enviarBanner(pedido, eu);
    else if (pedido.acao === "excluirBanner") excluirBanner(pedido, eu);
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
  const hoje = hojeISO();
  const umMesAtras = hojeISO(-30);
  return {
    eu: { nome: eu.nome, email: eu.email, funcoes: eu.funcoes, coordenador: eu.coordenador },
    funcoes,
    equipe,
    escala: linhas.filter((l) => l.data >= ontem),
    // as 4 últimas escalas que já aconteceram, da mais recente para a mais antiga (para o rodízio)
    historico: linhas.filter((l) => l.data < hoje).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 4),
    disponibilidade: lerDisponibilidade().linhas.filter((l) => l.data >= ontem)
      .map((l) => ({ data: l.data, ocasiao: l.ocasiao, nome: l.nome, resposta: l.resposta })),
    // o líder vê todas; cada pessoa só as dela. Feitas somem depois de 30 dias.
    tarefas: lerTarefas().linhas
      .filter((t) => (eu.coordenador || mesmoNome(t.para, eu.nome)) && (!t.feitaEm || t.feitaEm >= umMesAtras))
      .map((t) => ({ id: t.id, para: t.para, tarefa: t.tarefa, prazo: t.prazo, ocasiao: t.ocasiao, criadaPor: t.criadaPor, feitaEm: t.feitaEm })),
    eventos: comQuemEnviou(lerAgenda().eventos),
  };
}

// ---------------------------------------------------------------------------
// QUEM ESTÁ USANDO: confere o login do Google e procura o e-mail na equipe.
function quemEstaUsando(token) {
  if (!token) throw falha("Entre com sua conta Google.", "entrar");
  const cache = CacheService.getScriptCache();
  const chave = "t" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  // guarda e-mail e nome da conta Google por alguns minutos, para não consultar o Google a cada clique
  let email, nomeGoogle;
  try { ({ email, nomeGoogle } = JSON.parse(cache.get(chave)) || {}); } catch (e) {} // formato antigo: consulta de novo
  if (!email) {
    const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true });
    const info = JSON.parse(r.getContentText() || "{}");
    if (r.getResponseCode() !== 200 || info.aud !== CLIENT_ID || String(info.email_verified) !== "true") {
      throw falha("Sua entrada expirou. Entre de novo.", "entrar");
    }
    email = String(info.email).toLowerCase();
    nomeGoogle = info.given_name || info.name || "";
    const segundosRestantes = Math.floor(Number(info.exp) - Date.now() / 1000);
    if (segundosRestantes > 5) cache.put(chave, JSON.stringify({ email, nomeGoogle }), Math.min(600, segundosRestantes));
  }
  const dono = Session.getEffectiveUser().getEmail().toLowerCase();
  const membro = lerEquipe().find((m) => m.email === email);
  if (membro) {
    registrarAcesso(membro);
    return Object.assign({}, membro, { coordenador: membro.coordenador || email === dono });
  }
  // a conta da igreja, fora da lista da equipe: usa o nome da conta Google
  if (email === dono) return { email, nome: nomeGoogle || "Líder", funcoes: [], coordenador: true };
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

function salvarBanner(pedido, eu) {
  const link = String(pedido.link || "").trim();
  if (link && !/drive\.google\.com|docs\.google\.com|googleusercontent\.com/.test(link)) {
    throw falha("Use o link do arquivo no Google Drive.");
  }
  celulaDoBanner(pedido).setValue(link);
  if (link) registrarBanner(link, pedido, eu, "link");
}

// Recebe a imagem (o arquivo original, ou JPG de alta qualidade quando a página precisou converter),
// salva na pasta de banners, libera "Qualquer pessoa com o link" e coloca o link na coluna Banner.
const TIPOS_DE_IMAGEM = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function enviarBanner(pedido, eu) {
  const celula = celulaDoBanner(pedido); // confere antes de criar o arquivo
  const tipo = TIPOS_DE_IMAGEM[pedido.tipo] ? pedido.tipo : "image/jpeg";
  const bytes = Utilities.base64Decode(String(pedido.base64 || ""));
  if (!bytes.length) throw falha("A imagem chegou vazia. Tente de novo.");
  if (bytes.length > 12 * 1024 * 1024) throw falha("Imagem grande demais (máximo 12 MB).");
  const nome = `${pedido.data || "sem data"} - ${String(pedido.evento).trim()}`.replace(/[\/:*?"<>|]/g, "-") + "." + TIPOS_DE_IMAGEM[tipo];
  let arquivo;
  try {
    arquivo = DriveApp.getFolderById(PASTA_BANNERS).createFile(Utilities.newBlob(bytes, tipo, nome));
  } catch (e) {
    throw falha("Não consegui salvar a imagem na pasta de banners do Drive (" + e.message + "). Avise o líder.");
  }
  // o arquivo herda o compartilhamento da pasta; se o Google não deixar mudar aqui, segue assim mesmo
  try { liberarLink(arquivo); } catch (e) { console.warn("Liberar link: " + e.message); }
  const link = `https://drive.google.com/file/d/${arquivo.getId()}/view`;
  celula.setValue(link);
  registrarBanner(link, pedido, eu, "enviado");
}

// ---------------------------------------------------------------------------
// QUEM ENVIOU CADA BANNER: fica na planilha particular (aba "Banners"), não na da Ariane.
function lerBanners() {
  const aba = abaDeDados("Banners", ["Arquivo", "Evento", "Data", "Enviado por", "Enviado em", "Como"]);
  const linhas = aba.getDataRange().getDisplayValues().slice(1)
    .map((l) => ({ arquivo: l[0].trim(), evento: l[1].trim(), enviadoPor: l[3].trim(), enviadoEm: l[4].trim(), como: l[5].trim() }))
    .filter((b) => b.arquivo);
  return { aba, linhas };
}

function registrarBanner(link, pedido, eu, como) {
  const arquivo = idDoDrive(link);
  if (!arquivo) return;
  lerBanners().aba.appendRow([arquivo, String(pedido.evento || "").trim(), pedido.data || "", eu.nome, agora(), como]);
}

// o registro mais novo de cada arquivo
function registroDoBanner(banners, link) {
  const arquivo = idDoDrive(link);
  return arquivo ? banners.filter((b) => b.arquivo === arquivo).pop() : undefined;
}

function comQuemEnviou(eventos) {
  const banners = lerBanners().linhas;
  return eventos.map((e) => {
    const r = e.banner ? registroDoBanner(banners, e.banner) : undefined;
    return r ? Object.assign({}, e, { enviadoPor: r.enviadoPor, enviadoEm: r.enviadoEm }) : e;
  });
}

// Tira o banner do evento (a coluna Banner fica vazia e o evento volta a ser pendência).
// Pode excluir: o líder, ou quem enviou. Se a imagem foi enviada pelo portal, ela vai para a lixeira do Drive.
function excluirBanner(pedido, eu) {
  const celula = celulaDoBanner(pedido);
  const atual = celula.getDisplayValue().trim();
  if (!atual) return;
  if (atual !== String(pedido.banner || "").trim()) throw falha("O banner mudou enquanto você olhava. Atualize a página.");
  const registro = registroDoBanner(lerBanners().linhas, atual);
  if (!eu.coordenador && !(registro && mesmoNome(registro.enviadoPor, eu.nome))) {
    throw falha("Só o líder ou quem enviou pode excluir este banner.");
  }
  celula.setValue("");
  if (registro && registro.como === "enviado") {
    try { DriveApp.getFileById(registro.arquivo).setTrashed(true); } catch (e) { console.warn("Lixeira: " + e.message); }
  }
}

function idDoDrive(texto) {
  const m = String(texto).match(/drive\.google\.com\/.*(?:\/d\/|[?&]id=)([\w-]{20,})/);
  return m ? m[1] : "";
}

// "Qualquer pessoa com o link" pode ver (para a imagem aparecer no site). Não mexe se já estiver assim.
function liberarLink(arquivo) {
  if (arquivo.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK) return;
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}

// Ajuste das funções (roda pelo instalar; pode rodar de novo sem problema):
//  - "Telão" passa a ser "Telão / Luzes" (na escala e na equipe);
//  - "Foto / Vídeo / Postagem" ganha uma segunda vaga (uma coluna a mais, logo ao lado).
function ajustarFuncoes() {
  const planilha = planilhaDeDados();
  const escala = planilha.getSheetByName("Escala");
  const cabecalho = escala.getRange(1, 1, 1, escala.getLastColumn()).getDisplayValues()[0];
  const telao = cabecalho.findIndex((c) => normalizar(c) === "telao");
  if (telao >= 0) escala.getRange(1, telao + 1).setValue("Telão / Luzes");
  const fotos = cabecalho.map((c, i) => (normalizar(c) === normalizar("Foto / Vídeo / Postagem") ? i : -1)).filter((i) => i >= 0);
  if (fotos.length === 1) {
    escala.insertColumnAfter(fotos[0] + 1);
    escala.getRange(1, fotos[0] + 2).setValue("Foto / Vídeo / Postagem");
  }
  const equipe = planilha.getSheetByName("Equipe");
  if (equipe.getLastRow() > 1) {
    const funcoes = equipe.getRange(2, 3, equipe.getLastRow() - 1, 1);
    funcoes.setValues(funcoes.getDisplayValues().map(([texto]) => [
      texto.split(/[,;]/).map((f) => f.trim()).filter(Boolean).map((f) => (normalizar(f) === "telao" ? "Telão / Luzes" : f)).join(", "),
    ]));
  }
  Logger.log("Funções da escala: " + lerEscala().funcoes.join(" | "));
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
      ultimoAcesso: (l[4] || "").trim(),
    }))
    .filter((m) => m.nome);
}

// Último acesso de cada pessoa (coluna E da aba Equipe), para o líder saber quem está usando o portal.
// Grava no máximo a cada 2 minutos por pessoa, para não escrever na planilha a cada clique.
function registrarAcesso(membro) {
  const cache = CacheService.getScriptCache();
  const chave = "visto:" + membro.email;
  if (cache.get(chave)) return;
  const aba = planilhaDeDados().getSheetByName("Equipe");
  if (!aba.getRange(1, 5).getDisplayValue()) aba.getRange(1, 5).setValue("Último acesso");
  aba.getRange(membro.linha, 5).setNumberFormat("@").setValue(agora());
  cache.put(chave, "1", 120);
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
  // função repetida = mais uma vaga; a segunda vira "Nome (2)", para cada vaga ter a sua pessoa
  const vistas = {};
  const funcoes = cabecalho.slice(2, fimFuncoes).map((c) => {
    vistas[c] = (vistas[c] || 0) + 1;
    return vistas[c] > 1 ? `${c} (${vistas[c]})` : c;
  });
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) throw falha("Escolha o prazo da tarefa.");
  const ocasiao = String(pedido.ocasiao || "").trim();
  if (pedido.id) { // editar: troca para quem, o quê, prazo e evento; mantém quem criou e se já foi feita
    const { aba, tarefa: existente } = acharTarefa(pedido);
    aba.getRange(existente.linha, 2, 1, 4).setValues([[para, tarefa, prazo, ocasiao]]);
    return;
  }
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
// COFRE DE SENHAS: usuário e senha das redes sociais e demais acessos (aba "Cofre" da planilha particular).
// As senhas NÃO vão junto com o resto dos dados: só quando a pessoa abre o cofre.
// O líder cadastra, edita e remove; em cada acesso escolhe se toda a equipe vê ou só o líder.
function lerCofre() {
  const aba = abaDeDados("Cofre", ["ID", "Nome", "Usuário", "Senha", "Obs.", "Quem vê", "Atualizado por", "Atualizado em"]);
  const linhas = aba.getDataRange().getDisplayValues().slice(1)
    .map((l, i) => ({
      linha: i + 2, id: l[0].trim(), nome: l[1].trim(), usuario: l[2], senha: l[3], obs: l[4],
      soLider: normalizar(l[5]) !== "equipe", atualizadoPor: l[6].trim(), atualizadoEm: l[7].trim(),
    }))
    .filter((c) => c.id && c.nome);
  return { aba, linhas };
}

function cofre(pedido, eu) {
  if (pedido.acao !== "cofre") {
    if (!eu.coordenador) throw falha("Só o líder pode mexer no cofre.");
    const trava = LockService.getScriptLock();
    trava.waitLock(20000);
    try {
      const { aba, linhas } = lerCofre();
      const existente = pedido.id ? linhas.find((c) => c.id === pedido.id) : null;
      if (pedido.id && !existente) throw falha("Esse acesso não existe mais. Atualize a página.");
      if (pedido.acao === "removerSenha") {
        aba.deleteRow(existente.linha);
      } else {
        const nome = String(pedido.nome || "").trim();
        if (!nome) throw falha("Escreva o nome do acesso (ex.: Instagram).");
        const valores = [existente ? existente.id : Utilities.getUuid().slice(0, 8), nome, String(pedido.usuario || "").trim(),
          String(pedido.senha || ""), String(pedido.obs || "").trim(), pedido.soLider ? "Só o líder" : "Equipe", eu.nome, agora()];
        if (existente) aba.getRange(existente.linha, 1, 1, valores.length).setValues([valores]);
        else aba.appendRow(valores);
      }
    } finally {
      trava.releaseLock();
    }
  }
  const acessos = lerCofre().linhas
    .filter((c) => eu.coordenador || !c.soLider)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((c) => ({ id: c.id, nome: c.nome, usuario: c.usuario, senha: c.senha, obs: c.obs, soLider: c.soLider,
      atualizadoPor: c.atualizadoPor, atualizadoEm: c.atualizadoEm }));
  return { cofre: acessos };
}

// ---------------------------------------------------------------------------
// VISITAS DO SITE (GoatCounter). Qualquer pessoa da equipe pode ver.
// Guarda a resposta por 5 minutos: abrir e fechar a seção não gasta o limite de consultas do GoatCounter.
const GOATCOUNTER = "https://curanossaterra.goatcounter.com/api/v0";

function visitas(pedido) {
  const hora = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;
  if (!hora.test(pedido.start) || !hora.test(pedido.end)) throw falha("Período inválido.");
  const cache = CacheService.getScriptCache();
  const chaveCache = `visitas:${pedido.start}:${pedido.end}`;
  const guardado = cache.get(chaveCache);
  if (guardado) return JSON.parse(guardado);

  const chave = PropertiesService.getScriptProperties().getProperty("GOATCOUNTER_CHAVE") || GOATCOUNTER_CHAVE;
  if (!chave) throw falha("Falta a chave do GoatCounter (GOATCOUNTER_CHAVE) no Apps Script.");
  const periodo = `start=${encodeURIComponent(pedido.start)}&end=${encodeURIComponent(pedido.end)}`;
  const consultas = {
    total: `/stats/total?${periodo}`,
    hits: `/stats/hits?${periodo}&limit=100`,
    origens: `/stats/toprefs?${periodo}&limit=8`,
    aparelhos: `/stats/sizes?${periodo}`,
    locais: `/stats/locations?${periodo}&limit=8`,
  };
  const resposta = {};
  // uma por vez: o GoatCounter recusa muitas consultas juntas. Erro passageiro: espera e tenta de novo.
  Object.keys(consultas).forEach((nome) => {
    for (let tentativa = 0; ; tentativa++) {
      const r = UrlFetchApp.fetch(GOATCOUNTER + consultas[nome], { headers: { Authorization: "Bearer " + chave }, muteHttpExceptions: true });
      const codigo = r.getResponseCode();
      if (codigo === 200) { resposta[nome] = JSON.parse(r.getContentText()); break; }
      if (codigo === 401 || codigo === 403) throw falha("A chave do GoatCounter não vale mais. Troque a GOATCOUNTER_CHAVE no Apps Script.");
      if (tentativa === 2) throw falha("O GoatCounter não respondeu agora. Tente de novo em instantes.");
      Utilities.sleep(1500);
    }
  });
  const texto = JSON.stringify(resposta);
  if (texto.length < 90000) cache.put(chaveCache, texto, 300);
  return resposta;
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
