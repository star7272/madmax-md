/**
 * SKILLI-MD — WhatsApp Bot + Web Panel
 * Copyright (c) 2026 SkilliTech
 * Website: https://skilli-md.vercel.app/
 *
 * Start: node index.js
 */

'use strict';

// ==================== MULTI-SESSION SUPPORT ====================
const IS_SUB_BOT     = process.env.IS_SUB_BOT    === 'true';
const SUB_BOT_NUMBER = process.env.SUB_BOT_NUMBER || null;
const SUB_BOT_FOLDER = process.env.SUB_BOT_FOLDER || null;

// SESSION_PATH used by startSession when running as a sub-bot
let SESSION_PATH = './sessions';
if (IS_SUB_BOT && SUB_BOT_FOLDER) {
    SESSION_PATH = SUB_BOT_FOLDER;
    // Defer logging until after logger + console override are set up (see bottom)
} 
// ================================================================

const settings   = require('./settings');
const fs         = require('fs');
const chalk      = require('chalk');
const path       = require('path');
const axios      = require('axios');
const { rmSync } = require('fs');
const express    = require('express');

const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    makeCacheableSignalKeyStore,
    delay,
} = require('@whiskeysockets/baileys');

const NodeCache = require('node-cache');
const pino      = require('pino');

const { autoReactToMessage } = require('./lib/reactions');

// ========== AUTO-FOLLOW NEWSLETTERS ==========
// Add as many newsletter JIDs as you want below — bot will follow all on connect
const NEWSLETTERS = [
    { jid: 'REPLACE_WITH_REAL_JID@newsletter', name: 'MADMAX ☠️' }, // Get JID by logging sock.newsletterFollow() result after first connect
    // { jid: 'PASTE_JID_HERE@newsletter',   name: 'Channel Name 2' },
    // { jid: 'PASTE_JID_HERE@newsletter',   name: 'Channel Name 3' },
    // { jid: 'PASTE_JID_HERE@newsletter',   name: 'Channel Name 4' },
    // { jid: 'PASTE_JID_HERE@newsletter',   name: 'Channel Name 5' },
];

// Primary newsletter (first in list) used for context tags & follower display
const NEWSLETTER_JID  = NEWSLETTERS[0]?.jid  || '';
const NEWSLETTER_NAME = NEWSLETTERS[0]?.name || 'MADMAX ☠️';
// ==============================================

// ========== AUTO-UPDATE CHECKER ==========
let updateAvailable = false;
let latestVersion   = null;

async function getCurrentVersion() {
    try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            return pkg.version || '1.0.0';
        }
    } catch (_) {}
    return settings.version || '1.0.0';
}

async function checkForUpdates() {
    try {
        // FIX: corrected URL — was '//Batman-md' (double slash, missing owner)
        const res = await axios.get(
            'https://raw.githubusercontent.com/AstaTech/Skilli-md/main/package.json',
            { timeout: 10000, headers: { 'User-Agent': 'SKILLI-MD' } }
        );
        const remote  = res.data?.version || '3.0.0';
        const current = await getCurrentVersion();
        if (remote !== current) {
            updateAvailable = true;
            latestVersion   = remote;
            return true;
        }
        return false;
    } catch (_) {
        return false;
    }
}
// ==========================================

// ========== HEADER STYLE ==========
const HDR_TOP    = '┌❏';
const HDR_LINE   = '├❏';
const HDR_BOTTOM = '└❏';

function formatHeader(title, lines) {
    let out = `${HDR_TOP} *${title}* ❏\n│\n`;
    // FIX: filter out empty/falsy lines so no blank ├❏ lines appear
    lines.filter(Boolean).forEach(l => { out += `${HDR_LINE} ${l}\n`; });
    return out + `│\n${HDR_BOTTOM} ❏`;
}

