// ==UserScript==
    // @name         U-Haul Payment Reminder Copier (Multi-Message Dropdown)
    // @namespace    http://tampermonkey.net/
    // @version      3.3
    // @description  Adds a dropdown copy button for U-Haul payment reminders on webselfstorage.com with multiple message options
    // @author       You
    // @match        https://webselfstorage.com/*
    // @grant        GM_setClipboard
    // @grant        none
    // @run-at       document-end
    // @updateURL   https://raw.githubusercontent.com/33OPX/-U-Haul-Payment-Reminder-Copier/main/WSS%20Storage%20SMS%20Copier.js
    // @downloadURL https://raw.githubusercontent.com/33OPX/-U-Haul-Payment-Reminder-Copier/main/WSS%20Storage%20SMS%20Copier.js
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
                // Detect contract number row: look for a cell with a value like '875067-3045' (allow 1+ digits after dash)
                let foundContract = false;
                for (let td of tds) {
                    let match = td.textContent.match(/(\d{5,})-(\d{1,})/);
                    if (match) {
                        // Use the part after the dash as the contract number
                        currentContract = match[2];
                        foundContract = true;
                        break;
                    }
                }
                // If (AutoPayments User) appears in this row, mark the contract above as failed
                for (let td of tds) {
                    if (td.textContent.includes('(AutoPayments User)') && currentContract) {
                        failures[currentContract] = true;
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
                    // Only get the original text node (not including button or other elements)
                    for (let node of dd.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            return formatName(node.textContent.trim());
                        }
                    }
                }
            }
        }
        return '';
    }

    // Extract customer email from the description list
    function getCustomerEmail() {
        const dts = document.querySelectorAll('dl.description-list--customerEdit dt');
        for (let i = 0; i < dts.length; i++) {
            if (dts[i].textContent.trim().toLowerCase() === 'email:') {
                const dd = dts[i].nextElementSibling;
                if (dd && dd.tagName.toLowerCase() === 'dd') {
                    return dd.textContent.trim();
                }
            }
        }
        return '';
    }

        // Extract customer zip code from the description list
        function getCustomerZip() {
            const dts = document.querySelectorAll('dl.description-list--customerEdit dt');
            for (let i = 0; i < dts.length; i++) {
                if (dts[i].textContent.trim().toLowerCase() === 'zip:' || dts[i].textContent.trim().toLowerCase() === 'zip code:') {
                    const dd = dts[i].nextElementSibling;
                    if (dd && dd.tagName.toLowerCase() === 'dd') {
                        return dd.textContent.trim();
                    }
                }
            }
            // Fallback: try to find zip in address field
            for (let i = 0; i < dts.length; i++) {
                if (dts[i].textContent.trim().toLowerCase().includes('address')) {
                    const dd = dts[i].nextElementSibling;
                    if (dd && dd.tagName.toLowerCase() === 'dd') {
                        // Try to extract zip from address string
                        const match = dd.textContent.trim().match(/\b\d{5}(?:-\d{4})?\b/);
                        if (match) return match[0];
                    }
                }
            }
            return '';
        }

    // Add magnifying glass buttons next to Name and Email fields
    function addTruePeopleSearchButtons() {
        const dts = document.querySelectorAll('dl.description-list--customerEdit dt');
        for (let i = 0; i < dts.length; i++) {
            const label = dts[i].textContent.trim().toLowerCase();
            if (label === 'name:' || label === 'email:') {
                const dd = dts[i].nextElementSibling;
                if (dd && dd.tagName.toLowerCase() === 'dd') {
                    // Avoid duplicate button
                    if (dd.querySelector('.truepeoplesearch-btn')) continue;
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'truepeoplesearch-btn';
                    btn.title = 'Search on TruePeopleSearch and copy URL';
                    btn.style.marginLeft = '8px';
                    btn.style.background = 'none';
                    btn.style.border = 'none';
                    btn.style.cursor = 'pointer';
                    btn.innerHTML = '<span style="font-size:16px;vertical-align:middle;" aria-label="Search">🔍</span>';
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        let url = '';
                        if (label === 'name:') {
                            const name = getCustomerName();
                            const zip = getCustomerZip();
                            if (name && zip) {
                                url = `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(name)}&citystatezip=${encodeURIComponent(zip)}`;
                            } else if (name) {
                                url = `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(name)}`;
                            }
                        } else if (label === 'email:') {
                            const email = getCustomerEmail();
                            if (email) {
                                // Convert email to truepeoplesearch format
                                let [user, domain] = email.split('@');
                                if (user && domain) {
                                    let provider = domain.split('.')[0];
                                    let tpsEmail = user.replace(/\./g, '_dot_') + provider;
                                    url = `https://www.truepeoplesearch.com/resultemail?email=${encodeURIComponent(tpsEmail)}`;
                                } else {
                                    url = `https://www.truepeoplesearch.com/resultemail?email=${encodeURIComponent(email)}`;
                                }
                            }
                        }
                        // Open URL directly without clipboard
                        if (url) {
                            window.open(url, '_blank');
                        }
                    });
                    dd.appendChild(btn);
                }
            }
        }
    }

    function getCustomerEmailClean() {
        const dts = document.querySelectorAll('dl.description-list--customerEdit dt');
        for (let i = 0; i < dts.length; i++) {
            if (dts[i].textContent.trim().toLowerCase() === 'email:') {
                const dd = dts[i].nextElementSibling;
                if (dd && dd.tagName.toLowerCase() === 'dd') {
                    for (let node of dd.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            return node.textContent.trim();
                        }
                    }
                }
            }
        }
        return '';
    }

    function getCustomerEmail() {
        // Find the email address in the dd element that contains the email customer link
        const emailCustomerLink = document.querySelector('#emailCustomerLink');
        if (emailCustomerLink && emailCustomerLink.parentNode) {
            const ddElement = emailCustomerLink.parentNode;
            const emailText = ddElement.textContent.trim();
            // Extract email using regex
            const emailMatch = emailText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            return emailMatch ? emailMatch[1] : null;
        }
        return null;
    }

    function addTruePeopleSearchEmailButton() {
        // Find the specific email customer link (not the email receipt modal)
        const emailCustomerLink = document.querySelector('#emailCustomerLink');
        if (emailCustomerLink) {
            // Avoid duplicate button
            if (emailCustomerLink.nextSibling && emailCustomerLink.nextSibling.classList && emailCustomerLink.nextSibling.classList.contains('truepeoplesearch-email-btn')) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'truepeoplesearch-email-btn';
            btn.setAttribute('title', 'Search Email on TruePeopleSearch');
            btn.style.marginLeft = '4px';
            btn.style.background = 'none';
            btn.style.border = 'none';
            btn.style.cursor = 'pointer';
            btn.style.width = '18px';
            btn.style.height = '18px';
            btn.style.padding = '0';
            btn.innerHTML = '<span style="font-size:16px;vertical-align:middle;" aria-label="Search">🔍</span>';
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                // Get the customer email
                const email = getCustomerEmail();
                let url = '';
                if (email) {
                    // Extract username part (before @) and domain part (after @)
                    const [username, domain] = email.split('@');
                    
                    if (username && domain) {
                        // Convert domain to _at_domain_dot_extension format
                        // Replace dots with _dot_ and prepend _at_
                        const formattedDomain = '_at_' + domain.replace(/\./g, '_dot_');
                        
                        // Create modified email without @ symbol
                        const modifiedEmail = username + formattedDomain;
                        url = `https://www.truepeoplesearch.com/resultemail?email=${modifiedEmail}`;
                    }
                }
                // Open URL directly without clipboard
                if (url) {
                    window.open(url, '_blank');
                }
            }, true);
            // Insert the button after the email customer link
            if (emailCustomerLink.parentNode) {
                emailCustomerLink.parentNode.insertBefore(btn, emailCustomerLink.nextSibling);
            }
        }
    }

    // Run on page load and after AJAX updates
    function runTPSButtonInjection() {
        addTruePeopleSearchButtons();
        addTruePeopleSearchEmailButton();
        const observer = new MutationObserver(() => {
            addTruePeopleSearchButtons();
            addTruePeopleSearchEmailButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        runTPSButtonInjection();
    } else {
        document.addEventListener('DOMContentLoaded', runTPSButtonInjection);
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

    // Monitor and record unit selection for debugging
    function startUnitSelectionMonitoring() {
        if (!window.location.href.includes('/SiteMap/View')) {
            return;
        }

        console.log('🔍 Site Map: Starting unit selection monitoring...');
        console.log('🔍 Manually click a unit to see what data is sent!');

        // Monitor all XMLHttpRequest calls
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            this._method = method;
            this._url = url;
            console.log('🌐 XHR OPEN:', method, url);
            return originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(data) {
            console.log('🌐 XHR SEND:', this._method, this._url, 'Data:', data);
            
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 4) {
                    console.log('🌐 XHR RESPONSE:', this._method, this._url, 'Status:', this.status);
                    if (this.responseText) {
                        console.log('🌐 XHR RESPONSE TEXT:', this.responseText.substring(0, 500) + '...');
                    }
                    
                    // Check if this is the GetRoomData response
                    if (this.status === 200 && this._url && this._url.includes('/GetRoomData?')) {
                        console.log('🎯 GetRoomData response received...');
                        
                        // Only run automation if specifically requested by button click
                        if (window.uhAutomationActive) {
                            console.log('🎯 Automation mode active - triggering status change...');
                            
                            // Only run save test once per unit selection
                            if (!window.saveTestInProgress) {
                                window.saveTestInProgress = true;
                                
                                setTimeout(() => {
                                    setUnitStatusToNeedsCleaning();
                                }, 1000); // Wait for UI to update after data load
                                
                                // Also run Save button test for debugging (only once)
                                setTimeout(() => {
                                    console.log('🔍 Running Save button test after GetRoomData...');
                                    if (window.testSaveButton) {
                                        window.testSaveButton();
                                    }
                                    
                                    // Reset flags after test completes
                                    setTimeout(() => {
                                        window.saveTestInProgress = false;
                                        window.uhAutomationActive = false; // Disable automation after completion
                                        console.log('✅ Automation workflow completed and disabled');
                                    }, 5000);
                                }, 2000);
                            } else {
                                console.log('🛑 Save test already in progress, skipping duplicate GetRoomData...');
                            }
                        } else {
                            console.log('🔍 GetRoomData received but automation not active - skipping status change');
                        }
                    }
                }
            });
            
            return originalXHRSend.apply(this, arguments);
        };

        // Monitor fetch requests
        const originalFetch = window.fetch;
        window.fetch = function() {
            console.log('🌐 FETCH:', arguments[0], arguments[1]);
            return originalFetch.apply(this, arguments).then(response => {
                console.log('🌐 FETCH RESPONSE:', response.url, response.status);
                return response;
            });
        };

        // Monitor knockout.js function calls
        if (window.ko) {
            const originalApplyBindings = window.ko.applyBindings;
            window.ko.applyBindings = function() {
                console.log('🎯 KO applyBindings called with:', arguments);
                return originalApplyBindings.apply(this, arguments);
            };
        }

        // Monitor clicks on unit links
        document.addEventListener('click', function(event) {
            const target = event.target;
            if (target.tagName === 'A' && target.getAttribute('data-bind') && target.getAttribute('data-bind').includes('updateUnitInfo')) {
                console.log('🎯 UNIT LINK CLICKED!');
                console.log('🎯 Element:', target);
                console.log('🎯 Unit Number:', target.textContent);
                console.log('🎯 Data-bind:', target.getAttribute('data-bind'));
                
                // Try to get the knockout context
                if (window.ko) {
                    const context = window.ko.contextFor(target);
                    console.log('🎯 Knockout Context:', context);
                    console.log('🎯 Context $data:', context.$data);
                    console.log('🎯 Context $parent:', context.$parent);
                    console.log('🎯 Context $root:', context.$root);
                    
                    // Log the actual data object being passed
                    if (context.$data) {
                        console.log('🎯 Unit Data Object:', JSON.stringify(context.$data, null, 2));
                    }
                }
            }
        }, true);

        // Monitor all function calls on potential viewmodel objects
        function wrapFunction(obj, funcName) {
            if (obj && typeof obj[funcName] === 'function') {
                const originalFunc = obj[funcName];
                obj[funcName] = function() {
                    console.log(`🎯 ${funcName} called with:`, arguments);
                    const result = originalFunc.apply(this, arguments);
                    console.log(`🎯 ${funcName} returned:`, result);
                    return result;
                };
            }
        }

        // Look for potential viewmodel and wrap its functions
        setTimeout(() => {
            const table = document.querySelector('#unitsTable');
            if (table && window.ko) {
                const context = window.ko.contextFor(table);
                if (context && context.$root) {
                    console.log('🎯 Found root context, wrapping updateUnitInfo...');
                    wrapFunction(context.$root, 'updateUnitInfo');
                    wrapFunction(context.$root, 'selectUnit');
                    wrapFunction(context.$root, 'roomDetail');
                }
            }
        }, 2000);

        // Log window properties that might be relevant
        console.log('🔍 Window properties check:');
        console.log('🔍 window.viewModel:', window.viewModel);
        console.log('🔍 window.ko:', window.ko);
        console.log('🔍 window.jQuery:', window.jQuery);
    }

    // Test function to manually debug Save button (call this in console: testSaveButton())
    window.testSaveButton = function() {
        console.log('🔍 Testing Save button detection...');
        
        // Method 1: Exact data-bind match
        const saveButton1 = document.querySelector('button[data-bind*="roomDetail().updateRoomDetails"]');
        console.log('Method 1 - Exact data-bind:', saveButton1);
        
        // Method 2: Any data-bind with updateRoomDetails
        const saveButton2 = document.querySelector('button[data-bind*="updateRoomDetails"]');
        console.log('Method 2 - Any updateRoomDetails:', saveButton2);
        
        // Method 3: All buttons with Save text
        const allButtons = document.querySelectorAll('button');
        console.log('Method 3 - All buttons found:', allButtons.length);
        
        const saveButtons = [];
        allButtons.forEach((btn, index) => {
            const text = (btn.textContent || btn.innerText || '').trim();
            const dataBind = btn.getAttribute('data-bind') || '';
            console.log(`Button ${index}: Text="${text}", DataBind="${dataBind}"`);
            if (text.toLowerCase().includes('save')) {
                saveButtons.push(btn);
            }
        });
        
        console.log('Save buttons found by text:', saveButtons);
        
        // Method 4: Look in table cells
        const tableCells = document.querySelectorAll('td');
        console.log('Method 4 - Checking table cells...');
        tableCells.forEach((cell, index) => {
            const button = cell.querySelector('button');
            if (button) {
                const text = (button.textContent || button.innerText || '').trim();
                const dataBind = button.getAttribute('data-bind') || '';
                if (text.toLowerCase().includes('save') || dataBind.includes('updateRoomDetails')) {
                    console.log(`Found Save button in cell ${index}:`, button);
                }
            }
        });
        
        // Try to click the first viable button
        if (saveButton1) {
            console.log('🎯 Clicking button from Method 1...');
            clickSaveButtonDirect(saveButton1);
        } else if (saveButton2) {
            console.log('🎯 Clicking button from Method 2...');
            clickSaveButtonDirect(saveButton2);
        } else if (saveButtons.length > 0) {
            console.log('🎯 Clicking button from Method 3...');
            clickSaveButtonDirect(saveButtons[0]);
        } else {
            console.log('❌ No Save button found!');
        }
    };

    // Direct button click function for testing
    function clickSaveButtonDirect(button) {
        console.log('🎯 Clicking Save button once:', button);
        
        // Visual feedback - change button style temporarily
        const originalStyle = button.style.cssText;
        button.style.border = '3px solid red';
        button.style.backgroundColor = 'yellow';
        
        // Standard click - this is working based on console output
        console.log('✅ Executing click...');
        button.click();
        
        // Restore original style after a moment
        setTimeout(() => {
            button.style.cssText = originalStyle;
            console.log('💾 Save button clicked successfully!');
        }, 1000);
    }

    // Function to click the Save button after status change
    function clickSaveButton() {
        console.log('🔧 Site Map: Looking for Save button...');
        console.log('🔧 uhAutomationActive:', window.uhAutomationActive);
        
        // Look for the Save button with the specific data-bind
        const saveButton = document.querySelector('button[data-bind*="roomDetail().updateRoomDetails"]');
        console.log('🔧 Save button found:', !!saveButton);
        
        if (saveButton) {
            console.log('🔧 Save button element:', saveButton);
            console.log('🔧 Save button visible:', saveButton.offsetParent !== null);
            console.log('🔧 Save button disabled:', saveButton.disabled);
            
            // Final status check before saving
            if (window.ko) {
                const context = window.ko.contextFor(saveButton);
                if (context && context.$data && context.$data.roomDetail) {
                    try {
                        const roomDetail = context.$data.roomDetail();
                        if (roomDetail && roomDetail.RoomStatusValue) {
                            const currentStatus = roomDetail.RoomStatusValue();
                            console.log('🔧 FINAL CHECK - Status before save:', currentStatus);
                            
                            if (currentStatus !== '4' && currentStatus !== 4) {
                                console.log('⚠️ Status is not 4! Setting it again before save...');
                                roomDetail.RoomStatusValue('4');
                                const recheck = roomDetail.RoomStatusValue();
                                console.log('🔧 Recheck after setting:', recheck);
                            }
                        }
                    } catch (e) {
                        console.log('🔧 Error checking status before save:', e);
                    }
                }
            }
            
            console.log('Site Map: Found Save button, simulating full click interaction...');
            
            // Simulate a complete user click interaction
            const rect = saveButton.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Focus the button first
            saveButton.focus();
            
            // Create and dispatch mouse events in sequence
            const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY,
                button: 0
            });
            
            const mouseUpEvent = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY,
                button: 0
            });
            
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY,
                button: 0
            });
            
            // Dispatch events in order
            saveButton.dispatchEvent(mouseDownEvent);
            setTimeout(() => {
                saveButton.dispatchEvent(mouseUpEvent);
                setTimeout(() => {
                    saveButton.dispatchEvent(clickEvent);
                    
                    // Also try direct knockout function call if available
                    if (window.ko) {
                        const context = window.ko.contextFor(saveButton);
                        if (context && context.$data && context.$data.roomDetail) {
                            const roomDetail = context.$data.roomDetail();
                            if (roomDetail && roomDetail.updateRoomDetails && typeof roomDetail.updateRoomDetails === 'function') {
                                console.log('Site Map: Also calling updateRoomDetails function directly');
                                try {
                                    roomDetail.updateRoomDetails();
                                } catch (e) {
                                    console.log('Site Map: Direct function call failed:', e);
                                }
                            }
                        }
                    }
                    
                    console.log('✅ Site Map: Save button click simulation completed!');
                    
                    // Add verification - check if any XHR requests were triggered
                    setTimeout(() => {
                        console.log('🔧 Verifying save operation after click...');
                    }, 1000);
                }, 10);
            }, 10);
            
        } else {
            console.log('❌ Site Map: Save button not found, searching for alternatives...');
            console.log('🔧 Available buttons on page:');
            document.querySelectorAll('button').forEach((btn, i) => {
                const text = (btn.textContent || btn.innerText || '').trim();
                const dataBind = btn.getAttribute('data-bind') || '';
                console.log(`🔧   Button ${i}: text="${text}", data-bind="${dataBind}"`);
            });
            
            // Alternative search methods
            const saveButtons = document.querySelectorAll('button');
            for (const button of saveButtons) {
                const buttonText = (button.textContent || button.innerText || '').trim().toLowerCase();
                if (buttonText === 'save') {
                    console.log('Site Map: Found Save button by text, simulating click...');
                    
                    // Simulate click on text-found button
                    button.focus();
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        button: 0
                    });
                    button.dispatchEvent(clickEvent);
                    console.log('✅ Site Map: Save button clicked via text search!');
                    return;
                }
            }
            
            // Try again after a delay if button not found
            console.log('Site Map: Save button not found, retrying in 1 second...');
            setTimeout(() => {
                clickSaveButton();
            }, 1000);
        }
    }

    // Function to set unit status to "Needs Cleaning"
    function setUnitStatusToNeedsCleaning() {
        console.log('🔧 Site Map: Setting unit status to Needs Cleaning...');
        console.log('🔧 Current URL:', window.location.href);
        console.log('🔧 uhAutomationActive:', window.uhAutomationActive);
        
        // Look for the VacantStatus dropdown
        const statusDropdown = document.getElementById('VacantStatus');
        console.log('🔧 VacantStatus dropdown found:', !!statusDropdown);
        
        if (statusDropdown) {
            console.log('🔧 Current dropdown value:', statusDropdown.value);
            console.log('🔧 Available options:');
            Array.from(statusDropdown.options).forEach((opt, i) => {
                console.log(`🔧   Option ${i}: value="${opt.value}", text="${opt.text}"`);
            });
            
            console.log('Site Map: Found VacantStatus dropdown');
            
            // Get the knockout context from the dropdown or its parent
            if (window.ko) {
                let context = window.ko.contextFor(statusDropdown);
                
                // If no context on dropdown, try the parent td element
                if (!context) {
                    const parentTd = statusDropdown.closest('td[data-bind*="roomDetail"]');
                    if (parentTd) {
                        context = window.ko.contextFor(parentTd);
                        console.log('Site Map: Found context from parent td element');
                    }
                }
                
                // If still no context, try any element with roomDetail binding
                if (!context) {
                    const roomDetailElements = document.querySelectorAll('[data-bind*="roomDetail"]');
                    for (const element of roomDetailElements) {
                        context = window.ko.contextFor(element);
                        if (context && context.$data) {
                            console.log('Site Map: Found context from roomDetail element');
                            break;
                        }
                    }
                }
                
                if (context && context.$data) {
                    console.log('Site Map: Found knockout context, looking for roomDetail function');
                    
                    // Try different ways to access roomDetail
                    let roomDetailFunction = null;
                    
                    // Method 1: Direct access
                    if (context.$data.roomDetail && typeof context.$data.roomDetail === 'function') {
                        roomDetailFunction = context.$data.roomDetail;
                        console.log('Site Map: Found roomDetail via direct access');
                    }
                    // Method 2: Through $root
                    else if (context.$root && context.$root.roomDetail && typeof context.$root.roomDetail === 'function') {
                        roomDetailFunction = context.$root.roomDetail;
                        console.log('Site Map: Found roomDetail via $root');
                    }
                    // Method 3: Through $parent
                    else if (context.$parent && context.$parent.roomDetail && typeof context.$parent.roomDetail === 'function') {
                        roomDetailFunction = context.$parent.roomDetail;
                        console.log('Site Map: Found roomDetail via $parent');
                    }
                    
                    if (roomDetailFunction) {
                        const roomDetail = roomDetailFunction();
                        if (roomDetail && roomDetail.RoomStatusValue && typeof roomDetail.RoomStatusValue === 'function') {
                            console.log('Site Map: Found RoomStatusValue observable, setting to 4');
                            roomDetail.RoomStatusValue('4');
                            console.log('✅ Site Map: Unit status set to Needs Cleaning via knockout observable!');
                            
                            // Verify it was set correctly first
                            setTimeout(() => {
                                const currentValue = roomDetail.RoomStatusValue();
                                console.log('🔧 Pre-save verification - RoomStatusValue is:', currentValue);
                                
                                if (currentValue === '4' || currentValue === 4) {
                                    console.log('✅ Status confirmed as 4, proceeding with save...');
                                    clickSaveButton();
                                } else {
                                    console.log('❌ Status not 4! Trying to set again...');
                                    roomDetail.RoomStatusValue('4');
                                    
                                    setTimeout(() => {
                                        const retryValue = roomDetail.RoomStatusValue();
                                        console.log('🔧 Retry verification - RoomStatusValue is:', retryValue);
                                        console.log('⚠️ Clicking save anyway...');
                                        clickSaveButton();
                                    }, 500);
                                }
                            }, 1500); // Increased delay to let observable settle
                            
                            // Final verification after save
                            setTimeout(() => {
                                const finalValue = roomDetail.RoomStatusValue();
                                console.log('Site Map: Final verification - RoomStatusValue is now:', finalValue);
                                if (finalValue === '4' || finalValue === 4) {
                                    console.log('✅ Site Map: Success - Observable value confirmed as 4');
                                } else {
                                    console.log('❌ Site Map: Warning - Observable value is', finalValue, 'instead of 4');
                                }
                            }, 3000);
                            
                            return;
                        } else {
                            console.log('Site Map: roomDetail found but no RoomStatusValue observable');
                            if (roomDetail) {
                                console.log('Site Map: roomDetail properties:', Object.keys(roomDetail));
                            }
                        }
                    } else {
                        console.log('Site Map: roomDetail function not found in context');
                        console.log('Site Map: Available properties:', Object.keys(context.$data || {}));
                    }
                } else {
                    console.log('Site Map: No knockout context found');
                }
            }
            
            // Fallback to DOM manipulation if knockout approach fails
            console.log('Site Map: Falling back to DOM manipulation');
            statusDropdown.focus();
            statusDropdown.value = '4';
            
            // Trigger events
            statusDropdown.dispatchEvent(new Event('focus', { bubbles: true }));
            statusDropdown.dispatchEvent(new Event('change', { bubbles: true }));
            statusDropdown.dispatchEvent(new Event('input', { bubbles: true }));
            statusDropdown.dispatchEvent(new Event('blur', { bubbles: true }));
            
            console.log('Site Map: DOM fallback completed');
            
            // After DOM change, click Save button
            setTimeout(() => {
                console.log('🔧 Calling clickSaveButton after DOM manipulation...');
                clickSaveButton();
            }, 500);
            
        } else {
            console.log('❌ Site Map: VacantStatus dropdown not found, retrying in 2 seconds...');
            console.log('🔧 Available elements with "Status" in ID:');
            document.querySelectorAll('[id*="Status"]').forEach(el => {
                console.log('🔧   Found element:', el.id, el.tagName, el);
            });
            console.log('🔧 Available select elements:');
            document.querySelectorAll('select').forEach(el => {
                console.log('🔧   Found select:', el.id || 'no-id', el.name || 'no-name', el);
            });
            
            setTimeout(() => {
                setUnitStatusToNeedsCleaning();
            }, 2000);
        }
    }

    // Auto-select a specific unit by unit number
    function selectUnit(unitNumber) {
        if (!window.location.href.includes('/SiteMap/View')) {
            return;
        }

        console.log('Site Map: Attempting to select unit', unitNumber);

        function trySelectUnit() {
            // Look for unit link in the table
            const unitLinks = document.querySelectorAll('a[data-bind*="updateUnitInfo"]');
            console.log('Found', unitLinks.length, 'unit links');
            
            // Log available units for debugging
            const availableUnits = Array.from(unitLinks).map(link => link.textContent.trim());
            console.log('Site Map: Available units on current page:', availableUnits.slice(0, 10), availableUnits.length > 10 ? '...' : ''); // Show first 10

            for (const link of unitLinks) {
                const linkText = link.textContent || link.innerText;
                if (linkText.trim() === unitNumber) {
                    console.log('Site Map: Found unit', unitNumber, 'clicking...', link);
                    link.click();
                    return true;
                }
            }

            // If not found, search through all pages to find the real unit data
            console.log('Site Map: Unit', unitNumber, 'not found in current table, searching all pages...');
            
            const affiliateMatch = window.location.href.match(/\/Affiliate\/([^\/]+)\//);
            if (affiliateMatch) {
                const affiliateId = affiliateMatch[1];
                searchAllPagesForUnit(unitNumber, affiliateId);
                return true; // Return true as we're attempting the search
            }

            console.log('Site Map: Could not select unit', unitNumber);
            return false;
        }

        // Helper function to generate a mock inventory ID
        function generateMockInventoryId(unitNumber) {
            // Create a deterministic but unique-looking ID based on unit number
            const base = unitNumber.padStart(8, '0');
            return `mock-${base}-${base}-${base}-${base}${base}`;
        }

        // Function to search all pages for the actual unit data - FIXED SEQUENTIAL VERSION
        function searchAllPagesForUnit(unitNumber, affiliateId) {
            console.log('Site Map: Starting fresh sequential search for unit', unitNumber);
            
            const pager = document.querySelector('.widget-pager select');
            if (!pager) {
                console.log('Site Map: No pagination found');
                return;
            }
            
            const totalPages = pager.options.length;
            console.log('Site Map: Will search', totalPages, 'pages sequentially...');
            
            let currentPageIndex = 0;
            let searchInProgress = false; // Reset search state
            
            function searchNextPage() {
                if (searchInProgress) {
                    console.log('Site Map: Search already in progress, skipping duplicate call');
                    return;
                }
                
                if (currentPageIndex >= totalPages) {
                    console.log('Site Map: Completed search - Unit', unitNumber, 'not found after checking all', totalPages, 'pages');
                    searchInProgress = false;
                    return;
                }
                
                searchInProgress = true;
                const pageNum = currentPageIndex + 1;
                console.log('Site Map: === SEARCHING PAGE', pageNum, 'of', totalPages, 'for unit', unitNumber, '===');
                
                // Check if we need to change page
                const currentPagerValue = pager.value;
                if (currentPagerValue !== pageNum.toString()) {
                    console.log('Site Map: Changing from page', currentPagerValue, 'to page', pageNum);
                    pager.value = pageNum.toString();
                    pager.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Wait for DOM to actually update with new units
                    let attempts = 0;
                    const maxAttempts = 10;
                    
                    function waitForPageUpdate() {
                        attempts++;
                        const unitLinks = document.querySelectorAll('a[data-bind*="updateUnitInfo"]');
                        const firstUnit = unitLinks.length > 0 ? unitLinks[0].textContent.trim() : '';
                        
                        console.log('Site Map: Attempt', attempts, '- First unit on page:', firstUnit, '(waiting for page', pageNum, 'to load)');
                        
                        // Check if the first unit makes sense for the page we're on
                        if (pageNum === 1 && firstUnit.startsWith('0')) {
                            console.log('Site Map: Page 1 loaded correctly');
                            checkCurrentPageForUnit();
                        } else if (pageNum === 2 && (firstUnit.startsWith('0') && parseInt(firstUnit) > 200)) {
                            console.log('Site Map: Page 2 loaded correctly');
                            checkCurrentPageForUnit();
                        } else if (pageNum === 3 && (firstUnit.startsWith('0') || firstUnit.startsWith('1'))) {
                            console.log('Site Map: Page 3 loaded correctly');
                            checkCurrentPageForUnit();
                        } else if (pageNum === 4 && firstUnit.startsWith('1')) {
                            console.log('Site Map: Page 4 loaded correctly');
                            checkCurrentPageForUnit();
                        } else if (pageNum === 5 && (firstUnit.startsWith('1') || firstUnit.startsWith('2'))) {
                            console.log('Site Map: Page 5 loaded correctly');
                            checkCurrentPageForUnit();
                        } else if (pageNum === 6 && firstUnit.startsWith('2') && parseInt(firstUnit) < 2500) {
                            console.log('Site Map: Page 6 loaded correctly');
                            checkCurrentPageForUnit();
                        } else if (pageNum === 7 && firstUnit.startsWith('2') && parseInt(firstUnit) >= 2500) {
                            console.log('Site Map: Page 7 loaded correctly');
                            checkCurrentPageForUnit();
                        } else if (attempts < maxAttempts) {
                            // Page not loaded yet, try again
                            setTimeout(waitForPageUpdate, 200);
                        } else {
                            console.log('Site Map: Timeout waiting for page', pageNum, 'to load, proceeding anyway');
                            checkCurrentPageForUnit();
                        }
                    }
                    
                    // Start waiting for page update
                    setTimeout(waitForPageUpdate, 100);
                } else {
                    // Already on correct page, check immediately
                    console.log('Site Map: Already on page', pageNum, ', checking units...');
                    checkCurrentPageForUnit();
                }
                
                function checkCurrentPageForUnit() {
                    const unitLinks = document.querySelectorAll('a[data-bind*="updateUnitInfo"]');
                    console.log('Site Map: Found', unitLinks.length, 'units on page', pageNum);
                    
                    // Get all unit numbers and filter out empty/invalid ones
                    const unitsOnPage = Array.from(unitLinks)
                        .map(link => (link.textContent || link.innerText || '').trim())
                        .filter(unit => unit && unit.length > 0 && !unit.includes('undefined'))
                        .map(unit => {
                            // Handle units like "2503 (2503-05)" - extract just the first number
                            const match = unit.match(/^(\d+)/);
                            return match ? match[1] : unit;
                        });
                    
                    console.log('Site Map: Clean units on page', pageNum, ':', unitsOnPage.join(', '));
                    
                    // Check if our target unit is in this list (case insensitive and trim whitespace)
                    const targetFound = unitsOnPage.some(unit => unit.toLowerCase().trim() === unitNumber.toLowerCase().trim());
                    console.log('Site Map: Is unit', unitNumber, 'on page', pageNum, '?', targetFound);
                    
                    if (targetFound) {
                        console.log('🎯 Site Map: Unit found in array! Looking for clickable link...');
                        // Find and click the specific unit
                        for (const link of unitLinks) {
                            const linkText = (link.textContent || link.innerText || '').trim();
                            const cleanLinkText = linkText.match(/^(\d+)/) ? linkText.match(/^(\d+)/)[1] : linkText;
                            
                            if (cleanLinkText === unitNumber) {
                                console.log('🎉 Site Map: SUCCESS! Found clickable unit', unitNumber, 'on page', pageNum, '- SELECTING NOW!');
                                searchInProgress = false;
                                
                                // Try knockout selection
                                if (window.ko) {
                                    const linkContext = window.ko.contextFor(link);
                                    if (linkContext && linkContext.$data) {
                                        const tableContext = window.ko.contextFor(document.querySelector('#unitsTable'));
                                        if (tableContext && tableContext.$root && tableContext.$root.updateUnitInfo) {
                                            console.log('Site Map: Using knockout to select unit');
                                            tableContext.$root.updateUnitInfo(linkContext.$data, {});
                                            
                                            // After unit selection, wait and set status to "Needs Cleaning"
                                            setTimeout(() => {
                                                setUnitStatusToNeedsCleaning();
                                            }, 1000);
                                            return;
                                        }
                                    }
                                }
                                
                                // Fallback to click
                                console.log('Site Map: Using click fallback');
                                link.click();
                                
                                // Unit selection complete - status change will be triggered by GetRoomData XHR response
                                return;
                            }
                        }
                        console.log('❌ Site Map: Unit found in list but no clickable link found!');
                    }
                    
                    // Debug: Show the range of units on this page
                    if (unitsOnPage.length > 0) {
                        const firstUnit = unitsOnPage[0];
                        const lastUnit = unitsOnPage[unitsOnPage.length - 1];
                        console.log('Site Map: Page', pageNum, 'unit range:', firstUnit, 'to', lastUnit);
                        
                        // Check if our target should be in this range
                        const targetNum = parseInt(unitNumber);
                        const firstNum = parseInt(firstUnit);
                        const lastNum = parseInt(lastUnit);
                        
                        if (targetNum >= firstNum && targetNum <= lastNum) {
                            console.log('🚨 Site Map: Unit', unitNumber, 'should be on this page based on range!');
                            console.log('Site Map: All units on page:', unitsOnPage);
                        }
                    }
                    
                    // Not found on this page, move to next
                    console.log('Site Map: Unit', unitNumber, 'not found on page', pageNum, ', advancing to next page...');
                    currentPageIndex++; // Move to next page
                    searchInProgress = false; // Reset flag
                    
                    // Continue to next page
                    setTimeout(() => {
                        searchNextPage();
                    }, 200);
                }
            }
            
            // Start the search
            searchNextPage();
        }

        // Try direct AJAX call if all else fails
        function tryDirectAjaxCall(unitNumber, affiliateId) {
            console.log('Site Map: Attempting direct AJAX call for unit', unitNumber);
            
            // We need to guess or find the RentableInventoryId
            // This is a last resort - may not work without the real ID
            const mockInventoryId = generateMockInventoryId(unitNumber);
            const ajaxUrl = `/Affiliate/${affiliateId}/SiteMap/GetRoomData?rentableInventoryID=${mockInventoryId}&_=${Date.now()}`;
            
            console.log('Site Map: Trying direct call to:', ajaxUrl);
            
            const xhr = new XMLHttpRequest();
            xhr.open('GET', ajaxUrl, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    console.log('Site Map: Direct AJAX response status:', xhr.status);
                    if (xhr.status === 200) {
                        console.log('Site Map: Success! Response:', xhr.responseText);
                    } else {
                        console.log('Site Map: Direct AJAX failed - this is expected without real RentableInventoryId');
                    }
                }
            };
            xhr.send();
        }

        // Try immediately
        if (trySelectUnit()) return;

        // Try multiple times with delays for dynamic content
        let attempts = 0;
        const maxAttempts = 10;
        const retryInterval = setInterval(() => {
            attempts++;
            console.log('Site Map: Unit selection attempt', attempts, 'of', maxAttempts);
            
            if (trySelectUnit()) {
                console.log('Site Map: Successfully selected unit', unitNumber);
                clearInterval(retryInterval);
            } else if (attempts >= maxAttempts) {
                console.log('Site Map: Failed to select unit', unitNumber, 'after', maxAttempts, 'attempts');
                clearInterval(retryInterval);
            }
        }, 1000);
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
                    messages.push({
                        title: `Late Fee Reminder (${daysLate} days late)`,
                        text: msg,
                        daysLate: daysLate
                    });
                }
                if (daysLate >= 5 && daysLate <= 999) {
                    let msg = `Hey ${firstName} this is ${employeeName} from U-Haul. The next step is to incur late fees and I REALLY don’t want that to happen. What can I do to help?`;
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
                            // Auto-press the SMS bubble icon button
                            const smsBtn = document.querySelector('.fa-comment-sms.sms-bubble-icon.texting');
                            if (smsBtn) smsBtn.click();
                            // Try to auto-fill the chat input after a short delay (wait for box to appear)
                            setTimeout(() => {
                                const chatInput = document.getElementById('chatUserInput');
                                if (chatInput) {
                                    chatInput.value = msgDiv.innerText;
                                    // Trigger input event for frameworks
                                    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }, 100);
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
                            return fullName;
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
                            // Auto-press the SMS bubble icon button
                            const smsBtn = document.querySelector('.fa-comment-sms.sms-bubble-icon.texting');
                            if (smsBtn) smsBtn.click();
                            // Try to auto-fill the chat input after a short delay (wait for box to appear)
                            setTimeout(() => {
                                const chatInput = document.getElementById('chatUserInput');
                                if (chatInput) {
                                    chatInput.value = msgText.innerText;
                                    // Trigger input event for frameworks
                                    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }, 100);
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
                    const notes = JSON.parse(localStorage.getItem('uhCustomNoteTemplates') || '[]');
                    // Handle migration from old format (just strings) to new format (objects)
                    if (notes.length > 0 && typeof notes[0] === 'string') {
                        const migrated = notes.map((text, index) => ({
                            name: `Custom Message ${index + 1}`,
                            message: text
                        }));
                        saveCustomNotes(migrated);
                        return migrated;
                    }
                    return notes;
                } catch (e) {
                    return [];
                }
            }
            function saveCustomNotes(arr) {
                localStorage.setItem('uhCustomNoteTemplates', JSON.stringify(arr));
            }

            // Save to Custom button will be added to the button row instead

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
                    opt.value = note.message;
                    opt.innerText = note.name;
                    opt.title = note.message; // Tooltip showing full message
                    customDropdown.appendChild(opt);
                });
                // Disable delete button if nothing selected
                if (deleteCustomBtn) {
                    deleteCustomBtn.disabled = !customDropdown.value;
                }
            }

            // Detect page type for identifier
            let pageId = '';
            if (/CollectionWorksheet|Autopay/.test(window.location.href) || document.querySelector('.management-report')) {
                pageId = '2'; // Collection Worksheet page
            } else {
                pageId = '1'; // Contract Notes page (default)
            }

            // Organize options into primary and alternate rows with page-specific identifiers
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
                            // Fix: trigger both 'input' and 'change' events for better framework compatibility
                            const inputEvent = new Event('input', { bubbles: true });
                            textarea.dispatchEvent(inputEvent);
                            const changeEvent = new Event('change', { bubbles: true });
                            textarea.dispatchEvent(changeEvent);
                            // For Collection Worksheet page, also trigger blur to force update
                            if (pageId === '2') {
                                textarea.blur();
                            }
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
            customDropdown.style.width = '180px';
            customDropdown.style.maxWidth = '180px';
            customDropdown.style.minWidth = '180px';
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
                // Trigger input and change events for framework compatibility
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                // For Collection Worksheet page, also trigger blur to force update
                if (pageId === '2') {
                    textarea.blur();
                }
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
                arr = arr.filter(note => note.message !== val);
                saveCustomNotes(arr);
                refreshCustomDropdown();
            };

            // Save to Custom button
            const saveCustomBtn = document.createElement('button');
            saveCustomBtn.type = 'button';
            saveCustomBtn.innerText = 'Save to Custom';
            saveCustomBtn.style.fontSize = '12px';
            saveCustomBtn.style.padding = '2px 10px';
            saveCustomBtn.style.borderRadius = '4px';
            saveCustomBtn.style.border = '1px solid #ffc107';
            saveCustomBtn.style.background = '#fff8dc';
            saveCustomBtn.style.color = '#856404';
            saveCustomBtn.style.cursor = 'pointer';
            saveCustomBtn.style.marginLeft = '2px';
            saveCustomBtn.style.whiteSpace = 'nowrap';
            saveCustomBtn.onclick = function() {
                const val = textarea.value.trim();
                if (!val) {
                    saveCustomBtn.innerText = 'Nothing to Save!';
                    setTimeout(() => { saveCustomBtn.innerText = 'Save to Custom'; }, 1000);
                    return;
                }
                
                const customName = prompt('Custom Message Name:', 'My Custom Message');
                if (!customName) return; // User cancelled
                
                let arr = getCustomNotes();
                // Check if message already exists
                const existingMessage = arr.find(note => note.message === val);
                if (existingMessage) {
                    saveCustomBtn.innerText = 'Already Exists';
                    setTimeout(() => { saveCustomBtn.innerText = 'Save to Custom'; }, 1000);
                    return;
                }
                
                // Check if name already exists
                const existingName = arr.find(note => note.name === customName);
                if (existingName) {
                    if (!confirm(`A message with the name "${customName}" already exists. Replace it?`)) {
                        return;
                    }
                    // Remove the existing one
                    arr = arr.filter(note => note.name !== customName);
                }
                
                arr.push({ name: customName, message: val });
                saveCustomNotes(arr);
                saveCustomBtn.innerText = 'Saved!';
                setTimeout(() => { saveCustomBtn.innerText = 'Save to Custom'; }, 1000);
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
                    // Trigger input and change events for framework compatibility
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    // For Collection Worksheet page, also trigger blur to force update
                    if (pageId === '2') {
                        textarea.blur();
                    }
                }
            };

            customRow.appendChild(payByBtn);
            customRow.appendChild(dateInput);
            btnContainer.appendChild(customRow);

            // Create a separate row for Custom Notes buttons below the "Customer will pay by" selector
            const customNotesRow = document.createElement('div');
            customNotesRow.style.display = 'flex';
            customNotesRow.style.flexDirection = 'row';
            customNotesRow.style.gap = '6px';
            customNotesRow.style.flexWrap = 'nowrap';
            customNotesRow.style.marginTop = '6px';
            customNotesRow.style.marginLeft = '0px';
            customNotesRow.style.paddingLeft = '0px';

            customNotesRow.appendChild(customDropdown);
            customNotesRow.appendChild(insertCustomBtn);
            customNotesRow.appendChild(deleteCustomBtn);
            customNotesRow.appendChild(saveCustomBtn);
            btnContainer.appendChild(customNotesRow);

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

    // Auto-run complete workflow if automation parameters are set
    function checkAndRunAutomation() {
        // Check if we're on the Site Map page
        if (!window.location.href.includes('/SiteMap/View')) {
            return;
        }
        
        console.log('🎯 Checking for automation parameters...');
        
        // Check if automation was requested from the button click (check localStorage)
        let automationParams = null;
        try {
            const stored = localStorage.getItem('uhAutomationParams');
            if (stored) {
                automationParams = JSON.parse(stored);
                console.log('🎯 Found automation parameters in localStorage:', automationParams);
            }
        } catch (e) {
            console.log('🎯 Error reading automation parameters:', e);
        }
        
        // Also check window property as fallback
        if (!automationParams && window.uhAutomationParams) {
            automationParams = window.uhAutomationParams;
            console.log('🎯 Found automation parameters in window:', automationParams);
        }
        
        if (automationParams && automationParams.automate) {
            const targetUnit = automationParams.targetUnit;
            console.log('🎯 Automation parameters found! Starting workflow for unit:', targetUnit);
            
            // Set automation active flag
            window.uhAutomationActive = true;
            console.log('🎯 Automation mode activated');
            
            // Clear the parameters so we don't run again
            localStorage.removeItem('uhAutomationParams');
            window.uhAutomationParams = null;
            
            // Wait for the page to fully load and vacant filter to be applied
            setTimeout(() => {
                console.log('🎯 Starting unit selection for:', targetUnit);
                selectUnit(targetUnit);
                
                // The rest of the workflow (status change and save) will be handled
                // by the existing XHR monitoring in the setUnitStatusToNeedsCleaning function
            }, 3000); // Give extra time for page load and vacant filter
        } else {
            console.log('🎯 No automation parameters found - manual mode');
        }
    }

    // --- Moveout Receipt Detection and Automation ---
    function checkForMoveoutReceipt() {
        console.log('🏠 === MOVEOUT DETECTION STARTING ===');
        console.log('🏠 Current URL:', window.location.href);
        console.log('🏠 Page title:', document.title);
        
        // Check if we're on a page that looks like a moveout receipt
        if (!window.location.href.includes('webselfstorage.com')) {
            console.log('🏠 Not on webselfstorage.com - skipping');
            return;
        }
        
        // Enhanced detection methods
        console.log('🏠 Checking for receipt indicators...');
        
        // Look for receipt indicators
        const receiptHeader = document.querySelector('[data-section="receipt - header"]');
        const receiptItems = document.querySelector('[data-section="receipt-line-items"]');
        const receiptTotal = document.querySelector('[data-section="receipt-total"]');
        
        console.log('🏠 Receipt header found:', !!receiptHeader);
        console.log('🏠 Receipt items found:', !!receiptItems);
        console.log('🏠 Receipt total found:', !!receiptTotal);
        
        // Alternative detection - look for move out record text
        const bodyText = document.body.textContent || document.body.innerText || '';
        const hasMoveOutRecord = bodyText.includes('MOVE OUT RECORD');
        const hasReceiptFormat = document.querySelector('[data-section*="receipt"]') !== null;
        const hasCustomerReceipt = bodyText.includes('Customer Receipt');
        const hasSignatureSection = document.querySelector('.section__signature') !== null;
        
        console.log('🏠 Body text contains "MOVE OUT RECORD":', hasMoveOutRecord);
        console.log('🏠 Has receipt format elements:', hasReceiptFormat);
        console.log('🏠 Contains "Customer Receipt":', hasCustomerReceipt);
        console.log('🏠 Has signature section:', hasSignatureSection);
        
        // Debug: Show what data-section elements exist
        const dataSections = document.querySelectorAll('[data-section]');
        console.log('🏠 Found data-section elements:');
        dataSections.forEach(el => {
            console.log('🏠   -', el.getAttribute('data-section'));
        });
        
        // Check for table with receipt data
        const tablesWithRoomHeader = Array.from(document.querySelectorAll('table')).filter(table => {
            const headerText = table.textContent || '';
            return headerText.includes('ROOM') && headerText.includes('DESCRIPTION');
        });
        console.log('🏠 Tables with ROOM/DESCRIPTION headers:', tablesWithRoomHeader.length);
        
        // Main detection logic
        const isReceiptPage = (hasMoveOutRecord && hasReceiptFormat) || 
                             (hasCustomerReceipt && hasMoveOutRecord) ||
                             (tablesWithRoomHeader.length > 0 && hasMoveOutRecord);
        
        console.log('🏠 Final decision - Is receipt page:', isReceiptPage);
        
        if (isReceiptPage) {
            console.log('✅ Moveout receipt detected!');
            
            // Extract unit numbers from the receipt
            const unitNumbers = extractUnitNumbersFromReceipt();
            console.log('🏠 Found unit numbers:', unitNumbers);
            
            if (unitNumbers.length > 0) {
                // Show popup for needs cleaning
                console.log('🏠 Will show popup in 1 second...');
                setTimeout(() => {
                    showNeedsCleaningPopup(unitNumbers);
                }, 1000); // Small delay to ensure page is fully loaded
            } else {
                console.log('❌ No unit numbers found in receipt');
            }
        } else {
            console.log('❌ Not detected as a moveout receipt page');
        }
        
        console.log('🏠 === MOVEOUT DETECTION COMPLETE ===');
    }
    
    function extractUnitNumbersFromReceipt() {
        console.log('🔍 Starting unit number extraction...');
        const unitNumbers = [];
        
        // Method 1: Look SPECIFICALLY for "MOVE OUT RECORD" entries
        console.log('🔍 Method 1: Searching for units with "MOVE OUT RECORD"...');
        const receiptTable = document.querySelector('[data-section="receipt-line-items"] table');
        if (receiptTable) {
            console.log('🔍 Found receipt table:', receiptTable);
            const rows = receiptTable.querySelectorAll('tr');
            console.log('🔍 Table has', rows.length, 'rows');
            
            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td');
                console.log(`🔍 Row ${index}: ${cells.length} cells`);
                
                if (cells.length >= 2) {
                    const firstCell = cells[0].textContent.trim();
                    const secondCell = cells[1].textContent.trim();
                    
                    console.log(`🔍 Row ${index}: "${firstCell}" | "${secondCell}"`);
                    
                    // ONLY look for "MOVE OUT RECORD" entries (not RENT entries)
                    if (secondCell.includes('MOVE OUT RECORD')) {
                        console.log(`✅ Found MOVE OUT RECORD row: "${firstCell}" | "${secondCell}"`);
                        // First cell should be the unit number
                        if (firstCell.match(/^\d{4}$/)) { // 4-digit unit number
                            if (!unitNumbers.includes(firstCell)) {
                                unitNumbers.push(firstCell);
                                console.log(`✅ Added unit number: ${firstCell}`);
                            }
                        } else {
                            console.log(`❌ First cell "${firstCell}" doesn't look like a 4-digit unit number`);
                        }
                    } else if (secondCell.includes('RENT')) {
                        console.log(`⏩ Skipping RENT row (not a moveout): "${firstCell}" | "${secondCell}"`);
                    }
                }
            });
        } else {
            console.log('❌ No receipt table found with [data-section="receipt-line-items"]');
        }
        
        // Method 2: Look for patterns like "1202</td><td>MOVE OUT RECORD"
        console.log('🔍 Method 2: Searching for HTML pattern with MOVE OUT RECORD...');
        if (unitNumbers.length === 0) {
            const bodyHTML = document.body.innerHTML;
            // Look for pattern: >1202</td><td...>MOVE OUT RECORD
            const moveOutPattern = />(\d{4})<\/td><td[^>]*>MOVE OUT RECORD/g;
            let match;
            
            while ((match = moveOutPattern.exec(bodyHTML)) !== null) {
                const unitNumber = match[1];
                console.log(`✅ Found unit ${unitNumber} with MOVE OUT RECORD in HTML`);
                if (!unitNumbers.includes(unitNumber)) {
                    unitNumbers.push(unitNumber);
                    console.log(`✅ Added unit number: ${unitNumber}`);
                }
            }
        }
        
        // Method 3: Text search specifically for "MOVE OUT RECORD" with preceding unit
        console.log('🔍 Method 3: Text pattern search for MOVE OUT RECORD...');
        if (unitNumbers.length === 0) {
            const bodyText = document.body.textContent;
            // Look for pattern: "1202" followed by "MOVE OUT RECORD" within reasonable distance
            const moveOutMatches = bodyText.match(/(\d{4})[^\d]*MOVE OUT RECORD/g);
            console.log('🔍 Move out pattern matches found:', moveOutMatches);
            
            if (moveOutMatches) {
                moveOutMatches.forEach(match => {
                    console.log('🔍 Processing match:', match);
                    const unitMatch = match.match(/(\d{4})/);
                    if (unitMatch && !unitNumbers.includes(unitMatch[1])) {
                        unitNumbers.push(unitMatch[1]);
                        console.log(`✅ Added unit number from text search: ${unitMatch[1]}`);
                    }
                });
            }
        }
        
        console.log('🔍 Final unit numbers found:', unitNumbers);
        return unitNumbers;
    }
    
    function showNeedsCleaningPopup(unitNumbers) {
        // Don't show if already shown
        if (document.getElementById('needsCleaningModal')) {
            return;
        }
        
        console.log('🏠 Showing needs cleaning popup for units:', unitNumbers);
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'needsCleaningModal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 100000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        // Create modal content
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 500px;
            font-family: Arial, sans-serif;
        `;
        
        const unitsText = unitNumbers.length === 1 
            ? `Unit ${unitNumbers[0]}` 
            : `Units ${unitNumbers.join(', ')}`;
            
        modal.innerHTML = `
            <h2 style="color: #ff6a00; margin-bottom: 20px;">🏠 Moveout Complete</h2>
            <p style="font-size: 18px; margin-bottom: 25px;">
                Move <strong>${unitsText}</strong> to Needs Cleaning list?
            </p>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="needsCleaningYes" style="
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    font-weight: bold;
                ">✅ Yes, Mark for Cleaning</button>
                <button id="needsCleaningNo" style="
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    font-weight: bold;
                ">❌ No, Skip</button>
            </div>
        `;
        
        // Add click handlers
        modal.querySelector('#needsCleaningYes').onclick = function() {
            console.log('🏠 User confirmed - marking units for cleaning:', unitNumbers);
            overlay.remove();
            
            // For each unit, trigger the Site Map automation
            unitNumbers.forEach((unitNumber, index) => {
                setTimeout(() => {
                    triggerNeedsCleaningAutomation(unitNumber);
                }, index * 2000); // Stagger if multiple units
            });
        };
        
        modal.querySelector('#needsCleaningNo').onclick = function() {
            console.log('🏠 User declined - skipping needs cleaning');
            overlay.remove();
        };
        
        // Close on overlay click
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                overlay.remove();
            }
        };
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
    
    function triggerNeedsCleaningAutomation(unitNumber) {
        console.log(`🎯 Triggering needs cleaning automation for unit ${unitNumber}...`);
        
        // Extract affiliate ID from current URL
        let affiliateId = null;
        const patterns = [
            /\/Affiliate\/([^\/]+)\//,
            /\/Affiliate\/([^\/\?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = window.location.href.match(pattern);
            if (match) {
                affiliateId = match[1];
                break;
            }
        }
        
        if (!affiliateId) {
            console.log('❌ Could not extract affiliate ID from URL');
            return;
        }
        
        const siteMapUrl = `/Affiliate/${affiliateId}/SiteMap/View`;
        
        // Store automation parameters in localStorage
        localStorage.setItem('uhAutomationParams', JSON.stringify({
            targetUnit: unitNumber,
            automate: true,
            timestamp: Date.now(),
            source: 'moveout'
        }));
        
        console.log(`🎯 Opening Site Map for unit ${unitNumber}...`);
        
        // Open Site Map in new tab
        window.open(siteMapUrl, '_blank');
    }

    // Initialize the script
    waitForDateAndInsertDropdown();
    addNoteQuickButtons();
    startUnitSelectionMonitoring();
    checkAndRunAutomation();
    
    // Check for moveout receipt multiple times in case content loads dynamically
    checkForMoveoutReceipt();
    setTimeout(checkForMoveoutReceipt, 1000);
    setTimeout(checkForMoveoutReceipt, 3000);
    setTimeout(checkForMoveoutReceipt, 5000);
}());


