// index.mjs
import 'dotenv/config';
import axios from 'axios';
import https from 'node:https';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    ModalBuilder,
    Partials,
    PermissionsBitField,
    REST,
    RoleSelectMenuBuilder,
    Routes,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { Buffer } from 'node:buffer';
import {
    initStore,
    rememberEmail,
    getByEmail,
    getByPendingId,
    linkPendingToInvite,
    findRecentInviteMapping,
    getBotConfig,
    updateBotConfig,
    setCommitteeRoleEntry,
    setMajorRoleEntry,
    getMajorRoleMap,
    setLinksChannel,
    getLinksChannelId,
    addForm,
    updateForm,
    getForm,
    getActiveForms,
    addAcknowledgement,
    markReminderSent,
    acknowledgeUser,
    removeForm,
    getOnboardingSteps,
    addOnboardingStep,
    getOnboardingProgress,
    setOnboardingProgress,
    clearOnboardingProgress,
    getRoleCache,
    setRoleCache,
    getVerifiedRoleId,
    setVerifiedRoleId,
    getLockdownState,
    setLockdownState,
    getCommitteeHeadRoleId,
    setCommitteeHeadRoleId,
    ensureGuildStore,
} from './store.mjs';

// ---------------- ENV ----------------
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_IDS = (process.env.GUILD_IDS || process.env.GUILD_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
const GUILD_ID = GUILD_IDS[0] || '';
const MONITORED_GUILD_IDS = new Set(GUILD_IDS);
const MOD_ROLE_ID = process.env.MOD_ROLE_ID; // who can see verify channels
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || '';
const PENDING_ROLE_ID = process.env.PENDING_ROLE_ID;
const ECOUNCIL_ROLE_ID = process.env.ECOUNCIL_ROLE_ID || '';
const ACTIVE_ROLE_ID = process.env.ACTIVE_ROLE_ID || '';
const ALUMNI_ROLE_ID = process.env.ALUMNI_ROLE_ID || '';
const PNM_ROLE_ID = process.env.PNM_ROLE_ID || '';
const CATEGORY_ID = process.env.CATEGORY_ID || '';
const WELCOME_CARDS_CHANNEL_ID = process.env.WELCOME_CARDS_CHANNEL_ID;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';

const APPROVAL_API_SECRET = process.env.APPROVAL_API_SECRET || '';
const INVITE_API_URL = process.env.INVITE_API_URL || '';
const INVITE_API_SECRET = process.env.INVITE_API_SECRET || '';
const PENDING_CHECK_URL = process.env.PENDING_CHECK_URL || '';
const APPROVAL_API_BASE =
    process.env.APPROVAL_API_BASE || 'https://thetatau-dg.org/api/members/pending';
const MEMBERS_API_URL =
    process.env.MEMBERS_API_URL || 'https://thetatau-dg.org/api/members';
const DISCORD_BOT_SECRET = process.env.DISCORD_BOT_SECRET || 'discord-bot-secret';
const MEMBERS_API_SECRET =
    process.env.MEMBERS_API_SECRET || process.env.APPROVAL_API_SECRET || DISCORD_BOT_SECRET;
const MEMBER_API_SECRET = process.env.MEMBER_API_SECRET || MEMBERS_API_SECRET;
const MEMBER_UPDATE_API_BASE = (
    process.env.MEMBER_UPDATE_API_BASE || MEMBERS_API_URL
).replace(/\/$/, '');
const MEMBER_UPDATE_API_SECRET =
    process.env.MEMBER_UPDATE_API_SECRET || MEMBER_API_SECRET;
const COMMITTEES_API_URL =
    process.env.COMMITTEES_API_URL || 'https://thetatau-dg.org/api/committees/bot';
const COMMITTEES_BOT_SECRET = process.env.COMMITTEES_BOT_SECRET || 'LBuibK.OJbjKMm.61hbJVNN';
const COMMITTEES_API_SECRET =
    process.env.COMMITTEES_API_SECRET || COMMITTEES_BOT_SECRET || MEMBER_API_SECRET;
const FORM_REMINDER_POLL_MS = parseInt(process.env.FORM_REMINDER_POLL_MS || String(5 * 60 * 1000), 10);
const DEFAULT_FORM_REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000;
const ACK_BUTTON_PREFIX = 'form_ack';
const MEMBER_API_SECRET_HEADER = process.env.MEMBER_API_SECRET_HEADER || 'x-api-secret';
const MEMBER_API_SECRET_QUERY_PARAM = process.env.MEMBER_API_SECRET_QUERY_PARAM || 'secret';
const COMMITTEE_API_SECRET_HEADER =
    process.env.COMMITTEE_API_SECRET_HEADER || MEMBER_API_SECRET_HEADER;
const COMMITTEE_API_SECRET_QUERY_PARAM =
    process.env.COMMITTEE_API_SECRET_QUERY_PARAM || MEMBER_API_SECRET_QUERY_PARAM;
const ROLE_SYNC_INTERVAL_MS = parseInt(process.env.ROLE_SYNC_INTERVAL_MS || '600000', 10);
const COMMITTEE_ROLE_PREFIX = process.env.COMMITTEE_ROLE_PREFIX || 'COMMITTEE_';
const MAJOR_ROLE_PREFIX = process.env.MAJOR_ROLE_PREFIX || '';
const PENDING_POLL_MS = parseInt(process.env.PENDING_POLL_MS || '10000', 10);

// New/optional envs
const DEFAULT_VERIFIED_ROLE_ID = process.env.DEFAULT_VERIFIED_ROLE_ID || '';
const DELETE_VERIFY_CHANNEL_AFTER_MS = parseInt(
    process.env.DELETE_VERIFY_CHANNEL_AFTER_MS || '15000',
    10
);
const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID || '';
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID || '';
const INFO_CHANNEL_ID = process.env.INFO_CHANNEL_ID || '';
const GENERAL_CHANNEL_ID = process.env.GENERAL_CHANNEL_ID || '';
const WELCOME_BANNER_URL = process.env.WELCOME_BANNER_URL || '';
const VERIFIED_ROLE_NAME = process.env.VERIFIED_ROLE_NAME || 'Verified Role';

const STEP_IMAGE_1 = process.env.STEP_IMAGE_1 || '';
const STEP_IMAGE_2 = process.env.STEP_IMAGE_2 || '';
const STEP_IMAGE_3 = process.env.STEP_IMAGE_3 || '';
const DISCORD_ID_PATCH_RETRY_DELAY_MS = Math.max(
    1000,
    parseInt(process.env.DISCORD_ID_PATCH_RETRY_DELAY_MS || '30000', 10)
);
const DISCORD_ID_PATCH_MAX_RETRIES = Math.max(
    0,
    parseInt(process.env.DISCORD_ID_PATCH_MAX_RETRIES || '1', 10)
);
const LOCKDOWN_ROLE_NAME = process.env.LOCKDOWN_ROLE_NAME || 'Lockdown';
const LOCKDOWN_CHANNEL_NAME = process.env.LOCKDOWN_CHANNEL_NAME || 'lockdown';
const LOCKDOWN_STATUS_URL = process.env.LOCKDOWN_STATUS_URL || 'https://thetatau-dg.org/lockdown';
const LOCKDOWN_API_URL =
    process.env.LOCKDOWN_API_URL ||
    (LOCKDOWN_STATUS_URL
        ? LOCKDOWN_STATUS_URL.replace(/\/lockdown\/?$/i, '/api/lockdown')
        : 'https://thetatau-dg.org/api/lockdown');
const LOCKDOWN_API_SECRET = process.env.LOCKDOWN_API_SECRET || '';
const COMMITTEE_HEAD_ROLE_ID = process.env.COMMITTEE_HEAD_ROLE_ID || '';
const STATUS_ROLE_IDS = new Set(
    [ACTIVE_ROLE_ID, ALUMNI_ROLE_ID, PNM_ROLE_ID].filter(Boolean)
);
const MAX_COMMITTEE_SELECT_OPTIONS = 25;
const knownMajorRoleIds = new Set();
const knownCommitteeRoleIds = new Set();
const committeeHeadMembers = new Set();
const majorRoleCache = new Map();
const FORM_BUTTON_IDS = {
    PURPOSE: 'form_button_purpose',
    LINK: 'form_button_link',
    DEADLINE: 'form_button_deadline',
    PUBLISH: 'form_button_publish',
    CANCEL: 'form_button_cancel',
};
const FORM_MODAL_IDS = {
    PURPOSE: 'form_modal_purpose',
    LINK: 'form_modal_link',
    DEADLINE: 'form_modal_deadline',
};
const formDrafts = new Map();

async function persistLockdownStateToApi(payload) {
    if (!LOCKDOWN_API_SECRET || !LOCKDOWN_API_URL) return null;
    try {
        const response = await fetch(LOCKDOWN_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-lockdown-secret': LOCKDOWN_API_SECRET,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            console.warn('Lockdown API responded with', response.status, text);
        }
        return response;
    } catch (err) {
        console.error('Lockdown API request failed', err);
    }
    return null;
}

const pendingStateByGuild = new Map();
const pendingSavedSummariesByGuild = new Map();

function getMonitoredGuildIds() {
    const ids = Array.from(MONITORED_GUILD_IDS);
    if (!ids.length && GUILD_ID) {
        ids.push(GUILD_ID);
    }
    return ids;
}

function isMonitoredGuild(guildId) {
    if (!guildId) return false;
    if (!MONITORED_GUILD_IDS.size) return true;
    return MONITORED_GUILD_IDS.has(guildId);
}

async function ensureGuildContext(guildId) {
    if (!guildId) return;
    if (!isMonitoredGuild(guildId)) return;
    await ensureGuildStore(guildId);
}

async function ensureInteractionGuildContext(interaction) {
    const guildId = interaction.guild?.id;
    if (guildId && isMonitoredGuild(guildId)) {
        await ensureGuildStore(guildId);
        return true;
    }
    if (!guildId && GUILD_ID) {
        await ensureGuildStore(GUILD_ID);
        return true;
    }
    return false;
}

const EPHEMERAL_FLAG = 1 << 6;

function getFormDraft(userId) {
    if (!formDrafts.has(userId)) {
        formDrafts.set(userId, {
            userId,
            purpose: '',
            link: '',
            roleIds: [],
            deadline: null,
            deadlineLabel: 'Not set',
            published: false,
            commandInteraction: null,
        });
    }
    return formDrafts.get(userId);
}

function formatDraftField(value) {
    return value ? value : '*Not set yet*';
}

function formatDeadlineForDraft(deadline) {
    if (!deadline) return 'Not set';
    const parsed = new Date(deadline);
    return isNaN(parsed.getTime()) ? 'Invalid date' : parsed.toLocaleString();
}

function buildFormDraftEmbed(draft) {
    return new EmbedBuilder()
        .setColor(draft.published ? 0x22c55e : THEME_GOLD)
        .setTitle(draft.published ? 'Form Reminder Published' : 'Form Reminder Draft')
        .setDescription('Use the buttons below to configure the form reminder. The preview updates automatically.')
        .addFields(
            { name: 'Purpose', value: formatDraftField(draft.purpose), inline: false },
            { name: 'Link', value: formatDraftField(draft.link), inline: false },
            {
                name: 'Roles',
                value: draft.roleIds.length
                    ? draft.roleIds.map((roleId) => `<@&${roleId}>`).join(', ')
                    : '*Not selected*',
                inline: true,
            },
            {
                name: 'Deadline',
                value: formatDeadlineForDraft(draft.deadline),
                inline: true,
            }
        )
        .setFooter({ text: draft.published ? 'Published - reminders have been queued.' : 'Publish once all fields are filled.' });
}

function buildFormDraftComponents(draft) {
    const purposeButton = new ButtonBuilder()
        .setCustomId(FORM_BUTTON_IDS.PURPOSE)
        .setLabel(draft.purpose ? 'Edit Purpose' : 'Set Purpose')
        .setStyle(ButtonStyle.Primary);
    const linkButton = new ButtonBuilder()
        .setCustomId(FORM_BUTTON_IDS.LINK)
        .setLabel(draft.link ? 'Edit Link' : 'Set Link')
        .setStyle(ButtonStyle.Primary);
    const row1 = new ActionRowBuilder().addComponents(purposeButton, linkButton);

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('form_role_select')
        .setPlaceholder(draft.roleIds.length ? 'Change role selection' : 'Select role(s)')
        .setMinValues(1)
        .setMaxValues(5);
    roleSelect.setDisabled(draft.published);
    const row2 = new ActionRowBuilder().addComponents(roleSelect);

    const deadlineButton = new ButtonBuilder()
        .setCustomId(FORM_BUTTON_IDS.DEADLINE)
        .setLabel('Set Deadline')
        .setStyle(ButtonStyle.Primary);
    deadlineButton.setDisabled(draft.published);
    const publishButton = new ButtonBuilder()
        .setCustomId(FORM_BUTTON_IDS.PUBLISH)
        .setLabel(draft.published ? 'Published' : 'Publish')
        .setStyle(ButtonStyle.Success)
        .setDisabled(draft.published);
    const cancelButton = new ButtonBuilder()
        .setCustomId(FORM_BUTTON_IDS.CANCEL)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(draft.published);
    purposeButton.setDisabled(draft.published);
    linkButton.setDisabled(draft.published);
    const row3 = new ActionRowBuilder().addComponents(deadlineButton, publishButton, cancelButton);

    return [row1, row2, row3];
}

async function refreshDraftView(draft) {
    if (!draft?.commandInteraction) return;
    try {
        await draft.commandInteraction.editReply({
            embeds: [buildFormDraftEmbed(draft)],
            components: buildFormDraftComponents(draft),
        });
    } catch (err) {
        console.error('Failed to refresh draft view', err);
    }
}

function parseDeadlineInput(value) {
    if (!value) return null;
    const trimmed = value.trim();
    const relativeMatch = trimmed.match(/^(\d+)([mhd])$/i);
    if (relativeMatch) {
        const num = Number(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        let ms = 0;
        if (unit === 'm') ms = num * 60 * 1000;
        if (unit === 'h') ms = num * 60 * 60 * 1000;
        if (unit === 'd') ms = num * 24 * 60 * 60 * 1000;
        if (ms > 0) {
            return new Date(Date.now() + ms).toISOString();
        }
    }
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
        let [, month, day, year, hour, minute, meridian] = match;
        month = Number(month);
        day = Number(day);
        year = Number(year);
        hour = Number(hour);
        minute = Number(minute);
        if (/PM/i.test(meridian) && hour < 12) hour += 12;
        if (/AM/i.test(meridian) && hour === 12) hour = 0;
        const date = new Date(year, month - 1, day, hour, minute);
        return isNaN(date.getTime()) ? null : date.toISOString();
    }
    return null;
}

function getConfiguredAdminChannelId() {
    return getBotConfig().adminChannelId || ADMIN_CHANNEL_ID;
}

function getConfiguredAdminRoleId() {
    return getBotConfig().adminRoleId || ADMIN_ROLE_ID;
}

function getConfiguredActiveRoleId() {
    return getBotConfig().activeRoleId || ACTIVE_ROLE_ID;
}

function getConfiguredAlumniRoleId() {
    return getBotConfig().alumniRoleId || ALUMNI_ROLE_ID;
}

function getConfiguredCommitteeHeadRoleId() {
    return getBotConfig().committeeHeadRoleId || COMMITTEE_HEAD_ROLE_ID;
}

function getConfiguredLinksChannelId() {
    return getBotConfig().linksChannelId || getLinksChannelId();
}

function getConfiguredCommitteeRole(name) {
    const map = getBotConfig().committeeRoleMap || {};
    return map[normalizeLabel(name)];
}

function hasExemptRole(member) {
    if (!member) return false;
    const exemptions = new Set([
        getConfiguredAdminRoleId(),
        MOD_ROLE_ID,
        ECOUNCIL_ROLE_ID,
        getConfiguredActiveRoleId(),
        getConfiguredAlumniRoleId(),
    ].filter(Boolean));
    return member.roles.cache.some((role) => exemptions.has(role.id));
}

async function ensureMajorRole(guild, label) {
    if (!guild || !label) return '';
    const normalized = normalizeLabel(label);
    if (!normalized) return '';
    if (majorRoleCache.has(normalized)) {
        return majorRoleCache.get(normalized);
    }
    const configured = getMajorRoleMap()[normalized];
    if (configured && guild.roles.cache.has(configured)) {
        majorRoleCache.set(normalized, configured);
        return configured;
    }
    const matched = guild.roles.cache.find((role) => normalizeMajorRoleName(role.name) === normalized);
    if (matched) {
        await setMajorRoleEntry(normalized, matched.id);
        majorRoleCache.set(normalized, matched.id);
        return matched.id;
    }
    try {
        const desiredName = label.trim() || 'Major role';
        const created = await guild.roles
            .create({ name: desiredName, reason: 'Auto-create major role for Discord sync' })
            .catch(() => null);
        if (created) {
            await setMajorRoleEntry(normalized, created.id);
            majorRoleCache.set(normalized, created.id);
            return created.id;
        }
    } catch (err) {
        console.error('Failed to auto-create major role', { label, err });
    }
    return '';
}

async function cleanUpMajorRolesForGuild(guild) {
    if (!guild) return;
    await guild.roles.fetch().catch(() => null);
    const configured = getMajorRoleMap();
    const keepMap = new Map();
    for (const [normalized, roleId] of Object.entries(configured)) {
        const existing = roleId ? guild.roles.cache.get(roleId) : null;
        if (existing) {
            keepMap.set(normalized, existing);
        }
    }
    for (const role of guild.roles.cache.values()) {
        if (!role || role.managed) continue;
        const normalized = normalizeMajorRoleName(role.name);
        if (!normalized) continue;
        const kept = keepMap.get(normalized);
        if (kept) {
            if (kept.id === role.id) continue;
            try {
                await role.delete('Cleanup duplicate major role created by bot').catch(() => null);
            } catch (err) {
                console.error('Failed to delete duplicate major role', { role: role.id, err });
            }
            continue;
        }
        keepMap.set(normalized, role);
        await setMajorRoleEntry(normalized, role.id);
    }
}

if (
    !TOKEN ||
    !GUILD_IDS.length ||
    !MOD_ROLE_ID ||
    !PENDING_ROLE_ID ||
    !WELCOME_CARDS_CHANNEL_ID ||
    !INVITE_API_URL ||
    !APPROVAL_API_SECRET
) {
    console.error('Missing required env vars. Check the header comments.');
    process.exit(1);
}

// -------------- HTTP agent (optional keep-alive) --------------
const httpsAgent = new https.Agent({ keepAlive: true });

// -------------- Client --------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

// -------------- In-memory state --------------
const awaitingPfp = new Map(); // userId -> { apiMember, channelId }
const onboardingSessions = new Map(); // userId -> { apiMember }
let committeeList = [];
let committeeById = new Map();
let committeeMembershipByMemberId = new Map();
const roleSyncInProgress = new Set();

// -------------- Helpers --------------
const THEME_RED = 0x8c1d40; // Theta Tau dark red
const THEME_GOLD = 0xffc627;

function mask(s) {
    if (!s) return '(empty)';
    return s.replace(/.(?=.{4})/g, '•');
}
function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}
function nameFor(member) {
    return member?.user?.username || 'member';
}
function channelNameFor(member) {
    const base = nameFor(member).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
    return `verify-${base}-${(member.user.discriminator || member.user.id).slice(-4)}`;
}
async function ensureCategory(guild) {
    if (!CATEGORY_ID) return null;
    return (
        guild.channels.cache.get(CATEGORY_ID) ||
        (await guild.channels.fetch(CATEGORY_ID).catch(() => null))
    );
}
async function createPrivateChannel(member) {
    const guild = member.guild;
    const category = await ensureCategory(guild);
    const name = channelNameFor(member);

    const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: member.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
            ],
        },
        {
            id: MOD_ROLE_ID,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
            ],
        },
    ];

    return guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites: overwrites,
        reason: 'Verification channel',
    });
}
function getStartedRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`verify:start:${userId}`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('Get Started')
    );
}

