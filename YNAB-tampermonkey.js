// ==UserScript==
// @name         frum.finance YNAB Enhancements
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  A collection of additional features from https://frum.finance
// @author       https://frum.finance
// @match        https://app.ynab.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Utility function to wait for a specific element to appear using MutationObserver
    const waitForElement = (selector, timeout = 10000) => {
        return new Promise((resolve, reject) => {
            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Element not found: ' + selector));
            }, timeout);
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

    // Function to split target details into separate parts
    const parseTargetDetails = (targetDetails) => {
        const match = targetDetails.match(/^([A-Za-z ]+?) (\d{1,3}(?:,\d{3})*(?:\.\d{2})?) (Each [A-Za-z]+)?(?: By (.+))?$/) ||
                      targetDetails.match(/^Have a Balance of (\d{1,3}(?:,\d{3})*(?:\.\d{2})?) By (.+)$/);
        if (match) {
            if (targetDetails.startsWith("Have a Balance of")) {
                return ["Have a Balance", match[1].replace(/,/g, ''), "N/A", match[2]];
            }
            return [match[1], match[2].replace(/,/g, ''), match[3] || "N/A", match[4] || "N/A"];
        }
        return ["N/A", "N/A", "N/A", "N/A"];
    };

    // Function to calculate the annual total for the goal
    const calculateAnnualTotal = (amount, frequency) => {
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount)) {
            return "N/A";
        }
        switch (frequency) {
            case 'Each Week':
                return formatCurrency(numericAmount * 52);
            case 'Each Month':
                return formatCurrency(numericAmount * 12);
            case 'Each Year':
                return formatCurrency(numericAmount);
            default:
                return "N/A";
        }
    };

    // Utility function to format currency consistently
    const formatCurrency = (amount) => {
        return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Function to add group total row
    const addGroupTotalRow = (rows, currentGroupName, groupTotals) => {
        if (currentGroupName !== "N/A" && groupTotals[currentGroupName]) {
            rows.push([currentGroupName, "TOTAL", "", "", "", "", `=SUM(G${groupTotals[currentGroupName].startRow}:G${rows.length})`]);
        }
    };

    // Function to extract YNAB budget data
    const extractData = async () => {
        const rows = [["Category Group", "Category", "Target Type", "Target Amount", "Target Frequency", "Target Due Date", "Annual Total"],
                      ["https://frum.finance", "Donate: https://frum.finance/donate", "", "", "", "", ""]];
        let currentGroupName = "N/A";
        const processedCategories = new Set();
        const groups = document.querySelectorAll(".budget-table-row");

        const groupTotals = {};

        for (const group of groups) {
            if (group.classList.contains("is-master-category")) {
                // Add the total for the previous group before starting a new one
                addGroupTotalRow(rows, currentGroupName, groupTotals);
                currentGroupName = group.querySelector(".budget-table-cell-name button")?.textContent.trim() || "N/A";
                rows.push([currentGroupName, "", "", "", "", "", ""]); // Add group header
                groupTotals[currentGroupName] = { startRow: rows.length + 1, total: 0 };
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
                const [targetType, targetAmount, targetFrequency, targetDueDate] = parseTargetDetails(targetDetails);
                const annualTotal = calculateAnnualTotal(targetAmount, targetFrequency);

                // Enhanced logging to debug the extraction process
                console.log(`Group: '${currentGroupName}', Category: '${categoryName}', Target Details:`, {
                    targetDetails,
                    targetType,
                    targetAmount,
                    targetFrequency,
                    targetDueDate,
                    annualTotal
                });

                // Add data to rows, ensuring category group is correctly captured
                rows.push([currentGroupName, categoryName, targetType, formatCurrency(parseFloat(targetAmount)), targetFrequency, targetDueDate, annualTotal]);
            }
        }

        // Add the total for the last group
        addGroupTotalRow(rows, currentGroupName, groupTotals);

        // Get rows with group totals for overall total calculation
        const groupTotalRows = rows.reduce((acc, row, index) => {
            if (row[1] === "TOTAL") acc.push(`G${index + 1}`);
            return acc;
        }, []);
        rows.push(["GRAND TOTAL", "TOTAL", "", "", "", "", `=SUM(${groupTotalRows.join(",")})`]);

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
        button.style.marginLeft = "10px"; // Added left padding
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
