
    // ==UserScript==
    // @name         U-Haul Payment Reminder Copier (Multi-Message Dropdown)
    // @namespace    http://tampermonkey.net/
    // @version      2.1
    // @description  Adds a dropdown copy button for U-Haul payment reminders on webselfstorage.com with multiple message options
    // @author       You
    // @match        https://webselfstorage.com/*
    // @grant        GM_setClipboard
    // @grant        none
    // @run-at       document-end
    // @updateURL    https://your-server.com/path/to/Storage.user.js
    // @downloadURL  https://your-server.com/path/to/Storage.user.js
    // ==/UserScript==

    // --- Autopay Failure Detection (Worksheet Parsing & Storage) ---
    // When the collection worksheet is loaded, parse all customers and store their autopay failure status in chrome.storage.local
    // When a customer profile is loaded, check storage for their status
    // Clear storage when a new worksheet is loaded

    // Call this on the worksheet page to parse and store autopay failures by contract number
    function parseAndStoreAutopayFailuresFromWorksheet() {
        if (!/CollectionWorksheet|Autopay/.test(window.location.href) && !document.querySelector('.management-report')) return;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove('uhAutopayFailures');
        } else {
            localStorage.removeItem('uhAutopayFailures');
        }
        // Parse the DOM for contract numbers and autopay failures
        const rows = document.querySelectorAll('table.table.report tbody tr');
        let currentContract = null;
        let failures = {};
        rows.forEach(row => {
            const tds = row.querySelectorAll('td');
            if (tds.length) {
                // Detect contract number row: look for a cell with a value like '875067-105749'
                for (let td of tds) {
                    let match = td.textContent.match(/(\d{5,})-(\d{5,})/);
                    if (match) {
                        // Use the part after the dash as the contract number
                        currentContract = match[2];
                        break;
                    }
                }
                // Detect (AutoPayments User) row: any cell contains that text
                if (currentContract) {
                    for (let td of tds) {
                        if (td.textContent.includes('(AutoPayments User)')) {
                            failures[currentContract] = true;
                            break;
                        }
                    }
                }
            }
        });
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ uhAutopayFailures: failures }, function() {
                // No alert or contract display needed anymore
            });
        } else {
            localStorage.setItem('uhAutopayFailures', JSON.stringify(failures));
            // No alert or contract display needed anymore
        }
    }

    // Call this on the customer profile page to check for autopay failure by contract number
    function getContractNumberFromPage() {
        // Try to find contract number in the DOM (Account Details panel)
        const accountPanel = document.querySelector('#overview__accountDetails dl');
        if (accountPanel) {
            const dts = accountPanel.querySelectorAll('dt');
            for (let i = 0; i < dts.length; i++) {
                if (dts[i].textContent.trim().toLowerCase() === 'contract number:') {
                    const dd = dts[i].nextElementSibling;
                    if (dd && dd.tagName.toLowerCase() === 'dd') {
                        // Extract the part after the dash if present, else just the digits
                        let text = dd.textContent.trim();
                        let match = text.match(/\d{5,}-\d{5,}/);
                        if (match) {
                            // Use the part after the dash, strip leading zeros
                            return match[0].split('-')[1].replace(/^0+/, '');
                        } else {
                            // Fallback: just get the first 5+ digit number, strip leading zeros
                            let match2 = text.match(/(\d{5,})/);
                            if (match2) return match2[1].replace(/^0+/, '');
                        }
                    }
                }
            }
        }
        return null;
    }

    function checkAutopayFailure(customerName, callback) {
        // Use contract number for matching
        const contractNumber = getContractNumberFromPage();
        if (!contractNumber) { callback(false); return; }
        function finish(failures) {
            callback(!!(failures && failures[contractNumber]));
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['uhAutopayFailures'], function(result) {
                finish(result.uhAutopayFailures || {});
            });
        } else {
            try {
                const failures = JSON.parse(localStorage.getItem('uhAutopayFailures') || '{}');
                finish(failures);
            } catch (e) {
                finish({});
            }
        }
    }
    // --- Auto-detect worksheet and parse on load ---
    if (/CollectionWorksheet|Autopay/.test(window.location.href) || document.querySelector('.management-report')) {
        // Wait for table to load
        window.addEventListener('DOMContentLoaded', parseAndStoreAutopayFailuresFromWorksheet);
        setTimeout(parseAndStoreAutopayFailuresFromWorksheet, 1000); // fallback if DOMContentLoaded missed
    }

