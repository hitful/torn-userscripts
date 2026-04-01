// ==UserScript==
// @name         WarMode v1 by hit
// @namespace    https://github.com/hitful/torn-userscripts/blob/main/warmode.js
// @version      1.0
// @description  Activate War Mode with your own custom dashboard: import targets, auto-check status, group by location, and click to attack/profile from a single unified window. Ignores your own XID on import, includes forum/faction/donate/referral links.
// @author       hit
// @match        https://www.torn.com/*
// @license      MIT
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/hitful/torn-userscripts/main/warmode.js
// @updateURL    https://raw.githubusercontent.com/hitful/torn-userscripts/main/warmode.js
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_API = 'WM_api_key_v1';
    const STORAGE_KEY_TARGETS = 'WM_targets_v1';
    const STORAGE_KEY_CITY_EXPANDED = 'WM_city_expanded_v1';
    const STORAGE_KEY_FILTER_MODE = 'WM_filter_mode_v1';
    const STORAGE_KEY_SETTINGS = 'WM_settings_v1';

    const DEFAULT_SETTINGS = {
        concurrency: 6,
        cacheTtlSec: 45,
        autoRefreshSec: 0,
        autoWarImport: false,
        warCheckSec: 45,
        neonColor: '#00faff'
    };

    const LINKS = {
        forumThread:
            'https://github.com/hitful',
        factionProfile: 'https://www.torn.com/factions.php?step=profile&ID=48572',
        itemPage: 'https://www.torn.com/item.php#',
        referralProfile: 'https://www.torn.com/profiles.php?XID=3401739',
        donateXid: '3401739'
    };

    // Snapshot of last-known travel/location info for each target
    const targetTravelSnapshot = {};
    const targetApiCache = {};

    let cachedSelfId = null; // your own XID once known
    let activeRefreshRun = null;
    let lastKnownMyCity = 'Unknown';
    let autoRefreshTimerId = null;
    let lastWarCheckAt = 0;
    const scoutEstimateMemo = {};
    let requestPacerCursorMs = 0;
    const REQUEST_MIN_SPACING_BASE_MS = 500;
    const REQUEST_MIN_SPACING_MAX_MS = 1600;
    const REQUEST_PACER_MAX_LEAD_MS = 2500;
    let requestMinSpacingMs = REQUEST_MIN_SPACING_BASE_MS;

    class RateLimitError extends Error {
        constructor(message, retryAfterMs) {
            super(message || 'Too many requests');
            this.name = 'RateLimitError';
            this.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 0;
        }
    }

    // Simple helper to strip any HTML tags from Torn's status/details text
    function stripHtmlTags(str) {
        if (!str) return '';
        return String(str)
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function setSnapshotError(xid, message) {
        targetTravelSnapshot[xid] = {
            xid,
            name: '(error)',
            state: 'Error',
            where: 'Unknown',
            destination: null,
            traveling: false,
            timeLeft: null,
            description: message || 'API error',
            details: ''
        };
    }

    let modalBackdrop = null;
    let stylesInjected = false;

    // ---------- Utility: inject Tron styles ----------

    function injectWMStyles() {
        if (stylesInjected) return;
        stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
        .WM-panel {
            background: #05070a;
            border-radius: 10px;
            padding: 16px 18px 14px;
            color: #f1f1f1;
            font-family: Consolas, monospace;
            box-shadow: 0 0 20px rgba(var(--wm-neon-rgb),0.6);
            border: 1px solid var(--wm-neon);
        }
        .WM-panel-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--wm-neon);
            text-shadow: 0 0 6px rgba(var(--wm-neon-rgb),0.8);
        }
        .WM-panel-small {
            font-size: 11px;
            color: #d2dae2;
        }
        .WM-button-main {
            font-family: Consolas, monospace;
        }
        .WM-war-body {
            flex: 1 1 auto;
            margin-top: 6px;
            border-radius: 6px;
            border: 1px solid rgba(var(--wm-neon-rgb),0.14);
            background: rgba(0, 0, 0, 0.4);
            padding: 6px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .WM-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .WM-row-grow {
            flex: 1 1 auto;
        }
        .WM-small-input {
            width: 260px;
            box-sizing: border-box;
            padding: 4px 6px;
            border-radius: 6px;
            border: 1px solid var(--wm-neon);
            outline: none;
            background: #000;
            color: #f1f1f1;
            font-size: 11px;
            box-shadow: 0 0 6px rgba(var(--wm-neon-rgb),0.4);
        }
        .WM-small-btn {
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid rgba(var(--wm-neon-rgb),0.33);
            cursor: pointer;
            background: #001018;
            color: var(--wm-neon);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            box-shadow: 0 0 4px rgba(var(--wm-neon-rgb),0.4);
        }
        .WM-small-btn-main {
            border: 2px solid var(--wm-neon);
            box-shadow: 0 0 8px rgba(var(--wm-neon-rgb),0.8);
        }
        .WM-targets-textarea {
            width: 100%;
            height: 120px;
            box-sizing: border-box;
            padding: 4px 6px;
            border-radius: 6px;
            border: 1px solid var(--wm-neon);
            outline: none;
            background: #000;
            color: #f1f1f1;
            font-size: 11px;
            font-family: Consolas, monospace;
            resize: vertical;
            box-shadow: 0 0 6px rgba(var(--wm-neon-rgb),0.4);
        }
        .WM-results {
            flex: 1 1 auto;
            overflow-y: auto;
            padding-right: 4px;
            border-radius: 6px;
            border: 1px solid rgba(var(--wm-neon-rgb),0.14);
            background: rgba(0,0,0,0.3);
        }
        .WM-city-header {
            padding: 4px 8px;
            margin: 4px 4px 0 4px;
            background: rgba(var(--wm-neon-rgb),0.08);
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .WM-city-header:hover {
            background: rgba(var(--wm-neon-rgb),0.18);
        }
        .WM-city-name {
            font-size: 11px;
            color: var(--wm-neon);
        }
        .WM-city-count {
            font-size: 10px;
            color: #b2bec3;
        }
        .WM-target-list {
            padding: 2px 12px 4px 12px;
        }
        .WM-target-row {
            font-size: 11px;
            padding: 2px 4px;
            border-left: 3px solid #bdc3c7;
            margin: 1px 0;
        }
        .WM-target-row a {
            color: #ecf0f1;
            text-decoration: none;
        }
        .WM-target-row a:hover {
            text-decoration: underline;
        }
        `;
        document.head.appendChild(style);
    }

    function createElement(tag, options) {
        const opts = options || {};
        const el = document.createElement(tag);
        if (opts.className) el.className = opts.className;
        if (typeof opts.text === 'string') el.textContent = opts.text;
        if (typeof opts.html === 'string') el.innerHTML = opts.html;
        if (opts.style) Object.assign(el.style, opts.style);
        return el;
    }

    function createButton(label, extraClass) {
        const className = extraClass ? 'WM-small-btn ' + extraClass : 'WM-small-btn';
        return createElement('button', {
            className,
            text: label
        });
    }

    function appendChildren(parent, children) {
        children.forEach((child) => parent.appendChild(child));
    }

    function getSnapFlags(state, where, sameCity) {
        const isHospOrJail =
            /hospital|jail/i.test(state) || /hospital|jail/i.test(where);
        const isLocalOkay = sameCity && /okay/i.test(state);
        const isTravel =
            /travel|abroad/i.test(state) || /travel|abroad/i.test(where);
        const isError = /error/i.test(state);

        return {
            isHospOrJail,
            isLocalOkay,
            isTravel,
            isError
        };
    }

    function getRowColor(flags) {
        if (flags.isHospOrJail) return '#e74c3c';
        if (flags.isLocalOkay) return '#2ecc71';
        if (flags.isTravel) return '#f1c40f';
        return '#bdc3c7';
    }

    function formatLifeText(snap) {
        if (!snap) return '';
        const cur = Number(snap.lifeCurrent);
        const max = Number(snap.lifeMax);
        if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return '';
        return Math.floor(cur) + '/' + Math.floor(max);
    }

    function normalizeEstimateValue(value) {
        if (value == null) return '';
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(Math.round(value));
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed;
        }
        if (typeof value === 'object') {
            const candidates = [
                value.estimate,
                value.est,
                value.battleStats,
                value.battlestats,
                value.value,
                value.text,
                value.display
            ];
            for (const c of candidates) {
                const normalized = normalizeEstimateValue(c);
                if (normalized) return normalized;
            }
        }
        return '';
    }

    function extractEstimateFromContainer(container, xid) {
        if (!container || typeof container !== 'object') return '';

        const directKeys = [
            String(xid),
            'xid:' + String(xid),
            'id:' + String(xid),
            'user:' + String(xid),
            'player:' + String(xid),
            'user' + String(xid),
            'id_' + String(xid)
        ];

        for (const k of directKeys) {
            if (Object.prototype.hasOwnProperty.call(container, k)) {
                const normalized = normalizeEstimateValue(container[k]);
                if (normalized) return normalized;
            }
        }

        if (Array.isArray(container)) {
            for (const item of container) {
                if (!item || typeof item !== 'object') continue;
                const itemXid = String(item.xid || item.id || item.user_id || item.player_id || '');
                if (itemXid && itemXid === String(xid)) {
                    const normalized = normalizeEstimateValue(item);
                    if (normalized) return normalized;
                }
            }
            return '';
        }

        const nestedKeys = [
            'estimates',
            'estimateMap',
            'scouterMap',
            'scoutData',
            'targets',
            'players',
            'users'
        ];

        for (const nk of nestedKeys) {
            if (!Object.prototype.hasOwnProperty.call(container, nk)) continue;
            const normalized = extractEstimateFromContainer(container[nk], xid);
            if (normalized) return normalized;
        }

        return '';
    }

    function getExternalScoutEstimate(xid) {
        const xidStr = String(xid);
        if (Object.prototype.hasOwnProperty.call(scoutEstimateMemo, xidStr)) {
            return scoutEstimateMemo[xidStr];
        }

        const hooks = [
            window.__wmGetScoutEstimate,
            window.FFScouter && window.FFScouter.getEstimate,
            window.FFScouter && window.FFScouter.get,
            window.FFSCOUTER && window.FFSCOUTER.getEstimate,
            window.FairFightScouter && window.FairFightScouter.getEstimate,
            window.ffScouter && window.ffScouter.getEstimate,
            window.ffScouter && window.ffScouter.get,
            window.TornTools && window.TornTools.getBattleStatsEstimate,
            window.TornTools && window.TornTools.scouter && window.TornTools.scouter.getEstimate,
            window.TornTools && window.TornTools.scouter && window.TornTools.scouter.get
        ];

        for (const hook of hooks) {
            if (typeof hook !== 'function') continue;
            try {
                const value = hook(xidStr);
                const normalized = normalizeEstimateValue(value);
                if (normalized) {
                    scoutEstimateMemo[xidStr] = normalized;
                    return normalized;
                }
            } catch (e) {
                // Ignore external hook failures.
            }
        }

        const roots = [
            window.__wmScoutEstimates,
            window.__wmScouterCache,
            window.FFScouter,
            window.FFSCOUTER,
            window.ffScouter,
            window.FairFightScouter,
            window.TornTools,
            window.TornTools && window.TornTools.scouter,
            window.TornTools && window.TornTools.state
        ];

        for (const root of roots) {
            const normalized = extractEstimateFromContainer(root, xidStr);
            if (normalized) {
                scoutEstimateMemo[xidStr] = normalized;
                return normalized;
            }
        }

        scoutEstimateMemo[xidStr] = '';
        return '';
    }

    // ---------- Utility: storage ----------

    function getApiKey() {
        return localStorage.getItem(STORAGE_KEY_API) || '';
    }

    function setApiKey(key) {
        if (!key) {
            localStorage.removeItem(STORAGE_KEY_API);
        } else {
            localStorage.setItem(STORAGE_KEY_API, key);
        }
        clearTargetCache();
    }

    function getTargetsText() {
        return localStorage.getItem(STORAGE_KEY_TARGETS) || '';
    }

    function setTargetsText(text) {
        if (!text) {
            localStorage.removeItem(STORAGE_KEY_TARGETS);
        } else {
            localStorage.setItem(STORAGE_KEY_TARGETS, text);
        }
    }

    function getTargetsArray() {
        return parseXidsFromText(getTargetsText());
    }

    function parseXidsFromText(text) {
        const lines = (text || '').split(/\r?\n/);
        const ids = new Set();

        for (const line of lines) {
            const beforeComment = line.split('#')[0].trim();
            if (!beforeComment) continue;

            const xidMatch = beforeComment.match(/\bXID=(\d{1,10})\b/i);
            if (xidMatch) {
                ids.add(xidMatch[1]);
                continue;
            }

            const idMatch = beforeComment.match(/^\D*(\d{1,10})\D*$/);
            if (idMatch) ids.add(idMatch[1]);
        }

        return Array.from(ids);
    }

    function getCachedTargetData(xid) {
        const entry = targetApiCache[xid];
        if (!entry) return null;
        const ttlMs = getSettings().cacheTtlSec * 1000;
        if (Date.now() - entry.timestamp > ttlMs) return null;
        return entry.data;
    }

    function setCachedTargetData(xid, data) {
        targetApiCache[xid] = {
            data,
            timestamp: Date.now()
        };
    }

    function clearTargetCache() {
        for (const key in targetApiCache) {
            if (Object.prototype.hasOwnProperty.call(targetApiCache, key)) {
                delete targetApiCache[key];
            }
        }
    }

    function getCityExpandedState() {
        const raw = localStorage.getItem(STORAGE_KEY_CITY_EXPANDED);
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function setCityExpandedState(state) {
        localStorage.setItem(STORAGE_KEY_CITY_EXPANDED, JSON.stringify(state || {}));
    }

    function getFilterMode() {
        return localStorage.getItem(STORAGE_KEY_FILTER_MODE) || 'all';
    }

    function setFilterMode(mode) {
        localStorage.setItem(STORAGE_KEY_FILTER_MODE, mode || 'all');
    }

    function normalizeHexColor(value, fallback) {
        const fb = fallback || DEFAULT_SETTINGS.neonColor;
        if (typeof value !== 'string') return fb;
        const v = value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(v)) {
            return (
                '#' +
                v[1] + v[1] +
                v[2] + v[2] +
                v[3] + v[3]
            ).toLowerCase();
        }
        return fb;
    }

    function hexToRgbString(hex) {
        const clean = normalizeHexColor(hex, DEFAULT_SETTINGS.neonColor).slice(1);
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        return r + ',' + g + ',' + b;
    }

    function applyNeonThemeVars(colorHex) {
        const color = normalizeHexColor(colorHex, DEFAULT_SETTINGS.neonColor);
        const rgb = hexToRgbString(color);
        document.documentElement.style.setProperty('--wm-neon', color);
        document.documentElement.style.setProperty('--wm-neon-rgb', rgb);
    }

    function normalizeSettings(candidate) {
        const raw = candidate && typeof candidate === 'object' ? candidate : {};
        const concurrency = Number(raw.concurrency);
        const cacheTtlSec = Number(raw.cacheTtlSec);
        const autoRefreshSec = Number(raw.autoRefreshSec);
        const warCheckSec = Number(raw.warCheckSec);
        const neonColor = normalizeHexColor(raw.neonColor, DEFAULT_SETTINGS.neonColor);

        return {
            concurrency: Number.isFinite(concurrency)
                ? Math.max(1, Math.min(12, Math.floor(concurrency)))
                : DEFAULT_SETTINGS.concurrency,
            cacheTtlSec: Number.isFinite(cacheTtlSec)
                ? Math.max(5, Math.min(600, Math.floor(cacheTtlSec)))
                : DEFAULT_SETTINGS.cacheTtlSec,
            autoRefreshSec: Number.isFinite(autoRefreshSec)
                ? Math.max(0, Math.min(600, Math.floor(autoRefreshSec)))
                : DEFAULT_SETTINGS.autoRefreshSec,
            autoWarImport: !!raw.autoWarImport,
            warCheckSec: Number.isFinite(warCheckSec)
                ? Math.max(15, Math.min(600, Math.floor(warCheckSec)))
                : DEFAULT_SETTINGS.warCheckSec,
            neonColor
        };
    }

    function getSettings() {
        const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (!raw) return { ...DEFAULT_SETTINGS };
        try {
            const parsed = JSON.parse(raw);
            return normalizeSettings(parsed);
        } catch (e) {
            return { ...DEFAULT_SETTINGS };
        }
    }

    function setSettings(nextSettings) {
        const previous = getSettings();
        const normalized = normalizeSettings(nextSettings);
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(normalized));

        if (previous.cacheTtlSec !== normalized.cacheTtlSec) {
            clearTargetCache();
        }

        if (previous.neonColor !== normalized.neonColor) {
            applyNeonThemeVars(normalized.neonColor);
        }

        return normalized;
    }

    function clearAutoRefreshTimer() {
        if (autoRefreshTimerId) {
            clearInterval(autoRefreshTimerId);
            autoRefreshTimerId = null;
        }
    }

    function safeOpen(url) {
        const win = window.open(url, '_blank');
        if (win) {
            win.opener = null;
        }
    }

    function sleep(ms) {
        const waitMs = Math.max(0, Number(ms) || 0);
        return new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    function recordRequestSuccess() {
        requestMinSpacingMs = Math.max(
            REQUEST_MIN_SPACING_BASE_MS,
            requestMinSpacingMs - 20
        );
    }

    function recordRateLimitPressure(retryAfterMs) {
        const suggestedSpacing = Number.isFinite(retryAfterMs)
            ? Math.max(REQUEST_MIN_SPACING_BASE_MS, Math.floor(retryAfterMs / 2))
            : REQUEST_MIN_SPACING_BASE_MS;

        requestMinSpacingMs = Math.min(
            REQUEST_MIN_SPACING_MAX_MS,
            Math.max(requestMinSpacingMs + 140, suggestedSpacing)
        );
    }

    async function waitForRequestSlot(signal) {
        const now = Date.now();
        if (requestPacerCursorMs - now > REQUEST_PACER_MAX_LEAD_MS) {
            // Prevent stale queue debt from a previous refresh from delaying a new run.
            requestPacerCursorMs = now;
        }
        const slot = Math.max(now, requestPacerCursorMs);
        requestPacerCursorMs = slot + requestMinSpacingMs;

        const waitMs = slot - now;
        if (waitMs <= 0) return;

        if (signal && signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        await sleep(waitMs);
        if (signal && signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
    }

    // ---------- Modal backdrop ----------

    function ensureModalBackdrop() {
        if (modalBackdrop) return;

        modalBackdrop = document.createElement('div');
        Object.assign(modalBackdrop.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '1000000'
        });

        modalBackdrop.addEventListener('click', function (e) {
            if (e.target === modalBackdrop) {
                closeModal();
            }
        });

        document.body.appendChild(modalBackdrop);
    }

    function setModalContent(el) {
        ensureModalBackdrop();
        modalBackdrop.innerHTML = '';
        modalBackdrop.appendChild(el);
        modalBackdrop.style.display = 'flex';
    }

    function closeModal() {
        if (modalBackdrop) {
            modalBackdrop.style.display = 'none';
        }
        clearAutoRefreshTimer();
    }

    // ---------- Travel snapshot + self info ----------

    function updateTravelSnapshotFromApi(xid, data) {
        const statusObj = data.status || {};
        const travelObj = data.travel || {};
        const lifeObj = data.life || {};

        const name = data.name || '(unknown)';

        const state = statusObj.state || 'Unknown';
        const descRaw = statusObj.description || '';
        const detailsRaw = statusObj.details || '';

        const desc = stripHtmlTags(descRaw);
        const details = stripHtmlTags(detailsRaw);

        let destination = null;
        let timeLeft = null;
        let traveling = false;
        let lifeCurrent = null;
        let lifeMax = null;

        if (travelObj && typeof travelObj === 'object') {
            if (travelObj.destination) destination = travelObj.destination;
            if (typeof travelObj.time_left === 'number') timeLeft = travelObj.time_left;
        }

        if (lifeObj && typeof lifeObj === 'object') {
            if (typeof lifeObj.current === 'number') lifeCurrent = lifeObj.current;
            if (typeof lifeObj.maximum === 'number') lifeMax = lifeObj.maximum;
            if (typeof lifeObj.max === 'number') lifeMax = lifeObj.max;
        }

        if (/travel/i.test(state) || /travel/i.test(desc)) {
            traveling = true;
        }

        let where = 'Torn';
        if (destination) {
            if (traveling) {
                where = 'Flying to ' + destination;
            } else {
                where = destination;
            }
        } else if (/abroad/i.test(state)) {
            where = 'Abroad';
        } else if (/okay/i.test(state)) {
            where = 'Torn';
        } else if (/hospital/i.test(state)) {
            where = 'Hospital';
        } else if (/jail/i.test(state)) {
            where = 'Jail';
        }

        targetTravelSnapshot[xid] = {
            xid,
            name,
            state,
            where,
            destination,
            traveling,
            timeLeft,
            lifeCurrent,
            lifeMax,
            description: desc,
            details
        };
    }

    async function getSelfIdAndCity() {
        const apiKey = getApiKey();
        if (!apiKey) return { selfId: null, city: 'Unknown' };

        try {
            const url =
                'https://api.torn.com/user/0?selections=basic&key=' +
                encodeURIComponent(apiKey);
            const resp = await fetch(url);
            const data = await resp.json();
            if (data && data.error) {
                console.warn('[WM] getSelfIdAndCity error:', data.error);
                return { selfId: null, city: 'Unknown' };
            }

            let selfId = null;
            if (typeof data.player_id !== 'undefined') {
                selfId = String(data.player_id);
            } else if (typeof data.user_id !== 'undefined') {
                selfId = String(data.user_id);
            }
            if (selfId) cachedSelfId = selfId;

            const status = data.status || {};
            const travel = data.travel || {};
            const state = (status.state || '').toLowerCase();

            let city = 'Torn';
            if (travel.destination && /abroad|travel/i.test(state)) {
                city = travel.destination;
            } else if (/hospital/.test(state)) {
                city = 'Hospital (Torn)';
            } else if (/jail/.test(state)) {
                city = 'Jail (Torn)';
            } else if (/abroad/.test(state)) {
                city = 'Abroad (unknown city)';
            }

            return { selfId, city };
        } catch (e) {
            console.warn('[WM] getSelfIdAndCity fetch error:', e);
            return { selfId: null, city: 'Unknown' };
        }
    }

    async function getSelfId() {
        if (cachedSelfId) return cachedSelfId;
        const result = await getSelfIdAndCity();
        return result.selfId;
    }

    async function getSelfFactionId() {
        const apiKey = getApiKey();
        if (!apiKey) return null;

        try {
            const url =
                'https://api.torn.com/user/0?selections=basic&key=' +
                encodeURIComponent(apiKey);
            const resp = await fetch(url);
            const data = await resp.json();
            if (data && data.error) return null;

            const faction = data.faction || {};
            if (faction && faction.faction_id) {
                return String(faction.faction_id);
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    async function fetchFactionWarPayload(apiKey, factionId) {
        const selectionsToTry = ['rankedwars', 'wars'];

        for (const selection of selectionsToTry) {
            try {
                const url =
                    'https://api.torn.com/faction/' +
                    encodeURIComponent(factionId) +
                    '?selections=' +
                    selection +
                    '&key=' +
                    encodeURIComponent(apiKey);
                const resp = await fetch(url);
                const data = await resp.json();

                if (data && data.error) {
                    continue;
                }

                if (data && typeof data === 'object') {
                    return data;
                }
            } catch (e) {
                // Try next selection shape
            }
        }

        return null;
    }

    function isWarActiveByText(statusText) {
        const s = String(statusText || '').toLowerCase();
        return /active|ongoing|running|started|in progress/.test(s);
    }

    function getWarEntries(payload) {
        const entries = [];
        const candidates = [payload && payload.rankedwars, payload && payload.wars];

        candidates.forEach((root) => {
            if (!root || typeof root !== 'object') return;
            Object.keys(root).forEach((key) => {
                const war = root[key];
                if (war && typeof war === 'object') {
                    entries.push(war);
                }
            });
        });

        return entries;
    }

    function collectMemberIdsFromFactionNode(factionNode, setOut) {
        if (!factionNode || typeof factionNode !== 'object') return;
        const memberContainers = [
            factionNode.members,
            factionNode.roster,
            factionNode.targets,
            factionNode.users,
            factionNode.players
        ];

        memberContainers.forEach((container) => {
            if (!container || typeof container !== 'object') return;
            Object.keys(container).forEach((k) => {
                if (/^\d+$/.test(k)) {
                    setOut.add(String(k));
                }
            });
        });
    }

    function extractEnemyTargetsFromWarEntries(entries, selfFactionId) {
        const ids = new Set();

        entries.forEach((war) => {
            const status =
                war.status || war.war_status || war.state || war.current_status || '';
            if (!isWarActiveByText(status)) {
                return;
            }

            const factionBuckets = [war.factions, war.teams, war.participants, war.sides];
            factionBuckets.forEach((bucket) => {
                if (!bucket || typeof bucket !== 'object') return;

                Object.keys(bucket).forEach((k) => {
                    const node = bucket[k];
                    if (!node || typeof node !== 'object') return;

                    const fid = String(node.id || node.faction_id || k || '');
                    if (fid && String(fid) === String(selfFactionId)) {
                        return;
                    }
                    collectMemberIdsFromFactionNode(node, ids);
                });
            });

            // Fallback: some payloads expose direct enemy target maps
            const directContainers = [war.targets, war.enemy, war.enemies];
            directContainers.forEach((container) => {
                if (!container || typeof container !== 'object') return;
                Object.keys(container).forEach((k) => {
                    if (/^\d+$/.test(k)) {
                        ids.add(String(k));
                    }
                });
            });
        });

        return Array.from(ids);
    }

    async function checkAndImportFactionWarTargets(targetsTextarea, statusLine, options) {
        const opts = options || {};
        const force = !!opts.force;

        const settings = getSettings();
        if (!settings.autoWarImport && !force) {
            return { checked: false, active: false, added: 0 };
        }

        const now = Date.now();
        if (!force && now - lastWarCheckAt < settings.warCheckSec * 1000) {
            return { checked: false, active: false, added: 0 };
        }
        lastWarCheckAt = now;

        const apiKey = getApiKey();
        if (!apiKey) {
            return { checked: true, active: false, added: 0 };
        }

        const selfFactionId = await getSelfFactionId();
        if (!selfFactionId) {
            return { checked: true, active: false, added: 0 };
        }

        const payload = await fetchFactionWarPayload(apiKey, selfFactionId);
        if (!payload) {
            return { checked: true, active: false, added: 0 };
        }

        const entries = getWarEntries(payload);
        if (!entries.length) {
            return { checked: true, active: false, added: 0 };
        }

        const enemyIds = extractEnemyTargetsFromWarEntries(entries, selfFactionId);
        if (!enemyIds.length) {
            return { checked: true, active: true, added: 0 };
        }

        const existingLines = targetsTextarea.value
            ? targetsTextarea.value.trim().split(/\r?\n/)
            : [];
        const existingIds = new Set(parseXidsFromText(existingLines.join('\n')));
        const selfId = await getSelfId();

        let added = 0;
        enemyIds.forEach((id) => {
            if (selfId && id === selfId) return;
            if (!existingIds.has(id)) {
                existingLines.push(id);
                existingIds.add(id);
                added++;
            }
        });

        if (added > 0) {
            targetsTextarea.value = existingLines.join('\n');
            setTargetsText(targetsTextarea.value);
            clearTargetCache();
            if (statusLine) {
                statusLine.textContent =
                    'WM auto-war import: added ' + added + ' target(s) from active faction war.';
                statusLine.style.color = '#2ecc71';
            }
        }

        return {
            checked: true,
            active: true,
            added
        };
    }

    async function fetchTargetBasic(apiKey, xid, signal) {
        const url =
            'https://api.torn.com/user/' +
            encodeURIComponent(xid) +
            '?selections=basic&key=' +
            encodeURIComponent(apiKey);

        let lastError = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await waitForRequestSlot(signal);
                const resp = await fetch(url, signal ? { signal } : undefined);

                if (resp.status === 429) {
                    const retryAfterRaw = resp.headers.get('Retry-After');
                    const retryAfterSec = Number(retryAfterRaw);
                    const retryAfterMs = Number.isFinite(retryAfterSec)
                        ? Math.max(500, Math.floor(retryAfterSec * 1000))
                        : 1500;
                    throw new RateLimitError('Too many requests (HTTP 429)', retryAfterMs);
                }

                const data = await resp.json();
                if (data && data.error) {
                    const errText = String(data.error.error || 'API error');
                    if (/too many requests|rate limit|try again/i.test(errText)) {
                        throw new RateLimitError(errText, 1500 + attempt * 600);
                    }
                }

                recordRequestSuccess();

                return data;
            } catch (e) {
                if (e && e.name === 'AbortError') {
                    throw e;
                }
                lastError = e;

                if (attempt < 4) {
                    if (e && e.name === 'RateLimitError') {
                        recordRateLimitPressure(e.retryAfterMs || 0);
                        await sleep((e.retryAfterMs || 0) + 250 * attempt);
                    } else {
                        // Brief backoff reduces burst failures on transient network/API edges.
                        await sleep(350 * (attempt + 1));
                    }
                }
            }
        }

        throw lastError || new Error('Network/fetch error');
    }

    async function fetchTargetsWithConcurrency(ids, apiKey, options, onProgress) {
        const signal = options && options.signal ? options.signal : null;
        const forceRefresh = !!(options && options.forceRefresh);
        const pending = ids.slice();
        const workers = [];
        let done = 0;
        let fromCacheCount = 0;
        let fromNetworkCount = 0;
        let errorCount = 0;

        async function worker() {
            while (pending.length && !(signal && signal.aborted)) {
                const xid = pending.shift();
                if (!xid) continue;

                const cached = forceRefresh ? null : getCachedTargetData(xid);
                if (cached) {
                    if (cached.error) {
                        errorCount++;
                        setSnapshotError(xid, cached.error || 'API error');
                    } else {
                        updateTravelSnapshotFromApi(xid, cached);
                    }
                    done++;
                    fromCacheCount++;
                    if (onProgress) onProgress(done, ids.length, true);
                    continue;
                }

                try {
                    const data = await fetchTargetBasic(apiKey, xid, signal);
                    if (data && data.error) {
                        const errorObj = { error: data.error.error || 'API error' };
                        setCachedTargetData(xid, errorObj);
                        errorCount++;
                        setSnapshotError(xid, errorObj.error);
                    } else {
                        setCachedTargetData(xid, data);
                        updateTravelSnapshotFromApi(xid, data);
                    }
                    fromNetworkCount++;
                } catch (e) {
                    if (e && e.name === 'AbortError') {
                        return;
                    }
                    const isRateLimit =
                        e && (e.name === 'RateLimitError' || /too many requests|rate limit/i.test(String(e.message || '')));
                    const errorObj = {
                        error: isRateLimit ? 'Too many requests (rate limited)' : 'Network/fetch error'
                    };
                    if (isRateLimit) {
                        recordRateLimitPressure(e.retryAfterMs || 0);
                    }
                    errorCount++;
                    fromNetworkCount++;
                    setSnapshotError(xid, errorObj.error);
                }

                done++;
                if (onProgress) onProgress(done, ids.length, false);
            }
        }

        const maxConcurrency = getSettings().concurrency;
        const workerCount = Math.min(maxConcurrency, ids.length || 1);
        for (let i = 0; i < workerCount; i++) {
            workers.push(worker());
        }

        await Promise.all(workers);

        return {
            fromCacheCount,
            fromNetworkCount,
            errorCount
        };
    }

    function getCityKeyForSnap(snap) {
        const state = String(snap.state || '');
        const where = String(snap.where || '');

        if (/error/i.test(state)) {
            return 'Errors';
        }

        const isTravelling =
            !!snap.traveling ||
            /travel|flying/i.test(state) ||
            /flying to/i.test(where);

        if (isTravelling) return 'Travelling';

        if (
            snap.destination ||
            /abroad/i.test(where) ||
            /abroad/i.test(state)
        ) {
            return 'Abroad';
        }

        if (/hospital/i.test(snap.where) || /hospital/i.test(snap.state)) {
            return 'Hospital (Torn)';
        }
        if (/jail/i.test(snap.where) || /jail/i.test(snap.state)) {
            return 'Jail (Torn)';
        }

        if (/torn/i.test(snap.where)) return 'Torn';

        if (/abroad/i.test(snap.where) || /abroad/i.test(snap.state)) {
            return 'Abroad (unknown city)';
        }

        return 'Unknown';
    }

    // ---------- Unified War Board Modal ----------

    function openWarBoard() {
        injectWMStyles();

        const modal = document.createElement('div');
        modal.className = 'WM-panel';
        Object.assign(modal.style, {
            minWidth: '560px',
            maxWidth: '880px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
        });

        const headerRow = document.createElement('div');
        Object.assign(headerRow.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px'
        });

        const title = document.createElement('div');
        title.textContent = 'WM - Dashboard';
        title.className = 'WM-panel-title';

        const headerInfo = document.createElement('div');
        Object.assign(headerInfo.style, {
            fontSize: '10px',
            color: '#b2bec3',
            textAlign: 'right'
        });
        headerInfo.textContent = 'Import → Status → Click to attack/profile. All-in-one.';

        headerRow.appendChild(title);
        headerRow.appendChild(headerInfo);

        const statusLine = document.createElement('div');
        Object.assign(statusLine.style, {
            fontSize: '11px',
            minHeight: '16px',
            marginTop: '4px',
            marginBottom: '4px'
        });

        const summaryLine = document.createElement('div');
        Object.assign(summaryLine.style, {
            fontSize: '10px',
            minHeight: '14px',
            color: '#95a5a6',
            marginBottom: '4px'
        });
        summaryLine.textContent = 'Summary: waiting for refresh.';

        let currentFilterMode = getFilterMode();

        const body = document.createElement('div');
        body.className = 'WM-war-body';

        // ----- API row -----
        const apiRow = document.createElement('div');
        apiRow.className = 'WM-row';

        const apiLabel = document.createElement('div');
        apiLabel.className = 'WM-panel-small';
        apiLabel.textContent = 'API:';

        const apiStatus = document.createElement('div');
        apiStatus.className = 'WM-panel-small WM-row-grow';

        const apiBtn = createButton('Set / Test Key');
        const settingsBtn = createButton('Settings');

        appendChildren(apiRow, [apiLabel, apiStatus, apiBtn, settingsBtn]);

        // ----- Targets editor row -----
        const targetsInfo = document.createElement('div');
        targetsInfo.className = 'WM-panel-small';
        targetsInfo.innerHTML =
            'One XID per line. Comments after <span style="color:var(--wm-neon);">#</span> are ignored. ' +
            'Import Page pulls XIDs from the current Torn page (ignores your own).';

        const targetsTextarea = document.createElement('textarea');
        targetsTextarea.className = 'WM-targets-textarea';
        targetsTextarea.value = getTargetsText();

        // ----- Targets controls row -----
        const controlsRow = document.createElement('div');
        controlsRow.className = 'WM-row';

        const buttonsLeft = document.createElement('div');
        buttonsLeft.className = 'WM-row';
        buttonsLeft.style.gap = '6px';
        buttonsLeft.style.flex = '1 1 auto';

        const importBtn = createButton('Import Page');
        const warImportBtn = createButton('Import Faction War');
        const copyBtn = createButton('Copy XIDs');
        const saveBtn = createButton('Save List');
        const clearBtn = createButton('Clear');

        appendChildren(buttonsLeft, [importBtn, warImportBtn, copyBtn, saveBtn, clearBtn]);

        const refreshBtn = createButton('Refresh Status & Group', 'WM-small-btn-main');
        const forceRefreshBtn = createButton('Force Refresh');
        const cancelBtn = createButton('Cancel');
        cancelBtn.disabled = true;
        cancelBtn.style.opacity = '0.6';

        const closeBtn = createButton('Close');

        appendChildren(controlsRow, [buttonsLeft, refreshBtn, forceRefreshBtn, cancelBtn, closeBtn]);

        const filterRow = document.createElement('div');
        filterRow.className = 'WM-row';
        filterRow.style.flexWrap = 'wrap';

        const filterLabel = document.createElement('div');
        filterLabel.className = 'WM-panel-small';
        filterLabel.textContent = 'Filter:';

        const filterAllBtn = createButton('All');
        const filterLocalBtn = createButton('Local + Okay');
        const filterHospBtn = createButton('Hospital/Jail');
        const filterTravelBtn = createButton('Travel/Abroad');
        const filterErrorBtn = createButton('Errors');

        appendChildren(filterRow, [
            filterLabel,
            filterAllBtn,
            filterLocalBtn,
            filterHospBtn,
            filterTravelBtn,
            filterErrorBtn
        ]);

        // ----- Community / Support row -----
        const communityRow = document.createElement('div');
        communityRow.className = 'WM-row';
        communityRow.style.flexWrap = 'wrap';

        const communityLabel = document.createElement('div');
        communityLabel.className = 'WM-panel-small';
        communityLabel.textContent = 'Links:';

        const forumBtn = createButton('GitHub');
        const applyBtn = createButton('Apply to Faction');
        const donateBtn = createButton('Donate Xanax');
        const refBtn = createButton('Referral Profile');

        appendChildren(communityRow, [communityLabel, forumBtn, applyBtn, donateBtn, refBtn]);

        // ----- Results area -----
        const results = document.createElement('div');
        results.className = 'WM-results';

        body.appendChild(apiRow);
        body.appendChild(targetsInfo);
        body.appendChild(targetsTextarea);
        body.appendChild(controlsRow);
        body.appendChild(filterRow);
        body.appendChild(communityRow);
        body.appendChild(summaryLine);
        body.appendChild(results);

        modal.appendChild(headerRow);
        modal.appendChild(statusLine);
        modal.appendChild(body);

        setModalContent(modal);

        // ----- Wire up behavior -----

        function updateApiStatusText() {
            const key = getApiKey();
            const settings = getSettings();
            if (!key) {
                apiStatus.textContent = 'Not set.';
                apiStatus.style.color = '#e74c3c';
            } else {
                apiStatus.textContent =
                    'Set. C=' + settings.concurrency +
                    ' Cache=' + settings.cacheTtlSec + 's Auto=' + settings.autoRefreshSec + 's' +
                    ' War=' + (settings.autoWarImport ? 'on' : 'off') + '/' + settings.warCheckSec + 's' +
                    ' Neon=' + settings.neonColor;
                apiStatus.style.color = '#2ecc71';
            }
        }
        updateApiStatusText();

        function paintFilterButtons() {
            const buttons = [
                ['all', filterAllBtn],
                ['local', filterLocalBtn],
                ['hospital', filterHospBtn],
                ['travel', filterTravelBtn],
                ['error', filterErrorBtn]
            ];
            buttons.forEach(([mode, btn]) => {
                const active = currentFilterMode === mode;
                btn.style.borderColor = active ? '#2ecc71' : 'rgba(var(--wm-neon-rgb),0.33)';
                btn.style.color = active ? '#2ecc71' : 'var(--wm-neon)';
            });
        }

        function applyFilterMode(mode) {
            currentFilterMode = mode;
            setFilterMode(mode);
            paintFilterButtons();

            const ids = getTargetsArray();
            if (!ids.length) return;
            renderGroupedResults(ids, lastKnownMyCity || 'Unknown', results, {
                filterMode: currentFilterMode,
                summaryLine
            });
        }

        paintFilterButtons();

        apiBtn.addEventListener('click', () => {
            clearAutoRefreshTimer();
            openApiSubModal(() => {
                updateApiStatusText();
            });
        });

        settingsBtn.addEventListener('click', () => {
            clearAutoRefreshTimer();
            openSettingsSubModal(() => {
                openWarBoard();
            });
        });

        closeBtn.addEventListener('click', closeModal);

        clearBtn.addEventListener('click', () => {
            targetsTextarea.value = '';
            setTargetsText('');
            clearTargetCache();
            statusLine.textContent = 'Targets list cleared.';
            statusLine.style.color = '#f39c12';
        });

        saveBtn.addEventListener('click', () => {
            setTargetsText(targetsTextarea.value);
            clearTargetCache();
            const ids = getTargetsArray();
            statusLine.textContent =
                'Saved. Parsed ' + ids.length + ' unique target ID(s).';
            statusLine.style.color = '#2ecc71';
        });

        importBtn.addEventListener('click', async () => {
            const links = Array.from(
                document.querySelectorAll("a[href*='profiles.php?XID=']")
            );
            const found = new Set();

            links.forEach((a) => {
                const m = a.href.match(/XID=(\d+)/);
                if (m) found.add(m[1]);
            });

            if (!found.size) {
                statusLine.textContent =
                    'No profile IDs found on this page. Try your Torn Target List page.';
                statusLine.style.color = '#e74c3c';
                return;
            }

            const selfId = await getSelfId();
            const existingLines = targetsTextarea.value
                ? targetsTextarea.value.trim().split(/\r?\n/)
                : [];
            const existingIds = new Set(parseXidsFromText(existingLines.join('\n')));

            const combinedLines = existingLines.slice();
            let newCount = 0;
            let skippedSelf = 0;

            found.forEach((id) => {
                if (selfId && id === selfId) {
                    skippedSelf++;
                    return; // ignore your own XID
                }
                if (!existingIds.has(id)) {
                    combinedLines.push(id);
                    newCount++;
                }
            });

            targetsTextarea.value = combinedLines.join('\n');
            setTargetsText(targetsTextarea.value);
            clearTargetCache();
            const ids = getTargetsArray();

            statusLine.textContent =
                'Imported ' +
                found.size +
                ' ID(s) from page. ' +
                newCount +
                ' new. Total ' +
                ids.length +
                ' unique target(s).' +
                (skippedSelf ? ' (Skipped your own XID.)' : '');
            statusLine.style.color = '#2ecc71';
        });

        warImportBtn.addEventListener('click', async () => {
            statusLine.textContent = 'Checking faction war status…';
            statusLine.style.color = '#f1c40f';

            const result = await checkAndImportFactionWarTargets(targetsTextarea, statusLine, {
                force: true
            });

            if (!result.active) {
                statusLine.textContent =
                    'No active faction war targets found (or API lacks faction war permission).';
                statusLine.style.color = '#95a5a6';
            } else if (!result.added) {
                statusLine.textContent = 'Faction war checked. No new targets to add.';
                statusLine.style.color = '#95a5a6';
            }
        });

        copyBtn.addEventListener('click', () => {
            setTargetsText(targetsTextarea.value);
            const ids = getTargetsArray();
            if (!ids.length) {
                statusLine.textContent =
                    'No valid XIDs to copy. Check your list.';
                statusLine.style.color = '#e74c3c';
                return;
            }
            const payload = ids.join('\n');
            navigator.clipboard.writeText(payload)
                .then(() => {
                    statusLine.textContent =
                        'Copied ' + ids.length + ' XID(s) to clipboard.';
                    statusLine.style.color = '#2ecc71';
                })
                .catch(() => {
                    statusLine.textContent =
                        'Failed to copy XIDs (clipboard error).';
                    statusLine.style.color = '#e74c3c';
                });
        });

        function setRefreshUiRunning(running) {
            refreshBtn.disabled = running;
            refreshBtn.style.opacity = running ? '0.6' : '1';
            forceRefreshBtn.disabled = running;
            forceRefreshBtn.style.opacity = running ? '0.6' : '1';
            cancelBtn.disabled = !running;
            cancelBtn.style.opacity = running ? '1' : '0.6';
        }

        function startRefresh(forceRefresh) {
            setTargetsText(targetsTextarea.value);
            if (activeRefreshRun) {
                statusLine.textContent = 'Refresh already in progress…';
                statusLine.style.color = '#f39c12';
                return;
            }

            const controller = new AbortController();
            activeRefreshRun = { controller };
            setRefreshUiRunning(true);

            checkAndImportFactionWarTargets(targetsTextarea, statusLine, {
                force: false
            })
                .catch(() => ({ checked: false, active: false, added: 0 }))
                .then(() => refreshStatusesAndRender(statusLine, results, {
                    signal: controller.signal,
                    forceRefresh,
                    filterMode: currentFilterMode,
                    summaryLine
                }))
                .catch((e) => {
                    if (e && e.name === 'AbortError') {
                        statusLine.textContent = 'Refresh canceled.';
                        statusLine.style.color = '#f39c12';
                    } else {
                        console.warn('[WM] refresh error:', e);
                        statusLine.textContent = 'Refresh failed. Check console.';
                        statusLine.style.color = '#e74c3c';
                    }
                })
                .finally(() => {
                    activeRefreshRun = null;
                    setRefreshUiRunning(false);
                });
        }

        function configureAutoRefresh() {
            clearAutoRefreshTimer();
            const settings = getSettings();
            if (!settings.autoRefreshSec) {
                return;
            }

            autoRefreshTimerId = setInterval(() => {
                if (activeRefreshRun) return;
                if (!modalBackdrop || modalBackdrop.style.display !== 'flex') return;
                startRefresh(false);
            }, settings.autoRefreshSec * 1000);

            statusLine.textContent =
                'Auto-refresh enabled: every ' + settings.autoRefreshSec + 's.';
            statusLine.style.color = '#95a5a6';
        }

        refreshBtn.addEventListener('click', () => {
            startRefresh(false);
        });

        forceRefreshBtn.addEventListener('click', () => {
            startRefresh(true);
        });

        cancelBtn.addEventListener('click', () => {
            if (activeRefreshRun && activeRefreshRun.controller) {
                statusLine.textContent = 'Canceling refresh…';
                statusLine.style.color = '#f39c12';
                activeRefreshRun.controller.abort();
            }
        });

        filterAllBtn.addEventListener('click', () => applyFilterMode('all'));
        filterLocalBtn.addEventListener('click', () => applyFilterMode('local'));
        filterHospBtn.addEventListener('click', () => applyFilterMode('hospital'));
        filterTravelBtn.addEventListener('click', () => applyFilterMode('travel'));
        filterErrorBtn.addEventListener('click', () => applyFilterMode('error'));

        configureAutoRefresh();

        checkAndImportFactionWarTargets(targetsTextarea, statusLine, {
            force: false
        }).catch(() => {
            // Best effort only.
        });

        // --- Community buttons ---

        forumBtn.addEventListener('click', () => {
            safeOpen(LINKS.forumThread);
        });

        applyBtn.addEventListener('click', () => {
            safeOpen(LINKS.factionProfile);
        });

        donateBtn.addEventListener('click', () => {
            const xid = LINKS.donateXid;
            navigator.clipboard.writeText(xid)
                .then(() => {
                    statusLine.textContent =
                        'Copied my XID (' +
                        xid +
                        ') to clipboard. Paste as recipient on the item page.';
                    statusLine.style.color = '#2ecc71';
                    safeOpen(LINKS.itemPage);
                })
                .catch(() => {
                    statusLine.textContent =
                        'Clipboard blocked. My XID is ' +
                        xid +
                        '. Opening item page…';
                    statusLine.style.color = '#f39c12';
                    safeOpen(LINKS.itemPage);
                });
        });

        refBtn.addEventListener('click', () => {
            safeOpen(LINKS.referralProfile);
        });

        // If key already set and there are targets, auto-refresh once on open
        if (getApiKey() && getTargetsArray().length) {
            refreshStatusesAndRender(statusLine, results, {
                signal: null,
                forceRefresh: false,
                filterMode: currentFilterMode,
                summaryLine
            });
        }
    }

    // ---------- Mini API sub-modal (inside main board) ----------

    function openApiSubModal(onDone) {
        const existingKey = getApiKey();

        const sub = document.createElement('div');
        sub.className = 'WM-panel';
        Object.assign(sub.style, {
            minWidth: '320px',
            maxWidth: '420px'
        });

        const title = document.createElement('div');
        title.textContent = 'WM – API Key';
        title.className = 'WM-panel-title';
        Object.assign(title.style, {
            marginBottom: '8px'
        });

        const info = document.createElement('div');
        info.textContent =
            'Enter your Torn API key. Stored locally and used only for Torn API calls (user/basic).';
        info.className = 'WM-panel-small';
        Object.assign(info.style, { marginBottom: '8px' });

        const label = document.createElement('label');
        label.textContent = 'API key:';
        Object.assign(label.style, {
            fontSize: '11px',
            display: 'block',
            marginBottom: '4px'
        });

        const input = document.createElement('input');
        input.type = 'password';
        input.value = existingKey;
        input.placeholder = 'Paste your API key here';
        Object.assign(input.style, {
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 8px',
            borderRadius: '6px',
            border: '1px solid var(--wm-neon)',
            outline: 'none',
            marginBottom: '8px',
            background: '#000',
            color: '#f1f1f1',
            fontSize: '12px',
            boxShadow: '0 0 6px rgba(var(--wm-neon-rgb),0.4)'
        });

        const statusLine = document.createElement('div');
        Object.assign(statusLine.style, {
            fontSize: '11px',
            minHeight: '16px',
            marginBottom: '8px'
        });

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
        });

        const clearBtn = createButton('Clear');
        const testBtn = createButton('Test');
        const saveBtn = createButton('Save');
        const closeBtn = createButton('Close');

        appendChildren(btnRow, [clearBtn, testBtn, saveBtn, closeBtn]);

        clearBtn.addEventListener('click', () => {
            input.value = '';
            setApiKey('');
            cachedSelfId = null;
            statusLine.textContent = 'API key cleared.';
            statusLine.style.color = '#f39c12';
        });

        saveBtn.addEventListener('click', () => {
            const key = input.value.trim();
            if (!key) {
                statusLine.textContent = 'Please paste a valid API key.';
                statusLine.style.color = '#e74c3c';
                return;
            }
            setApiKey(key);
            cachedSelfId = null;
            statusLine.textContent = 'API key saved.';
            statusLine.style.color = '#2ecc71';
            if (onDone) onDone();
        });

        testBtn.addEventListener('click', async () => {
            const key = input.value.trim();
            if (!key) {
                statusLine.textContent = 'Enter an API key first.';
                statusLine.style.color = '#e74c3c';
                return;
            }

            statusLine.textContent = 'Testing API key…';
            statusLine.style.color = '#f1c40f';

            try {
                const url =
                    'https://api.torn.com/user/0?selections=basic&key=' +
                    encodeURIComponent(key);
                const resp = await fetch(url);
                const data = await resp.json();

                if (data && data.error) {
                    statusLine.textContent = 'Error: ' + data.error.error;
                    statusLine.style.color = '#e74c3c';
                } else {
                    console.log('[WM] API test success:', data);
                    statusLine.textContent = 'API key works.';
                    statusLine.style.color = '#2ecc71';
                }
            } catch (e) {
                statusLine.textContent =
                    'Network/Fetch error when testing key.';
                statusLine.style.color = '#e74c3c';
            }
        });

        closeBtn.addEventListener('click', () => {
            closeModal();
            // reopen main board after closing sub-modal
            openWarBoard();
        });

        sub.appendChild(title);
        sub.appendChild(info);
        sub.appendChild(label);
        sub.appendChild(input);
        sub.appendChild(statusLine);
        sub.appendChild(btnRow);

        setModalContent(sub);
    }

    function openSettingsSubModal(onDone) {
        const current = getSettings();

        const sub = document.createElement('div');
        sub.className = 'WM-panel';
        Object.assign(sub.style, {
            minWidth: '360px',
            maxWidth: '460px'
        });

        const title = document.createElement('div');
        title.textContent = 'WM – Settings';
        title.className = 'WM-panel-title';
        title.style.marginBottom = '8px';

        const info = document.createElement('div');
        info.className = 'WM-panel-small';
        info.textContent =
            'Tune request concurrency, cache TTL, and optional auto-refresh.';
        info.style.marginBottom = '10px';

        const fields = document.createElement('div');
        Object.assign(fields.style, {
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '8px',
            marginBottom: '8px'
        });

        function makeNumberField(labelText, value, placeholder) {
            const wrap = document.createElement('div');

            const label = document.createElement('label');
            label.textContent = labelText;
            label.className = 'WM-panel-small';
            label.style.display = 'block';
            label.style.marginBottom = '3px';

            const input = document.createElement('input');
            input.type = 'number';
            input.value = String(value);
            input.placeholder = placeholder;
            Object.assign(input.style, {
                width: '100%',
                boxSizing: 'border-box',
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid var(--wm-neon)',
                outline: 'none',
                background: '#000',
                color: '#f1f1f1',
                fontSize: '12px'
            });

            wrap.appendChild(label);
            wrap.appendChild(input);
            return { wrap, input };
        }

        const concurrencyField = makeNumberField(
            'Concurrency (1-12)',
            current.concurrency,
            '6'
        );
        const cacheField = makeNumberField(
            'Cache TTL seconds (5-600)',
            current.cacheTtlSec,
            '45'
        );
        const autoField = makeNumberField(
            'Auto-refresh seconds (0 disables, 5-600 recommended)',
            current.autoRefreshSec,
            '0'
        );
        const warCheckField = makeNumberField(
            'War check seconds (15-600)',
            current.warCheckSec,
            '45'
        );

        const warToggleWrap = document.createElement('div');
        const warToggleLabel = document.createElement('label');
        warToggleLabel.className = 'WM-panel-small';
        warToggleLabel.style.display = 'flex';
        warToggleLabel.style.alignItems = 'center';
        warToggleLabel.style.gap = '8px';

        const warToggleInput = document.createElement('input');
        warToggleInput.type = 'checkbox';
        warToggleInput.checked = !!current.autoWarImport;

        const warToggleText = document.createElement('span');
        warToggleText.textContent =
            'Auto-import targets from active faction war when checking/refreshing';

        const neonWrap = document.createElement('div');
        const neonLabel = document.createElement('label');
        neonLabel.className = 'WM-panel-small';
        neonLabel.textContent = 'Neon color';
        neonLabel.style.display = 'block';
        neonLabel.style.marginBottom = '3px';

        const neonInput = document.createElement('input');
        neonInput.type = 'color';
        neonInput.value = normalizeHexColor(current.neonColor, DEFAULT_SETTINGS.neonColor);
        Object.assign(neonInput.style, {
            width: '100%',
            height: '36px',
            boxSizing: 'border-box',
            borderRadius: '6px',
            border: '1px solid var(--wm-neon)',
            background: '#000'
        });

        neonWrap.appendChild(neonLabel);
        neonWrap.appendChild(neonInput);

        warToggleLabel.appendChild(warToggleInput);
        warToggleLabel.appendChild(warToggleText);
        warToggleWrap.appendChild(warToggleLabel);

        fields.appendChild(concurrencyField.wrap);
        fields.appendChild(cacheField.wrap);
        fields.appendChild(autoField.wrap);
        fields.appendChild(warCheckField.wrap);
        fields.appendChild(warToggleWrap);
        fields.appendChild(neonWrap);

        const statusLine = document.createElement('div');
        statusLine.style.fontSize = '11px';
        statusLine.style.minHeight = '16px';
        statusLine.style.marginBottom = '8px';

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
        });

        const defaultsBtn = createButton('Defaults');
        const saveBtn = createButton('Save');
        const closeBtn = createButton('Close');

        defaultsBtn.addEventListener('click', () => {
            concurrencyField.input.value = String(DEFAULT_SETTINGS.concurrency);
            cacheField.input.value = String(DEFAULT_SETTINGS.cacheTtlSec);
            autoField.input.value = String(DEFAULT_SETTINGS.autoRefreshSec);
            warCheckField.input.value = String(DEFAULT_SETTINGS.warCheckSec);
            warToggleInput.checked = !!DEFAULT_SETTINGS.autoWarImport;
            neonInput.value = DEFAULT_SETTINGS.neonColor;
            statusLine.textContent = 'Default values loaded.';
            statusLine.style.color = '#95a5a6';
        });

        saveBtn.addEventListener('click', () => {
            const next = setSettings({
                concurrency: Number(concurrencyField.input.value),
                cacheTtlSec: Number(cacheField.input.value),
                autoRefreshSec: Number(autoField.input.value),
                autoWarImport: warToggleInput.checked,
                warCheckSec: Number(warCheckField.input.value),
                neonColor: neonInput.value
            });

            statusLine.textContent =
                'Saved. Concurrency ' + next.concurrency +
                ', cache ' + next.cacheTtlSec + 's, auto-refresh ' + next.autoRefreshSec +
                's, war import ' + (next.autoWarImport ? 'on' : 'off') + '/' + next.warCheckSec +
                's, neon ' + next.neonColor + '.';
            statusLine.style.color = '#2ecc71';
            if (onDone) onDone();
        });

        closeBtn.addEventListener('click', () => {
            closeModal();
            openWarBoard();
        });

        appendChildren(btnRow, [defaultsBtn, saveBtn, closeBtn]);

        sub.appendChild(title);
        sub.appendChild(info);
        sub.appendChild(fields);
        sub.appendChild(statusLine);
        sub.appendChild(btnRow);

        setModalContent(sub);
    }

    // ---------- Refresh statuses + grouped render in one go ----------

    async function refreshStatusesAndRender(statusLine, resultsContainer, options) {
        const signal = options && options.signal ? options.signal : null;
        const forceRefresh = !!(options && options.forceRefresh);
        const filterMode = options && options.filterMode ? options.filterMode : 'all';
        const summaryLine = options && options.summaryLine ? options.summaryLine : null;

        const apiKey = getApiKey();
        if (!apiKey) {
            statusLine.textContent =
                'No API key set. Click "Set / Test Key" first.';
            statusLine.style.color = '#e74c3c';
            resultsContainer.innerHTML = '';
            if (summaryLine) summaryLine.textContent = 'Summary: no API key.';
            return;
        }

        const ids = getTargetsArray();
        if (!ids.length) {
            statusLine.textContent =
                'No targets configured. Import from page or add XIDs manually.';
            statusLine.style.color = '#e74c3c';
            resultsContainer.innerHTML = '';
            if (summaryLine) summaryLine.textContent = 'Summary: no targets.';
            return;
        }

        statusLine.textContent =
            'Fetching status for ' + ids.length + ' target(s)…';
        statusLine.style.color = '#f1c40f';
        resultsContainer.innerHTML = '';

        // clear old snapshot
        for (const k in targetTravelSnapshot) {
            if (Object.prototype.hasOwnProperty.call(targetTravelSnapshot, k)) {
                delete targetTravelSnapshot[k];
            }
        }

        if (signal && signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const { city: myCity } = await getSelfIdAndCity();
        lastKnownMyCity = myCity || 'Unknown';

        const fetchStats = await fetchTargetsWithConcurrency(ids, apiKey, {
            signal,
            forceRefresh
        }, (doneCount, totalCount, fromCache) => {
            statusLine.textContent =
                'Fetched ' + doneCount + ' / ' + totalCount + ' target(s)…' +
                (fromCache ? ' (cache)' : '');
        });

        if (signal && signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        // Build grouped view
        renderGroupedResults(ids, myCity, resultsContainer, {
            filterMode,
            summaryLine
        });

        statusLine.textContent =
            'Done. Fetched ' + ids.length + ' target(s). You are in: ' + myCity +
            '. Network: ' + fetchStats.fromNetworkCount + ', cache: ' + fetchStats.fromCacheCount +
            (forceRefresh ? ' (forced)' : '') + '.';
        statusLine.style.color = '#2ecc71';

        console.log('[WM] snapshot after refresh:', targetTravelSnapshot);
    }

    function renderGroupedResults(ids, myCity, container, options) {
        const filterMode = options && options.filterMode ? options.filterMode : 'all';
        const summaryLine = options && options.summaryLine ? options.summaryLine : null;
        const expandedState = getCityExpandedState();

        container.innerHTML = '';

        // construct entries in input list order, ignoring any stray snapshot keys
        const entries = [];
        ids.forEach((id) => {
            const snap = targetTravelSnapshot[id];
            if (snap) entries.push(snap);
        });
        if (!entries.length) {
            const msg = document.createElement('div');
            msg.className = 'WM-panel-small';
            msg.textContent = 'No entries to display.';
            msg.style.padding = '6px';
            container.appendChild(msg);
            if (summaryLine) {
                summaryLine.textContent = 'Summary: 0 target(s).';
            }
            return;
        }

        function includeByFilter(snap, cityKey) {
            const state = snap.state || '';
            const where = snap.where || '';
            const sameCity =
                cityKey === myCity ||
                (where && myCity && where.indexOf(myCity) !== -1);
            const flags = getSnapFlags(state, where, sameCity);

            if (filterMode === 'local') {
                return flags.isLocalOkay;
            }
            if (filterMode === 'hospital') {
                return flags.isHospOrJail;
            }
            if (filterMode === 'travel') {
                return flags.isTravel;
            }
            if (filterMode === 'error') {
                return flags.isError;
            }
            return true;
        }

        const grouped = {};
        entries.forEach((snap) => {
            const cityKey = getCityKeyForSnap(snap);
            if (!grouped[cityKey]) grouped[cityKey] = [];
            grouped[cityKey].push(snap);
        });

        const cityKeys = Object.keys(grouped).sort((a, b) => {
            if (a === myCity) return -1;
            if (b === myCity) return 1;
            return a.localeCompare(b);
        });

        let shownCount = 0;
        let localOkayCount = 0;
        let hospOrJailCount = 0;
        let travellingCount = 0;
        let abroadCount = 0;
        let errorCount = 0;

        cityKeys.forEach((cityKey) => {
            const snaps = grouped[cityKey];

            const header = document.createElement('div');
            header.className = 'WM-city-header';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'WM-city-name';
            nameSpan.textContent =
                cityKey + (cityKey === myCity ? '  (YOU)' : '');

            const countSpan = document.createElement('span');
            countSpan.className = 'WM-city-count';
            countSpan.textContent = snaps.length + ' target(s)';

            header.appendChild(nameSpan);
            header.appendChild(countSpan);

            const targetList = document.createElement('div');
            targetList.className = 'WM-target-list';

            let shownInGroup = 0;

            snaps.forEach((snap) => {
                const row = document.createElement('div');
                row.className = 'WM-target-row';

                const state = snap.state || 'Unknown';
                const where = snap.where || '';
                const desc = snap.description || '';
                const details = snap.details || '';
                const lifeText = formatLifeText(snap);
                const scoutEstimate = getExternalScoutEstimate(snap.xid);
                const sameCity =
                    cityKey === myCity ||
                    (where && myCity && where.indexOf(myCity) !== -1);
                const flags = getSnapFlags(state, where, sameCity);
                const isTravelling =
                    !!snap.traveling || /travel|flying/i.test(state) || /flying to/i.test(where);
                const isAbroad =
                    !isTravelling &&
                    (Boolean(snap.destination) || /abroad/i.test(where) || /abroad/i.test(state));
                const isOkay = /okay/i.test(state);

                if (!includeByFilter(snap, cityKey)) {
                    return;
                }

                shownInGroup++;
                shownCount++;
                if (flags.isLocalOkay) localOkayCount++;
                if (flags.isHospOrJail) hospOrJailCount++;
                if (isTravelling) travellingCount++;
                if (isAbroad) abroadCount++;
                if (flags.isError) errorCount++;

                // Color rule:
                // - red if hospital/jail anywhere
                // - green if local + "Okay"
                // - yellow if traveling/abroad
                // - grey otherwise
                row.style.borderLeftColor = getRowColor(flags);

                const link = document.createElement('a');
                if (sameCity && /okay/i.test(state)) {
                    // local & okay → attack
                    link.href =
                        'https://www.torn.com/loader.php?sid=attack&user2ID=' +
                        snap.xid;
                } else {
                    // otherwise profile
                    link.href =
                        'https://www.torn.com/profiles.php?XID=' + snap.xid;
                }
                link.target = '_blank';
                const hideStateInTitle = isOkay || flags.isHospOrJail || isTravelling || isAbroad;
                link.textContent =
                    (snap.name || '(unknown)') +
                    ' [' +
                    snap.xid +
                    ']' +
                    (hideStateInTitle ? '' : ' – ' + state);

                const extra = document.createElement('span');
                const detailParts = [];
                const pushDetail = (value) => {
                    const v = String(value || '').trim();
                    if (!v) return;
                    const already = detailParts.some((p) => p.toLowerCase() === v.toLowerCase());
                    if (!already) detailParts.push(v);
                };

                if (isOkay) {
                    if (lifeText) {
                        pushDetail('Life ' + lifeText);
                    }
                } else if (flags.isHospOrJail) {
                    if (desc && desc.toLowerCase() !== state.toLowerCase()) {
                        pushDetail(desc);
                    }
                    if (details) {
                        pushDetail(details);
                    }
                } else if (isTravelling || isAbroad) {
                    if (desc && desc.toLowerCase() !== state.toLowerCase()) {
                        pushDetail(desc);
                    }
                    if (details) {
                        pushDetail(details);
                    }
                } else {
                    pushDetail(where);
                    if (desc && desc.toLowerCase() !== state.toLowerCase()) {
                        pushDetail(desc);
                    }
                    if (details) {
                        pushDetail(details);
                    }
                }

                if (scoutEstimate) {
                    pushDetail('BS est ' + scoutEstimate);
                } else if (isOkay) {
                    pushDetail('BS est n/a');
                }

                if (detailParts.length) {
                    extra.textContent = '  |  ' + detailParts.join(' | ');
                }

                row.appendChild(link);
                if (detailParts.length) {
                    row.appendChild(extra);
                }

                targetList.appendChild(row);
            });

            if (!shownInGroup) {
                return;
            }

            countSpan.textContent = shownInGroup + ' target(s)';

            header.addEventListener('click', () => {
                const visible = targetList.style.display !== 'none';
                targetList.style.display = visible ? 'none' : 'block';
                expandedState[cityKey] = !visible;
                setCityExpandedState(expandedState);
            });

            if (Object.prototype.hasOwnProperty.call(expandedState, cityKey)) {
                targetList.style.display = expandedState[cityKey] ? 'block' : 'none';
            } else if (cityKey === myCity || /Hospital/.test(cityKey)) {
                // Default: open YOUR city and Hospital
                targetList.style.display = 'block';
            } else {
                targetList.style.display = 'none';
            }

            container.appendChild(header);
            container.appendChild(targetList);
        });

        if (!container.children.length) {
            const msg = document.createElement('div');
            msg.className = 'WM-panel-small';
            msg.textContent = 'No targets match current filter.';
            msg.style.padding = '6px';
            container.appendChild(msg);
        }

        if (summaryLine) {
            summaryLine.textContent =
                'Summary: showing ' + shownCount + ' / ' + entries.length +
                ' | local+okay: ' + localOkayCount +
                ' | hospital/jail: ' + hospOrJailCount +
                ' | travelling: ' + travellingCount +
                ' | abroad: ' + abroadCount +
                ' | errors: ' + errorCount +
                ' | filter: ' + filterMode + '.';
        }
    }

    // ---------- WM button ----------

    function createWMButton() {
        injectWMStyles();
        const settings = getSettings();
        applyNeonThemeVars(settings.neonColor);

        const container = document.createElement('div');
        container.id = 'WM-button-container';
        Object.assign(container.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '999999',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'flex-end'
        });

        const WMBtn = document.createElement('button');
        WMBtn.id = 'WM-button-main';
        WMBtn.textContent = '<3';
        WMBtn.className = 'WM-button-main';
        Object.assign(WMBtn.style, {
            padding: '10px 18px',
            borderRadius: '8px',
            border: '2px solid var(--wm-neon)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '700',
            letterSpacing: '1px',
            background: 'rgba(0, 0, 0, 0.85)',
            color: 'var(--wm-neon)',
            fontFamily: 'Consolas, monospace',
            boxShadow:
                '0 0 8px var(--wm-neon), 0 0 16px rgba(var(--wm-neon-rgb),0.4), inset 0 0 6px rgba(var(--wm-neon-rgb),0.3)',
            transition: '0.2s ease-in-out'
        });
        WMBtn.addEventListener('mouseenter', function () {
            WMBtn.style.transform = 'scale(1.08)';
            WMBtn.style.boxShadow =
                '0 0 12px var(--wm-neon), 0 0 24px rgba(var(--wm-neon-rgb),0.7), inset 0 0 10px rgba(var(--wm-neon-rgb),0.6)';
            WMBtn.style.borderColor = 'var(--wm-neon)';
        });
        WMBtn.addEventListener('mouseleave', function () {
            WMBtn.style.transform = 'scale(1.0)';
            WMBtn.style.boxShadow =
                '0 0 8px var(--wm-neon), 0 0 16px rgba(var(--wm-neon-rgb),0.4), inset 0 0 6px rgba(var(--wm-neon-rgb),0.3)';
            WMBtn.style.borderColor = 'var(--wm-neon)';
        });
        WMBtn.addEventListener('click', function () {
            const apiKey = getApiKey();
            if (!apiKey) {
                // First time: go straight to API sub-modal so user isn't confused
                openApiSubModal(() => {
                    openWarBoard();
                });
            } else {
                openWarBoard();
            }
        });

        container.appendChild(WMBtn);
        document.body.appendChild(container);
    }

    // ---------- Init ----------

    function init() {
        applyNeonThemeVars(getSettings().neonColor);
        if (
            document.readyState === 'complete' ||
            document.readyState === 'interactive'
        ) {
            createWMButton();
        } else {
            document.addEventListener('DOMContentLoaded', createWMButton);
        }
    }

    init();

})();