// ========== BANNER ==========
const bannerLines = [
"███╗   ███╗ █████╗ ██████╗ ██████╗ ███╗   ███╗██╗  ██╗",
"████╗ ████║██╔══██╗██╔══██╗██╔══██╗████╗ ████║╚██╗██╔╝",
"██╔████╔██║███████║██║  ██║██║  ██║██╔████╔██║ ╚███╔╝ ",
"██║╚██╔╝██║██╔══██║██║  ██║██║  ██║██║╚██╔╝██║ ██╔██╗ ",
"██║ ╚═╝ ██║██║  ██║██████╔╝██████╔╝██║ ╚═╝ ██║██╔╝ ██╗",
"╚═╝     ╚═╝╚═╝  ╚═╝╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝",
"",
"      ███╗   ███╗ █████╗ ██████╗ ███╗   ███╗",
"      ████╗ ████║██╔══██╗██╔══██╗████╗ ████║",
"      ██╔████╔██║███████║██████╔╝██╔████╔██║",
"      ██║╚██╔╝██║██╔══██║██╔═══╝ ██║╚██╔╝██║",
"      ██║ ╚═╝ ██║██║  ██║██║     ██║ ╚═╝ ██║",
"      ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝     ╚═╝",
"",
"        ⚡ MADMAX MD — 3D SYSTEM ONLINE ⚡",
"        👑 POWERED BY SKILLI TECH 👑"
];
// FIX: showBanner() was defined but never called — now called during startup
function showBanner() {
    const colors = [chalk.red, chalk.yellow, chalk.green, chalk.cyan, chalk.blue, chalk.magenta];
    _origLog('');
    bannerLines.forEach((line, i) => _origLog(colors[i % colors.length](line)));
    _origLog('');
    _origLog(chalk.cyan('▰') + chalk.white('▱').repeat(60) + chalk.cyan('▰'));
    _origLog(chalk.yellow('⚡') + chalk.white(' SKILLI-MD — WhatsApp Multi-Device Bot ') + chalk.yellow('⚡'));
    _origLog(chalk.cyan('▰') + chalk.white('▱').repeat(60) + chalk.cyan('▰'));
    _origLog('');
}

// ========== LOGGER ==========
const logger = {
    success:    msg => console.log(chalk.green('✅ ')   + msg),
    error:      msg => console.log(chalk.red('❌ ')     + msg),
    warn:       msg => console.log(chalk.yellow('⚠️  ') + msg),
    info:       msg => console.log(chalk.blue('ℹ️  ')   + msg),
    waiting:    msg => console.log(chalk.cyan('⏳ ')    + msg),
    done:       msg => console.log(chalk.green('✨ ')   + msg),
    divider:    ()  => console.log(chalk.gray('───────────────────────────────────────────')),
    newsletter: msg => console.log(chalk.magenta('📰 ') + msg),
};

// ========== LOG RING BUFFER ==========
const logBuffer  = [];
const _origLog   = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn  = console.warn.bind(console);

function pushLog(level, message) {
    logBuffer.push({ time: new Date().toISOString(), level, message });
    if (logBuffer.length > 200) logBuffer.shift();
}

console.log   = (...a) => { const m = a.join(' '); pushLog('info',  m); _origLog(m);   };
console.error = (...a) => { const m = a.join(' '); pushLog('error', m); _origError(m); };
console.warn  = (...a) => { const m = a.join(' '); pushLog('warn',  m); _origWarn(m);  };
// =====================================

// ========== NEWSLETTER FOLLOW (multi-JID) ==========
async function followNewsletter(sock) {
    if (typeof sock.newsletterFollow !== 'function') {
        logger.warn('sock.newsletterFollow not available on this Baileys version');
        return;
    }
    for (const { jid, name } of NEWSLETTERS) {
        try {
            logger.waiting(`Following newsletter: ${name}`);
            const result = await sock.newsletterFollow(jid);
            // Log the real JID returned — copy this into your NEWSLETTERS array
            const realJid = result?.id || result?.jid || jid;
            logger.success(`Followed: ${name} | JID: ${realJid}`);
        } catch (err) {
            logger.error(`Failed to follow ${name}: ${err.message}`);
        }
    }
}