// Buttons carry DB id (pending/user id), not rollNo
function approveRejectRow(userId, email) {
    const safeId = String(userId || 'unknown');
    const safeEmail = email && String(email).trim() ? String(email).trim() : 'none';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pending:approve:${safeId}:${safeEmail}`)
            .setStyle(ButtonStyle.Success)
            .setLabel('Approve'),
        new ButtonBuilder()
            .setCustomId(`pending:reject:${safeId}:${safeEmail}`)
            .setStyle(ButtonStyle.Danger)
            .setLabel('Reject')
    );
}
function approveRejectRowDisabled(userId, email) {
    const safeId = String(userId || 'unknown');
    const safeEmail = email && String(email).trim() ? String(email).trim() : 'none';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pending:approve:${safeId}:${safeEmail}`)
            .setStyle(ButtonStyle.Success)
            .setLabel('Approve')
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`pending:reject:${safeId}:${safeEmail}`)
            .setStyle(ButtonStyle.Danger)
            .setLabel('Reject')
            .setDisabled(true)
    );
}

function buildApproveRow(item, pendingId, email) {
    const resolvedEmail = emailFromRow(item) || email;
    return approveRejectRow(pendingId, resolvedEmail);
}

function emailModal(userId) {
    const modal = new ModalBuilder().setCustomId(`verify:email:${userId}`).setTitle('Start Verification');
    const email = new TextInputBuilder()
        .setCustomId('email')
        .setLabel('School/Chapter Email')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('you@example.edu');
    modal.addComponents(new ActionRowBuilder().addComponents(email));
    return modal;
}

function stepsEmbeds() {
    const blocks = [];
    if (STEP_IMAGE_1) {
        blocks.push(
            new EmbedBuilder()
                .setColor(THEME_GOLD)
                .setTitle('Step 1 - Check your email')
                .setDescription('We sent you an invitation to register.')
                .setImage(STEP_IMAGE_1)
        );
    }
    if (STEP_IMAGE_2) {
        blocks.push(
            new EmbedBuilder()
                .setColor(THEME_GOLD)
                .setTitle('Step 2 - Complete registration')
                .setDescription('Fill out your basic details on the site.')
                .setImage(STEP_IMAGE_2)
        );
    }
    if (STEP_IMAGE_3) {
        blocks.push(
            new EmbedBuilder()
                .setColor(THEME_GOLD)
                .setTitle('Step 3 - Wait for admin approval')
                .setDescription('Once approved, come back here to upload your profile picture.')
                .setImage(STEP_IMAGE_3)
        );
    }
    return blocks;
}

function buildInviteAdminEmbed(email, payload, ok, member) {
    const fields = [];
    if (payload?.id || payload?._id)
        fields.push({ name: 'ID', value: String(payload.id || payload._id), inline: false });
    if (payload?.emailAddress || email)
        fields.push({ name: 'Email', value: String(payload?.emailAddress || email), inline: true });
    if (payload?.status) fields.push({ name: 'Status', value: String(payload.status), inline: true });
    if (payload?.createdAt)
        fields.push({
            name: 'Created',
            value: new Date(Number(payload.createdAt) || Date.parse(payload.createdAt)).toLocaleString(),
            inline: true,
        });
    if (payload?.updatedAt)
        fields.push({
            name: 'Updated',
            value: new Date(Number(payload.updatedAt) || Date.parse(payload.updatedAt)).toLocaleString(),
            inline: true,
        });

    return new EmbedBuilder()
        .setColor(ok ? 0x22c55e : 0xe11d48)
        .setTitle(ok ? '🎟️ Invitation Created' : '⚠️ Invitation Failed')
        .setDescription(member ? `User: <@${member.id}>` : undefined)
        .addFields(fields)
        .setTimestamp();
}

function formatPendingItem(it) {
    if (typeof it === 'string') return it;
    const name = [it.fName, it.lName].filter(Boolean).join(' ') || '-';
    const roll = it.rollNo ?? it.rollNumber ?? '-';
    const year = it.gradYear ?? '-';
    const status = it.status ?? 'pending';
    const email = it.email || it.emailAddress || (it.user && it.user.email) || '-';
    const majors = Array.isArray(it.majors) ? it.majors.join(', ') : it.major || '-';
    const family = it.familyLine || '-';
    const submitted = it.submittedAt || it.createdAt || it.updatedAt;
    const submittedStr = submitted ? new Date(submitted).toLocaleString() : '-';
    const id = it._id || it.id || '-';
    return [
        `**Name:** ${name}`,
        `**Roll #:** ${roll} | **Year:** ${year}`,
        `**Status:** ${status}`,
        `**Email:** ${email}`,
        `**Majors:** ${majors}`,
        `**Family:** ${family}`,
        `Submitted: ${submittedStr}`,
        `ID: \`${id}\``,
    ].join('\n');
}

function emailFromRow(it) {
    if (!it) return null;
    if (typeof it === 'string') return it;
    return (
        it.email ||
        it.emailAddress ||
        (it.user && it.user.email) ||
        (it.pendingEmail && String(it.pendingEmail).trim()) ||
        null
    );
}

function buildPendingEmbed(item) {
    const embed = new EmbedBuilder()
        .setColor(THEME_GOLD)
        .setTitle('Pending Invitation')
        .setDescription(formatPendingItem(item))
        .setTimestamp();
    if (item?.footnote) {
        embed.setFooter({ text: item.footnote });
    }
    return embed;
}

function generateApproveRowId(pendingId) {
    return `pending-row:${pendingId || 'unknown'}`;
}

async function handlePendingRemoved(guildId, pendingId, options = {}) {
    if (!guildId || !pendingId) return;
    await ensureGuildStore(guildId);
    const link = getByPendingId(pendingId);
    if (!link?.userId) return;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(link.userId).catch(() => null);
    if (!member) return;
    let apiMember = options.apiMember || null;
    if (!apiMember) {
        apiMember = await fetchMemberByDiscordId(link.userId);
    }
    await patchPendingRecord(pendingId, {
        discordId: link.userId,
        inviteId: link.inviteId,
    }).catch(() => null);
    if (started && link.channelId) {
        const tempChan = await guild.channels.fetch(link.channelId).catch(() => null);
        if (tempChan) {
            tempChan
                .send({
                    content: `<@${link.userId}> Congrats! Your verification passed—please upload your profile picture in this channel.`,
                })
                .catch(() => { });
        }
    }
}

// Friendlier welcome embed
function buildWelcomeEmbedFromApi(member, api) {
    const fullName =
        [api.fName, api.lName].filter(Boolean).join(' ') ||
        member.user.globalName ||
        member.user.username;

    const majorsStr = Array.isArray(api.majors) ? api.majors.join(', ') : api.major || '-';

    const e = new EmbedBuilder()
        .setColor(THEME_RED)
        .setAuthor({
            name: `Welcome to ${member.guild.name}!`,
            iconURL: member.guild.iconURL({ size: 256 }) ?? undefined,
        })
        .setTitle(`✨ Welcome, ${fullName}!`)
        .setDescription(
            [
                `Hey <@${member.id}> - we're excited to have you in **${member.guild.name}**!`,
            ]
                .filter(Boolean)
                .join('\n')
        )
        .addFields(
            {
                name: 'Quick Facts',
                value: [`**Status:** ${String(api.status || '-')}`, `**Grad Year:** ${String(api.gradYear || '-')}`, `**Major(s):** ${majorsStr}`].join('\n'),
                inline: true,
            },
            {
                name: 'Chapter',
                value: [`**Roll #:** ${String(api.rollNo || '-')}`, `**Family Line:** ${String(api.familyLine || '-')}`, `**ECouncil:** ${api.isECouncil ? 'Yes' : 'No'}`].join('\n'),
                inline: true,
            },
            {
                name: 'Links',
                value: [`**GitHub:** ${api.socialLinks?.github || '-'}`, `**LinkedIn:** ${api.socialLinks?.linkedin || '-'}`, `**Hometown:** ${String(api.hometown || '-')}`].join('\n'),
                inline: false,
            }
        )
        .setFooter({
            text: `Created: ${api.createdAt ? new Date(api.createdAt).toLocaleString() : '-'}  •  ⚙️ ΘT`,
        })
        .setTimestamp();

    if (WELCOME_BANNER_URL) e.setImage(WELCOME_BANNER_URL);
    return e;
}

function formatCommitteeListLines(lines, maxEntries = 25) {
    if (!lines.length) return '*None yet*';
    const slice = lines.slice(0, maxEntries);
    let text = slice.join('\n');
    if (lines.length > maxEntries) {
        text += `\n+${lines.length - maxEntries} more`;
    }
    return text;
}

function buildCommitteeProgressEmbed(committees) {
    const embed = new EmbedBuilder().setColor(THEME_GOLD).setTitle('Committee role mappings');
    if (!committees?.length) {
        embed.setDescription('No committees were returned. Run this command after committees sync from the site.');
        embed.setFooter({ text: 'Committee data is refreshed each time you interact.' });
        return embed;
    }
    const configured = getBotConfig().committeeRoleMap || {};
    const assigned = [];
    const unassigned = [];
    for (const committee of committees) {
        const label = committee?.name || committee?.committeeName || 'Unnamed committee';
        const normalized = normalizeLabel(label || committee?._id || committee?.id || '');
        const roleId = configured[normalized];
        if (roleId) {
            assigned.push(`• ${label} → <@&${roleId}>`);
        } else {
            unassigned.push(`• ${label}`);
        }
    }
    embed.addFields(
        { name: 'Assigned', value: formatCommitteeListLines(assigned), inline: true },
        { name: 'Unassigned', value: formatCommitteeListLines(unassigned), inline: true }
    );
    embed.setFooter({ text: 'Select a committee from the dropdown below to map its role.' });
    return embed;
}

function buildCommitteeSelectRow(committees, userId) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`committee:select:${userId}`)
        .setPlaceholder('Select a committee to map its role')
        .setMinValues(1)
        .setMaxValues(1);
    const normalizedCommittees =
        Array.isArray(committees) && committees.length ? committees.slice(0, MAX_COMMITTEE_SELECT_OPTIONS) : [];
    const options = normalizedCommittees
        .map((committee) => {
            const rawLabel = committee?.name || committee?.committeeName || 'Unnamed committee';
            const label = rawLabel.length > 100 ? `${rawLabel.slice(0, 97)}...` : rawLabel;
            const normalized = normalizeLabel(rawLabel || committee?._id || committee?.id || '');
            const identifier = String(committee?._id || committee?.id || '').trim();
            const valueParts = [normalized, identifier].filter(Boolean).join('|');
            const descriptionRaw = committee?.description || committee?.summary || '';
            const description = descriptionRaw.length > 100 ? `${descriptionRaw.slice(0, 97)}...` : descriptionRaw;
            const value = valueParts || normalized || identifier || label;
            return {
                label,
                value,
                description: description || undefined,
            };
        })
        .filter(Boolean);
    if (!options.length) {
        menu.setDisabled(true).setPlaceholder('No committees detected');
    } else {
        menu.addOptions(...options);
        if (committees.length > MAX_COMMITTEE_SELECT_OPTIONS) {
            menu.setPlaceholder('Showing first 25 committees (Discord limit).');
        }
    }
    const row = new ActionRowBuilder().addComponents(menu);
    return row;
}

function buildCommitteeRoleSelectionRows(userId, normalized, committeeName, currentRoleId) {
    const placeholder = currentRoleId
        ? `Replacing <@&${currentRoleId}>`
        : `Which role represents ${committeeName}?`;
    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId(`committee:role:${userId}:${normalized}`)
        .setPlaceholder(placeholder)
        .setMinValues(1)
        .setMaxValues(1);
    const row1 = new ActionRowBuilder().addComponents(roleSelect);
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`committee:cancel:${userId}`)
            .setLabel('Return to overview')
            .setStyle(ButtonStyle.Secondary)
    );
    return [row1, row2];
}

function findCommitteeByNormalized(committees, normalized, committeeId) {
    if (!Array.isArray(committees)) return null;
    for (const committee of committees) {
        const label = committee?.name || committee?.committeeName || 'Unnamed committee';
        const normalizedLabel = normalizeLabel(label || committee?._id || committee?.id || '');
        if (normalized && normalizedLabel === normalized) return committee;
        if (committeeId && String(committee._id || committee.id) === String(committeeId)) return committee;
    }
    return null;
}

async function buildCommitteeSelectionPayload(userId) {
    const committees = await getCommittees();
    const embed = buildCommitteeProgressEmbed(committees);
    const components = [buildCommitteeSelectRow(committees, userId)];
    const note =
        committees.length > MAX_COMMITTEE_SELECT_OPTIONS
            ? 'Showing up to 25 committees (Discord dropdown limit).'
            : undefined;
    return { embed, components, note, committees };
}

function buildOnboardingSummaryEmbed(steps) {
    const embed = new EmbedBuilder().setColor(THEME_GOLD).setTitle('Onboarding steps');
    if (!steps || !steps.length) {
        embed.setDescription('No onboarding channels configured yet. Use the button below to add one.');
        embed.setFooter({ text: 'Each entry creates a gated role and guides new members.' });
        return embed;
    }
    embed.setDescription('Configured onboarding channels and descriptions.');
    const maxFields = 10;
    steps.slice(0, maxFields).forEach((step, idx) => {
        const title = `Step ${idx + 1}: ${step.name || `Channel ${idx + 1}`}`;
        const parts = [
            step.channelId ? `Channel: <#${step.channelId}>` : 'Channel: Not configured',
            step.description ? `Description: ${step.description}` : 'Description: *Not provided*',
            step.roleId ? `Role: <@&${step.roleId}>` : 'Role: *Not created*',
        ];
        embed.addFields({ name: title, value: parts.join('\n') });
    });
    if (steps.length > maxFields) {
        embed.addFields({
            name: 'More steps',
            value: `+${steps.length - maxFields} additional step${steps.length - maxFields === 1 ? '' : 's'}`,
        });
    }
    embed.setFooter({
        text: 'Save each addition before moving on. Steps gate a channel until the user clicks "I finished this step".',
    });
    return embed;
}

function buildOnboardingCommandRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('onboarding:add-step')
            .setLabel('Add onboarding channel')
            .setStyle(ButtonStyle.Primary)
    );
}

function parseChannelIdInput(raw) {
    if (!raw) return '';
    const match = raw.match(/(\d{17,19})/);
    if (match) return match[1];
    return raw.trim();
}

async function ensureChannelPermissionsForOnboarding(guild, channel, roleId) {
    if (!guild || !channel || !roleId) return;
    try {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => { });
        await channel.permissionOverwrites.edit(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        }).catch(() => { });
        if (MOD_ROLE_ID) {
            await channel.permissionOverwrites.edit(MOD_ROLE_ID, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            }).catch(() => { });
        }
    } catch (err) {
        console.error('Failed to update onboarding channel permissions', err);
    }
}

async function sendOnboardingStepPrompt(member, step, stepIndex, totalSteps) {
    if (!member || !step) return;
    const embed = new EmbedBuilder()
        .setColor(THEME_GOLD)
        .setTitle(`Onboarding step ${stepIndex + 1} of ${totalSteps}`)
        .setDescription(
            step.description ||
                'Join the channel below, read the guidance, and click the button once you are ready for the next step.'
        )
        .addFields({
            name: 'Channel',
            value: step.channelId ? `<#${step.channelId}>` : '*Channel not available*',
            inline: false,
        })
        .setFooter({ text: step.name ? `Step: ${step.name}` : 'Follow the instructions to proceed.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`onboarding:step:${member.id}:${stepIndex}`)
            .setLabel(stepIndex === totalSteps - 1 ? 'Complete onboarding' : 'I finished this step')
            .setStyle(ButtonStyle.Success)
    );

    const sendOptions = {
        content: `<@${member.id}> Only you can interact with this onboarding guide. Complete the instructions below once you've read through the channel.`,
        embeds: [embed],
        components: [row],
        allowedMentions: { users: [member.id] },
    };
    const channel = step.channelId ? await member.guild.channels.fetch(step.channelId).catch(() => null) : null;
    if (channel?.isTextBased?.()) {
        try {
            await channel.send(sendOptions);
            return;
        } catch (err) {
            console.error('Onboarding channel notification failed', err);
        }
    }
    try {
        await member.send({
            content: `You now have access to ${step.channelId ? `<#${step.channelId}>` : 'the next onboarding channel'}.`,
            embeds: [embed],
            components: [row],
        });
    } catch (err) {
        console.error('Failed to DM onboarding step instructions', err);
        const fallback = await member.guild.channels.fetch(WELCOME_CARDS_CHANNEL_ID).catch(() => null);
        if (fallback) {
            await fallback
                .send(
                    `Hey <@${member.id}>, I tried to DM you the onboarding instructions but couldn't reach you. Please enable DMs so you can continue completing onboarding.`
                )
                .catch(() => { });
        }
    }
}

async function removeOnboardingRoles(member) {
    if (!member) return;
    const steps = getOnboardingSteps();
    const roleIds = steps.map((step) => step?.roleId).filter(Boolean);
    await Promise.all(roleIds.map((roleId) => member.roles.remove(roleId).catch(() => { })));
}

async function assignOnboardingStepRole(member, stepIndex) {
    if (!member) return false;
    const steps = getOnboardingSteps();
    const step = steps[stepIndex];
    if (!step?.roleId) return false;
    await removeOnboardingRoles(member);
    await member.roles.add(step.roleId).catch(() => { });
    return true;
}

async function startOnboardingForMember(member, apiMember) {
    const steps = getOnboardingSteps();
    if (!member || !steps.length) return false;
    try {
        onboardingSessions.set(member.id, { apiMember });
        await setOnboardingProgress(member.id, {
            currentStep: 0,
            startedAt: new Date().toISOString(),
            completed: false,
        });
        await assignOnboardingStepRole(member, 0);
        await sendOnboardingStepPrompt(member, steps[0], 0, steps.length);
        return true;
    } catch (err) {
        console.error('Failed to start onboarding flow', err);
        clearOnboardingProgress(member.id);
        onboardingSessions.delete(member.id);
        await removeOnboardingRoles(member);
        return false;
    }
}

async function finalizeOnboardingForMember(member, interaction) {
    if (!member) return;
    await removeOnboardingRoles(member);
    clearOnboardingProgress(member.id);
    const session = onboardingSessions.get(member.id);
    let apiMember = session?.apiMember;
    if (!apiMember) {
        const members = await getMembers();
        const lookups = buildMemberLookups(members);
        apiMember = findMemberForGuildMember(member, lookups);
    }
    const roleResult = await applyMemberRoles(member, apiMember);
    onboardingSessions.delete(member.id);
    await assignVerifiedRole(member);
    try {
        await member
            .send({
                content: 'Onboarding complete! You now have access to the rest of the server.',
            })
            .catch(() => { });
    } catch { }
    if (interaction?.isRepliable()) {
        await interaction
            .editReply({
                content: `Onboarding complete.${roleResult?.statusOrDefaultApplied ? ' Roles synced from the site.' : ''}`,
            })
            .catch(() => { });
    }
}
function statusRoleIdFrom(api) {
    const s = String(api.status || '').toLowerCase();
    const activeRole = getConfiguredActiveRoleId();
    const alumniRole = getConfiguredAlumniRoleId();
    if (/alum/.test(s)) return alumniRole;
    if (/active/.test(s)) return activeRole;
    if (/(pnm|interest|prospect|new|pledge)/.test(s)) return PNM_ROLE_ID;
    return '';
}
function normalizeLabel(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\W]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase();
}

function getMemberLookupKey(member) {
    if (!member) return '';
    const maybeId = String(member._id || member.id || member.rollNo || '').trim();
    if (maybeId) return maybeId;
    if (member.clerkId) return String(member.clerkId).trim();
    return '';
}

function normalizeMajorRoleName(value) {
    if (!value) return '';
    const trimmed = String(value).trim();
    return normalizeLabel(trimmed.replace(/^major\s*-\s*/i, '').trim());
}
function normalizeNameCandidate(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\W]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
function buildSecretHeaders(secret, headerName = MEMBER_API_SECRET_HEADER) {
    if (!secret || !headerName) return {};
    return { [headerName]: secret };
}
function applySecretToUrl(url, secret, queryParam = MEMBER_API_SECRET_QUERY_PARAM) {
    if (!secret || !queryParam) return;
    url.searchParams.set(queryParam, secret);
}
function toStringLabel(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value).trim();
    if (value && typeof value === 'object') {
        return (
            String(value.name || value.label || value.title || value.committeeName || value._id || value.id || '')
                .trim()
        );
    }
    return '';
}
function roleIdFromLabel(label, prefix, knownSet) {
    const base = normalizeLabel(label);
    if (!base) return '';
    const candidates = new Set();
    if (prefix) candidates.add(`${prefix}${base}_ROLE_ID`);
    candidates.add(`${base}_ROLE_ID`);
    if (prefix) candidates.add(`${prefix}${base}`);
    candidates.add(base);
    for (const key of candidates) {
        const value = process.env[key];
        if (value) {
            if (knownSet) knownSet.add(value);
            return value;
        }
    }
    return '';
}
function nameVariantsFromMember(member) {
    const variants = new Set();
    const add = (value) => {
        const normalized = normalizeNameCandidate(value);
        if (normalized) variants.add(normalized);
    };
    if (!member) return variants;
    add([member.fName, member.lName].filter(Boolean).join(' '));
    add([member.lName, member.fName].filter(Boolean).join(' '));
    add(member.nickname);
    add(member.displayName);
    add(member.preferredName);
    add(member.rollNo);
    add(member.email);
    return variants;
}
function buildMemberLookups(members) {
    const lookups = {
        name: new Map(),
        discord: new Map(),
        roll: new Map(),
    };
    for (const member of members || []) {
        if (!member) continue;
        const discordKey = String(member.discordId || '').trim();
        if (discordKey) {
            lookups.discord.set(discordKey, member);
        }
        if (member.rollNo) {
            const normalizedRoll = normalizeNameCandidate(member.rollNo);
            if (normalizedRoll) {
                lookups.roll.set(normalizedRoll, member);
            }
        }
        for (const variant of nameVariantsFromMember(member)) {
            if (!lookups.name.has(variant)) {
                lookups.name.set(variant, member);
            }
        }
    }
    return lookups;
}
function findMemberForGuildMember(guildMember, lookups) {
    if (!guildMember || !lookups) return null;
    if (lookups.discord.has(guildMember.id)) {
        return lookups.discord.get(guildMember.id);
    }
    const candidates = [
        guildMember.nickname,
        guildMember.displayName,
        guildMember.user?.username,
        guildMember.user?.tag,
    ];
    for (const candidate of candidates) {
        const normalized = normalizeNameCandidate(candidate);
        if (!normalized) continue;
        const byName = lookups.name.get(normalized);
        if (byName) return byName;
        const byRoll = lookups.roll.get(normalized);
        if (byRoll) return byRoll;
    }
    return null;
}

function buildPendingLookups(items) {
    const lookups = {
        byId: new Map(),
        byRoll: new Map(),
        byEmail: new Map(),
        byClerk: new Map(),
    };
    for (const item of items || []) {
        if (!item) continue;
        const id = String(item._id || item.id || '').trim();
        if (id) lookups.byId.set(id, item);
        const roll = normalizeNameCandidate(item.rollNo || item.roll || item.rollnumber);
        if (roll) lookups.byRoll.set(roll, item);
        const email = normalizeNameCandidate(emailFromRow(item) || '');
        if (email) lookups.byEmail.set(email, item);
        const clerk = normalizeNameCandidate(item.clerkId);
        if (clerk) lookups.byClerk.set(clerk, item);
    }
    return lookups;
}

function findPendingForApiMember(apiMember, lookups) {
    if (!apiMember || !lookups) return null;
    const tryLookup = (map, value) => {
        if (!map || !value) return null;
        return map.get(value) || null;
    };
    const id = String(apiMember._id || apiMember.id || '').trim();
    if (id) {
        const found = tryLookup(lookups.byId, id);
        if (found) return found;
    }
    const roll = normalizeNameCandidate(apiMember.rollNo);
    if (roll) {
        const found = tryLookup(lookups.byRoll, roll);
        if (found) return found;
    }
    const email = normalizeNameCandidate(apiMember.email);
    if (email) {
        const found = tryLookup(lookups.byEmail, email);
        if (found) return found;
    }
    const clerk = normalizeNameCandidate(apiMember.clerkId);
    if (clerk) {
        const found = tryLookup(lookups.byClerk, clerk);
        if (found) return found;
    }
    return null;
}

async function patchPendingDiscordIdForMember(apiMember, discordId, pendingLookups) {
    if (!apiMember || !discordId || !pendingLookups) return;
    const pending = findPendingForApiMember(apiMember, pendingLookups);
    if (!pending) return;
    const pendingId = String(pending._id || pending.id || '').trim();
    if (!pendingId) return;
    const existing = String(pending.discordId || '').trim();
    if (existing === discordId) return;
    const success = await patchPendingRecord(pendingId, { discordId });
    if (success) {
        pending.discordId = discordId;
    }
}
function getCommitteeNamesFromMember(member) {
    const names = new Set();
    const pushName = (value) => {
        const label = toStringLabel(value);
        if (label) names.add(label);
    };
    const addEntry = (entry) => {
        if (!entry) return;
        if (typeof entry === 'string') {
            if (committeeById.has(entry)) {
                const match = committeeById.get(entry);
                if (match?.name) {
                    names.add(match.name);
                    return;
                }
            }
            names.add(entry);
            return;
        }
        if (typeof entry === 'object') {
            if (entry.name) {
                names.add(entry.name);
                return;
            }
            if (entry.committeeName) {
                names.add(entry.committeeName);
                return;
            }
            if (entry._id) {
                const match = committeeById.get(String(entry._id));
                if (match?.name) {
                    names.add(match.name);
                } else {
                    names.add(String(entry._id));
                }
                return;
            }
            const label = toStringLabel(entry);
            if (label) {
                names.add(label);
            }
        }
    };
    if (Array.isArray(member?.committees)) {
        member.committees.forEach(addEntry);
    }
    const memberId = String(member?._id || member?.id || '').trim();
    const memberRoll = String(member?.rollNo || '').trim();
    if (memberId) {
        const mapped = committeeMembershipByMemberId.get(memberId);
        if (mapped) {
            mapped.forEach((name) => names.add(name));
        }
    }
    if (memberRoll && !names.size) {
        const mappedFromRolNo = committeeMembershipByMemberId.get(memberRoll);
        if (mappedFromRolNo) {
            mappedFromRolNo.forEach((name) => names.add(name));
        }
    }
    return Array.from(names);
}
async function collectMajorRoleIds(member, guild) {
    const ids = new Set();
    const addMajor = async (value) => {
        const label = toStringLabel(value);
        if (!label) return;
        let roleId = getConfiguredCommitteeRole(label); // maybe rare, but prefer explicit mapping
        if (!roleId) {
            roleId = roleIdFromLabel(label, MAJOR_ROLE_PREFIX, knownMajorRoleIds);
        }
        if (!roleId) {
            roleId = guild ? await ensureMajorRole(guild, label) : '';
        }
        if (roleId) {
            ids.add(roleId);
            knownMajorRoleIds.add(roleId);
        }
    };
    const majors = Array.isArray(member?.majors) ? member.majors : [];
    for (const major of majors) {
        await addMajor(major);
    }
    if (member?.major) await addMajor(member.major);
    return ids;
}
function collectCommitteeRoleIds(member) {
    const ids = new Set();
    const committeeNames = getCommitteeNamesFromMember(member);
    committeeNames.forEach((name) => {
        const configRoleId = getConfiguredCommitteeRole(name);
        if (configRoleId) {
            ids.add(configRoleId);
            knownCommitteeRoleIds.add(configRoleId);
            return;
        }
        const roleId = roleIdFromLabel(name, COMMITTEE_ROLE_PREFIX, knownCommitteeRoleIds);
        if (roleId) {
            ids.add(roleId);
            knownCommitteeRoleIds.add(roleId);
        }
    });
    return ids;
}

