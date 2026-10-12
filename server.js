// ─── Auto-Dependency Self-Healing Bootstrap ──────────────────────────────────
(function checkAndInstallDependencies() {
    const requiredModules = ['@whiskeysockets/baileys', 'qrcode', 'express', 'cors', 'pino'];
    const missing = [];
    for (const mod of requiredModules) {
        try {
            require.resolve(mod);
        } catch (e) {
            missing.push(mod);
        }
    }

    if (missing.length > 0) {
        console.log('================================================================');
        console.log(' [!] Missing required dependencies: ' + missing.join(', '));
        console.log(' [*] Automatically running "npm install" now... Please wait...');
        console.log('================================================================\n');

        try {
            const { execSync } = require('child_process');
            execSync('npm install --omit=dev --no-audit --no-fund', {
                stdio: 'inherit',
                cwd: __dirname
            });
            console.log('\n================================================================');
            console.log(' [OK] Dependencies installed successfully!');
            console.log('================================================================\n');
        } catch (err) {
            console.error('\n[ERROR] Automatic npm install failed: ' + err.message);
            console.error('Please open a command prompt and run:');
            console.error('   cd /d "' + __dirname + '"');
            console.error('   npm install\n');
            process.exit(1);
        }
    }
})();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── Authentication & Session Management ────────────────────────────────────
const USERS_FILE = path.join(__dirname, 'users.json');
function getUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
            return Array.isArray(raw.users) ? raw.users : [];
        }
    } catch(e) {}
    return [{ id: '1', username: 'admin', email: 'admin@visiontech.com.bd', password: 'password', name: 'Administrator', role: 'admin' }];
}

function saveUsers(usersList) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users: usersList }, null, 2), 'utf-8');
        return true;
    } catch(e) {
        console.error('Error saving users.json:', e);
        return false;
    }
}

const activeSessions = new Map(); // token -> { user, expiresAt }

function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            if (parts.length >= 2) {
                list[parts.shift().trim()] = decodeURIComponent(parts.join('=').trim());
            }
        });
    }
    return list;
}

function getAuthenticatedUser(req) {
    const cookies = parseCookies(req);
    const token = cookies.wa_auth_token;
    if (!token) return null;
    const session = activeSessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
        activeSessions.delete(token);
        return null;
    }
    return session.user;
}


const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Load .env file automatically if present
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const idx = trimmed.indexOf('=');
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
                if (key && !process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    }
} catch (e) {}

