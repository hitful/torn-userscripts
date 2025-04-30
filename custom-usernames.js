// ==UserScript==
// @name         Custom Usernames
// @namespace    https://github.com/hitful
// @version      1
// @description  Custom username font and custom color outlines for player names on honor bars. No API key required. Set your player ID manually for full reliability.
// @author       bape
// @match        https://www.torn.com/*
// @grant        none
// @downloadURL https://raw.githubusercontent.com/hitful/torn-userscripts/refs/heads/main/custom-usernames.js
// @updateURL https://raw.githubusercontent.com/hitful/torn-userscripts/refs/heads/main/custom-usernames.js
// ==/UserScript==

(function () {
    'use strict';

    let MY_PLAYER_ID = 'PLAYER_ID'; // ← Will be updated via settings
    const CONFIG_KEY = 'mlpn-config';

    const COLOR_OPTIONS = [
        { name: 'Black (Default)', value: '#000000' },
        { name: 'Red', value: '#ff4d4d' },
        { name: 'Blue', value: '#310AF5' },
        { name: 'Green', value: '#3B9932' },
        { name: 'Orange', value: '#ff9c40' },
        { name: 'Purple', value: '#c080ff' },
        { name: 'Yellow', value: '#f5d142' },
        { name: 'Pink', value: '#ff69b4' },
        { name: 'Teal', value: '#00d9c0' },
        { name: 'White', value: '#ffffff' },
        { name: 'Custom…', value: 'custom' }
    ];

    const FONT_OPTIONS = [
        { name: 'Manrope', value: 'Manrope' },
        { name: 'Roboto', value: 'Roboto' },
        { name: 'Open Sans', value: 'Open Sans' },
        { name: 'Lato', value: 'Lato' },
        { name: 'Montserrat', value: 'Montserrat' },
        { name: 'Poppins', value: 'Poppins' },
        { name: 'Source Sans Pro', value: 'Source Sans Pro' }
    ];

    const loadFonts = () => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?' + FONT_OPTIONS.map(f => `family=${f.value.replace(' ', '+')}:wght@700`).join('&') + '&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    };

    const injectStyles = () => {
        const style = document.createElement('style');
        style.textContent = COLOR_OPTIONS.filter(c => c.value !== 'custom').map(c => {
            const hex = c.value.replace('#', '');
            return `.mlpn-color-${hex} .custom-honor-text {
                text-shadow:
                    -1px -1px 0 ${c.value},
                     1px -1px 0 ${c.value},
                    -1px  1px 0 ${c.value},
                     1px  1px 0 ${c.value} !important;
            }`;
        }).join('\n') + `
            .custom-honor-text {
                font-family: 'Manrope', sans-serif !important;
                font-weight: 700 !important;
                color: white !important;
                text-transform: uppercase !important;
                letter-spacing: 0.5px !important;
                pointer-events: none !important;
                position: absolute !important;
                top: 50%;
                left: 0;
                transform: translateY(-50%);
                width: 100% !important;
                display: flex !important;
                align-items: center;
                justify-content: center;
                text-align: center !important;
                line-height: 1 !important;
                margin: 0 !important;
                padding: 0 !important;
                z-index: 10 !important;
            }

            .honor-text-svg {
                display: none !important;
            }

            .mlpn-panel {
                position: absolute;
                top: 50px;
                left: 50%;
                transform: translateX(-50%);
                background: #222;
                color: white;
                border: 1px solid #444;
                padding: 12px;
                z-index: 99999;
                font-size: 14px;
                border-radius: 6px;
                width: max-content;
            }

            .mlpn-panel label {
                display: block;
                margin-top: 10px;
            }

            .mlpn-button {
                background: #339CFF;
                color: white;
                border: none;
                padding: 6px 10px;
                font-weight: bold;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            }

            .mlpn-note {
                font-size: 12px;
                margin-top: 6px;
                color: #aaa;
            }

            .mlpn-input {
                width: 100%;
                padding: 5px;
                margin-top: 5px;A
                background: #333;
                color: white;
                border: 1px solid #555;
                border-radius: 4px;
            }

            .mlpn-select {
                width: 100%;
                padding: 5px;
                margin-top: 5px;
                background: #333;
                color: white;
                border: 1px solid #555;
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    };

    const getConfig = () => JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    const saveConfig = config => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

    const createColorDropdown = (id, selectedValue) => {
        const select = document.createElement('select');
        select.id = id;
        select.className = 'mlpn-select';
        COLOR_OPTIONS.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.value;
            opt.textContent = c.name;
            select.appendChild(opt);
        });
        select.value = COLOR_OPTIONS.some(c => c.value === selectedValue) ? selectedValue : 'custom';
        return select;
    };

    const createFontDropdown = (id, selectedValue) => {
        const select = document.createElement('select');
        select.id = id;
        select.className = 'mlpn-select';
        FONT_OPTIONS.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.value;
            opt.textContent = f.name;
            select.appendChild(opt);
        });
        select.value = FONT_OPTIONS.some(f => f.value === selectedValue) ? selectedValue : 'Manrope';
        return select;
    };

    const showSettingsPanel = (isOwn, playerId) => {
        const config = getConfig();
        const panel = document.createElement('div');
        panel.id = 'mlpn-panel';
        panel.className = 'mlpn-panel';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mlpn-button';
        closeBtn.textContent = 'Done';
        closeBtn.onclick = () => panel.remove();

        if (isOwn) {
            panel.innerHTML = `
                <label>Your Player ID:
                    <input id="mlpn-player-id" type="text" class="mlpn-input" value="${config.playerId || MY_PLAYER_ID}" placeholder="Enter your player ID" />
                </label>
                <label>Font Family:
                    <select id="mlpn-font-family" class="mlpn-select"></select>
                </label>
                <label>Font Size:
                    <input id="mlpn-font-size" type="number" class="mlpn-input" min="8" max="24" value="${config.fontSize || 12}" />
                </label>
                <label>Color for Your Name:</label>
            `;
            const fontDropdown = createFontDropdown('mlpn-font-family', config.fontFamily || 'Manrope');
            const dropdown = createColorDropdown('mlpn-my-color', config.myColor || '#000000');
            const customInput = document.createElement('input');
            customInput.id = 'mlpn-my-custom';
            customInput.className = 'mlpn-input';
            customInput.placeholder = '#hex';
            customInput.style.display = dropdown.value === 'custom' ? 'block' : 'none';
            customInput.value = config.myColor?.startsWith('#') ? config.myColor : '';

            const playerIdInput = panel.querySelector('#mlpn-player-id');
            playerIdInput.oninput = () => {
                config.playerId = playerIdInput.value.trim();
                MY_PLAYER_ID = config.playerId || 'PLAYER_ID';
                saveConfig(config);
            };

            fontDropdown.onchange = () => {
                config.fontFamily = fontDropdown.value;
                saveConfig(config);
                updateHonorTextFont();
            };

            dropdown.onchange = () => {
                customInput.style.display = dropdown.value === 'custom' ? 'block' : 'none';
                config.myColor = dropdown.value === 'custom' ? customInput.value : dropdown.value;
                saveConfig(config);
            };

            customInput.oninput = () => {
                config.myColor = customInput.value;
                saveConfig(config);
            };

            const fontInput = panel.querySelector('#mlpn-font-size');
            fontInput.oninput = () => {
                config.fontSize = parseInt(fontInput.value);
                saveConfig(config);
            };

            panel.appendChild(fontDropdown);
            panel.appendChild(dropdown);
            panel.appendChild(customInput);
        } else {
            panel.innerHTML = `<label>Assign a color to this player's name:</label>`;
            const dropdown = createColorDropdown('mlpn-other-color', config.players?.[playerId] || '#000000');
            const customInput = document.createElement('input');
            customInput.id = 'mlpn-other-custom';
            customInput.className = 'mlpn-input';
            customInput.placeholder = '#hex';
            customInput.style.display = dropdown.value === 'custom' ? 'block' : 'none';
            customInput.value = config.players?.[playerId]?.startsWith('#') ? config.players[playerId] : '';

            dropdown.onchange = () => {
                if (!config.players) config.players = {};
                customInput.style.display = dropdown.value === 'custom' ? 'block' : 'none';
                config.players[playerId] = dropdown.value === 'custom' ? customInput.value : dropdown.value;
                saveConfig(config);
            };

            customInput.oninput = () => {
                if (!config.players) config.players = {};
                config.players[playerId] = customInput.value;
                saveConfig(config);
            };

            panel.appendChild(dropdown);
            panel.appendChild(customInput);
        }

        const note = document.createElement('div');
        note.className = 'mlpn-note';
        note.textContent = 'Refresh the page to apply settings.';
        panel.appendChild(note);
        panel.appendChild(closeBtn);

        document.body.appendChild(panel);
    };

    const getProfileIdFromUrl = () => {
        const match = window.location.href.match(/profiles\.php\?XID=(\d+)/);
        return match ? match[1] : null;
    };

    const updateHonorTextFont = () => {
        const config = getConfig();
        const fontFamily = config.fontFamily || 'Manrope';
        document.querySelectorAll('.custom-honor-text').forEach(text => {
            text.style.fontFamily = `'${fontFamily}', sans-serif`;
        });
    };

    const applyHonorStyles = () => {
        const config = getConfig();
        const fontSize = parseInt(config.fontSize) || 12;
        const fontFamily = config.fontFamily || 'Manrope';
        const profileId = getProfileIdFromUrl();

        document.querySelectorAll('.honor-text-wrap').forEach(wrap => {
            if (wrap.querySelector('.custom-honor-text')) return;

            const anchor = wrap.closest('a[href*="XID="]');
            let playerId = null;

            if (anchor) {
                const match = anchor.href.match(/XID=(\d+)/);
                if (match) playerId = match[1];
            } else if (profileId) {
                playerId = profileId;
            }

            const text = wrap.getAttribute('data-title') || wrap.getAttribute('aria-label') || wrap.innerText || '';
            const cleaned = text.trim().toUpperCase();
            if (!cleaned) return;

            let color = '#000000';
            if (playerId === MY_PLAYER_ID && config.myColor) {
                color = config.myColor;
            } else if (config.players?.[playerId]) {
                color = config.players[playerId];
            }

            const colorClass = `mlpn-color-${color.replace('#', '')}`;
            wrap.classList.add(colorClass);

            if (fontSize > 12) wrap.style.height = `${fontSize + 6}px`;

            const div = document.createElement('div');
            div.className = 'custom-honor-text';
            div.style.fontSize = `${fontSize}px`;
            div.style.fontFamily = `'${fontFamily}', sans-serif`;
            div.textContent = cleaned;
            wrap.appendChild(div);
        });
    };

    const injectSettingsButton = (isSelfProfile, profileId) => {
        if (document.getElementById('mlpn-settings-btn')) return;

        const target = document.querySelector('.content-title');
        if (!target) return;

        const btn = document.createElement('button');
        btn.id = 'mlpn-settings-btn';
        btn.className = 'mlpn-button';
        btn.textContent = 'Custom Player Names';
        btn.onclick = () => showSettingsPanel(isSelfProfile, profileId);
        target.appendChild(btn);
    };

    const init = () => {
        const config = getConfig();
        MY_PLAYER_ID = config.playerId || MY_PLAYER_ID;

        const profileId = getProfileIdFromUrl();
        if (profileId) {
            injectSettingsButton(profileId === MY_PLAYER_ID, profileId);
        }

        applyHonorStyles();
        new MutationObserver(applyHonorStyles).observe(document.body, { childList: true, subtree: true });
    };

    loadFonts();
    injectStyles();
    init();
})();