function getAllCommitteeRoleIds() {
    const map = getBotConfig().committeeRoleMap || {};
    const ids = new Set(Object.values(map || {}).filter(Boolean));
    knownCommitteeRoleIds.forEach((roleId) => ids.add(roleId));
    return ids;
}
async function syncRoleSet(member, targetRoleIds, knownSet, options = {}) {
    const allowRemovals = options.allowRemovals !== false;
    if (!member) {
        return {
            added: 0,
            removed: 0,
            skippedUneditableAdds: 0,
            skippedUneditableRemoves: 0,
            skippedMissingRoles: 0,
        };
    }
    const guildRoles = member.guild?.roles?.cache;
    const canManageRole = (roleId) => {
        const role = guildRoles?.get(roleId);
        if (!role) return { ok: false, missing: true };
        return { ok: Boolean(role.editable), missing: false };
    };
    const toRemove = [];
    let skippedUneditableAdds = 0;
    let skippedUneditableRemoves = 0;
    let skippedMissingRoles = 0;
    if (allowRemovals) {
        for (const roleId of member.roles.cache.keys()) {
            if (knownSet.has(roleId) && !targetRoleIds.has(roleId)) {
                const permission = canManageRole(roleId);
                if (permission.missing) {
                    skippedMissingRoles += 1;
                    continue;
                }
                if (!permission.ok) {
                    skippedUneditableRemoves += 1;
                    continue;
                }
                toRemove.push(roleId);
            }
        }
    }
    if (toRemove.length) {
        await member.roles.remove(toRemove).catch((err) => {
            console.error('Failed to remove roles during sync', {
                userId: member.id,
                roleIds: toRemove,
                err,
            });
        });
    }
    const toAdd = [];
    for (const roleId of targetRoleIds) {
        if (roleId && !member.roles.cache.has(roleId)) {
            const permission = canManageRole(roleId);
            if (permission.missing) {
                skippedMissingRoles += 1;
                continue;
            }
            if (!permission.ok) {
                skippedUneditableAdds += 1;
                continue;
            }
            toAdd.push(roleId);
        }
    }
    if (toAdd.length) {
        await member.roles.add(toAdd).catch((err) => {
            console.error('Failed to add roles during sync', {
                userId: member.id,
                roleIds: toAdd,
                err,
            });
        });
    }
    return {
        added: toAdd.length,
        removed: toRemove.length,
        skippedUneditableAdds,
        skippedUneditableRemoves,
        skippedMissingRoles,
    };
}
async function ensureStatusRoles(member, apiMember) {
    const targetStatusRoleId = statusRoleIdFrom(apiMember);
    const toRemove = [];
    for (const roleId of STATUS_ROLE_IDS) {
        if (roleId && roleId !== targetStatusRoleId && member.roles.cache.has(roleId)) {
            toRemove.push(roleId);
        }
    }
    if (targetStatusRoleId && DEFAULT_VERIFIED_ROLE_ID && member.roles.cache.has(DEFAULT_VERIFIED_ROLE_ID)) {
        toRemove.push(DEFAULT_VERIFIED_ROLE_ID);
    }
    if (toRemove.length) {
        await member.roles.remove(toRemove).catch(() => { });
    }
    let addedStatusRole = false;
    let addedDefaultRole = false;
    if (targetStatusRoleId) {
        if (!member.roles.cache.has(targetStatusRoleId)) {
            await member.roles.add(targetStatusRoleId)
                .then(() => {
                    addedStatusRole = true;
                })
                .catch(() => { });
        }
    } else if (DEFAULT_VERIFIED_ROLE_ID && !member.roles.cache.has(DEFAULT_VERIFIED_ROLE_ID)) {
        await member.roles.add(DEFAULT_VERIFIED_ROLE_ID)
            .then(() => {
                addedDefaultRole = true;
            })
            .catch(() => { });
    }
    return { addedStatusRole, addedDefaultRole };
}
async function ensureEcouncilRole(member, apiMember) {
    if (!ECOUNCIL_ROLE_ID) return;
    const hasRole = member.roles.cache.has(ECOUNCIL_ROLE_ID);
    const shouldHave = Boolean(apiMember?.isECouncil);
    if (shouldHave && !hasRole) {
        await member.roles.add(ECOUNCIL_ROLE_ID).catch(() => { });
    }
    if (!shouldHave && hasRole) {
        await member.roles.remove(ECOUNCIL_ROLE_ID).catch(() => { });
    }
}
async function updateGuildNickname(member, apiMember) {
    if (!member || !apiMember) return;
    const fullName = [apiMember.fName, apiMember.lName].filter(Boolean).join(' ').trim();
    if (!fullName) return;
    if (member.nickname === fullName) return;
    await member.setNickname(fullName, 'Syncing Discord nickname with member profile').catch(() => { });
}

async function cacheGuildRoles(guild) {
    if (!guild) return {};
    const cache = {};
    for (const role of guild.roles.cache.values()) {
        if (!role?.name) continue;
        cache[role.name] = role.id;
        const normalized = normalizeNameCandidate(role.name);
        if (normalized) cache[normalized] = role.id;
    }
    setRoleCache(cache);
    return cache;
}

async function ensureVerifiedRole(guild) {
    if (!guild) return null;
    const configuredRoleId = getVerifiedRoleId() || DEFAULT_VERIFIED_ROLE_ID;
    const fetchRole = async (id) => (id ? await guild.roles.fetch(id).catch(() => null) : null);
    let role = await fetchRole(configuredRoleId);
    if (role) {
        setVerifiedRoleId(role.id);
        return role;
    }
    const cached = getRoleCache();
    const normalizedName = normalizeNameCandidate(VERIFIED_ROLE_NAME);
    const cachedRoleId =
        cached[VERIFIED_ROLE_NAME] || (normalizedName ? cached[normalizedName] : undefined);
    if (cachedRoleId) {
        role = await fetchRole(cachedRoleId);
        if (role) {
            setVerifiedRoleId(role.id);
            return role;
        }
    }
    role =
        guild.roles.cache.find((candidate) => candidate.name === VERIFIED_ROLE_NAME) ||
        guild.roles.cache.find(
            (candidate) => normalizeNameCandidate(candidate.name) === normalizedName && normalizedName
        );
    if (!role) {
        role = await guild.roles
            .create({ name: VERIFIED_ROLE_NAME, mentionable: false, reason: 'Onboarding verified role' })
            .catch(() => null);
    }
    if (role) {
        setVerifiedRoleId(role.id);
        const updatedCache = { ...getRoleCache(), [role.name]: role.id };
        const normalizedRoleName = normalizeNameCandidate(role.name);
        if (normalizedRoleName) {
            updatedCache[normalizedRoleName] = role.id;
        }
        setRoleCache(updatedCache);
    }
    return role;
}

async function ensureLockdownRole(guild) {
    if (!guild) return null;
    const normalized = normalizeNameCandidate(LOCKDOWN_ROLE_NAME);
    const existing =
        guild.roles.cache.find((r) => r.name === LOCKDOWN_ROLE_NAME) ||
        (normalized ? guild.roles.cache.find((r) => normalizeNameCandidate(r.name) === normalized) : null);
    if (existing) {
        return existing;
    }
    try {
        const created = await guild.roles.create({
            name: LOCKDOWN_ROLE_NAME,
            mentionable: false,
            reason: 'Lockdown mode role',
            permissions: [PermissionsBitField.Flags.ViewChannel],
        });
        return created;
    } catch (err) {
        console.error('Failed to create lockdown role', err);
        return null;
    }
}

async function ensureLockdownChannel(guild, lockdownRole) {
    if (!guild || !lockdownRole) return null;
    let channel = guild.channels.cache.find(
        (c) => c.name === LOCKDOWN_CHANNEL_NAME && c.type === ChannelType.GuildText
    );
    if (!channel) {
        try {
            channel = await guild.channels.create({
                name: LOCKDOWN_CHANNEL_NAME,
                type: ChannelType.GuildText,
                topic: 'Temporary lockdown announcement channel',
                reason: 'Lockdown mode channel',
            });
        } catch (err) {
            console.error('Failed to create lockdown channel', err);
            return null;
        }
    }
    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
            id: lockdownRole.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
        },
    ];
    const adminRoleId = getConfiguredAdminRoleId();
    if (adminRoleId) {
        overwrites.push({
            id: adminRoleId,
            allow: [PermissionsBitField.Flags.ViewChannel],
        });
    }
    if (MOD_ROLE_ID) {
        overwrites.push({
            id: MOD_ROLE_ID,
            allow: [PermissionsBitField.Flags.ViewChannel],
        });
    }
    await channel.permissionOverwrites.set(overwrites, LOCKDOWN_ROLE_NAME).catch(() => null);
    return channel;
}

async function assignVerifiedRole(member) {
    if (!member) return;
    const guild = member.guild;
    if (!guild) return;
    const role = await ensureVerifiedRole(guild);
    if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role.id).catch(() => { });
    }
}
function scheduleDiscordIdPatchRetry(apiMember, discordUserId, attempt) {
    if (DISCORD_ID_PATCH_MAX_RETRIES <= 0 || attempt >= DISCORD_ID_PATCH_MAX_RETRIES) return;
    setTimeout(
        () => patchMemberDiscordId(apiMember, discordUserId, attempt + 1),
        DISCORD_ID_PATCH_RETRY_DELAY_MS
    );
}
async function patchMemberDiscordId(apiMember, discordUserId, attempt = 0) {
    if (!apiMember || !discordUserId) return;
    const existing = String(apiMember.discordId || '').trim();
    if (existing === discordUserId) return;
    const identifier =
        (apiMember.rollNo && String(apiMember.rollNo).trim()) ||
        apiMember._id ||
        apiMember.id ||
        '';
    if (!identifier) return;
    try {
        const base = MEMBER_UPDATE_API_BASE || MEMBERS_API_URL;
        const url = new URL(`${base.replace(/\/$/, '')}/${encodeURIComponent(identifier)}`);
        applySecretToUrl(url, MEMBER_UPDATE_API_SECRET);
        const res = await fetch(url.toString(), {
            method: 'PATCH',
            agent: httpsAgent,
            headers: {
                'Content-Type': 'application/json',
                ...buildSecretHeaders(MEMBER_UPDATE_API_SECRET),
            },
            body: JSON.stringify({ discordId: discordUserId }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error('Failed to persist discordId', { identifier, status: res.status, body });
            scheduleDiscordIdPatchRetry(apiMember, discordUserId, attempt);
            return;
        }
        apiMember.discordId = discordUserId;
    } catch (err) {
        console.error('Failed to persist discordId', err);
        scheduleDiscordIdPatchRetry(apiMember, discordUserId, attempt);
    }
}
async function applyMemberRoles(member, apiMember, options = {}) {
    if (!member || !apiMember) {
        return { statusOrDefaultApplied: false, committeeSync: null };
    }
    try {
        const statusResult = await ensureStatusRoles(member, apiMember);
        const majorSet = await collectMajorRoleIds(apiMember, member.guild);
        await syncRoleSet(member, majorSet, knownMajorRoleIds);
        const committeeSet = collectCommitteeRoleIds(apiMember);
        const committeeAllowRemovals = Boolean(options.committeeAllowRemovals);
        const committeeSync = await syncRoleSet(member, committeeSet, knownCommitteeRoleIds, {
            allowRemovals: committeeAllowRemovals,
        });
        await ensureEcouncilRole(member, apiMember);
        await updateGuildNickname(member, apiMember);
        await patchMemberDiscordId(apiMember, member.id);
        const headRoleId = getCommitteeHeadRoleId() || COMMITTEE_HEAD_ROLE_ID;
        const memberKey = getMemberLookupKey(apiMember);
        if (headRoleId) {
            const hasHeadRole = member.roles.cache.has(headRoleId);
            const isHead = memberKey && committeeHeadMembers.has(memberKey);
            if (isHead && !hasHeadRole) {
                await member.roles.add(headRoleId).catch(() => null);
            }
            if (!isHead && hasHeadRole) {
                await member.roles.remove(headRoleId).catch(() => null);
            }
        }
        return {
            statusOrDefaultApplied: statusResult.addedStatusRole || statusResult.addedDefaultRole,
            committeeSync,
        };
    } catch (err) {
        console.error('Role synchronization failed', { userId: member.id, err });
        return { statusOrDefaultApplied: false, committeeSync: null };
    }
}
function buildPendingCheckUrl() {
    try {
        if (PENDING_CHECK_URL) {
            const u = new URL(PENDING_CHECK_URL);
            if (INVITE_API_SECRET) u.searchParams.set('secret', INVITE_API_SECRET);
            return u.toString();
        }
        const u = new URL(INVITE_API_URL);
        u.pathname = '/api/members/pending';
        u.search = '';
        if (INVITE_API_SECRET) u.searchParams.set('secret', INVITE_API_SECRET);
        return u.toString();
    } catch {
        return '';
    }
}
async function postStepsGuide(tempChannel) {
    const embeds = stepsEmbeds();
    if (!embeds.length) return;
    for (const e of embeds) {
        await tempChannel.send({ embeds: [e] }).catch(() => { });
    }
}

// ---------------- API calls ----------------
async function postInvitation(email) {
    const res = await fetch(INVITE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, secret: INVITE_API_SECRET }),
    });
    let payload = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }
    return { ok: res.ok, payload };
}

// NOTE: uses userId (DB id) path, not roll number
async function patchApproval(userId, action) {
    const base = (process.env.APPROVAL_API_BASE ||
        'https://thetatau-dg.org/api/members/pending'
    ).replace(/\/$/, '');
    const url = `${base}/${encodeURIComponent(String(userId))}/`;

    const secret = String(process.env.APPROVAL_API_SECRET || '').trim();
    const body = { action: action === 'approve' ? 'approve' : 'reject', secret };

    console.log('--- PATCH /pending/:userID ---');
    console.log('URL :', url);
    console.log('HEAD:', { 'Content-Type': 'application/json' });
    console.log('BODY:', JSON.stringify({ ...body, secret: mask(secret) }));

    const res = await axios.patch(url, body, {
        httpsAgent,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true, // capture 4xx/5xx bodies
        timeout: 10000,
    });

    console.log('STATUS:', res.status);
    console.log('RESP  :', res.data);
    return { ok: res.status >= 200 && res.status < 300, payload: res.data };
}

async function patchPendingRecord(pendingId, updates) {
    if (!pendingId || !updates) return false;
    const base = (process.env.APPROVAL_API_BASE || 'https://thetatau-dg.org/api/members/pending').replace(/\/$/, '');
    const url = `${base}/${encodeURIComponent(String(pendingId))}/`;
    const secret = String(process.env.APPROVAL_API_SECRET || '').trim();
    const body = { action: 'update', updates, secret };
    try {
        const res = await axios.patch(url, body, {
            httpsAgent,
            headers: { 'Content-Type': 'application/json' },
            validateStatus: () => true,
            timeout: 10000,
        });
        return res.status >= 200 && res.status < 300;
    } catch (err) {
        console.error('Failed to patch pending record:', { pendingId, err });
        return false;
    }
}
async function safePatchApproval(userId, action) {
    try {
        return await patchApproval(userId, action);
    } catch (e) {
        if (String(e?.code) === 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH') {
            await new Promise((r) => setTimeout(r, 200));
            return await patchApproval(userId, action);
        }
        throw e;
    }
}
async function getPending() {
    const base =
        PENDING_CHECK_URL && PENDING_CHECK_URL.trim()
            ? PENDING_CHECK_URL.trim()
            : (() => {
                const u = new URL(INVITE_API_URL);
                u.pathname = '/api/members/pending';
                u.search = '';
                return u.toString();
            })();

    const url = new URL(base);
    if (INVITE_API_SECRET) url.searchParams.set('secret', INVITE_API_SECRET);

    const res = await fetch(url.toString(), { method: 'GET' });
    let data = null;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.list)) return data.list;
    return [];
}
async function getMembers() {
    try {
        const url = new URL(MEMBERS_API_URL);
        applySecretToUrl(url, MEMBERS_API_SECRET);
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: buildSecretHeaders(MEMBERS_API_SECRET),
            agent: httpsAgent,
        });
        const data = await res.json().catch(() => null);
        if (!data) return [];
        return Array.isArray(data) ? data : data?.data || data?.list || [];
    } catch (err) {
        console.error('Failed to fetch members list:', err);
        return [];
    }
}

async function fetchMemberByDiscordId(discordId) {
    if (!discordId) return null;
    try {
        const url = new URL(MEMBERS_API_URL);
        url.searchParams.set('discordId', String(discordId));
        applySecretToUrl(url, MEMBERS_API_SECRET);
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: buildSecretHeaders(MEMBERS_API_SECRET),
            agent: httpsAgent,
        });
        const data = await res.json().catch(() => null);
        if (!data) return null;
        if (Array.isArray(data) && data.length) return data[0];
        if (Array.isArray(data?.data) && data.data.length) return data.data[0];
        if (Array.isArray(data?.list) && data.list.length) return data.list[0];
        if (typeof data === 'object') return data;
        return null;
    } catch (err) {
        console.error('Failed to fetch member by Discord ID:', err);
        return null;
    }
}
function addCommitteeMembership(id, name) {
    if (!id || !name) return;
    const key = String(id).trim();
    if (!key) return;
    const existing = committeeMembershipByMemberId.get(key);
    if (existing) {
        existing.add(name);
        return;
    }
    committeeMembershipByMemberId.set(key, new Set([name]));
}

function registerCommitteeMember(member, name) {
    if (!member) return;
    if (typeof member === 'string' || typeof member === 'number') {
        addCommitteeMembership(member, name);
        return;
    }
    if (member._id || member.id) {
        addCommitteeMembership(member._id || member.id, name);
    }
    if (member.rollNo) {
        addCommitteeMembership(member.rollNo, name);
    }
}

function getCommitteeMemberIdValue(value) {
    if (!value) return '';
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value).trim();
    }
    if (typeof value === 'object') {
        return String(value._id || value.id || value.rollNo || '').trim();
    }
    return '';
}

function buildMemberIndexByApiId(members) {
    const index = new Map();
    for (const member of members || []) {
        if (!member) continue;
        const keys = [member._id, member.id, member.rollNo]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
        for (const key of keys) {
            if (!index.has(key)) {
                index.set(key, member);
            }
        }
    }
    return index;
}

