/**
 * Madmax-md A WhatsApp Bot
 * Copyright (c) 2026 Skilli Tech 
 * Website: https://nabees.online/
 */

// ==================== MULTI-SESSION SUPPORT ====================
const IS_SUB_BOT = process.env.IS_SUB_BOT === 'true';
const SUB_BOT_NUMBER = process.env.SUB_BOT_NUMBER || null;
const SUB_BOT_FOLDER = process.env.SUB_BOT_FOLDER || null;

let SESSION_PATH = './session';

if (IS_SUB_BOT && SUB_BOT_FOLDER) {
    SESSION_PATH = SUB_BOT_FOLDER;
    console.log(`[SubBot] Starting for: ${SUB_BOT_NUMBER}`);
} else {
    console.log(`[MainBot] Starting main bot`);
}
// ================================================================

const settings = require('./settings');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const axios = require('axios');
const os = require('os');
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const { smsg } = require('./lib/myfunc');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");
const readline = require("readline");
const { rmSync } = require('fs');

// Import the unified reaction helper
const { autoReactToMessage } = require('./lib/reactions');

// ========== MULTI-NEWSLETTER CONFIGURATION ==========
const NEWSLETTERS = [
    { jid: '120363367299421766@newsletter', name: 'MADMAX MD', autoReact: true },
    { jid: '120363418816505294@newsletter', name: 'MADMAX UPDATES', autoReact: true },
    { jid: '120363406597315006@newsletter', name: 'MADMAX NEWS', autoReact: true }
];

const AUTO_JOIN_GROUPS = [
    'https://chat.whatsapp.com/C61EOA6kePFKqLp1W0DrRz',
    'https://chat.whatsapp.com/C61EOA6kePFKqLp1W0DrRz'
];

// ========== SPECIFIC GROUPS FOR AUTO-REACTION ==========
const AUTO_REACT_GROUPS = [
    '120363419585131235@g.us',
    '120363407011406267@g.us',
    '120363398733768512@g.us',
    '120363404858420688@g.us'
];
// ============================================================

// ========== AUTO-UPDATE CHECKER ==========
let updateAvailable = false;
let latestVersion = null;
let changelog = null;

async function getCurrentVersion() {
    try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            return pkg.version || '1.0.0';
        }
    } catch (e) {}
    return settings.version || '1.0.0';
}

async function checkForUpdates() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/Nabaikabaia/Batman-md/main/package.json', {
            timeout: 10000,
            headers: { 'User-Agent': 'MADMAX-MD/1.0' }
        });
        const remoteVersion = response.data.version || '1.0.0';
        const currentVersion = await getCurrentVersion();
        
        if (remoteVersion !== currentVersion) {
            updateAvailable = true;
            latestVersion = remoteVersion;
            
            try {
                const changelogRes = await axios.get('https://raw.githubusercontent.com/Nabaikabaia/Batman-md/main/updates.md', {
                    timeout: 10000
                });
                changelog = changelogRes.data;
            } catch (e) {}
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}
// ==========================================

// ========== HEADER STYLE ==========
const HDR_TOP = '┌❏';
const HDR_LINE = '├❏';
const HDR_BOTTOM = '└❏';

function formatHeader(title, lines) {
    let result = `${HDR_TOP} *${title}* ❏\n`;
    result += `│\n`;
    lines.forEach(line => {
        result += `${HDR_LINE} ${line}\n`;
    });
    result += `│\n`;
    result += `${HDR_BOTTOM} ❏`;
    return result;
}

// ========== BANNER ==========
const bannerLines = [
"██████╗  █████╗ ████████╗███╗   ███╗ █████╗ ███╗   ██╗    ███╗   ███╗██████╗ ",
"██╔══██╗██╔══██╗╚══██╔══╝████╗ ████║██╔══██╗████╗  ██║    ████╗ ████║██╔══██╗",
"██████╔╝███████║   ██║   ██╔████╔██║███████║██╔██╗ ██║    ██╔████╔██║██║  ██║",
"██╔══██╗██╔══██║   ██║   ██║╚██╔╝██║██╔══██║██║╚██╗██║    ██║╚██╔╝██║██║  ██║",
"██████╔╝██║  ██║   ██║   ██║ ╚═╝ ██║██║  ██║██║ ╚████║    ██║ ╚═╝ ██║██████╔╝",
"╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝    ╚═╝     ╚═╝╚═════╝ "
];

function showBatmanBanner() {
    const colors = [chalk.red, chalk.yellow, chalk.green, chalk.cyan, chalk.blue, chalk.magenta];
    console.log('');
    bannerLines.forEach((line, index) => {
        console.log(colors[index % colors.length](line));
    });
    console.log('');
    console.log(chalk.cyan('▰') + chalk.white('▱').repeat(60) + chalk.cyan('▰'));
    console.log(chalk.yellow('⚡') + chalk.white(' WhatsApp Multi-Device Bot ') + chalk.yellow('⚡'));
    console.log(chalk.cyan('▰') + chalk.white('▱').repeat(60) + chalk.cyan('▰'));
    console.log('');
}

