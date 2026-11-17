# Portal da Mídia: como ligar ao Google

Faça uma vez só, no computador, com a **conta Google da igreja (Cura)**, e não com uma conta pessoal. Assim o portal fica sendo da igreja, mesmo se alguém da equipe sair. As contas pessoais servem só para entrar no portal (Parte 4).

Essa conta precisa ter permissão de **editar** a planilha da agenda. Se não tiver, peça para a Ariane compartilhar com ela como "Editor".

Dica: faça tudo numa **janela anônima** do navegador, entrando só na conta da Cura. Assim o Google não mistura com a sua conta pessoal.

## Parte 1: o botão "Fazer login com o Google"

1. Entre em https://console.cloud.google.com e crie um projeto chamado **Portal da Cura**.
2. No menu, vá em **APIs e serviços → Tela de permissão OAuth** (pode aparecer como "Google Auth Platform") e clique em **Começar**:
   - Nome do app: **Portal da Mídia**
   - E-mail de suporte: o seu
   - Público: **Externo**
   - Contato: o seu e-mail
3. Em **Público**, clique em **Publicar aplicativo**. Sem isso, só e-mails de teste conseguem entrar.
4. Em **Clientes**, clique em **Criar cliente**:
   - Tipo: **Aplicativo da Web**
   - Nome: **Portal da Mídia**
   - Origens JavaScript autorizadas: `https://curanossaterra.github.io`
5. Clique em **Criar** e copie o **ID do cliente**. Ele termina em `.apps.googleusercontent.com`.

## Parte 2: a ponte com as planilhas (Apps Script)

1. Entre em https://script.google.com e clique em **Novo projeto**. Dê o nome **Portal da Mídia**.
2. Apague o que estiver escrito e cole todo o conteúdo do arquivo `apps-script/portal-midia.gs`.
3. Na linha `const CLIENT_ID = "COLE_AQUI.apps.googleusercontent.com";`, troque pelo ID do cliente da Parte 1. Clique no disquete para salvar.
4. No menu de cima, escolha a função **instalar** e clique em **Executar**.
   - O Google vai pedir permissão. Clique em **Avançado → Acessar Portal da Mídia** e depois em **Permitir**.
   - O aviso "app não verificado" aparece porque o código é seu e não passou pela loja do Google. É seguro.
   - Isso cria no seu Drive a planilha particular **Portal da Mídia (dados)**, com as abas **Equipe** e **Escala**.
5. Clique em **Implantar → Nova implantação**:
   - Na engrenagem, escolha **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**. Quem controla o acesso é o login do Google: só entra quem está na aba Equipe.
6. Clique em **Implantar** e copie o **URL do app da Web**. Ele termina em `/exec`.

## Parte 3: colocar no site

No arquivo `midia.html`, preencha as duas linhas:

```js
const API = "URL do app da Web (/exec)";
const CLIENT_ID = "ID do cliente (.apps.googleusercontent.com)";
```

Depois, publique com `git add -A; git commit -m "Portal da Mídia"; git push`.

## Parte 4: a equipe

1. Abra https://curanossaterra.github.io/midia.html e entre com a **conta da Cura**. Ela é sempre líder.
2. Na seção **Equipe**, toque em **Editar** no **Jhow** e coloque o seu e-mail **pessoal**. Ele já está marcado como Líder.
3. Faça o mesmo com as outras pessoas, cada uma com o e-mail do Google dela. Só depois disso a pessoa consegue entrar.
4. Toque em **Sair** e entre de novo com a sua conta pessoal. A partir daí, use sempre ela; a conta da Cura fica de reserva.

## Depois

- **Para criar uma função nova** (ex.: "Iluminação"): na planilha **Portal da Mídia (dados)**, aba **Escala**, insira uma coluna antes de "Descanso" com o nome da função.
- **Se mudar o código do Apps Script**: vá em **Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar**. O endereço continua o mesmo.