async function getCommittees() {
    try {
        const url = new URL(COMMITTEES_API_URL);
        applySecretToUrl(url, COMMITTEES_API_SECRET, COMMITTEE_API_SECRET_QUERY_PARAM);
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: buildSecretHeaders(COMMITTEES_API_SECRET, COMMITTEE_API_SECRET_HEADER),
            agent: httpsAgent,
        });
        const data = await res.json().catch(() => null);
        const list = Array.isArray(data) ? data : data?.data || [];
        if (Array.isArray(list)) {
            committeeList = list;
            committeeById = new Map();
            committeeMembershipByMemberId = new Map();
            committeeHeadMembers.clear();
            for (const committee of committeeList) {
                const key = String((committee?._id || committee?.id || '')).trim();
                if (key) {
                    committeeById.set(key, committee);
                }
                const name = committee?.name;
                if (!name) continue;
                registerCommitteeMember(committee?.committeeHeadId, name);
                if (committee?.committeeHeadId) {
                    committeeHeadMembers.add(String(committee.committeeHeadId));
                }
                if (Array.isArray(committee?.committeeMembers)) {
                    committee.committeeMembers.forEach((member) => registerCommitteeMember(member, name));
                }
            }
        }
        return committeeList;
    } catch (err) {
        console.error('Failed to fetch committees:', err);
        return committeeList;
    }
}
async function syncMemberRolesForGuild(guildId, options = {}) {
    const waitForCurrent = Boolean(options.waitForCurrent);
    const waitTimeoutMs = Number.isFinite(options.waitTimeoutMs)
        ? options.waitTimeoutMs
        : 120000;
    const stats = {
        success: false,
        skipped: false,
        skipReason: '',
        guildId,
        processedMembers: 0,
        matchedMembers: 0,
        committeeAdds: 0,
        committeeRemoves: 0,
        committeeSkippedUneditableAdds: 0,
        committeeSkippedUneditableRemoves: 0,
        committeeMissingRoleRefs: 0,
        durationSec: 0,
    };
    if (!guildId) return stats;
    if (roleSyncInProgress.has(guildId)) {
        if (!waitForCurrent) {
            stats.skipped = true;
            stats.skipReason = 'in_progress';
            return stats;
        }
        const waitStart = Date.now();
        while (roleSyncInProgress.has(guildId) && Date.now() - waitStart < waitTimeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (roleSyncInProgress.has(guildId)) {
            stats.skipped = true;
            stats.skipReason = 'timeout_waiting_for_current_sync';
            return stats;
        }
    }
    roleSyncInProgress.add(guildId);
    try {
        await ensureGuildStore(guildId);
        const startTime = Date.now();
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return stats;
        await guild.members.fetch().catch(() => null);
        await getCommittees();
        const members = await getMembers();
        const lookups = buildMemberLookups(members);
        for (const guildMember of guild.members.cache.values()) {
            if (!guildMember || guildMember.user?.bot) continue;
            stats.processedMembers += 1;
            const apiMember = findMemberForGuildMember(guildMember, lookups);
            if (!apiMember) continue;
            stats.matchedMembers += 1;
            const roleResult = await applyMemberRoles(guildMember, apiMember, {
                committeeAllowRemovals: Boolean(options.committeeAllowRemovals),
            });
            const committeeSync = roleResult?.committeeSync;
            if (!committeeSync) continue;
            stats.committeeAdds += committeeSync.added || 0;
            stats.committeeRemoves += committeeSync.removed || 0;
            stats.committeeSkippedUneditableAdds += committeeSync.skippedUneditableAdds || 0;
            stats.committeeSkippedUneditableRemoves += committeeSync.skippedUneditableRemoves || 0;
            stats.committeeMissingRoleRefs += committeeSync.skippedMissingRoles || 0;
        }
        stats.durationSec = Math.round((Date.now() - startTime) / 1000);
        stats.success = true;
        return stats;
    } catch (err) {
        console.error(`Member role sync failed for guild ${guildId}:`, err);
        stats.error = err?.message || String(err);
        return stats;
    } finally {
        roleSyncInProgress.delete(guildId);
    }
}

async function runRoleSyncForAll() {
    const guildIds = getMonitoredGuildIds();
    for (const guildId of guildIds) {
        await syncMemberRolesForGuild(guildId);
    }
}

function scheduleRoleSync() {
    runRoleSyncForAll().catch(() => { });
    if (Number.isFinite(ROLE_SYNC_INTERVAL_MS) && ROLE_SYNC_INTERVAL_MS > 0) {
        setInterval(() => runRoleSyncForAll().catch(() => { }), ROLE_SYNC_INTERVAL_MS);
    } else {
        console.warn('Skipping scheduled role sync because ROLE_SYNC_INTERVAL_MS is not a valid positive number.');
    }
}

async function buildLinksEmbed(form) {
    const embed = new EmbedBuilder()
        .setColor(THEME_GOLD)
        .setTitle('Form Reminder')
        .setDescription(form.purpose)
        .addFields(
            { name: 'Link', value: form.link, inline: false },
            {
                name: 'Deadline',
                value: form.deadline ? `${formatDeadlineText(form.deadline)}${isFormExpired(form) ? ' (passed)' : ''}` : 'None',
                inline: true,
            },
            {
                name: 'Roles',
                value: form.roleIds && form.roleIds.length
                    ? form.roleIds.map((roleId) => `<@&${roleId}>`).join(', ')
                    : 'Unknown role',
                inline: true,
            }
        )
        .setFooter({
            text: isFormExpired(form)
                ? 'Deadline passed, reminders have stopped.'
                : 'Reminders automatically DM the role every 4 hours until acknowledged.',
        })
        .setTimestamp(form.createdAt ? new Date(form.createdAt) : new Date());
    if (form.acknowledged?.length) {
        embed.addFields({
            name: 'Acknowledged by',
            value: form.acknowledged.map((ack) => `<@${ack.userId}>`).join(', '),
            inline: false,
        });
    } else {
        embed.addFields({
            name: 'Acknowledged by',
            value: 'No acknowledgements yet.',
            inline: false,
        });
    }
    return embed;
}

async function sendFormReminderDm(member, form) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${ACK_BUTTON_PREFIX}:${form._id}`)
            .setStyle(ButtonStyle.Success)
            .setLabel("I've done it")
    );
    const embed = new EmbedBuilder()
        .setColor(THEME_RED)
        .setTitle('Form Reminder')
        .setDescription(
            [
                `**Purpose:** ${form.purpose}`,
                `**Link:** ${form.link}`,
                `**Deadline:** ${form.deadline ? new Date(form.deadline).toLocaleString() : 'N/A'}`,
                '',
                'This reminder can be stopped by acknowledging you filled it out. False presses are logged.',
            ].join('\n')
        )
        .setFooter({ text: 'We can see who presses the button.' })
        .setTimestamp();
    try {
        await member.send({ embeds: [embed], components: [row] });
    } catch (err) {
        console.error('Failed to send DM reminder', member.id, err);
    }
}

function parseDeadline(choice, custom) {
    const now = Date.now();
    const map = {
        '10m': 10 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '3d': 3 * 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
    };
    if (choice && choice !== 'custom') {
        const ms = map[choice];
        if (!ms) return null;
        return new Date(now + ms);
    }
    if (!custom) return null;
    const match = custom.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;
    let [, month, day, year, hour, minute, meridian] = match;
    month = Number(month);
    day = Number(day);
    year = Number(year);
    hour = Number(hour);
    minute = Number(minute);
    if (/PM/i.test(meridian) && hour < 12) hour += 12;
    if (/AM/i.test(meridian) && hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, minute);
}

function formatDeadlineText(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
}

function isFormExpired(form) {
    if (!form?.deadline) return false;
    const deadline = new Date(form.deadline);
    if (isNaN(deadline.getTime())) return false;
    return Date.now() >= deadline.getTime();
}

async function updateLinksEmbed(form, guild) {
    if (!form?.channelId || !form.messageId || !guild) return;
    const channel = await guild.channels.fetch(form.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    const message = await channel.messages.fetch(form.messageId).catch(() => null);
    if (!message) return;
    const embed = await buildLinksEmbed(form);
    await message.edit({ embeds: [embed] }).catch(() => null);
}

async function notifyRoleMembersForForm(form, guild, force = false) {
    if (!guild) return;
    if (!Array.isArray(form.roleIds) || !form.roleIds.length) return;
    await guild.members.fetch().catch(() => null);
    const now = Date.now();
    const reminders = form.reminders || {};
    const sentMembers = new Set();
    for (const roleId of form.roleIds) {
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (!role) continue;
        for (const member of role.members.values()) {
            if (member.user.bot) continue;
            if (sentMembers.has(member.id)) continue;
            const record = reminders[member.id] || {};
            if (record.acknowledged) continue;
            if (force || !record.lastSent || now - new Date(record.lastSent).getTime() >= (form.remindIntervalMs || DEFAULT_FORM_REMINDER_INTERVAL_MS)) {
                await sendFormReminderDm(member, form);
                await markReminderSent(form._id, member.id);
            }
            sentMembers.add(member.id);
        }
    }
}

async function runFormRemindersForGuild(guildId) {
    try {
        if (!guildId) return;
        await ensureGuildStore(guildId);
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;
        const forms = await getActiveForms();
        for (const form of forms) {
            if (isFormExpired(form)) {
                if (form.active) {
                    await updateForm(form.id, { active: false });
                    form.active = false;
                    await updateLinksEmbed(form, guild);
                }
                continue;
            }
            await notifyRoleMembersForForm(form, guild);
        }
    } catch (err) {
        console.error(`Form reminder runner failed for guild ${guildId}:`, err);
    }
}

async function runFormRemindersForAll() {
    const guildIds = getMonitoredGuildIds();
    for (const guildId of guildIds) {
        await runFormRemindersForGuild(guildId);
    }
}

function scheduleFormReminders() {
    runFormRemindersForAll().catch(() => { });
    if (Number.isFinite(FORM_REMINDER_POLL_MS) && FORM_REMINDER_POLL_MS > 0) {
        setInterval(() => runFormRemindersForAll().catch(() => { }), FORM_REMINDER_POLL_MS);
    } else {
        console.warn('Skipping form reminder scheduler because FORM_REMINDER_POLL_MS is not valid.');
    }
}

const COMMAND_DEFINITIONS = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure admin channel/roles and prep committee syncing')
        .addChannelOption((opt) =>
            opt.setName('admin_channel').setDescription('Channel for admin notifications').setRequired(false)
        )
        .addChannelOption((opt) =>
            opt.setName('links_channel').setDescription('Channel for links/reminder embeds').setRequired(false)
        )
        .addRoleOption((opt) =>
            opt.setName('admin_role').setDescription('Role that may approve pending members').setRequired(false)
        )
        .addRoleOption((opt) =>
            opt.setName('active_role').setDescription('Role given to active members').setRequired(false)
        )
        .addRoleOption((opt) =>
            opt.setName('alumni_role').setDescription('Role given to alumni members').setRequired(false)
        ),
    new SlashCommandBuilder().setName('set-committee-role').setDescription('Interactively map committees to roles'),
    new SlashCommandBuilder().setName('forms').setDescription('Launch the interactive form reminder builder'),
    new SlashCommandBuilder().setName('onboarding').setDescription('Configure the gated onboarding flow'),
    new SlashCommandBuilder().setName('member-commands').setDescription('See which commands members can run'),
    new SlashCommandBuilder().setName('admin-commands').setDescription('See which commands admins can run'),
    new SlashCommandBuilder()
        .setName('sync-discord-ids')
        .setDescription('Persist Discord IDs for members that currently lack them on the website'),
    new SlashCommandBuilder()
        .setName('sync-roles')
        .setDescription('Run a strict member role sync and remove role assignments that no longer apply'),
    new SlashCommandBuilder().setName('resync-committees').setDescription('Clear committee roles and re-sync the site list'),
    new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Engage or lift a temporary lockdown for the server')
        .addStringOption((opt) =>
            opt
                .setName('action')
                .setDescription('Engage lockdown to strip roles or release it to restore')
                .setRequired(true)
                .addChoices(
                    { name: 'Engage lockdown', value: 'engage' },
                    { name: 'Release lockdown', value: 'release' }
                )
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Describe why the lockdown is happening')
                .setRequired(false)
        )
        .addNumberOption((opt) =>
            opt
                .setName('duration')
                .setDescription('Estimated duration in minutes')
                .setRequired(false)
                .setMinValue(1)
        ),
];

const MEMBER_COMMANDS = [
    { name: '/forms', description: 'Launch the interactive setup for form reminders.' },
    { name: '/member-commands', description: 'Show this list of member-facing commands.' },
];
const ADMIN_COMMANDS = [
    { name: '/setup', description: 'Configure admin channels, roles, and committee syncing.' },
    { name: '/set-committee-role', description: 'Match a committee from ThetaTau to a Discord role.' },
    { name: '/onboarding', description: 'Manage the gated onboarding steps for new members.' },
    { name: '/sync-discord-ids', description: 'Find Discord IDs for members that do not yet have one stored.' },
    { name: '/sync-roles', description: 'Run a strict role sync and remove extra committee/status role assignments.' },
    { name: '/resync-committees', description: 'Clear committee roles and reassign them from the site data.' },
    { name: '/lockdown', description: 'Strip roles from non-admins, give them a Lockdown role, and isolate them.' },
    { name: '/admin-commands', description: 'Show this list of admin-only commands.' },
];

function buildCommandListEmbed(title, commands) {
    const embed = new EmbedBuilder().setColor(THEME_GOLD).setTitle(title);
    if (!Array.isArray(commands) || !commands.length) {
        embed.setDescription('No commands available.');
        return embed;
    }
    embed.setDescription('Available slash commands and their purpose.');
    for (const cmd of commands) {
        if (!cmd?.name) continue;
        embed.addFields({
            name: cmd.name,
            value: cmd.description || '*No description provided.*',
        });
    }
    return embed;
}

async function registerSlashCommands() {
    if (!CLIENT_ID || !TOKEN || !GUILD_IDS.length) {
        console.warn('Skipping slash command registration – missing CLIENT_ID/TOKEN/GUILD_IDS.');
        return;
    }
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const body = COMMAND_DEFINITIONS.map((cmd) => cmd.toJSON());
    for (const guildId of GUILD_IDS) {
        try {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body });
            console.log(`Slash commands registered for guild ${guildId}.`);
        } catch (err) {
            console.error(`Failed to register slash commands for ${guildId}:`, err);
        }
    }
}

async function handleSetupCommand(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This command must be used inside the server.', ephemeral: true });
    }
    const member = await guild.members.fetch(interaction.user.id);
    const adminRoleId = getConfiguredAdminRoleId();
    const hasAdminRole = adminRoleId && member.roles.cache.has(adminRoleId);
    const hasPerm =
        hasAdminRole || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!hasPerm) {
        return interaction.reply({ content: 'You lack permission to configure the bot.', ephemeral: true });
    }

    const updates = {};
    const adminChannel = interaction.options.getChannel('admin_channel');
    if (adminChannel) updates.adminChannelId = adminChannel.id;
    const linksChannel = interaction.options.getChannel('links_channel');
    if (linksChannel) updates.linksChannelId = linksChannel.id;
    const adminRole = interaction.options.getRole('admin_role');
    if (adminRole) updates.adminRoleId = adminRole.id;
    const activeRole = interaction.options.getRole('active_role');
    if (activeRole) updates.activeRoleId = activeRole.id;
    const alumniRole = interaction.options.getRole('alumni_role');
    if (alumniRole) updates.alumniRoleId = alumniRole.id;

    if (Object.keys(updates).length) {
        await updateBotConfig(updates);
    }

    await getCommittees();
    await cacheGuildRoles(guild);
    await ensureVerifiedRole(guild);
    const committeeNames = committeeList
        .map((c) => c.name)
        .filter(Boolean)
        .slice(0, 20);
    const committeesMessage =
        committeeNames.length > 0
            ? committeeNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n')
            : 'No committees found yet.';

    return interaction.reply({
        content: [
            'Configuration saved.',
        'Use `/set-committee-role` with the committee name and role that should be granted to that committee.',
        linksChannel
            ? `Links channel is set to <#${linksChannel.id}>.`
            : 'Configure a links channel via `/setup` to send form embeds.',
            `Committees found (${committeeList.length}):\n${committeesMessage}`,
        ].join('\n'),
        ephemeral: true,
    });
}

async function handleSetCommitteeRoleCommand(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This command must be run inside the server.', ephemeral: true });
    }
    const member = await guild.members.fetch(interaction.user.id);
    const adminRoleId = getConfiguredAdminRoleId();
    const hasAdminRole = adminRoleId && member.roles.cache.has(adminRoleId);
    const hasPerm = hasAdminRole || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!hasPerm) {
        return interaction.reply({ content: 'You lack permission to configure committee roles.', ephemeral: true });
    }
    const payload = await buildCommitteeSelectionPayload(interaction.user.id);
    await interaction.reply({
        content: payload.note,
        embeds: [payload.embed],
        components: payload.components,
        ephemeral: true,
    });
}

