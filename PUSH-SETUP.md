# Notificações com o app fechado (push de verdade, tipo WhatsApp)

O app em si (React/PWA) não consegue, sozinho, notificar com o celular
fechado de forma confiável — o navegador mata o "processo" em segundo
plano depois de um tempo. Pra funcionar de verdade, agora existe um
servidorzinho (pasta `server/`) que fica de olho nos horários das suas
contas e manda um "push" real pro seu Android quando chega a hora — isso
é entregue pelo próprio sistema (Google Play Services), então funciona
mesmo com o navegador/app fechado.

Isso é **gratuito** e leva uns 5 minutos pra configurar.

## Passo 1 — Subir o servidor (Render, grátis)

1. Suba a pasta `server/` para um repositório no GitHub (pode ser o mesmo
   repositório do app, ela é independente).
2. Crie uma conta em https://render.com (dá pra usar login do GitHub).
3. Clique em **New +** → **Web Service** → conecte o repositório.
4. Configure:
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Em **Environment Variables**, adicione (já vêm prontas, pode usar
   exatamente estas ou gerar as suas — veja `server/.env.example`):
   - `VAPID_PUBLIC_KEY` = `BD0MqlERCD5D3OaD8jBfCBVsBuhbXJ0PZu_85kqYJ-_LO61ADR4iQt48RElnzQxh5fAyuCS8gPYsoz8Buaem5M0`
   - `VAPID_PRIVATE_KEY` = `onLq5X-CgQ0b3MimKT9ZwVSa_tDK-82b2xQ3nGVTDRY`
   - `VAPID_SUBJECT` = `mailto:seuemail@example.com`
6. Clique em **Create Web Service** e espere o deploy terminar. Você vai
   ficar com uma URL do tipo `https://claude-cooldown-push.onrender.com`.

> No plano free do Render o servidor "dorme" depois de ~15 min sem uso e
> demora alguns segundos pra acordar na próxima requisição — isso é
> normal e não atrapalha o funcionamento, só o primeiro sync depois de
> um tempo parado pode demorar um pouco mais.

Alternativas ao Render: Railway, Fly.io, Cyclic — o código em `server/`
é um Express comum, funciona em qualquer um deles.

## Passo 2 — Ativar no app

1. Abra o Claude Cooldown no celular (Android, Chrome), **instalado como
   app** (Adicionar à tela inicial) pra melhor resultado.
2. No card "Configuração de Alertas", role até **"Notificações com o app
   fechado"**.
3. Cole a URL do servidor que você criou no Passo 1.
4. Toque em **"Ativar Push no Servidor"** e aceite a permissão de
   notificação.
5. Use o botão **"Testar Push"** — feche o app completamente e veja se a
   notificação chega mesmo assim.

Pronto. A partir daí, toda vez que você definir/editar um horário de
cooldown, o app avisa o servidor, e ele dispara os alertas (30m, 10m,
5m, 1m, na hora exata) direto pro seu celular — com o app fechado ou não.

## Gerando suas próprias chaves (opcional)

Se preferir não usar as chaves de exemplo acima:

```bash
cd server
npx web-push generate-vapid-keys
```

Copie as chaves geradas para as variáveis de ambiente do seu servidor.