// Standalone mode: allow direct browser access without requiring secret token unless configured
const INTERNAL_SECRET = (process.env.WA_INTERNAL_SECRET || '').trim();
if (INTERNAL_SECRET && INTERNAL_SECRET !== 'change-me-in-env') {
    app.use('/api/whatsapp', (req, res, next) => {
        const token = (req.headers['x-internal-token'] || '').trim();
        if (!token || token !== INTERNAL_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    });
}

const PORT = process.env.PORT || 3000;

// ─── Global Templates (Admin-created, shared across all users) ────────────────
const GLOBAL_TEMPLATES_FILE = path.join(__dirname, 'global_templates.json');
let globalTemplatesStore = [];
try {
    if (fs.existsSync(GLOBAL_TEMPLATES_FILE)) {
        const raw = JSON.parse(fs.readFileSync(GLOBAL_TEMPLATES_FILE, 'utf-8'));
        if (Array.isArray(raw)) globalTemplatesStore = raw;
    }
} catch(e) {}

function saveGlobalTemplates() {
    try { fs.writeFileSync(GLOBAL_TEMPLATES_FILE, JSON.stringify(globalTemplatesStore, null, 2), 'utf-8'); } catch(e) {}
}

// ─── Global Lists (Admin-created, shared across all users for Quick Select) ────
const GLOBAL_LISTS_FILE = path.join(__dirname, 'global_lists.json');
let globalListsStore = [];
try {
    if (fs.existsSync(GLOBAL_LISTS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(GLOBAL_LISTS_FILE, 'utf-8'));
        if (Array.isArray(raw)) globalListsStore = raw;
    }
} catch(e) {}

function saveGlobalLists() {
    try { fs.writeFileSync(GLOBAL_LISTS_FILE, JSON.stringify(globalListsStore, null, 2), 'utf-8'); } catch(e) {}
}

// ─── GitHub Cloud Sync Config & Functions ───────────────────────────────────
const GITHUB_CONFIG_FILE = path.join(__dirname, 'github_config.json');
function getGitHubConfig() {
    try {
        if (fs.existsSync(GITHUB_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(GITHUB_CONFIG_FILE, 'utf-8'));
        }
    } catch(e) {}
    return { repo: '', branch: 'main', token: '', autoSync: false };
}
function saveGitHubConfig(cfg) {
    try { fs.writeFileSync(GITHUB_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8'); return true; } catch(e) { return false; }
}

async function githubFetchFile(repo, branch, filePath, token) {
    const headers = {
        'User-Agent': 'WhatsAppWeb-System-App',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const url = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
        const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`;
        const rawRes = await fetch(rawUrl, {
            headers: token ? { 'Authorization': `token ${token}`, 'User-Agent': 'WhatsAppWeb-System-App' } : { 'User-Agent': 'WhatsAppWeb-System-App' }
        });
        if (rawRes.ok) {
            const text = await rawRes.text();
            return { content: text, sha: null };
        }
        throw new Error(`Failed to fetch ${filePath}: HTTP ${res.status}`);
    }
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha };
}

async function githubPushFile(repo, branch, filePath, contentString, commitMessage, token) {
    if (!token) throw new Error('GitHub Personal Access Token (PAT) is required to upload');
    const headers = {
        'User-Agent': 'WhatsAppWeb-System-App',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
    };

    let sha = null;
    try {
        const getUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;
        const getRes = await fetch(getUrl, { headers });
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
        }
    } catch(e) {}

    const putUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    const body = {
        message: commitMessage || `Update ${filePath} via WhatsApp System`,
        content: Buffer.from(contentString, 'utf-8').toString('base64'),
        branch: branch || 'main'
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
    });

    if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub API error: HTTP ${putRes.status}`);
    }
    return await putRes.json();
}

// ─── Per-User Session ────────────────────────────────────────────────────────

function createSessionData(userId) {
    return {
        userId,
        waSock: null,
        connectionStatus: 'disconnected',
        userProfile: { name: '', phone: '' },
        currentQRDataURL: null,
        allChatsMap: new Map(),
        messagesStore: new Map(),
        profilePicCache: new Map(),
        contactsStore: {},
        savedListsStore: [],
        savedTemplatesStore: [],
        scheduledBroadcasts: [],   // { id, name, message, imageBase64, jids, scheduledAt, createdAt }
        broadcastHistory: [],      // { id, name, message, jids, sentCount, failCount, timestamp }
        storeFilePath: path.join(__dirname, `baileys_store_${userId}.json`),
        authFolder: path.join(__dirname, `auth_info_${userId}`),
        _saveDiskTimer: null,
        _picFetchTimer: null,
    };
}

/** sessions Map: userId (string) -> sessionData */
const sessions = new Map();

function getSession(userId) {
    if (!sessions.has(userId)) {
        const s = createSessionData(userId);
        sessions.set(userId, s);
        loadStoreFromDisk(s);
        connectToWhatsApp(s);
    }
    const s = sessions.get(userId);
    if (s && s.connectionStatus === 'disconnected' && !s._connecting) {
        connectToWhatsApp(s);
    }
    return s;
}

function getSessionFromReq(req) {
    // Isolated session per user: uses the logged-in user's unique ID
    const userId = String(req.user?.id || req.headers['x-wa-user'] || 'default');
    return getSession(userId);
}

// ─── Disk Storage ─────────────────────────────────────────────────────────────

// Memory is tight on shared hosting: cap messages kept per chat, and keep full image
// data only for the newest few messages (older ones fall back to the "Photo" placeholder).
const MAX_MESSAGES_PER_CHAT = parseInt(process.env.WA_MAX_MESSAGES_PER_CHAT, 10) || 30;
const MAX_IMAGES_PER_CHAT = 3;

function stripImage(m) {
    if (!m || !m.imageBase64) return m;
    const { imageBase64, ...rest } = m;
    return { ...rest, hasImage: true };
}

function trimHistory(history) {
    if (history.length > MAX_MESSAGES_PER_CHAT) history.splice(0, history.length - MAX_MESSAGES_PER_CHAT);
    let images = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        if (!history[i].imageBase64) continue;
        if (++images > MAX_IMAGES_PER_CHAT) history[i] = stripImage(history[i]);
    }
}

function loadStoreFromDisk(s) {
    if (!fs.existsSync(s.storeFilePath)) return;
    try {
        const data = JSON.parse(fs.readFileSync(s.storeFilePath, 'utf-8'));
        if (data.contacts) s.contactsStore = data.contacts;
        if (Array.isArray(data.savedLists)) s.savedListsStore = data.savedLists;
        if (Array.isArray(data.savedTemplates)) s.savedTemplatesStore = data.savedTemplates;
        if (Array.isArray(data.scheduledBroadcasts)) s.scheduledBroadcasts = data.scheduledBroadcasts;
        if (Array.isArray(data.broadcastHistory)) s.broadcastHistory = data.broadcastHistory;
        if (Array.isArray(data.chats)) {
            data.chats.forEach(c => {
                if (c.id && isAllowedJid(c.id)) s.allChatsMap.set(c.id, c);
            });
        }
        if (data.messages) {
            Object.entries(data.messages).forEach(([jid, msgs]) => {
                if (Array.isArray(msgs)) s.messagesStore.set(jid, msgs.slice(-MAX_MESSAGES_PER_CHAT).map(stripImage));
            });
        }
        // Cleanup any empty contact stubs loaded from previous store files
        for (const [jid, c] of s.allChatsMap.entries()) {
            const msgs = s.messagesStore.get(jid);
            const hasMsgs = Array.isArray(msgs) && msgs.length > 0;
            const hasValidTimestamp = typeof c.lastMessageTimestamp === 'number' && c.lastMessageTimestamp > 0;
            const hasRealLastMsg = c.lastMessage && c.lastMessage !== 'Personal Contact' && c.lastMessage.trim() !== '';
            const hasUnread = (c.unreadCount || 0) > 0;
            if (!c.isGroup && !hasMsgs && !hasRealLastMsg && !hasValidTimestamp && !hasUnread) {
                s.allChatsMap.delete(jid);
            }
        }
        console.log(`📁 [User:${s.userId}] Loaded ${Object.keys(s.contactsStore).length} contacts, ${s.allChatsMap.size} active chats`);
    } catch (e) {
        console.error(`[User:${s.userId}] Error loading store:`, e.message);
    }
}

function saveStoreToDisk(s, immediate = false) {
    if (immediate) {
        _flushStore(s);
    } else {
        if (!s._saveDiskTimer) {
            s._saveDiskTimer = setTimeout(() => {
                s._saveDiskTimer = null;
                _flushStore(s);
            }, 3000);
        }
    }
}

function _flushStore(s) {
    try {
        const chats = Array.from(s.allChatsMap.values());
        const messages = {};
        s.messagesStore.forEach((msgs, jid) => { messages[jid] = msgs.slice(-MAX_MESSAGES_PER_CHAT).map(stripImage); });
        fs.writeFileSync(s.storeFilePath, JSON.stringify({
            savedLists: s.savedListsStore,
            savedTemplates: s.savedTemplatesStore,
            scheduledBroadcasts: s.scheduledBroadcasts,
            broadcastHistory: s.broadcastHistory.slice(-200),
            contacts: s.contactsStore,
            chats,
            messages
        }, null, 2), 'utf-8');
    } catch (e) {
        console.error(`[User:${s.userId}] Error saving store:`, e.message);
    }
}

// ─── WhatsApp Connection ──────────────────────────────────────────────────────

// Baileys' multi-file auth store opens every key file at once (Promise.all), which
// hits the open-files limit (EMFILE) on shared hosting. Process keys in small batches.
function limitAuthKeyConcurrency(keys, batchSize = 10) {
    return {
        get: async (type, ids) => {
            const result = {};
            for (let i = 0; i < ids.length; i += batchSize) {
                Object.assign(result, await keys.get(type, ids.slice(i, i + batchSize)));
            }
            return result;
        },
        set: async (data) => {
            const entries = [];
            for (const category in data) {
                for (const id in data[category]) entries.push([category, id, data[category][id]]);
            }
            for (let i = 0; i < entries.length; i += batchSize) {
                const batch = {};
                for (const [category, id, value] of entries.slice(i, i + batchSize)) {
                    (batch[category] ||= {})[id] = value;
                }
                await keys.set(batch);
            }
        },
    };
}

const waLogger = pino({ level: process.env.WA_LOG_LEVEL || 'warn' });
const historySyncDisabled = process.env.WA_HISTORY_SYNC === 'false';

function isAllowedJid(jid) {
    if (!jid) return false;
    return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us');
}

async function connectToWhatsApp(s) {
    if (s._connecting) return;
    s._connecting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(s.authFolder);

        s.waSock = makeWASocket({
            auth: { creds: state.creds, keys: limitAuthKeyConcurrency(state.keys) },
            logger: waLogger,
            ...(historySyncDisabled ? { shouldSyncHistoryMessage: () => false } : {}),
            printQRInTerminal: false,
            browser: ['ISP Tickets Hub', 'Chrome', '120.0.0'],
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
                const msgs = s.messagesStore.get(key.remoteJid) || [];
                const found = msgs.find(m => m.id === key.id);
                return found ? { conversation: found.text } : { conversation: '' };
            }
        });

        s.waSock.ev.on('creds.update', saveCreds);

        s.waSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                s.currentQRDataURL = await QRCode.toDataURL(qr);
                s.connectionStatus = 'qr_ready';
                console.log(`🔄 [User:${s.userId}] New QR generated`);
            }

            if (connection === 'open') {
                s._connecting = false;
                s.connectionStatus = 'connected';
                s.currentQRDataURL = null;

                const rawId = s.waSock.user.id || '';
                const phone = rawId.split(':')[0].split('@')[0];
                s.userProfile = { name: s.waSock.user.name || ('+' + phone), phone: '+' + phone, profilePic: null };
                console.log(`✅ [User:${s.userId}] Connected:`, s.userProfile);

                try {
                    const ownJid = rawId.includes('@') ? rawId : (phone + '@s.whatsapp.net');
                    const pic = await s.waSock.profilePictureUrl(ownJid, 'image').catch(() => null);
                    s.userProfile.profilePic = pic || null;
                    s.profilePicCache.set(ownJid, pic || null);
                } catch (e) {}

                setTimeout(() => syncChatsAndGroups(s), 2000);
            setTimeout(() => fetchProfilePics(s), 8000);
            }

            if (connection === 'close') {
                s._connecting = false;
                s.connectionStatus = 'disconnected';
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[User:${s.userId}] Connection closed. Code:${statusCode} Reconnect:${shouldReconnect}`);

                if (shouldReconnect) {
                    setTimeout(() => connectToWhatsApp(s), 3000);
                } else {
                    // Logged out — clean and restart for new QR
                    if (fs.existsSync(s.authFolder)) {
                        try { fs.rmSync(s.authFolder, { recursive: true, force: true }); } catch (e) {}
                    }
                    if (fs.existsSync(s.storeFilePath)) {
                        try { fs.unlinkSync(s.storeFilePath); } catch (e) {}
                    }
                    // Reset session data but keep it in sessions map
                    s.contactsStore = {};
                    s.allChatsMap.clear();
                    s.messagesStore.clear();
                    s.profilePicCache.clear();
                    s.savedListsStore = [];
                    s.savedTemplatesStore = [];
                    s.scheduledBroadcasts = [];
                    setTimeout(() => connectToWhatsApp(s), 2000);
                }
            }
        });

        // History Sync
        s.waSock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
            if (contacts) {
                contacts.forEach(c => {
                    if (!c.id) return;
                    s.contactsStore[c.id] = { id: c.id, name: c.name || c.notify || c.pushName || null, notify: c.notify || null, pushName: c.pushName || null };
                    updateChatName(s, c.id, c.name || c.notify || c.pushName);
                });
            }
            if (chats) chats.forEach(c => addOrUpdateChat(s, c));
            if (messages) messages.forEach(msg => processMessage(s, msg));
            saveStoreToDisk(s);
        });

        s.waSock.ev.on('contacts.set', ({ contacts }) => {
            contacts.forEach(c => {
                if (!c.id) return;
                s.contactsStore[c.id] = { id: c.id, name: c.name || c.notify || c.pushName || null, notify: c.notify || null, pushName: c.pushName || null };
                updateChatName(s, c.id, c.name || c.notify || c.pushName);
            });
            saveStoreToDisk(s);
        });

        s.waSock.ev.on('contacts.upsert', (contacts) => {
            contacts.forEach(c => {
                if (!c.id) return;
                s.contactsStore[c.id] = {
                    id: c.id,
                    name: c.name || s.contactsStore[c.id]?.name || null,
                    notify: c.notify || s.contactsStore[c.id]?.notify || null,
                    pushName: c.pushName || s.contactsStore[c.id]?.pushName || null,
                };
                updateChatName(s, c.id, c.name || c.notify || c.pushName);
            });
            saveStoreToDisk(s);
        });

        s.waSock.ev.on('contacts.update', (updates) => {
            updates.forEach(c => {
                if (!c.id) return;
                if (!s.contactsStore[c.id]) s.contactsStore[c.id] = { id: c.id };
                if (c.name) s.contactsStore[c.id].name = c.name;
                if (c.notify) s.contactsStore[c.id].notify = c.notify;
                if (c.pushName) s.contactsStore[c.id].pushName = c.pushName;
                updateChatName(s, c.id, c.name || c.notify || c.pushName);
            });
            saveStoreToDisk(s);
        });

        s.waSock.ev.on('chats.set', ({ chats }) => {
            chats.forEach(c => addOrUpdateChat(s, c));
            saveStoreToDisk(s);
        });

        s.waSock.ev.on('chats.upsert', (chats) => {
            chats.forEach(c => addOrUpdateChat(s, c));
            saveStoreToDisk(s);
        });

        s.waSock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify' || m.type === 'append') {
                for (const msg of m.messages) await processMessage(s, msg, true);
                saveStoreToDisk(s);
            }
        });

    } catch (err) {
        s._connecting = false;
        console.error(`[User:${s.userId}] Connect error:`, err.message);
        setTimeout(() => connectToWhatsApp(s), 5000);
    }
}

function updateChatName(s, jid, name) {
    if (!jid || !name) return;
    if (s.allChatsMap.has(jid)) {
        const chat = s.allChatsMap.get(jid);
        if (!chat.name || chat.name.startsWith('+') || chat.name === jid) chat.name = name;
    }
}

function addOrUpdateChat(s, c) {
    if (!c.id || !isAllowedJid(c.id)) return;
    const isGroup = c.id.endsWith('@g.us');
    const ci = s.contactsStore[c.id] || {};
    const name = c.name || c.subject || ci.name || ci.notify || ci.pushName || (isGroup ? 'WhatsApp Group' : ('+' + c.id.replace('@s.whatsapp.net', '')));
    const ctMs = c.conversationTimestamp ? c.conversationTimestamp * 1000 : 0;
    const existing = s.allChatsMap.get(c.id) || {
        id: c.id, name, isGroup, unreadCount: c.unreadCount || 0,
        lastMessage: '', timestamp: '', lastMessageTimestamp: ctMs
    };
    if (name && (existing.name.startsWith('+') || existing.name === 'WhatsApp Group')) existing.name = name;
    if (c.unreadCount !== undefined) existing.unreadCount = c.unreadCount;
    if (ctMs > (existing.lastMessageTimestamp || 0)) {
        existing.lastMessageTimestamp = ctMs;
        existing.timestamp = new Date(ctMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    s.allChatsMap.set(c.id, existing);
}

async function processMessage(s, msg, downloadImage = false) {
    if (!msg.message) return;
    const jid = msg.key.remoteJid;
    if (!jid || !isAllowedJid(jid)) return;
    const fromMe = msg.key.fromMe;
    const mMsg = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message;
    const hasImage = !!(mMsg.imageMessage);
    const text = mMsg.conversation || mMsg.extendedTextMessage?.text ||
        (mMsg.imageMessage ? (mMsg.imageMessage.caption || '') : '') ||
        (mMsg.videoMessage ? (mMsg.videoMessage.caption || '📹 Video') : '') ||
        (mMsg.documentMessage ? ('📄 ' + (mMsg.documentMessage.fileName || 'Document')) : '') ||
        (mMsg.audioMessage ? '🎵 Voice Message' : '') ||
        (mMsg.stickerMessage ? '🎨 Sticker' : '') ||
        (mMsg.reactionMessage ? (mMsg.reactionMessage.text || '❤️') : '') ||
        (mMsg.locationMessage ? '📍 Location' : '') ||
        (mMsg.contactMessage ? ('👤 ' + (mMsg.contactMessage.displayName || 'Contact')) : '') || '';
    const senderName = msg.pushName || (fromMe ? 'You' : jid.split('@')[0]);

    if (!fromMe && msg.pushName && jid.endsWith('@s.whatsapp.net')) {
        if (!s.contactsStore[jid]) s.contactsStore[jid] = { id: jid };
        if (!s.contactsStore[jid].name) s.contactsStore[jid].name = msg.pushName;
        s.contactsStore[jid].pushName = msg.pushName;
    }

    const msgTimeMs = msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now();
    const timestamp = new Date(msgTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!s.messagesStore.has(jid)) s.messagesStore.set(jid, []);
    const history = s.messagesStore.get(jid);
    if (!history.some(m => m.id === msg.key.id)) {
        let imageBase64 = null;
        if (hasImage && downloadImage && s.waSock) {
            try {
                const buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: s.waSock.updateMediaMessage });
                const mime = mMsg.imageMessage.mimetype || 'image/jpeg';
                imageBase64 = `data:${mime};base64,${buf.toString('base64')}`;
            } catch(e) {}
        }
        const msgObj = { id: msg.key.id, fromMe, senderName, text, timestamp, hasImage, msgTimeMs };
        if (imageBase64) msgObj.imageBase64 = imageBase64;
        history.push(msgObj);
        trimHistory(history);
    }

    const isGroup = jid.endsWith('@g.us');
    const ci = s.contactsStore[jid] || {};
    const chatName = isGroup ? (s.allChatsMap.get(jid)?.name || 'Group Chat') : (ci.name || ci.notify || ci.pushName || senderName || ('+' + jid.split('@')[0]));
    const existingChat = s.allChatsMap.get(jid) || { id: jid, name: chatName, isGroup, unreadCount: 0 };
    existingChat.lastMessage = text;
    existingChat.lastSender = fromMe ? 'You' : (isGroup ? senderName : null);
    existingChat.timestamp = timestamp;
    existingChat.lastMessageTimestamp = msgTimeMs;
    existingChat.fromMe = fromMe;
    if (!fromMe) existingChat.unreadCount = (existingChat.unreadCount || 0) + 1;
    s.allChatsMap.set(jid, existingChat);
}

async function syncChatsAndGroups(s) {
    if (!s.waSock || s.connectionStatus !== 'connected') return;
    try {
        const groups = await s.waSock.groupFetchAllParticipating();
        Object.values(groups).forEach(g => {
            const ex = s.allChatsMap.get(g.id);
            s.allChatsMap.set(g.id, {
                id: g.id,
                name: g.subject || g.id,
                isGroup: true,
                unreadCount: ex?.unreadCount || 0,
                lastMessage: ex?.lastMessage || `${g.participants?.length || 0} members`,
                timestamp: ex?.timestamp || 'Group',
                lastMessageTimestamp: ex?.lastMessageTimestamp || 0,
                participants: g.participants?.length || 0
            });
        });
        console.log(`📋 [User:${s.userId}] Synced ${Object.keys(groups).length} groups`);
    } catch (err) {
        console.log(`[User:${s.userId}] Group sync:`, err.message);
    }

    try {
        let pc = 0;
        Object.values(s.contactsStore).forEach(contact => {
            const jid = contact.id || '';
            if (!jid || !jid.endsWith('@s.whatsapp.net') || jid === s.waSock.user?.id) return;
            const name = contact.name || contact.notify || contact.pushName || ('+' + jid.replace('@s.whatsapp.net', ''));
            // Only update contact name for chats that already exist in allChatsMap.
            // Do NOT insert empty contacts without conversations into allChatsMap!
            if (s.allChatsMap.has(jid)) {
                const ex = s.allChatsMap.get(jid);
                if (name && (!ex.name || ex.name.startsWith('+'))) ex.name = name;
                pc++;
            }
        });
        console.log(`👤 [User:${s.userId}] Updated names for ${pc} existing personal chats`);
    } catch (err) {
        console.error(`[User:${s.userId}] Contact sync:`, err.message);
    }

    saveStoreToDisk(s);
}

// Profile pic helpers
function scheduleProfilePicFetch(s) {
    if (s._picFetchTimer) return;
    s._picFetchTimer = setTimeout(() => {
        s._picFetchTimer = null;
        fetchProfilePics(s);
    }, 60000);
}

async function fetchProfilePics(s) {
    if (!s.waSock || s.connectionStatus !== 'connected') return;
    const jids = Array.from(s.allChatsMap.keys()).slice(0, 40);
    for (const jid of jids) {
        if (!s.profilePicCache.has(jid)) {
            try {
                const url = await s.waSock.profilePictureUrl(jid, 'image');
                s.profilePicCache.set(jid, url || null);
                if (s.allChatsMap.has(jid)) s.allChatsMap.get(jid).profilePic = url || null;
            } catch (e) {
                s.profilePicCache.set(jid, null);
            }
        }
    }
}

// ─── Scheduled Broadcast Cron ─────────────────────────────────────────────────

async function runScheduledBroadcasts() {
    const now = Date.now();
    for (const [, s] of sessions) {
        if (s.connectionStatus !== 'connected' || !s.waSock) continue;
        const due = s.scheduledBroadcasts.filter(b => b.scheduledAt <= now && b.status === 'pending');
        for (const b of due) {
            b.status = 'sending';
            console.log(`📅 [User:${s.userId}] Sending scheduled broadcast "${b.name}" to ${b.jids.length} recipients`);
            let sentCount = 0, failCount = 0;
            for (const jid of b.jids) {
                try {
                    if (b.imageBase64) {
                        const buf = Buffer.from(b.imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                        await s.waSock.sendMessage(jid, { image: buf, caption: b.message || '' });
                    } else {
                        await s.waSock.sendMessage(jid, { text: b.message || '' });
                    }
                    sentCount++;
                } catch (e) {
                    failCount++;
                }
                await new Promise(r => setTimeout(r, 800));
            }
            b.status = 'done';
            s.broadcastHistory.unshift({
                id: 'hist-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                name: b.name,
                message: b.message,
                jids: b.jids,
                sentCount,
                failCount,
                scheduledAt: b.scheduledAt,
                timestamp: new Date().toLocaleString(),
                type: 'scheduled'
            });
            saveStoreToDisk(s, true);
        }
        // Clean up done scheduled broadcasts older than 7 days
        s.scheduledBroadcasts = s.scheduledBroadcasts.filter(b => b.status !== 'done' || (now - b.scheduledAt) < 7 * 86400000);
    }
}

setInterval(runScheduledBroadcasts, 60000); // check every minute

// ─── Auth Routes ───────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { username, password, remember } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    const users = getUsers();
    const lowerInput = String(username || '').toLowerCase().trim();
    const user = users.find(u => 
        (String(u.username || '').toLowerCase() === lowerInput || String(u.email || '').toLowerCase() === lowerInput) && 
        u.password === password
    );
    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const maxAgeDays = remember ? 30 : 1;
    const expiresAt = Date.now() + (maxAgeDays * 24 * 60 * 60 * 1000);
    activeSessions.set(token, {
        user: { id: String(user.id || user.username), username: user.username, email: user.email || '', name: user.name, role: user.role },
        expiresAt
    });
    res.setHeader('Set-Cookie', `wa_auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}`);
    return res.json({ success: true, user: { id: String(user.id || user.username), username: user.username, email: user.email || '', name: user.name, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
    const cookies = parseCookies(req);
    if (cookies.wa_auth_token) {
        activeSessions.delete(cookies.wa_auth_token);
    }
    res.setHeader('Set-Cookie', 'wa_auth_token=; Path=/; HttpOnly; Max-Age=0');
    return res.json({ success: true, message: 'Logged out' });
});

app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ authenticated: false });
    return res.json({ authenticated: true, user });
});

// Login Page Route
app.get('/login', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Protect root page /
app.get('/', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Admin User Management Endpoints ────────────────────────────────────────
app.get('/api/admin/users', (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const users = getUsers().map(u => ({
        id: String(u.id),
        username: u.username,
        email: u.email || '',
        name: u.name,
        role: u.role
    }));
    return res.json({ success: true, users });
});

app.post('/api/admin/users', (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const { name, username, email, password, role } = req.body || {};
    if (!name || !password || (!username && !email)) {
        return res.status(400).json({ success: false, message: 'Name, Email/Username, and Password are required' });
    }
    const users = getUsers();
    const cleanUsername = String(username || email.split('@')[0]).trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    // Check duplicate
    if (users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase() || (cleanEmail && (u.email || '').toLowerCase() === cleanEmail))) {
        return res.status(400).json({ success: false, message: 'Username or Email already exists' });
    }

    const newUser = {
        id: String(Date.now()),
        username: cleanUsername,
        email: cleanEmail,
        password: String(password).trim(),
        name: String(name).trim(),
        role: role === 'admin' ? 'admin' : 'user'
    };

    users.push(newUser);
    saveUsers(users);

    return res.json({ 
        success: true, 
        message: 'User created successfully', 
        user: { id: newUser.id, username: newUser.username, email: newUser.email, name: newUser.name, role: newUser.role } 
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const targetId = String(req.params.id);
    if (targetId === String(authUser.id)) {
        return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }
    let users = getUsers();
    const userToDelete = users.find(u => String(u.id) === targetId);
    if (!userToDelete) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Clean up session if active
    const s = sessions.get(targetId);
    if (s && s.waSock) {
        try { s.waSock.logout(); } catch(e) {}
        try { s.waSock.end(); } catch(e) {}
    }
    sessions.delete(targetId);

    // Clean up on-disk auth and store
    const authDir = path.join(__dirname, `auth_info_${targetId}`);
    const storeFile = path.join(__dirname, `baileys_store_${targetId}.json`);
    try { if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true }); } catch(e) {}
    try { if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile); } catch(e) {}

    users = users.filter(u => String(u.id) !== targetId);
    saveUsers(users);

    // Invalidate active login tokens for this user
    for (const [tok, sess] of activeSessions.entries()) {
        if (String(sess.user?.id) === targetId) {
            activeSessions.delete(tok);
        }
    }

    return res.json({ success: true, message: 'User and WhatsApp session deleted successfully' });
});

// Admin update user (Name, Email, Password, Role)
app.put('/api/admin/users/:id', (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const targetId = String(req.params.id);
    const { name, email, password, role } = req.body || {};
    let users = getUsers();
    const userToEdit = users.find(u => String(u.id) === targetId);
    if (!userToEdit) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) userToEdit.name = String(name).trim();
    if (email) {
        const cleanEmail = String(email).trim().toLowerCase();
        if (users.some(u => String(u.id) !== targetId && ((u.email || '').toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanEmail))) {
            return res.status(400).json({ success: false, message: 'Email already used by another user' });
        }
        userToEdit.email = cleanEmail;
        userToEdit.username = cleanEmail;
    }
    if (password && String(password).trim().length > 0) {
        userToEdit.password = String(password).trim();
    }
    if (role && targetId !== String(authUser.id)) {
        userToEdit.role = role === 'admin' ? 'admin' : 'user';
    }

    saveUsers(users);
    return res.json({ success: true, message: 'User updated successfully' });
});

// User self-service change password
app.post('/api/auth/change-password', (req, res) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }
    let users = getUsers();
    const user = users.find(u => String(u.id) === String(authUser.id));
    if (!user || user.password !== currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = String(newPassword).trim();
    saveUsers(users);
    return res.json({ success: true, message: 'Password changed successfully' });
});

// Protect all /api/whatsapp/* endpoints (Sets req.user for isolated sessions)
app.use('/api/whatsapp', (req, res, next) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
    }
    req.user = user;
    next();
});

// ─── API Routes ───────────────────────────────────────────────────────────────

// Sessions list (for super admin)
app.get('/api/whatsapp/sessions', (req, res) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const list = [];
    const allUsers = getUsers();
    for (const [userId, s] of sessions) {
        const u = allUsers.find(x => String(x.id) === String(userId));
        list.push({
            userId,
            userName: u ? u.name : ('User #' + userId),
            userEmail: u ? u.email : '',
            status: s.connectionStatus,
            user: s.userProfile,
            hasQR: !!s.currentQRDataURL,
            chatCount: s.allChatsMap.size
        });
    }
    res.json({ sessions: list });
});

app.get('/api/whatsapp/status', (req, res) => {
    const s = getSessionFromReq(req);
    res.json({ status: s.connectionStatus, user: s.userProfile, hasQR: !!s.currentQRDataURL, chatCount: s.allChatsMap.size });
});

app.get('/api/whatsapp/qr', (req, res) => {
    const s = getSessionFromReq(req);
    res.json({ status: s.connectionStatus, qrDataURL: s.currentQRDataURL });
});

app.get('/api/whatsapp/chats', (req, res) => {
    const s = getSessionFromReq(req);
    // Cleanup invalid or empty contact stubs
    for (const [jid, c] of s.allChatsMap.entries()) {
        if (!isAllowedJid(jid)) {
            s.allChatsMap.delete(jid);
            continue;
        }
        const msgs = s.messagesStore.get(jid);
        const hasMsgs = Array.isArray(msgs) && msgs.length > 0;
        const hasValidTimestamp = typeof c.lastMessageTimestamp === 'number' && c.lastMessageTimestamp > 0;
        const hasRealLastMsg = c.lastMessage && c.lastMessage !== 'Personal Contact' && c.lastMessage.trim() !== '';
        const hasUnread = (c.unreadCount || 0) > 0;

        // If not a group and no messages, no real last message, no timestamp, and no unread:
        // Delete empty phonebook contact stub from allChatsMap so it doesn't clutter chat list
        if (!c.isGroup && !hasMsgs && !hasRealLastMsg && !hasValidTimestamp && !hasUnread) {
            s.allChatsMap.delete(jid);
        }
    }

    // Only return chats that have active conversation, are groups, or have unread messages
    const chats = Array.from(s.allChatsMap.values()).filter(c => {
        if (c.isGroup) return true;
        const msgs = s.messagesStore.get(c.id);
        const hasMsgs = Array.isArray(msgs) && msgs.length > 0;
        const hasValidTimestamp = typeof c.lastMessageTimestamp === 'number' && c.lastMessageTimestamp > 0;
        const hasRealLastMsg = c.lastMessage && c.lastMessage !== 'Personal Contact' && c.lastMessage.trim() !== '';
        const hasUnread = (c.unreadCount || 0) > 0;
        return hasMsgs || hasValidTimestamp || hasRealLastMsg || hasUnread;
    });

    // Make sure lastMessageTimestamp and details are accurate from the latest message in store
    chats.forEach(c => {
        const msgs = s.messagesStore.get(c.id);
        if (msgs && msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg.msgTimeMs && (!c.lastMessageTimestamp || lastMsg.msgTimeMs > c.lastMessageTimestamp)) {
                c.lastMessageTimestamp = lastMsg.msgTimeMs;
            }
            if (!c.lastMessage || c.lastMessage === 'Click to chat' || c.lastMessage === 'Personal Contact' || /^\d+\s*members$/i.test(c.lastMessage.trim())) {
                c.lastMessage = lastMsg.text || (lastMsg.hasImage ? '📷 Photo' : '');
            }
            c.fromMe = lastMsg.fromMe || false;
            c.lastSender = lastMsg.fromMe ? 'You' : (c.isGroup ? lastMsg.senderName : null);
            if (lastMsg.timestamp) {
                c.timestamp = lastMsg.timestamp;
            }
        }
    });

    // Real WhatsApp sorting: newest lastMessageTimestamp first!
    chats.sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));

    chats.forEach(c => { if (s.profilePicCache.has(c.id)) c.profilePic = s.profilePicCache.get(c.id); });
    res.json({ status: s.connectionStatus, chats });
    if (s.connectionStatus === 'connected') scheduleProfilePicFetch(s);
});

app.post('/api/whatsapp/mark-read', async (req, res) => {
    const s = getSessionFromReq(req);
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, message: 'jid is required' });

    // 1. Clear unreadCount in memory
    if (s.allChatsMap.has(jid)) {
        const chat = s.allChatsMap.get(jid);
        chat.unreadCount = 0;
        s.allChatsMap.set(jid, chat);
    }

    // 2. Call Baileys readMessages to send read receipts ("seen" / blue ticks) to WhatsApp
    if (s.waSock && s.connectionStatus === 'connected') {
        try {
            const msgs = s.messagesStore.get(jid) || [];
            const unreadKeys = [];
            for (let i = msgs.length - 1; i >= 0 && unreadKeys.length < 15; i--) {
                const m = msgs[i];
                if (!m.fromMe && m.id) {
                    unreadKeys.push({
                        remoteJid: jid,
                        id: m.id,
                        participant: jid.endsWith('@g.us') ? m.participant : undefined
                    });
                }
            }
            if (unreadKeys.length > 0 && typeof s.waSock.readMessages === 'function') {
                await s.waSock.readMessages(unreadKeys);
            }
        } catch (e) {
            console.log(`[User:${s.userId}] mark-read note:`, e.message);
        }
    }

    saveStoreToDisk(s);
    res.json({ success: true, jid });
});

app.get('/api/whatsapp/contacts', (req, res) => {
    const s = getSessionFromReq(req);
    const contacts = Object.values(s.contactsStore).filter(c => c.id && c.id.endsWith('@s.whatsapp.net'));
    res.json({ contacts });
});

app.get('/api/whatsapp/messages', (req, res) => {
    const s = getSessionFromReq(req);
    const jid = req.query.jid;
    if (!jid) return res.json({ messages: [] });
    res.json({ messages: s.messagesStore.get(jid) || [] });
});

app.get('/api/whatsapp/search', (req, res) => {
    const s = getSessionFromReq(req);
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 2) return res.json({ results: [] });

    const results = [];
    for (const [jid, messages] of s.messagesStore.entries()) {
        const chat = s.allChatsMap.get(jid);
        const chatName = chat?.name || jid.split('@')[0];
        for (const msg of messages) {
            if (msg.text && msg.text.toLowerCase().includes(q)) {
                results.push({
                    jid,
                    chatName,
                    messageId: msg.id,
                    text: msg.text,
                    fromMe: msg.fromMe,
                    senderName: msg.senderName,
                    timestamp: msg.timestamp,
                });
                if (results.length >= 50) break;
            }
        }
        if (results.length >= 50) break;
    }
    results.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ results });
});

app.get('/api/whatsapp/profile-pic', async (req, res) => {
    const s = getSessionFromReq(req);
    const jid = req.query.jid;
    if (!jid) return res.json({ url: null });
    if (s.profilePicCache.has(jid)) return res.json({ url: s.profilePicCache.get(jid) });
    if (!s.waSock || s.connectionStatus !== 'connected') return res.json({ url: null });
    try {
        const url = await s.waSock.profilePictureUrl(jid, 'image');
        s.profilePicCache.set(jid, url || null);
        res.json({ url: url || null });
    } catch (e) {
        s.profilePicCache.set(jid, null);
        res.json({ url: null });
    }
});

app.post('/api/whatsapp/profile-pics', async (req, res) => {
    const s = getSessionFromReq(req);
    const { jids } = req.body;
    if (!Array.isArray(jids)) return res.json({ pics: {} });
    const pics = {};
    for (const jid of jids.slice(0, 50)) {
        if (s.profilePicCache.has(jid)) { pics[jid] = s.profilePicCache.get(jid); continue; }
        if (!s.waSock || s.connectionStatus !== 'connected') { pics[jid] = null; continue; }
        try {
            const url = await s.waSock.profilePictureUrl(jid, 'image');
            s.profilePicCache.set(jid, url || null);
            pics[jid] = url || null;
        } catch (e) {
            s.profilePicCache.set(jid, null);
            pics[jid] = null;
        }
    }
    res.json({ pics });
});

app.post('/api/whatsapp/send', async (req, res) => {
    const s = getSessionFromReq(req);
    let { targetJid, text, imageBase64 } = req.body;
    if (!targetJid) return res.status(400).json({ success: false, message: 'targetJid is required' });
    if (!s.waSock || s.connectionStatus !== 'connected') return res.status(400).json({ success: false, message: 'WhatsApp not connected' });

    const parts = targetJid.split('@');
    let number = parts[0].replace(/[^0-9]/g, '');
    const domain = parts[1] || 's.whatsapp.net';
    if (!number.startsWith('880') && number.startsWith('01')) number = '88' + number;
    targetJid = `${number}@${domain}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            let sendResult;
            if (imageBase64) {
                const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                sendResult = await s.waSock.sendMessage(targetJid, { image: buf, caption: text || '' });
            } else {
                sendResult = await s.waSock.sendMessage(targetJid, { text: text || '' });
            }
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (!s.messagesStore.has(targetJid)) s.messagesStore.set(targetJid, []);
            s.messagesStore.get(targetJid).push({ id: sendResult?.key?.id || ('msg-' + Date.now()), fromMe: true, senderName: 'You', text: text || '', imageBase64: imageBase64 || null, timestamp });
            trimHistory(s.messagesStore.get(targetJid));
            const ec = s.allChatsMap.get(targetJid) || { id: targetJid, name: '+' + targetJid.replace('@s.whatsapp.net', ''), isGroup: targetJid.includes('@g.us'), unreadCount: 0 };
            ec.lastMessage = text || (imageBase64 ? '🖼️ Image' : '');
            ec.lastSender = 'You'; ec.timestamp = timestamp; ec.lastMessageTimestamp = Date.now();
            s.allChatsMap.set(targetJid, ec);
            saveStoreToDisk(s);
            return res.json({ success: true, message: 'Message sent', sendResult });
        } catch (err) {
            if (attempt === 2) return res.status(500).json({ success: false, message: err.message });
            await new Promise(r => setTimeout(r, 1500));
        }
    }
});