async function handleCommitteeSelectMenu(interaction) {
    const parts = interaction.customId.split(':');
    const userId = parts[2];
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: 'This selection is only for the initiating user.', ephemeral: true });
    }
    const value = interaction.values?.[0];
    if (!value) {
        return interaction.reply({ content: 'No committee selected.', ephemeral: true });
    }
    const [normalized, committeeId] = value.split('|');
    const payload = await buildCommitteeSelectionPayload(userId);
    const committee = findCommitteeByNormalized(payload.committees, normalized, committeeId);
    const displayName = committee?.name || committee?.committeeName || committeeId || normalized || 'Committee';
    const currentRoleId = getBotConfig().committeeRoleMap?.[normalized] || '';
    const embed = new EmbedBuilder()
        .setColor(THEME_GOLD)
        .setTitle(`Assign role for ${displayName}`)
        .setDescription('Select the Discord role that corresponds to this committee.')
        .addFields({
            name: 'Currently assigned',
            value: currentRoleId ? `<@&${currentRoleId}>` : '*None yet*',
            inline: false,
        });
    const rows = buildCommitteeRoleSelectionRows(userId, normalized, displayName, currentRoleId);
    await interaction.update({ content: undefined, embeds: [embed], components: rows });
}

async function handleCommitteeRoleSelect(interaction) {
    const parts = interaction.customId.split(':');
    const userId = parts[2];
    const normalized = parts[3];
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: 'This selection is only for the initiating user.', ephemeral: true });
    }
    const roleId = interaction.values?.[0];
    if (!roleId) {
        return interaction.reply({ content: 'Please choose a role.', ephemeral: true });
    }
    await setCommitteeRoleEntry(normalized, roleId);
    const payload = await buildCommitteeSelectionPayload(userId);
    const committee = findCommitteeByNormalized(payload.committees, normalized);
    const name = committee?.name || committee?.committeeName || normalized || 'Committee';
    await interaction.update({
        content: `Mapped ${name} to <@&${roleId}>.`,
        embeds: [payload.embed],
        components: payload.components,
    });
}

async function handleCommitteeCancelButton(interaction) {
    const parts = interaction.customId.split(':');
    const userId = parts[2];
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: 'This button is only for the initiating user.', ephemeral: true });
    }
    const payload = await buildCommitteeSelectionPayload(userId);
    await interaction.update({
        content: payload.note,
        embeds: [payload.embed],
        components: payload.components,
    });
}

async function handleFormsCommand(interaction) {
    if (!interaction.guild && !interaction.member) {
        return interaction.reply({ content: 'This command must be used inside the server.', ephemeral: true });
    }

    const linksChannelId = getConfiguredLinksChannelId();
    if (!linksChannelId) {
        return interaction.reply({
            content: 'No links channel configured. Run `/setup` and set the links channel first.',
            ephemeral: true,
        });
    }

    const draft = getFormDraft(interaction.user.id);
    draft.published = false;
    await interaction.reply({
        embeds: [buildFormDraftEmbed(draft)],
        components: buildFormDraftComponents(draft),
        ephemeral: true,
    });
    const sent = await interaction.fetchReply();
    draft.commandInteraction = interaction;
}

async function handleMemberCommandsCommand(interaction) {
    const embed = buildCommandListEmbed('Member command list', MEMBER_COMMANDS);
    await interaction.reply({ embeds: [embed] });
}

async function handleAdminCommandsCommand(interaction) {
    const embed = buildCommandListEmbed('Admin command list', ADMIN_COMMANDS);
    await interaction.reply({ embeds: [embed] });
}

function buildOnboardingAddModal() {
    const modal = new ModalBuilder().setCustomId('onboarding:add-step-modal').setTitle('Add onboarding channel');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('step_name')
                .setLabel('Step name (optional)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('step_channel')
                .setLabel('Channel mention or ID')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('step_description')
                .setLabel('Description shown to new members')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
        )
    );
    return modal;
}

async function handleOnboardingCommand(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This command must be run inside the server.', ephemeral: true });
    }
    const member = await guild.members.fetch(interaction.user.id);
    const adminRoleId = getConfiguredAdminRoleId();
    const hasAdminRole = adminRoleId && member.roles.cache.has(adminRoleId);
    const hasPerm = hasAdminRole || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!hasPerm) {
        return interaction.reply({ content: 'You lack permission to configure onboarding.', ephemeral: true });
    }
    const steps = getOnboardingSteps();
    await interaction.reply({
        embeds: [buildOnboardingSummaryEmbed(steps)],
        components: [buildOnboardingCommandRow()],
        ephemeral: true,
    });
}

async function handleOnboardingAddModal(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This modal must be submitted inside the server.', ephemeral: true });
    }
    const rawChannel = interaction.fields.getTextInputValue('step_channel');
    const channelId = parseChannelIdInput(rawChannel);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
        return interaction.reply({ content: 'Unable to resolve that channel. Please try again.', ephemeral: true });
    }
    const description = interaction.fields.getTextInputValue('step_description').trim();
    const nameInput = interaction.fields.getTextInputValue('step_name').trim();
    const existingSteps = getOnboardingSteps();
    if (existingSteps.some((step) => step.channelId === channel.id)) {
        return interaction.reply({ content: 'That channel is already used in onboarding.', ephemeral: true });
    }
    const roleName = `Onboarding Step ${existingSteps.length + 1}${nameInput ? ` - ${nameInput}` : ''}`;
    const role = await guild.roles
        .create({ name: roleName, mentionable: false, reason: 'Onboarding gate role' })
        .catch((err) => {
            console.error('Failed to create onboarding role', err);
            return null;
        });
    if (!role) {
        return interaction.reply({ content: 'Failed to create the gating role. Check permissions.', ephemeral: true });
    }
    await ensureChannelPermissionsForOnboarding(guild, channel, role.id);
    const entry = {
        id: String(Date.now()),
        name: nameInput || channel.name || `Step ${existingSteps.length + 1}`,
        channelId: channel.id,
        description: description || '',
        roleId: role.id,
        createdAt: new Date().toISOString(),
    };
    addOnboardingStep(entry);
    await cacheGuildRoles(guild);
    await interaction.reply({
        content: `Added onboarding step for <#${channel.id}> using role <@&${role.id}>.`,
        ephemeral: true,
    });
}

async function handleOnboardingStepButton(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG });
    const parts = interaction.customId.split(':');
    const userId = parts[2];
    const stepIndex = Number(parts[3]);
    if (!userId || userId !== interaction.user.id || Number.isNaN(stepIndex)) {
        return interaction.editReply({ content: 'This button is not meant for you.' });
    }
    const progress = getOnboardingProgress(userId);
    if (!progress) {
        return interaction.editReply({
            content: 'No onboarding progress found. The flow may have already completed.',
        });
    }
    if (progress.currentStep !== stepIndex) {
        return interaction.editReply({
            content: `You are currently on step ${progress.currentStep + 1}. Please use the latest message to continue.`,
        });
    }
    const steps = getOnboardingSteps();
    if (!steps.length || stepIndex >= steps.length) {
        return interaction.editReply({ content: 'This onboarding step is no longer available.' });
    }
    const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID));
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    if (!member) {
        return interaction.editReply({ content: 'Unable to find you in the server to continue onboarding.' });
    }
    const isLastStep = stepIndex + 1 >= steps.length;
    if (isLastStep) {
        await finalizeOnboardingForMember(member, interaction);
        return;
    }
    const nextIndex = stepIndex + 1;
    await setOnboardingProgress(userId, { currentStep: nextIndex });
    await assignOnboardingStepRole(member, nextIndex);
    await sendOnboardingStepPrompt(member, steps[nextIndex], nextIndex, steps.length);
    await interaction.editReply({
        content: `Great! Step ${nextIndex + 1} is unlocked. Visit <#${steps[nextIndex].channelId}> and click the button again when you are ready.`,
    });
}

async function handleFormButtonInteraction(interaction) {
    const draft = formDrafts.get(interaction.user.id);
    if (!draft) {
        return interaction.reply({ content: 'No active form draft found. Run /forms to start one.', ephemeral: true });
    }
    switch (interaction.customId) {
        case FORM_BUTTON_IDS.PURPOSE: {
            const modal = new ModalBuilder()
                .setCustomId(FORM_MODAL_IDS.PURPOSE)
                .setTitle('Set Form Purpose')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('purpose')
                            .setLabel('What is the purpose of this form?')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(1000)
                    )
                );
            await interaction.showModal(modal);
            break;
        }
        case FORM_BUTTON_IDS.LINK: {
            const modal = new ModalBuilder()
                .setCustomId(FORM_MODAL_IDS.LINK)
                .setTitle('Set Form Link')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('link')
                            .setLabel('Form URL')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('https://')
                            .setRequired(true)
                    )
                );
            await interaction.showModal(modal);
            break;
        }
        case FORM_BUTTON_IDS.DEADLINE: {
            const modal = new ModalBuilder()
                .setCustomId(FORM_MODAL_IDS.DEADLINE)
                .setTitle('Set Deadline')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('deadline')
                            .setLabel('Deadline (10m / 1h / MM/DD/YYYY HH:MM AM)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('e.g. 1h or 12/31/2025 05:30 PM')
                            .setRequired(true)
                    )
                );
            await interaction.showModal(modal);
            break;
        }
        case FORM_BUTTON_IDS.PUBLISH: {
            await interaction.deferUpdate();
            await publishFormDraft(draft, interaction);
            break;
        }
        case FORM_BUTTON_IDS.CANCEL: {
            await interaction.deferUpdate();
            if (draft.commandInteraction) {
                await draft.commandInteraction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xe11d48)
                            .setTitle('Form Draft Canceled')
                            .setDescription('The form draft was canceled. Run /forms to start over.')
                            .setTimestamp(),
                    ],
                    components: [],
                });
            }
            formDrafts.delete(interaction.user.id);
            break;
        }
        default:
            break;
    }
}

async function publishFormDraft(draft, interaction) {
    const missing = [];
    if (!draft.purpose) missing.push('purpose');
    if (!draft.link) missing.push('link');
        if (!draft.roleIds.length) missing.push('role');
    if (!draft.deadline) missing.push('deadline');
    if (missing.length) {
        await interaction.followUp({
            content: `Please set the following before publishing: ${missing.join(', ')}.`,
            ephemeral: true,
        });
        return;
    }
    const linksChannelId = getConfiguredLinksChannelId();
    if (!linksChannelId) {
        await interaction.followUp({
            content: 'Links channel is no longer configured. Run /setup to set it.',
            ephemeral: true,
        });
        return;
    }
    const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID));
    const channel = await guild.channels
        .fetch(linksChannelId)
        .catch(() => null);
    if (!channel?.isTextBased?.()) {
        await interaction.followUp({ content: 'Links channel is invalid.', ephemeral: true });
        return;
    }
    const now = new Date().toISOString();
    const form = await addForm({
        purpose: draft.purpose,
        link: draft.link,
        roleIds: draft.roleIds,
        deadline: draft.deadline,
        remindIntervalMs: DEFAULT_FORM_REMINDER_INTERVAL_MS,
        creatorId: interaction.user.id,
        channelId: channel.id,
        createdAt: now,
        active: true,
    });
    const embed = await buildLinksEmbed(form);
    const mentionText = form.roleIds && form.roleIds.length ? form.roleIds.map((id) => `<@&${id}>`).join(' ') : '';
    const sent = await channel.send({
        content: mentionText ? `Reminder for ${mentionText}` : undefined,
        embeds: [embed],
    });
    await updateForm(form.id, { messageId: sent.id });
    const updated = await getForm(form.id);
    await notifyRoleMembersForForm(updated, guild, true);
    draft.published = true;
    await refreshDraftView(draft);
    formDrafts.delete(draft.userId);
    await interaction.followUp({
        content: `Published reminder in <#${channel.id}> and DM’d <@&${draft.roleId}>.`,
        ephemeral: true,
    });
}

async function handleFormModalSubmit(interaction) {
    const draft = formDrafts.get(interaction.user.id);
    if (!draft) {
        return interaction.reply({ content: 'Form draft expired. Run /forms again.', ephemeral: true });
    }
        if (interaction.customId === FORM_MODAL_IDS.PURPOSE) {
            draft.purpose = interaction.fields.getTextInputValue('purpose').trim();
            await interaction.reply({ content: 'Purpose saved.', ephemeral: true });
        } else if (interaction.customId === FORM_MODAL_IDS.LINK) {
            draft.link = interaction.fields.getTextInputValue('link').trim();
            await interaction.reply({ content: 'Link saved.', ephemeral: true });
        } else if (interaction.customId === FORM_MODAL_IDS.DEADLINE) {
            const raw = interaction.fields.getTextInputValue('deadline');
            const parsed = parseDeadlineInput(raw);
            if (!parsed) {
                await interaction.reply({ content: 'Unable to parse that deadline. Try again.', ephemeral: true });
                return;
            }
            draft.deadline = parsed;
            await interaction.reply({ content: `Deadline set to ${new Date(parsed).toLocaleString()}.`, ephemeral: true });
        }
        await refreshDraftView(draft);
}

async function handleFormRoleSelect(interaction) {
    const draft = formDrafts.get(interaction.user.id);
    if (!draft) {
        return interaction.reply({ content: 'Form draft expired. Run /forms again.', ephemeral: true });
    }
    const values = interaction.values || [];
    if (!values.length) {
        await interaction.deferUpdate();
        return;
    }
    draft.roleIds = values;
    await interaction.deferUpdate();
    await refreshDraftView(draft);
}

async function handleFormAck(interaction) {
    const [_, formId] = interaction.customId.split(':');
    if (!formId) {
        return interaction.reply({ content: 'Malformed acknowledgement.', ephemeral: true });
    }
    const form = await getForm(formId);
    if (!form) {
        return interaction.reply({ content: 'Form data not found.', ephemeral: true });
    }
    if ((form.acknowledged || []).some((ack) => ack.userId === interaction.user.id)) {
        return interaction.reply({ content: 'You already acknowledged this form.', ephemeral: true });
    }
    addAcknowledgement(formId, {
        userId: interaction.user.id,
        username: interaction.user.tag,
        timestamp: new Date(),
    });
    const updated = await getForm(formId);
    const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID));
    await updateLinksEmbed(updated, guild);
    await interaction.reply({
        content:
            'Thanks! Reminders for this form will stop for you. False acknowledgements are visible, so please only click once.',
        ephemeral: true,
    });
}

async function handleChatInputCommand(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName === 'setup') {
        await handleSetupCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'set-committee-role') {
        await handleSetCommitteeRoleCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'forms') {
        await handleFormsCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'member-commands') {
        await handleMemberCommandsCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'admin-commands') {
        await handleAdminCommandsCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'onboarding') {
        await handleOnboardingCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'sync-discord-ids') {
        await handleSyncDiscordIdsCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'sync-roles') {
        await handleSyncRolesCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'resync-committees') {
        await handleResyncCommitteesCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'lockdown') {
        await handleLockdownCommand(interaction);
        return true;
    }
    return false;
}

async function handleSyncDiscordIdsCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guild =
        interaction.guild || (await client.guilds.fetch(GUILD_ID).catch(() => null));
    if (!guild) {
        await interaction.followUp({
            content: 'Guild not available. Make sure the bot is still in the chapter server.',
            flags: EPHEMERAL_FLAG,
        });
        return;
    }
    await guild.members.fetch().catch(() => null);
    const members = await getMembers();
    const lookups = buildMemberLookups(members);
    const pendingItems = await getPending();
    const pendingLookups = buildPendingLookups(pendingItems);
    let scanned = 0;
    let patched = 0;
    let alreadySet = 0;
    let unmatched = 0;
    const syncedNames = [];
    const unmatchedNames = [];
    for (const guildMember of guild.members.cache.values()) {
        if (!guildMember || guildMember.user?.bot) continue;
        scanned++;
        const apiMember = findMemberForGuildMember(guildMember, lookups);
        if (!apiMember) {
            unmatched++;
            unmatchedNames.push(guildMember.displayName || guildMember.user?.tag || guildMember.id);
            continue;
        }
        const currentDiscordId = String(apiMember.discordId || '').trim();
        if (currentDiscordId) {
            alreadySet++;
            continue;
        }
        try {
            await patchMemberDiscordId(apiMember, guildMember.id);
            await patchPendingDiscordIdForMember(apiMember, guildMember.id, pendingLookups);
            patched++;
            syncedNames.push(
                `${apiMember.rollNo || apiMember._id || toStringLabel(apiMember)}`
            );
        } catch (err) {
            console.error('Failed to patch discordId during sync:', err);
            unmatchedNames.push(
                `${apiMember.rollNo || apiMember._id || toStringLabel(apiMember)}`
            );
            unmatched++;
        }
    }
    function formatBullets(items) {
        if (!items.length) return [];
        const lines = items.map((entry) => `• ${entry}`);
        const maxLinesPerField = 20;
        const chunks = [];
        for (let i = 0; i < lines.length; i += maxLinesPerField) {
            chunks.push(lines.slice(i, i + maxLinesPerField).join('\n'));
        }
        return chunks;
    }
    const embed = new EmbedBuilder()
        .setTitle('Discord ID sync')
        .setColor(THEME_GOLD)
        .setDescription('Summary of the latest /sync-discord-ids run')
        .addFields({
            name: 'Totals',
            value: `Scanned ${scanned} · Patched ${patched} · Raised ${alreadySet} · Unmatched ${unmatched}`,
        })
        .setTimestamp();
    const syncedBlocks = formatBullets(syncedNames);
    if (syncedBlocks.length) {
        syncedBlocks.forEach((block, i) => {
            embed.addFields({
                name: i === 0 ? 'Synced members' : 'Synced members (continued)',
                value: block,
            });
        });
    } else {
        embed.addFields({
            name: 'Synced members',
            value: 'None synced this run.',
        });
    }
    const unmatchedBlocks = formatBullets(unmatchedNames);
    if (unmatchedBlocks.length) {
        unmatchedBlocks.forEach((block, i) => {
            embed.addFields({
                name: i === 0 ? 'Unmatched members' : 'Unmatched members (continued)',
                value: block,
            });
        });
    } else {
        embed.addFields({
            name: 'Unmatched members',
            value: 'All members matched.',
        });
    }
    await interaction.followUp({
        embeds: [embed],
        flags: EPHEMERAL_FLAG,
    });
}

