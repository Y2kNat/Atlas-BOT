<p align="center">
  <img src="https://www.image2url.com/r2/default/images/1777333917440-ad7246de-48f5-4dd0-8470-fc5b647e090d.png" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-4f46e5?style=for-the-badge">
  <img src="https://img.shields.io/badge/node-16.9%2B-22c55e?style=for-the-badge">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge">
  <img src="https://img.shields.io/badge/license-MIT-10b981?style=for-the-badge">
  <img src="https://img.shields.io/badge/status-online-22c55e?style=for-the-badge">
</p>

<br>

<h1 align="center">🏠 𝙰𝚝𝚕𝚊𝚜 𝚁𝙿 • 𝙱𝙾𝚃</h1>

<p align="center">
  Sistema de registro de imóveis para servidores de Roleplay – gerencie propriedades, gangues e ações policiais.
</p>

<p align="center">
  <b>𝙼𝚊𝚍𝚎 𝙱𝚢 𝚈𝟸𝚔_𝙽𝚊𝚝</b>
</p>

---

## ✦ 𝙰𝙱𝙾𝚄𝚃

> O **Atlas RP • BOT** é um sistema completo para servidores de Roleplay, desenvolvido em **Node.js + discord.js v14**. Ele permite o cadastro de imóveis com validação de dados, gerenciamento de status, gangues, ações policiais e backup automático.

---

## ✦ 𝙵𝙴𝙰𝚃𝚄𝚁𝙴𝚂

```txt
🏠 PROPERTY REGISTER  → Cadastro de imóveis com foto
📍 LOCATION SYSTEM    → Bairros definidos (Greenville, Brookemere, Horton)
🏷️ TYPE SYSTEM        → Casa, Apartamento, Comércio, Delegacia, Autódromo e Outro
📝 RP STATUS          → Disponível, Em Construção, Abandonada, Em Reforma
💥 GANG SYSTEM        → Criação, membros, propriedades vinculadas
👮 POLICE ACTIONS     → Interdição, Investigação, Liberação (com cargos configuráveis)
🎭 RP ACTIONS         → Registro de invasão com notificação ao dono
📊 STATISTICS         → Totais por bairro e tipo, ranking de gangues
📁 BACKUP             → Automático a cada alteração + manual
```

---

✦ 𝚂𝚈𝚂𝚃𝙴𝙼 𝙵𝙻𝙾𝚆

```mermaid
sequenceDiagram
    participant U as Usuário
    participant B as Bot
    participant D as Banco de Dados
    participant C as Canal de Imóveis

    U->>B: Clica "Registrar Imóvel"
    B->>U: Modal (Rua, Referência, Cor)
    U->>B: Envia dados
    B->>U: Select de Bairro
    U->>B: Seleciona bairro
    B->>U: Select de Tipo
    U->>B: Seleciona tipo
    B->>U: Solicita imagem do imóvel
    U->>B: Envia foto
    B->>D: Salva imóvel (JSON + imagem)
    B->>C: Publica embed com detalhes
    B-->>U: Confirmação ephemeral
```

---

## ✦ 𝘾𝙊𝙈𝙈𝘼𝙉𝘿𝙎

### 🤖 Slash (Owner)

| Comando | Descrição |
|---------|-----------|
| `/houseregister #canal` | Define o canal do botão de registro |
| `/housechannel #canal` | Define o canal onde os imóveis aparecem |

---

### 📋 Consultas

| Comando | Descrição |
|---------|-----------|
| `;help` | Central de ajuda completa |
| `;list [bairro]` | Lista imóveis (filtro opcional por bairro) |
| `;search <termo>` | Busca imóvel por rua ou ID |
| `;info <id>` | Detalhes de um imóvel específico |
| `;stats` | Estatísticas gerais do servidor |
| `;neighborhoods` | Lista os bairros disponíveis |
| `;minhasprops` | Seus próprios imóveis registrados |
| `;vizinhanca <bairro>` | Imóveis de um bairro específico |

### 📝 Status RP

| Comando | Descrição |
|---------|-----------|
| `;status <id> <status>` | Altera status (disponivel/construcao/abandonada/reforma) |
| `;reformar <id>` | Atalho para "Em Reforma" |
| `;abandonar <id>` | Atalho para "Abandonada" |

### 💥 Gangues

| Comando | Descrição | Permissão |
|---------|-----------|-----------|
| `;gangue criar <nome> <@dono>` | Cria uma gangue | Owner |
| `;gangue deletar <nome>` | Deleta uma gangue | Owner |
| `;gangue info <nome>` | Informações da gangue | — |
| `;gangue list` | Lista todas as gangues | — |
| `;gangue vincular <id> <gangue>` | Vincula imóvel à gangue | Dono da gangue |
| `;gangue desvincular <id>` | Remove vínculo do imóvel | Dono da gangue |
| `;gangue membro add <@user> <gangue>` | Adiciona membro | Dono da gangue |
| `;gangue membro remove <@user> <gangue>` | Remove membro | Dono da gangue |
| `;gangue propriedades <nome>` | Lista imóveis da gangue | — |

### 👮 Polícia

| Comando | Descrição | Permissão |
|---------|-----------|-----------|
| `;policia cargo add @cargo` | Adiciona cargo policial | Owner |
| `;policia cargo remove @cargo` | Remove cargo policial | Owner |
| `;policia cargos` | Lista cargos policiais | — |
| `;interditar <id> <motivo>` | Interdita um imóvel | Policial |
| `;investigar <id>` | Coloca sob investigação | Policial |
| `;liberar <id>` | Libera imóvel interditado | Policial |

### 🎭 Ações RP

| Comando | Descrição |
|---------|-----------|
| `;invadir <id>` | Registra invasão e notifica o dono |

### 🔧 Administrativo (Owner)

| Comando | Descrição |
|---------|-----------|
| `;delete <id>` | Remove um imóvel do sistema |
| `;backup create` | Cria backup manual |
| `;backup list` | Lista backups disponíveis |
| `;export` | Exporta todos os dados em JSON |

---

✦ 𝙋𝙀𝙍𝙈𝙄𝙎𝙎𝙄𝙊𝙉𝙎

👑 DONO DO BOT
✔ Slash commands
✔ Gerenciar gangues e cargos policiais
✔ Deletar imóveis e fazer backup

👮 POLÍCIA (cargos configurados)
✔ Interditar / Investigar / Liberar imóveis

💥 DONO DE GANGUE
✔ Vincular / desvincular imóveis
✔ Gerenciar membros

🏠 USUÁRIOS COMUNS
✔ Registrar imóveis
✔ Alterar status dos próprios imóveis
✔ Invadir (RP)

---

✦ 𝘿𝘼𝙏𝘼𝘽𝘼𝙎𝙀

📁 data/imoveis/ – JSON por tipo de imóvel
📁 data/configs/ – Configurações por servidor e cargos
📁 data/backups/ – Backups automáticos (7 dias)
📁 logs/ – Logs diários de ações

✔ Leve
✔ Persistente
✔ Fácil manutenção

---

✦ 𝙊𝘽𝙅𝙀𝘾𝙏𝙄𝙑𝙀

✔ Automatizar o registro imobiliário RP
✔ Fornecer ferramentas para polícia e gangues
✔ Manter um ambiente organizado e imersivo
✔ Permitir consultas e estatísticas em tempo real

---

📌 Status

🟢 Online • ⚡ Estável • 🔒 Seguro

---

<p align="center">
  <b>© 2026 Atlas • 𝙼𝚊𝚍𝚎 𝙱𝚢 𝚈𝟸𝚔_𝙽𝚊𝚝</b>
</p>