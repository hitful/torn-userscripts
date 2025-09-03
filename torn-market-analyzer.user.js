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
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const API_KEY = GM_getValue('torn_api_key', ''); // User needs to set this
    const BASE_URL = 'https://api.torn.com';

    // Create UI elements
    function createUI() {
        const container = document.createElement('div');
        container.id = 'torn-market-analyzer';
        container.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            z-index: 10000;
            background: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 5px;
            padding: 10px;
            max-width: 400px;
            display: none;
        `;

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
        toggleBtn.onclick = () => {
            container.style.display = container.style.display === 'none' ? 'block' : 'none';
        };

        const apiKeyInput = document.createElement('input');
        apiKeyInput.type = 'password';
        apiKeyInput.placeholder = 'Enter Torn API Key';
        apiKeyInput.value = API_KEY;
        apiKeyInput.onchange = () => GM_setValue('torn_api_key', apiKeyInput.value);

        const itemInput = document.createElement('input');
        itemInput.type = 'text';
        itemInput.placeholder = 'Item ID or Name';

        const analyzeBtn = document.createElement('button');
        analyzeBtn.textContent = 'Analyze';
        analyzeBtn.onclick = () => analyzeItem(itemInput.value);

        const resultsDiv = document.createElement('div');
        resultsDiv.id = 'analyzer-results';

        container.appendChild(apiKeyInput);
        container.appendChild(document.createElement('br'));
        container.appendChild(itemInput);
        container.appendChild(analyzeBtn);
        container.appendChild(document.createElement('br'));
        container.appendChild(resultsDiv);

        document.body.appendChild(toggleBtn);
        document.body.appendChild(container);
    }

    // Fetch item data from Torn API
    function fetchItemData(itemId) {
        return new Promise((resolve, reject) => {
            if (!API_KEY) {
                reject('API Key not set');
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: `${BASE_URL}/market/${itemId}?selections=items&key=${API_KEY}`,
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

    // Analyze item trends
    function analyzeItem(itemId) {
        const resultsDiv = document.getElementById('analyzer-results');
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