async function handleSyncRolesCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID).catch(() => null));
    if (!guild) {
        await interaction.editReply('Guild not available. Make sure the bot is still in the chapter server.');
        return;
    }
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const adminRoleId = getConfiguredAdminRoleId();
    const hasAdminRole = Boolean(adminRoleId && member?.roles?.cache?.has(adminRoleId));
    const hasPerm = Boolean(hasAdminRole || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild));
    if (!hasPerm) {
        await interaction.editReply('You lack permission to run role synchronization.');
        return;
    }
    await interaction.editReply('Running strict role sync. This may take a minute...');
    const stats = await syncMemberRolesForGuild(guild.id, {
        waitForCurrent: true,
        waitTimeoutMs: 180000,
        committeeAllowRemovals: true,
    });
    if (stats.skipped) {
        await interaction.editReply(
            `Role sync skipped (${stats.skipReason || 'in progress'}). Try again in a moment.`
        );
        return;
    }
    if (!stats.success) {
        await interaction.editReply(
            `Role sync failed${stats.error ? `: ${stats.error}` : '.'}`
        );
        return;
    }
    await interaction.editReply(
        [
            'Role sync complete.',
            `Processed: ${stats.processedMembers}`,
            `Matched to site members: ${stats.matchedMembers}`,
            `Committee roles added: ${stats.committeeAdds}`,
            `Committee roles removed: ${stats.committeeRemoves}`,
            `Skipped add/remove (hierarchy): ${stats.committeeSkippedUneditableAdds + stats.committeeSkippedUneditableRemoves}`,
            `Missing mapped role references: ${stats.committeeMissingRoleRefs}`,
            `Duration: ${stats.durationSec}s`,
        ].join('\n')
    );
}

async function handleResyncCommitteesCommand(interaction) {
    await interaction.deferReply();
    try {
        const formatApiMemberName = (member) => {
            if (!member) return '';
            const fullName = [member.fName, member.lName].filter(Boolean).join(' ').trim();
            const roll = String(member.rollNo || '').trim();
            if (fullName && roll) return `${fullName} (${roll})`;
            if (fullName) return fullName;
            if (roll) return roll;
            return String(member._id || member.id || 'Unknown member').trim();
        };
        const buildLabeledChunks = (label, values, maxLen = 1800) => {
            const items = Array.from(new Set(values || [])).filter(Boolean);
            if (!items.length) return [`${label}: none`];
            const chunks = [];
            let currentLabel = `${label}: `;
            let current = currentLabel;
            for (const item of items) {
                const piece = current === currentLabel ? item : `, ${item}`;
                if ((current + piece).length > maxLen) {
                    chunks.push(current);
                    currentLabel = `${label} (cont.): `;
                    current = `${currentLabel}${item}`;
                    continue;
                }
                current += piece;
            }
            if (current) chunks.push(current);
            return chunks;
        };
        await interaction.editReply('Starting committee resync: validating guild and loading members...');
        const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID).catch(() => null));
        if (!guild) {
            await interaction.editReply('Guild not available. Make sure the bot is still in the chapter server.');
            return;
        }
        await ensureGuildStore(guild.id);
        const configSnapshot = getBotConfig() || {};
        const committeeRoleMapSnapshot = { ...(configSnapshot.committeeRoleMap || {}) };
        const roleIdsToClear = new Set(Object.values(committeeRoleMapSnapshot).filter(Boolean));
        knownCommitteeRoleIds.forEach((roleId) => roleIdsToClear.add(roleId));
        const committeeHeadRoleId = configSnapshot.committeeHeadRoleId || COMMITTEE_HEAD_ROLE_ID;
        if (committeeHeadRoleId) {
            roleIdsToClear.add(committeeHeadRoleId);
        }
        const trackedRoleIds = Array.from(roleIdsToClear).filter(Boolean);
        if (!trackedRoleIds.length) {
            await interaction.editReply('No committee roles are configured yet. Run `/set-committee-role` first.');
            return;
        }
        await guild.members.fetch().catch(() => null);
        await guild.roles.fetch().catch(() => null);
        const botMember = guild.members.me ?? (await guild.members.fetch(client.user.id).catch(() => null));
        const botHighest = botMember?.roles?.highest || null;
        const manageableRoleIds = new Set();
        const uneditableRoles = [];
        const missingRoles = [];
        for (const roleId of trackedRoleIds) {
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                missingRoles.push(roleId);
                continue;
            }
            if (role.editable) {
                manageableRoleIds.add(role.id);
            } else {
                uneditableRoles.push(role.name || role.id);
            }
        }
        if (!manageableRoleIds.size) {
            const rolePreview = uneditableRoles.length
                ? ` Target roles: ${uneditableRoles.slice(0, 6).join(', ')}${uneditableRoles.length > 6 ? ', ...' : ''}.`
                : '';
            await interaction.editReply(
                `Resync blocked: bot role hierarchy prevents committee updates. My highest role is ` +
                `${botHighest ? `"${botHighest.name}" (position ${botHighest.position})` : 'unknown'}.` +
                ` Move the bot role above committee roles, then rerun /resync-committees.${rolePreview}`
            );
            return;
        }
        await interaction.editReply('Committee resync step 1/2: clearing existing committee roles...');
        let clearedMembers = 0;
        let clearedAssignments = 0;
        let clearFailures = 0;
        const clearedMemberIds = [];
        for (const member of guild.members.cache.values()) {
            if (!member || member.user?.bot) continue;
            const toRemove = member.roles.cache
                .filter((role) => manageableRoleIds.has(role.id))
                .map((role) => role.id);
            if (!toRemove.length) continue;
            try {
                await member.roles.remove(toRemove);
                clearedMembers++;
                clearedAssignments += toRemove.length;
                clearedMemberIds.push(member.id);
            } catch (err) {
                clearFailures++;
                console.error('Failed to clear committee roles during resync', {
                    userId: member.id,
                    roleIds: toRemove,
                    err,
                });
            }
        }
        await interaction.editReply(
            `Committee resync step 1/2 complete: cleared ${clearedAssignments} role assignment(s) across ${clearedMembers} member(s). Fetching committee data and reassigning...`
        );
        const committees = await getCommittees();
        const members = await getMembers();
        const memberByApiId = buildMemberIndexByApiId(members);
        const targetRolesByDiscordId = new Map();
        const committeeHeadIds = new Set();
        let committeesWithRoleMapping = 0;
        let committeesWithoutRoleMapping = 0;
        let unresolvedMemberIds = 0;
        const unresolvedApiIds = new Set();
        let membersMissingDiscordId = 0;
        const membersMissingDiscordNames = new Set();
        for (const committee of committees || []) {
            const committeeName = committee?.name || committee?.committeeName || '';
            const roleId = committeeName ? committeeRoleMapSnapshot[normalizeLabel(committeeName)] : '';
            if (!roleId) {
                committeesWithoutRoleMapping++;
                continue;
            }
            committeesWithRoleMapping++;
            if (!manageableRoleIds.has(roleId)) {
                continue;
            }
            knownCommitteeRoleIds.add(roleId);
            const committeeMemberIds = new Set();
            const headId = getCommitteeMemberIdValue(committee?.committeeHeadId);
            if (headId) {
                committeeMemberIds.add(headId);
                committeeHeadIds.add(headId);
            }
            if (Array.isArray(committee?.committeeMembers)) {
                for (const entry of committee.committeeMembers) {
                    const memberId = getCommitteeMemberIdValue(entry);
                    if (memberId) committeeMemberIds.add(memberId);
                }
            }
            for (const apiId of committeeMemberIds) {
                const apiMember = memberByApiId.get(apiId);
                if (!apiMember) {
                    unresolvedMemberIds++;
                    unresolvedApiIds.add(apiId);
                    continue;
                }
                const discordId = String(apiMember.discordId || '').trim();
                if (!discordId) {
                    membersMissingDiscordId++;
                    membersMissingDiscordNames.add(formatApiMemberName(apiMember));
                    continue;
                }
                const existing = targetRolesByDiscordId.get(discordId) || new Set();
                existing.add(roleId);
                targetRolesByDiscordId.set(discordId, existing);
            }
        }
        const headRoleManageable = Boolean(committeeHeadRoleId && manageableRoleIds.has(committeeHeadRoleId));
        let unresolvedHeadIds = 0;
        if (headRoleManageable) {
            for (const headApiId of committeeHeadIds) {
                const apiMember = memberByApiId.get(headApiId);
                if (!apiMember) {
                    unresolvedHeadIds++;
                    continue;
                }
                const discordId = String(apiMember.discordId || '').trim();
                if (!discordId) {
                    unresolvedHeadIds++;
                    continue;
                }
                const existing = targetRolesByDiscordId.get(discordId) || new Set();
                existing.add(committeeHeadRoleId);
                targetRolesByDiscordId.set(discordId, existing);
            }
        }
        let reassignedMembers = 0;
        let reassignedAssignments = 0;
        let membersMissingInGuild = 0;
        let addFailures = 0;
        const reassignedMemberIds = [];
        for (const [discordId, roleSet] of targetRolesByDiscordId.entries()) {
            const guildMember =
                guild.members.cache.get(discordId) ||
                (await guild.members.fetch(discordId).catch(() => null));
            if (!guildMember || guildMember.user?.bot) {
                membersMissingInGuild++;
                continue;
            }
            const toAdd = Array.from(roleSet).filter(
                (roleId) => roleId && manageableRoleIds.has(roleId) && !guildMember.roles.cache.has(roleId)
            );
            if (!toAdd.length) continue;
            try {
                await guildMember.roles.add(toAdd);
                reassignedMembers++;
                reassignedAssignments += toAdd.length;
                reassignedMemberIds.push(guildMember.id);
            } catch (err) {
                addFailures++;
                console.error('Failed to add committee roles during resync', {
                    userId: guildMember.id,
                    roleIds: toAdd,
                    err,
                });
            }
        }
        const notes = [];
        if (clearFailures) notes.push(`clear failures=${clearFailures}`);
        if (missingRoles.length) notes.push(`missing mapped roles=${missingRoles.length}`);
        if (uneditableRoles.length) notes.push(`uneditable mapped roles=${uneditableRoles.length}`);
        if (unresolvedMemberIds) notes.push(`committee IDs missing from members API=${unresolvedMemberIds}`);
        if (membersMissingDiscordId) notes.push(`members without discordId=${membersMissingDiscordId}`);
        if (membersMissingInGuild) notes.push(`discord users not in guild=${membersMissingInGuild}`);
        if (unresolvedHeadIds) notes.push(`committee heads unresolved=${unresolvedHeadIds}`);
        if (addFailures) notes.push(`add failures=${addFailures}`);
        await interaction.editReply(
            `Committee resync complete via API mapping. Cleared ${clearedAssignments} assignment(s), reassigned ${reassignedAssignments} assignment(s) across ${reassignedMembers} member(s). ` +
            `Committees: ${committeesWithRoleMapping} mapped / ${committeesWithoutRoleMapping} unmapped. API members loaded: ${members.length}.` +
            (notes.length ? `\nNotes: ${notes.join(' · ')}` : '')
        );
        const listPayloads = [
            ...buildLabeledChunks('Cleared members', clearedMemberIds.map((id) => `<@${id}>`)),
            ...buildLabeledChunks('Reassigned members', reassignedMemberIds.map((id) => `<@${id}>`)),
            ...buildLabeledChunks(
                'Members missing discordId (cannot be assigned)',
                Array.from(membersMissingDiscordNames)
            ),
            ...buildLabeledChunks(
                'Committee IDs missing from members API',
                Array.from(unresolvedApiIds)
            ),
        ];
        for (const content of listPayloads) {
            await interaction.followUp({ content });
        }
    } catch (err) {
        console.error('Committee resync command failed:', err);
        await interaction.editReply('Committee resync failed due to an unexpected error. Check logs and retry.');
    }
}

async function handleLockdownCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID).catch(() => null));
    if (!guild) {
        await interaction.followUp({
            content: 'Guild not available. Make sure the bot is still in the chapter server.',
            ephemeral: true,
        });
        return;
    }
    const action = interaction.options.getString('action') || 'engage';
    const reasonInput = interaction.options.getString('reason')?.trim() || '';
    const durationInput = interaction.options.getNumber('duration');
    const lockdownRole = await ensureLockdownRole(guild);
    if (!lockdownRole) {
        await interaction.followUp({
            content: 'Could not ensure the lockdown role exists.',
            flags: EPHEMERAL_FLAG,
        });
        return;
    }
    if (action === 'release') {
        const currentState = getLockdownState();
        if (!currentState.active) {
            await interaction.followUp({
                content: 'Lockdown is not currently active.',
                flags: EPHEMERAL_FLAG,
            });
            return;
        }
        let restored = 0;
        let missing = 0;
        for (const [memberId, roles] of Object.entries(currentState.members || {})) {
            const member = await guild.members.fetch(memberId).catch(() => null);
            if (!member) {
                missing++;
                continue;
            }
            if (roles && roles.length) {
                await member.roles.add(roles).catch(() => null);
            }
            await member.roles.remove(lockdownRole.id).catch(() => null);
            restored++;
        }
        setLockdownState({ active: false, channelId: '', members: {} });
        await persistLockdownStateToApi({
            active: false,
            createdBy: interaction.user.tag,
        });
        await interaction.followUp({
            content: `Lockdown lifted. Restored roles for ${restored} members (${missing} not found).`,
            flags: EPHEMERAL_FLAG,
        });
        return;
    }
    const channel = await ensureLockdownChannel(guild, lockdownRole);
    if (!channel) {
        await interaction.followUp({
            content: 'Could not set up the lockdown channel.',
            flags: EPHEMERAL_FLAG,
        });
        return;
    }
    const members = await getMembers();
    await guild.members.fetch().catch(() => null);
    const lockdownMap = {};
    let assigned = 0;
    let skipped = 0;
    for (const member of guild.members.cache.values()) {
        if (!member || member.user?.bot) continue;
        if (hasExemptRole(member)) {
            skipped++;
            continue;
        }
        const removable = member.roles.cache
            .filter(
                (role) =>
                    !role.managed &&
                    role.id !== guild.roles.everyone.id &&
                    role.id !== lockdownRole.id
            )
            .map((role) => role.id);
        if (!removable.length) continue;
        lockdownMap[member.id] = removable;
        await member.roles.remove(removable).catch(() => null);
        await member.roles.add(lockdownRole.id).catch(() => null);
        assigned++;
    }
    setLockdownState({ active: true, channelId: channel.id, members: lockdownMap });
    const durationMinutes = durationInput ? Math.max(0, Math.round(durationInput)) : 0;
    const reasonText = reasonInput || 'Updates and synchronizations';
    const lockdownEmbed = new EmbedBuilder()
        .setTitle('Lockdown enabled')
        .setURL(LOCKDOWN_STATUS_URL)
        .setColor(THEME_GOLD)
        .setDescription('Lockdown mode is active while leadership performs updates and synchronizations.')
        .addFields(
            {
                name: 'Why this is happening',
                value: reasonText
                    ? `• ${reasonText}\n• Scheduled updates\n• Data sync between the site and Discord\n• Emergency fixes that need a quiet workspace`
                    : '• Scheduled updates\n• Data sync between the site and Discord\n• Emergency fixes that need a quiet workspace',
            },
            {
                name: 'Estimated duration',
                value: durationMinutes > 0 ? `${durationMinutes} minutes` : 'Open-ended until cleared',
            },
            {
                name: 'Need more info?',
                value: `[Visit the status page for details](${LOCKDOWN_STATUS_URL}) and updates.`,
            }
        )
        .setTimestamp();
    await channel
        .send({
        content: `<@&${lockdownRole.id}> Lockdown mode is now active. Visit the status page for the latest updates: ${LOCKDOWN_STATUS_URL}`,
        embeds: [lockdownEmbed],
    })
    .catch(() => null);
    await persistLockdownStateToApi({
        active: true,
        reason: reasonText,
        durationMinutes,
        createdBy: interaction.user.tag,
    });
    await interaction.followUp({
        content: `Lockdown engaged in ${channel.name}. Removed roles for ${assigned} members (${skipped} exempted).`,
        ephemeral: true,
    });
}

