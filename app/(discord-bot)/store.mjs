import mongoose from 'mongoose';

const BOT_MONGODB_URI = process.env.BOT_MONGODB_URI || process.env.MONGODB_URI;
const GUILD_IDS = (process.env.GUILD_IDS || process.env.GUILD_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
const GUILD_ID = GUILD_IDS[0] || '';

const DEFAULTS = {
    emailToUser: {},
    userToEmail: {},
    inviteIdToDiscord: {},
    pendingIdToDiscord: {},
    botConfig: {
        adminChannelId: '',
        adminRoleId: '',
        activeRoleId: '',
        alumniRoleId: '',
        committeeRoleMap: {},
        majorRoleMap: {},
        linksChannelId: '',
        onboardingSteps: [],
        roleCache: {},
        verifiedRoleId: '',
        committeeHeadRoleId: '',
    },
    forms: {},
    nextFormId: 1,
    onboardingProgress: {},
    lockdownState: {
        active: false,
        channelId: '',
        members: {},
        reason: '',
        durationMinutes: 0,
        startedAt: null,
        endsAt: null,
    },
};

const DiscordBotStoreSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    emailToUser: { type: mongoose.Schema.Types.Mixed, default: {} },
    userToEmail: { type: mongoose.Schema.Types.Mixed, default: {} },
    inviteIdToDiscord: { type: mongoose.Schema.Types.Mixed, default: {} },
    pendingIdToDiscord: { type: mongoose.Schema.Types.Mixed, default: {} },
    botConfig: { type: mongoose.Schema.Types.Mixed, default: DEFAULTS.botConfig },
    forms: { type: mongoose.Schema.Types.Mixed, default: {} },
    nextFormId: { type: Number, default: 1 },
    onboardingProgress: { type: mongoose.Schema.Types.Mixed, default: {} },
    lockdownState: { type: mongoose.Schema.Types.Mixed, default: DEFAULTS.lockdownState },
}, { timestamps: true });

const DiscordBotStore =
    mongoose.models.DiscordBotStore || mongoose.model('DiscordBotStore', DiscordBotStoreSchema);

let store = { ...DEFAULTS };
let storeLoaded = false;
let currentGuildId = GUILD_ID;

const connectionPromise = BOT_MONGODB_URI
    ? mongoose.connect(BOT_MONGODB_URI, { bufferCommands: false })
    : null;

function ensureConnection() {
    if (!BOT_MONGODB_URI) {
        throw new Error('BOT_MONGODB_URI or MONGODB_URI must be defined to persist bot data');
    }
    return connectionPromise || mongoose.connect(BOT_MONGODB_URI, { bufferCommands: false });
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function buildStorePayload() {
    return {
        ...store,
        guildId: currentGuildId,
    };
}

const syncToDb = async () => {
    if (!currentGuildId) return;
    await ensureConnection();
    try {
        await DiscordBotStore.findOneAndUpdate(
            { guildId: currentGuildId },
            { $set: buildStorePayload() },
            { upsert: true }
        ).lean();
    } catch (err) {
        if (err?.code === 11000 && err?.keyValue?.guildId === currentGuildId) {
            // another process inserted the document simultaneously; retry once
            await DiscordBotStore.findOneAndUpdate(
                { guildId: currentGuildId },
                { $set: buildStorePayload() },
                { upsert: true }
            ).lean().catch(() => null);
            return;
        }
        throw err;
    }
};

const persist = (() => {
    let timer;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            syncToDb().catch((err) => console.error('Failed to persist bot store', err));
        }, 200);
    };
})();