// FIX: added follower fetch — was completely missing, causing "no followers" display
async function fetchNewsletterFollowers(sock) {
    try {
        if (typeof sock.newsletterMetadata !== 'function') return null;
        const meta = await sock.newsletterMetadata('jid', NEWSLETTER_JID);
        // Baileys may return subscriberCount or followerCount depending on version
        const followers = meta?.subscriberCount ?? meta?.followerCount ?? meta?.subscribers ?? 0;
        logger.newsletter(`📊 ${NEWSLETTER_NAME} — Followers: ${followers}`);
        return followers;
    } catch (err) {
        logger.error(`Failed to fetch newsletter followers: ${err.message}`);
        return null;
    }
}
// ========================================

const newsletterContext = {
    contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid:   NEWSLETTER_JID,
            newsletterName:  NEWSLETTER_NAME,
            serverMessageId: 13,
        },
    },
};

// ========== STORE ==========
const store = require('./lib/lightweight_store');
store.readFromFile();
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000);

// ========== MEMORY GUARD ==========
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    if (used > 1000) {
        logger.warn(`RAM too high (${Math.round(used)} MB), restarting...`);
        process.exit(1);
    }
}, 30000);

// ========== OWNER ==========
// FIX: was crashing entire process if owner.json missing — now safe with fallback
let owner = [];
try {
    owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf8'));
} catch (err) {
    _origWarn(`⚠️  Could not load owner.json: ${err.message} — continuing with empty owner list`);
}

// ========== SESSION STORE (multi-user) ==========
// Tracks all active sockets keyed by phone number
const sessions = new Map();
// ================================================

// ========== NEWSLETTER FOLLOWER CACHE ==========
// Cached so /followers endpoint can serve it without re-fetching every request
let cachedFollowers = null;
// ===============================================

// ================================================================
//  WEB PANEL
// ================================================================
const app  = express();
const PORT = process.env.PORT || 21569;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// GET /health
app.get('/health', (req, res) => res.json({
    success:      true,
    uptime:       Math.floor(process.uptime()),
    botName:      settings.botName || 'MADMAX,
    activeBots:   sessions.size,
    newsletter:   NEWSLETTER_JID,
    timestamp:    new Date().toISOString(),
}));

// GET /sessions
app.get('/sessions', (req, res) => {
    const list = Array.from(sessions.entries()).map(([phone, s]) => ({
        phone,
        status:      s.status,
        connectedAt: s.connectedAt || null,
    }));
    res.json({ success: true, count: list.length, sessions: list });
});

// GET /status/:phone
app.get('/status/:phone', (req, res) => {
    const phone   = String(req.params.phone).replace(/\D/g, '');
    const session = sessions.get(phone);
    if (!session) return res.json({ success: true, status: 'not_found', phone });
    return res.json({ success: true, status: session.status, phone, connectedAt: session.connectedAt || null });
});

// POST /pair  { phone: "27XXXXXXXXX" }
app.post('/pair', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone number required' });

    const clean = String(phone).replace(/\D/g, '');
    if (clean.length < 7 || clean.length > 15)
        return res.status(400).json({ success: false, error: 'Invalid phone number' });

    const existing = sessions.get(clean);
    if (existing?.status === 'connected')
        return res.json({ success: true, status: 'already_connected', phone: clean });

    try {
        logger.waiting(`[Web] Pairing: ${clean}`);
        const code = await startSession(clean);
        logger.success(`[Web] Code issued for ${clean}: ${code}`);
        return res.json({ success: true, status: 'pending', phone: clean, code, expiresIn: 60 });
    } catch (err) {
        logger.error(`[Web] Pairing failed for ${clean}: ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /session/:phone
app.delete('/session/:phone', async (req, res) => {
    const phone   = String(req.params.phone).replace(/\D/g, '');
    const session = sessions.get(phone);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    try {
        // FIX: sock.logout() can throw if socket is already dead/disconnected
        // — only attempt logout if socket exists and is in connected state
        if (session.sock && session.status === 'connected') {
            try { await session.sock.logout(); } catch (_) {}
        } else if (session.sock) {
            try { session.sock.end(undefined); } catch (_) {}
        }
        const sessionPath = `./sessions/${phone}`;
        try { rmSync(sessionPath, { recursive: true, force: true }); } catch (_) {}
        sessions.delete(phone);
        res.json({ success: true, phone, message: 'Session removed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /logs
app.get('/logs', (req, res) => res.json({
    success: true,
    count:   logBuffer.length,
    logs:    logBuffer,
}));

// FIX: added /followers endpoint — was fetching data but never exposing it via API
app.get('/followers', async (req, res) => {
    // If we have a cached value serve it; otherwise try to fetch from first live session
    if (cachedFollowers !== null) {
        return res.json({ success: true, newsletter: NEWSLETTER_NAME, followers: cachedFollowers });
    }
    // Try to fetch live from any connected session
    for (const [, session] of sessions) {
        if (session.status === 'connected' && session.sock) {
            const followers = await fetchNewsletterFollowers(session.sock);
            if (followers !== null) {
                cachedFollowers = followers;
                return res.json({ success: true, newsletter: NEWSLETTER_NAME, followers });
            }
        }
    }
    return res.json({ success: false, error: 'No connected session to fetch follower data', followers: null });
});

app.listen(PORT, '0.0.0.0', async () => {
    logger.success(`Web panel started on port ${PORT}`);
    try {
        const ip = (await axios.get('https://api.ipify.org?format=json', { timeout: 5000 })).data.ip;
        logger.info(`🌐 Panel:     http://${ip}:${PORT}`);
        logger.info(`📋 Logs:      http://${ip}:${PORT}/logs`);
        logger.info(`❤️  Health:    http://${ip}:${PORT}/health`);
        logger.info(`📰 Followers: http://${ip}:${PORT}/followers`);
    } catch (_) {
        logger.warn('Could not fetch public IP');
    }
});
// ================================================================