// ---------------- Events ----------------
client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Logged in as ${c.user.tag}`);
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (guild) {
        await cacheGuildRoles(guild);
        await ensureVerifiedRole(guild);
        await cleanUpMajorRolesForGuild(guild);
    }
    schedulePendingChecker();
    scheduleRoleSync();
    scheduleFormReminders();
    await registerSlashCommands();
});

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        if (!isMonitoredGuild(member.guild.id)) return;
        await ensureGuildContext(member.guild.id);

        await member.roles.add(PENDING_ROLE_ID).catch(() => { });
        const channel = await createPrivateChannel(member);

        const intro = new EmbedBuilder()
            .setColor(THEME_GOLD)
            .setTitle("Welcome! Let's get you verified")
            .setDescription('Click **Get Started** to enter your email. We’ll send you an invitation and instructions.');

        await channel.send({
            content: `<@${member.id}>`,
            embeds: [intro],
            components: [getStartedRow(member.id)],
        });
    } catch (err) {
        console.error('GuildMemberAdd error:', err);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.guild && !isMonitoredGuild(interaction.guild.id)) {
            return;
        }
        await ensureInteractionGuildContext(interaction);
        if (interaction.isModalSubmit() && interaction.customId?.startsWith('form_modal_')) {
            await handleFormModalSubmit(interaction);
            return;
        }
        if (interaction.isModalSubmit() && interaction.customId === 'onboarding:add-step-modal') {
            await handleOnboardingAddModal(interaction);
            return;
        }
        if (interaction.isRoleSelectMenu() && interaction.customId === 'form_role_select') {
            await handleFormRoleSelect(interaction);
            return;
        }
        if (interaction.isStringSelectMenu() && interaction.customId?.startsWith('committee:select:')) {
            await handleCommitteeSelectMenu(interaction);
            return;
        }
        if (interaction.isRoleSelectMenu() && interaction.customId?.startsWith('committee:role:')) {
            await handleCommitteeRoleSelect(interaction);
            return;
        }
        if (interaction.isButton() && interaction.customId === 'onboarding:add-step') {
            await interaction.showModal(buildOnboardingAddModal());
            return;
        }
        if (interaction.isButton() && interaction.customId?.startsWith('onboarding:step:')) {
            await handleOnboardingStepButton(interaction);
            return;
        }
        if (interaction.isButton() && interaction.customId?.startsWith('form_button_')) {
            await handleFormButtonInteraction(interaction);
            return;
        }
        if (interaction.isButton() && interaction.customId?.startsWith('committee:cancel:')) {
            await handleCommitteeCancelButton(interaction);
            return;
        }
        if (interaction.isButton() && interaction.customId?.startsWith(`${ACK_BUTTON_PREFIX}:`)) {
            await handleFormAck(interaction);
            return;
        }
        if (interaction.isChatInputCommand()) {
            const handled = await handleChatInputCommand(interaction);
            if (handled) return;
        }
        // Buttons (Start / Approve / Reject)
        if (interaction.isButton()) {
            const parts = interaction.customId.split(':');
            const ns = parts[0];
            const action = parts[1];

            // Start → open email modal
            if (ns === 'verify' && action === 'start') {
                const userId = parts[2];
                if (userId !== interaction.user.id) {
                    return interaction.reply({ content: 'This button is not for you.', ephemeral: true });
                }
                return interaction.showModal(emailModal(userId));
            }

            // Admin approve/reject
            if (ns === 'pending' && (action === 'approve' || action === 'reject')) {
                // Only allow admins/mods
                const member = await interaction.guild.members.fetch(interaction.user.id);
                const adminRoleId = getConfiguredAdminRoleId();
                const hasAdminRole = adminRoleId && member.roles.cache.has(adminRoleId);
                const hasPerm =
                    hasAdminRole || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
                if (!hasPerm)
                    return interaction.reply({ content: 'You lack permission to do this.', ephemeral: true });

                const pendingId = parts[2]; // DB id
                const emailFromButton = parts[3] && parts[3] !== 'none' ? parts[3] : null;

                // PUBLIC reply (non-ephemeral)
                await interaction.deferReply();

                const { ok } = await patchApproval(pendingId, action);
                if (!ok) {
                    await interaction.editReply(`API ${action} failed for user ID ${pendingId}.`);
                    return;
                }

                // Try to resolve the Discord user/channel by our store
                let link =
                    getByPendingId(pendingId) || (emailFromButton ? getByEmail(emailFromButton) : null);

                if (action === 'reject') {
                    // Disable buttons on the message so nobody double-clicks
                    try {
                        const disabled = approveRejectRowDisabled(pendingId, emailFromButton);
                        await interaction.message.edit({ components: [disabled] }).catch(() => { });
                    } catch { }

                    // DM + kick + delete verify channel
                    if (link) {
                        try {
                            const user = await client.users.fetch(link.userId);
                            await user.send(
                                'Your profile request was rejected by an admin. If you believe this is an error, email **regent@thetatau-dg.org**.'
                            );
                            const gm = await interaction.guild.members.fetch(link.userId).catch(() => null);
                            if (gm) await gm.kick('Verification rejected by admin');
                        } catch { }
                        if (link.channelId) {
                            const ch = await interaction.guild.channels.fetch(link.channelId).catch(() => null);
                            if (ch) {
                                try {
                                    await ch.send('This verification was rejected. This channel will be deleted.');
                                } catch { }
                                setTimeout(() => ch.delete('Verification rejected').catch(() => { }), 5000);
                            }
                        }
                    }

                    await interaction.editReply(`Rejected user ID ${pendingId} by <@${interaction.user.id}>.`);
                    return;
                }

                // Approved → (optional) fetch members list to enrich the welcome card later
                let apiMember = null;
                try {
                    const members = await getMembers();
                    apiMember =
                        members.find((m) => String(m._id || m.id) === String(pendingId)) ||
                        [...members].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                } catch { }

                // Disable buttons on the message so nobody double-clicks
                try {
                    const disabled = approveRejectRowDisabled(pendingId, emailFromButton);
                    await interaction.message.edit({ components: [disabled] }).catch(() => { });
                } catch { }

                // Ask the user for their profile picture in their temp channel (if we know it)
                if (link?.channelId) {
                    awaitingPfp.set(link.userId, { apiMember: apiMember || {}, channelId: link.channelId });
                    const tempChan = await interaction.guild.channels.fetch(link.channelId).catch(() => null);
                    if (tempChan) {
                        await tempChan.send({
                            content: `<@${link.userId}> Approved - please upload your **profile picture** as the next message in this channel.`,
                        });
                    }
                    await interaction.editReply(
                        `Approved user ID ${pendingId} by <@${interaction.user.id}>. Asked the user for their profile picture.`
                    );
                } else {
                    await interaction.editReply(
                        `Approved user ID ${pendingId} by <@${interaction.user.id}>. I couldn’t locate the Discord user via saved mapping.`
                    );
                }
                return;
            }
        }

        // Modal submit (email)
        if (interaction.isModalSubmit()) {
            const [ns, kind, userId] = interaction.customId.split(':');
            if (ns === 'verify' && kind === 'email') {
                if (userId !== interaction.user.id) return;
                const email = interaction.fields.getTextInputValue('email').trim();
                if (!isValidEmail(email)) {
                    return interaction.reply({ content: 'Please enter a valid email.', ephemeral: true });
                }

                const channelId = interaction.channel?.id || null;

                await interaction.deferReply({ ephemeral: true });
                const { ok, payload } = await postInvitation(email);

                // Persist: email <-> discord user, and the invite id returned
                rememberEmail({
                    userId: interaction.user.id,
                    email,
                    channelId,
                    inviteId: payload?.id || null,
                });

                // Admin embed (optional)
                try {
                    const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID));
                    const adminChannelId = getConfiguredAdminChannelId();
                    const adminChan = adminChannelId
                        ? await guild.channels.fetch(adminChannelId).catch(() => null)
                        : null;
                    if (adminChan) {
                        const embed = buildInviteAdminEmbed(email, payload, ok, interaction.member);
                        const mentionRoleId = getConfiguredAdminRoleId();
                        const mention = mentionRoleId ? `<@&${mentionRoleId}>` : '';
                        await adminChan.send({ content: `${mention} New invitation submitted`, embeds: [embed] });
                    }
                } catch { }

                // Steps guide to temp channel (only show when the invite actually sent)
                if (ok) {
                    await postStepsGuide(interaction.channel);
                }
                await interaction.editReply(
                    ok
                        ? 'Invite sent! Check your email and follow the steps above.'
                        : 'There was an issue sending your invite. Please contact a mod.'
                );
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
        if (interaction.isRepliable()) {
            try {
                const errorPayload = { content: 'Something went wrong. Try again.', flags: EPHEMERAL_FLAG };
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(errorPayload);
                } else {
                    await interaction.reply(errorPayload);
                }
            } catch { }
        }
    }
});

// Catch profile picture after approval
client.on(Events.MessageCreate, async (msg) => {
    try {
        if (!msg.guild || msg.author.bot) return;
        const wait = awaitingPfp.get(msg.author.id);
        if (!wait) return;
        if (msg.channel.id !== wait.channelId) return;

        const attach = msg.attachments.first();
        if (!attach) return; // ignore non-attachments

        // Build welcome embed from API + photo
        const gm = await msg.guild.members.fetch(msg.author.id);
        const embed =
            wait.apiMember && Object.keys(wait.apiMember).length
                ? buildWelcomeEmbedFromApi(gm, wait.apiMember)
                : new EmbedBuilder().setColor(THEME_RED).setTitle(gm.user.username).setDescription('🎉 New Member Onboarding Card').setTimestamp();

        // Try to buffer the image so it persists
        let files = [];
        let thumbnailSet = false;
        try {
            const res = await fetch(attach.url);
            if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                files = [{ attachment: buf, name: 'pfp.png' }];
                embed.setThumbnail('attachment://pfp.png');
                thumbnailSet = true;
            }
        } catch { }
        if (!thumbnailSet) {
            embed.setThumbnail(gm.user.displayAvatarURL({ extension: 'png', size: 256 }));
        }

        const welcome = await msg.guild.channels.fetch(WELCOME_CARDS_CHANNEL_ID).catch(() => null);
        if (welcome) await welcome.send({ embeds: [embed], files }).catch(() => { });

        await gm.roles.remove(PENDING_ROLE_ID).catch(() => { });
        const onboardingStarted = await startOnboardingForMember(gm, wait.apiMember);
        let appliedRole = false;
        if (!onboardingStarted) {
            const roleResult = await applyMemberRoles(gm, wait.apiMember);
            appliedRole = Boolean(roleResult?.statusOrDefaultApplied);
        }

        awaitingPfp.delete(msg.author.id);
        const replyParts = ['Thanks! Your welcome card has been posted.'];
        if (appliedRole) replyParts.push('You now have your member role.');
        if (onboardingStarted) replyParts.push('Check your DMs to continue the onboarding flow before you get full access.');
        await msg.reply(replyParts.join(' ')).catch(() => { });

        // Auto-close the verify channel
        if (Number.isFinite(DELETE_VERIFY_CHANNEL_AFTER_MS) && DELETE_VERIFY_CHANNEL_AFTER_MS >= 0) {
            try {
                const secs = Math.max(0, Math.round(DELETE_VERIFY_CHANNEL_AFTER_MS / 1000));
                await msg.channel
                    .send(`All set! This channel will close in ${secs}s.`)
                    .catch(() => { });
            } catch { }
            setTimeout(() => {
                msg.channel.delete('Verification complete').catch(() => { });
            }, Math.max(0, DELETE_VERIFY_CHANNEL_AFTER_MS));
        }
    } catch (err) {
        console.error('PFP handling error:', err);
    }
});

// ---------------- Pending poll ----------------
function digestPending(items) {
    try {
        return items
            .map((it) => String(it._id || it.id || it.rollNo || it.email || it.emailAddress || ''))
            .sort()
            .join('|');
    } catch {
        return '';
    }
}

async function pollPendingInvitesAndNotify() {
    try {
        const items = (await getPending()) || [];
        const digest = digestPending(items);
        const guildIds = getMonitoredGuildIds();
        const members = await getMembers();
        const memberById = new Map();
        for (const member of members) {
            const key = String(member?._id || member?.id || '').trim();
            if (key) memberById.set(key, member);
        }
        for (const guildId of guildIds) {
            if (!guildId) continue;
            await ensureGuildStore(guildId);
            const state = pendingStateByGuild.get(guildId) || { digest: '', ids: new Set() };
            if (digest === state.digest) {
                continue;
            }
            const previousPendingIds = new Set(state.ids);
            const currentPendingIds = new Set();
            let adminChan = null;
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;
            if (items.length) {
                const adminChannelId = getConfiguredAdminChannelId();
                adminChan = adminChannelId
                    ? await guild.channels.fetch(adminChannelId).catch(() => null)
                    : null;
                if (adminChan) {
                    const mentionRoleId = getConfiguredAdminRoleId();
                    const mention = mentionRoleId ? `<@&${mentionRoleId}> ` : '';
                    await adminChan.send({
                        content: `${mention}Pending invitations update - **${items.length}** waiting.`,
                    });
                }
            }
            const autoApproved = [];
            for (const it of items) {
                const pendingId = it._id || it.id;
                const pendingKey = pendingId ? String(pendingId).trim() : '';
                const resolvedMember = pendingKey ? memberById.get(pendingKey) : null;
                if (resolvedMember && resolvedMember.status && String(resolvedMember.status || '')
                    .trim()
                    .toLowerCase() !== 'pending') {
                    autoApproved.push({ pendingId: pendingKey, apiMember: resolvedMember });
                    continue;
                }
                if (pendingKey) {
                    currentPendingIds.add(pendingKey);
                }
                const ts = Date.parse(it.submittedAt || it.createdAt || it.updatedAt || '') || undefined;
                if (pendingId && ts && !getByPendingId(pendingId)) {
                    const guess = findRecentInviteMapping(ts, 30 * 60 * 1000);
                    if (guess?.inviteId) {
                        linkPendingToInvite(pendingId, guess.inviteId);
                    }
                }
                const rowId = generateApproveRowId(pendingId);
                let guildPendingCache = pendingSavedSummariesByGuild.get(guildId);
                if (!guildPendingCache) {
                    guildPendingCache = new Set();
                    pendingSavedSummariesByGuild.set(guildId, guildPendingCache);
                }
                const gotPending =
                    guildPendingCache.has(rowId) ||
                    (pendingId && guildPendingCache.has(String(pendingId))) ||
                    (pendingId && previousPendingIds.has(String(pendingId)));
                if (gotPending) {
                    continue;
                }
                const embed = buildPendingEmbed(it);
                const row = buildApproveRow(it, pendingId, emailFromRow(it));
                if (adminChan) {
                    await adminChan.send({ embeds: [embed], components: [row] });
                }
                if (pendingId) {
                    guildPendingCache.add(rowId);
                    guildPendingCache.add(String(pendingId));
                }
            }
            const removedIds = [...previousPendingIds].filter((id) => !currentPendingIds.has(id));
            for (const removedId of removedIds) {
                await handlePendingRemoved(guildId, removedId);
            }
            for (const { pendingId, apiMember } of autoApproved) {
                if (pendingId) {
                    await handlePendingRemoved(guildId, pendingId, { apiMember });
                }
            }
            state.digest = digest;
            state.ids = currentPendingIds;
            pendingStateByGuild.set(guildId, state);
        }
    } catch (err) {
        console.error('Pending poll error:', err);
    }
}
async function autoStartOnboardingForApprovedPending(pendingId) {
    if (!pendingId) return;
    const guildIds = getMonitoredGuildIds();
    for (const guildId of guildIds) {
        if (!guildId) continue;
        await ensureGuildStore(guildId);
        const mapping = getByPendingId(pendingId);
        if (!mapping?.userId) continue;
        if (awaitingPfp.has(mapping.userId) || onboardingSessions.has(mapping.userId)) continue;
        const progress = getOnboardingProgress(mapping.userId);
        if (progress && !progress.completed) continue;
        try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;
            const member = await guild.members.fetch(mapping.userId).catch(() => null);
            if (!member) continue;
            await startOnboardingForMember(member, null);
        } catch (err) {
            console.error('Failed to auto-start onboarding for approved pending user', {
                pendingId,
                guildId,
                err,
            });
        }
    }
}
function schedulePendingChecker() {
    pollPendingInvitesAndNotify();
    setInterval(pollPendingInvitesAndNotify, PENDING_POLL_MS);
}

// ---------------- Boot ----------------
async function main() {
    await initStore(); // load persisted mappings
    await client.login(TOKEN);
}
main();