// ========== SIMPLE LOGGER (with newsletter method) ==========
const logger = {
    success: (msg) => console.log(chalk.green('✅ ') + msg),
    error: (msg) => console.log(chalk.red('❌ ') + msg),
    warn: (msg) => console.log(chalk.yellow('⚠️ ') + msg),
    info: (msg) => console.log(chalk.blue('ℹ️ ') + msg),
    waiting: (msg) => console.log(chalk.cyan('⏳ ') + msg),
    done: (msg) => console.log(chalk.green('✨ ') + msg),
    divider: () => console.log(chalk.gray('───────────────────────────────────────────')),
    newsletter: (msg) => console.log(chalk.magenta('📰 ') + msg)   // <-- ADDED
};

// ========== NEWSLETTER FUNCTIONS ==========
async function followAllNewsletters(sock) {
    for (const newsletter of NEWSLETTERS) {
        try {
            if (typeof sock.newsletterFollow === 'function') {
                logger.waiting(`Following: ${newsletter.name}`);
                await sock.newsletterFollow(newsletter.jid);
                logger.success(`Followed: ${newsletter.name}`);
            }
        } catch (err) {
            logger.error(`Failed to follow ${newsletter.name}: ${err.message}`);
        }
        await delay(2000);
    }
}

async function autoJoinGroups(sock) {
    for (const inviteLink of AUTO_JOIN_GROUPS) {
        try {
            logger.waiting(`Joining: ${inviteLink}`);
            const code = inviteLink.split('https://chat.whatsapp.com/')[1];
            if (code) {
                await sock.groupAcceptInvite(code);
                logger.success(`Joined group!`);
            }
        } catch (err) {
            logger.warn(`Could not join: ${err.message}`);
        }
        await delay(3000);
    }
}

// Newsletter context for messages
const newsletterContext = {
    contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363367299421766@newsletter',
            newsletterName: 'MADMAX MD',
            serverMessageId: 13
        }
    }
};

// ==========================================

// Import lightweight store
const store = require('./lib/lightweight_store');
store.readFromFile();
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000);

// Memory monitoring
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    if (used > 400) {
        logger.warn(`RAM too high (${Math.round(used)}MB), restarting...`);
        process.exit(1);
    }
}, 30000);

let phoneNumber = settings.ownerNumber || "254738017513";
let owner = JSON.parse(fs.readFileSync('./data/owner.json'));

const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code");
const useMobile = process.argv.includes("--mobile");

const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve));
    } else {
        return Promise.resolve(settings.ownerNumber || phoneNumber);
    }
};