async function loadGuildStore(guildId) {
    if (!guildId) {
        store = deepClone(DEFAULTS);
        storeLoaded = true;
        currentGuildId = '';
        return store;
    }
    try {
        await ensureConnection();
        const doc = await DiscordBotStore.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId, ...DEFAULTS } },
            { new: true, upsert: true }
        ).lean();
        if (doc) {
            const loaded = {
                ...DEFAULTS,
                ...doc,
                botConfig: { ...DEFAULTS.botConfig, ...(doc.botConfig || {}) },
            };
            delete loaded._id;
            delete loaded.guildId;
            store = loaded;
        } else {
            store = deepClone(DEFAULTS);
        }
        currentGuildId = guildId;
    } catch (err) {
        console.error('Failed to load bot store from DB', err);
        store = deepClone(DEFAULTS);
        currentGuildId = guildId;
    } finally {
        storeLoaded = true;
    }
    return store;
}

export async function initStore(guildId = GUILD_ID) {
    await loadGuildStore(guildId);
}

export async function ensureGuildStore(guildId) {
    if (!guildId) return store;
    if (storeLoaded && guildId === currentGuildId) return store;
    return loadGuildStore(guildId);
}

function ensureStoreLoaded() {
    if (!storeLoaded) {
        store = deepClone(DEFAULTS);
    }
}

export function rememberEmail({ userId, email, channelId, inviteId, pendingId }) {
    ensureStoreLoaded();
    if (!userId || !email) return;
    const normalized = email.trim().toLowerCase();
    const now = Date.now();
    store.emailToUser[normalized] = { userId, channelId, savedAt: now };
    store.userToEmail[userId] = normalized;
    if (inviteId) {
        store.inviteIdToDiscord[String(inviteId)] = {
            userId,
            email: normalized,
            channelId,
            savedAt: now,
        };
    }
    if (pendingId) {
        store.pendingIdToDiscord[String(pendingId)] = {
            ...store.pendingIdToDiscord[String(pendingId)],
            inviteId: String(inviteId),
            userId,
            email: normalized,
            channelId,
            savedAt: now,
        };
    }
    persist();
}

export function getByEmail(email) {
    ensureStoreLoaded();
    if (!email) return null;
    return store.emailToUser[email.trim().toLowerCase()] || null;
}

export function getByPendingId(pendingId) {
    ensureStoreLoaded();
    if (!pendingId) return null;
    return store.pendingIdToDiscord[String(pendingId)] || null;
}

export function linkPendingToInvite(pendingId, inviteId) {
    ensureStoreLoaded();
    if (!pendingId || !inviteId) return;
    const key = String(pendingId);
    const existing = store.pendingIdToDiscord[key] || {};
    store.pendingIdToDiscord[key] = {
        ...existing,
        inviteId: String(inviteId),
        ...(store.inviteIdToDiscord[String(inviteId)] ?? {}),
    };
    persist();
}

export function findRecentInviteMapping(tsMs, windowMs = 30 * 60 * 1000) {
    ensureStoreLoaded();
    if (!tsMs) return null;
    let best = null;
    for (const [inviteId, rec] of Object.entries(store.inviteIdToDiscord)) {
        const dt = Math.abs((rec.savedAt || 0) - tsMs);
        if (dt <= windowMs) {
            if (!best || dt < best.dt) best = { inviteId, mapping: rec, dt };
        }
    }
    return best;
}

export function updateBotConfig(updates) {
    ensureStoreLoaded();
    store.botConfig = { ...store.botConfig, ...updates };
    persist();
    return store.botConfig;
}

export function getCommitteeHeadRoleId() {
    ensureStoreLoaded();
    return store.botConfig.committeeHeadRoleId || '';
}

export function setCommitteeHeadRoleId(roleId) {
    ensureStoreLoaded();
    store.botConfig.committeeHeadRoleId = roleId || '';
    persist();
}

export function getBotConfig() {
    ensureStoreLoaded();
    return store.botConfig;
}

export function addForm(form) {
    ensureStoreLoaded();
    const id = String(store.nextFormId++);
    const entry = {
        ...form,
        id,
        _id: form._id || id,
        reminders: {},
        acknowledged: [],
        roleIds: form.roleIds || [],
    };
    store.forms[id] = entry;
    persist();
    return store.forms[id];
}

