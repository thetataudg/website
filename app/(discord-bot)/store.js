import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'botStore.json');

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
    },
    forms: {},
    nextFormId: 1,
    onboardingProgress: {},
};

let store = { ...DEFAULTS };

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

const persist = debounce(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}, 200);

export async function initStore() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const text = await fs.readFile(STORE_PATH, 'utf8');
        store = JSON.parse(text);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('store load error:', err);
        store = { ...DEFAULTS };
    }
}

export function rememberEmail({ userId, email, channelId, inviteId, pendingId }) {
    if (!userId || !email) return;
    const normalized = email.trim().toLowerCase();
    const now = Date.now();
    store.emailToUser[normalized] = { userId, channelId, savedAt: now };
    store.userToEmail[userId] = normalized;
    if (inviteId) {
        store.inviteIdToDiscord[String(inviteId)] = { userId, email: normalized, channelId, savedAt: now };
    }
    if (pendingId) {
        store.pendingIdToDiscord[String(pendingId)] = { userId, email: normalized, channelId, savedAt: now };
    }
    persist();
}

export function getByEmail(email) {
    if (!email) return null;
    return store.emailToUser[email.trim().toLowerCase()] || null;
}

export function getByPendingId(pendingId) {
    if (!pendingId) return null;
    return store.pendingIdToDiscord[String(pendingId)] || null;
}

export function linkPendingToInvite(pendingId, inviteId) {
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
    store.botConfig = { ...store.botConfig, ...updates };
    persist();
    return store.botConfig;
}

export function getBotConfig() {
    return store.botConfig;
}

export function setLinksChannel(channelId) {
    store.botConfig.linksChannelId = channelId || '';
    persist();
}

export function getLinksChannelId() {
    return store.botConfig.linksChannelId || '';
}

export function addForm(form) {
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
    if (!store.forms[id]) return null;
    store.forms[id] = { ...store.forms[id], ...updates };
    persist();
    return store.forms[id];
}

export function getForm(id) {
    return store.forms[id] || null;
}

export function getActiveForms() {
    const now = Date.now();
    return Object.values(store.forms).filter((form) => form.active && (!form.deadline || new Date(form.deadline).getTime() >= now));
}

export function addAcknowledgement(formId, ack) {
    const form = getForm(formId);
    if (!form) return;
    if (!form.acknowledged.some((entry) => entry.userId === ack.userId)) {
        form.acknowledged.push(ack);
        persist();
    }
}

export function markReminderSent(formId, userId) {
    const form = getForm(formId);
    if (!form) return;
    form.reminders = form.reminders || {};
    form.reminders[userId] = { lastSent: Date.now(), acknowledged: false };
    persist();
}

export function acknowledgeUser(formId, userId) {
    const form = getForm(formId);
    if (!form) return;
    form.reminders = form.reminders || {};
    form.reminders[userId] = { ...(form.reminders[userId] || {}), acknowledged: true };
    persist();
}

export function removeForm(formId) {
    if (!store.forms[formId]) return false;
    delete store.forms[formId];
    persist();
    return true;
}

export function setCommitteeRoleEntry(normalizedName, roleId) {
    if (!normalizedName) return;
    const map = store.botConfig.committeeRoleMap || {};
    store.botConfig.committeeRoleMap = { ...map, [normalizedName]: roleId };
    persist();
}

export function setMajorRoleEntry(normalizedName, roleId) {
    if (!normalizedName) return;
    const map = store.botConfig.majorRoleMap || {};
    store.botConfig.majorRoleMap = { ...map, [normalizedName]: roleId };
    persist();
}

export function getMajorRoleMap() {
    return { ...(store.botConfig.majorRoleMap || {}) };
}

export function getOnboardingSteps() {
    return [...(store.botConfig.onboardingSteps || [])];
}

export function addOnboardingStep(step) {
    if (!step || !step.channelId || !step.roleId) return null;
    if (!store.botConfig.onboardingSteps) {
        store.botConfig.onboardingSteps = [];
    }
    const entry = {
        ...step,
        id: step.id || String(Date.now()),
    };
    store.botConfig.onboardingSteps = [...store.botConfig.onboardingSteps, entry];
    persist();
    return entry;
}

export function getOnboardingProgress(userId) {
    if (!userId) return null;
    return store.onboardingProgress?.[userId] || null;
}

export function setOnboardingProgress(userId, updates) {
    if (!userId) return null;
    const current = store.onboardingProgress?.[userId] || {};
    const entry = { ...current, ...updates };
    store.onboardingProgress = { ...(store.onboardingProgress || {}), [userId]: entry };
    persist();
    return entry;
}

export function clearOnboardingProgress(userId) {
    if (!userId || !store.onboardingProgress?.[userId]) return;
    const progress = { ...store.onboardingProgress };
    delete progress[userId];
    store.onboardingProgress = progress;
    persist();
}

export function getRoleCache() {
    return { ...(store.botConfig.roleCache || {}) };
}

export function setRoleCache(cache) {
    store.botConfig.roleCache = cache || {};
    persist();
    return store.botConfig.roleCache;
}

export function getVerifiedRoleId() {
    return store.botConfig.verifiedRoleId || '';
}

export function setVerifiedRoleId(roleId) {
    store.botConfig.verifiedRoleId = roleId || '';
    persist();
    return store.botConfig.verifiedRoleId;
}