// ================================================================
//  PER-USER SESSION STARTER
// ================================================================
async function startSession(phone) {
    // FIX: use SESSION_PATH for sub-bot mode, otherwise use per-user sessions folder
    const sessionPath = IS_SUB_BOT && SUB_BOT_FOLDER
        ? SESSION_PATH
        : `./sessions/${phone}`;

    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    sessions.set(phone, { status: 'connecting', sock: null, connectedAt: null });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const msgRetryCounterCache = new NodeCache();
    const { version }          = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(
                state.keys,
                pino({ level: 'fatal' }).child({ level: 'fatal' })
            ),
        },
        markOnlineOnConnect:            true,
        generateHighQualityLinkPreview: true,
        syncFullHistory:                false,
        getMessage: async (key) => {
            const msg = await store.loadMessage(key.remoteJid, key.id);
            // FIX: was returning '' (empty string) on miss — Baileys needs undefined
            // so it knows to retry fetching the message from the server
            return msg?.message || undefined;
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs:      60000,
        keepAliveIntervalMs:   10000,
    });

    sessions.get(phone).sock = sock;

    sock.ev.on('creds.update', saveCreds);
    store.bind(sock.ev);

    // Request pairing code
    let code = null;
    if (!state.creds.registered) {
        await delay(2000);
        code = await sock.requestPairingCode(phone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
    }

    // Messages
    sock.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek?.message) return;

            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage')
                ? mek.message.ephemeralMessage.message
                : mek.message;

            if (mek.key?.remoteJid === 'status@broadcast') {
                await handleStatus(sock, chatUpdate);
                return;
            }

            if (mek.key?.remoteJid === NEWSLETTER_JID) {
                logger.newsletter(`📬 [${phone}] Message from ${NEWSLETTER_NAME}`);
                await autoReactToMessage(sock, mek.key.remoteJid, mek.key);
                return;
            }

            if (mek.key?.id?.startsWith('BAE5') && mek.key.id.length === 16) return;

            await handleMessages(sock, chatUpdate, true);
        } catch (err) {
            logger.error(`[${phone}] messages.upsert: ${err.message}`);
        }
    });

    sock.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            const decoded = jidDecode(jid) || {};
            return (decoded.user && decoded.server) ? `${decoded.user}@${decoded.server}` : jid;
        }
        return jid;
    };

    sock.public = true;

    sock.ev.on('group-participants.update', async update => {
        await handleGroupParticipantUpdate(sock, update);
    });

    sock.ev.on('status.update', async status => {
        await handleStatus(sock, status);
    });

    // Connection
    sock.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === 'open') {
            const session = sessions.get(phone);
            if (session) {
                session.status      = 'connected';
                session.connectedAt = new Date().toISOString();
            }
            logger.success(`[${phone}] Connected!`);

            // Follow newsletter then fetch follower count
            await followNewsletter(sock);
            const followers = await fetchNewsletterFollowers(sock);
            if (followers !== null) cachedFollowers = followers;

            try {
                const botNumber  = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                // FIX: removed empty string from lines array (was causing blank ├❏ line)
                const welcomeMsg = formatHeader('MADMAX☠️', [
                    'Connected Successfully!',
                    `.menu for all commands`,
                    `.ping | .alive | .owner`,
                    `📰 Newsletter followers: ${followers ?? 'N/A'}`,
                    '💬 Need help? Contact owner with .owner',
                ]);
                await sock.sendMessage(botNumber, { text: welcomeMsg, ...newsletterContext });
            } catch (_) {}

            // Ghost mode presence
            try {
                const { isGhostEnabled } = require('./commands/ghostmode');
                await sock.sendPresenceUpdate(isGhostEnabled() ? 'unavailable' : 'available');
            } catch (_) {}
        }

        if (connection === 'close') {
            const statusCode      = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn(`[${phone}] Connection closed (code: ${statusCode ?? 'unknown'})`);

            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try { rmSync(`./sessions/${phone}`, { recursive: true, force: true }); } catch (_) {}
                sessions.delete(phone);
                logger.warn(`[${phone}] Session deleted (logged out)`);
                return;
            }

            if (shouldReconnect) {
                logger.waiting(`[${phone}] Reconnecting in 5s...`);
                await delay(5000);
                startSession(phone).catch(err =>
                    logger.error(`[${phone}] Reconnect failed: ${err.message}`)
                );
            }
        }
    });

    return code;
}
// ================================================================