// Bulk broadcast (sends to many, records history)
app.post('/api/whatsapp/broadcast', async (req, res) => {
    const s = getSessionFromReq(req);
    const { name, jids, message, imageBase64 } = req.body;
    if (!Array.isArray(jids) || jids.length === 0) return res.status(400).json({ success: false, message: 'jids required' });
    if (!s.waSock || s.connectionStatus !== 'connected') return res.status(400).json({ success: false, message: 'WhatsApp not connected' });

    let sentCount = 0, failCount = 0;
    for (const rawJid of jids) {
        let jid = rawJid;
        const parts = jid.split('@');
        let number = parts[0].replace(/[^0-9]/g, '');
        const domain = parts[1] || 's.whatsapp.net';
        if (!number.startsWith('880') && number.startsWith('01')) number = '88' + number;
        jid = `${number}@${domain}`;
        try {
            if (imageBase64) {
                const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                await s.waSock.sendMessage(jid, { image: buf, caption: message || '' });
            } else {
                await s.waSock.sendMessage(jid, { text: message || '' });
            }
            sentCount++;
        } catch (e) {
            failCount++;
        }
        await new Promise(r => setTimeout(r, 600));
    }

    const histEntry = {
        id: 'hist-' + Date.now(),
        name: name || 'Broadcast',
        message,
        jids,
        sentCount,
        failCount,
        timestamp: new Date().toLocaleString(),
        type: 'immediate'
    };
    s.broadcastHistory.unshift(histEntry);
    saveStoreToDisk(s, true);

    res.json({ success: true, sentCount, failCount, histEntry });
});

