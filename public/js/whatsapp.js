document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = window.location.origin + '/api/whatsapp';
    let isConnected = false;
    let allChats = [];
    let activeChatJid = null;
    let activeFilter = 'all';
    let bulkSelectedGroups = new Set();
    let attachedChatImageBase64 = null;
    let attachedBulkImageBase64 = null;
    let isSending = false;

    // DOM Elements
    const chatsListContainer = document.getElementById('chats-list-container');
    const chatSearchInput = document.getElementById('chat-search');

    const activeChatAvatar = document.getElementById('active-chat-avatar');
    const activeChatTitle = document.getElementById('active-chat-title');
    const activeChatSubtext = document.getElementById('active-chat-subtext');
    const conversationArea = document.getElementById('conversation-area');
    const btnScrollBottom = document.getElementById('btn-scroll-bottom');
    const scrollUnreadBadge = document.getElementById('scroll-unread-badge');
    let unreadBelowCount = 0;

    const formChatSend = document.getElementById('form-chat-send');
    const chatMessageInput = document.getElementById('chat-message-input');
    const btnAttachClip = document.getElementById('btn-attach-clip');
    const chatFileInput = document.getElementById('chat-file-input');

    const accountStatusBadge = document.getElementById('account-status-badge');
    const accountNameDisplay = document.getElementById('account-name-display');
    const qrModal = document.getElementById('qr-modal');
    const btnWaAuth = document.getElementById('btn-wa-auth');
    const btnCloseQr = document.getElementById('btn-close-qr');
    const btnResync = document.getElementById('btn-resync');

    // New Chat Modal Elements
    const btnOpenNewChat = document.getElementById('btn-open-new-chat');
    const newChatModal = document.getElementById('new-chat-modal');
    const btnCloseNewChat = document.getElementById('btn-close-new-chat');
    const formAddContact = document.getElementById('form-add-contact');
    const newContactPhone = document.getElementById('new-contact-phone');
    const newContactName = document.getElementById('new-contact-name');

    // Bulk Drawer Elements
    const btnToggleBulk = document.getElementById('btn-toggle-bulk');
    const bulkDrawer = document.getElementById('bulk-drawer');
    const btnCloseBulk = document.getElementById('btn-close-bulk');
    const bulkGroupList = document.getElementById('bulk-group-list');
    const bulkSelectedCount = document.getElementById('bulk-selected-count');
    const btnBulkSelectAll = document.getElementById('btn-bulk-select-all');
    const btnBulkDeselectAll = document.getElementById('btn-bulk-deselect-all');
    const formBulkMsg = document.getElementById('form-bulk-msg');
    const bulkImageInput = document.getElementById('bulk-image-input');
    const btnStartBulk = document.getElementById('btn-start-bulk');
    const bulkProgressSection = document.getElementById('bulk-progress-section');
    const bulkProgressBarInner = document.getElementById('bulk-progress-bar-inner');
    const bulkProgressText = document.getElementById('bulk-progress-text');
    const bulkConsoleLog = document.getElementById('bulk-console-log');

    // ------------------------------------------------------------------
    // Smart Centered Modal & Center Notification System
    // ------------------------------------------------------------------

    function playNotificationSound(type) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            if (type === 'error') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(210, now + 0.15);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                osc.start(now);
                osc.stop(now + 0.18);
            } else if (type === 'warning') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(540, now + 0.12);
                gain.gain.setValueAtTime(0.07, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
            } else {
                // Success / Info
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, now); // D5
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5
                gain.gain.setValueAtTime(0.07, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                osc.start(now);
                osc.stop(now + 0.18);
            }
        } catch (e) {
            // Audio context not allowed or supported
        }
    }

    function showToast(message, type = 'success', duration = 3200, customTitle = '') {
        let container = document.getElementById('wa-smart-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'wa-smart-toast-container';
            container.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;pointer-events:none;';
            document.body.appendChild(container);
        } else {
            container.style.position = 'fixed';
            container.style.top = '50%';
            container.style.left = '50%';
            container.style.transform = 'translate(-50%, -50%)';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.gap = '12px';
            container.style.pointerEvents = 'none';
        }

        const toast = document.createElement('div');
        const isDark = document.documentElement.classList.contains('dark');
        
        let iconSvg = '';
        let badgeText = customTitle || 'NOTIFICATION';
        let borderColor = 'rgba(0,168,132,0.45)';
        let shadowColor = 'rgba(0,168,132,0.25)';
        let iconBg = 'rgba(0,168,132,0.14)';
        let accentColor = '#00a884';

        if (type === 'error') {
            if (!customTitle) badgeText = 'ERROR';
            borderColor = 'rgba(239,68,68,0.5)';
            shadowColor = 'rgba(239,68,68,0.25)';
            iconBg = 'rgba(239,68,68,0.14)';
            accentColor = '#ef4444';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        } else if (type === 'warning') {
            if (!customTitle) badgeText = 'ATTENTION';
            borderColor = 'rgba(245,158,11,0.5)';
            shadowColor = 'rgba(245,158,11,0.25)';
            iconBg = 'rgba(245,158,11,0.14)';
            accentColor = '#f59e0b';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else if (type === 'info') {
            if (!customTitle) badgeText = 'INFORMATION';
            borderColor = 'rgba(59,130,246,0.5)';
            shadowColor = 'rgba(59,130,246,0.25)';
            iconBg = 'rgba(59,130,246,0.14)';
            accentColor = '#3b82f6';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        } else {
            if (!customTitle) badgeText = 'SUCCESS';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
        }

        toast.className = 'wa-smart-center-toast';
        toast.style.cssText = `
            pointer-events: auto;
            position: relative;
            display: flex;
            flex-direction: column;
            width: min(420px, 90vw);
            border-radius: 18px;
            padding: 16px 20px 18px 20px;
            background: ${isDark ? 'linear-gradient(145deg, rgba(17, 27, 33, 0.96), rgba(11, 20, 26, 0.98))' : 'linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(240, 242, 245, 0.96))'};
            color: ${isDark ? '#e9edef' : '#0f172a'};
            border: 1px solid ${borderColor};
            box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 24px ${shadowColor};
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            animation: waToastCenterPop 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            overflow: hidden;
            user-select: none;
            cursor: pointer;
        `;

        toast.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:14px;width:100%;">
                <div style="width:42px;height:42px;border-radius:12px;background:${iconBg};border:1px solid ${borderColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    ${iconSvg}
                </div>
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="font-size:10px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:${accentColor};background:${iconBg};padding:2px 8px;border-radius:6px;border:1px solid ${borderColor};">
                            ${escapeHtml(badgeText)}
                        </span>
                        <button type="button" class="wa-toast-dismiss-btn" style="background:transparent;border:none;color:${isDark ? '#8696a0' : '#64748b'};font-size:15px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;transition:all 0.15s;">✕</button>
                    </div>
                    <div style="font-size:13.5px;font-weight:600;line-height:1.45;color:${isDark ? '#e9edef' : '#0f172a'};word-break:break-word;margin-top:2px;">
                        ${escapeHtml(message)}
                    </div>
                </div>
            </div>
            <!-- Progress Line Bar -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};overflow:hidden;">
                <div class="notif-progress-inner" style="height:100%;background:${accentColor};animation-duration:${duration}ms;"></div>
            </div>
        `;

        container.appendChild(toast);
        playNotificationSound(type);

        let dismissTimeout = null;
        let isDismissed = false;

        const dismiss = () => {
            if (isDismissed) return;
            isDismissed = true;
            toast.style.animation = 'waToastCenterFadeOut 0.22s cubic-bezier(0.4, 0, 1, 1) forwards';
            setTimeout(() => {
                toast.remove();
            }, 230);
        };

        dismissTimeout = setTimeout(dismiss, duration);

        // Hover pause
        toast.addEventListener('mouseenter', () => {
            if (dismissTimeout) clearTimeout(dismissTimeout);
            const bar = toast.querySelector('.notif-progress-inner');
            if (bar) bar.style.animationPlayState = 'paused';
        });

        toast.addEventListener('mouseleave', () => {
            const bar = toast.querySelector('.notif-progress-inner');
            if (bar) bar.style.animationPlayState = 'running';
            dismissTimeout = setTimeout(dismiss, 1200);
        });

        // Close on X button click or card click
        const closeBtn = toast.querySelector('.wa-toast-dismiss-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismiss();
            });
        }
    }
    window.showToast = showToast;
    window.showNotification = showToast;

    // Smart override of native window.alert to render our center notification
    window.alert = function(msg) {
        if (msg === undefined || msg === null) return;
        const text = String(msg);
        let type = 'info';
        if (/success|saved|done|completed|✅/i.test(text)) {
            type = 'success';
        } else if (/error|failed|fault|invalid|cannot|❌/i.test(text)) {
            type = 'error';
        } else if (/warn|please|must|required|select|write|attach|pick|future|⚠️/i.test(text)) {
            type = 'warning';
        }
        showToast(text, type, 3600);
    };

    function waPrompt({ title, desc, label, placeholder, defaultValue, icon = '📝', confirmText = 'Save', cancelText = 'Cancel' }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('wa-smart-modal');
            if (!modal) {
                const nativeRes = prompt(title || desc, defaultValue || '');
                return resolve(nativeRes);
            }

            const iconEl = document.getElementById('smart-modal-icon');
            const titleEl = document.getElementById('smart-modal-title');
            const descEl = document.getElementById('smart-modal-desc');
            const inputWrap = document.getElementById('smart-modal-input-wrap');
            const inputLabel = document.getElementById('smart-modal-input-label');
            const inputEl = document.getElementById('smart-modal-input');
            const btnCancel = document.getElementById('smart-modal-btn-cancel');
            const btnConfirm = document.getElementById('smart-modal-btn-confirm');

            iconEl.textContent = icon;
            titleEl.textContent = title;
            descEl.textContent = desc || '';
            descEl.style.display = desc ? 'block' : 'none';

            inputWrap.style.display = 'flex';
            inputLabel.textContent = label || 'Name:';
            inputEl.placeholder = placeholder || '';
            inputEl.value = defaultValue || '';

            btnCancel.textContent = cancelText;
            btnConfirm.textContent = confirmText;
            btnConfirm.style.background = 'linear-gradient(135deg, #00a884, #00876a)';

            const wrapper = document.querySelector('.wa-wrapper');
            if (wrapper) wrapper.scrollLeft = 0;
            window.scrollTo({ left: 0, top: 0 });

            modal.classList.remove('hidden');
            modal.style.display = 'flex';

            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 60);

            function cleanup() {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                btnConfirm.onclick = null;
                btnCancel.onclick = null;
                inputEl.onkeydown = null;
                modal.onclick = null;
                const wrap = document.querySelector('.wa-wrapper');
                if (wrap) wrap.scrollLeft = 0;
                window.scrollTo({ left: 0, top: 0 });
            }

            btnConfirm.onclick = (e) => {
                e.stopPropagation();
                const val = inputEl.value;
                cleanup();
                resolve(val);
            };

            btnCancel.onclick = (e) => {
                e.stopPropagation();
                cleanup();
                resolve(null);
            };

            modal.onclick = (e) => {
                if (e.target === modal) {
                    cleanup();
                    resolve(null);
                }
            };

            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    btnConfirm.click();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    btnCancel.click();
                }
            };
        });
    }
    window.waPrompt = waPrompt;

    function waConfirm({ title, desc, icon = '❓', confirmText = 'Yes, Continue', cancelText = 'Cancel', isDanger = false }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('wa-smart-modal');
            if (!modal) {
                const nativeRes = confirm(title + (desc ? '\n' + desc : ''));
                return resolve(nativeRes);
            }

            const iconEl = document.getElementById('smart-modal-icon');
            const titleEl = document.getElementById('smart-modal-title');
            const descEl = document.getElementById('smart-modal-desc');
            const inputWrap = document.getElementById('smart-modal-input-wrap');
            const btnCancel = document.getElementById('smart-modal-btn-cancel');
            const btnConfirm = document.getElementById('smart-modal-btn-confirm');

            iconEl.textContent = icon;
            titleEl.textContent = title;
            descEl.textContent = desc || '';
            descEl.style.display = desc ? 'block' : 'none';

            inputWrap.style.display = 'none';

            btnCancel.textContent = cancelText;
            btnConfirm.textContent = confirmText;
            btnConfirm.style.background = isDanger 
                ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                : 'linear-gradient(135deg, #00a884, #00876a)';

            const wrapper = document.querySelector('.wa-wrapper');
            if (wrapper) wrapper.scrollLeft = 0;
            window.scrollTo({ left: 0, top: 0 });

            modal.classList.remove('hidden');
            modal.style.display = 'flex';

            function cleanup() {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                btnConfirm.onclick = null;
                btnCancel.onclick = null;
                modal.onclick = null;
                const wrap = document.querySelector('.wa-wrapper');
                if (wrap) wrap.scrollLeft = 0;
                window.scrollTo({ left: 0, top: 0 });
            }

            btnConfirm.onclick = (e) => {
                e.stopPropagation();
                cleanup();
                resolve(true);
            };

            btnCancel.onclick = (e) => {
                e.stopPropagation();
                cleanup();
                resolve(false);
            };

            modal.onclick = (e) => {
                if (e.target === modal) {
                    cleanup();
                    resolve(false);
                }
            };
        });
    }
    window.waConfirm = waConfirm;

    // ------------------------------------------------------------------
    // Live Server Polling & Status
    // ------------------------------------------------------------------

    async function pollWhatsAppStatus() {
        try {
            const res = await fetch(`${API_BASE}/status`);
            const data = await res.json();
            console.log('[WA] status:', data.status, 'hasQR:', data.hasQR);

            const dot = document.getElementById('account-online-dot');
            if (data.status === 'connected') {
                if (!isConnected) {
                    isConnected = true;
                    if (accountStatusBadge) {
                        accountStatusBadge.style.color = '#00a884';
                        accountStatusBadge.style.background = 'rgba(0,168,132,0.1)';
                        accountStatusBadge.style.borderColor = 'rgba(0,168,132,0.25)';
                        accountStatusBadge.innerHTML = '● Connected';
                    }
                    if (dot) { dot.style.background = '#00a884'; }
                    if (accountNameDisplay) {
                        accountNameDisplay.textContent = `${data.user.name || 'WhatsApp Account'}`;
                    }
                    if (data.user.profilePic) {
                        const avatarEl = document.getElementById('my-profile-avatar');
                        if (avatarEl) {
                            avatarEl.innerHTML = `<img src="${data.user.profilePic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML='👤'">`;
                        }
                    }
                    if (qrModal) {
                        qrModal.classList.add('hidden');
                    }
                    if (btnWaAuth) {
                        btnWaAuth.textContent = 'Logout';
                        btnWaAuth.style.color = '#f87171';
                        btnWaAuth.style.borderColor = 'rgba(248,113,113,0.4)';
                    }
                }
                fetchChats();
                if (activeChatJid) {
                    fetchConversationMessages();
                }
            } else if (data.status === 'qr_ready' || data.hasQR) {
                if (isConnected) isConnected = false;
                if (dot) { dot.style.background = '#facc15'; }
                if (accountStatusBadge) {
                    accountStatusBadge.style.color = '#facc15';
                    accountStatusBadge.style.background = 'rgba(250,204,21,0.1)';
                    accountStatusBadge.style.borderColor = 'rgba(250,204,21,0.25)';
                    accountStatusBadge.innerHTML = '● Scan QR';
                }
                if (accountNameDisplay) {
                    accountNameDisplay.textContent = 'Scan QR Code';
                }
                if (btnWaAuth) {
                    btnWaAuth.textContent = 'Login';
                    btnWaAuth.style.color = '#00a884';
                    btnWaAuth.style.borderColor = 'rgba(0,168,132,0.4)';
                }
                if (qrModal && (qrModal.classList.contains('hidden') || qrModal.style.display === 'none')) {
                    openQrModal();
                }
            } else {
                if (isConnected) { isConnected = false; }
                if (dot) { dot.style.background = '#f87171'; }
                if (accountStatusBadge) {
                    accountStatusBadge.style.color = '#f87171';
                    accountStatusBadge.style.background = 'rgba(248,113,113,0.1)';
                    accountStatusBadge.style.borderColor = 'rgba(248,113,113,0.2)';
                    accountStatusBadge.innerHTML = '● Disconnected';
                }
                if (accountNameDisplay) {
                    accountNameDisplay.textContent = 'Disconnected';
                }
                if (btnWaAuth) {
                    btnWaAuth.textContent = 'Login';
                    btnWaAuth.style.color = '#00a884';
                    btnWaAuth.style.borderColor = 'rgba(0,168,132,0.4)';
                }
            }
        } catch (err) {}
    }

    function openQrModal() {
        console.log('[WA] openQrModal called, qrModal:', qrModal);
        if (qrModal) {
            if (qrModal.parentNode !== document.body) {
                document.body.appendChild(qrModal);
            }
            qrModal.classList.remove('hidden');
            qrModal.style.display = 'flex';
            qrModal.style.position = 'fixed';
            qrModal.style.inset = '0';
            qrModal.style.zIndex = '99999';
        }
        const qrImgElement = document.getElementById('qr-code-img') || document.querySelector('#qr-modal img');
        const qrSpinner = document.getElementById('qr-loading-spinner');
        const hasSrc = qrImgElement && qrImgElement.getAttribute('src');
        if (qrImgElement) qrImgElement.style.display = hasSrc ? 'block' : 'none';
        if (qrSpinner) qrSpinner.style.display = hasSrc ? 'none' : 'flex';
        fetchLiveQR();
    }

    async function fetchLiveQR() {
        if (!qrModal || qrModal.classList.contains('hidden')) return;
        console.log('[WA] fetchLiveQR fetching:', `${API_BASE}/qr`);
        try {
            const res = await fetch(`${API_BASE}/qr`);
            const data = await res.json();
            console.log('[WA] /qr response:', data.qrDataURL ? 'has QR' : 'no QR', 'status:', data.status);
            const qrImgElement = document.getElementById('qr-code-img') || document.querySelector('#qr-modal img');
            const qrSpinner = document.getElementById('qr-loading-spinner');

            if (data.qrDataURL) {
                console.log('[WA] Setting QR img, qrImgElement:', qrImgElement, 'qrSpinner:', qrSpinner);
                if (qrImgElement) {
                    qrImgElement.src = data.qrDataURL;
                    qrImgElement.style.display = 'block';
                    qrImgElement.style.visibility = 'visible';
                    console.log('[WA] img display now:', qrImgElement.style.display, 'src set:', qrImgElement.src.substring(0,30));
                }
                if (qrSpinner) {
                    qrSpinner.style.display = 'none';
                }
            } else {
                if (qrImgElement) {
                    qrImgElement.style.display = 'none';
                }
                if (qrSpinner) {
                    qrSpinner.style.display = 'flex';
                }
                if (qrModal && !qrModal.classList.contains('hidden')) {
                    setTimeout(fetchLiveQR, 1200);
                }
            }
        } catch (err) {
            console.error('[WA] fetchLiveQR error:', err.message);
            if (qrModal && !qrModal.classList.contains('hidden')) {
                setTimeout(fetchLiveQR, 2000);
            }
        }
    }

    if (accountStatusBadge) {
        accountStatusBadge.addEventListener('click', (e) => {
            e.preventDefault();
            if (!isConnected) {
                openQrModal();
            }
        });
    }

    let _fetchChatsTimer = null;
    let _fetchChatsInFlight = false;
    async function fetchChats() {
        if (_fetchChatsInFlight) return;
        if (_fetchChatsTimer) return;
        _fetchChatsTimer = setTimeout(() => { _fetchChatsTimer = null; }, 3000);
        _fetchChatsInFlight = true;
        try {
            const res = await fetch(`${API_BASE}/chats`);
            const data = await res.json();
            if (data.chats) {
                allChats = data.chats;
                renderChatList();
            }
        } catch (err) {}
        _fetchChatsInFlight = false;
    }

    // ------------------------------------------------------------------
    // New 1-on-1 Contact Handlers
    // ------------------------------------------------------------------

    if (btnOpenNewChat && newChatModal) {
        btnOpenNewChat.addEventListener('click', (e) => {
            e.preventDefault();
            newChatModal.classList.remove('hidden');
        });
    }

    if (btnCloseNewChat && newChatModal) {
        btnCloseNewChat.addEventListener('click', (e) => {
            e.preventDefault();
            newChatModal.classList.add('hidden');
        });
    }

    if (formAddContact) {
        formAddContact.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = newContactPhone.value.trim();
            const name = newContactName.value.trim();
            if (!phone) return;
            try {
                const res = await fetch(`${API_BASE}/add-contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, name })
                });
                const data = await res.json();
                if (data.success && data.contact) {
                    newChatModal.classList.add('hidden');
                    newContactPhone.value = '';
                    newContactName.value = '';
                    const existingIdx = allChats.findIndex(c => c.id === data.contact.id);
                    if (existingIdx >= 0) allChats[existingIdx] = data.contact;
                    else allChats.unshift(data.contact);
                    renderChatList();
                    selectChat(data.contact);
                } else {
                    alert(data.message || 'Could not add contact.');
                }
            } catch (err) {
                alert('Error adding contact: ' + err.message);
            }
        });
    }

    // ------------------------------------------------------------------
    // Sidebar Chat List Rendering & Filtering
    // ------------------------------------------------------------------

    const CHAT_PAGE_SIZE = 50;
    let chatRenderOffset = 0;
    let currentFilteredChats = [];

    const AVATAR_PALETTE = [
        '#005c4b', '#007a65', '#128c7e', '#1b6ca8', '#1e40af',
        '#3730a3', '#5b21b6', '#6b21a8', '#86198f', '#9d174d',
        '#991b1b', '#9a3412', '#854d0e', '#3f6212', '#166534'
    ];

    function hashStringToColor(str) {
        if (!str) return AVATAR_PALETTE[0];
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % AVATAR_PALETTE.length;
        return AVATAR_PALETTE[index];
    }

    function getInitials(name) {
        if (!name) return '';
        const trimmed = name.trim();
        if (/^\+?\d+/.test(trimmed)) return '';
        const words = trimmed.split(/[\s_\-]+/).filter(Boolean);
        if (words.length >= 2) {
            const c1 = Array.from(words[0])[0] || '';
            const c2 = Array.from(words[1])[0] || '';
            return (c1 + c2).toUpperCase();
        }
        const chars = Array.from(trimmed);
        if (chars.length > 1 && /^[a-zA-Z]/.test(chars[0])) {
            return (chars[0] + (chars[1] || '')).toUpperCase();
        }
        return chars[0] || '';
    }

    function getFallbackAvatarStyle(isGroup, name) {
        name = name || '';
        if (name.toLowerCase().includes('whatsapp')) return 'background:#25d366;';
        if (isGroup) return 'background:#005c4b;';
        const initials = getInitials(name);
        if (initials) return `background:${hashStringToColor(name)};color:#ffffff;font-size:18px;font-weight:600;`;
        return 'background:#1b4332;';
    }

    function getFallbackAvatarInner(isGroup, name) {
        name = name || '';
        if (name.toLowerCase().includes('whatsapp')) {
            return `<svg viewBox="0 0 24 24" width="28" height="28" fill="white">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.82 2.41h-.01c-1.46 0-2.9-.39-4.16-1.13l-.3-.18-3.1.81.83-3.02-.2-.31a8.17 8.17 0 0 1-1.25-4.42c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.64c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.24-.74-.66-1.25-1.48-1.39-1.73-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.42 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.18-.47-.3z"/>
            </svg>`;
        }
        if (isGroup) {
            return `<svg viewBox="0 0 24 24" width="28" height="28" fill="#dfe5e7">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>`;
        }
        const initials = getInitials(name);
        if (initials) {
            return escapeHtml(initials);
        }
        return `<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>`;
    }

    function formatWaTimestamp(timeStr, timeMs) {
        let date = null;
        if (timeMs && typeof timeMs === 'number' && timeMs > 0) {
            date = new Date(timeMs);
        } else if (timeStr) {
            if (/^(yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.test(timeStr.trim())) {
                return timeStr;
            }
            const m = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([APap][Mm])?$/);
            if (m) {
                let h = parseInt(m[1], 10);
                const min = m[2];
                const ampm = m[3] ? m[3].toLowerCase() : (h >= 12 ? 'pm' : 'am');
                if (h > 12) h -= 12;
                if (h === 0) h = 12;
                return `${h}:${min} ${ampm}`;
            }
            const d = new Date(timeStr);
            if (!isNaN(d.getTime())) date = d;
        }

        if (!date || isNaN(date.getTime())) return timeStr || '';

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const diffDays = Math.round((todayStart - targetStart) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            let h = date.getHours();
            const min = date.getMinutes().toString().padStart(2, '0');
            const ampm = h >= 12 ? 'pm' : 'am';
            h = h % 12 || 12;
            return `${h}:${min} ${ampm}`;
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays > 1 && diffDays < 7) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return days[date.getDay()];
        } else {
            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
        }
    }

    function buildChatItem(chat) {
        const isActive = chat.id === activeChatJid;
        const isUnread = (chat.unreadCount || 0) > 0;
        const item = document.createElement('div');
        item.className = 'wa-chat-item' + (isActive ? ' active' : '');
        item.dataset.jid = chat.id;
        item.title = chat.name || chat.id;

        // Avatar
        const avatarStyle = getFallbackAvatarStyle(chat.isGroup, chat.name || chat.id);
        const avatarInnerSvg = getFallbackAvatarInner(chat.isGroup, chat.name || chat.id);
        let avatarHtml = '';
        if (chat.profilePic) {
            avatarHtml = `<div class="wa-avatar-wrap" style="${avatarStyle}">
                <img src="${escapeHtml(chat.profilePic)}" onerror="this.remove()">
                ${avatarInnerSvg}
            </div>`;
        } else {
            avatarHtml = `<div class="wa-avatar-wrap" style="${avatarStyle}">
                ${avatarInnerSvg}
            </div>`;
        }

        // Outgoing tick mark
        const doubleTickHtml = chat.fromMe ? `
            <span class="wa-double-tick" title="Sent">
                <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.05 0.8a.75.75 0 0 1 .05 1.06L6.4 7.56 3.7 4.85a.75.75 0 0 0-1.06 1.06l3.25 3.25a.75.75 0 0 0 1.1-.05l5.2-6.26a.75.75 0 0 0-.04-1.06z" fill="#53bdeb"/>
                    <path d="M15.05 0.8a.75.75 0 0 1 .05 1.06l-5.7 6.87-.55-.66 5.14-6.21a.75.75 0 0 1 1.06-.06z" fill="#53bdeb"/>
                </svg>
            </span>` : '';

        // Message text formatting
        let msgSnippet = '';
        if (chat.lastMessage && chat.lastMessage !== 'Click to chat') {
            let senderPrefix = '';
            if (chat.isGroup && chat.lastSender && !chat.fromMe) {
                senderPrefix = `<span style="font-weight:500;">${escapeHtml(chat.lastSender)}: </span>`;
            }
            let text = escapeHtml(chat.lastMessage);
            if (text.startsWith('📷 Photo')) {
                text = `<span style="display:inline-flex;align-items:center;gap:3px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Photo</span>`;
            }
            msgSnippet = `${doubleTickHtml}${senderPrefix}${text}`;
        } else {
            msgSnippet = chat.isGroup ? `${chat.participants || ''} members` : '';
        }

        const unreadPillHtml = isUnread ? `<span class="wa-chat-pill">${chat.unreadCount}</span>` : '';
        const timeClass = isUnread ? 'wa-chat-time-text wa-chat-time-unread' : 'wa-chat-time-text';
        const msgClass = isUnread ? 'wa-chat-msg-preview wa-chat-msg-unread' : 'wa-chat-msg-preview';
        const formattedTime = formatWaTimestamp(chat.timestamp, chat.lastMessageTimestamp);

        item.innerHTML = `
            ${avatarHtml}
            <div class="wa-chat-info">
                <div class="wa-chat-top-row">
                    <span class="wa-chat-title-text">${escapeHtml(chat.name || chat.id)}</span>
                    <span class="${timeClass}">${escapeHtml(formattedTime)}</span>
                </div>
                <div class="wa-chat-bottom-row">
                    <span class="${msgClass}">${msgSnippet}</span>
                    ${unreadPillHtml}
                </div>
            </div>`;

        item.addEventListener('click', () => selectChat(chat));
        return item;
    }

    function renderMoreChats() {
        const slice = currentFilteredChats.slice(chatRenderOffset, chatRenderOffset + CHAT_PAGE_SIZE);
        const frag = document.createDocumentFragment();
        slice.forEach(chat => frag.appendChild(buildChatItem(chat)));
        const old = chatsListContainer.querySelector('#chat-load-sentinel');
        if (old) old.remove();
        chatsListContainer.appendChild(frag);
        chatRenderOffset += slice.length;

        if (chatRenderOffset < currentFilteredChats.length) {
            const sentinel = document.createElement('div');
            sentinel.id = 'chat-load-sentinel';
            sentinel.style.cssText = 'height:1px;';
            chatsListContainer.appendChild(sentinel);
            chatScrollObserver.observe(sentinel);
        }
    }

    const chatScrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            chatScrollObserver.disconnect();
            renderMoreChats();
        }
    }, { root: chatsListContainer, threshold: 0.1 });

    let lastRenderedChatFingerprint = '';

    function renderChatList(force = false) {
        if (!chatsListContainer) return;
        const savedScroll = chatsListContainer.scrollTop;

        const searchQuery = chatSearchInput ? chatSearchInput.value.toLowerCase() : '';

        currentFilteredChats = allChats.filter(chat => {
            const name = (chat.name || chat.id || '').toLowerCase();
            if (!name.includes(searchQuery)) return false;
            if (activeFilter === 'unread') return chat.unreadCount > 0;
            if (activeFilter === 'groups') return chat.isGroup;
            if (activeFilter === 'personal') return !chat.isGroup;
            return true;
        });

        currentFilteredChats.sort((a, b) => (b.lastMessageTimestamp||0) - (a.lastMessageTimestamp||0));

        const fingerprint = currentFilteredChats.map(c => (c.id || '') + ':' + (c.lastMessageTimestamp || 0) + ':' + (c.unreadCount || 0) + ':' + (c.name || '')).join('|') + '::' + activeFilter + '::' + searchQuery;
        if (!force && fingerprint === lastRenderedChatFingerprint && chatsListContainer.children.length > 0) {
            return;
        }
        lastRenderedChatFingerprint = fingerprint;

        chatScrollObserver.disconnect();
        chatsListContainer.innerHTML = '';
        chatRenderOffset = 0;

        if (currentFilteredChats.length === 0) {
            chatsListContainer.innerHTML = `
                <div style="padding:24px;text-align:center;color:#8696a0;font-size:13px;">
                    No chats found.<br>
                    <button type="button" id="btn-empty-add-contact" style="margin-top:8px;color:#00a884;font-weight:bold;background:none;border:none;text-decoration:underline;cursor:pointer;">
                        + Add Personal Contact
                    </button>
                </div>`;
            const emptyBtn = document.getElementById('btn-empty-add-contact');
            if (emptyBtn && newChatModal) emptyBtn.addEventListener('click', () => newChatModal.classList.remove('hidden'));
            return;
        }

        renderMoreChats();
        if (savedScroll > 0) {
            chatsListContainer.scrollTop = savedScroll;
        }
    }

    document.querySelectorAll('.wa-filter-btn, .chat-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.wa-filter-btn, .chat-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.getAttribute('data-filter') || 'all';
            renderChatList();
        });
    });

    if (chatSearchInput) {
        chatSearchInput.addEventListener('input', renderChatList);
    }

    // ------------------------------------------------------------------
    // WhatsApp Message Search
    // ------------------------------------------------------------------
    const btnMsgSearchToggle = document.getElementById('btn-msg-search-toggle');
    const msgSearchPanel     = document.getElementById('msg-search-panel');
    const msgSearchInput     = document.getElementById('msg-search-input');
    const msgSearchResults   = document.getElementById('msg-search-results');
    const btnMsgSearchClear  = document.getElementById('btn-msg-search-clear');

    if (btnMsgSearchToggle && msgSearchPanel) {
        btnMsgSearchToggle.addEventListener('click', () => {
            const open = msgSearchPanel.style.display !== 'none';
            msgSearchPanel.style.display = open ? 'none' : 'block';
            btnMsgSearchToggle.classList.toggle('active', !open);
            if (!open) {
                btnMsgSearchToggle.style.background = 'color-mix(in srgb,var(--cp) 10%,transparent)';
                btnMsgSearchToggle.style.color = 'var(--cp)';
                btnMsgSearchToggle.style.borderColor = 'var(--cp)';
                msgSearchInput?.focus();
            } else {
                btnMsgSearchToggle.style.background = 'transparent';
                btnMsgSearchToggle.style.color = '#8696a0';
                btnMsgSearchToggle.style.borderColor = '#2a3942';
                if (msgSearchResults) msgSearchResults.innerHTML = '';
                if (msgSearchInput) msgSearchInput.value = '';
                if (btnMsgSearchClear) btnMsgSearchClear.style.display = 'none';
            }
        });
    }

    let msgSearchTimer = null;
    if (msgSearchInput) {
        msgSearchInput.addEventListener('input', () => {
            const q = msgSearchInput.value.trim();
            if (btnMsgSearchClear) btnMsgSearchClear.style.display = q ? 'block' : 'none';
            clearTimeout(msgSearchTimer);
            if (!q || q.length < 2) {
                if (msgSearchResults) msgSearchResults.innerHTML = '';
                return;
            }
            if (msgSearchResults) msgSearchResults.innerHTML = '<div style="text-align:center;padding:12px;color:#8696a0;font-size:11px;">Searching...</div>';
            msgSearchTimer = setTimeout(() => doMsgSearch(q), 400);
        });
    }

    if (btnMsgSearchClear) {
        btnMsgSearchClear.addEventListener('click', () => {
            if (msgSearchInput) msgSearchInput.value = '';
            btnMsgSearchClear.style.display = 'none';
            if (msgSearchResults) msgSearchResults.innerHTML = '';
        });
    }

    async function doMsgSearch(q) {
        try {
            const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const data = await res.json();
            renderMsgSearchResults(data.results || [], q);
        } catch {
            if (msgSearchResults) msgSearchResults.innerHTML = '<div style="text-align:center;padding:12px;color:#8696a0;font-size:11px;">Search failed.</div>';
        }
    }

    function renderMsgSearchResults(results, q) {
        if (!msgSearchResults) return;
        if (!results.length) {
            msgSearchResults.innerHTML = '<div style="text-align:center;padding:16px;color:#8696a0;font-size:11px;">No messages found.</div>';
            return;
        }
        const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const highlight = text => {
            const safe = esc(text);
            const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
            return safe.replace(re, '<mark style="background:color-mix(in srgb,var(--cp) 30%,#fff);color:inherit;border-radius:2px;padding:0 1px;">$1</mark>');
        };
        msgSearchResults.innerHTML = results.map(r => `
            <div onclick="selectChatByJid('${esc(r.jid)}')" style="padding:8px 10px;border-radius:9px;background:#111b21;border:1px solid #1e3040;cursor:pointer;transition:all 0.15s;"
                onmouseover="this.style.borderColor='var(--cp)';this.style.background='color-mix(in srgb,var(--cp) 8%,#111b21)'"
                onmouseout="this.style.borderColor='#1e3040';this.style.background='#111b21'">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                    <span style="font-size:11px;font-weight:700;color:var(--cp);">${esc(r.chatName)}</span>
                    <span style="font-size:9.5px;color:#8696a0;">${new Date(r.timestamp*1000).toLocaleString()}</span>
                </div>
                <div style="font-size:11.5px;color:#e9edef;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${highlight(r.text)}</div>
                <div style="font-size:10px;color:#8696a0;margin-top:2px;">${r.fromMe ? '✓ You' : esc(r.senderName || '')}</div>
            </div>
        `).join('');
    }

    window.selectChatByJid = function selectChatByJid(jid) {
        const chat = allChats.find(c => c.id === jid);
        if (chat) {
            selectChat(chat);
            if (msgSearchPanel) {
                msgSearchPanel.style.display = 'none';
                if (btnMsgSearchToggle) {
                    btnMsgSearchToggle.classList.remove('active');
                    btnMsgSearchToggle.style.background = 'transparent';
                    btnMsgSearchToggle.style.color = '#8696a0';
                    btnMsgSearchToggle.style.borderColor = '#2a3942';
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Active Conversation Area & Message History
    // ------------------------------------------------------------------

    function selectChat(chat) {
        activeChatJid = chat.id;
        const hadUnread = (chat.unreadCount || 0) > 0;
        chat.unreadCount = 0;
        unreadBelowCount = 0;
        if (scrollUnreadBadge) {
            scrollUnreadBadge.textContent = '0';
            scrollUnreadBadge.style.display = 'none';
        }
        if (btnScrollBottom) {
            btnScrollBottom.classList.remove('visible');
        }

        // Seamless active switch in sidebar without destroying DOM or resetting scroll
        if (chatsListContainer) {
            const prevActive = chatsListContainer.querySelector('.wa-chat-item.active');
            if (prevActive) prevActive.classList.remove('active');
            const newActive = chatsListContainer.querySelector(`.wa-chat-item[data-jid="${chat.id}"]`);
            if (newActive) {
                newActive.classList.add('active');
                const pill = newActive.querySelector('.wa-chat-pill');
                if (pill) pill.remove();
                const timeEl = newActive.querySelector('.wa-chat-time-unread');
                if (timeEl) timeEl.classList.remove('wa-chat-time-unread');
                const msgEl = newActive.querySelector('.wa-chat-msg-unread');
                if (msgEl) msgEl.classList.remove('wa-chat-msg-unread');
            } else {
                renderChatList();
            }
        } else {
            renderChatList();
        }
        activeChatTitle.textContent = chat.name;
        activeChatSubtext.textContent = chat.isGroup ? `Group Chat • ${chat.participants || 0} members` : 'Personal Contact • 1-on-1 Chat';
        if (chat.profilePic) {
            activeChatAvatar.innerHTML = `<img src="${escapeHtml(chat.profilePic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.remove()">`;
        } else {
            activeChatAvatar.innerHTML = getFallbackAvatarInner(chat.isGroup, chat.name || chat.id);
        }
        activeChatAvatar.style.cssText = `width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; ${getFallbackAvatarStyle(chat.isGroup, chat.name || chat.id)}`;
        switchToTab('chat');
        fetchConversationMessages(true);

        // Mark seen/read in WhatsApp and backend
        markChatAsRead(chat.id);
    }

    async function markChatAsRead(jid) {
        if (!jid) return;
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
            await fetch(`${API_BASE}/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
                body: JSON.stringify({ jid })
            });
        } catch (e) {
            console.log('[WA] markChatAsRead error:', e);
        }
    }

    let currentLoadedJid = null;
    let lastRenderedMessagesKey = '';

    async function fetchConversationMessages(forceScrollBottom = false) {
        if (!activeChatJid || !conversationArea) return;
        const targetJid = activeChatJid;
        try {
            const res = await fetch(`${API_BASE}/messages?jid=${encodeURIComponent(targetJid)}`);
            const data = await res.json();
            if (activeChatJid !== targetJid) return;
            const isChatSwitch = (currentLoadedJid !== targetJid);
            renderConversation(data.messages || [], isChatSwitch || forceScrollBottom);
            currentLoadedJid = targetJid;
        } catch (err) {}
    }

    function renderConversation(messages, shouldScrollToBottom = false) {
        const messagesKey = messages.map(m => (m.id || '') + (m.timestamp || '')).join('|');

        // If background poll and messages did not change at all, DO NOT TOUCH DOM OR SCROLL!
        if (!shouldScrollToBottom && messagesKey === lastRenderedMessagesKey && currentLoadedJid === activeChatJid) {
            return;
        }

        // Measure scroll state BEFORE wiping or modifying the DOM
        const prevScrollTop = conversationArea.scrollTop;
        const prevScrollHeight = conversationArea.scrollHeight;
        const distanceFromBottom = prevScrollHeight - prevScrollTop - conversationArea.clientHeight;
        const wasNearBottom = shouldScrollToBottom || (distanceFromBottom < 100);

        const prevBubbleCount = conversationArea.querySelectorAll('.msg-bubble-outgoing, .msg-bubble-incoming').length;
        const newArrivals = (prevBubbleCount > 0 && messages.length > prevBubbleCount) ? (messages.length - prevBubbleCount) : 0;

        lastRenderedMessagesKey = messagesKey;

        conversationArea.innerHTML = `
            <div style="text-align: center; margin: 24px 0;">
                <span style="padding: 4px 12px; background-color: #182229; font-size: 11px; color: #facc15; border-radius: 8px; border: 1px solid #222d34;">
                    🔒 End-to-end encrypted • Messages & calls are secured
                </span>
            </div>
        `;

        messages.forEach(msg => {
            const bubble = document.createElement('div');
            const isOutgoing = msg.fromMe;
            bubble.style.display = 'flex';
            bubble.style.justifyContent = isOutgoing ? 'flex-end' : 'flex-start';
            bubble.style.marginBottom = '8px';
            bubble.innerHTML = `
                <div class="${isOutgoing ? 'msg-bubble-outgoing' : 'msg-bubble-incoming'}" style="max-width: 70%; border-radius: 14px; padding: 8px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                    ${!isOutgoing ? `<p style="font-size: 10px; font-weight: 700; color: #00a884; margin: 0 0 2px 0;">${escapeHtml(msg.senderName || 'Contact')}</p>` : ''}
                    ${msg.imageBase64 ? `<img src="${msg.imageBase64}" style="max-width: 260px; width: 100%; border-radius: 10px; margin-bottom: 6px; border: 1px solid rgba(0,0,0,0.1);" onerror="this.style.display='none'">` : (msg.hasImage ? `<div style="max-width:260px;background:rgba(0,0,0,0.05);border-radius:10px;padding:20px;text-align:center;margin-bottom:6px;font-size:12px;">🖼️ Photo</div>` : '')}
                    <p style="font-size: 12px; line-height: 1.5; white-space: pre-wrap; margin: 0;">${formatWhatsAppText(msg.text || '')}</p>
                    <div class="msg-time" style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px; font-size: 9px;">
                        <span>${escapeHtml(msg.timestamp || '')}</span>
                        ${isOutgoing ? '<span style="color: #10b981; font-weight: bold;">✓✓</span>' : ''}
                    </div>
                </div>
            `;
            conversationArea.appendChild(bubble);
        });

        if (wasNearBottom) {
            conversationArea.scrollTop = conversationArea.scrollHeight;
            updateScrollBottomBtn();
        } else {
            // User was reading near top/middle -> Keep exact scroll position!
            conversationArea.scrollTop = prevScrollTop;
            if (newArrivals > 0) {
                unreadBelowCount += newArrivals;
                if (scrollUnreadBadge) {
                    scrollUnreadBadge.textContent = unreadBelowCount > 99 ? '99+' : unreadBelowCount;
                    scrollUnreadBadge.style.display = 'flex';
                }
            }
            updateScrollBottomBtn();
        }
    }

    function updateScrollBottomBtn() {
        if (!conversationArea || !btnScrollBottom) return;
        const distanceFromBottom = conversationArea.scrollHeight - conversationArea.scrollTop - conversationArea.clientHeight;
        if (distanceFromBottom > 120) {
            btnScrollBottom.classList.add('visible');
        } else {
            btnScrollBottom.classList.remove('visible');
            unreadBelowCount = 0;
            if (scrollUnreadBadge) {
                scrollUnreadBadge.textContent = '0';
                scrollUnreadBadge.style.display = 'none';
            }
        }
    }

    if (conversationArea) {
        conversationArea.addEventListener('scroll', updateScrollBottomBtn, { passive: true });
    }

    if (btnScrollBottom) {
        btnScrollBottom.addEventListener('click', () => {
            if (!conversationArea) return;
            conversationArea.scrollTo({
                top: conversationArea.scrollHeight,
                behavior: 'smooth'
            });
            btnScrollBottom.classList.remove('visible');
            unreadBelowCount = 0;
            if (scrollUnreadBadge) {
                scrollUnreadBadge.textContent = '0';
                scrollUnreadBadge.style.display = 'none';
            }
        });
    }

    if (formChatSend) {
        formChatSend.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!activeChatJid) { alert('Please select a chat first.'); return; }
            const text = chatMessageInput.value.trim();
            if (!text && !attachedChatImageBase64) return;

            const sendPayload = { targetJid: activeChatJid, text, imageBase64: attachedChatImageBase64 };
            chatMessageInput.value = '';
            attachedChatImageBase64 = null;
            if (chatFileInput) chatFileInput.value = '';
            if (chatImagePreviewBar) chatImagePreviewBar.style.display = 'none';

            const targetChat = allChats.find(c => c.id === activeChatJid);
            if (targetChat) {
                targetChat.lastMessage = text || '🖼️ Image';
                targetChat.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                targetChat.lastMessageTimestamp = Date.now();
                renderChatList();
            }

            try {
                await fetch(`${API_BASE}/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sendPayload)
                });
                fetchConversationMessages(true);
            } catch (err) {
                alert('Failed to send message: ' + err.message);
            }
        });
    }

    const chatImagePreviewBar = document.getElementById('chat-image-preview-bar');
    const chatPreviewImg = document.getElementById('chat-preview-img');
    const chatPreviewFilename = document.getElementById('chat-preview-filename');
    const btnRemoveAttachment = document.getElementById('btn-remove-attachment');
    const btnEmojiPicker = document.getElementById('btn-emoji-picker');

    if (btnAttachClip && chatFileInput) {
        btnAttachClip.addEventListener('click', (e) => {
            e.preventDefault();
            chatFileInput.click();
        });
        chatFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => {
                    attachedChatImageBase64 = ev.target.result;
                    if (chatPreviewImg) chatPreviewImg.src = ev.target.result;
                    if (chatPreviewFilename) chatPreviewFilename.textContent = file.name || 'Photo Attached';
                    if (chatImagePreviewBar) chatImagePreviewBar.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (btnRemoveAttachment) {
        btnRemoveAttachment.addEventListener('click', () => {
            attachedChatImageBase64 = null;
            if (chatFileInput) chatFileInput.value = '';
            if (chatImagePreviewBar) chatImagePreviewBar.style.display = 'none';
        });
    }

    if (btnEmojiPicker && chatMessageInput) {
        const emojis = ['😊', '👍', '❤️', '🔥', '🎉', '🙏', '💯', '👌'];
        btnEmojiPicker.addEventListener('click', (e) => {
            e.preventDefault();
            chatMessageInput.value += emojis[Math.floor(Math.random() * emojis.length)];
            chatMessageInput.focus();
        });
    }

    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // Main View Tab Controls (💬 Chat vs 📢 Bulk)
    // ------------------------------------------------------------------

    const btnTabChat = document.getElementById('btn-tab-chat');
    const btnTabBulk = document.getElementById('btn-tab-bulk');
    const btnBackToChat = document.getElementById('btn-back-to-chat');
    const viewChatContainer = document.getElementById('view-chat-container');
    const viewBulkContainer = document.getElementById('view-bulk-container');

    function switchToTab(tabName) {
        const isDark = isDarkMode();
        if (tabName === 'bulk') {
            if (viewChatContainer) viewChatContainer.style.display = 'none';
            if (viewBulkContainer) viewBulkContainer.style.display = 'flex';

            if (btnTabChat) {
                btnTabChat.style.background = 'transparent';
                btnTabChat.style.color = isDark ? '#8696a0' : '#64748b';
                btnTabChat.style.fontWeight = '600';
                btnTabChat.style.border = 'none';
                btnTabChat.style.boxShadow = 'none';
            }
            if (btnTabBulk) {
                btnTabBulk.style.background = '#00a884';
                btnTabBulk.style.color = '#ffffff';
                btnTabBulk.style.fontWeight = '700';
                btnTabBulk.style.border = 'none';
                btnTabBulk.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            }

            if (typeof fetchTemplates === 'function') fetchTemplates();
            if (typeof renderBulkGroupList === 'function') renderBulkGroupList();
            if (typeof fetchSavedLists === 'function') {
                fetchSavedLists().then(() => { if (typeof renderQuickSelectLists === 'function') renderQuickSelectLists(); });
            }
            if (typeof adjustBulkTextareaHeight === 'function') {
                setTimeout(adjustBulkTextareaHeight, 50);
            }
        } else {
            if (viewBulkContainer) viewBulkContainer.style.display = 'none';
            if (viewChatContainer) viewChatContainer.style.display = 'flex';

            if (btnTabChat) {
                btnTabChat.style.background = '#00a884';
                btnTabChat.style.color = '#ffffff';
                btnTabChat.style.fontWeight = '700';
                btnTabChat.style.border = 'none';
                btnTabChat.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            }
            if (btnTabBulk) {
                btnTabBulk.style.background = 'transparent';
                btnTabBulk.style.color = isDark ? '#8696a0' : '#64748b';
                btnTabBulk.style.fontWeight = '600';
                btnTabBulk.style.border = 'none';
                btnTabBulk.style.boxShadow = 'none';
            }
        }
    }

    if (btnTabChat) {
        btnTabChat.addEventListener('click', (e) => {
            e.preventDefault();
            switchToTab('chat');
        });
    }

    if (btnTabBulk) {
        btnTabBulk.addEventListener('click', (e) => {
            e.preventDefault();
            switchToTab('bulk');
        });
    }

    // ------------------------------------------------------------------
    // Theme Management (Light vs Dark Mode)
    // ------------------------------------------------------------------

    function isDarkMode() {
        return document.documentElement.classList.contains('dark');
    }

    function updateThemeUI() {
        const isDark = isDarkMode();
        const icon = isDark ? '☀️' : '🌙';
        const title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';

        const mainIcon = document.getElementById('theme-toggle-icon');
        const mainBtn = document.getElementById('btn-theme-toggle');
        if (mainIcon) mainIcon.textContent = icon;
        if (mainBtn) mainBtn.title = title;

        document.querySelectorAll('.theme-toggle-icon-clone').forEach(el => el.textContent = icon);
        document.querySelectorAll('.btn-theme-toggle-clone').forEach(el => el.title = title);

        // Also update tab styling
        if (viewBulkContainer && viewBulkContainer.style.display !== 'none') {
            switchToTab('bulk');
        } else {
            switchToTab('chat');
        }
    }

    function toggleTheme() {
        if (isDarkMode()) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('wa_theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('wa_theme', 'dark');
        }
        updateThemeUI();
    }

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', toggleTheme);
    }
    document.querySelectorAll('.btn-theme-toggle-clone').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    // Run on startup
    updateThemeUI();

    if (btnToggleBulk) {
        btnToggleBulk.addEventListener('click', (e) => {
            e.preventDefault();
            switchToTab('bulk');
        });
    }

    if (btnBackToChat) {
        btnBackToChat.addEventListener('click', (e) => {
            e.preventDefault();
            switchToTab('chat');
        });
    }

    let savedLists = [];
    let publicLists = [];
    let failedTargets = [];
    let bulkActiveFilter = 'all';

    function renderBulkGroupList(searchQuery = '') {
        if (!bulkGroupList) return;
        const savedScroll = bulkGroupList.scrollTop;
        bulkGroupList.innerHTML = '';
        const isDark = isDarkMode();

        // Collect existing JIDs in allChats
        const existingJids = new Set((allChats || []).map(c => c.id));
        const extraChats = [];

        // Build fallback chat objects for any selected JIDs missing in allChats
        bulkSelectedGroups.forEach(jid => {
            if (!existingJids.has(jid)) {
                const cleanName = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
                const isGroup = jid.endsWith('@g.us');
                extraChats.push({ id: jid, name: cleanName, isGroup: isGroup });
                existingJids.add(jid);
            }
        });

        let targets = [...(allChats || []), ...extraChats];

        if (bulkActiveFilter === 'groups') targets = targets.filter(c => c.isGroup);
        else if (bulkActiveFilter === 'personal') targets = targets.filter(c => !c.isGroup);
        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            targets = targets.filter(c => (c.name || c.id).toLowerCase().includes(q));
        }

        // Sort: Selected items (isChecked === true) appear at the top!
        targets.sort((a, b) => {
            const aSel = bulkSelectedGroups.has(a.id);
            const bSel = bulkSelectedGroups.has(b.id);
            if (aSel && !bSel) return -1;
            if (!aSel && bSel) return 1;
            return (a.name || a.id).localeCompare(b.name || b.id);
        });

        if (targets.length === 0) {
            bulkGroupList.innerHTML = `<p style="font-size:13px;color:${isDark?'#8696a0':'#64748b'};text-align:center;padding:24px 0;">No contacts found</p>`;
            if (bulkSelectedCount) bulkSelectedCount.textContent = bulkSelectedGroups.size + ' Selected';
            return;
        }

        targets.forEach(g => {
            const isChecked = bulkSelectedGroups.has(g.id);
            const item = document.createElement('div');
            item.className = 'wa-bulk-item' + (isChecked ? ' selected' : '');
            item.dataset.jid = g.id;

            // Avatar matching .wa-chat-item
            const avatarStyle = getFallbackAvatarStyle(g.isGroup, g.name || g.id);
            const avatarInnerSvg = getFallbackAvatarInner(g.isGroup, g.name || g.id);
            let avatarHtml = '';
            if (g.profilePic) {
                avatarHtml = `<div class="wa-avatar-wrap" style="${avatarStyle}">
                    <img src="${escapeHtml(g.profilePic)}" onerror="this.remove()">
                    ${avatarInnerSvg}
                </div>`;
            } else {
                avatarHtml = `<div class="wa-avatar-wrap" style="${avatarStyle}">
                    ${avatarInnerSvg}
                </div>`;
            }

            const checkBorder = isChecked ? '#00a884' : (isDark ? '#2a3942' : '#cbd5e1');
            const checkBg = isChecked ? '#00a884' : 'transparent';
            const checkIcon = isChecked ? '<svg style="width:12px;height:12px;" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : '';

            const subInfo = g.isGroup 
                ? `${g.participants || 0} members`
                : (g.id.includes('@') ? ('+' + g.id.split('@')[0]) : 'Personal Contact');

            item.innerHTML = `
                ${avatarHtml}
                <div class="wa-chat-info">
                    <div class="wa-chat-top-row">
                        <span class="wa-chat-title-text">${escapeHtml(g.name || g.id)}</span>
                    </div>
                    <div class="wa-chat-bottom-row">
                        <span class="wa-chat-msg-preview">${escapeHtml(subInfo)}</span>
                    </div>
                </div>
                <div class="wa-bulk-checkbox" style="width:20px;height:20px;border-radius:6px;border:2px solid ${checkBorder};background:${checkBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;margin-left:8px;">
                    ${checkIcon}
                </div>
            `;

            item.addEventListener('click', () => {
                if (bulkSelectedGroups.has(g.id)) {
                    bulkSelectedGroups.delete(g.id);
                } else {
                    bulkSelectedGroups.add(g.id);
                }
                renderBulkGroupList(document.getElementById('bulk-recipient-search')?.value || '');
                renderQuickSelectLists();
            });

            bulkGroupList.appendChild(item);
        });

        if (savedScroll > 0) {
            bulkGroupList.scrollTop = savedScroll;
        }

        if (bulkSelectedCount) bulkSelectedCount.textContent = bulkSelectedGroups.size + ' Selected';
    }

    document.querySelectorAll('.bulk-filter-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.bulk-filter-tab').forEach(b => {
                b.classList.remove('active');
                b.style.removeProperty('background');
                b.style.removeProperty('color');
            });
            btn.classList.add('active');
            bulkActiveFilter = btn.getAttribute('data-filter') || 'all';
            renderBulkGroupList(document.getElementById('bulk-recipient-search')?.value || '');
        });
    });

    const bulkRecipientSearch = document.getElementById('bulk-recipient-search');
    if (bulkRecipientSearch) {
        bulkRecipientSearch.addEventListener('input', (e) => renderBulkGroupList(e.target.value));
    }

    const btnExpandBulk = document.getElementById('btn-expand-bulk');
    if (btnExpandBulk && bulkDrawer) {
        btnExpandBulk.addEventListener('click', (e) => {
            e.preventDefault();
            bulkDrawer.classList.toggle('expanded');
            const isExpanded = bulkDrawer.classList.contains('expanded');
            btnExpandBulk.innerHTML = isExpanded
                ? '<svg style="width:13px;height:13px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"/></svg> Sidebar'
                : '<svg style="width:13px;height:13px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg> Expand';
        });
    }

    const isSuperAdmin = window.waConfig?.isSuperAdmin === true;
    let activeBroadcastListId = null;

    let globalLists = [];

    async function fetchSavedLists() {
        try {
            const res = await fetch(`${API_BASE}/saved-lists`);
            const data = await res.json();
            if (data) {
                savedLists = Array.isArray(data.lists) ? data.lists : [];
                globalLists = Array.isArray(data.globalLists) ? data.globalLists : [];
                renderSavedLists();
                renderQuickSelectLists();
            }
        } catch(e) {}
    }

    function renderQuickSelectLists() {
        const container = document.getElementById('quick-select-lists');
        if (!container) return;
        container.innerHTML = '';
        const isDark = isDarkMode();

        const combinedLists = [
            ...globalLists.map(l => ({ ...l, isGlobal: true })),
            ...savedLists.map(l => ({ ...l, isGlobal: false }))
        ];

        if (combinedLists.length === 0) {
            container.innerHTML = `<span style="font-size:11px;color:${isDark?'#8696a0':'#64748b'};font-style:italic;">No saved lists yet</span>`;
            return;
        }

        combinedLists.forEach(list => {
            const colors = list.isGlobal 
                ? ['#00a884', '#059669', '#10b981'] 
                : ['#1d4ed8','#7c3aed','#b45309','#0f766e','#be185d'];
            const color = colors[(list.name||'').charCodeAt(0) % colors.length];
            const isActive = list.jids.every(jid => bulkSelectedGroups.has(jid));

            const btnBg = isActive ? color + (isDark ? '22' : '15') : (isDark ? '#111b21' : '#ffffff');
            const btnBorder = isActive ? color : (list.isGlobal ? (isDark ? '#00a88466' : '#a7f3d0') : (isDark ? '#2a3942' : '#e2e8f0'));
            const textColor = isActive ? (isDark ? '#e9edef' : '#0f172a') : (isDark ? '#c1c7cd' : '#475569');

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;border:2px solid ${btnBorder};background:${btnBg};cursor:pointer;transition:all 0.2s;`;
            btn.innerHTML = `
                ${list.isGlobal ? '<span style="font-size:11px;" title="Global List (Shared with Team)">🌐</span>' : `<span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;"></span>`}
                <span style="font-size:11px;font-weight:700;color:${textColor};">${escapeHtml(list.name)}</span>
                <span style="font-size:9.5px;color:${isActive ? color : (isDark?'#8696a0':'#64748b')};font-weight:600;">${list.targetCount}</span>
                ${isActive ? '<svg style="width:11px;height:11px;" fill="none" stroke="#4f46e5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
            `;

            btn.addEventListener('click', () => {
                const alreadyAll = list.jids.every(jid => bulkSelectedGroups.has(jid));
                if (alreadyAll) list.jids.forEach(jid => bulkSelectedGroups.delete(jid));
                else list.jids.forEach(jid => bulkSelectedGroups.add(jid));
                if (bulkSelectedCount) bulkSelectedCount.textContent = bulkSelectedGroups.size + ' Selected';
                renderBulkGroupList(document.getElementById('bulk-recipient-search')?.value || '');
                renderQuickSelectLists();
            });

            container.appendChild(btn);
        });
    }

    function renderSavedLists() {
        const container = document.getElementById('broadcast-lists-items');
        const countBadge = document.getElementById('broadcast-lists-count');
        if (!container) return;

        if (countBadge) countBadge.textContent = savedLists.length;

        if (savedLists.length === 0) {
            container.innerHTML = '<p style="font-size:11px;color:#8696a0;text-align:center;padding:12px 0;margin:0;">No saved lists yet.<br><span style="font-size:10px;">Select contacts in Bulk panel and click 💾 Save</span></p>';
            return;
        }

        container.innerHTML = '';
        savedLists.forEach(list => {
            const item = document.createElement('div');
            item.className = 'bl-item' + (activeBroadcastListId === list.id ? ' active' : '');
            item.dataset.listId = list.id;

            const colors = ['#005c4b','#1d4ed8','#7c3aed','#b45309','#0f766e','#be185d'];
            const color = colors[(list.name||'').charCodeAt(0) % colors.length];
            const initials = (list.name||'L').substring(0,2).toUpperCase();

            item.innerHTML = `
                <div style="width:30px;height:30px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0;">${initials}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:700;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(list.name)}${list.isPublic ? ' <span style="font-size:9px;color:#facc15;font-weight:600;">🌐 Public</span>' : ''}</div>
                    <div style="font-size:10px;color:#8696a0;">${list.targetCount} contacts</div>
                </div>
                <div class="bl-actions" style="display:flex;gap:3px;flex-shrink:0;">
                    <button class="bl-public-btn" title="${list.isPublic ? 'Make Private' : 'Make Public'}" style="width:26px;height:26px;border-radius:6px;background:${list.isPublic ? '#2a3010' : '#1a2a32'};border:1px solid ${list.isPublic ? '#facc15' : '#2a3942'};color:${list.isPublic ? '#facc15' : '#8696a0'};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">
                        ${list.isPublic ? '🌐' : '🔒'}
                    </button>
                    <button class="bl-edit-btn" title="Rename" style="width:26px;height:26px;border-radius:6px;background:#1a2a32;border:1px solid #2a3942;color:#8696a0;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                        <svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button class="bl-del-btn" title="Delete" style="width:26px;height:26px;border-radius:6px;background:#1a2a32;border:1px solid #2a3942;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                        <svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.closest('.bl-actions')) return;
                activeBroadcastListId = list.id;
                document.querySelectorAll('.bl-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                bulkSelectedGroups.clear();
                list.jids.forEach(jid => bulkSelectedGroups.add(jid));
                switchToTab('bulk');
                renderBulkGroupList(document.getElementById('bulk-recipient-search')?.value || '');
                renderQuickSelectLists();
                fetchTemplates();
            });

            const editBtn = item.querySelector('.bl-edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const newName = await waPrompt({
                        title: 'Rename Preset List',
                        desc: `Enter a new name for "${list.name}"`,
                        label: 'New List Name:',
                        defaultValue: list.name,
                        icon: '✏️',
                        confirmText: 'Rename'
                    });
                    if (!newName || !newName.trim() || newName.trim() === list.name) return;
                    try {
                        const res = await fetch(`${API_BASE}/saved-lists/${list.id}/rename`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName.trim() })
                        });
                        const data = await res.json();
                        if (data.success) { 
                            savedLists = data.lists; 
                            renderSavedLists(); 
                            renderQuickSelectLists();
                            showToast(`Renamed to "${newName.trim()}"`, 'success');
                        }
                    } catch(err) {
                        showToast('Failed to rename list', 'error');
                    }
                });
            }

            const publicBtn = item.querySelector('.bl-public-btn');
            if (publicBtn) {
                publicBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
                        const res = await fetch(`${API_BASE}/saved-lists/${list.id}/toggle-public`, {
                            method: 'POST',
                            headers: { 'X-CSRF-TOKEN': csrfToken }
                        });
                        const data = await res.json();
                        if (data.success) { 
                            savedLists = data.lists; 
                            renderSavedLists(); 
                            renderQuickSelectLists();
                            showToast('List visibility updated', 'info');
                        }
                    } catch(err) {}
                });
            }

            const delBtn = item.querySelector('.bl-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const ok = await waConfirm({
                        title: 'Delete Preset List?',
                        desc: `Are you sure you want to delete "${list.name}"? This action cannot be undone.`,
                        icon: '🗑️',
                        confirmText: 'Delete List',
                        isDanger: true
                    });
                    if (!ok) return;
                    try {
                        await fetch(`${API_BASE}/saved-lists?id=${list.id}`, { method: 'DELETE' });
                        if (activeBroadcastListId === list.id) activeBroadcastListId = null;
                        fetchSavedLists();
                        showToast(`Deleted list "${list.name}"`, 'success');
                    } catch(err) {
                        showToast('Failed to delete list', 'error');
                    }
                });
            }

            container.appendChild(item);
        });

        // Show public lists from other users (admin/NOC only)
        if (publicLists && publicLists.length > 0) {
            const separator = document.createElement('div');
            separator.style.cssText = 'font-size:10px;font-weight:700;color:#facc15;text-transform:uppercase;letter-spacing:0.5px;padding:8px 4px 4px;border-top:1px solid #2a3942;margin-top:4px;';
            separator.textContent = '🌐 Shared Public Lists';
            container.appendChild(separator);

            publicLists.forEach(list => {
                const colors = ['#005c4b','#1d4ed8','#7c3aed','#b45309','#0f766e','#be185d'];
                const color = colors[(list.name||'').charCodeAt(0) % colors.length];
                const initials = (list.name||'L').substring(0,2).toUpperCase();
                const pubItem = document.createElement('div');
                pubItem.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer;background:#0d1b14;border:1px solid #facc1533;margin-bottom:4px;';
                pubItem.innerHTML = `
                    <div style="width:30px;height:30px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0;">${initials}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:12px;font-weight:700;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(list.name)}</div>
                        <div style="font-size:10px;color:#8696a0;">${list.targetCount} contacts · User #${list._ownerUserId}</div>
                    </div>
                `;
                pubItem.addEventListener('click', () => {
                    bulkSelectedGroups.clear();
                    list.jids.forEach(jid => bulkSelectedGroups.add(jid));
                    if (bulkSelectedCount) bulkSelectedCount.textContent = bulkSelectedGroups.size + ' Selected';
                    switchToTab('bulk');
                    renderBulkGroupList(document.getElementById('bulk-recipient-search')?.value || '');
                    renderQuickSelectLists();
                });
                container.appendChild(pubItem);
            });
        }
    }

    const btnAddBroadcastList = document.getElementById('btn-add-broadcast-list');
    if (btnAddBroadcastList) {
        btnAddBroadcastList.addEventListener('click', () => {
            bulkSelectedGroups.clear();
            activeBroadcastListId = null;
            document.querySelectorAll('.bl-item').forEach(el => el.classList.remove('active'));
            switchToTab('bulk');
            renderBulkGroupList('');
            renderQuickSelectLists();
            fetchTemplates();
        });
    }

    const btnSaveCurrentList = document.getElementById('btn-save-current-list');
    if (btnSaveCurrentList) {
        btnSaveCurrentList.addEventListener('click', async (e) => {
            e.preventDefault();
            const selectedJids = Array.from(bulkSelectedGroups);
            if (selectedJids.length === 0) { 
                showToast('Please select at least 1 contact or group to save.', 'warning'); 
                return; 
            }
            const name = await waPrompt({
                title: 'Save Selection as Preset',
                desc: `Save ${selectedJids.length} selected recipients as a quick-access preset list.`,
                label: 'Preset List Name:',
                placeholder: 'e.g. VIP Clients, Pabna Team, Monthly Bills',
                icon: '💾',
                confirmText: 'Save Preset'
            });
            let scope = 'personal';
            if (window.currentAuthUser && window.currentAuthUser.role === 'admin') {
                const isGlobal = await waConfirm({
                    title: 'Share Globally with Team?',
                    desc: `Do you want to save "${name.trim()}" as a GLOBAL Quick Select list so everyone on your team can see it?`,
                    icon: '🌐',
                    confirmText: 'Yes, Make Global',
                    cancelText: 'Personal Only'
                });
                if (isGlobal) scope = 'global';
            }
            try {
                const res = await fetch(`${API_BASE}/saved-lists`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-wa-admin': (window.currentAuthUser?.role === 'admin') ? '1' : '0' },
                    body: JSON.stringify({ name: name.trim(), jids: selectedJids, scope })
                });
                const data = await res.json();
                if (data.success) { 
                    savedLists = Array.isArray(data.lists) ? data.lists : []; 
                    globalLists = Array.isArray(data.globalLists) ? data.globalLists : [];
                    renderSavedLists(); 
                    renderQuickSelectLists();
                    showToast(`Preset list "${name.trim()}" saved successfully!`, 'success'); 
                } else {
                    showToast(data.message || 'Failed to save preset list.', 'error');
                }
            } catch(err) { 
                showToast('Failed to save: ' + err.message, 'error'); 
            }
        });
    }

    // ── Templates ──────────────────────────────────────────
    let globalTemplates = [];
    let personalTemplates = [];

    async function fetchTemplates() {
        const container = document.getElementById('templates-container');
        try {
            const res = await fetch(`${API_BASE}/templates`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            globalTemplates = Array.isArray(data.globalTemplates) ? data.globalTemplates : [];
            personalTemplates = Array.isArray(data.personalTemplates) ? data.personalTemplates : [];
        } catch(e) {
            globalTemplates = []; personalTemplates = [];
            if (container) container.innerHTML = '<span style="font-size:11px;color:#ef4444;">⚠ Could not load templates</span>';
            return;
        }
        renderTemplates();
    }

    function renderTemplates() {
        const container = document.getElementById('templates-container');
        const countBadge = document.getElementById('tmpl-count-badge');
        if (!container) return;
        container.innerHTML = '';

        const allTemplates = [
            ...globalTemplates.map(t => ({ ...t, scope: 'global' })),
            ...personalTemplates.map(t => ({ ...t, scope: 'personal' }))
        ];

        if (countBadge) countBadge.textContent = allTemplates.length;

        if (allTemplates.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:18px 0;color:#8696a0;font-size:11px;font-style:italic;">No templates yet.<br><span style="font-size:10px;">Write a message and click "Save Current"</span></div>';
            return;
        }

        const isDark = isDarkMode();
        const bgDefault = isDark ? '#111b21' : '#ffffff';
        const bgHover = isDark ? '#1a2a32' : '#f1f5f9';
        const borderDefault = isDark ? '#1e3040' : '#cbd5e1';
        const nameColor = isDark ? '#e9edef' : '#0f172a';
        const btnBg = isDark ? '#1a2a32' : '#f8fafc';
        const btnBorder = isDark ? '#2a3942' : '#cbd5e1';
        const subColor = isDark ? '#8696a0' : '#64748b';

        allTemplates.forEach(tmpl => {
            const isGlobal = tmpl.scope === 'global';
            const canDelete = isGlobal ? isSuperAdmin : true;
            const canEdit = isGlobal ? isSuperAdmin : true;
            const accentColor = isGlobal ? '#facc15' : (isDark ? '#00a884' : '#4f46e5');
            const badgeBg = isGlobal ? 'rgba(250,204,21,0.12)' : (isDark ? 'rgba(0,168,132,0.1)' : 'rgba(79,70,229,0.1)');
            const badgeBorder = isGlobal ? 'rgba(250,204,21,0.3)' : (isDark ? 'rgba(0,168,132,0.25)' : 'rgba(79,70,229,0.25)');
            const preview = tmpl.message ? (tmpl.message.length > 70 ? tmpl.message.substring(0,70) + '…' : tmpl.message) : '';

            const card = document.createElement('div');
            card.dataset.tmplId = tmpl.id;
            card.dataset.scope = tmpl.scope;
            card.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;background:${bgDefault};border:1px solid ${borderDefault};border-left:3px solid ${accentColor};border-radius:10px;cursor:pointer;transition:all 0.18s;`;
            card.onmouseenter = () => { card.style.background = bgHover; card.style.borderColor = accentColor; card.style.borderLeftColor = accentColor; };
            card.onmouseleave = () => { if (!card.classList.contains('tmpl-active')) { card.style.background = bgDefault; card.style.borderColor = borderDefault; card.style.borderLeftColor = accentColor; } };

            card.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        <span style="font-size:11px;font-weight:800;color:${nameColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${escapeHtml(tmpl.name)}</span>
                        <span style="flex-shrink:0;font-size:9px;font-weight:700;color:${accentColor};background:${badgeBg};border:1px solid ${badgeBorder};border-radius:10px;padding:1px 7px;">
                            ${isGlobal ? '🌐 Global' : '👤 Personal'}
                        </span>
                    </div>
                    <div style="font-size:10.5px;color:${subColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(preview)}</div>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;" class="tmpl-actions">
                    ${canEdit ? `<button class="tmpl-edit-btn" data-id="${tmpl.id}" data-scope="${tmpl.scope}" title="Edit"
                        style="width:26px;height:26px;border-radius:7px;background:${btnBg};border:1px solid ${btnBorder};color:${isDark ? '#00a884' : '#4f46e5'};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;">
                        <svg style="width:11px;height:11px;pointer-events:none;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>` : ''}
                    ${canDelete ? `<button class="tmpl-del-btn" data-id="${tmpl.id}" data-scope="${tmpl.scope}" title="Delete"
                        style="width:26px;height:26px;border-radius:7px;background:${btnBg};border:1px solid ${btnBorder};color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;">
                        <svg style="width:11px;height:11px;pointer-events:none;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>` : ''}
                </div>
            `;

            // Click card body → apply to textarea
            card.addEventListener('click', (e) => {
                if (e.target.closest('.tmpl-actions')) return;
                const textarea = document.getElementById('bulk-message-content');
                if (textarea) { textarea.value = tmpl.message; textarea.dispatchEvent(new Event('input')); textarea.focus(); }
                document.querySelectorAll('#templates-container [data-tmpl-id]').forEach(c => {
                    c.classList.remove('tmpl-active');
                    c.style.background = bgDefault; c.style.borderColor = borderDefault;
                });
                card.classList.add('tmpl-active');
                card.style.background = isGlobal ? 'rgba(250,204,21,0.08)' : (isDark ? 'rgba(0,168,132,0.07)' : 'rgba(79,70,229,0.08)');
                card.style.borderColor = accentColor;
            });

            // Edit button
            const editBtn = card.querySelector('.tmpl-edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openTemplateEditModal(tmpl);
                });
            }

            // Delete button
            const delBtn = card.querySelector('.tmpl-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`"${tmpl.name}" template delete করবেন?`)) return;
                    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
                    await fetch(`${API_BASE}/templates?id=${tmpl.id}&scope=${tmpl.scope}`, {
                        method: 'DELETE', headers: { 'X-CSRF-TOKEN': csrfToken }
                    });
                    fetchTemplates();
                });
            }

            container.appendChild(card);
        });
    }

    // ── Template Edit Modal ──────────────────────────────────────────
    function openTemplateEditModal(tmpl) {
        const modal = document.getElementById('tmpl-edit-modal');
        if (!modal) return;
        document.getElementById('tmpl-edit-id').value = tmpl.id;
        document.getElementById('tmpl-edit-scope').value = tmpl.scope;
        document.getElementById('tmpl-edit-name').value = tmpl.name;
        document.getElementById('tmpl-edit-message').value = tmpl.message;
        updateTmplEditPreview();
        modal.style.display = 'flex';
    }

    function updateTmplEditPreview() {
        const msg = document.getElementById('tmpl-edit-message')?.value || '';
        const preview = document.getElementById('tmpl-edit-preview');
        if (!preview) return;
        const rendered = msg.replace(/\{name\}/g, '<b style="color:#6ee7b7;">Rahim</b>').replace(/\{phone\}/g, '<b style="color:#6ee7b7;">017XXXXXXXX</b>');
        preview.innerHTML = rendered || '<span style="color:#8696a0;font-style:italic;">Preview will appear here...</span>';
    }

    const tmplEditMsg = document.getElementById('tmpl-edit-message');
    if (tmplEditMsg) tmplEditMsg.addEventListener('input', updateTmplEditPreview);

    document.querySelectorAll('.tmpl-tag-insert').forEach(btn => {
        btn.addEventListener('click', () => {
            const ta = document.getElementById('tmpl-edit-message');
            if (!ta) return;
            const pos = ta.selectionStart;
            ta.value = ta.value.slice(0, pos) + btn.dataset.tag + ta.value.slice(ta.selectionEnd);
            ta.selectionStart = ta.selectionEnd = pos + btn.dataset.tag.length;
            ta.focus();
            updateTmplEditPreview();
        });
    });

    const btnCloseTmplEdit = document.getElementById('btn-close-tmpl-edit');
    const btnCancelTmplEdit = document.getElementById('btn-cancel-tmpl-edit');
    [btnCloseTmplEdit, btnCancelTmplEdit].forEach(btn => {
        if (btn) btn.addEventListener('click', () => {
            const modal = document.getElementById('tmpl-edit-modal');
            if (modal) modal.style.display = 'none';
        });
    });

    const btnSaveTmplEdit = document.getElementById('btn-save-tmpl-edit');
    if (btnSaveTmplEdit) {
        btnSaveTmplEdit.addEventListener('click', async () => {
            const id = document.getElementById('tmpl-edit-id').value;
            const scope = document.getElementById('tmpl-edit-scope').value;
            const name = document.getElementById('tmpl-edit-name').value.trim();
            const message = document.getElementById('tmpl-edit-message').value.trim();
            if (!name || !message) { alert('Name and message required.'); return; }
            btnSaveTmplEdit.disabled = true;
            btnSaveTmplEdit.textContent = '⌛ Saving...';
            try {
                const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
                const res = await fetch(`${API_BASE}/templates/${id}/rename`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
                    body: JSON.stringify({ name, message, scope })
                });
                const data = await res.json();
                if (data.success) {
                    globalTemplates = data.globalTemplates || globalTemplates;
                    personalTemplates = data.personalTemplates || personalTemplates;
                    renderTemplates();
                    document.getElementById('tmpl-edit-modal').style.display = 'none';
                } else {
                    alert('Failed to save.');
                }
            } catch(e) { alert('Error: ' + e.message); }
            finally {
                btnSaveTmplEdit.disabled = false;
                btnSaveTmplEdit.innerHTML = '<svg style="width:13px;height:13px;" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Save Changes';
            }
        });
    }

    // Close modal on backdrop click
    document.getElementById('tmpl-edit-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('tmpl-edit-modal')) {
            document.getElementById('tmpl-edit-modal').style.display = 'none';
        }
    });

    // ── Template list collapse toggle ────────────────────────────────
    const btnToggleTemplates = document.getElementById('btn-toggle-templates');
    if (btnToggleTemplates) {
        btnToggleTemplates.addEventListener('click', () => {
            const container = document.getElementById('templates-container');
            if (!container) return;
            const collapsed = container.style.display === 'none';
            container.style.display = collapsed ? 'flex' : 'none';
            btnToggleTemplates.textContent = collapsed ? '▲' : '▼';
        });
    }

    const btnSaveTemplate = document.getElementById('btn-save-template');
    if (btnSaveTemplate) {
        btnSaveTemplate.addEventListener('click', async (e) => {
            e.preventDefault();
            const textarea = document.getElementById('bulk-message-content');
            const msg = textarea?.value?.trim();
            if (!msg) { 
                showToast('Write a message before saving as template.', 'warning'); 
                return; 
            }
            const name = await waPrompt({
                title: 'Save Message Template',
                desc: 'Save your current message draft as a reusable template.',
                label: 'Template Name:',
                placeholder: 'e.g. Payment Reminder, Service Update',
                icon: '📋',
                confirmText: 'Save Template'
            });
            if (!name || !name.trim()) return;

            let scope = 'personal';
            if (isSuperAdmin) {
                const makeGlobal = await waConfirm({
                    title: 'Make Template Global?',
                    desc: `Do you want to share "${name.trim()}" with all users as a Global Template?\n(Click Cancel for Personal template only).`,
                    icon: '🌐',
                    confirmText: 'Yes, Make Global',
                    cancelText: 'Keep Personal'
                });
                if (makeGlobal) scope = 'global';
            }

            try {
                const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
                const res = await fetch(`${API_BASE}/templates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
                    body: JSON.stringify({ name: name.trim(), message: msg, scope })
                });
                if (!res.ok) { 
                    showToast('Server error while saving template.', 'error'); 
                    return; 
                }
                const data = await res.json();
                if (data.success) {
                    globalTemplates = data.globalTemplates || [];
                    personalTemplates = data.personalTemplates || [];
                    renderTemplates();
                    showToast(`Template "${name.trim()}" saved!`, 'success');
                }
            } catch(err) { 
                showToast('Failed to save template: ' + err.message, 'error'); 
            }
        });
    }

    setTimeout(fetchTemplates, 500);

    document.querySelectorAll('.btn-tag-insert').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            const textarea = document.getElementById('bulk-message-content');
            if (!textarea || !tag) return;
            const start = textarea.selectionStart;
            textarea.value = textarea.value.substring(0, start) + tag + textarea.value.substring(textarea.selectionEnd);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + tag.length;
            textarea.dispatchEvent(new Event('input'));
        });
    });

    if (btnBulkSelectAll) {
        btnBulkSelectAll.addEventListener('click', (e) => {
            e.preventDefault();
            allChats.forEach(g => bulkSelectedGroups.add(g.id));
            renderBulkGroupList(bulkRecipientSearch?.value || '');
        });
    }

    if (btnBulkDeselectAll) {
        btnBulkDeselectAll.addEventListener('click', (e) => {
            e.preventDefault();
            bulkSelectedGroups.clear();
            renderBulkGroupList(bulkRecipientSearch?.value || '');
        });
    }

    const btnRemoveBulkImg = document.getElementById('btn-remove-bulk-img');

    function resetBulkImageUpload() {
        attachedBulkImageBase64 = null;
        if (bulkImageInput) bulkImageInput.value = '';
        const thumbWrap = document.getElementById('bulk-img-thumb-wrap');
        const placeholder = document.getElementById('bulk-img-placeholder');
        const dropZone = document.getElementById('bulk-img-drop-zone');
        const previewImgWrap = document.getElementById('bulk-preview-img-wrap');
        if (thumbWrap) thumbWrap.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        if (dropZone) { dropZone.style.borderColor = '#2a3942'; dropZone.style.background = '#111b21'; }
        if (previewImgWrap) previewImgWrap.style.display = 'none';
        if (btnRemoveBulkImg) btnRemoveBulkImg.style.display = 'none';
    }

    if (btnRemoveBulkImg) {
        btnRemoveBulkImg.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resetBulkImageUpload();
        });
    }

    if (bulkImageInput) {
        bulkImageInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => {
                    attachedBulkImageBase64 = ev.target.result;
                    // Show thumbnail in drop zone
                    const thumbWrap = document.getElementById('bulk-img-thumb-wrap');
                    const thumb = document.getElementById('bulk-img-thumb');
                    const filename = document.getElementById('bulk-img-filename');
                    const placeholder = document.getElementById('bulk-img-placeholder');
                    const dropZone = document.getElementById('bulk-img-drop-zone');
                    if (thumb) { thumb.src = ev.target.result; }
                    if (filename) filename.textContent = file.name;
                    if (thumbWrap) thumbWrap.style.display = 'block';
                    if (placeholder) placeholder.style.display = 'none';
                    if (dropZone) { dropZone.style.borderColor = '#00a884'; dropZone.style.background = 'rgba(0,168,132,0.05)'; }
                    if (btnRemoveBulkImg) btnRemoveBulkImg.style.display = 'inline-block';
                    // Show image in preview bubble
                    const previewImg = document.getElementById('bulk-preview-img');
                    const previewImgWrap = document.getElementById('bulk-preview-img-wrap');
                    if (previewImg) previewImg.src = ev.target.result;
                    if (previewImgWrap) previewImgWrap.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                resetBulkImageUpload();
            }
        });
    }

    // ── Live message preview ────────────────────────────────────────
    function updateBulkPreview() {
        const textarea = document.getElementById('bulk-message-content');
        const bubble = document.getElementById('bulk-preview-bubble');
        if (!textarea || !bubble) return;
        const raw = textarea.value;
        if (!raw.trim()) {
            bubble.innerHTML = '<span style="color:#8696a0;font-style:italic;">Message preview...</span>';
            return;
        }
        const rendered = escapeHtml(raw)
            .replace(/\{name\}/g, '<b style="color:#6ee7b7;">Rahim</b>')
            .replace(/\{phone\}/g, '<b style="color:#6ee7b7;">017XXXXXXXX</b>')
            .replace(/\n/g, '<br>');
        bubble.innerHTML = rendered;
    }
    const bulkMsgTextarea = document.getElementById('bulk-message-content');
    function adjustBulkTextareaHeight() {
        if (!bulkMsgTextarea) return;
        bulkMsgTextarea.style.height = 'auto';
        bulkMsgTextarea.style.height = Math.max(280, bulkMsgTextarea.scrollHeight) + 'px';
    }
    window.adjustBulkTextareaHeight = adjustBulkTextareaHeight;

    if (bulkMsgTextarea) {
        bulkMsgTextarea.addEventListener('input', () => {
            adjustBulkTextareaHeight();
            updateBulkPreview();
        });
        setTimeout(adjustBulkTextareaHeight, 150);
    }

    // ── Broadcast Mode Toggle (immediate vs scheduled) ─────────────────
    const broadcastModeImmediate = document.getElementById('broadcast-mode-immediate');
    const broadcastModeScheduled = document.getElementById('broadcast-mode-scheduled');
    const scheduleFields = document.getElementById('schedule-fields');

    function updateBroadcastMode() {
        const isScheduled = broadcastModeScheduled?.checked;
        if (scheduleFields) scheduleFields.style.display = isScheduled ? 'block' : 'none';
        // Update visual card radio button state
        const nowLabel = document.getElementById('mode-now-label');
        const schedLabel = document.getElementById('mode-sched-label');
        const schedDot = document.getElementById('sched-radio-dot');
        const nowDotOuter = nowLabel?.querySelector('div[style*="border-radius:50%"]');
        if (nowLabel) nowLabel.style.borderColor = isScheduled ? '#2a3942' : '#00a884';
        if (schedLabel) schedLabel.style.borderColor = isScheduled ? '#00a884' : '#2a3942';
        if (schedDot) {
            schedDot.style.borderColor = isScheduled ? '#00a884' : '#374248';
            schedDot.style.background = isScheduled ? '#00a884' : 'transparent';
            const innerDot = schedDot.querySelector('div');
            if (innerDot) innerDot.style.background = isScheduled ? 'white' : 'transparent';
        }
        // Update send button text with icon SVG preserved
        if (btnStartBulk) {
            const svg = btnStartBulk.querySelector('svg');
            btnStartBulk.innerHTML = '';
            if (svg) btnStartBulk.appendChild(svg);
            btnStartBulk.appendChild(document.createTextNode(isScheduled ? ' Schedule Broadcast' : ' Start Bulk Broadcast'));
        }
    }

    if (broadcastModeImmediate) broadcastModeImmediate.addEventListener('change', updateBroadcastMode);
    if (broadcastModeScheduled) broadcastModeScheduled.addEventListener('change', updateBroadcastMode);

    // ── Preview Panel Toggle ───────────────────────────────────────────
    const btnTogglePreview = document.getElementById('btn-toggle-preview');
    const bulkPreviewPanel = document.getElementById('bulk-preview-panel');
    if (btnTogglePreview && bulkPreviewPanel) {
        btnTogglePreview.addEventListener('click', () => {
            const visible = bulkPreviewPanel.style.display !== 'none';
            bulkPreviewPanel.style.display = visible ? 'none' : 'block';
            btnTogglePreview.style.color = visible ? '#8696a0' : '#00a884';
            btnTogglePreview.style.borderColor = visible ? '#2a3942' : 'rgba(0,168,132,0.4)';
            btnTogglePreview.style.background = visible ? 'rgba(255,255,255,0.04)' : 'rgba(0,168,132,0.1)';
            if (!visible) updateBulkPreview();
        });
    }

    // Bulk Send / Schedule
    if (formBulkMsg) {
        formBulkMsg.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (bulkSelectedGroups.size === 0) {
                alert('Please select target recipients.');
                return;
            }

            const text = document.getElementById('bulk-message-content')?.value.trim() || '';
            const isScheduled = broadcastModeScheduled?.checked;
            const broadcastName = document.getElementById('broadcast-name')?.value.trim() || ('Broadcast ' + new Date().toLocaleString());

            if (isScheduled) {
                // Schedule broadcast
                const scheduledAtInput = document.getElementById('schedule-datetime');
                const scheduledAt = scheduledAtInput?.value;
                if (!scheduledAt) { alert('Please pick a date and time.'); return; }
                if (new Date(scheduledAt).getTime() <= Date.now()) { alert('Scheduled time must be in the future.'); return; }
                if (!text && !attachedBulkImageBase64) { alert('Please write a message or attach an image.'); return; }

                try {
                    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
                    const res = await fetch(`${API_BASE}/scheduled-broadcasts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
                        body: JSON.stringify({
                            name: broadcastName,
                            message: text,
                            imageBase64: attachedBulkImageBase64,
                            jids: Array.from(bulkSelectedGroups),
                            scheduledAt
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert(`✅ Broadcast scheduled for ${new Date(scheduledAt).toLocaleString()}\nWill be sent to ${bulkSelectedGroups.size} recipients.`);
                        fetchScheduledBroadcasts();
                    } else {
                        alert('Failed to schedule: ' + (data.message || 'Unknown error'));
                    }
                } catch(err) {
                    alert('Error: ' + err.message);
                }
                return;
            }

            // Immediate broadcast via server-side endpoint
            if (!text && !attachedBulkImageBase64) { alert('Please write a message or attach an image.'); return; }

            isSending = true;
            btnStartBulk.disabled = true;
            btnStartBulk.textContent = '⏳ Sending...';
            if (bulkProgressSection) bulkProgressSection.style.display = 'block';
            if (bulkProgressBarInner) bulkProgressBarInner.style.width = '10%';
            if (bulkProgressText) bulkProgressText.textContent = `Sending to ${bulkSelectedGroups.size} recipients via server...`;
            if (bulkConsoleLog) bulkConsoleLog.innerHTML = `[${new Date().toLocaleTimeString()}] Starting broadcast "${broadcastName}" → ${bulkSelectedGroups.size} recipients...\n`;

            try {
                const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
                const res = await fetch(`${API_BASE}/broadcast`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
                    body: JSON.stringify({
                        name: broadcastName,
                        jids: Array.from(bulkSelectedGroups),
                        message: text,
                        imageBase64: attachedBulkImageBase64
                    })
                });
                const data = await res.json();
                if (bulkProgressBarInner) bulkProgressBarInner.style.width = '100%';
                if (data.success) {
                    if (bulkProgressText) bulkProgressText.textContent = `Done! ✅ ${data.sentCount} sent, ❌ ${data.failCount} failed`;
                    if (bulkConsoleLog) bulkConsoleLog.innerHTML += `[${new Date().toLocaleTimeString()}] 🎉 Finished! Sent: ${data.sentCount}, Failed: ${data.failCount}\n`;
                    fetchBroadcastHistory();
                } else {
                    if (bulkProgressText) bulkProgressText.textContent = 'Failed: ' + (data.message || 'Unknown error');
                }
            } catch(err) {
                if (bulkProgressText) bulkProgressText.textContent = 'Network error: ' + err.message;
            }

            btnStartBulk.disabled = false;
            btnStartBulk.textContent = '🚀 Start Bulk Broadcast';
            isSending = false;
        });
    }

    fetchSavedLists();

    function logBulkConsole(msg) {
        if (bulkConsoleLog) {
            bulkConsoleLog.innerHTML += msg + '\n';
            bulkConsoleLog.scrollTop = bulkConsoleLog.scrollHeight;
        }
    }

    // ── Scheduled Broadcasts ──────────────────────────────────────────
    async function fetchScheduledBroadcasts() {
        try {
            const res = await fetch(`${API_BASE}/scheduled-broadcasts`);
            const data = await res.json();
            renderScheduledBroadcasts(data.scheduled || []);
        } catch(e) {}
    }

    function renderScheduledBroadcasts(list) {
        const container = document.getElementById('scheduled-broadcasts-list');
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = '<p style="font-size:11px;color:#8696a0;text-align:center;padding:12px;margin:0;">No scheduled broadcasts</p>';
            return;
        }
        container.innerHTML = '';
        list.forEach(b => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #1a2a32;';
            const dt = new Date(b.scheduledAt);
            row.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:700;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(b.name)}</div>
                    <div style="font-size:11px;color:#00a884;">📅 ${dt.toLocaleString()}</div>
                    <div style="font-size:10px;color:#8696a0;">${b.jids.length} recipients · ${escapeHtml(b.message?.substring(0,40) || '')}</div>
                </div>
                <button class="sched-del-btn" data-id="${b.id}" style="width:26px;height:26px;border-radius:6px;background:#1a2a32;border:1px solid #2a3942;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            `;
            const delBtn = row.querySelector('.sched-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (!confirm(`Cancel scheduled broadcast "${b.name}"?`)) return;
                    await fetch(`${API_BASE}/scheduled-broadcasts?id=${b.id}`, { method: 'DELETE' });
                    fetchScheduledBroadcasts();
                });
            }
            container.appendChild(row);
        });
    }

    // ── Broadcast History Panel ────────────────────────────────────────
    async function fetchBroadcastHistory() {
        try {
            const res = await fetch(`${API_BASE}/broadcast-history`);
            const data = await res.json();
            renderBroadcastHistory(data.history || []);
        } catch(e) {}
    }

    function renderBroadcastHistory(list) {
        const container = document.getElementById('broadcast-history-list');
        const countBadge = document.getElementById('broadcast-history-count');
        if (!container) return;
        if (countBadge) countBadge.textContent = list.length;
        if (list.length === 0) {
            container.innerHTML = '<p style="font-size:11px;color:#8696a0;text-align:center;padding:20px;margin:0;">No broadcast history yet</p>';
            return;
        }
        container.innerHTML = '';
        list.forEach(h => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:12px 14px;border-bottom:1px solid #1a2a32;';
            const successRate = h.jids?.length > 0 ? Math.round((h.sentCount / h.jids.length) * 100) : 0;
            row.innerHTML = `
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(h.name)}</div>
                        <div style="font-size:10px;color:#8696a0;margin-top:2px;">${escapeHtml(h.timestamp)} · ${h.type === 'scheduled' ? '📅 Scheduled' : '🚀 Immediate'}</div>
                    </div>
                    <button class="hist-del-btn" data-id="${h.id}" style="width:22px;height:22px;border-radius:5px;background:#1a2a32;border:1px solid #2a3942;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;">✕</button>
                </div>
                <div style="font-size:11px;color:#c1c7cd;background:#111b21;border-radius:6px;padding:6px 8px;margin-bottom:6px;max-height:40px;overflow:hidden;border:1px solid #1e3040;">${escapeHtml(h.message?.substring(0,120) || '')}</div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:11px;color:#00a884;font-weight:600;">✅ ${h.sentCount} sent</span>
                    ${h.failCount > 0 ? `<span style="font-size:11px;color:#ef4444;font-weight:600;">❌ ${h.failCount} failed</span>` : ''}
                    <span style="font-size:11px;color:#8696a0;">${h.jids?.length || 0} total</span>
                    <div style="flex:1;height:4px;background:#1e3040;border-radius:2px;min-width:40px;">
                        <div style="height:100%;width:${successRate}%;background:#00a884;border-radius:2px;"></div>
                    </div>
                    <span style="font-size:10px;color:#8696a0;">${successRate}%</span>
                </div>
            `;
            const delBtn = row.querySelector('.hist-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    await fetch(`${API_BASE}/broadcast-history?id=${h.id}`, { method: 'DELETE' });
                    fetchBroadcastHistory();
                });
            }
            container.appendChild(row);
        });
    }

    // History panel toggle
    const btnOpenHistory = document.getElementById('btn-open-history');
    const historyPanel = document.getElementById('history-panel');
    const btnCloseHistory = document.getElementById('btn-close-history');

    if (btnOpenHistory && historyPanel) {
        btnOpenHistory.addEventListener('click', () => {
            historyPanel.classList.toggle('open');
            if (historyPanel.classList.contains('open')) {
                fetchBroadcastHistory();
                fetchScheduledBroadcasts();
            }
        });
    }
    if (btnCloseHistory && historyPanel) {
        btnCloseHistory.addEventListener('click', () => historyPanel.classList.remove('open'));
    }

    // History tabs
    document.querySelectorAll('.hist-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hist-tab-btn').forEach(b => {
                b.style.background = 'transparent'; b.style.color = '#8696a0';
            });
            btn.style.background = '#00a884'; btn.style.color = '#ffffff';
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.hist-tab-pane').forEach(p => p.style.display = 'none');
            const pane = document.getElementById('hist-tab-' + tab);
            if (pane) pane.style.display = 'block';
        });
    });

    // Load history on open
    fetchBroadcastHistory();
    fetchScheduledBroadcasts();

    async function fetchSessions() {
        if (!window.waConfig || !window.waConfig.isSuperAdmin) return;
        try {
            const res = await fetch(`${API_BASE}/sessions`);
            if (!res.ok) return;
            const data = await res.json();
            renderSessionsList(data.sessions || []);
        } catch(e) {}
    }

    function renderSessionsList(sessionsList) {
        const container = document.getElementById('sessions-list');
        if (!container) return;
        container.innerHTML = '';
        if (sessionsList.length === 0) {
            container.innerHTML = '<p style="font-size:11px;color:#8696a0;text-align:center;padding:12px;">No active sessions</p>';
            return;
        }
        sessionsList.forEach(s => {
            const dot = s.status === 'connected' ? '#00a884' : s.status === 'qr_ready' ? '#facc15' : '#f87171';
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #1a2a32;';
            const displayName = s.userName || s.user?.name || ('User #' + s.userId);
            const displaySub = (s.userEmail ? (s.userEmail + ' · ') : '') + (s.user?.phone ? (s.user.phone + ' · ') : '') + (s.chatCount || 0) + ' chats';
            row.innerHTML = `
                <div style="width:36px;height:36px;border-radius:50%;background:#1a2a32;border:2px solid ${dot};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">
                    ${s.user?.profilePic ? `<img src="${escapeHtml(s.user.profilePic)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='👤'">` : '👤'}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:700;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(displayName)}</div>
                    <div style="font-size:10px;color:#8696a0;">${escapeHtml(displaySub)}</div>
                    <span style="font-size:10px;padding:1px 7px;border-radius:8px;background:${dot}22;color:${dot};border:1px solid ${dot}44;font-weight:600;">${s.status}</span>
                </div>
                <button class="sess-logout-btn" data-userid="${escapeHtml(s.userId)}"
                    style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:#2a1010;border:1px solid #7f1d1d;border-radius:8px;color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;flex-shrink:0;"
                    onmouseover="this.style.background='#450a0a'" onmouseout="this.style.background='#2a1010'">
                    <svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    Logout
                </button>
            `;
            const logoutBtn = row.querySelector('.sess-logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    const uid = logoutBtn.getAttribute('data-userid');
                    if (!confirm(`"${displayName}" এর WhatsApp logout করবেন?`)) return;
                    logoutBtn.disabled = true;
                    logoutBtn.textContent = '⌛...';
                    try {
                        const res = await fetch(`${API_BASE}/sessions/${uid}/logout`, {
                            method: 'POST'
                        });
                        const data = await res.json();
                        if (data.success) {
                            setTimeout(fetchSessions, 2000);
                        } else {
                            alert('Failed: ' + (data.message || 'Unknown error'));
                            logoutBtn.disabled = false;
                            logoutBtn.textContent = 'Logout';
                        }
                    } catch (err) {
                        alert('Error: ' + err.message);
                        logoutBtn.disabled = false;
                        logoutBtn.textContent = 'Logout';
                    }
                });
            }
            container.appendChild(row);
        });
    }

    const btnOpenSessions = document.getElementById('btn-open-sessions');
    const sessionsPanel = document.getElementById('sessions-panel');
    const btnCloseSessions = document.getElementById('btn-close-sessions');

    if (btnOpenSessions && sessionsPanel) {
        btnOpenSessions.addEventListener('click', () => {
            if (!window.waConfig || !window.waConfig.isSuperAdmin) return;
            sessionsPanel.classList.toggle('open');
            if (sessionsPanel.classList.contains('open')) fetchSessions();
        });
    }
    if (btnCloseSessions && sessionsPanel) {
        btnCloseSessions.addEventListener('click', () => sessionsPanel.classList.remove('open'));
    }

    setInterval(() => {
        if (window.waConfig && window.waConfig.isSuperAdmin && sessionsPanel && sessionsPanel.classList.contains('open')) {
            fetchSessions();
        }
    }, 15000);

    if (btnResync) {
        btnResync.addEventListener('click', async (e) => {
            e.preventDefault();
            const origHtml = btnResync.innerHTML;
            btnResync.disabled = true;
            btnResync.innerHTML = '<span style="font-size:11px;font-weight:700;">🔄 Syncing...</span>';
            try {
                const res = await fetch(`${API_BASE}/sync`, { method: 'POST' });
                const data = await res.json();
                await fetchChats();
                btnResync.innerHTML = '<span style="font-size:11px;font-weight:700;color:#00a884;">✓ Synced</span>';
                setTimeout(() => {
                    btnResync.innerHTML = origHtml;
                    btnResync.disabled = false;
                }, 1500);
            } catch (err) {
                alert('Sync error: ' + err.message);
                btnResync.innerHTML = origHtml;
                btnResync.disabled = false;
            }
        });
    }

    if (btnWaAuth) {
        btnWaAuth.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('[WA] Login btn clicked, isConnected:', isConnected);
            if (isConnected) {
                if (!confirm('আপনার WhatsApp account disconnect হয়ে যাবে। নতুন করে QR scan করতে হবে। Continue?')) return;
                btnWaAuth.disabled = true;
                btnWaAuth.textContent = '⌛...';
                try {
                    isConnected = false;
                    allChats = [];
                    activeChatJid = null;
                    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
                    await fetch(`${API_BASE}/logout`, { method: 'POST', headers: { 'X-CSRF-TOKEN': csrfToken } });
                    openQrModal();
                    setTimeout(() => pollWhatsAppStatus(), 1500);
                } catch (err) {
                    alert('Error: ' + err.message);
                } finally {
                    btnWaAuth.disabled = false;
                }
            } else {
                openQrModal();
            }
        });
    }

    if (btnCloseQr && qrModal) {
        btnCloseQr.addEventListener('click', (e) => {
            e.preventDefault();
            qrModal.classList.add('hidden');
            qrModal.style.display = 'none';
        });
    }

    if (btnCloseBulk) {
        btnCloseBulk.addEventListener('click', (e) => {
            e.preventDefault();
            switchToTab('chat');
        });
    }

    // Modal backdrop clicks
    if (qrModal) {
        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) {
                qrModal.classList.add('hidden');
                qrModal.style.display = 'none';
            }
        });
    }
    if (newChatModal) {
        newChatModal.addEventListener('click', (e) => {
            if (e.target === newChatModal) {
                newChatModal.classList.add('hidden');
            }
        });
    }

    // ── Sidebar Collapse ────────────────────────────────────────────────
    const sidebar = document.querySelector('.wa-sidebar');
    const btnCollapse = document.getElementById('btn-collapse-sidebar');

    if (btnCollapse && sidebar) {
        btnCollapse.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            btnCollapse.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
            localStorage.setItem('wa_sidebar_collapsed', isCollapsed ? '1' : '0');
        });
        if (localStorage.getItem('wa_sidebar_collapsed') === '1') {
            sidebar.classList.add('collapsed');
            btnCollapse.title = 'Expand sidebar';
        }
        sidebar.addEventListener('click', (e) => {
            if (sidebar.classList.contains('collapsed') && e.target !== btnCollapse && !btnCollapse.contains(e.target)) {
                sidebar.classList.remove('collapsed');
                btnCollapse.title = 'Collapse sidebar';
                localStorage.setItem('wa_sidebar_collapsed', '0');
            }
        });
    }

    // ── Export Contacts to CSV ─────────────────────────────────────────
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', (e) => {
            e.preventDefault();
            if (!allChats || allChats.length === 0) {
                alert('No contacts or chats available to export.');
                return;
            }
            const headers = ['Name', 'Phone / ID', 'Type', 'Unread Count'];
            const rows = allChats.map(c => {
                const isGroup = c.isGroup || (c.id && c.id.endsWith('@g.us'));
                const cleanPhone = isGroup ? c.id : ('+' + c.id.replace('@s.whatsapp.net', ''));
                const safeName = (c.name || '').replace(/"/g, '""');
                return `"${safeName}","${cleanPhone}","${isGroup ? 'Group' : 'Personal'}",${c.unreadCount || 0}`;
            });
            const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `whatsapp_contacts_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // ── GitHub Cloud Sync Logic ────────────────────────────────────────
    async function openGitHubSyncModal() {
        const modal = document.getElementById('github-sync-modal');
        if (!modal) return;
        if (modal.parentNode !== document.body) document.body.appendChild(modal);
        modal.style.display = 'flex';
        await loadGitHubSyncSettings();
    }

    function closeGitHubSyncModal() {
        const modal = document.getElementById('github-sync-modal');
        if (modal) modal.style.display = 'none';
    }

    async function loadGitHubSyncSettings() {
        try {
            const res = await fetch(`${API_BASE}/github-sync/config`);
            const data = await res.json();
            if (data.success && data.config) {
                const cfg = data.config;
                const repoEl = document.getElementById('gh-input-repo');
                const branchEl = document.getElementById('gh-input-branch');
                const tokenEl = document.getElementById('gh-input-token');
                const autoSyncEl = document.getElementById('gh-input-autosync');
                const statusBadge = document.getElementById('github-sync-status-badge');

                if (repoEl) repoEl.value = cfg.repo || '';
                if (branchEl) branchEl.value = cfg.branch || 'main';
                if (tokenEl && cfg.token) tokenEl.placeholder = cfg.token;
                if (autoSyncEl) autoSyncEl.checked = !!cfg.autoSync;

                if (statusBadge) {
                    if (cfg.repo) {
                        statusBadge.textContent = `Connected: ${cfg.repo}`;
                        statusBadge.style.background = '#d1fae5';
                        statusBadge.style.color = '#065f46';
                    } else {
                        statusBadge.textContent = 'Not Configured';
                        statusBadge.style.background = '#e2e8f0';
                        statusBadge.style.color = '#475569';
                    }
                }
            }
        } catch(e) {}
    }

    function showGitHubResult(icon, text, type) {
        const box = document.getElementById('gh-sync-result-box');
        const iconEl = document.getElementById('gh-sync-result-icon');
        const textEl = document.getElementById('gh-sync-result-text');
        if (!box || !iconEl || !textEl) return;
        box.style.display = 'flex';
        iconEl.textContent = icon;
        textEl.textContent = text;
        if (type === 'success') {
            box.style.background = 'rgba(16, 185, 129, 0.12)';
            box.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            box.style.color = '#059669';
        } else if (type === 'error') {
            box.style.background = 'rgba(239, 68, 68, 0.12)';
            box.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            box.style.color = '#dc2626';
        } else {
            box.style.background = 'rgba(99, 102, 241, 0.12)';
            box.style.border = '1px solid rgba(99, 102, 241, 0.3)';
            box.style.color = '#4f46e5';
        }
    }

    async function saveGitHubSyncSettings(e) {
        if (e) e.preventDefault();
        const repo = document.getElementById('gh-input-repo')?.value.trim();
        const branch = document.getElementById('gh-input-branch')?.value.trim() || 'main';
        const token = document.getElementById('gh-input-token')?.value.trim();
        const autoSync = document.getElementById('gh-input-autosync')?.checked;

        try {
            const res = await fetch(`${API_BASE}/github-sync/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo, branch, token, autoSync })
            });
            const data = await res.json();
            if (data.success) {
                showToast('GitHub configuration saved!', 'success');
                showGitHubResult('✅', 'GitHub configuration and token saved successfully!', 'success');
                await loadGitHubSyncSettings();
            } else {
                showToast(data.message || 'Failed to save config', 'error');
                showGitHubResult('❌', data.message || 'Failed to save configuration', 'error');
            }
        } catch(err) {
            showToast('Error saving GitHub settings: ' + err.message, 'error');
            showGitHubResult('❌', 'Error saving settings: ' + err.message, 'error');
        }
    }

    async function executeGitHubPull(silent = false) {
        const btn = document.getElementById('btn-github-pull');
        if (btn) btn.disabled = true;
        if (!silent) {
            showToast('Syncing Global templates & lists from GitHub...', 'info');
            showGitHubResult('⏳', 'Downloading latest Global data from GitHub...', 'info');
        }

        try {
            const res = await fetch(`${API_BASE}/github-sync/pull`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                if (Array.isArray(data.globalTemplates)) {
                    globalTemplates = data.globalTemplates;
                    renderTemplates();
                }
                if (Array.isArray(data.globalLists)) {
                    globalLists = data.globalLists;
                    renderQuickSelectLists();
                    renderSavedLists();
                }
                if (!silent) {
                    showToast(data.message || 'Synced successfully from GitHub!', 'success');
                    showGitHubResult('✅', data.message || 'Synced successfully from GitHub!', 'success');
                }
            } else {
                if (!silent) {
                    showToast(data.message || 'GitHub sync failed.', 'error');
                    showGitHubResult('❌', data.message || 'GitHub sync failed.', 'error');
                }
            }
        } catch(err) {
            if (!silent) {
                showToast('Sync error: ' + err.message, 'error');
                showGitHubResult('❌', 'Sync error: ' + err.message, 'error');
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function executeGitHubPush() {
        const btn = document.getElementById('btn-github-push');
        if (btn) btn.disabled = true;
        showToast('Uploading Global data to GitHub...', 'info');
        showGitHubResult('⏳', 'Uploading Global templates & lists to GitHub...', 'info');

        try {
            const res = await fetch(`${API_BASE}/github-sync/push`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'Uploaded to GitHub successfully!', 'success');
                showGitHubResult('✅', data.message || 'Uploaded to GitHub successfully!', 'success');
            } else {
                showToast(data.message || 'GitHub upload failed.', 'error');
                showGitHubResult('❌', data.message || 'GitHub upload failed.', 'error');
            }
        } catch(err) {
            showToast('Upload error: ' + err.message, 'error');
            showGitHubResult('❌', 'Upload error: ' + err.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    const btnOpenGh = document.getElementById('btn-github-sync-open');
    if (btnOpenGh) btnOpenGh.addEventListener('click', openGitHubSyncModal);
    window.openGitHubSyncModal = openGitHubSyncModal;
    window.closeGitHubSyncModal = closeGitHubSyncModal;
    window.executeGitHubPull = executeGitHubPull;
    window.executeGitHubPush = executeGitHubPush;
    window.saveGitHubSyncSettings = saveGitHubSyncSettings;

    // Check autoSync on initial load
    setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/github-sync/config`);
            const data = await res.json();
            if (data.success && data.config?.autoSync && data.config?.repo) {
                console.log('[WA] Auto-syncing from GitHub...');
                executeGitHubPull(true);
            }
        } catch(e) {}
    }, 1500);

    // ── Start Polling ──────────────────────────────────────────────────
    pollWhatsAppStatus();
    setInterval(pollWhatsAppStatus, 3000);

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function formatWhatsAppText(str) {
        if (!str) return '';
        let escaped = escapeHtml(str);
        // Linkify URLs
        escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#0284c7;text-decoration:underline;word-break:break-all;">$1</a>');
        // Bold: *text*
        escaped = escaped.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
        // Italic: _text_
        escaped = escaped.replace(/_([^_\n]+)_/g, '<em>$1</em>');
        // Strikethrough: ~text~
        escaped = escaped.replace(/~([^~\n]+)~/g, '<del>$1</del>');
        // Monospace: ```text```
        escaped = escaped.replace(/```([^`]+)```/g, '<code style="background:rgba(0,0,0,0.08);padding:1px 4px;border-radius:4px;font-family:monospace;font-size:11px;">$1</code>');
        return escaped;
    }
});