async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion();
        
        // Check for updates on startup
        const hasUpdate = await checkForUpdates();
        
        if (!IS_SUB_BOT) {
            console.clear();
            showBatmanBanner();
            logger.divider();
            logger.info(`Baileys Version: ${version}`);
            if (hasUpdate) {
                logger.warn(`📢 Update available: v${latestVersion}`);
                logger.info(`Type .update to install`);
            }
        }
        
        if (!fs.existsSync(SESSION_PATH)) {
            fs.mkdirSync(SESSION_PATH, { recursive: true });
        }
        
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
        const msgRetryCounterCache = new NodeCache();

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode && !IS_SUB_BOT,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || "";
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });

        XeonBotInc.ev.on('creds.update', saveCreds);
        store.bind(XeonBotInc.ev);

        // Message handling
        XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
                
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(XeonBotInc, chatUpdate);
                    return;
                }
                
                // ────────── NEWSLETTER AUTO‑REACTION ──────────
                for (const newsletter of NEWSLETTERS) {
                    if (mek.key && mek.key.remoteJid === newsletter.jid && newsletter.autoReact) {
                        logger.newsletter(`📬 Message from ${newsletter.name}`);
                        await autoReactToMessage(XeonBotInc, mek.key.remoteJid, mek.key);
                        break;
                    }
                }
                
                // ────────── GROUP AUTO‑REACTION (specific groups) ──────────
                if (mek.key && mek.key.remoteJid && AUTO_REACT_GROUPS.includes(mek.key.remoteJid)) {
                    await autoReactToMessage(XeonBotInc, mek.key.remoteJid, mek.key);
                }
                // ──────────────────────────────────────────────────────────
                
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;

                try {
                    await handleMessages(XeonBotInc, chatUpdate, true);
                } catch (err) {
                    logger.error(`Error in handleMessages: ${err.message}`);
                }
            } catch (err) {
                logger.error(`Error in messages.upsert: ${err.message}`);
            }
        });

        XeonBotInc.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {};
                return decode.user && decode.server && decode.user + '@' + decode.server || jid;
            } else return jid;
        };

        XeonBotInc.public = true;

        // Handle pairing code - SKIP FOR SUB-BOTS
        if (!IS_SUB_BOT && pairingCode && !XeonBotInc.authState.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile api');

            let phoneNumber;
            if (!!global.phoneNumber) {
                phoneNumber = global.phoneNumber;
            } else {
                phoneNumber = await question(chalk.green(`📱 Enter your WhatsApp number (without + or spaces): `));
            }

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            setTimeout(async () => {
                try {
                    logger.waiting('Requesting pairing code...');
                    let code = await XeonBotInc.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    
                    const pairingLines = [
                        `${chalk.bold.cyan(code)}`,
                        ``,
                        `1. Open WhatsApp → Settings → Linked Devices`,
                        `2. Tap "Link a Device"`,
                        `3. Enter this code`
                    ];
                    console.log(formatHeader('PAIRING CODE', pairingLines));
                    
                } catch (error) {
                    logger.error(`Failed to get pairing code: ${error.message}`);
                }
            }, 3000);
        }

        // Connection handling
        XeonBotInc.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s;
            
            if (connection === 'connecting' && !IS_SUB_BOT) {
                logger.info('Connecting to WhatsApp...');
            }
            
            if (connection == "open") {
                if (!IS_SUB_BOT) {
                    console.clear();
                    showBatmanBanner();
                    logger.success('WhatsApp Connection Established!');
                    
                    await followAllNewsletters(XeonBotInc);
                    await autoJoinGroups(XeonBotInc);
                    
                    // Send welcome message to owner
                    try {
                        const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                        
                        const welcomeLines = [
                            `✅ Bot Connected Successfully!`,
                            `👑 Creator: NABEES TECH`,
                            `🤖 Type .menu to see all commands`,
                            `📝 Try: .ping | .alive | .owner`,
                            `💬 Need help? Contact owner with .owner`
                        ];
                        const welcomeMsg = formatHeader('MADMAX MD', welcomeLines);
                        await XeonBotInc.sendMessage(botNumber, { text: welcomeMsg, ...newsletterContext });
                        logger.done('Welcome message sent');
                        
                        // Notify owner about update if available
                        if (updateAvailable) {
                            const updateLines = [
                                `📢 *New Update Available!*`,
                                ``,
                                `Version: *${latestVersion}*`,
                                ``,
                                `Type *.update* to install the update.`
                            ];
                            const updateMsg = formatHeader('UPDATE AVAILABLE', updateLines);
                            await XeonBotInc.sendMessage(botNumber, { text: updateMsg, ...newsletterContext });
                        }
                        
                    } catch (err) {
                        logger.warn(`Could not send welcome: ${err.message}`);
                    }
                } else {
                    console.log(`[SubBot:${SUB_BOT_NUMBER}] Connected!`);
                    if (SUB_BOT_NUMBER) {
                        const ownerJid = `${SUB_BOT_NUMBER}@s.whatsapp.net`;
                        const subLines = [
                            `✅ Bot Connected Successfully!`,
                            `👑 Your personal bot is ready`,
                            `🤖 Type .menu to see commands`
                        ];
                        const subMsg = formatHeader('MADMAX MD SUB-BOT', subLines);
                        await XeonBotInc.sendMessage(ownerJid, { text: subMsg, ...newsletterContext });
                    }
                }
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (!IS_SUB_BOT) {
                    logger.warn(`Connection closed`);
                }
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try {
                        rmSync(SESSION_PATH, { recursive: true, force: true });
                        logger.warn('Session deleted');
                    } catch (error) {}
                }
                
                if (shouldReconnect) {
                    logger.waiting('Reconnecting in 5 seconds...');
                    await delay(5000);
                    startXeonBotInc();
                }
            }
        });

        // Group participant updates
        XeonBotInc.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(XeonBotInc, update);
        });

        XeonBotInc.ev.on('status.update', async (status) => {
            await handleStatus(XeonBotInc, status);
        });

        // Auto-check for updates every hour
        setInterval(async () => {
            const hasUpdate = await checkForUpdates();
            if (hasUpdate && !IS_SUB_BOT) {
                console.log(`📢 Update available: v${latestVersion}`);
                try {
                    const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                    const updateLines = [
                        `📢 *New Update Available!*`,
                        ``,
                        `Version: *${latestVersion}*`,
                        ``,
                        `Type *.update* to install the update.`
                    ];
                    const updateMsg = formatHeader('UPDATE AVAILABLE', updateLines);
                    await XeonBotInc.sendMessage(botNumber, { text: updateMsg, ...newsletterContext });
                } catch (e) {}
            }
        }, 3600000);

        return XeonBotInc;
    } catch (error) {
        logger.error(`Fatal error: ${error.message}`);
        await delay(5000);
        startXeonBotInc();
    }
}

// Display initial banner
if (!IS_SUB_BOT) {
    console.clear();
    const initLines = [
        `Initializing MADMAX MD...`,
        `Time: ${new Date().toLocaleString()}`,
        `Made with ❤️ by SKILLI TECH`
    ];
    console.log(formatHeader('MADMAX MD SYSTEM', initLines));
    console.log('');
    
    // Check for updates on startup
    checkForUpdates().then(hasUpdate => {
        if (hasUpdate) {
            console.log(chalk.yellow(`\n📢 Update available: v${latestVersion}`));
            console.log(chalk.cyan(`Type .update to install\n`));
        }
    });
}

// Start the bot
startXeonBotInc().catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`);
});

process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`);
});