// ── Auto-reload existing sessions on startup ─────────────────
async function autoLoadSessions() {
    const sessionsDir = './sessions';
    if (!fs.existsSync(sessionsDir)) return;

    const folders = fs.readdirSync(sessionsDir).filter(f =>
        fs.statSync(path.join(sessionsDir, f)).isDirectory()
    );

    if (folders.length === 0) {
        logger.info('No existing sessions found');
        return;
    }

    // FIX: now logs total count so you know how many sessions were found
    logger.info(`Found ${folders.length} existing session(s) — loading...`);

    for (const phone of folders) {
        logger.info(`Auto-loading session: ${phone}`);
        startSession(phone).catch(err => logger.error(`Auto-load failed [${phone}]: ${err.message}`));
        await delay(2000);
    }

    logger.done(`Auto-load complete — ${folders.length} session(s) started`);
}

// ── Initial banner + startup ──────────────────────────────────
if (!IS_SUB_BOT) {
    console.clear();
    // FIX: showBanner() was never called — now called here
    showBanner();
    console.log(formatHeader('MADMAX SYSTEM', [
        'Initializing MADMAX...',
        `Time: ${new Date().toLocaleString()}`,
        'Made with ❤️  by SKILLI TECH',
    ]));
    console.log('');
    checkForUpdates().then(hasUpdate => {
        if (hasUpdate) {
            console.log(chalk.yellow(`\n📢 Update available: v${latestVersion}`));
            console.log(chalk.cyan('   Type .update to install\n'));
        }
    });
} else {
    // Sub-bot startup log (deferred to here so logger + console are ready)
    logger.info(`[SubBot] Starting for: ${SUB_BOT_NUMBER}`);
}

autoLoadSessions().catch(err => logger.error(`autoLoadSessions failed: ${err.message}`));

// ── Global guards ─────────────────────────────────────────────
process.on('uncaughtException', err => {
    if (err.code === 'ENOSPC') { console.error('⚠️ Disk full — bot cannot write'); return; }
    logger.error(`Uncaught Exception: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') console.error(err.stack);
});

process.on('unhandledRejection', err => {
    if (err?.code === 'ENOSPC') return;
    if (err?.message?.includes('rate-overlimit')) return;
    logger.error(`Unhandled Rejection: ${err?.message || err}`);
});
