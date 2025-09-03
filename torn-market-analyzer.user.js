// ==UserScript==
// @name         Torn Item Market Trend Analyzer
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Analyzes Torn item market trends and predicts undervalued items
// @author       You
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdn.jsdelivr.net/npm/chart.js
// @require      https://cdn.jsdelivr.net/npm/regression@2.0.1/dist/regression.min.js
// @updateURL    https://raw.githubusercontent.com/hitful/torn-userscripts/main/torn-market-analyzer.user.js
// @downloadURL  https://raw.githubusercontent.com/hitful/torn-userscripts/main/torn-market-analyzer.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const BASE_URL = 'https://api.torn.com';

    // Create UI elements
    function createUI() {
        // Modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'torn-analyzer-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
            display: none;
            justify-content: center;
            align-items: center;
        `;

        // Modal content
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 20px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            position: relative;
        `;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
        `;
        closeBtn.onclick = () => overlay.style.display = 'none';

        // Tabs
        const tabs = document.createElement('div');
        tabs.style.cssText = 'display: flex; margin-bottom: 20px;';

        const tabButtons = ['Settings', 'Item Analyzer', 'Stock Analyzer'];
        const tabContents = {};

        tabButtons.forEach((tabName, index) => {
            const tabBtn = document.createElement('button');
            tabBtn.textContent = tabName;
            tabBtn.style.cssText = `
                flex: 1;
                padding: 10px;
                background: ${index === 0 ? '#007bff' : '#f0f0f0'};
                color: ${index === 0 ? 'white' : 'black'};
                border: none;
                cursor: pointer;
            `;
            tabBtn.onclick = () => switchTab(index);
            tabs.appendChild(tabBtn);

            const content = document.createElement('div');
            content.style.display = index === 0 ? 'block' : 'none';
            tabContents[tabName] = content;
        });

        function switchTab(activeIndex) {
            tabButtons.forEach((_, i) => {
                tabs.children[i].style.background = i === activeIndex ? '#007bff' : '#f0f0f0';
                tabs.children[i].style.color = i === activeIndex ? 'white' : 'black';
                tabContents[tabButtons[i]].style.display = i === activeIndex ? 'block' : 'none';
            });
        }

        // Settings tab
        const settingsContent = tabContents['Settings'];
        const apiKeyInput = document.createElement('input');
        apiKeyInput.type = 'password';
        apiKeyInput.placeholder = 'Enter Torn API Key';
        apiKeyInput.value = GM_getValue('torn_api_key', '');
        apiKeyInput.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 10px;';
        apiKeyInput.onchange = () => GM_setValue('torn_api_key', apiKeyInput.value);

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save API Key';
        saveBtn.onclick = () => alert('API Key saved!');
        settingsContent.appendChild(apiKeyInput);
        settingsContent.appendChild(saveBtn);

        // Item Analyzer tab
        const itemContent = tabContents['Item Analyzer'];
        const scanItemsBtn = document.createElement('button');
        scanItemsBtn.textContent = 'Scan Popular Items for Profits';
        scanItemsBtn.onclick = () => scanProfitableItems();

        const itemResultsDiv = document.createElement('div');
        itemResultsDiv.id = 'item-analyzer-results';

        itemContent.appendChild(scanItemsBtn);
        itemContent.appendChild(itemResultsDiv);

        // Stock Analyzer tab
        const stockContent = tabContents['Stock Analyzer'];
        const scanStocksBtn = document.createElement('button');
        scanStocksBtn.textContent = 'Scan Stocks for Profits';
        scanStocksBtn.onclick = () => scanProfitableStocks();

        const stockResultsDiv = document.createElement('div');
        stockResultsDiv.id = 'stock-analyzer-results';

        stockContent.appendChild(scanStocksBtn);
        stockContent.appendChild(stockResultsDiv);

        // Main toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = 'Market Analyzer';
        toggleBtn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10001;
            background: #007bff;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
        `;
        toggleBtn.onclick = () => overlay.style.display = 'flex';

        modal.appendChild(closeBtn);
        modal.appendChild(tabs);
        Object.values(tabContents).forEach(content => modal.appendChild(content));
        overlay.appendChild(modal);
        document.body.appendChild(toggleBtn);
        document.body.appendChild(overlay);
    }

    // Fetch item data from Torn API
    function fetchItemData(itemId) {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('torn_api_key', '');
            if (!apiKey) {
                reject('API Key not set');
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: `${BASE_URL}/market/${itemId}?selections=items&key=${apiKey}`,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (e) {
                        reject('Failed to parse API response');
                    }
                },
                onerror: () => reject('API request failed')
            });
        });
    }

    // Fetch stock data from Torn API
    function fetchStockData(stockId) {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('torn_api_key', '');
            if (!apiKey) {
                reject('API Key not set');
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: `${BASE_URL}/torn/?selections=stocks&key=${apiKey}`,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.stocks && data.stocks[stockId]) {
                            resolve(data.stocks[stockId]);
                        } else {
                            reject('Stock not found');
                        }
                    } catch (e) {
                        reject('Failed to parse API response');
                    }
                },
                onerror: () => reject('API request failed')
            });
        });
    }

    // Analyze stock trends
    function analyzeStock(stockId) {
        const resultsDiv = document.getElementById('stock-analyzer-results');
        resultsDiv.innerHTML = 'Loading...';

        fetchStockData(stockId).then(stock => {
            // Assuming stock has price history, but Torn API might not have historical prices for stocks
            // For now, just show current data
            resultsDiv.innerHTML = `
                <h3>${stock.name}</h3>
                <p>Current Price: $${stock.current_price}</p>
                <p>Market Cap: $${stock.market_cap.toLocaleString()}</p>
                <p>Available Shares: ${stock.available_shares.toLocaleString()}</p>
                <p>Total Shares: ${stock.total_shares.toLocaleString()}</p>
                <p>Requirement: ${stock.requirement}</p>
            `;
            // Note: Torn API for stocks doesn't provide historical prices, so limited analysis
        }).catch(error => {
            resultsDiv.innerHTML = `Error: ${error}`;
        });
    }

    // Scan profitable stocks
    async function scanProfitableStocks() {
        const resultsDiv = document.getElementById('stock-analyzer-results');
        resultsDiv.innerHTML = 'Scanning stocks...';

        try {
            const apiKey = GM_getValue('torn_api_key', '');
            if (!apiKey) {
                resultsDiv.innerHTML = 'API Key not set';
                return;
            }

            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${BASE_URL}/torn/?selections=stocks&key=${apiKey}`,
                    onload: (response) => resolve(response),
                    onerror: () => reject('API request failed')
                });
            });

            const data = JSON.parse(response.responseText);
            if (!data.stocks) {
                resultsDiv.innerHTML = 'No stock data available';
                return;
            }

            const stocks = Object.values(data.stocks);
            // Filter stocks with available shares > 0, sort by current_price ascending (potential buys)
            const profitableStocks = stocks
                .filter(stock => stock.available_shares > 0)
                .sort((a, b) => a.current_price - b.current_price)
                .slice(0, 20); // Top 20 cheapest with available shares

            if (profitableStocks.length === 0) {
                resultsDiv.innerHTML = 'No profitable stocks found.';
                return;
            }

            let html = '<h3>Potentially Profitable Stocks (Low Price, Available Shares)</h3><table style="width:100%; border-collapse:collapse;"><tr><th style="border:1px solid #ddd; padding:8px;">Stock</th><th style="border:1px solid #ddd; padding:8px;">Current Price</th><th style="border:1px solid #ddd; padding:8px;">Available Shares</th><th style="border:1px solid #ddd; padding:8px;">Market Cap</th></tr>';
            profitableStocks.forEach(stock => {
                html += `<tr><td style="border:1px solid #ddd; padding:8px;">${stock.name}</td><td style="border:1px solid #ddd; padding:8px;">$${stock.current_price}</td><td style="border:1px solid #ddd; padding:8px;">${stock.available_shares.toLocaleString()}</td><td style="border:1px solid #ddd; padding:8px;">$${stock.market_cap.toLocaleString()}</td></tr>`;
            });
            html += '</table>';
            resultsDiv.innerHTML = html;
        } catch (error) {
            resultsDiv.innerHTML = `Error: ${error}`;
        }
    }

    // Scan profitable items
    async function scanProfitableItems() {
        const resultsDiv = document.getElementById('item-analyzer-results');
        resultsDiv.innerHTML = 'Scanning popular items...';

        // List of popular item IDs (can be expanded)
        const popularItems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // Morphine, FAK, etc.

        const profitableItems = [];

        for (const itemId of popularItems) {
            try {
                const data = await fetchItemData(itemId);
                if (data.items && data.items[itemId]) {
                    const item = data.items[itemId];
                    const prices = item.marketdata ? item.marketdata.prices : [];
                    if (prices.length > 0) {
                        const currentPrice = prices[prices.length - 1];
                        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
                        const undervalued = currentPrice < avgPrice * 0.95;
                        if (undervalued) {
                            profitableItems.push({
                                name: item.name,
                                currentPrice,
                                avgPrice,
                                potentialProfit: avgPrice - currentPrice
                            });
                        }
                    }
                }
            } catch (e) {
                console.log(`Error fetching item ${itemId}: ${e}`);
            }
        }

        // Sort by potential profit descending
        profitableItems.sort((a, b) => b.potentialProfit - a.potentialProfit);

        if (profitableItems.length === 0) {
            resultsDiv.innerHTML = 'No profitable items found in popular list.';
            return;
        }

        let html = '<h3>Potentially Profitable Items</h3><table style="width:100%; border-collapse:collapse;"><tr><th style="border:1px solid #ddd; padding:8px;">Item</th><th style="border:1px solid #ddd; padding:8px;">Current Price</th><th style="border:1px solid #ddd; padding:8px;">Avg Price</th><th style="border:1px solid #ddd; padding:8px;">Potential Profit</th></tr>';
        profitableItems.forEach(item => {
            html += `<tr><td style="border:1px solid #ddd; padding:8px;">${item.name}</td><td style="border:1px solid #ddd; padding:8px;">$${item.currentPrice.toLocaleString()}</td><td style="border:1px solid #ddd; padding:8px;">$${item.avgPrice.toFixed(2)}</td><td style="border:1px solid #ddd; padding:8px;">$${item.potentialProfit.toFixed(2)}</td></tr>`;
        });
        html += '</table>';
        resultsDiv.innerHTML = html;
    }

    // Analyze item trends
    function analyzeItem(itemId) {
        const resultsDiv = document.getElementById('item-analyzer-results');
        resultsDiv.innerHTML = 'Loading...';

        fetchItemData(itemId).then(data => {
            if (!data.items || !data.items[itemId]) {
                resultsDiv.innerHTML = 'Item not found';
                return;
            }

            const item = data.items[itemId];
            const prices = item.marketdata ? item.marketdata.prices : [];

            if (prices.length === 0) {
                resultsDiv.innerHTML = 'No market data available';
                return;
            }

            // Simple trend analysis
            const currentPrice = prices[prices.length - 1];
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            const trend = currentPrice > avgPrice ? 'Increasing' : 'Decreasing';

            // Simple prediction using linear regression
            const regressionData = prices.map((price, index) => [index, price]);
            const result = regression.linear(regressionData);
            const slope = result.equation[0];
            const predictedNext = result.equation[1] + slope * prices.length;

            // Create chart
            const ctx = document.createElement('canvas');
            ctx.width = 350;
            ctx.height = 200;

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: prices.map((_, i) => i),
                    datasets: [{
                        label: 'Price',
                        data: prices,
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: false,
                    scales: {
                        y: {
                            beginAtZero: false
                        }
                    }
                }
            });

            resultsDiv.innerHTML = `
                <h3>${item.name}</h3>
                <p>Current Price: $${currentPrice.toLocaleString()}</p>
                <p>Average Price: $${avgPrice.toFixed(2)}</p>
                <p>Trend: ${trend}</p>
                <p>Predicted Next Price: $${predictedNext.toFixed(2)}</p>
                <p>Undervalued: ${currentPrice < avgPrice * 0.95 ? 'Yes' : 'No'}</p>
            `;
            resultsDiv.appendChild(ctx);
        }).catch(error => {
            resultsDiv.innerHTML = `Error: ${error}`;
        });
    }

    // Initialize
    createUI();
})();
