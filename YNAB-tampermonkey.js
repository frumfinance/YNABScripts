// ==UserScript==
// @name         frum.finance YNAB Enhancements
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  A collection of additional features from https://frum.finance
// @author       https://frum.finance
// @match        https://app.ynab.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Utility function to wait for a specific element to appear
    const waitForElement = (selector, timeout = 10000) => {
        return new Promise((resolve, reject) => {
            const interval = 200;
            let timePassed = 0;

            const checkExist = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(checkExist);
                    resolve(element);
                } else if (timePassed >= timeout) {
                    clearInterval(checkExist);
                    reject(new Error('Element not found: ' + selector));
                }
                timePassed += interval;
            }, interval);
        });
    };

    // Function to export data to CSV
    const exportToCSV = (rows) => {
        const csvContent = "data:text/csv;charset=utf-8,"
            + rows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "ynab_categories_export.csv");
        document.body.appendChild(link);

        link.click();
        document.body.removeChild(link);
    };

    // Function to extract target details from the Target Inspector
    const getTargetDetailsFromInspector = () => {
        const targetInspector = document.querySelector('.target-inspector');
        if (targetInspector) {
            const targetBehavior = targetInspector.querySelector('.target-behavior')?.textContent.trim() || "N/A";
            const targetByDate = targetInspector.querySelector('.target-by-date')?.textContent.trim() || "";
            return `${targetBehavior} ${targetByDate}`.trim();
        }
        return "N/A";
    };

    // Function to extract YNAB budget data
    const extractData = async () => {
        const rows = [["Category Group", "Category", "Target Details"]];
        let currentGroupName = "N/A";
        const processedCategories = new Set();
        const groups = document.querySelectorAll(".budget-table-row");

        for (const group of groups) {
            if (group.classList.contains("is-master-category")) {
                currentGroupName = group.querySelector(".budget-table-cell-name button")?.textContent.trim() || "N/A";
            } else if (!group.classList.contains("is-master-category")) {
                const categoryName = group.querySelector(".budget-table-cell-name button")?.textContent.trim() || "N/A";
                const categoryId = group.dataset.entityId;

                if (processedCategories.has(categoryId)) {
                    continue;
                }

                // Click the category to populate the target inspector
                group.querySelector(".budget-table-cell-name button")?.click();
                processedCategories.add(categoryId);

                // Wait for the target inspector to load
                await new Promise(resolve => setTimeout(resolve, 5)); // Reduced delay for better performance

                // Extract target details from the inspector
                const targetDetails = getTargetDetailsFromInspector();

                // Enhanced logging to debug the extraction process
                console.log(`Group: '${currentGroupName}', Category: '${categoryName}', Target Details Found:`, targetDetails !== "N/A" ? "Yes" : "No");
                console.log(`Extracted target details for category '${categoryName}':`, targetDetails);

                rows.push([currentGroupName, categoryName, targetDetails]);
            }
        }

        exportToCSV(rows);
    };

    // Function to add a button to the page for CSV export
    const addExportButton = () => {
        const existingButton = document.getElementById('ynab-export-button');
        if (existingButton) return; // Avoid adding multiple buttons

        const button = document.createElement('button');
        button.id = 'ynab-export-button';
        button.innerText = "Export Categories to CSV";
        button.style.padding = "10px 15px";
        button.style.backgroundColor = "#0079c1";
        button.style.color = "white";
        button.style.border = "none";
        button.style.borderRadius = "5px";
        button.style.cursor = "pointer";
        button.onclick = () => {
            extractData();
        };

        // Add button to the budget toolbar instead of fixed position
        waitForElement("#ember48 > div.budget-table-header > div.budget-toolbar")
            .then(toolbar => {
                toolbar.appendChild(button);
            })
            .catch(err => console.error("Error adding button to toolbar:", err));
    };

    // Wait for the YNAB page content to load, then add the export button
    waitForElement(".budget-table-row.is-master-category")
        .then(() => addExportButton())
        .catch(err => console.error("Error:", err));
})();
