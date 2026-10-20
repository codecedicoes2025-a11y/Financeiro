# Financeiro: guia completo de configuração

Este guia leva o app do seu computador até o ar, com **login (Supabase)**, **dados sincronizados entre aparelhos** e **publicação na Vercel**.
Ele também explica o Gemini (leitura de PDF), o uso no iPhone, segurança, backup e problemas comuns.

> Os nomes de menus do Supabase, da Vercel e do GitHub mudam de vez em quando. Se um botão não estiver exatamente onde está escrito aqui,
> procure pelo nome em destaque (**em negrito**): o conceito é o mesmo.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [O que você precisa](#2-o-que-você-precisa)
3. [Rodar no seu computador](#3-rodar-no-seu-computador)
4. [Supabase (login e banco de dados)](#4-supabase-login-e-banco-de-dados)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [GitHub](#6-github)
7. [Vercel (publicar)](#7-vercel-publicar)
8. [Primeiro acesso](#8-primeiro-acesso)
9. [Usar no iPhone](#9-usar-no-iphone)
10. [Gemini: ler extratos em PDF](#10-gemini-ler-extratos-em-pdf)
11. [Como os dados funcionam](#11-como-os-dados-funcionam)
12. [Segurança](#12-segurança)
13. [Backup e restauração](#13-backup-e-restauração)
14. [Problemas comuns](#14-problemas-comuns)
15. [Referência rápida](#15-referência-rápida)
16. [Checklist final](#16-checklist-final)

---

## 1. Visão geral

```
 Navegador / iPhone ──►  App (Next.js, hospedado na Vercel)
        │                        │
        │                        ├─►  Supabase Auth      (login com e-mail e senha)
        │                        └─►  Supabase Postgres  (tabela finance_state: uma linha por usuário)
        │
        └─►  Google Gemini (opcional, só ao importar PDF): recebe o TEXTO extraído do PDF
```

- O app é um site (também instalável no iPhone como aplicativo).
- **Sem Supabase configurado**, ele funciona em **modo local**: sem login, com os dados só no aparelho. Serve para testar.
- **Com Supabase configurado**, pede login, guarda seus dados **por usuário** e os acompanha entre aparelhos.
- Há dois "livros" separados: **Finanças PF** e **Finanças PJ**. No PF, o Resumo pode mostrar "Só PF" ou "PF + PJ" (caixas somados).

---

## 2. O que você precisa

| Item | Para quê | Custo |
|---|---|---|
| **Node.js 20.9 ou mais novo** e **npm** | Rodar o projeto no computador | Grátis |
| Conta no **Supabase** | Login e banco de dados | Há plano gratuito |
| Conta no **GitHub** | Guardar o código e ligar à Vercel | Grátis |
| Conta na **Vercel** | Publicar o app | Há plano gratuito |
| Chave do **Google Gemini** *(opcional)* | Ler extratos em PDF | Há camada gratuita |

Confira os limites e preços atuais de cada serviço nos sites deles: eles mudam com o tempo.

---

## 3. Rodar no seu computador

Abra o Terminal na pasta do projeto.

```bash
# 1) Instalar as dependências (só na primeira vez ou quando o package.json mudar)
npm install

# 2) Iniciar em modo de desenvolvimento
npm run dev
```

Abra **http://localhost:3100**.

- Sem as variáveis do Supabase, o app abre direto na escolha **Finanças PF / Finanças PJ** (modo local).
- Para testar no **iPhone** na mesma rede Wi‑Fi, abra `http://IP-DO-SEU-MAC:3100` no Safari (o IP está em Ajustes do Sistema › Wi‑Fi).
  O projeto já libera as redes locais em `next.config.mjs` (`allowedDevOrigins`); sem isso o Next.js 16 deixa a página em branco quando acessada por IP.
- Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 3100 |
| `npm run build` | Gera a versão de produção (a Vercel faz isso sozinha) |
| `npm run start` | Roda a versão de produção na porta 3100 (depois de `build`) |

> O `npm install` executa um passo automático (`postinstall`) que copia o leitor de PDF para `public/pdf.worker.min.mjs`. Não apague esse arquivo.

---

## 4. Supabase (login e banco de dados)

### 4.1 Criar o projeto

1. Entre em <https://supabase.com> e crie uma conta.
2. **New project**: escolha um nome (ex.: `financeiro`), uma **senha do banco** (guarde num gerenciador de senhas) e a região mais próxima de você.
3. Espere o projeto terminar de ser criado.

### 4.2 Criar a tabela (obrigatório)

1. No menu lateral, abra **SQL Editor** › **New query**.
2. Abra o arquivo **`supabase/schema.sql`** deste projeto, copie **tudo** e cole no editor.
3. Clique em **Run**. Deve aparecer "Success".

Isso cria a tabela `finance_state` (uma linha por usuário) e liga a **segurança por linha (RLS)**: cada usuário só lê e altera a própria linha.
Rodar o arquivo de novo não faz mal.

Para conferir: **Table Editor** › `finance_state` deve existir, com o ícone de RLS ativo.

### 4.3 Configurar o login por e-mail

Menu **Authentication**:

1. **Sign In / Providers** (ou *Providers*) › **Email**: deixe **ligado**.
2. **Confirm email** (confirmação de e-mail):
   - **Ligado** (padrão): quem cria conta precisa clicar no link do e-mail antes de entrar. Mais seguro.
   - **Desligado**: entra direto após criar a conta. Útil só para testes rápidos.
3. **URL Configuration**:
   - **Site URL**: o endereço final do app, ex.: `https://seu-app.vercel.app`.
     Enquanto não publicar, use `http://localhost:3100`.
   - **Redirect URLs**: adicione **todos** os endereços onde o app roda:
     - `http://localhost:3100`
     - `https://seu-app.vercel.app` (e o seu domínio próprio, se tiver)
   - Sem isso, os links dos e-mails (confirmar conta e **recuperar senha**) abrem no endereço errado.

### 4.4 Criar o seu usuário

Duas formas:

- **Pelo app**: abra o app, toque em **Criar conta**, use seu e-mail e senha, e confirme pelo e-mail.
- **Pelo Supabase**: **Authentication › Users › Add user**, e marque a opção de confirmar o e-mail automaticamente.

### 4.5 Fechar o cadastro (muito recomendado)

Como o app é só seu, **depois de criar o seu usuário** impeça que outras pessoas criem contas:

- **Authentication › Sign In / Providers**: desligue **Allow new users to sign up** (permitir novos cadastros).

Seus dados continuam protegidos por RLS mesmo sem isso, mas assim ninguém nem consegue tentar.

### 4.6 Pegar as chaves

**Project Settings › API** (ou *Data API / API Keys*):

- **Project URL** → `https://xxxxxxxx.supabase.co`
- **anon / public key** (chave publicável) → começa com `eyJ...` ou `sb_publishable_...`

> Use **somente** a chave `anon` (pública). **Nunca** coloque a `service_role` (ou `secret`) neste app: ela ignora o RLS e dá acesso total ao banco.

### 4.7 E-mails do Supabase

- O serviço de e-mail padrão do Supabase tem **limite baixo de envios por hora** e serve para testes. Se for usar com frequência
  (muitos cadastros ou recuperações de senha), configure um **SMTP próprio** em **Project Settings › Authentication › SMTP Settings**.
- Para uso só seu (você criou a conta uma vez), o padrão costuma bastar.
- O plano gratuito pode **pausar projetos sem uso por um tempo**. Se o app parar de logar depois de semanas sem abrir,
  veja se o projeto está pausado e clique para reativar.

---

## 5. Variáveis de ambiente

São apenas duas:

| Variável | Valor | Pública? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase | Sim (vai para o navegador) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon`/publicável | Sim (a segurança é o RLS, não esconder a chave) |

### No seu computador

1. Copie o arquivo de exemplo:
   ```bash
   cp .env.example .env.local
   ```
2. Edite `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
   ```
3. **Pare e reinicie** o `npm run dev` (as variáveis só são lidas na inicialização).
4. Abra o app: agora ele mostra a tela de **login**.

O `.env.local` **não** vai para o GitHub (o `.gitignore` já o ignora).

### Na Vercel

Veja a seção 7: você cadastra as **mesmas duas variáveis** no painel da Vercel.

> Como as variáveis começam com `NEXT_PUBLIC_`, o Next.js as grava **dentro do site na hora do build**.
> Se você mudar uma variável na Vercel, é preciso **fazer um novo deploy** para valer.

---

## 6. GitHub

A Vercel publica a partir de um repositório. Esta pasta ainda não é um repositório Git.

1. Crie um repositório **vazio e privado** em <https://github.com/new> (ex.: `financeiro`). **Não** marque README nem `.gitignore`.
2. No Terminal, na pasta do projeto:
   ```bash
   git init
   git add .
   git commit -m "Primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/financeiro.git
   git push -u origin main
   ```
3. Confira no GitHub que **não** subiram: `.env.local`, `node_modules`, `.next` e a pasta `amostras/` (seus extratos).
   O `.gitignore` já cuida disso. Se algo sensível subir por engano, apague do histórico e **troque as chaves**.

> Mantenha o repositório **privado**: ele contém o código do seu controle financeiro.
> A pasta `legacy/v1/` é uma cópia da versão antiga do app (guardada de propósito) e pode ficar no repositório.

---

## 7. Vercel (publicar)

1. Entre em <https://vercel.com> (pode usar "Continue with GitHub").
2. **Add New › Project** e **Import** o repositório `financeiro`.
3. Na tela de configuração:
   - **Framework Preset**: Next.js (detectado sozinho). Não mude comandos de build/saída.
   - **Environment Variables**: cadastre as duas variáveis da seção 5
     (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) para **Production** (e, se quiser testar branches, também **Preview**).
4. Clique em **Deploy**. Em um ou dois minutos você recebe o endereço, tipo `https://financeiro-xxxx.vercel.app`.
5. **Volte ao Supabase** (seção 4.3) e confirme que **Site URL** e **Redirect URLs** têm esse endereço.
6. Abra o endereço da Vercel: deve aparecer a tela de **login**.

### Depois do primeiro deploy

- Cada `git push` na branch `main` publica uma nova versão automaticamente.
- **Mudou uma variável na Vercel?** Vá em **Deployments**, abra o último deploy e use **Redeploy** (sem usar o cache de build).
- **Domínio próprio** (opcional): **Settings › Domains** na Vercel; depois adicione o novo domínio também em **Redirect URLs** (e como **Site URL**, se for o principal) no Supabase.
- **Endereços de "Preview"** (um por branch) mudam a cada deploy. Para login funcionar neles, seria preciso liberar cada um no Supabase. O mais simples é usar só o endereço de produção.

---

## 8. Primeiro acesso

1. Abra o app (no computador ou no endereço da Vercel).
2. **Criar conta** → e-mail e senha (mínimo de 6 caracteres; use uma senha forte).
3. Confirme o e-mail (veja também o spam) e volte para **Entrar**.
4. **Desligue o cadastro de novos usuários** no Supabase (seção 4.5).
5. Escolha **Finanças PF** ou **Finanças PJ**.
6. Se o aparelho já tinha dados antes do login, eles sobem para a sua conta automaticamente na primeira entrada.
   Se a conta já tiver dados na nuvem **e** o aparelho também, o app mostra **"Dados diferentes"** e pergunta qual manter
   (guardando uma cópia de segurança do que for substituído).
7. Em **Ajustes**, comece por:
   - **Contas, bancos e saldo do caixa**: crie as contas e informe o saldo do dia 01 do mês.
   - **Meu nome (transferências)**: cadastre seu nome (e o da empresa) para reconhecer Pix entre suas contas.

**Esqueci a senha:** na tela de login, **Esqueci minha senha**. Você recebe um e-mail; ao clicar no link, o app abre a tela **Nova senha**.

---

## 9. Usar no iPhone

1. Abra o endereço do app (o da Vercel) no **Safari**.
2. Toque em **Compartilhar** › **Adicionar à Tela de Início**.
3. O app abre como aplicativo, em tela cheia, com o ícone do projeto.

Notas:
- Faça login uma vez; o iPhone mantém a sessão.
- Os dados vêm da nuvem, então o iPhone e o computador mostram a mesma coisa. Ao voltar para o app, ele busca as novidades.
- Se um campo de data parecer estranho, recarregue a página (ou feche e abra o app).

---

## 10. Gemini: ler extratos em PDF

**É opcional.** Sem Gemini, você importa extratos em **CSV** ou **OFX** normalmente.

1. Crie uma chave gratuita em <https://aistudio.google.com/apikey>.
2. No app: **Ajustes › Gemini (ler PDF)**.
3. Cole a chave e clique em **Testar conexão**.
4. *(Opcional)* No mesmo lugar, cadastre as **senhas dos PDFs dos bancos** (uma por linha). O app abre o PDF no seu aparelho com essa senha.
5. Em **Ajustes › Importar extrato**: escolha a conta, envie o `.pdf`, **revise** os lançamentos e confirme.

Como funciona e o que sai do seu aparelho:

- O PDF é aberto **no seu aparelho**. Só o **texto extraído** (lançamentos, saldos e dados da conta) vai ao Gemini.
- O arquivo inteiro só vai se o PDF **não tiver senha e não tiver texto** (escaneado). O app sempre pede confirmação antes de enviar.
- Na camada gratuita, o Google **pode usar o conteúdo enviado para melhorar produtos**. Se isso for um problema, use CSV ou OFX.
- A chave e as senhas ficam **só neste aparelho**: não vão para a nuvem nem entram no backup. Cadastre em cada aparelho que for usar PDF.
- A leitura por IA **pode errar** valor, data ou o sinal entrada/saída. Sempre confira a tela de revisão.
- Limite: 15 MB por PDF. O app alterna entre os modelos da lista; se um estourar a cota gratuita, tenta o próximo.

---

## 11. Como os dados funcionam

**Onde ficam**

| Dado | Onde |
|---|---|
| Contas, lançamentos, categorias, saldos, histórico de importações, câmbio, seu nome (PF e PJ) | Supabase (tabela `finance_state`) **e** uma cópia no aparelho |
| Chave do Gemini e senhas de PDF | **Só no aparelho** |
| Escolha "Só PF / PF + PJ" e último livro aberto | **Só no aparelho** |

**Sincronização**

- Cada alteração é salva no aparelho na hora e enviada à nuvem em cerca de 1 segundo.
- Ao voltar para a aba, o app busca as mudanças feitas em outro aparelho (se você não tiver alteração pendente).
- Sem internet: o app continua funcionando com a cópia local e envia depois. Em **Ajustes › Meu login e sincronização** você vê o estado ("Tudo salvo na nuvem" / "Pendente").
- Se duas pessoas/aparelhos editarem ao mesmo tempo, vale a **última gravação** (é um app pessoal, não colaborativo).

**Regras do app que valem saber**

- O saldo do caixa é **por conta e por mês**: todo dia 01 você informa o saldo de cada conta, e a cada mês entradas, saídas e caixa recomeçam.
- **Transferência** entre contas suas não conta como gasto nem ganho.
- Dólar (ex.: Payoneer) é convertido pela cotação ao vivo.

---

## 12. Segurança

Seus dados são financeiros. Cuidados:

- **RLS ligado** (já vem no `schema.sql`): cada usuário só acessa a própria linha. Confira em **Table Editor** que `finance_state` mostra RLS ativo.
- **Só a chave `anon` no app.** Nunca a `service_role`/`secret`. Se uma chave secreta vazar, gire-a em **Project Settings › API**.
- **Feche o cadastro** depois de criar seu usuário (seção 4.5).
- **Senha forte e única** para o app, o Supabase, o GitHub e a Vercel. Ligue a **verificação em duas etapas** nos três serviços.
- Mantenha o **repositório privado** e nunca suba `.env.local`, extratos reais ou backups para o GitHub.
- O arquivo de **backup** (Exportar) tem todos os seus dados em texto puro: guarde em local seguro.
- Em aparelho emprestado ou compartilhado, use **Sair** em **Ajustes › Meu login e sincronização**.
- As chaves do app ficam no navegador: quem tiver acesso ao seu aparelho desbloqueado tem acesso ao app. Use bloqueio de tela.

---

## 13. Backup e restauração

**No app (recomendado: faça de vez em quando)**

- **Ajustes › Backup › Exportar**: baixa um `.json` com **os dois livros** (PF e PJ). **Restaurar** carrega esse arquivo e **substitui tudo** o que está no app.
- Aceita também o backup do formato antigo (de um livro só): ele entra como Finanças PF.

**No Supabase**

- Os dados estão na tabela `finance_state` (coluna `data`). Dá para ver e exportar em **Table Editor** (botão de exportar CSV) ou por SQL:
  ```sql
  select user_id, updated_at, data from public.finance_state;
  ```
- Backups automáticos do banco dependem do seu plano. Confira as regras atuais em **Database › Backups**.

**Cópia de segurança automática do conflito**

Quando você escolhe um lado na tela "Dados diferentes", o app guarda o que foi descartado no navegador (`financeiro:v3:backup-before-sync`).
É uma rede de segurança local, não substitui o backup em arquivo.

---

## 14. Problemas comuns

**A tela de login não aparece (o app abre direto)**
As variáveis não chegaram. Local: confira o `.env.local` e **reinicie** o `npm run dev`. Vercel: confira o nome exato das duas variáveis,
o ambiente (Production) e faça **Redeploy**. Em **Ajustes › Meu login e sincronização** aparece "O login está desligado" enquanto faltar configuração.

**"E-mail ou senha incorretos"**
Confira e-mail e senha. Se criou a conta pelo app, pode faltar confirmar o e-mail. Use **Esqueci minha senha** para criar outra.

**"Confirme seu e-mail antes de entrar"**
Abra o link do e-mail (veja o spam). Para testes, desligue **Confirm email** (seção 4.3).

**O link do e-mail abre em `localhost` ou em página errada**
**Site URL** e **Redirect URLs** do Supabase estão errados (seção 4.3). Corrija e peça um novo e-mail.

**"O cadastro de novas contas está desativado"**
É o esperado depois da seção 4.5. Para criar um usuário novo, use **Authentication › Users › Add user** no Supabase.

**Status "Pendente" (não consegue salvar na nuvem)**
- Sem internet: some sozinho quando voltar.
- Tabela não criada ou RLS ausente: rode o `supabase/schema.sql` (seção 4.2). Erros como `relation "finance_state" does not exist` ou `row-level security` indicam isso.
- Chave errada: confira URL e chave `anon` (sem espaços sobrando).
- Projeto pausado: reative no painel do Supabase.

**Aparece a tela "Dados diferentes"**
O aparelho tinha dados que a nuvem não tinha (ou o contrário). Escolha o lado certo; o outro fica guardado como cópia de segurança.
Se não tiver certeza, **cancele** fechando o app, exporte um backup no aparelho que tem os dados corretos e só então escolha.

**Dois aparelhos mostram coisas diferentes**
Abra **Ajustes › Meu login e sincronização › Buscar da nuvem agora**.

**Página em branco ao abrir pelo IP do Mac (modo de desenvolvimento)**
O Next.js bloqueia origens de rede. O projeto já libera as redes locais em `next.config.mjs`; reinicie o `npm run dev` se tiver mudado esse arquivo.

**PDF: "Este PDF tem senha" / "A senha salva não abriu"**
Cadastre/corrija a senha em **Ajustes › Gemini (ler PDF)**. O campo aceita várias senhas (uma por linha).

**PDF: erro 404 do leitor (`pdf.worker.min.mjs`)**
Rode `npm install` de novo (o `postinstall` recria o arquivo em `public/`).

**O build falha na Vercel**
Abra o log do deploy. Confira se o projeto roda localmente com `npm run build`. Variáveis `NEXT_PUBLIC_...` ausentes **não** quebram o build (o app só cai no modo local).

**Mudei uma variável e nada mudou**
Faça **Redeploy** (seção 7): variáveis `NEXT_PUBLIC_` são gravadas no build.

---

## 15. Referência rápida

**Variáveis**

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

**Arquivos importantes**

| Arquivo / pasta | Para quê |
|---|---|
| `SETUP.md` | Este guia |
| `supabase/schema.sql` | Cria a tabela e a segurança no Supabase |
| `.env.example` | Modelo das variáveis (copie para `.env.local`) |
| `next.config.mjs` | Configuração do Next.js (libera acesso por IP na rede local em desenvolvimento) |
| `public/pdf.worker.min.mjs` | Leitor de PDF (copiado automaticamente no `npm install`) |
| `lib/store.ts` | Regras dos dados e dos dois livros (PF e PJ) |
| `lib/useRootData.ts` | Sincronização com o Supabase e resolução de conflito |
| `lib/useAuth.ts` | Login, cadastro e recuperação de senha |
| `lib/gemini.ts`, `lib/pdfText.ts` | Leitura de PDF (abre no aparelho, envia só o texto) |
| `components/Shell.tsx` | Porta de entrada: login → escolha PF/PJ → app |
| `legacy/v1/` | Cópia da versão antiga do app (importação por API de banco). Não é usada |
| `amostras/` | Seus extratos de teste. **Fica fora do Git** |

**Armazenamento local (navegador)**

| Chave | Conteúdo |
|---|---|
| `financeiro:v3` | Cópia local dos dois livros |
| `financeiro:v3:synced` / `financeiro:v3:dirty` | Controle de sincronização |
| `financeiro:v3:backup-before-sync` | Cópia do que foi descartado em um conflito |
| `financeiro:ai` | Chave do Gemini, modelos e senhas de PDF |
| `financeiro:ws`, `financeiro:scope` | Último livro aberto e "Só PF / PF + PJ" |
| `financeiro:v2` | Formato antigo (de um livro só), lido uma vez para migrar |

---

## 16. Checklist final

- [ ] Projeto criado no Supabase
- [ ] `supabase/schema.sql` executado (tabela `finance_state` com RLS)
- [ ] Login por **Email** ligado
- [ ] **Site URL** e **Redirect URLs** com o endereço da Vercel e `http://localhost:3100`
- [ ] Meu usuário criado e e-mail confirmado
- [ ] **Allow new users to sign up** desligado
- [ ] Repositório **privado** no GitHub, sem `.env.local` nem `amostras/`
- [ ] Projeto importado na Vercel com as duas variáveis `NEXT_PUBLIC_...`
- [ ] Deploy feito e login funcionando no endereço da Vercel
- [ ] App adicionado à Tela de Início do iPhone
- [ ] *(Opcional)* Chave do Gemini e senhas de PDF cadastradas em cada aparelho
- [ ] Um backup exportado em **Ajustes › Backup**
- [ ] Verificação em duas etapas ligada no Supabase, GitHub e Vercel
