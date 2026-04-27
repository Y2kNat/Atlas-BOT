const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionsBitField,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    MessageFlags,
    AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

// ============================================
// CONFIGURAÇÃO INICIAL
// ============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

if (!process.env.TOKEN) {
    console.error('❌ TOKEN não encontrado no arquivo .env');
    process.exit(1);
}

if (!process.env.OWNER_ID) {
    console.error('❌ OWNER_ID não encontrado no arquivo .env');
    process.exit(1);
}

const OWNER_ID = process.env.OWNER_ID;
const PREFIX = ';';

// ============================================
// ESTRUTURA DE DIRETÓRIOS
// ============================================

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const IMOVEIS_DIR = path.join(DATA_DIR, 'imoveis');
const CONFIGS_DIR = path.join(DATA_DIR, 'configs');
const SERVIDORES_DIR = path.join(CONFIGS_DIR, 'servidores');
const CARGOS_DIR = path.join(CONFIGS_DIR, 'cargos');
const LOGS_DIR = path.join(__dirname, 'logs');
const IMAGES_DIR = path.join(__dirname, 'images');

// Criar todos os diretórios
[
    DATA_DIR, 
    BACKUP_DIR, 
    IMOVEIS_DIR, 
    CONFIGS_DIR, 
    SERVIDORES_DIR, 
    CARGOS_DIR, 
    LOGS_DIR, 
    IMAGES_DIR
].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Criar pastas de tipos de imóveis
const TIPOS_IMOVEIS = ['casas', 'apartamentos', 'comercios', 'delegacias', 'autodromos', 'outros'];
TIPOS_IMOVEIS.forEach(tipo => {
    const dir = path.join(IMOVEIS_DIR, tipo);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ============================================
// CONFIGURAÇÕES PADRÃO
// ============================================

const NEIGHBORHOODS = ['Greenville', 'Brookemere', 'Horton'];
const NEIGHBORHOOD_EMOJIS = {
    'Greenville': '🌳',
    'Brookemere': '🌊',
    'Horton': '🏔️'
};

const DEFAULT_TIPOS = {
    'Casa': '🏠',
    'Apartamento': '🏢',
    'Comércio': '🏪',
    'Delegacia': '👮',
    'Autódromo': '🏎️',
    'Outro': '📦'
};

const STATUS_OPTIONS = {
    'disponivel': { label: 'Disponível', emoji: '🟢' },
    'construcao': { label: 'Em Construção', emoji: '🚧' },
    'abandonada': { label: 'Abandonada', emoji: '🏚️' },
    'reforma': { label: 'Em Reforma', emoji: '🔨' }
};

const POLICE_STATUS = {
    'interditada': '🚫',
    'investigada': '🔍'
};
// ============================================
// FUNÇÃO PARA BAIXAR IMAGEM
// ============================================

async function downloadImage(url, fileName) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(IMAGES_DIR, fileName);
        const file = fs.createWriteStream(filePath);
        
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadImage(response.headers.location, fileName)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                resolve(filePath);
            });
            
            file.on('error', (err) => {
                fs.unlink(filePath, () => {});
                reject(err);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

// ============================================
// CLASSE DO BANCO DE DADOS
// ============================================

class Database {
    constructor() {
        this.guildsConfig = new Map();
        this.tiposCache = new Map();
        this.loadConfigs();
    }

    loadConfigs() {
        try {
            if (fs.existsSync(SERVIDORES_DIR)) {
                const files = fs.readdirSync(SERVIDORES_DIR).filter(f => f.endsWith('.json'));
                files.forEach(file => {
                    const guildId = file.replace('guild-', '').replace('.json', '');
                    const data = JSON.parse(fs.readFileSync(path.join(SERVIDORES_DIR, file), 'utf8'));
                    this.guildsConfig.set(guildId, data);
                });
                console.log(`✅ Configurações de ${this.guildsConfig.size} servidores carregadas`);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar configs:', error);
        }

        try {
            const tiposFile = path.join(CONFIGS_DIR, 'tipos.json');
            if (fs.existsSync(tiposFile)) {
                const data = JSON.parse(fs.readFileSync(tiposFile, 'utf8'));
                Object.entries(data).forEach(([guildId, tipos]) => {
                    this.tiposCache.set(guildId, tipos);
                });
            }
        } catch (error) {
            console.error('❌ Erro ao carregar tipos:', error);
        }
    }

    getGuildConfig(guildId) {
        return this.guildsConfig.get(guildId) || { 
            registerChannelId: null, 
            housesChannelId: null 
        };
    }

    setRegisterChannel(guildId, channelId) {
        const config = this.getGuildConfig(guildId);
        config.registerChannelId = channelId;
        this.guildsConfig.set(guildId, config);
        this.saveGuildConfig(guildId, config);
    }

    setHousesChannel(guildId, channelId) {
        const config = this.getGuildConfig(guildId);
        config.housesChannelId = channelId;
        this.guildsConfig.set(guildId, config);
        this.saveGuildConfig(guildId, config);
    }

    saveGuildConfig(guildId, config) {
        const filePath = path.join(SERVIDORES_DIR, `guild-${guildId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    }

    getTipos(guildId) {
        return this.tiposCache.get(guildId) || { ...DEFAULT_TIPOS };
    }

    saveTipos(guildId, tipos) {
        this.tiposCache.set(guildId, tipos);
        const tiposFile = path.join(CONFIGS_DIR, 'tipos.json');
        const allTipos = {};
        for (const [key, value] of this.tiposCache) {
            allTipos[key] = value;
        }
        fs.writeFileSync(tiposFile, JSON.stringify(allTipos, null, 2));
    }

    getTipoFolder(tipo) {
        const map = {
            'Casa': 'casas',
            'Apartamento': 'apartamentos',
            'Comércio': 'comercios',
            'Delegacia': 'delegacias',
            'Autódromo': 'autodromos',
            'Outro': 'outros'
        };
        return map[tipo] || 'outros';
    }

    addHouse(houseId, houseData) {
        const folder = this.getTipoFolder(houseData.type);
        const filePath = path.join(IMOVEIS_DIR, folder, `${houseId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(houseData, null, 2));
        this.createBackup();
    }

    getHouse(houseId) {
        for (const tipo of TIPOS_IMOVEIS) {
            const filePath = path.join(IMOVEIS_DIR, tipo, `${houseId}.json`);
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        }
        return null;
    }

    updateHouse(houseId, houseData) {
        const folder = this.getTipoFolder(houseData.type);
        const filePath = path.join(IMOVEIS_DIR, folder, `${houseId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(houseData, null, 2));
        this.createBackup();
    }

    getAllHouses(guildId) {
        const houses = [];
        for (const tipo of TIPOS_IMOVEIS) {
            const dir = path.join(IMOVEIS_DIR, tipo);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                files.forEach(file => {
                    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
                    if (data.guildId === guildId) {
                        houses.push({ id: file.replace('.json', ''), ...data });
                    }
                });
            }
        }
        return houses;
    }

    getHousesByNeighborhood(guildId, neighborhood) {
        return this.getAllHouses(guildId).filter(h => h.neighborhood === neighborhood);
    }

    getUserHouses(guildId, userId) {
        return this.getAllHouses(guildId).filter(h => h.userId === userId);
    }

    deleteHouse(houseId) {
        const house = this.getHouse(houseId);
        if (!house) return false;
        
        const folder = this.getTipoFolder(house.type);
        const filePath = path.join(IMOVEIS_DIR, folder, `${houseId}.json`);
        
        if (house.localImagePath && fs.existsSync(house.localImagePath)) {
            try {
                fs.unlinkSync(house.localImagePath);
            } catch (e) {
                console.error('Erro ao deletar imagem:', e);
            }
        }
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            this.createBackup();
            return true;
        }
        return false;
    }

    generateHouseId() {
        return `ATLAS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    getGangs(guildId) {
        const filePath = path.join(CARGOS_DIR, 'gangs.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return data[guildId] || {};
        }
        return {};
    }

    saveGangs(guildId, gangs) {
        const filePath = path.join(CARGOS_DIR, 'gangs.json');
        let data = {};
        if (fs.existsSync(filePath)) {
            data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        data[guildId] = gangs;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    getPoliceRoles(guildId) {
        const filePath = path.join(CARGOS_DIR, 'policia.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return data[guildId] || [];
        }
        return [];
    }

    savePoliceRoles(guildId, roles) {
        const filePath = path.join(CARGOS_DIR, 'policia.json');
        let data = {};
        if (fs.existsSync(filePath)) {
            data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        data[guildId] = roles;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `backup_${timestamp}.json`);
            
            const backupData = {
                timestamp: new Date().toISOString(),
                imoveis: {}
            };

            for (const tipo of TIPOS_IMOVEIS) {
                const dir = path.join(IMOVEIS_DIR, tipo);
                if (fs.existsSync(dir)) {
                    backupData.imoveis[tipo] = {};
                    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                    files.forEach(file => {
                        backupData.imoveis[tipo][file] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
                    });
                }
            }

            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
            
            const files = fs.readdirSync(BACKUP_DIR);
            const now = Date.now();
            files.forEach(file => {
                const filePath = path.join(BACKUP_DIR, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                }
            });
        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
        }
    }
}

const db = new Database();
// ============================================
// SISTEMA DE LOGS
// ============================================

class Logger {
    constructor() {
        this.logFile = path.join(LOGS_DIR, `atlas_${new Date().toISOString().split('T')[0]}.log`);
    }

    log(message, type = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type}] ${message}\n`;
        console.log(logMessage.trim());
        fs.appendFileSync(this.logFile, logMessage);
    }

    houseRegistered(houseData, user) {
        this.log(
            `🏠 Imóvel registrado - ID: ${houseData.houseId} | Tipo: ${houseData.type} | Rua: ${houseData.street} | Bairro: ${houseData.neighborhood} | Usuário: ${user.tag}`,
            'REGISTER'
        );
    }

    statusChanged(houseId, oldStatus, newStatus, user) {
        this.log(
            `📝 Status alterado - ID: ${houseId} | De: ${oldStatus} Para: ${newStatus} | Usuário: ${user.tag}`,
            'STATUS'
        );
    }

    policeAction(houseId, action, reason, user) {
        this.log(
            `🚔 Ação Policial - ID: ${houseId} | Ação: ${action} | Motivo: ${reason || 'N/A'} | Oficial: ${user.tag}`,
            'POLICE'
        );
    }

    gangAction(action, gangName, user) {
        this.log(
            `💥 Gangue - Ação: ${action} | Gangue: ${gangName} | Usuário: ${user.tag}`,
            'GANG'
        );
    }

    invasion(houseId, user, ownerId) {
        this.log(
            `⚠️ Invasão - ID: ${houseId} | Invasor: ${user.tag} | Dono: ${ownerId}`,
            'INVASION'
        );
    }
}

const logger = new Logger();

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function isOwner(userId) {
    return userId === OWNER_ID;
}

function isPolice(member, guildId) {
    const policeRoles = db.getPoliceRoles(guildId);
    return member.roles.cache.some(role => policeRoles.includes(role.id));
}

function createEmbed(type, title, description, color = null) {
    const colors = {
        error: 0xFF4444,
        success: 0x44FF44,
        info: 0x44AAFF,
        warning: 0xFFA500,
        atlas: 0x8B4513,
        police: 0x0000FF,
        gang: 0xFF0000
    };
    
    const embed = new EmbedBuilder()
        .setColor(color || colors[type] || 0x8B4513)
        .setTitle(`${getEmoji(type)} ${title}`)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ 
            text: '🏠 Atlas RP • Sistema de Registro de Imóveis'
        });
    
    return embed;
}

function getEmoji(type) {
    const emojis = {
        error: '❌',
        success: '✅',
        info: 'ℹ️',
        warning: '⚠️',
        house: '🏠',
        search: '🔍',
        list: '📋',
        delete: '🗑️',
        stats: '📊',
        config: '⚙️',
        police: '👮',
        gang: '💥',
        status: '📝'
    };
    return emojis[type] || '🏠';
}

// ============================================
// EMBEDS DO SISTEMA
// ============================================

function createRegisterEmbed() {
    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('🏠 Atlas RP • Sistema de Registro de Imóveis')
        .setDescription(`
Bem-vindo ao **Atlas RP**, o sistema de registro de propriedades!

Para cadastrar uma nova propriedade, clique no botão abaixo.

**📋 Informações necessárias:**
• 🏠 **Rua/Avenida** - Endereço completo
• 📍 **Ponto de Referência** - Localização próxima
• 🌆 **Bairro** - Escolha entre as opções disponíveis
• 🎨 **Cor da Casa** - Cor predominante
• 🏷️ **Tipo de Propriedade** - Casa, Apartamento, Comércio, etc.
• 📸 **Foto do Imóvel** - Imagem da propriedade

**📍 Bairros disponíveis:**
${NEIGHBORHOODS.map(n => `${NEIGHBORHOOD_EMOJIS[n]} **${n}**`).join('\n')}

✨ **Sistema RP:**
✔️ Status de propriedade (disponível, construção, etc.)
✔️ Gangues e territórios
✔️ Ações policiais (interdição, investigação)
✔️ Registro de invasões
        `)
        .setTimestamp()
        .setFooter({ 
            text: 'Atlas RP • Clique no botão para registrar seu imóvel'
        });
    
    return embed;
}

function createHelpEmbed() {
    return new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('🏠 Atlas RP • Central de Ajuda')
        .setDescription(`
Bem-vindo à central de ajuda do **Atlas RP**!

**📌 Comandos Slash (Apenas Administrador):**
• \`/houseregister\` - Configura o canal do botão de registro
• \`/housechannel\` - Configura o canal das casas registradas

**📌 Comandos de Prefixo (\`${PREFIX}\`):**
**🏠 Imóveis:**
• \`${PREFIX}help\` - Exibe esta mensagem
• \`${PREFIX}list [bairro]\` - Lista imóveis (filtro opcional por bairro)
• \`${PREFIX}search <termo>\` - Busca imóvel por rua ou ID
• \`${PREFIX}info <id>\` - Exibe detalhes de um imóvel
• \`${PREFIX}stats\` - Estatísticas do servidor
• \`${PREFIX}neighborhoods\` - Lista bairros disponíveis

**📝 Status RP:**
• \`${PREFIX}status <id> <status>\` - Altera status (disponivel/construcao/abandonada/reforma)
• \`${PREFIX}reformar <id>\` - Atalho para "em reforma"
• \`${PREFIX}abandonar <id>\` - Atalho para "abandonada"

**💥 Gangues:**
• \`${PREFIX}gangue criar <nome> <@dono>\` - Cria gangue (Owner)
• \`${PREFIX}gangue deletar <nome>\` - Deleta gangue (Owner)
• \`${PREFIX}gangue info <nome>\` - Info da gangue
• \`${PREFIX}gangue list\` - Lista gangues
• \`${PREFIX}gangue vincular <id> <gangue>\` - Vincula imóvel (Dono da gangue)
• \`${PREFIX}gangue desvincular <id>\` - Desvincula imóvel
• \`${PREFIX}gangue membro add <@user> <gangue>\` - Adiciona membro
• \`${PREFIX}gangue membro remove <@user> <gangue>\` - Remove membro
• \`${PREFIX}gangue propriedades <nome>\` - Lista imóveis da gangue

**👮 Polícia:**
• \`${PREFIX}policia cargo add @cargo\` - Adiciona cargo policial (Owner)
• \`${PREFIX}policia cargo remove @cargo\` - Remove cargo policial (Owner)
• \`${PREFIX}policia cargos\` - Lista cargos policiais
• \`${PREFIX}interditar <id> <motivo>\` - Interdita imóvel (Polícia)
• \`${PREFIX}investigar <id>\` - Coloca sob investigação (Polícia)
• \`${PREFIX}liberar <id>\` - Libera imóvel (Polícia)

**🎭 Ações RP:**
• \`${PREFIX}vizinhanca <bairro>\` - Lista imóveis do bairro
• \`${PREFIX}minhasprops\` - Seus imóveis registrados
• \`${PREFIX}invadir <id>\` - Registra invasão RP

**🔧 Comandos Admin:**
• \`${PREFIX}backup create\` - Cria backup manual (Owner)
• \`${PREFIX}backup list\` - Lista backups (Owner)
• \`${PREFIX}export\` - Exporta dados em JSON (Owner)
• \`${PREFIX}delete <id>\` - Remove um imóvel (Owner)

**📍 Bairros disponíveis:**
${NEIGHBORHOODS.map(n => `${NEIGHBORHOOD_EMOJIS[n]} **${n}**`).join('\n')}
        `)
        .setTimestamp()
        .setFooter({ 
            text: 'Atlas RP • Seu sistema de registro imobiliário RP'
        });
}

function createStatsEmbed(guild, guildId) {
    const houses = db.getAllHouses(guildId);
    const byNeighborhood = {};
    const byType = {};
    
    NEIGHBORHOODS.forEach(n => { byNeighborhood[n] = 0; });
    TIPOS_IMOVEIS.forEach(t => { byType[t] = 0; });
    
    houses.forEach(h => { 
        byNeighborhood[h.neighborhood] = (byNeighborhood[h.neighborhood] || 0) + 1;
        const tipoFolder = db.getTipoFolder(h.type);
        byType[tipoFolder] = (byType[tipoFolder] || 0) + 1;
    });
    
    const gangs = db.getGangs(guildId);
    const config = db.getGuildConfig(guildId);
    
    return new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('📊 Atlas RP • Estatísticas do Servidor')
        .setDescription(`Estatísticas de **${guild.name}**`)
        .addFields(
            { 
                name: '⚙️ Configuração', 
                value: `
• Canal de Registro: ${config.registerChannelId ? `<#${config.registerChannelId}>` : '❌ Não configurado'}
• Canal de Imóveis: ${config.housesChannelId ? `<#${config.housesChannelId}>` : '❌ Não configurado'}
                `,
                inline: false 
            },
            { 
                name: '🏠 Total de Imóveis', 
                value: `**${houses.length}** propriedades registradas`,
                inline: false 
            },
            {
                name: '📍 Por Bairro',
                value: NEIGHBORHOODS.map(n => `${NEIGHBORHOOD_EMOJIS[n]} **${n}**: ${byNeighborhood[n] || 0}`).join('\n'),
                inline: true
            },
            {
                name: '🏷️ Por Tipo',
                value: Object.entries(DEFAULT_TIPOS).map(([nome, emoji]) => {
                    const folder = db.getTipoFolder(nome);
                    return `${emoji} **${nome}**: ${byType[folder] || 0}`;
                }).join('\n'),
                inline: true
            },
            {
                name: '💥 Gangues',
                value: Object.keys(gangs).length > 0 ? 
                    Object.keys(gangs).map(g => `• **${g}** - Dono: <@${gangs[g].ownerId}>`).join('\n') : 
                    'Nenhuma gangue registrada',
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({ 
            text: 'Atlas RP • Sistema de Estatísticas'
        });
}
// ============================================
// SLASH COMMANDS
// ============================================

const slashCommands = [
    new SlashCommandBuilder()
        .setName('houseregister')
        .setDescription('🏠 Configura o canal onde o botão de registro será enviado')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal para o embed de registro')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('housechannel')
        .setDescription('📍 Configura o canal onde os imóveis registrados serão enviados')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal para os imóveis registrados')
                .setRequired(true)
        )
];

// ============================================
// EVENTOS DO CLIENT
// ============================================

client.once('clientReady', async () => {
    console.log('='.repeat(50));
    console.log('🏠 ATLAS RP • SISTEMA DE REGISTRO DE IMÓVEIS');
    console.log('='.repeat(50));
    console.log(`✅ Bot online: ${client.user.tag}`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);
    console.log(`👑 Owner ID: ${OWNER_ID}`);
    console.log(`🔧 Prefixo: ${PREFIX}`);
    console.log('='.repeat(50));
    
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        console.log('🔄 Registrando comandos slash...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands.map(cmd => cmd.toJSON()) }
        );
        console.log('✅ Comandos slash registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
    
    const statusList = [
        `${PREFIX}help`,
        `Atlas RP`,
        `🏠 Registro de Imóveis`
    ];

    let i = 0;

    setInterval(() => {
        client.user.setPresence({
            activities: [{
                name: statusList[i],
                type: 3
            }],
            status: 'online'
        });
        i = (i + 1) % statusList.length;
    }, 10000);
    
    logger.log(`Bot iniciado: ${client.user.tag}`, 'STARTUP');
});

// ============================================
// INTERACTION HANDLER
// ============================================

client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
        const { commandName, user, guild, options } = interaction;
        
        if (!isOwner(user.id)) {
            const embed = createEmbed('error', 'Permissão Negada', `Apenas o <@${OWNER_ID}> pode usar comandos slash.`);
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        
        if (commandName === 'houseregister') {
            const channel = options.getChannel('canal');
            const botMember = guild.members.cache.get(client.user.id);
            const permissions = channel.permissionsFor(botMember);
            
            if (!permissions.has(PermissionsBitField.Flags.SendMessages) ||
                !permissions.has(PermissionsBitField.Flags.ViewChannel) ||
                !permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
                const embed = createEmbed('error', 'Permissões Insuficientes', `Preciso de permissões para Ver, Enviar Mensagens e Embed Links em ${channel}`);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            
            db.setRegisterChannel(guild.id, channel.id);
            
            const embed = createRegisterEmbed();
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('register_house')
                        .setLabel('Registrar Imóvel')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏠')
                );
            
            await channel.send({ embeds: [embed], components: [row] });
            
            const successEmbed = createEmbed('success', 'Canal Configurado', `✅ O embed de registro foi enviado em ${channel}!\n\nO sistema está pronto para receber registros.`);
            await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
            
            logger.log(`Canal de registro configurado: ${guild.name} -> #${channel.name}`, 'CONFIG');
        }
        
        if (commandName === 'housechannel') {
            const channel = options.getChannel('canal');
            const botMember = guild.members.cache.get(client.user.id);
            const permissions = channel.permissionsFor(botMember);
            
            if (!permissions.has(PermissionsBitField.Flags.SendMessages) ||
                !permissions.has(PermissionsBitField.Flags.ViewChannel) ||
                !permissions.has(PermissionsBitField.Flags.AttachFiles) ||
                !permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
                const embed = createEmbed('error', 'Permissões Insuficientes', `Preciso de permissões completas em ${channel}`);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            
            db.setHousesChannel(guild.id, channel.id);
            
            const successEmbed = createEmbed('success', 'Canal Configurado', `✅ Canal de imóveis configurado: ${channel}!\n\nTodos os registros aparecerão aqui.`);
            await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
            
            logger.log(`Canal de imóveis configurado: ${guild.name} -> #${channel.name}`, 'CONFIG');
        }
    }
    
    if (interaction.isButton()) {
        if (interaction.customId === 'register_house') {
            const modal = new ModalBuilder()
                .setCustomId('house_modal')
                .setTitle('🏠 Registrar Novo Imóvel');
            
            const streetInput = new TextInputBuilder()
                .setCustomId('street')
                .setLabel('📍 Rua/Avenida')
                .setPlaceholder('Ex: Rua das Palmeiras, 123')
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(100);
            
            const referenceInput = new TextInputBuilder()
                .setCustomId('reference')
                .setLabel('📍 Ponto de Referência')
                .setPlaceholder('Ex: Próximo ao supermercado')
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(100);
            
            const colorInput = new TextInputBuilder()
                .setCustomId('color')
                .setLabel('🎨 Cor da Casa')
                .setPlaceholder('Ex: Branca, Bege, Azul...')
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30);
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(streetInput),
                new ActionRowBuilder().addComponents(referenceInput),
                new ActionRowBuilder().addComponents(colorInput)
            );
            
            await interaction.showModal(modal);
        }
    }
    
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'house_modal') {
            const street = interaction.fields.getTextInputValue('street');
            const reference = interaction.fields.getTextInputValue('reference');
            const color = interaction.fields.getTextInputValue('color');
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('neighborhood_select')
                        .setPlaceholder('🌆 Selecione o bairro')
                        .addOptions(
                            NEIGHBORHOODS.map(n => 
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(n)
                                    .setValue(n)
                                    .setEmoji(NEIGHBORHOOD_EMOJIS[n])
                            )
                        )
                );
            
            const embed = createEmbed('info', 'Selecione o Bairro', `**📍 Rua:** ${street}\n**📍 Referência:** ${reference}\n**🎨 Cor:** ${color}\n\nSelecione o bairro do imóvel abaixo:`);
            
            const tempData = {
                street,
                reference,
                color,
                userId: interaction.user.id,
                guildId: interaction.guild.id
            };
            
            const response = await interaction.reply({ 
                embeds: [embed], 
                components: [row], 
                flags: MessageFlags.Ephemeral,
                withResponse: true
            });
            
            const collectorFilter = i => i.user.id === interaction.user.id;
            
            try {
                const confirmation = await response.resource.message.awaitMessageComponent({ 
                    filter: collectorFilter,
                    componentType: ComponentType.StringSelect,
                    time: 60000 
                });
                
                const neighborhood = confirmation.values[0];
                tempData.neighborhood = neighborhood;
                
                const tipos = db.getTipos(interaction.guild.id);
                const tipoOptions = Object.entries(tipos).map(([nome, emoji]) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(nome)
                        .setValue(nome)
                        .setEmoji(emoji)
                );
                
                const tipoRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('type_select')
                            .setPlaceholder('🏷️ Selecione o tipo de propriedade')
                            .addOptions(tipoOptions)
                    );
                
                await confirmation.update({
                    embeds: [createEmbed('success', 'Bairro Selecionado', `✅ Bairro **${neighborhood}** selecionado!\n\nAgora selecione o **TIPO** de propriedade:`)],
                    components: [tipoRow]
                });
                
                const typeConfirmation = await response.resource.message.awaitMessageComponent({
                    filter: collectorFilter,
                    componentType: ComponentType.StringSelect,
                    time: 60000
                });
                
                const tipoSelecionado = typeConfirmation.values[0];
                tempData.type = tipoSelecionado;
                
                await typeConfirmation.update({
                    embeds: [createEmbed('success', 'Tipo Selecionado', `✅ Tipo **${tipos[tipoSelecionado]} ${tipoSelecionado}** selecionado!\n\nAgora, envie a **FOTO** do imóvel neste chat.\n\n• Envie como **ANEXO**\n• Formatos: PNG, JPG, JPEG, GIF, WEBP\n• Tamanho máximo: 10MB\n• Tempo: 2 minutos`)],
                    components: []
                });
                
                const imageFilter = (m) => m.author.id === interaction.user.id && m.attachments.size > 0;
                
                try {
                    const imageMessages = await interaction.channel.awaitMessages({
                        filter: imageFilter,
                        time: 120000,
                        max: 1,
                        errors: ['time']
                    });
                    
                    const message = imageMessages.first();
                    const attachment = message.attachments.first();
                    
                    if (!attachment.contentType?.startsWith('image/')) {
                        const errorEmbed = createEmbed('error', 'Formato Inválido', 'Envie uma imagem válida (PNG, JPG, JPEG, GIF, WEBP).');
                        return interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                    
                    if (attachment.size > 10 * 1024 * 1024) {
                        const errorEmbed = createEmbed('error', 'Imagem Muito Grande', 'A imagem deve ter no máximo 10MB.');
                        return interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                    
                    const config = db.getGuildConfig(interaction.guild.id);
                    if (!config.housesChannelId) {
                        const errorEmbed = createEmbed('error', 'Canal Não Configurado', 'Use `/housechannel` primeiro.');
                        return interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                    
                    const housesChannel = interaction.guild.channels.cache.get(config.housesChannelId);
                    if (!housesChannel) {
                        const errorEmbed = createEmbed('error', 'Canal Inválido', 'Canal de imóveis não encontrado.');
                        return interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                    
                    await interaction.followUp({ content: '⏳ Processando imagem...', flags: MessageFlags.Ephemeral });
                    
                    const houseId = db.generateHouseId();
                    const imageFileName = `${houseId}_${Date.now()}.${attachment.contentType.split('/')[1] || 'png'}`;
                    const localImagePath = await downloadImage(attachment.url, imageFileName);
                    
                    const tiposEmoji = db.getTipos(interaction.guild.id);
                    const tipoEmoji = tiposEmoji[tipoSelecionado] || '🏠';
                    
                    const houseEmbed = new EmbedBuilder()
                        .setColor(0x8B4513)
                        .setTitle(`${tipoEmoji} Imóvel Registrado • ${tipoSelecionado}`)
                        .setDescription(`
**👤 Proprietário:** ${interaction.user.toString()}
**🆔 ID do Imóvel:** \`${houseId}\`

**📍 Localização:**
• **Rua/Avenida:** ${street}
• **Ponto de Referência:** ${reference}
• **Bairro:** ${NEIGHBORHOOD_EMOJIS[neighborhood]} ${neighborhood}

**🏠 Detalhes do Imóvel:**
• **Cor:** ${color}
• **Tipo:** ${tipoEmoji} ${tipoSelecionado}
• **Status:** 🟢 Disponível
• **Data do Registro:** ${new Date().toLocaleDateString('pt-BR')}
                        `)
                        .setTimestamp()
                        .setFooter({ text: `Atlas RP • ID: ${houseId} • Registrado em` });
                    
                    const imageAttachment = new AttachmentBuilder(localImagePath, { name: imageFileName });
                    
                    await housesChannel.send({ 
                        embeds: [houseEmbed],
                        files: [imageAttachment]
                    });
                    
                    const houseData = {
                        ...tempData,
                        houseId,
                        type: tipoSelecionado,
                        imageUrl: attachment.url,
                        localImagePath: localImagePath,
                        status: 'disponivel',
                        policeStatus: null,
                        interdictionReason: null,
                        gangId: null,
                        registeredAt: new Date().toISOString()
                    };
                    
                    db.addHouse(houseId, houseData);
                    
                    const successEmbed = createEmbed('success', 'Imóvel Registrado!', `✅ Imóvel registrado com sucesso!\n\n**🆔 ID:** \`${houseId}\`\n**🏷️ Tipo:** ${tipoEmoji} ${tipoSelecionado}\n**📍 Bairro:** ${neighborhood}\n**🏠 Local:** ${housesChannel}`);
                    await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
                    
                    logger.houseRegistered(houseData, interaction.user);
                    
                    try { await message.delete(); } catch (e) {}
                    
                } catch (error) {
                    if (error.name === 'CollectionError' && error.message.includes('time')) {
                        const timeoutEmbed = createEmbed('warning', 'Tempo Esgotado', 'Registro cancelado. Clique no botão novamente.');
                        return interaction.followUp({ embeds: [timeoutEmbed], flags: MessageFlags.Ephemeral });
                    }
                    throw error;
                }
                
            } catch (error) {
                console.error('Erro no processo de registro:', error);
                if (error.name !== 'CollectionError') {
                    const errorEmbed = createEmbed('error', 'Erro', 'Ocorreu um erro. Tente novamente.');
                    await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            }
        }
    }
});
// ============================================
// PREFIX COMMANDS HANDLER
// ============================================

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const guildId = message.guild.id;
    
    // ============ COMANDOS DE AJUDA E CONSULTA ============
    
    if (command === 'help') {
        const embed = createHelpEmbed();
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'list') {
        const neighborhood = args[0] ? 
            NEIGHBORHOODS.find(n => n.toLowerCase() === args[0].toLowerCase()) : null;
        
        let houses;
        if (neighborhood) {
            houses = db.getHousesByNeighborhood(guildId, neighborhood);
        } else {
            houses = db.getAllHouses(guildId);
        }
        
        if (houses.length === 0) {
            const embed = createEmbed('info', 'Nenhum Imóvel', 
                neighborhood ? `Nenhum imóvel registrado em **${neighborhood}**.` : 'Nenhum imóvel registrado ainda.'
            );
            return message.reply({ embeds: [embed] });
        }
        
        const tipos = db.getTipos(guildId);
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle(`🏠 Imóveis Registrados${neighborhood ? ` • ${neighborhood}` : ''}`)
            .setDescription(`Total: **${houses.length}** imóveis\n\n` + 
                houses.slice(0, 10).map((h, i) => {
                    const tipoEmoji = tipos[h.type] || '🏠';
                    return `${i + 1}. ${tipoEmoji} **${h.street}**\n   ${NEIGHBORHOOD_EMOJIS[h.neighborhood]} ${h.neighborhood} • 🎨 ${h.color}\n   Status: ${STATUS_OPTIONS[h.status]?.emoji || '🟢'} ${STATUS_OPTIONS[h.status]?.label || 'Disponível'}\n   🆔 \`${h.id}\``;
                }).join('\n\n') +
                (houses.length > 10 ? `\n\n*...e mais ${houses.length - 10} imóveis*` : '')
            )
            .setTimestamp()
            .setFooter({ text: `Use ${PREFIX}info <id> para detalhes` });
        
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'search') {
        const term = args.join(' ');
        if (!term) {
            const embed = createEmbed('error', 'Termo Necessário', `Use: \`${PREFIX}search <rua ou id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const houses = db.getAllHouses(guildId);
        const found = houses.find(h => 
            h.street.toLowerCase().includes(term.toLowerCase()) ||
            h.id.toLowerCase().includes(term.toLowerCase())
        );
        
        if (!found) {
            const embed = createEmbed('warning', 'Não Encontrado', `Nenhum imóvel encontrado para: **${term}**`);
            return message.reply({ embeds: [embed] });
        }
        
        let user = null;
        try {
            user = await client.users.fetch(found.userId);
        } catch (e) {}
        
        const tipos = db.getTipos(guildId);
        const tipoEmoji = tipos[found.type] || '🏠';
        const gangs = db.getGangs(guildId);
        const gangName = found.gangId ? Object.keys(gangs).find(g => gangs[g].properties?.includes(found.id)) : null;
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle(`🔍 Resultado da Busca`)
            .setDescription(`
**${tipoEmoji} Tipo:** ${found.type}
**🏠 Rua:** ${found.street}
**📍 Referência:** ${found.reference}
**🌆 Bairro:** ${NEIGHBORHOOD_EMOJIS[found.neighborhood]} ${found.neighborhood}
**🎨 Cor:** ${found.color}
**📝 Status:** ${STATUS_OPTIONS[found.status]?.emoji || '🟢'} ${STATUS_OPTIONS[found.status]?.label || 'Disponível'}
${gangName ? `**💥 Gangue:** ${gangName}` : ''}
${found.policeStatus ? `**🚔 Status Policial:** ${POLICE_STATUS[found.policeStatus]} ${found.policeStatus.toUpperCase()}${found.interdictionReason ? `\n**📋 Motivo:** ${found.interdictionReason}` : ''}` : ''}
**👤 Registrado por:** ${user ? user.tag : 'Usuário desconhecido'}
**🆔 ID:** \`${found.id}\`
**📅 Data:** ${new Date(found.registeredAt).toLocaleDateString('pt-BR')}
            `)
            .setTimestamp();
        
        if (found.localImagePath && fs.existsSync(found.localImagePath)) {
            const attachment = new AttachmentBuilder(found.localImagePath);
            embed.setImage(`attachment://${path.basename(found.localImagePath)}`);
            return message.reply({ embeds: [embed], files: [attachment] });
        }
        
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'info') {
        const id = args[0];
        if (!id) {
            const embed = createEmbed('error', 'ID Necessário', `Use: \`${PREFIX}info <id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel com ID \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        let user = null;
        try {
            user = await client.users.fetch(house.userId);
        } catch (e) {}
        
        const tipos = db.getTipos(guildId);
        const tipoEmoji = tipos[house.type] || '🏠';
        const gangs = db.getGangs(guildId);
        const gangName = house.gangId ? Object.keys(gangs).find(g => gangs[g].properties?.includes(house.id)) : null;
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle(`${tipoEmoji} Imóvel • ${house.type}`)
            .setDescription(`
**👤 Proprietário:** ${user ? user.toString() : 'Usuário desconhecido'}
**🆔 ID do Imóvel:** \`${house.id}\`

**📍 Localização:**
• **Rua/Avenida:** ${house.street}
• **Ponto de Referência:** ${house.reference}
• **Bairro:** ${NEIGHBORHOOD_EMOJIS[house.neighborhood]} ${house.neighborhood}

**🏠 Detalhes do Imóvel:**
• **Cor:** ${house.color}
• **Tipo:** ${tipoEmoji} ${house.type}
• **Status:** ${STATUS_OPTIONS[house.status]?.emoji || '🟢'} ${STATUS_OPTIONS[house.status]?.label || 'Disponível'}
${gangName ? `• **Gangue:** 💥 ${gangName}` : ''}
${house.policeStatus ? `\n**🚔 Situação Policial:**` : ''}
${house.policeStatus ? `• Status: ${POLICE_STATUS[house.policeStatus]} ${house.policeStatus.toUpperCase()}` : ''}
${house.interdictionReason ? `• Motivo: ${house.interdictionReason}` : ''}
• **Data do Registro:** ${new Date(house.registeredAt).toLocaleDateString('pt-BR')}
            `)
            .setTimestamp()
            .setFooter({ text: `Atlas RP • ID: ${house.id}` });
        
        if (house.localImagePath && fs.existsSync(house.localImagePath)) {
            const attachment = new AttachmentBuilder(house.localImagePath);
            embed.setImage(`attachment://${path.basename(house.localImagePath)}`);
            return message.reply({ embeds: [embed], files: [attachment] });
        }
        
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'stats') {
        const embed = createStatsEmbed(message.guild, guildId);
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'neighborhoods' || command === 'bairros') {
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('📍 Bairros Disponíveis')
            .setDescription(NEIGHBORHOODS.map(n => 
                `${NEIGHBORHOOD_EMOJIS[n]} **${n}** - ${db.getHousesByNeighborhood(guildId, n).length} imóveis`
            ).join('\n'))
            .setTimestamp();
        
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'vizinhanca') {
        const neighborhood = args[0] ? 
            NEIGHBORHOODS.find(n => n.toLowerCase() === args[0].toLowerCase()) : null;
        
        if (!neighborhood) {
            const embed = createEmbed('error', 'Bairro Necessário', `Use: \`${PREFIX}vizinhanca <bairro>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const houses = db.getHousesByNeighborhood(guildId, neighborhood);
        
        if (houses.length === 0) {
            const embed = createEmbed('info', 'Bairro Vazio', `Nenhum imóvel registrado em **${neighborhood}**.`);
            return message.reply({ embeds: [embed] });
        }
        
        const tipos = db.getTipos(guildId);
        const gangs = db.getGangs(guildId);
        
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle(`${NEIGHBORHOOD_EMOJIS[neighborhood]} Vizinhos • ${neighborhood}`)
            .setDescription(houses.map((h, i) => {
                const tipoEmoji = tipos[h.type] || '🏠';
                const gangName = h.gangId ? Object.keys(gangs).find(g => gangs[g].properties?.includes(h.id)) : null;
                return `${i + 1}. ${tipoEmoji} **${h.street}**\n   👤 <@${h.userId}>\n   Status: ${STATUS_OPTIONS[h.status]?.emoji || '🟢'} ${STATUS_OPTIONS[h.status]?.label || 'Disponível'}\n   ${gangName ? `💥 Gangue: ${gangName}` : ''}`;
            }).join('\n\n'))
            .setTimestamp()
            .setFooter({ text: `${houses.length} imóveis neste bairro` });
        
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'minhasprops') {
        const houses = db.getUserHouses(guildId, message.author.id);
        
        if (houses.length === 0) {
            const embed = createEmbed('info', 'Nenhum Imóvel', 'Você não tem imóveis registrados.');
            return message.reply({ embeds: [embed] });
        }
        
        const tipos = db.getTipos(guildId);
        const embed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle('🏠 Meus Imóveis')
            .setDescription(houses.map((h, i) => {
                const tipoEmoji = tipos[h.type] || '🏠';
                return `${i + 1}. ${tipoEmoji} **${h.street}**\n   ${NEIGHBORHOOD_EMOJIS[h.neighborhood]} ${h.neighborhood}\n   Status: ${STATUS_OPTIONS[h.status]?.emoji || '🟢'} ${STATUS_OPTIONS[h.status]?.label || 'Disponível'}\n   🆔 \`${h.id}\``;
            }).join('\n\n'))
            .setTimestamp()
            .setFooter({ text: `Total: ${houses.length} imóveis` });
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============ COMANDOS DE STATUS RP ============
    
    if (command === 'status') {
        const id = args[0];
        const newStatus = args[1]?.toLowerCase();
        
        if (!id || !newStatus) {
            const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}status <id> <disponivel/construcao/abandonada/reforma>\``);
            return message.reply({ embeds: [embed] });
        }
        
        if (!STATUS_OPTIONS[newStatus]) {
            const embed = createEmbed('error', 'Status Inválido', 'Status deve ser: disponivel, construcao, abandonada, reforma');
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        if (house.userId !== message.author.id) {
            const embed = createEmbed('error', 'Permissão Negada', 'Apenas o proprietário pode alterar o status.');
            return message.reply({ embeds: [embed] });
        }
        
        if (house.policeStatus) {
            const embed = createEmbed('error', 'Ação Bloqueada', `Este imóvel está ${POLICE_STATUS[house.policeStatus]} **${house.policeStatus.toUpperCase()}** pela polícia. Status não pode ser alterado.`);
            return message.reply({ embeds: [embed] });
        }
        
        const oldStatus = house.status;
        house.status = newStatus;
        db.updateHouse(id, house);
        
        const embed = createEmbed('success', 'Status Atualizado', `✅ Status do imóvel \`${id}\` alterado:\n\n${STATUS_OPTIONS[oldStatus]?.emoji || '🟢'} ${oldStatus} → ${STATUS_OPTIONS[newStatus].emoji} **${STATUS_OPTIONS[newStatus].label}**`);
        
        logger.statusChanged(id, oldStatus, newStatus, message.author);
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'reformar') {
        const id = args[0];
        if (!id) {
            const embed = createEmbed('error', 'ID Necessário', `Use: \`${PREFIX}reformar <id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        if (house.userId !== message.author.id) {
            const embed = createEmbed('error', 'Permissão Negada', 'Apenas o proprietário pode alterar o status.');
            return message.reply({ embeds: [embed] });
        }
        
        if (house.policeStatus) {
            const embed = createEmbed('error', 'Ação Bloqueada', `Imóvel sob ação policial. Status não pode ser alterado.`);
            return message.reply({ embeds: [embed] });
        }
        
        house.status = 'reforma';
        db.updateHouse(id, house);
        
        const embed = createEmbed('success', 'Em Reforma', `🔨 Imóvel \`${id}\` agora está **EM REFORMA**.`);
        logger.statusChanged(id, 'disponivel', 'reforma', message.author);
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'abandonar') {
        const id = args[0];
        if (!id) {
            const embed = createEmbed('error', 'ID Necessário', `Use: \`${PREFIX}abandonar <id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        if (house.userId !== message.author.id) {
            const embed = createEmbed('error', 'Permissão Negada', 'Apenas o proprietário pode alterar o status.');
            return message.reply({ embeds: [embed] });
        }
        
        if (house.policeStatus) {
            const embed = createEmbed('error', 'Ação Bloqueada', `Imóvel sob ação policial. Status não pode ser alterado.`);
            return message.reply({ embeds: [embed] });
        }
        
        house.status = 'abandonada';
        db.updateHouse(id, house);
        
        const embed = createEmbed('success', 'Abandonada', `🏚️ Imóvel \`${id}\` agora está **ABANDONADO**.`);
        logger.statusChanged(id, 'disponivel', 'abandonada', message.author);
        return message.reply({ embeds: [embed] });
    }
    
    // ============ COMANDOS DE GANGUES ============
    
    if (command === 'gangue') {
        const subCommand = args[0]?.toLowerCase();
        
        if (subCommand === 'criar') {
            if (!isOwner(message.author.id)) {
                const embed = createEmbed('error', 'Permissão Negada', `Apenas o <@${OWNER_ID}> pode criar gangues.`);
                return message.reply({ embeds: [embed] });
            }
            
            const gangName = args[1];
            const ownerMention = args[2];
            
            if (!gangName || !ownerMention) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue criar <nome> <@dono>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const ownerId = ownerMention.replace(/[<@!>]/g, '');
            
            client.users.fetch(ownerId).then(owner => {
                const gangs = db.getGangs(guildId);
                
                if (gangs[gangName]) {
                    const embed = createEmbed('error', 'Já Existe', `A gangue **${gangName}** já existe.`);
                    return message.reply({ embeds: [embed] });
                }
                
                gangs[gangName] = {
                    ownerId: owner.id,
                    members: [owner.id],
                    properties: [],
                    createdAt: new Date().toISOString()
                };
                
                db.saveGangs(guildId, gangs);
                
                const embed = createEmbed('success', 'Gangue Criada', `💥 Gangue **${gangName}** criada com sucesso!\n\n**👑 Dono:** ${owner.toString()}\n**👥 Membros:** 1`);
                logger.gangAction('CRIAR', gangName, message.author);
                return message.reply({ embeds: [embed] });
            }).catch(() => {
                const embed = createEmbed('error', 'Usuário Inválido', 'Dono da gangue não encontrado.');
                return message.reply({ embeds: [embed] });
            });
        }
        
        else if (subCommand === 'deletar') {
            if (!isOwner(message.author.id)) {
                const embed = createEmbed('error', 'Permissão Negada', `Apenas o <@${OWNER_ID}> pode deletar gangues.`);
                return message.reply({ embeds: [embed] });
            }
            
            const gangName = args[1];
            if (!gangName) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue deletar <nome>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const gangs = db.getGangs(guildId);
            
            if (!gangs[gangName]) {
                const embed = createEmbed('error', 'Não Encontrada', `Gangue **${gangName}** não existe.`);
                return message.reply({ embeds: [embed] });
            }
            
            const allHouses = db.getAllHouses(guildId);
            gangs[gangName].properties.forEach(propId => {
                const house = allHouses.find(h => h.id === propId);
                if (house) {
                    house.gangId = null;
                    db.updateHouse(propId, house);
                }
            });
            
            delete gangs[gangName];
            db.saveGangs(guildId, gangs);
            
            const embed = createEmbed('success', 'Gangue Deletada', `💥 Gangue **${gangName}** foi deletada. Propriedades desvinculadas.`);
            logger.gangAction('DELETAR', gangName, message.author);
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'info') {
            const gangName = args[1];
            if (!gangName) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue info <nome>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const gangs = db.getGangs(guildId);
            
            if (!gangs[gangName]) {
                const embed = createEmbed('error', 'Não Encontrada', `Gangue **${gangName}** não existe.`);
                return message.reply({ embeds: [embed] });
            }
            
            const gang = gangs[gangName];
            
            client.users.fetch(gang.ownerId).then(owner => {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`💥 Gangue: ${gangName}`)
                    .setDescription(`
**👑 Dono:** ${owner.toString()}
**👥 Membros:** ${gang.members.length}
**🏠 Propriedades:** ${gang.properties.length}
**📅 Criada em:** ${new Date(gang.createdAt).toLocaleDateString('pt-BR')}
                    `)
                    .addFields(
                        {
                            name: '👥 Membros',
                            value: gang.members.length > 0 ? 
                                gang.members.slice(0, 10).map(m => `<@${m}>`).join('\n') : 
                                'Nenhum membro',
                            inline: true
                        },
                        {
                            name: '🏠 Propriedades',
                            value: gang.properties.length > 0 ? 
                                gang.properties.slice(0, 10).map(p => `\`${p}\``).join('\n') : 
                                'Nenhuma propriedade',
                            inline: true
                        }
                    )
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }).catch(() => {
                const embed = createEmbed('error', 'Erro', 'Não foi possível obter informações do dono.');
                return message.reply({ embeds: [embed] });
            });
        }
        
        else if (subCommand === 'list') {
            const gangs = db.getGangs(guildId);
            const gangNames = Object.keys(gangs);
            
            if (gangNames.length === 0) {
                const embed = createEmbed('info', 'Nenhuma Gangue', 'Não há gangues registradas.');
                return message.reply({ embeds: [embed] });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('💥 Gangues Registradas')
                .setDescription(gangNames.map(name => {
                    const gang = gangs[name];
                    return `**${name}**\n👑 <@${gang.ownerId}>\n👥 ${gang.members.length} membros | 🏠 ${gang.properties.length} propriedades`;
                }).join('\n\n'))
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'vincular') {
            const imovelId = args[1];
            const gangName = args[2];
            
            if (!imovelId || !gangName) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue vincular <id_imovel> <nome_gangue>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const gangs = db.getGangs(guildId);
            
            if (!gangs[gangName]) {
                const embed = createEmbed('error', 'Não Encontrada', `Gangue **${gangName}** não existe.`);
                return message.reply({ embeds: [embed] });
            }
            
            if (gangs[gangName].ownerId !== message.author.id) {
                const embed = createEmbed('error', 'Permissão Negada', 'Apenas o dono da gangue pode vincular propriedades.');
                return message.reply({ embeds: [embed] });
            }
            
            const house = db.getHouse(imovelId);
            if (!house || house.guildId !== guildId) {
                const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${imovelId}\` não encontrado.`);
                return message.reply({ embeds: [embed] });
            }
            
            if (house.gangId) {
                const embed = createEmbed('error', 'Já Vinculado', `Este imóvel já pertence a uma gangue.`);
                return message.reply({ embeds: [embed] });
            }
            
            house.gangId = gangName;
            db.updateHouse(imovelId, house);
            
            gangs[gangName].properties.push(imovelId);
            db.saveGangs(guildId, gangs);
            
            const embed = createEmbed('success', 'Vinculado', `✅ Imóvel \`${imovelId}\` vinculado à gangue **${gangName}**!`);
            logger.gangAction('VINCULAR', gangName, message.author);
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'desvincular') {
            const imovelId = args[1];
            
            if (!imovelId) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue desvincular <id_imovel>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const house = db.getHouse(imovelId);
            if (!house || house.guildId !== guildId) {
                const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${imovelId}\` não encontrado.`);
                return message.reply({ embeds: [embed] });
            }
            
            if (!house.gangId) {
                const embed = createEmbed('error', 'Não Vinculado', 'Este imóvel não pertence a nenhuma gangue.');
                return message.reply({ embeds: [embed] });
            }
            
            const gangs = db.getGangs(guildId);
            const gangName = house.gangId;
            
            if (gangs[gangName].ownerId !== message.author.id) {
                const embed = createEmbed('error', 'Permissão Negada', 'Apenas o dono da gangue pode desvincular propriedades.');
                return message.reply({ embeds: [embed] });
            }
            
            house.gangId = null;
            db.updateHouse(imovelId, house);
            
            gangs[gangName].properties = gangs[gangName].properties.filter(p => p !== imovelId);
            db.saveGangs(guildId, gangs);
            
            const embed = createEmbed('success', 'Desvinculado', `✅ Imóvel \`${imovelId}\` desvinculado da gangue **${gangName}**!`);
            logger.gangAction('DESVINCULAR', gangName, message.author);
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'membro' && args[1] === 'add') {
            const userMention = args[2];
            const gangName = args[3];
            
            if (!userMention || !gangName) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue membro add <@user> <gangue>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const userId = userMention.replace(/[<@!>]/g, '');
            
            const gangs = db.getGangs(guildId);
            
            if (!gangs[gangName]) {
                const embed = createEmbed('error', 'Não Encontrada', `Gangue **${gangName}** não existe.`);
                return message.reply({ embeds: [embed] });
            }
            
            if (gangs[gangName].ownerId !== message.author.id) {
                const embed = createEmbed('error', 'Permissão Negada', 'Apenas o dono da gangue pode adicionar membros.');
                return message.reply({ embeds: [embed] });
            }
            
            if (gangs[gangName].members.includes(userId)) {
                const embed = createEmbed('error', 'Já é Membro', 'Este usuário já é membro da gangue.');
                return message.reply({ embeds: [embed] });
            }
            
            gangs[gangName].members.push(userId);
            db.saveGangs(guildId, gangs);
            
            const embed = createEmbed('success', 'Membro Adicionado', `✅ <@${userId}> adicionado à gangue **${gangName}**!`);
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'membro' && args[1] === 'remove') {
            const userMention = args[2];
            const gangName = args[3];
            
            if (!userMention || !gangName) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue membro remove <@user> <gangue>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const userId = userMention.replace(/[<@!>]/g, '');
            
            const gangs = db.getGangs(guildId);
            
            if (!gangs[gangName]) {
                const embed = createEmbed('error', 'Não Encontrada', `Gangue **${gangName}** não existe.`);
                return message.reply({ embeds: [embed] });
            }
            
            if (gangs[gangName].ownerId !== message.author.id) {
                const embed = createEmbed('error', 'Permissão Negada', 'Apenas o dono da gangue pode remover membros.');
                return message.reply({ embeds: [embed] });
            }
            
            if (userId === gangs[gangName].ownerId) {
                const embed = createEmbed('error', 'Ação Inválida', 'Não pode remover o dono da gangue.');
                return message.reply({ embeds: [embed] });
            }
            
            gangs[gangName].members = gangs[gangName].members.filter(m => m !== userId);
            db.saveGangs(guildId, gangs);
            
            const embed = createEmbed('success', 'Membro Removido', `✅ <@${userId}> removido da gangue **${gangName}**!`);
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'propriedades') {
            const gangName = args[1];
            if (!gangName) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}gangue propriedades <nome>\``);
                return message.reply({ embeds: [embed] });
            }
            
            const gangs = db.getGangs(guildId);
            
            if (!gangs[gangName]) {
                const embed = createEmbed('error', 'Não Encontrada', `Gangue **${gangName}** não existe.`);
                return message.reply({ embeds: [embed] });
            }
            
            const properties = gangs[gangName].properties;
            
            if (properties.length === 0) {
                const embed = createEmbed('info', 'Nenhuma Propriedade', `A gangue **${gangName}** não possui propriedades.`);
                return message.reply({ embeds: [embed] });
            }
            
            const tipos = db.getTipos(guildId);
            const housesList = properties.map(id => {
                const house = db.getHouse(id);
                if (house) {
                    const tipoEmoji = tipos[house.type] || '🏠';
                    return `${tipoEmoji} **${house.street}** - ${NEIGHBORHOOD_EMOJIS[house.neighborhood]} ${house.neighborhood} - \`${id}\``;
                }
                return `❓ Imóvel não encontrado - \`${id}\``;
            });
            
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`🏠 Propriedades da Gangue ${gangName}`)
                .setDescription(housesList.join('\n'))
                .setTimestamp()
                .setFooter({ text: `Total: ${properties.length} propriedades` });
            
            return message.reply({ embeds: [embed] });
        }
        
        else {
            const embed = createEmbed('info', 'Comando Gangue', `
Use:
\`${PREFIX}gangue criar <nome> <@dono>\` - Criar gangue (Owner)
\`${PREFIX}gangue deletar <nome>\` - Deletar gangue (Owner)
\`${PREFIX}gangue info <nome>\` - Info da gangue
\`${PREFIX}gangue list\` - Listar gangues
\`${PREFIX}gangue vincular <id> <gangue>\` - Vincular imóvel (Dono)
\`${PREFIX}gangue desvincular <id>\` - Desvincular imóvel (Dono)
\`${PREFIX}gangue membro add <@user> <gangue>\` - Adicionar membro (Dono)
\`${PREFIX}gangue membro remove <@user> <gangue>\` - Remover membro (Dono)
\`${PREFIX}gangue propriedades <nome>\` - Listar propriedades
            `);
            return message.reply({ embeds: [embed] });
        }
    }
    
    // ============ COMANDOS DE POLÍCIA ============
    
    if (command === 'policia') {
        const subCommand = args[0]?.toLowerCase();
        
        if (!isOwner(message.author.id)) {
            const embed = createEmbed('error', 'Permissão Negada', `Apenas o <@${OWNER_ID}> pode gerenciar cargos policiais.`);
            return message.reply({ embeds: [embed] });
        }
        
        if (subCommand === 'cargo' && args[1] === 'add') {
            const roleMention = args[2];
            
            if (!roleMention) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}policia cargo add @cargo\``);
                return message.reply({ embeds: [embed] });
            }
            
            const roleId = roleMention.replace(/[<@&>]/g, '');
            const role = message.guild.roles.cache.get(roleId);
            
            if (!role) {
                const embed = createEmbed('error', 'Cargo Inválido', 'Cargo não encontrado no servidor.');
                return message.reply({ embeds: [embed] });
            }
            
            const policeRoles = db.getPoliceRoles(guildId);
            
            if (policeRoles.includes(role.id)) {
                const embed = createEmbed('error', 'Já Existe', 'Este cargo já está configurado como policial.');
                return message.reply({ embeds: [embed] });
            }
            
            policeRoles.push(role.id);
            db.savePoliceRoles(guildId, policeRoles);
            
            const embed = createEmbed('success', 'Cargo Adicionado', `👮 Cargo ${role.toString()} adicionado como autoridade policial.`);
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'cargo' && args[1] === 'remove') {
            const roleMention = args[2];
            
            if (!roleMention) {
                const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}policia cargo remove @cargo\``);
                return message.reply({ embeds: [embed] });
            }
            
            const roleId = roleMention.replace(/[<@&>]/g, '');
            const policeRoles = db.getPoliceRoles(guildId);
            
            if (!policeRoles.includes(roleId)) {
                const embed = createEmbed('error', 'Não Encontrado', 'Este cargo não está na lista de policiais.');
                return message.reply({ embeds: [embed] });
            }
            
            const updatedRoles = policeRoles.filter(r => r !== roleId);
            db.savePoliceRoles(guildId, updatedRoles);
            
            const embed = createEmbed('success', 'Cargo Removido', `👮 Cargo <@&${roleId}> removido das autoridades policiais.`);
            return message.reply({ embeds: [embed] });
        }
        
        else if (subCommand === 'cargos') {
            const policeRoles = db.getPoliceRoles(guildId);
            
            if (policeRoles.length === 0) {
                const embed = createEmbed('info', 'Nenhum Cargo', 'Não há cargos policiais configurados.');
                return message.reply({ embeds: [embed] });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x0000FF)
                .setTitle('👮 Cargos Policiais')
                .setDescription(policeRoles.map(r => `• <@&${r}>`).join('\n'))
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        else {
            const embed = createEmbed('info', 'Comando Polícia', `
Use:
\`${PREFIX}policia cargo add @cargo\` - Adicionar cargo policial (Owner)
\`${PREFIX}policia cargo remove @cargo\` - Remover cargo policial (Owner)
\`${PREFIX}policia cargos\` - Listar cargos policiais
            `);
            return message.reply({ embeds: [embed] });
        }
    }
    
    // ============ AÇÕES POLICIAIS ============
    
    if (command === 'interditar') {
        if (!isPolice(message.member, guildId)) {
            const embed = createEmbed('error', 'Permissão Negada', 'Apenas policiais podem interditar imóveis.');
            return message.reply({ embeds: [embed] });
        }
        
        const id = args[0];
        const reason = args.slice(1).join(' ');
        
        if (!id || !reason) {
            const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}interditar <id> <motivo>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        house.policeStatus = 'interditada';
        house.interdictionReason = reason;
        db.updateHouse(id, house);
        
        const embed = createEmbed('police', 'Imóvel Interditado', `🚫 Imóvel \`${id}\` foi **INTERDITADO**.\n\n**📋 Motivo:** ${reason}\n**👮 Oficial:** ${message.author.toString()}`);
        
        logger.policeAction(id, 'INTERDITAR', reason, message.author);
        
        const config = db.getGuildConfig(guildId);
        if (config.housesChannelId) {
            const channel = message.guild.channels.cache.get(config.housesChannelId);
            if (channel) {
                const notifEmbed = new EmbedBuilder()
                    .setColor(0x0000FF)
                    .setTitle('🚫 Ação Policial - Interdição')
                    .setDescription(`O imóvel \`${id}\` foi interditado por ${message.author.toString()}.\n**Motivo:** ${reason}`)
                    .setTimestamp();
                channel.send({ embeds: [notifEmbed] }).catch(() => {});
            }
        }
        
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'investigar') {
        if (!isPolice(message.member, guildId)) {
            const embed = createEmbed('error', 'Permissão Negada', 'Apenas policiais podem investigar imóveis.');
            return message.reply({ embeds: [embed] });
        }
        
        const id = args[0];
        
        if (!id) {
            const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}investigar <id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        house.policeStatus = 'investigada';
        house.interdictionReason = null;
        db.updateHouse(id, house);
        
        const embed = createEmbed('police', 'Sob Investigação', `🔍 Imóvel \`${id}\` está agora **SOB INVESTIGAÇÃO** policial.\n\n**👮 Oficial:** ${message.author.toString()}`);
        
        logger.policeAction(id, 'INVESTIGAR', null, message.author);
        
        const config = db.getGuildConfig(guildId);
        if (config.housesChannelId) {
            const channel = message.guild.channels.cache.get(config.housesChannelId);
            if (channel) {
                const notifEmbed = new EmbedBuilder()
                    .setColor(0x0000FF)
                    .setTitle('🔍 Ação Policial - Investigação')
                    .setDescription(`O imóvel \`${id}\` está sob investigação por ${message.author.toString()}.`)
                    .setTimestamp();
                channel.send({ embeds: [notifEmbed] }).catch(() => {});
            }
        }
        
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'liberar') {
        if (!isPolice(message.member, guildId)) {
            const embed = createEmbed('error', 'Permissão Negada', 'Apenas policiais podem liberar imóveis.');
            return message.reply({ embeds: [embed] });
        }
        
        const id = args[0];
        
        if (!id) {
            const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}liberar <id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        if (!house.policeStatus) {
            const embed = createEmbed('error', 'Não Restrito', 'Este imóvel não está sob ação policial.');
            return message.reply({ embeds: [embed] });
        }
        
        house.policeStatus = null;
        house.interdictionReason = null;
        db.updateHouse(id, house);
        
        const embed = createEmbed('success', 'Imóvel Liberado', `✅ Imóvel \`${id}\` foi **LIBERADO** pela polícia.\n\n**👮 Oficial:** ${message.author.toString()}`);
        
        logger.policeAction(id, 'LIBERAR', null, message.author);
        
        const config = db.getGuildConfig(guildId);
        if (config.housesChannelId) {
            const channel = message.guild.channels.cache.get(config.housesChannelId);
            if (channel) {
                const notifEmbed = new EmbedBuilder()
                    .setColor(0x44FF44)
                    .setTitle('✅ Ação Policial - Liberação')
                    .setDescription(`O imóvel \`${id}\` foi liberado por ${message.author.toString()}.`)
                    .setTimestamp();
                channel.send({ embeds: [notifEmbed] }).catch(() => {});
            }
        }
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============ AÇÃO RP - INVASÃO ============
    
    if (command === 'invadir') {
        const id = args[0];
        
        if (!id) {
            const embed = createEmbed('error', 'Uso Correto', `Use: \`${PREFIX}invadir <id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        let dono = null;
        try {
            dono = await client.users.fetch(house.userId);
        } catch (e) {}
        
        logger.invasion(id, message.author, house.userId);
        
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ Ação RP - Invasão')
            .setDescription(`
**🏠 Imóvel:** ${house.street} - \`${id}\`
**👤 Invasor:** ${message.author.toString()}
**👤 Proprietário:** ${dono ? dono.toString() : 'Desconhecido'}
**🕒 Horário:** ${new Date().toLocaleString('pt-BR')}

⚠️ Esta ação foi registrada para fins de RP.
            `)
            .setTimestamp();
        
        const config = db.getGuildConfig(guildId);
        if (config.housesChannelId) {
            const channel = message.guild.channels.cache.get(config.housesChannelId);
            if (channel) {
                await channel.send({ 
                    content: dono ? `${dono.toString()} ⚠️ Seu imóvel foi invadido!` : '⚠️ Invasão registrada!',
                    embeds: [embed] 
                }).catch(() => {});
            }
        }
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============ COMANDOS DE ADMIN ============
    
    if (command === 'delete') {
        if (!isOwner(message.author.id)) {
            const embed = createEmbed('error', 'Permissão Negada', `Apenas o <@${OWNER_ID}> pode usar este comando.`);
            return message.reply({ embeds: [embed] });
        }
        
        const id = args[0];
        if (!id) {
            const embed = createEmbed('error', 'ID Necessário', `Use: \`${PREFIX}delete <id>\``);
            return message.reply({ embeds: [embed] });
        }
        
        const house = db.getHouse(id);
        if (!house || house.guildId !== guildId) {
            const embed = createEmbed('error', 'Não Encontrado', `Imóvel com ID \`${id}\` não encontrado.`);
            return message.reply({ embeds: [embed] });
        }
        
        if (house.gangId) {
            const gangs = db.getGangs(guildId);
            if (gangs[house.gangId]) {
                gangs[house.gangId].properties = gangs[house.gangId].properties.filter(p => p !== id);
                db.saveGangs(guildId, gangs);
            }
        }
        
        db.deleteHouse(id);
        
        const embed = createEmbed('success', 'Imóvel Removido', `🗑️ Imóvel **${house.street}** (${id}) foi removido do sistema.`);
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'backup') {
        if (!isOwner(message.author.id)) {
            const embed = createEmbed('error', 'Permissão Negada', `Apenas o <@${OWNER_ID}> pode usar este comando.`);
            return message.reply({ embeds: [embed] });
        }
        
        const action = args[0];
        
        if (action === 'create') {
            db.createBackup();
            const embed = createEmbed('success', 'Backup Criado', '✅ Backup manual criado com sucesso!');
            return message.reply({ embeds: [embed] });
        }
        
        if (action === 'list') {
            const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
            
            if (files.length === 0) {
                const embed = createEmbed('info', 'Nenhum Backup', 'Não há backups disponíveis.');
                return message.reply({ embeds: [embed] });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle('💾 Backups Disponíveis')
                .setDescription(files.slice(0, 10).map((f, i) => {
                    const stats = fs.statSync(path.join(BACKUP_DIR, f));
                    return `${i + 1}. **${f}** - ${stats.mtime.toLocaleString('pt-BR')} (${(stats.size / 1024).toFixed(1)} KB)`;
                }).join('\n'))
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        const embed = createEmbed('info', 'Comando Backup', `Use:\n\`${PREFIX}backup create\` - Criar backup\n\`${PREFIX}backup list\` - Listar backups`);
        return message.reply({ embeds: [embed] });
    }
    
    if (command === 'export' || command === 'exportar') {
        if (!isOwner(message.author.id)) {
            const embed = createEmbed('error', 'Permissão Negada', `Apenas o <@${OWNER_ID}> pode usar este comando.`);
            return message.reply({ embeds: [embed] });
        }
        
        const houses = db.getAllHouses(guildId);
        const config = db.getGuildConfig(guildId);
        const gangs = db.getGangs(guildId);
        const police = db.getPoliceRoles(guildId);
        
        const exportData = {
            exportedAt: new Date().toISOString(),
            guild: { id: message.guild.id, name: message.guild.name },
            config,
            policeRoles: police,
            gangs,
            houses: houses.map(h => {
                const { localImagePath, ...rest } = h;
                return rest;
            }),
            totals: {
                houses: houses.length,
                gangs: Object.keys(gangs).length
            }
        };
        
        const fileName = `export_${guildId}_${Date.now()}.json`;
        const filePath = path.join(DATA_DIR, fileName);
        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
        
        const embed = createEmbed('success', 'Dados Exportados', `✅ **${houses.length}** imóveis e **${Object.keys(gangs).length}** gangues exportados!\n📁 Arquivo: \`${fileName}\``);
        
        await message.reply({ 
            embeds: [embed],
            files: [filePath]
        });
        
        setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }, 60000);
    }
});

// ============================================
// EVENTOS DE SERVIDOR
// ============================================

client.on('guildCreate', async (guild) => {
    console.log(`✅ Novo servidor: ${guild.name} (${guild.id})`);
    
    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('🏠 Atlas RP • Obrigado por me adicionar!')
        .setDescription(`
Olá! Sou o **Atlas RP**, seu sistema de registro de imóveis para Roleplay!

**📋 Para começar:**
1️⃣ O <@${OWNER_ID}> deve usar \`/houseregister\` para configurar o canal de registro
2️⃣ Use \`/housechannel\` para definir onde os imóveis aparecerão
3️⃣ Configure os cargos policiais com \`${PREFIX}policia cargo add @cargo\`
4️⃣ Crie gangues com \`${PREFIX}gangue criar <nome> <@dono>\`
5️⃣ Pronto! O sistema estará ativo!

**🔧 Comandos disponíveis:**
• Prefixo: \`${PREFIX}\`
• Use \`${PREFIX}help\` para ver todos os comandos

**✨ Funcionalidades RP:**
✔️ Registro com tipos (Casa, Apartamento, Comércio, etc.)
✔️ Status RP (disponível, construção, abandonada, reforma)
✔️ Sistema de gangues e territórios
✔️ Ações policiais (interdição, investigação)
✔️ Registro de invasões

**📍 Bairros configurados:**
${NEIGHBORHOODS.map(n => `${NEIGHBORHOOD_EMOJIS[n]} **${n}**`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Obrigado por escolher o Atlas RP! 🏠
        `)
        .setTimestamp()
        .setFooter({ 
            text: 'Atlas RP • Sistema de Registro Imobiliário para Roleplay'
        });
    
    const systemChannel = guild.systemChannel || guild.channels.cache.find(ch => 
        ch.name.includes('geral') || ch.name.includes('general') || ch.name.includes('chat')
    );
    
    if (systemChannel && systemChannel.permissionsFor(guild.members.me).has('SendMessages')) {
        await systemChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    }
    
    logger.log(`Bot adicionado ao servidor: ${guild.name}`, 'GUILD_ADD');
});

client.on('guildDelete', async (guild) => {
    console.log(`❌ Removido do servidor: ${guild.name} (${guild.id})`);
    logger.log(`Bot removido do servidor: ${guild.name}`, 'GUILD_REMOVE');
});

// ============================================
// INICIALIZAÇÃO
// ============================================

console.log('='.repeat(50));
console.log('🏠 ATLAS RP • INICIANDO SISTEMA');
console.log('='.repeat(50));

client.login(process.env.TOKEN);

// Tratamento de erros
client.on('error', (error) => {
    console.error('❌ Erro no cliente:', error);
    logger.log(`Erro no cliente: ${error.message}`, 'ERROR');
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Promise rejeitada:', error);
    logger.log(`Promise rejeitada: ${error.message}`, 'ERROR');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando Atlas RP...');
    logger.log('Bot encerrado manualmente', 'SHUTDOWN');
    process.exit(0);
});
