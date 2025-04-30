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

    const FONT_SIZE_OPTIONS = [
        { name: '8px', value: 8 },
        { name: '10px', value: 10 },
        { name: '12px', value: 12 },
        { name: '14px', value: 14 },
        { name: '16px', value: 16 },
        { name: '18px', value: 18 },
        { name: '20px', value: 20 },
        { name: '22px', value: 22 },
        { name: '24px', value: 24 }
    ];

    const loadFonts = () => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?' + FONT_OPTIONS.map(f => `family=${f.value.replace(' ', '+')}:wght@700`).join('&') + '&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        console.log('Fonts loaded');
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
                position: fixed;
                top: 50px;
                left: 50%;
                transform: translateX(-50%);
                background: #222;
                color: white;
                border: 1px solid #444;
                padding: 12px;
                z-index: 100000;
                font-size: 14px;
                border-radius: 6px;
                width: 250px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            }

            .mlpn-panel label {
                display: block;
                margin-top: 10px;
                font-weight: bold;
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
                width: 100%;
            }

            .mlpn-note {
                font-size: 12px;
                margin-top: 10px;
                color: #aaa;
                text-align: center;
            }

            .mlpn-input, .mlpn-select {
                width: 100%;
                padding: 5px;
                margin-top: 5px;
                background: #333;
                color: white;
                border: 1px solid #555;
                border-radius: 4px;
                box-sizing: border-box;
                font-size: 14px;
            }

            .mlpn-select {
                appearance: menulist;
                -webkit-appearance: menulist;
                -moz-appearance: menulist;
            }
        `;
        document.head.appendChild(style);
        console.log('Styles injected');
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

    const createFontSizeDropdown = (id, selectedValue) => {
        const select = document.createElement('select');
        select.id = id;
        select.className = 'mlpn-select';
        FONT_SIZE_OPTIONS.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.value;
            opt.textContent = s.name;
            select.appendChild(opt);
        });
        select.value = FONT_SIZE_OPTIONS.some(s => s.value === selectedValue) ? selectedValue : 12;
        return select;
    };

    const showSettingsPanel = (isOwn, playerId) => {
        console.log('Opening settings panel, isOwn:', isOwn, 'playerId:', playerId);
        const config = getConfig();
        const panel = document.createElement('div');
        panel.id = 'mlpn-panel';
        panel.className = 'mlpn-panel';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mlpn-button';
        closeBtn.textContent = 'Done';
        closeBtn.onclick = () => panel.remove();

        if (isOwn) {
            // Player ID Input
            const playerIdLabel = document.createElement('label');
            playerIdLabel.textContent = 'Your Player ID:';
            const playerIdInput = document.createElement('input');
            playerIdInput.id = 'mlpn-player-id';
            playerIdInput.className = 'mlpn-input';
            playerIdInput.type = 'text';
            playerIdInput.value = config.playerId || MY_PLAYER_ID;
            playerIdInput.placeholder = 'Enter your player ID';
            playerIdInput.oninput = () => {
                config.playerId = playerIdInput.value.trim();
                MY_PLAYER_ID = config.playerId || 'PLAYER_ID';
                saveConfig(config);
                console.log('Player ID updated:', MY_PLAYER_ID);
            };

            // Font Family Dropdown
            const fontLabel = document.createElement('label');
            fontLabel.textContent = 'Font Family:';
            const fontDropdown = createFontDropdown('mlpn-font-family', config.fontFamily || 'Manrope');
            fontDropdown.onchange = () => {
                config.fontFamily = fontDropdown.value;
                saveConfig(config);
                updateHonorTextFont();
                console.log('Font family updated:', config.fontFamily);
            };

            // Font Size Dropdown
            const fontSizeLabel = document.createElement('label');
            fontSizeLabel.textContent = 'Font Size:';
            const fontSizeDropdown = createFontSizeDropdown('mlpn-font-size', config.fontSize || 12);
            fontSizeDropdown.onchange = () => {
                config.fontSize = parseInt(fontSizeDropdown.value);
                saveConfig(config);
                updateHonorTextSize();
                console.log('Font size updated:', config.fontSize);
            };

            // Color Dropdown
            const colorLabel = document.createElement('label');
            colorLabel.textContent = 'Color for Your Name:';
            const colorDropdown = createColorDropdown('mlpn-my-color', config.myColor || '#000000');
            const customColorInput = document.createElement('input');
            customColorInput.id = 'mlpn-my-custom';
            customColorInput.className = 'mlpn-input';
            customColorInput.placeholder = '#hex';
            customColorInput.style.display = colorDropdown.value === 'custom' ? 'block' : 'none';
            customColorInput.value = config.myColor?.startsWith('#') ? config.myColor : '';
            colorDropdown.onchange = () => {
                customColorInput.style.display = colorDropdown.value === 'custom' ? 'block' : 'none';
                config.myColor = colorDropdown.value === 'custom' ? customColorInput.value : colorDropdown.value;
                saveConfig(config);
                console.log('Color updated:', config.myColor);
            };
            customColorInput.oninput = () => {
                config.myColor = customColorInput.value;
                saveConfig(config);
                console.log('Custom color updated:', config.myColor);
            };

            // Assemble panel
            panel.appendChild(playerIdLabel);
            panel.appendChild(playerIdInput);
            panel.appendChild(fontLabel);
            panel.appendChild(fontDropdown);
            panel.appendChild(fontSizeLabel);
            panel.appendChild(fontSizeDropdown);
            panel.appendChild(colorLabel);
            panel.appendChild(colorDropdown);
            panel.appendChild(customColorInput);
        } else {
            // Other player's color settings
            const colorLabel = document.createElement('label');
            colorLabel.textContent = "Assign a color to this player's name:";
            const colorDropdown = createColorDropdown('mlpn-other-color', config.players?.[playerId] || '#000000');
            const customColorInput = document.createElement('input');
            customColorInput.id = 'mlpn-other-custom';
            customColorInput.className = 'mlpn-input';
            customColorInput.placeholder = '#hex';
            customColorInput.style.display = colorDropdown.value === 'custom' ? 'block' : 'none';
            customColorInput.value = config.players?.[playerId]?.startsWith('#') ? config.players[playerId] : '';
            colorDropdown.onchange = () => {
                if (!config.players) config.players = {};
                customColorInput.style.display = colorDropdown.value === 'custom' ? 'block' : 'none';
                config.players[playerId] = colorDropdown.value === 'custom' ? customColorInput.value : colorDropdown.value;
                saveConfig(config);
                console.log('Other player color updated:', config.players[playerId]);
            };
            customColorInput.oninput = () => {
                if (!config.players) config.players = {};
                config.players[playerId] = customColorInput.value;
                saveConfig(config);
                console.log('Other player custom color updated:', config.players[playerId]);
            };

            panel.appendChild(colorLabel);
            panel.appendChild(colorDropdown);
            panel.appendChild(customColorInput);
        }

        const note = document.createElement('div');
        note.className = 'mlpn-note';
        note.textContent = 'Refresh the page to apply settings.';
        panel.appendChild(note);
        panel.appendChild(closeBtn);

        document.body.appendChild(panel);
        console.log('Settings panel appended to document.body');
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

    const updateHonorTextSize = () => {
        const config = getConfig();
        const fontSize = config.fontSize || 12;
        document.querySelectorAll('.custom-honor-text').forEach(text => {
            text.style.fontSize = `${fontSize}px`;
        });
        document.querySelectorAll('.honor-text-wrap').forEach(wrap => {
            wrap.style.height = fontSize > 12 ? `${fontSize + 6}px` : '';
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
        if (!target) {
            console.log('No .content-title found for settings button');
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'mlpn-settings-btn';
        btn.className = 'mlpn-button';
        btn.textContent = 'Custom Player Names';
        btn.onclick = () => showSettingsPanel(isSelfProfile, profileId);
        target.appendChild(btn);
        console.log('Settings button injected');
    };

    const init = () => {
        console.log('Script initializing...');
        const config = getConfig();
        MY_PLAYER_ID = config.playerId || MY_PLAYER_ID;

        const profileId = getProfileIdFromUrl();
        if (profileId) {
            injectSettingsButton(profileId === MY_PLAYER_ID, profileId);
        } else {
            console.log('No profile ID found in URL');
        }

        applyHonorStyles();
        new MutationObserver(applyHonorStyles).observe(document.body, { childList: true, subtree: true });
        console.log('MutationObserver set up');
    };

    loadFonts();
    injectStyles();
    init();
})();