export function updateForm(id, updates) {
    ensureStoreLoaded();
    if (!store.forms[id]) return null;
    store.forms[id] = { ...store.forms[id], ...updates };
    persist();
    return store.forms[id];
}

export function getForm(id) {
    ensureStoreLoaded();
    return store.forms[id] || null;
}

export function getActiveForms() {
    ensureStoreLoaded();
    const now = Date.now();
    return Object.values(store.forms).filter(
        (form) => form.active && (!form.deadline || new Date(form.deadline).getTime() >= now)
    );
}

export function addAcknowledgement(formId, ack) {
    ensureStoreLoaded();
    const form = getForm(formId);
    if (!form) return;
    if (!form.acknowledged.some((entry) => entry.userId === ack.userId)) {
        form.acknowledged.push(ack);
        persist();
    }
}

export function markReminderSent(formId, userId) {
    ensureStoreLoaded();
    const form = getForm(formId);
    if (!form) return;
    form.reminders = form.reminders || {};
    form.reminders[userId] = { lastSent: Date.now(), acknowledged: false };
    persist();
}

export function acknowledgeUser(formId, userId) {
    ensureStoreLoaded();
    const form = getForm(formId);
    if (!form) return;
    form.reminders = form.reminders || {};
    form.reminders[userId] = { ...(form.reminders[userId] || {}), acknowledged: true };
    persist();
}

export function removeForm(formId) {
    ensureStoreLoaded();
    if (!store.forms[formId]) return false;
    delete store.forms[formId];
    persist();
    return true;
}

export function setCommitteeRoleEntry(normalizedName, roleId) {
    ensureStoreLoaded();
    if (!normalizedName) return;
    const map = store.botConfig.committeeRoleMap || {};
    store.botConfig.committeeRoleMap = { ...map, [normalizedName]: roleId };
    persist();
}

export function setMajorRoleEntry(normalizedName, roleId) {
    ensureStoreLoaded();
    if (!normalizedName) return;
    const map = store.botConfig.majorRoleMap || {};
    store.botConfig.majorRoleMap = { ...map, [normalizedName]: roleId };
    persist();
}

export function getMajorRoleMap() {
    ensureStoreLoaded();
    return store.botConfig.majorRoleMap || {};
}

export function setLinksChannel(channelId) {
    ensureStoreLoaded();
    store.botConfig.linksChannelId = channelId || '';
    persist();
}

export function getLinksChannelId() {
    ensureStoreLoaded();
    return store.botConfig.linksChannelId || '';
}

export function addOnboardingStep(step) {
    ensureStoreLoaded();
    store.botConfig.onboardingSteps = store.botConfig.onboardingSteps || [];
    store.botConfig.onboardingSteps.push(step);
    persist();
    return store.botConfig.onboardingSteps;
}

export function getOnboardingSteps() {
    ensureStoreLoaded();
    return store.botConfig.onboardingSteps || [];
}

export function getOnboardingProgress() {
    ensureStoreLoaded();
    return store.onboardingProgress || {};
}

export function setOnboardingProgress(memberId, progress) {
    ensureStoreLoaded();
    store.onboardingProgress[memberId] = progress;
    persist();
}

export function clearOnboardingProgress(memberId) {
    ensureStoreLoaded();
    delete store.onboardingProgress[memberId];
    persist();
}

export function getRoleCache() {
    ensureStoreLoaded();
    return store.botConfig.roleCache || {};
}

export function setRoleCache(cache) {
    ensureStoreLoaded();
    store.botConfig.roleCache = cache;
    persist();
}

export function getVerifiedRoleId() {
    ensureStoreLoaded();
    return store.botConfig.verifiedRoleId || '';
}

export function setVerifiedRoleId(roleId) {
    ensureStoreLoaded();
    store.botConfig.verifiedRoleId = roleId;
    persist();
}

export function getLockdownState() {
    ensureStoreLoaded();
    return store.lockdownState || { active: false, channelId: '', members: {} };
}

export function setLockdownState(state) {
    ensureStoreLoaded();
    store.lockdownState = state;
    persist();
}