app.post('/api/whatsapp/add-contact', async (req, res) => {
    const s = getSessionFromReq(req);
    let { phone, name } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (!cleaned.startsWith('880') && cleaned.startsWith('01')) cleaned = '88' + cleaned;
    const jid = cleaned + '@s.whatsapp.net';
    try {
        if (s.waSock) {
            try {
                const [result] = await s.waSock.onWhatsApp(cleaned);
                if (!result?.exists) return res.json({ success: false, message: 'Not registered on WhatsApp' });
            } catch (e) {}
        }
        const contactName = name || ('+' + cleaned);
        const newContact = { id: jid, name: contactName, isGroup: false, unreadCount: 0, lastMessage: 'Tap to start', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        s.contactsStore[jid] = { id: jid, name: contactName };
        s.allChatsMap.set(jid, newContact);
        saveStoreToDisk(s);
        res.json({ success: true, contact: newContact });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Saved Lists (Personal + Global Quick Select)
app.get('/api/whatsapp/saved-lists', (req, res) => {
    const s = getSessionFromReq(req);
    res.json({ lists: s.savedListsStore, globalLists: globalListsStore });
});

app.post('/api/whatsapp/saved-lists', (req, res) => {
    const s = getSessionFromReq(req);
    const { name, jids, scope } = req.body;
    const isAdmin = req.headers['x-wa-admin'] === '1';
    if (!name || !Array.isArray(jids) || jids.length === 0) return res.status(400).json({ success: false, message: 'Name and jids required' });
    
    const isGlobal = (scope === 'global');
    const newList = { 
        id: 'list-' + Date.now(), 
        name: name.trim(), 
        jids, 
        targetCount: jids.length, 
        createdAt: new Date().toLocaleDateString(), 
        isGlobal: isGlobal 
    };

    if (isGlobal && isAdmin) {
        globalListsStore.unshift(newList);
        saveGlobalLists();
    } else {
        s.savedListsStore.unshift(newList);
        saveStoreToDisk(s, true);
    }
    res.json({ success: true, list: newList, lists: s.savedListsStore, globalLists: globalListsStore });
});

app.post('/api/whatsapp/saved-lists/:id/rename', (req, res) => {
    const s = getSessionFromReq(req);
    const isAdmin = req.headers['x-wa-admin'] === '1';
    let list = isAdmin ? globalListsStore.find(l => l.id === req.params.id) : null;
    const isGlobal = !!list;
    if (!list) list = s.savedListsStore.find(l => l.id === req.params.id);
    if (!list) return res.status(404).json({ success: false, message: 'Not found' });
    if (!req.body.name?.trim()) return res.status(400).json({ success: false, message: 'Name required' });
    
    list.name = req.body.name.trim();
    if (isGlobal) saveGlobalLists(); else saveStoreToDisk(s);
    res.json({ success: true, lists: s.savedListsStore, globalLists: globalListsStore });
});

app.delete('/api/whatsapp/saved-lists', (req, res) => {
    const s = getSessionFromReq(req);
    const isAdmin = req.headers['x-wa-admin'] === '1';
    const id = req.query.id;
    const scope = req.query.scope;
    
    if (scope === 'global' && isAdmin) {
        globalListsStore = globalListsStore.filter(l => l.id !== id);
        saveGlobalLists();
    } else {
        s.savedListsStore = s.savedListsStore.filter(l => l.id !== id);
        saveStoreToDisk(s, true);
    }
    res.json({ success: true, lists: s.savedListsStore, globalLists: globalListsStore });
});

// ─── GitHub Cloud Sync Routes ───────────────────────────────────────────────
app.get('/api/whatsapp/github-sync/config', (req, res) => {
    const cfg = getGitHubConfig();
    const masked = {
        repo: cfg.repo || '',
        branch: cfg.branch || 'main',
        hasToken: !!cfg.token,
        token: cfg.token ? (cfg.token.slice(0, 4) + '...' + cfg.token.slice(-4)) : '',
        autoSync: !!cfg.autoSync
    };
    res.json({ success: true, config: masked });
});

app.post('/api/whatsapp/github-sync/config', (req, res) => {
    const { repo, branch, token, autoSync } = req.body || {};
    const current = getGitHubConfig();
    const cleanRepo = repo ? repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '') : current.repo;
    const newCfg = {
        repo: cleanRepo,
        branch: (branch && branch.trim()) || current.branch || 'main',
        token: (token && token.trim() && !token.includes('...')) ? token.trim() : current.token,
        autoSync: typeof autoSync === 'boolean' ? autoSync : current.autoSync
    };
    saveGitHubConfig(newCfg);
    res.json({ success: true, message: 'GitHub configuration saved', hasToken: !!newCfg.token });
});

app.post('/api/whatsapp/github-sync/pull', async (req, res) => {
    const cfg = getGitHubConfig();
    if (!cfg.repo) return res.status(400).json({ success: false, message: 'GitHub repository not configured' });
    try {
        let tmplCount = 0, listsCount = 0;
        
        // 1. Fetch global_templates.json
        try {
            const resTmpl = await githubFetchFile(cfg.repo, cfg.branch, 'global_templates.json', cfg.token);
            const parsed = JSON.parse(resTmpl.content);
            if (Array.isArray(parsed)) {
                globalTemplatesStore = parsed;
                saveGlobalTemplates();
                tmplCount = parsed.length;
            }
        } catch(e) {
            console.warn('[GitHub Sync] Templates fetch note:', e.message);
        }

        // 2. Fetch global_lists.json
        try {
            const resLists = await githubFetchFile(cfg.repo, cfg.branch, 'global_lists.json', cfg.token);
            const parsed = JSON.parse(resLists.content);
            if (Array.isArray(parsed)) {
                globalListsStore = parsed;
                saveGlobalLists();
                listsCount = parsed.length;
            }
        } catch(e) {
            console.warn('[GitHub Sync] Quick Select fetch note:', e.message);
        }

        res.json({
            success: true,
            message: `Synced successfully from GitHub! Downloaded ${tmplCount} templates & ${listsCount} quick select lists.`,
            globalTemplates: globalTemplatesStore,
            globalLists: globalListsStore
        });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Sync failed: ' + err.message });
    }
});

app.post('/api/whatsapp/github-sync/push', async (req, res) => {
    const cfg = getGitHubConfig();
    if (!cfg.repo) return res.status(400).json({ success: false, message: 'GitHub repository not configured' });
    if (!cfg.token) return res.status(400).json({ success: false, message: 'GitHub Personal Access Token required to upload/push' });

    try {
        // Push global_templates.json
        await githubPushFile(
            cfg.repo,
            cfg.branch,
            'global_templates.json',
            JSON.stringify(globalTemplatesStore, null, 2),
            `chore: update global message templates (${globalTemplatesStore.length} items)`,
            cfg.token
        );

        // Push global_lists.json
        await githubPushFile(
            cfg.repo,
            cfg.branch,
            'global_lists.json',
            JSON.stringify(globalListsStore, null, 2),
            `chore: update global quick select lists (${globalListsStore.length} items)`,
            cfg.token
        );

        res.json({
            success: true,
            message: `Successfully uploaded ${globalTemplatesStore.length} templates & ${globalListsStore.length} quick select lists to GitHub repository (${cfg.repo})!`
        });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
    }
});

// Templates — global (admin, shared) + personal (per-user)
app.get('/api/whatsapp/templates', (req, res) => {
    const s = getSessionFromReq(req);
    res.json({ globalTemplates: globalTemplatesStore, personalTemplates: s.savedTemplatesStore });
});

app.post('/api/whatsapp/templates', (req, res) => {
    const s = getSessionFromReq(req);
    const { name, message, scope } = req.body;
    const isAdmin = req.headers['x-wa-admin'] === '1';
    if (!name || !message) return res.status(400).json({ success: false, message: 'Name and message required' });
    const tmpl = { id: 'tmpl-' + Date.now(), name: name.trim(), message: message.trim(), createdAt: new Date().toLocaleDateString() };
    if (scope === 'global' && isAdmin) {
        globalTemplatesStore.unshift(tmpl);
        saveGlobalTemplates();
    } else {
        s.savedTemplatesStore.unshift(tmpl);
        saveStoreToDisk(s, true);
    }
    res.json({ success: true, globalTemplates: globalTemplatesStore, personalTemplates: s.savedTemplatesStore });
});

app.post('/api/whatsapp/templates/:id/rename', (req, res) => {
    const s = getSessionFromReq(req);
    const isAdmin = req.headers['x-wa-admin'] === '1';
    let tmpl = isAdmin ? globalTemplatesStore.find(t => t.id === req.params.id) : null;
    const isGlobal = !!tmpl;
    if (!tmpl) tmpl = s.savedTemplatesStore.find(t => t.id === req.params.id);
    if (!tmpl) return res.status(404).json({ success: false });
    if (req.body.name) tmpl.name = req.body.name.trim();
    if (req.body.message !== undefined) tmpl.message = req.body.message;
    if (isGlobal) saveGlobalTemplates(); else saveStoreToDisk(s);
    res.json({ success: true, globalTemplates: globalTemplatesStore, personalTemplates: s.savedTemplatesStore });
});

app.delete('/api/whatsapp/templates', (req, res) => {
    const s = getSessionFromReq(req);
    const isAdmin = req.headers['x-wa-admin'] === '1';
    const id = req.query.id;
    const scope = req.query.scope;
    if (scope === 'global' && isAdmin) {
        globalTemplatesStore = globalTemplatesStore.filter(t => t.id !== id);
        saveGlobalTemplates();
    } else {
        s.savedTemplatesStore = s.savedTemplatesStore.filter(t => t.id !== id);
        saveStoreToDisk(s, true);
    }
    res.json({ success: true, globalTemplates: globalTemplatesStore, personalTemplates: s.savedTemplatesStore });
});

// Scheduled Broadcasts
app.get('/api/whatsapp/scheduled-broadcasts', (req, res) => {
    const s = getSessionFromReq(req);
    res.json({ scheduled: s.scheduledBroadcasts.filter(b => b.status === 'pending') });
});

app.post('/api/whatsapp/scheduled-broadcasts', (req, res) => {
    const s = getSessionFromReq(req);
    const { name, message, imageBase64, jids, scheduledAt } = req.body;
    if (!Array.isArray(jids) || jids.length === 0) return res.status(400).json({ success: false, message: 'jids required' });
    if (!scheduledAt) return res.status(400).json({ success: false, message: 'scheduledAt required' });
    const ts = new Date(scheduledAt).getTime();
    if (isNaN(ts) || ts <= Date.now()) return res.status(400).json({ success: false, message: 'scheduledAt must be in the future' });
    const entry = {
        id: 'sched-' + Date.now(),
        name: name || 'Scheduled Broadcast',
        message: message || '',
        imageBase64: imageBase64 || null,
        jids,
        scheduledAt: ts,
        createdAt: Date.now(),
        status: 'pending'
    };
    s.scheduledBroadcasts.push(entry);
    saveStoreToDisk(s, true);
    res.json({ success: true, entry });
});

app.delete('/api/whatsapp/scheduled-broadcasts', (req, res) => {
    const s = getSessionFromReq(req);
    const id = req.query.id;
    if (!id) return res.status(400).json({ success: false, message: 'id required' });
    s.scheduledBroadcasts = s.scheduledBroadcasts.filter(b => b.id !== id);
    saveStoreToDisk(s, true);
    res.json({ success: true });
});

// Broadcast History
app.get('/api/whatsapp/broadcast-history', (req, res) => {
    const s = getSessionFromReq(req);
    res.json({ history: s.broadcastHistory });
});

app.delete('/api/whatsapp/broadcast-history', (req, res) => {
    const s = getSessionFromReq(req);
    const id = req.query.id;
    if (!id) return res.status(400).json({ success: false });
    s.broadcastHistory = s.broadcastHistory.filter(h => h.id !== id);
    saveStoreToDisk(s, true);
    res.json({ success: true });
});

// Sync
app.post('/api/whatsapp/sync', async (req, res) => {
    const s = getSessionFromReq(req);
    await syncChatsAndGroups(s);
    res.json({ success: true, chatCount: s.allChatsMap.size });
});

async function logoutSession(s) {
    s.connectionStatus = 'disconnected';
    s.currentQRDataURL = null;
    s.contactsStore = {};
    s.allChatsMap.clear();
    s.messagesStore.clear();
    s.profilePicCache.clear();
    s._connecting = false;

    if (s.waSock) {
        try { s.waSock.logout(); } catch (e) {}
        try { s.waSock.end(); } catch (e) {}
        s.waSock = null;
    }

    if (fs.existsSync(s.authFolder)) fs.rmSync(s.authFolder, { recursive: true, force: true });
    if (fs.existsSync(s.storeFilePath)) fs.unlinkSync(s.storeFilePath);

    // Reset lists/templates so they don't carry over
    s.savedListsStore = [];
    s.savedTemplatesStore = [];
    s.scheduledBroadcasts = [];
    s.broadcastHistory = [];

    setTimeout(() => connectToWhatsApp(s), 1000);
}

// Logout current user's session
app.post('/api/whatsapp/logout', async (req, res) => {
    const s = getSessionFromReq(req);
    try {
        await logoutSession(s);
        res.json({ success: true, message: 'Logged out. Generating new QR...' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Super admin: logout a specific user's session by userId
app.post('/api/whatsapp/sessions/:userId/logout', async (req, res) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const { userId } = req.params;
    const s = sessions.get(userId);
    if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
    try {
        await logoutSession(s);
        res.json({ success: true, message: `Session for user ${userId} logged out.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Multi-Account Server running on http://localhost:${PORT}`);
    // Sessions are created on first API call; no auto-start here
});