(function() {
    'use strict';

    function daysBetween(dateString) {
        const parts = dateString.split('/');
        if (parts.length !== 3) return null;
        const dueDate = new Date(parts[2], parts[0] - 1, parts[1]);
        const today = new Date();
        dueDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const diff = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        return diff;
    }

    function getLateFeeDate(dateString) {
        const parts = dateString.split('/');
        if (parts.length !== 3) return 'Date error';
        const dueDate = new Date(parts[2], parts[0] - 1, parts[1]);
        dueDate.setHours(0,0,0,0);
        const lateFeeDate = new Date(dueDate);
        lateFeeDate.setDate(lateFeeDate.getDate() + 5);
        return `${lateFeeDate.getMonth() + 1}/${lateFeeDate.getDate()}/${lateFeeDate.getFullYear()}`;
    }

    // Capitalize only the first letter of each word
    function formatName(name) {
        return name.split(/\s+/).map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
    }

    // Extract customer name from the description list
    function getCustomerName() {
        const dts = document.querySelectorAll('dl.description-list--customerEdit dt');
        for (let i = 0; i < dts.length; i++) {
            if (dts[i].textContent.trim().toLowerCase() === 'name:') {
                const dd = dts[i].nextElementSibling;
                if (dd && dd.tagName.toLowerCase() === 'dd') {
                    return formatName(dd.textContent.trim());
                }
            }
        }
        return '';
    }

    function getFirstName(fullName) {
        return fullName.split(' ')[0] || '';
    }

    function getFirstAndLastName(fullName) {
        const parts = fullName.split(' ');
        if (parts.length === 1) return parts[0];
        return parts[0] + ' ' + parts[parts.length - 1];
    }

    // Helper to get employee's first name from top bar
    function detectAndStoreEmployeeName() {
        const userAnchor = document.querySelector('a.dropdown-toggle[data-toggle="dropdown"]');
        if (userAnchor) {
            // Remove icon and counter, get only the text
            let text = userAnchor.textContent || '';
            // Remove unread counter if present
            text = text.replace(/\d+$/, '').trim();
            // Remove icon text if present
            text = text.replace(/^[^A-Za-z]+/, '').trim();
            // Get first word (first name)
            const firstName = text.split(' ')[0];
            if (firstName) {
                // Only update if changed
                if (localStorage.getItem('uhEmployeeName') !== firstName) {
                    localStorage.setItem('uhEmployeeName', firstName);
                }
            }
        }
    }
    // Run on every page load
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        detectAndStoreEmployeeName();
    } else {
        document.addEventListener('DOMContentLoaded', detectAndStoreEmployeeName);
    }

    function getEmployeeFirstName() {
        return localStorage.getItem('uhEmployeeName') || 'U-Haul';
    }

    // --- Helper: Get all unique past-due dates (before today) and days late, units, and balance for each unit ---
    function getPastDueDatesWithUnitsAndBalance() {
        const unitRows = document.querySelectorAll('table.table tbody tr');
        const dateMap = new Map();
        // Helper to get global balance from account details panel
        function getGlobalBalance() {
            const accountPanel = document.querySelector('#overview__accountDetails dl');
            if (accountPanel) {
                const dts = accountPanel.querySelectorAll('dt');
                for (let i = 0; i < dts.length; i++) {
                    if (dts[i].textContent.trim().toLowerCase() === 'balance due:') {
                        const dd = dts[i].nextElementSibling;
                        if (dd && dd.tagName.toLowerCase() === 'dd') {
                            return dd.textContent.trim();
                        }
                    }
                }
            }
            return '';
        }

        const globalBalance = getGlobalBalance();

        unitRows.forEach(row => {
            const unitNumber = row.querySelector('td[data-heading="Number"]')?.textContent.trim();
            const dueDateCell = row.querySelector('td[data-heading="Next Due"] a');
            let balance = '';
            // Try data-heading="Balance Due" first
            let balanceCell = row.querySelector('td[data-heading="Balance Due"]');
            if (balanceCell) {
                const match = balanceCell.textContent.match(/\$[\d,.]+/);
                if (match) balance = match[0];
            } else {
                // Fallback: look for any cell with "Balance Due: $..."
                const tds = row.querySelectorAll('td');
                for (let td of tds) {
                    const match = td.textContent.match(/Balance Due:\s*(\$[\d,.]+)/i);
                    if (match) {
                        balance = match[1];
                        break;
                    }
                }
            }
            // If still not found, use global balance from account details
            if (!balance && globalBalance) {
                balance = globalBalance;
            }
            if (!dueDateCell) return;
            const dueDateStr = dueDateCell.textContent.trim();
            const daysLate = daysBetween(dueDateStr);
            if (daysLate !== null && daysLate > 0) {
                if (!dateMap.has(dueDateStr)) {
                    dateMap.set(dueDateStr, { daysLate, units: [{unit: unitNumber, balance}] });
                } else {
                    dateMap.get(dueDateStr).units.push({unit: unitNumber, balance});
                }
            }
        });
        // Return array of { dueDate, daysLate, units: [{unit, balance}] }
        return Array.from(dateMap.entries()).map(([dueDate, obj]) => ({ dueDate, daysLate: obj.daysLate, units: obj.units }));
    }

    // --- Helper: Render message buttons for each unique past-due date ---
    function renderPastDueDateMessages(content, customerName) {
        const pastDueDates = getPastDueDatesWithUnitsAndBalance();
        if (pastDueDates.length === 0) {
            content.innerHTML = '<div>No past-due dates found.</div>';
            return;
        }
        pastDueDates.forEach(({ dueDate, daysLate, units }) => {
            // Removed all messages that use ${dueDate} in them
        });
    }

    function createDropdown(dateText, linkClass) {
        // Remove any existing modal
        const oldModal = document.getElementById('uh-copy-modal');
        if (oldModal) oldModal.remove();

        // Modal styles (fixed size, clear outlines)
        const modalStyle = `
            #uh-copy-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #fff;
                color: #222;
                min-width: 260px;
                max-width: 95vw;
                width: 320px;
                min-height: 120px;
                max-height: 80vh;
                height: auto;
                box-shadow: 0 2px 10px rgba(0,0,0,0.13);
                border-radius: 6px;
                padding: 0;
                z-index: 10002;
                overflow: hidden;
                font-family: inherit;
                display: flex;
                flex-direction: column;
            }
            #uh-copy-modal .uh-modal-header {
                padding: 8px 16px 6px 16px;
                font-size: 16px;
                font-weight: 600;
                border-bottom: 1px solid #ff6a00;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #fafafa;
            }
            #uh-copy-modal .uh-modal-tabs {
                display: flex;
                border-bottom: 1px solid #eee;
                background: #fafafa;
            }
            #uh-copy-modal .uh-modal-tab {
                flex: 1;
                padding: 7px 0 6px 0;
                text-align: center;
                cursor: pointer;
                font-size: 13px;
                border: none;
                background: none;
                outline: none;
                transition: background 0.2s;
                border-bottom: 2px solid transparent;
            }
            #uh-copy-modal .uh-modal-tab.active {
                background: #fff;
                border-bottom: 2px solid #ff6a00;
                font-weight: 600;
            }
            #uh-copy-modal .uh-modal-content {
                padding: 10px 14px 10px 14px;
                flex: 1 1 auto;
                overflow-y: auto;
                background: #fff;
                border-radius: 0 0 6px 6px;
            }
            #uh-copy-modal .uh-modal-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #888;
            }
            #uh-copy-modal .uh-copy-btn {
                background: #007bff;
                color: #fff;
                border: none;
                border-radius: 4px;
                padding: 4px 10px;
                cursor: pointer;
                margin-bottom: 4px;
                font-size: 12px;
            }
            #uh-copy-modal .uh-msg-label {
                font-weight: 600;
                margin-top: 8px;
                font-size: 12px;
                color: #333;
            }
            #uh-copy-modal .uh-msg-label:first-child {
                margin-top: 0;
            }
            #uh-copy-modal .uh-msg {
                margin-bottom: 4px;
                font-size: 12px;
                word-break: break-word;
                background: #f5f5f5;
                border-radius: 3px;
                padding: 5px 7px;
                border: 1px solid #eee;
            }
            #uh-copy-modal .uh-custom-area {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-top: 6px;
            }
            #uh-copy-modal .uh-custom-text {
                width: 100%;
                min-height: 36px;
                font-size: 12px;
                padding: 5px;
                border-radius: 3px;
                border: 1px solid #ccc;
                resize: vertical;
            }
            #uh-copy-modal .uh-section-header {
                font-size: 13px;
                font-weight: 600;
                margin: 10px 0 4px 0;
                color: #ff6a00;
                border-bottom: 1px solid #eee;
                padding-bottom: 2px;
            }
            #uh-copy-modal .uh-date-dropdown-row {
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            #uh-copy-modal .uh-date-dropdown-label {
                font-weight: 500;
                font-size: 12px;
            }
            #uh-copy-modal .uh-date-dropdown {
                font-size: 12px;
                padding: 2px 6px;
                border-radius: 3px;
                border: 1px solid #ccc;
            }
        `;
        if (!document.getElementById('uh-copy-modal-style')) {
            const style = document.createElement('style');
            style.id = 'uh-copy-modal-style';
            style.textContent = modalStyle;
            document.head.appendChild(style);
        }

        // Modal structure
        const modal = document.createElement('div');
        modal.id = 'uh-copy-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'uh-modal-header';
        header.innerHTML = `<span>U-Haul Payment Reminder Copier</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'uh-modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => modal.remove();
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Tabs
        const tabs = document.createElement('div');
        tabs.className = 'uh-modal-tabs';
        const tabNames = [
            'Standard',
            'Custom Messages',
            'Message Editor'
        ];
        const tabEls = tabNames.map((name, idx) => {
            const tab = document.createElement('button');
            tab.className = 'uh-modal-tab' + (idx === 0 ? ' active' : '');
            tab.innerText = name;
            tab.onclick = () => setTab(idx);
            tabs.appendChild(tab);
            return tab;
        });
        modal.appendChild(tabs);

        // Content
        const content = document.createElement('div');
        content.className = 'uh-modal-content';
        modal.appendChild(content);

        // --- Date dropdown logic ---
        let selectedDate = null;
        let selectedDateObj = null;
        let pastDueDates = getPastDueDatesWithUnitsAndBalance();
        if (pastDueDates.length > 0) {
            selectedDate = pastDueDates[0].dueDate;
            selectedDateObj = pastDueDates[0];
        }

        function renderDateDropdown(onChange) {
            if (pastDueDates.length <= 1) return null;
            const row = document.createElement('div');
            row.className = 'uh-date-dropdown-row';
            const label = document.createElement('span');
            label.className = 'uh-date-dropdown-label';
            label.innerText = 'Select Past Due Date:';
            const select = document.createElement('select');
            select.className = 'uh-date-dropdown';
            pastDueDates.forEach((d, i) => {
                const opt = document.createElement('option');
                opt.value = d.dueDate;
                opt.innerText = `${d.dueDate} (${d.daysLate} days late)`;
                select.appendChild(opt);
            });
            select.value = selectedDate;
            select.onchange = function() {
                selectedDate = select.value;
                selectedDateObj = pastDueDates.find(d => d.dueDate === selectedDate);
                if (onChange) onChange();
            };
            row.appendChild(label);
            row.appendChild(select);
            return row;
        }

        // --- Tab logic ---
        function setTab(idx) {
            tabEls.forEach((tab, i) => tab.classList.toggle('active', i === idx));
            content.innerHTML = '';
            const customerName = getCustomerName();
            pastDueDates = getPastDueDatesWithUnitsAndBalance();
            if (pastDueDates.length > 0 && (!selectedDate || !pastDueDates.some(d => d.dueDate === selectedDate))) {
                selectedDate = pastDueDates[0].dueDate;
                selectedDateObj = pastDueDates[0];
            } else if (pastDueDates.length > 0) {
                selectedDateObj = pastDueDates.find(d => d.dueDate === selectedDate);
            }

            // Date dropdown (if >1 date)
            const dropdown = renderDateDropdown(() => setTab(idx));
            if (dropdown) content.appendChild(dropdown);

            if (idx === 0) renderLateMessagesTab(content, customerName);
            if (idx === 1) renderCustomMessagesTab(content);
            if (idx === 2) renderCustomMessageEditor(content);
        }

        // --- Tab 1: Late Messages ---
        function renderLateMessagesTab(content, customerName) {
            const section = document.createElement('div');
            section.className = 'uh-section';
            const header = document.createElement('div');
            header.className = 'uh-section-header';
            header.innerText = 'Standard Late Payment Messages';
            section.appendChild(header);
            // Always clear section and show loading while waiting for callback
            section.innerHTML += '<div id="uh-late-msg-loading">Loading...</div>';
            content.appendChild(section);
            if (!selectedDateObj) {
                // Remove loading if present
                const loadingDiv = section.querySelector('#uh-late-msg-loading');
                if (loadingDiv) loadingDiv.remove();
                section.innerHTML += '<div>No past-due dates found.</div>';
                return;
            }
            const fullName = customerName;
            const firstName = customerName.split(' ')[0] || customerName;
            let employeeName = getEmployeeFirstName();
            let daysLate = selectedDateObj.daysLate;
            checkAutopayFailure(customerName, function(autopayFailed) {
                // Remove loading
                const loadingDiv = section.querySelector('#uh-late-msg-loading');
                if (loadingDiv) loadingDiv.remove();
                // Always show all messages that apply
                let messages = [];
                if (autopayFailed) {
                    messages.push({
                        title: 'Autopay Failed',
                        text: `This is ${employeeName} from U-Haul. We are having trouble with your card authorization. Please call this store at your earliest convenience.`
                    });
                }
                if (daysLate >= 1 && daysLate <= 4) {
                    let msg = `Hey ${firstName}, this is ${employeeName} from U-Haul. To prevent a late fee please call us or download our app to conveniently manage your storage account.`;
                    if (msg.length > 142) {
                        msg = msg.replace('conveniently ', '');
                    }
                    messages.push({
                        title: `Late Fee Reminder (${daysLate} days late)`,
                        text: msg,
                        daysLate: daysLate
                    });
                }
                if (daysLate >= 5 && daysLate <= 999) {
                    let msg = `Hey ${firstName} this is ${employeeName} from U-Haul. The next step is to incur late fees and I REALLY don’t want that to happen. What can I do to help?`;
                    if (msg.length > 142) {
                        msg = msg.replace('REALLY ', '');
                    }
                    messages.push({
                        title: `Late Fee Imminent (${daysLate} days late)`,
                        text: msg,
                        daysLate: daysLate
                    });
                }
                if (messages.length) {
                    messages.forEach(({title, text, daysLate}) => {
                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.alignItems = 'center';
                        // Title with days late coloring
                        const titleEl = document.createElement('span');
                        if (typeof daysLate === 'number' && daysLate > 44) {
                            // Red for >44
                            titleEl.innerHTML = title.replace(/(\d+ days late)/, '<span style="color:#c00;font-weight:bold;">$1</span>');
                        } else {
                            // White (default)
                            titleEl.innerText = title;
                        }
                        titleEl.style.fontWeight = 'bold';
                        const copyBtn = document.createElement('button');
                        copyBtn.className = 'uh-copy-btn';
                        copyBtn.innerText = 'Copy';
                        copyBtn.style.marginLeft = '8px';
                        const msgDiv = document.createElement('div');
                        msgDiv.className = 'uh-msg';
                        msgDiv.innerText = text;
                        copyBtn.onclick = function() {
                            if (typeof GM_setClipboard === 'function') {
                                GM_setClipboard(msgDiv.innerText);
                            } else if (navigator.clipboard) {
                                navigator.clipboard.writeText(msgDiv.innerText);
                            }
                            copyBtn.innerText = 'Copied!';
                            setTimeout(() => {
                                const modal = document.getElementById('uh-copy-modal');
                                if (modal) modal.remove();
                            }, 250);
                        };
                        row.appendChild(titleEl);
                        row.appendChild(copyBtn);
                        section.appendChild(row);
                        section.appendChild(msgDiv);
                    });
                } else {
                    section.innerHTML += '<div>No message available.</div>';
                }
            });
        }

        // --- Tab 2: Custom Message Results ---
        function renderCustomMessagesTab(content) {
            const section = document.createElement('div');
            section.className = 'uh-section';
            const header = document.createElement('div');
            header.className = 'uh-section-header';
            header.innerText = 'Customer Messages';
            section.appendChild(header);
            // Load all templates from storage
            function getTemplates(cb) {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['uhCustomMsgTemplates'], function(result) {
                        cb(result.uhCustomMsgTemplates || []);
                    });
                } else if (window.localStorage) {
                    try {
                        cb(JSON.parse(localStorage.getItem('uhCustomMsgTemplates') || '[]'));
                    } catch (e) {
                        cb([]);
                    }
                } else {
                    cb([]);
                }
            }
            // Helper to clear and re-render the section in-place
            function rerender() {
                // Remove all children from section except the header
                while (section.children.length > 1) section.removeChild(section.lastChild);
                getTemplates(renderMessages);
            }

            function renderMessages(templates) {
                if (!templates.length) {
                    section.innerHTML = '<div class="uh-section-header">Customer Messages</div><div>No customer messages saved. Use the "Message Editor" tab to create one.</div>';
                    content.innerHTML = '';
                    content.appendChild(section);
                    return;
                }
                // Scrollable message list
                const scrollBox = document.createElement('div');
                scrollBox.style.maxHeight = '220px';
                scrollBox.style.overflowY = 'auto';
                scrollBox.style.marginTop = '6px';
                templates.forEach((tpl, idx) => {
                    const customerName = getCustomerName();
                    const fullName = customerName;
                    const firstName = customerName.split(' ')[0] || customerName;
                    const todayStr = new Date().toLocaleDateString();
                    if (!selectedDateObj) return;
                    const lateFeeDate = getLateFeeDate(selectedDateObj.dueDate);
                    tpl.lastUsed = Date.now();
                    selectedDateObj.units.forEach(({unit, balance}) => {
                        let msg = tpl.template;
                        function fitNameCustom(msg, firstName, fullName) {
                            if (msg.replace(/<customername>/gi, fullName).length <= 142) {
                                return fullName;
                            } else {
                                return firstName;
                            }
                        }
                        let nameToUse = fitNameCustom(msg, firstName, fullName);
                        msg = msg.replace(/<customername>/gi, nameToUse)
                                 .replace(/<firstname>/gi, firstName)
                                 .replace(/<lastname>/gi, (fullName.split(' ').length > 1 ? fullName.split(' ').slice(-1)[0] : ''))
                                 .replace(/<duedate>/gi, selectedDateObj.dueDate)
                                 .replace(/<unit>/gi, unit)
                                 .replace(/<balance>/gi, balance)
                                 .replace(/<dayslate>/gi, selectedDateObj.daysLate)
                                 .replace(/<latefeedate>/gi, lateFeeDate)
                                 .replace(/<today>/gi, todayStr)
                                 .replace(/<employeename>/gi, getEmployeeFirstName());
                        if (msg.length > 142) {
                            msg = msg.slice(0, 139) + '...';
                        }
                        // Message box with border
                        const msgBox = document.createElement('div');
                        msgBox.style.border = '1px solid #ccc';
                        msgBox.style.borderRadius = '4px';
                        msgBox.style.padding = '7px 10px 7px 10px';
                        msgBox.style.marginBottom = '8px';
                        msgBox.style.background = '#fafbfc';
                        msgBox.style.display = 'flex';
                        msgBox.style.alignItems = 'center';
                        msgBox.style.justifyContent = 'space-between';
                        // Message text
                        const msgText = document.createElement('div');
                        msgText.className = 'uh-msg';
                        msgText.innerText = msg;
                        msgText.style.flex = '1';
                        msgText.style.marginRight = '10px';
                        // Button group
                        const btnGroup = document.createElement('div');
                        btnGroup.style.display = 'flex';
                        btnGroup.style.gap = '4px';
                        // Copy button
                        const copyBtn = document.createElement('button');
                        copyBtn.className = 'uh-copy-btn';
                        copyBtn.innerText = '📋';
                        copyBtn.title = 'Copy';
                        copyBtn.style.padding = '2px 6px';
                        copyBtn.style.fontSize = '11px';
                        copyBtn.onclick = function() {
                            if (typeof GM_setClipboard === 'function') {
                                GM_setClipboard(msgText.innerText);
                            } else if (navigator.clipboard) {
                                navigator.clipboard.writeText(msgText.innerText);
                            }
                            copyBtn.innerText = 'Copied!';
                            setTimeout(() => {
                                const modal = document.getElementById('uh-copy-modal');
                                if (modal) modal.remove();
                            }, 250);
                        };
                        // Edit button
                        const editBtn = document.createElement('button');
                        editBtn.className = 'uh-copy-btn';
                        editBtn.innerText = '✏️';
                        editBtn.title = 'Edit';
                        editBtn.style.background = '#ffc107';
                        editBtn.style.padding = '2px 6px';
                        editBtn.style.fontSize = '11px';
                        editBtn.onclick = function() {
                            window.__uhEditTemplateIdx = idx;
                            tabEls[2].click();
                        };
                        // Delete button
                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'uh-copy-btn';
                        deleteBtn.innerText = '🗑️';
                        deleteBtn.title = 'Delete';
                        deleteBtn.style.background = '#dc3545';
                        deleteBtn.style.padding = '2px 6px';
                        deleteBtn.style.fontSize = '11px';
                        deleteBtn.onclick = function() {
                            if (confirm(`Are you sure you want to delete the customer message${tpl.title ? ' "' + tpl.title + '"' : ''}?`)) {
                                templates.splice(idx, 1);
                                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                                    chrome.storage.local.set({ uhCustomMsgTemplates: templates }, rerender);
                                } else if (window.localStorage) {
                                    localStorage.setItem('uhCustomMsgTemplates', JSON.stringify(templates));
                                    rerender();
                                }
                            }
                        };
                        btnGroup.appendChild(copyBtn);
                        btnGroup.appendChild(editBtn);
                        btnGroup.appendChild(deleteBtn);
                        msgBox.appendChild(msgText);
                        msgBox.appendChild(btnGroup);
                        scrollBox.appendChild(msgBox);
                    });
                });
                section.appendChild(scrollBox);
                // Only append section if not already present
                if (!content.contains(section)) {
                    content.appendChild(section);
                }
            }

            getTemplates(renderMessages);
        }

        // --- Tab 3: Message Editor ---
        function renderCustomMessageEditor(content) {
            const section = document.createElement('div');
            section.className = 'uh-section';
            const header = document.createElement('div');
            header.className = 'uh-section-header';
            header.innerText = 'Custom Message Template Editor';
            section.appendChild(header);


            // Legend for placeholders (now clickable)
            const legend = document.createElement('div');
            legend.style.fontSize = '12px';
            legend.style.marginBottom = '6px';
            legend.style.display = 'flex';
            legend.style.alignItems = 'center';
            legend.style.flexWrap = 'wrap';
            legend.innerHTML = '<b>Available placeholders:</b> ';
            // Info icon with robust tooltip logic
            const infoIcon = document.createElement('span');
            infoIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 20 20" style="vertical-align:middle"><circle cx="10" cy="10" r="9" fill="#e0e0e0" stroke="#888" stroke-width="1.5"/><text x="10" y="15" text-anchor="middle" font-size="13" fill="#555" font-family="Arial" font-weight="bold">i</text></svg>';
            infoIcon.style.display = 'inline-block';
            infoIcon.style.marginLeft = '6px';
            infoIcon.style.cursor = 'pointer';
            // Do NOT set infoIcon.title, to avoid browser native tooltip
            // Robust tooltip logic
            let uhTooltip = null;
            function removeTooltip() {
                if (uhTooltip && uhTooltip.parentNode) {
                    uhTooltip.parentNode.removeChild(uhTooltip);
                    uhTooltip = null;
                }
            }
            infoIcon.addEventListener('mouseenter', function(e) {
                removeTooltip();
                uhTooltip = document.createElement('div');
                uhTooltip.id = 'uh-info-tooltip';
                uhTooltip.innerText = 'Click a placeholder to insert it into the message box.';
                uhTooltip.style.position = 'fixed';
                uhTooltip.style.background = '#222';
                uhTooltip.style.color = '#fff';
                uhTooltip.style.padding = '5px 10px';
                uhTooltip.style.borderRadius = '5px';
                uhTooltip.style.fontSize = '12px';
                uhTooltip.style.zIndex = '99999';
                uhTooltip.style.top = (e.clientY + 18) + 'px';
                uhTooltip.style.left = (e.clientX - 30) + 'px';
                document.body.appendChild(uhTooltip);
            });
            infoIcon.addEventListener('mousemove', function(e) {
                if (uhTooltip) {
                    uhTooltip.style.top = (e.clientY + 18) + 'px';
                    uhTooltip.style.left = (e.clientX - 30) + 'px';
                }
            });
            infoIcon.addEventListener('mouseleave', removeTooltip);
            infoIcon.addEventListener('mousedown', removeTooltip);
            // Defensive: remove tooltip if icon loses focus (e.g. tabbing away)
            infoIcon.addEventListener('blur', removeTooltip);
            legend.appendChild(infoIcon);

            const placeholders = [
                { label: '<customername>', value: '<customername>' },
                { label: '<firstname>', value: '<firstname>' },
                { label: '<lastname>', value: '<lastname>' },
                { label: '<duedate>', value: '<duedate>' },
                { label: '<unit>', value: '<unit>' },
                { label: '<balance>', value: '<balance>' },
                { label: '<dayslate>', value: '<dayslate>' },
                { label: '<latefeedate>', value: '<latefeedate>' },
                { label: '<today>', value: '<today>' },
                { label: '<employeename>', value: '<employeename>' }
            ];
            // textarea is defined later, so we will reference it after creation
            const selectRow = document.createElement('div');
            selectRow.style.display = 'flex';
            selectRow.style.alignItems = 'center';
            selectRow.style.gap = '8px';
            selectRow.style.marginBottom = '10px';
            const selectLabel = document.createElement('span');
            selectLabel.innerText = 'Edit Existing:';
            selectLabel.style.fontWeight = '500';
            selectLabel.style.fontSize = '15px';
            const select = document.createElement('select');
            select.style.fontSize = '15px';
            select.style.padding = '4px 10px';
            select.style.borderRadius = '4px';
            select.style.border = '1px solid #ccc';
            selectRow.appendChild(selectLabel);
            selectRow.appendChild(select);
            section.appendChild(selectRow);

            // Title input
            const titleLabel = document.createElement('label');
            titleLabel.innerText = 'Custom Message Title:';
            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.className = 'uh-custom-title';
            titleInput.style.marginBottom = '8px';
            titleInput.style.fontSize = '15px';
            titleInput.style.padding = '6px';
            titleInput.style.borderRadius = '4px';
            titleInput.style.border = '1px solid #ccc';
            titleInput.style.width = '100%';
            section.appendChild(titleLabel);
            section.appendChild(titleInput);

            // Write your custom message
            // Removed duplicate label and textarea. Only the working one at the bottom remains.

            // Now that textarea is defined, add placeholder buttons
            const btnWrap = document.createElement('div');
            btnWrap.style.display = 'flex';
            btnWrap.style.flexWrap = 'wrap';
            btnWrap.style.gap = '2px';
            btnWrap.style.marginLeft = '8px';
            placeholders.forEach(ph => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.innerText = ph.label;
                btn.style.margin = '0 2px 2px 0';
                btn.style.fontSize = '11px';
                btn.style.padding = '1px 5px';
                btn.style.borderRadius = '3px';
                btn.style.border = '1px solid #aaa';
                btn.style.background = '#f5f5f5';
                btn.style.cursor = 'pointer';
                btn.style.lineHeight = '1.1';
                btn.onclick = function(e) {
                    textarea.focus();
                    // Insert at cursor position in textarea
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const before = textarea.value.substring(0, start);
                    const after = textarea.value.substring(end);
                    textarea.value = before + ph.value + after;
                    textarea.selectionStart = textarea.selectionEnd = start + ph.value.length;
                };
                btnWrap.appendChild(btn);
            });
            legend.appendChild(btnWrap);
            section.insertBefore(legend, selectRow);

            const label = document.createElement('label');
            label.innerText = 'Write your custom message:';
            const textarea = document.createElement('textarea');
            textarea.className = 'uh-custom-text';
            section.appendChild(label);
            section.appendChild(textarea);



            // Load all templates
            let templates = [];
            let editIdx = null;
            function loadTemplates(cb) {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['uhCustomMsgTemplates'], function(result) {
                        templates = result.uhCustomMsgTemplates || [];
                        if (cb) cb();
                    });
                } else if (window.localStorage) {
                    try {
                        templates = JSON.parse(localStorage.getItem('uhCustomMsgTemplates') || '[]');
                    } catch (e) {
                        templates = [];
                    }
                    if (cb) cb();
                } else {
                    templates = [];
                    if (cb) cb();
                }
            }
            function saveTemplates(cb) {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ uhCustomMsgTemplates: templates }, function() {
                        if (cb) cb();
                    });
                } else if (window.localStorage) {
                    localStorage.setItem('uhCustomMsgTemplates', JSON.stringify(templates));
                    if (cb) cb();
                } else {
                    if (cb) cb();
                }
            }
            function refreshSelect() {
                select.innerHTML = '';
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.innerText = '-- Select a template --';
                select.appendChild(defaultOpt);
                templates.forEach((tpl, i) => {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.innerText = tpl.title || `Template ${i+1}`;
                    select.appendChild(opt);
                });
                if (editIdx !== null && templates[editIdx]) {
                    select.value = editIdx;
                } else {
                    select.value = '';
                }
            }
            function loadEditor(idx) {
                if (idx !== '' && templates[idx]) {
                    titleInput.value = templates[idx].title || '';
                    textarea.value = templates[idx].template || '';
                    editIdx = parseInt(idx);
                } else {
                    titleInput.value = '';
                    textarea.value = '';
                    editIdx = null;
                }
            }
            select.onchange = function() {
                loadEditor(select.value);
            };

            // On tab open, load templates and clear fields unless editing
            loadTemplates(function() {
                refreshSelect();
                if (window.__uhEditTemplateIdx !== undefined && templates[window.__uhEditTemplateIdx]) {
                    loadEditor(window.__uhEditTemplateIdx);
                    select.value = window.__uhEditTemplateIdx;
                    editIdx = window.__uhEditTemplateIdx;
                    window.__uhEditTemplateIdx = undefined;
                } else {
                    // Clear fields unless editing
                    titleInput.value = '';
                    textarea.value = '';
                    editIdx = null;
                }
            });

            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.className = 'uh-copy-btn';
            saveBtn.innerText = 'Save Template';
            saveBtn.onclick = function() {
                const title = titleInput.value.trim();
                const template = textarea.value.trim();
                if (!title || !template) {
                    saveBtn.innerText = 'Title & Message required!';
                    setTimeout(() => { saveBtn.innerText = 'Save Template'; }, 1200);
                    return;
                }
                if (editIdx !== null && templates[editIdx]) {
                    templates[editIdx].title = title;
                    templates[editIdx].template = template;
                } else {
                    templates.push({ title, template });
                    editIdx = templates.length - 1;
                }
                saveTemplates(function() {
                    saveBtn.innerText = 'Saved!';
                    setTimeout(() => { saveBtn.innerText = 'Save Template'; }, 1200);
                    refreshSelect();
                    select.value = editIdx;
                });
            };
            // Delete button for editor
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'uh-copy-btn';
            deleteBtn.style.background = '#dc3545';
            deleteBtn.innerText = 'Delete';
            deleteBtn.onclick = function() {
                if (editIdx !== null && templates[editIdx]) {
                    if (confirm(`Are you sure you want to delete the custom message template "${templates[editIdx].title}"?`)) {
                        templates.splice(editIdx, 1);
                        saveTemplates(function() {
                            refreshSelect();
                            if (templates.length) {
                                loadEditor(0);
                                select.value = 0;
                                editIdx = 0;
                            } else {
                                titleInput.value = '';
                                textarea.value = '';
                                editIdx = null;
                            }
                            // Remove any lingering template fields from the editor
                            titleInput.value = '';
                            textarea.value = '';
                        });
                    }
                }
            };
            // Clear button for editor (to the right of Delete)
            const clearBtn = document.createElement('button');
            clearBtn.className = 'uh-copy-btn';
            clearBtn.style.background = '#e0e0e0';
            clearBtn.innerText = 'Clear';
            clearBtn.onclick = function() {
                titleInput.value = '';
                textarea.value = '';
                editIdx = null;
                select.value = '';
            };
            // Button row (no Copy All)
            const btnRow = document.createElement('div');
            btnRow.style.display = 'flex';
            btnRow.style.gap = '8px';
            btnRow.appendChild(saveBtn);
            btnRow.appendChild(deleteBtn);
            btnRow.appendChild(clearBtn);
            section.appendChild(btnRow);
            section.appendChild(document.createElement('br'));
            content.appendChild(section);
        }

        // Show modal
        document.body.appendChild(modal);
        setTab(0);
        return modal;
    }

    function insertDropdown(dateText, linkClass) {
        const panel = document.getElementById('overview__customerEditPanel');
        if (panel) {
            const smsIcon = panel.querySelector('.fa-comment-sms.sms-bubble-icon.texting');
            if (smsIcon && !document.getElementById('uh-copy-modal-btn')) {
                const btn = document.createElement('button');
                btn.id = 'uh-copy-modal-btn';
                btn.innerText = 'Copy SMS ▼';
                btn.style.background = '#ff6a00';
                btn.style.color = '#fff';
                btn.style.border = 'none';
                btn.style.borderRadius = '4px';
                btn.style.padding = '3px 8px';
                btn.style.fontSize = '13px';
                btn.style.cursor = 'pointer';
                btn.style.height = '28px';
                btn.style.verticalAlign = 'middle';
                btn.onclick = function(e) {
                    e.stopPropagation();
                    createDropdown(dateText, linkClass);
                };
                smsIcon.parentNode.insertBefore(btn, smsIcon.nextSibling);
            }
        }
    }

    function waitForDateAndInsertDropdown() {
        const observer = new MutationObserver(() => {
            let dateLink = null;
            let linkClass = '';
            const table = document.querySelector('table.table.bordered.zebra.responsive');
            if (table) {
                const ths = table.querySelectorAll('thead th');
                let nextDueIdx = -1;
                ths.forEach((th, idx) => {
                    if (th.textContent.trim().toLowerCase() === 'next due') nextDueIdx = idx;
                });
                if (nextDueIdx !== -1) {
                    const row = table.querySelector('tbody tr');
                    if (row) {
                        const tds = row.querySelectorAll('td');
                        if (tds[nextDueIdx]) {
                            const link = tds[nextDueIdx].querySelector('a[data-spin="true"]');
                            if (link && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(link.textContent.trim())) {
                                dateLink = link;
                                linkClass = link.className.trim();
                            }
                        }
                    }
                }
            }
            if (!dateLink) {
                dateLink = document.querySelector('a.warning[data-spin="true"]');
                if (dateLink) {
                    linkClass = 'warning';
                } else {
                    const links = document.querySelectorAll('a[data-spin="true"]');
                    for (const link of links) {
                        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(link.textContent.trim())) {
                            dateLink = link;
                            linkClass = link.className.trim();
                            break;
                        }
                    }
                }
            }
            if (dateLink) {
                insertDropdown(dateLink.textContent.trim(), linkClass);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Initial check
        let dateLink = null;
        let linkClass = '';
        const table = document.querySelector('table.table.bordered.zebra.responsive');
        if (table) {
            const ths = table.querySelectorAll('thead th');
            let nextDueIdx = -1;
            ths.forEach((th, idx) => {
                if (th.textContent.trim().toLowerCase() === 'next due') nextDueIdx = idx;
            });
            if (nextDueIdx !== -1) {
                const row = table.querySelector('tbody tr');
                if (row) {
                    const tds = row.querySelectorAll('td');
                    if (tds[nextDueIdx]) {
                        const link = tds[nextDueIdx].querySelector('a[data-spin="true"]');
                        if (link && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(link.textContent.trim())) {
                            dateLink = link;
                            linkClass = link.className.trim();
                        }
                    }
                }
            }
        }
        if (!dateLink) {
            dateLink = document.querySelector('a.warning[data-spin="true"]');
            if (dateLink) {
                linkClass = 'warning';
            } else {
                const links = document.querySelectorAll('a[data-spin="true"]');
                for (const link of links) {
                    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(link.textContent.trim())) {
                        dateLink = link;
                        linkClass = link.className.trim();
                        break;
                    }
                }
            }
        }
        if (dateLink) {
            insertDropdown(dateLink.textContent.trim(), linkClass);
            observer.disconnect();
        }
    }

    // --- Add note quick-insert buttons for textarea#NoteText and modal textarea ---
    function addNoteQuickButtons() {
        function tryInsert() {
            // For main page
            const textarea = document.getElementById('NoteText');
            if (textarea && !document.getElementById('note-quick-btns')) {
                insertNoteButtons(textarea, 'note-quick-btns');
            }
            // For modal popup
            const modal = document.getElementById('notesReportModal');
            if (modal) {
                const modalTextarea = modal.querySelector('textarea[data-bind="value: notes"]');
                if (modalTextarea && !modal.querySelector('#note-quick-btns-modal')) {
                    insertNoteButtons(modalTextarea, 'note-quick-btns-modal');
                }
            }
        }

        // Helper to insert buttons below a textarea
        function insertNoteButtons(textarea, btnContainerId) {

            // --- Custom Message Storage ---
            function getCustomNotes() {
                try {
                    return JSON.parse(localStorage.getItem('uhCustomNoteTemplates') || '[]');
                } catch (e) {
                    return [];
                }
            }
            function saveCustomNotes(arr) {
                localStorage.setItem('uhCustomNoteTemplates', JSON.stringify(arr));
            }

            // --- Save to Custom Button ---
            const saveCustomBtn = document.createElement('button');
            saveCustomBtn.type = 'button';
            saveCustomBtn.innerText = 'Save to Custom';
            saveCustomBtn.style.fontSize = '13px';
            saveCustomBtn.style.padding = '3px 10px';
            saveCustomBtn.style.marginBottom = '6px';
            saveCustomBtn.style.marginRight = '8px';
            saveCustomBtn.style.background = '#ffc107';
            saveCustomBtn.style.border = '1px solid #aaa';
            saveCustomBtn.style.borderRadius = '4px';
            saveCustomBtn.style.cursor = 'pointer';
            saveCustomBtn.onclick = function() {
                const val = textarea.value.trim();
                if (!val) {
                    saveCustomBtn.innerText = 'Nothing to Save!';
                    setTimeout(() => { saveCustomBtn.innerText = 'Save to Custom'; }, 1000);
                    return;
                }
                let arr = getCustomNotes();
                if (arr.indexOf(val) === -1) {
                    arr.push(val);
                    saveCustomNotes(arr);
                    saveCustomBtn.innerText = 'Saved!';
                    setTimeout(() => { saveCustomBtn.innerText = 'Save to Custom'; }, 1000);
                    refreshCustomDropdown();
                } else {
                    saveCustomBtn.innerText = 'Already Exists';
                    setTimeout(() => { saveCustomBtn.innerText = 'Save to Custom'; }, 1000);
                }
            };

            // Insert Save to Custom button above textarea
            textarea.parentNode.insertBefore(saveCustomBtn, textarea);

            // --- Custom Dropdown ---
            let customDropdown, insertCustomBtn, deleteCustomBtn;
            function refreshCustomDropdown() {
                const arr = getCustomNotes();
                customDropdown.innerHTML = '';
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.innerText = '-- Custom Notes --';
                customDropdown.appendChild(defaultOpt);
                arr.forEach((note, i) => {
                    const opt = document.createElement('option');
                    opt.value = note;
                    opt.innerText = note.length > 40 ? note.slice(0, 37) + '...' : note;
                    customDropdown.appendChild(opt);
                });
                // Disable delete button if nothing selected
                if (deleteCustomBtn) {
                    deleteCustomBtn.disabled = !customDropdown.value;
                }
            // --- Custom Dropdown and Insert/Delete Buttons ---
            }

            // Organize options into primary and alternate rows
            const primaryOptions = [
                'Left primary voicemail',
                'Primary voicemail full',
                'Primary number disconnected',
                'Sent primary an email'
            ];
            const alternateOptions = [
                'Left alternate voicemail',
                'Alternate voicemail full',
                'Alternate number disconnected',
                { label: 'Spoke with alternate', value: 'Spoke with alternate to have the primary call us' }
            ];
            const miscOptions = [];

            const btnContainer = document.createElement('div');
            btnContainer.id = btnContainerId;
            btnContainer.style.margin = '8px 0';
            btnContainer.style.display = 'block';

            function makeRow(options) {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.flexDirection = 'row';
                row.style.gap = '6px';
                row.style.flexWrap = 'nowrap';
                for (let i = 0; i < options.length; i++) {
                    let text, btnLabel;
                    if (typeof options[i] === 'object') {
                        btnLabel = options[i].label;
                        text = options[i].value;
                    } else {
                        btnLabel = text = options[i];
                    }
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.innerText = btnLabel;
                    btn.style.fontSize = '12px';
                    btn.style.padding = '2px 8px';
                    btn.style.borderRadius = '4px';
                    btn.style.border = '1px solid #aaa';
                    btn.style.background = '#f5f5f5';
                    btn.style.cursor = 'pointer';
                    btn.style.whiteSpace = 'nowrap';
                    btn.onclick = function() {
                        let val = textarea.value.trim();
                        const phrases = val ? val.split(';').map(s => s.trim()).filter(Boolean) : [];
                        if (phrases.indexOf(text) === -1) {
                            textarea.value = val ? (val + '; ' + text) : text;
                            textarea.focus();
                            // Fix: trigger input event so frameworks/knockout see the change
                            const event = new Event('input', { bubbles: true });
                            textarea.dispatchEvent(event);
                        }
                    };
                    row.appendChild(btn);
                }
                return row;
            }

            btnContainer.appendChild(makeRow(primaryOptions));
            btnContainer.appendChild(makeRow(alternateOptions));
            if (miscOptions.length > 0) btnContainer.appendChild(makeRow(miscOptions));

            // Add a row for the custom 'Customer will pay by X' button with a date selector and custom dropdown
            const customRow = document.createElement('div');
            customRow.style.display = 'flex';
            customRow.style.flexDirection = 'row';
            customRow.style.alignItems = 'center';
            customRow.style.gap = '6px';
            customRow.style.marginTop = '8px';

            const payByBtn = document.createElement('button');
            payByBtn.type = 'button';
            payByBtn.innerText = 'Customer will pay by';
            payByBtn.style.fontSize = '12px';
            payByBtn.style.padding = '2px 8px';
            payByBtn.style.borderRadius = '4px';
            payByBtn.style.border = '1px solid #aaa';
            payByBtn.style.background = '#f5f5f5';
            payByBtn.style.cursor = 'pointer';
            payByBtn.style.whiteSpace = 'nowrap';

            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.style.fontSize = '12px';
            dateInput.style.padding = '2px 4px';
            dateInput.style.borderRadius = '4px';
            dateInput.style.border = '1px solid #aaa';
            dateInput.style.background = '#fff';
            dateInput.style.marginLeft = '4px';
            dateInput.style.width = '120px';

            // --- Custom Dropdown and Insert Button ---
            customDropdown = document.createElement('select');
            customDropdown.style.fontSize = '12px';
            customDropdown.style.padding = '2px 8px';
            customDropdown.style.borderRadius = '4px';
            customDropdown.style.border = '1px solid #aaa';
            customDropdown.style.background = '#f5f5f5';
            customDropdown.style.marginLeft = '8px';
            customDropdown.style.maxWidth = '220px';
            insertCustomBtn = document.createElement('button');
            insertCustomBtn.type = 'button';
            insertCustomBtn.innerText = 'Insert';
            insertCustomBtn.style.fontSize = '12px';
            insertCustomBtn.style.padding = '2px 8px';
            insertCustomBtn.style.borderRadius = '4px';
            insertCustomBtn.style.border = '1px solid #aaa';
            insertCustomBtn.style.background = '#e0e0e0';
            insertCustomBtn.style.cursor = 'pointer';
            insertCustomBtn.style.marginLeft = '2px';
            insertCustomBtn.onclick = function() {
                const val = customDropdown.value;
                if (!val) return;
                textarea.value = val;
                textarea.focus();
                // Fix: trigger input event so frameworks/knockout see the change
                const event = new Event('input', { bubbles: true });
                textarea.dispatchEvent(event);
            };

            deleteCustomBtn = document.createElement('button');
            deleteCustomBtn.type = 'button';
            deleteCustomBtn.innerText = 'Delete';
            deleteCustomBtn.style.fontSize = '12px';
            deleteCustomBtn.style.padding = '2px 8px';
            deleteCustomBtn.style.borderRadius = '4px';
            deleteCustomBtn.style.border = '1px solid #dc3545';
            deleteCustomBtn.style.background = '#ffeaea';
            deleteCustomBtn.style.color = '#dc3545';
            deleteCustomBtn.style.cursor = 'pointer';
            deleteCustomBtn.style.marginLeft = '2px';
            deleteCustomBtn.disabled = true;
            deleteCustomBtn.onclick = function() {
                const val = customDropdown.value;
                if (!val) return;
                if (!confirm('Delete this custom note?')) return;
                let arr = getCustomNotes();
                arr = arr.filter(note => note !== val);
                saveCustomNotes(arr);
                refreshCustomDropdown();
            };

            customDropdown.onchange = function() {
                deleteCustomBtn.disabled = !customDropdown.value;
            };
            refreshCustomDropdown();

            payByBtn.onclick = function() {
                if (!dateInput.value) {
                    dateInput.focus();
                    return;
                }
                // Fix: Use the selected date as local date, not UTC (avoid timezone offset)
                const d = new Date(dateInput.value + 'T00:00:00');
                const formatted = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
                let val = textarea.value.trim();
                const text = `Called customer said they will pay balance on ${formatted}.`;
                const phrases = val ? val.split(';').map(s => s.trim()).filter(Boolean) : [];
                if (phrases.indexOf(text) === -1) {
                    textarea.value = val ? (val + '; ' + text) : text;
                    textarea.focus();
                    // Fix: trigger input event so frameworks/knockout see the change
                    const event = new Event('input', { bubbles: true });
                    textarea.dispatchEvent(event);
                }
            };

            customRow.appendChild(payByBtn);
            customRow.appendChild(dateInput);
            customRow.appendChild(customDropdown);
            customRow.appendChild(insertCustomBtn);
            customRow.appendChild(deleteCustomBtn);
            btnContainer.appendChild(customRow);

            // Make the modal textarea and all parent containers wider, and text smaller for better fit
            if (btnContainerId === 'note-quick-btns-modal') {
                // Move modal slightly to the right and down using transform
                let parent = textarea.parentElement;
                while (parent) {
                    if (parent.classList && (parent.classList.contains('modal') || parent.classList.contains('container') || parent.classList.contains('row-fluid'))) {
                        parent.style.width = '650px';
                        parent.style.maxWidth = '98vw';
                        parent.style.marginLeft = '0';
                        parent.style.marginRight = 'auto';
                        parent.style.boxSizing = 'border-box';
                        parent.style.transform = 'translate(-15vw, 25vh)'; // move left 15vw, down 25vh
                    }
                    parent = parent.parentElement;
                }
                const modalBody = textarea.closest('.modal-body');
                if (modalBody) {
                    modalBody.style.width = '650px';
                    modalBody.style.maxWidth = '98vw';
                    modalBody.style.marginLeft = '0';
                    modalBody.style.marginRight = '0';
                    modalBody.style.boxSizing = 'border-box';
                }
                // Adjust the label width to match
                const label = textarea.closest('label');
                if (label) {
                    label.style.width = '100%';
                    label.style.maxWidth = '100%';
                    label.style.display = 'block';
                    label.style.boxSizing = 'border-box';
                }
                textarea.style.width = '100%';
                textarea.style.maxWidth = '100%';
                textarea.style.fontSize = '12px';
                textarea.style.boxSizing = 'border-box';
                textarea.style.resize = 'vertical';
                textarea.style.height = '70px';
                textarea.style.margin = '0';
            }

            // Insert the button container after the label containing the textarea
            const label = textarea.closest('label');
            if (label && label.parentNode) {
                label.parentNode.insertBefore(btnContainer, label.nextSibling);
            } else {
                textarea.parentNode.insertBefore(btnContainer, textarea);
            }
        }
        tryInsert();
        // Observe the whole body for dynamic content
        const observer = new MutationObserver(tryInsert);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Initialize the script
    waitForDateAndInsertDropdown();
    addNoteQuickButtons();
}());

