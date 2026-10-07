// ==UserScript==
// @name         Torn Inventory Market Link
// @namespace    https://github.com/hitful/torn-userscripts
// @version      1.0
// @description  Adds a market icon beside each item in your inventory. Click it to open that item's Item Market page.
// @author       hit
// @license      MIT
// @match        https://www.torn.com/item.php*
// @match        https://torn.com/item.php*
// @run-at       document-end
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/hitful/torn-userscripts/refs/heads/main/torn-inventory-market.js
// @updateURL    https://raw.githubusercontent.com/hitful/torn-userscripts/refs/heads/main/torn-inventory-market.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.__tornInventoryMarketLink) return;
    window.__tornInventoryMarketLink = true;

    const LINK_CLASS = 'timl-market';
    const STYLE_ID = 'timl-market-style';

    const ICON_SVG = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
        '<circle cx="11" cy="11" r="7"></circle>',
        '<line x1="16.5" y1="16.5" x2="21" y2="21"></line>',
        '</svg>'
    ].join('');

    const NAME_SELECTORS = [
        '.name-wrap > .name',
        '.title-wrap > .name',
        '.name-wrap > .t-overflow',
        '.title-wrap .name-wrap > .t-overflow',
        '.name-wrap .name',
        '.title-wrap .name'
    ];

    function marketUrl(itemId, itemName) {
        let url = 'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=' + encodeURIComponent(itemId);
        if (itemName) url += '&itemName=' + encodeURIComponent(itemName);
        return url;
    }

    function cleanName(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .replace(/^x\d+\s+/i, '')
            .trim();
    }

    function itemIdFrom(row) {
        const raw = row.getAttribute('data-item') || row.getAttribute('data-itemid') || '';
        if (/^\d+$/.test(raw) && raw !== '0') return raw;

        const image = row.querySelector('img[src*="/images/items/"]');
        const src = image ? (image.getAttribute('src') || '') : '';
        const match = src.match(/\/images\/items\/(\d+)\//);
        return match ? match[1] : '';
    }

    function isInventoryRow(row) {
        if (!row || row.nodeType !== 1) return false;
        if (row.closest('.view-item-info, #sidebar, #topHeader, #chatRoot, #chat')) return false;
        if (row.parentElement && row.parentElement.closest('[data-item]')) return false;
        return Boolean(itemIdFrom(row));
    }

    function findNameElement(row) {
        for (const selector of NAME_SELECTORS) {
            const nodes = row.querySelectorAll(selector);
            for (const el of nodes) {
                if (el.closest('.view-item-info')) continue;
                if (el.classList.contains('qty') || el.classList.contains('item-amount')) continue;
                if (el.classList.contains(LINK_CLASS)) continue;
                return el;
            }
        }

        const wraps = row.querySelectorAll('.name-wrap, .title-wrap');
        for (const wrap of wraps) {
            if (!wrap.closest('.view-item-info')) return wrap;
        }
        return null;
    }

    function itemNameFrom(row, nameEl) {
        const fromSort = cleanName(row.getAttribute('data-sort'));
        if (fromSort) return fromSort;

        if (!nameEl || nameEl.classList.contains('name-wrap') || nameEl.classList.contains('title-wrap')) {
            const named = nameEl && nameEl.querySelector('.name, .t-overflow');
            return cleanName(named ? named.textContent : '');
        }

        return cleanName(nameEl.textContent);
    }

    function stopRowActivation(event) {
        event.stopPropagation();
    }

    function decorate(row) {
        if (row.querySelector(':scope .' + LINK_CLASS)) return;

        const itemId = itemIdFrom(row);
        const nameEl = findNameElement(row);
        if (!itemId || !nameEl) return;

        const itemName = itemNameFrom(row, nameEl);
        const label = itemName ? 'Open the item market for ' + itemName : 'Open the item market';

        const link = document.createElement('a');
        link.className = LINK_CLASS;
        link.href = marketUrl(itemId, itemName);
        link.title = label;
        link.setAttribute('aria-label', label);
        link.dataset.itemId = itemId;
        link.draggable = false;
        link.innerHTML = ICON_SVG;

        ['pointerdown', 'mousedown', 'mouseup', 'click', 'auxclick', 'dragstart'].forEach((type) => {
            link.addEventListener(type, stopRowActivation, true);
        });

        if (nameEl.classList.contains('name-wrap') || nameEl.classList.contains('title-wrap')) {
            nameEl.appendChild(link);
        } else {
            nameEl.insertAdjacentElement('afterend', link);
        }
    }

    function scan() {
        const rows = document.querySelectorAll('[data-item]');
        for (const row of rows) {
            if (!isInventoryRow(row)) continue;
            decorate(row);
        }
    }

    function addStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            'a.' + LINK_CLASS + ' {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  width: 16px;',
            '  height: 16px;',
            '  margin: 0 0 0 6px;',
            '  padding: 0;',
            '  vertical-align: -2px;',
            '  flex: 0 0 auto;',
            '  color: inherit;',
            '  opacity: 0.7;',
            '  text-decoration: none;',
            '  cursor: pointer;',
            '  position: relative;',
            '  z-index: 2;',
            '  border-radius: 3px;',
            '}',
            'a.' + LINK_CLASS + ':hover,',
            'a.' + LINK_CLASS + ':focus-visible {',
            '  opacity: 1;',
            '  color: #2f80ed;',
            '  background: rgba(47, 128, 237, 0.16);',
            '  outline: none;',
            '}',
            'a.' + LINK_CLASS + ' svg {',
            '  width: 13px;',
            '  height: 13px;',
            '  display: block;',
            '  pointer-events: none;',
            '}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
    }

    let scheduled = false;

    function scheduleScan() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            scan();
        });
    }

    function start() {
        addStyles();
        scan();

        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
