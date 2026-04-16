// ============================================
// FinControl - Controle Financeiro Pessoal
// Web App completo (modo local - localStorage)
// Sem servidor necessário
// ============================================

// ===== BANCO DE DADOS LOCAL =====
const DB = {
    _get(key) {
        try { return JSON.parse(localStorage.getItem('fc_' + key)) || []; }
        catch { return []; }
    },
    _set(key, data) {
        localStorage.setItem('fc_' + key, JSON.stringify(data));
    },
    _getObj(key) {
        try { return JSON.parse(localStorage.getItem('fc_' + key)) || {}; }
        catch { return {}; }
    },
    _setObj(key, data) {
        localStorage.setItem('fc_' + key, JSON.stringify(data));
    },
    id() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },
    now() { return new Date().toISOString(); },

    // ===== USERS =====
    getUsers() { return this._get('users'); },
    saveUsers(u) { this._set('users', u); },
    findUser(email) { return this.getUsers().find(u => u.email === email); },
    createUser(name, email, password) {
        const user = { id: this.id(), email, full_name: name, password, created_at: this.now() };
        const users = this.getUsers();
        users.push(user);
        this.saveUsers(users);
        return user;
    },

    // ===== SESSION =====
    getSession() { return this._getObj('session'); },
    setSession(user) { this._setObj('session', { user_id: user.id, email: user.email, full_name: user.full_name }); },
    clearSession() { this._setObj('session', {}); },

    // ===== CARDS =====
    getCards(userId) { return this._get('cards').filter(c => c.user_id === userId && c.is_active !== false); },
    saveCards(userId, cards) { this._set('cards', cards); },
    addCard(card) { const cards = this._get('cards'); cards.push(card); this._set('cards', cards); },
    updateCard(id, data) {
        const cards = this._get('cards');
        const i = cards.findIndex(c => c.id === id);
        if (i >= 0) Object.assign(cards[i], data);
        this._set('cards', cards);
    },
    deleteCard(id) {
        const cards = this._get('cards');
        const i = cards.findIndex(c => c.id === id);
        if (i >= 0) cards[i].is_active = false;
        this._set('cards', cards);
    },

    // ===== FAMILY =====
    getFamily(userId) { return this._get('family').filter(f => f.user_id === userId && f.is_active !== false); },
    addFamily(fam) { const fams = this._get('family'); fams.push(fam); this._set('family', fams); },
    updateFamily(id, data) {
        const fams = this._get('family');
        const i = fams.findIndex(f => f.id === id);
        if (i >= 0) Object.assign(fams[i], data);
        this._set('family', fams);
    },

    // ===== PURCHASES =====
    getPurchases(userId) { return this._get('purchases').filter(p => p.user_id === userId).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)); },
    addPurchase(p) {
        const purchases = this._get('purchases');
        purchases.push(p);
        this._set('purchases', purchases);
        // Gerar parcelas automaticamente
        this.generateInstallments(p);
    },

    // ===== INSTALLMENTS (parcelas) =====
    generateInstallments(purchase) {
        const installments = this._get('installments');
        for (let i = 1; i <= purchase.installment_count; i++) {
            const refDate = new Date(purchase.purchase_date);
            refDate.setMonth(refDate.getMonth() + i - 1);
            refDate.setDate(1);
            installments.push({
                id: this.id(),
                purchase_id: purchase.id,
                user_id: purchase.user_id,
                credit_card_id: purchase.credit_card_id,
                family_member_id: purchase.family_member_id,
                installment_number: i,
                total_installments: purchase.installment_count,
                amount: purchase.installment_value,
                reference_month: refDate.toISOString().split('T')[0].substring(0, 7) + '-01',
                is_paid: false,
                created_at: this.now()
            });
        }
        this._set('installments', installments);
    },

    getInstallments(userId) { return this._get('installments').filter(i => i.user_id === userId); },
    getInstallmentsByMonth(userId, yearMonth) {
        return this.getInstallments(userId).filter(i => i.reference_month.startsWith(yearMonth));
    },

    // ===== INVOICES (faturas) =====
    getInvoices(userId) { return this._get('invoices').filter(i => i.user_id === userId); },
    addInvoice(inv) {
        const invoices = this._get('invoices');
        invoices.push(inv);
        this._set('invoices', invoices);
    },
    updateInvoice(id, data) {
        const invoices = this._get('invoices');
        const i = invoices.findIndex(inv => inv.id === id);
        if (i >= 0) Object.assign(invoices[i], data);
        this._set('invoices', invoices);
    },
    generateInvoices(userId, cards) {
        // Gera faturas para cada cartao baseado nas parcelas do mes
        const monthStr = this.selectedMonthStr();
        const allInst = this.getInstallments(userId);
        const allPayments = this.getPayments(userId);

        for (const card of cards) {
            // Verifica se ja existe fatura para este mes
            const existing = this._get('invoices').find(inv =>
                inv.credit_card_id === card.id && inv.reference_month.startsWith(monthStr)
            );
            if (existing) continue;

            // Soma parcelas nao pagas do mes
            const cardInst = allInst.filter(i =>
                i.credit_card_id === card.id && i.reference_month.startsWith(monthStr) && !i.is_paid
            );
            const total = cardInst.reduce((s, i) => s + Number(i.amount), 0);
            if (total === 0) continue;

            // Calcula datas
            const [y, m] = monthStr.split('-').map(Number);
            const closingDay = Math.min(card.closing_day, new Date(y, m, 0).getDate());
            const closingDate = new Date(y, m - 1, closingDay);
            const dueDate = new Date(closingDate);
            dueDate.setDate(dueDate.getDate() + 10);

            this.addInvoice({
                id: this.id(),
                credit_card_id: card.id,
                user_id: userId,
                reference_month: `${monthStr}-01`,
                total_amount: total,
                paid_amount: 0,
                closing_date: closingDate.toISOString().split('T')[0],
                due_date: dueDate.toISOString().split('T')[0],
                status: 'aberta',
                created_at: this.now()
            });
        }
    },

    selectedMonthStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    },

    // ===== PAYMENTS =====
    getPayments(userId) { return this._get('payments').filter(p => p.user_id === userId); },
    getPaymentsByInvoice(invoiceId) { return this._get('payments').filter(p => p.invoice_id === invoiceId); },
    addPayment(pay) {
        const payments = this._get('payments');
        payments.push(pay);
        this._set('payments', payments);
        // Atualizar status da fatura
        this.updateInvoiceStatus(pay.invoice_id);
    },
    updateInvoiceStatus(invoiceId) {
        const invoices = this._get('invoices');
        const inv = invoices.find(i => i.id === invoiceId);
        if (!inv) return;

        const payments = this._get('payments').filter(p => p.invoice_id === invoiceId);
        const paidAmount = payments.reduce((s, p) => s + Number(p.amount), 0);

        if (paidAmount >= inv.total_amount) {
            inv.status = 'paga';
            inv.paid_amount = paidAmount;
        } else if (paidAmount > 0) {
            inv.status = 'parcial';
            inv.paid_amount = paidAmount;
        }
        this._set('invoices', invoices);
    },

    // ===== ALERTS =====
    getAlerts(userId) { return this._get('alerts').filter(a => a.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    addAlert(alert) { const alerts = this._get('alerts'); alerts.push(alert); this._set('alerts', alerts); },
    markAlertRead(id) {
        const alerts = this._get('alerts');
        const a = alerts.find(x => x.id === id);
        if (a) a.is_read = true;
        this._set('alerts', alerts);
    },
    markAllAlertsRead(userId) {
        const alerts = this._get('alerts');
        alerts.forEach(a => { if (a.user_id === userId) a.is_read = true; });
        this._set('alerts', alerts);
    },
    generateAlerts(userId, cards) {
        const alerts = this._get('alerts');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const card of cards) {
            const [y, m] = this.selectedMonthStr().split('-').map(Number);
            const closingDay = Math.min(card.closing_day, new Date(y, m, 0).getDate());
            const closingDate = new Date(y, m - 1, closingDay);
            const dueDate = new Date(closingDate);
            dueDate.setDate(dueDate.getDate() + 10);

            const daysToClosing = Math.ceil((closingDate - today) / (1000 * 60 * 60 * 24));
            const daysToDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

            // Fechamento em 3 dias
            if (daysToClosing >= 0 && daysToClosing <= 3) {
                if (!alerts.find(a => a.user_id === userId && a.type === 'closing_soon' && a.created_at.startsWith(this.now().substring(0, 10)))) {
                    alerts.push({
                        id: this.id(), user_id: userId, type: 'closing_soon',
                        title: 'Fatura fechando em breve!',
                        message: `A fatura do cartão ${card.name} fecha dia ${closingDate.toLocaleDateString('pt-BR')}.`,
                        reference_date: closingDate.toISOString(), is_read: false, created_at: this.now()
                    });
                }
            }

            // Vencimento em 5 dias
            if (daysToDue >= 0 && daysToDue <= 5) {
                if (!alerts.find(a => a.user_id === userId && a.type === 'due_soon' && a.created_at.startsWith(this.now().substring(0, 10)))) {
                    alerts.push({
                        id: this.id(), user_id: userId, type: 'due_soon',
                        title: 'Vencimento próximo!',
                        message: `A fatura do cartão ${card.name} vence dia ${dueDate.toLocaleDateString('pt-BR')}.`,
                        reference_date: dueDate.toISOString(), is_read: false, created_at: this.now()
                    });
                }
            }

            // Fatura vencida
            if (dueDate < today) {
                if (!alerts.find(a => a.user_id === userId && a.type === 'overdue' && a.created_at.startsWith(this.now().substring(0, 10)))) {
                    alerts.push({
                        id: this.id(), user_id: userId, type: 'overdue',
                        title: 'Fatura vencida!',
                        message: `A fatura do cartão ${card.name} venceu dia ${dueDate.toLocaleDateString('pt-BR')}.`,
                        reference_date: dueDate.toISOString(), is_read: false, created_at: this.now()
                    });
                }
            }
        }
        this._set('alerts', alerts);
    }
};

// ===== APP STATE =====
const App = {
    user: null,
    userId: null,
    selectedMonth: new Date(),
    charts: {},

    // ===== INIT =====
    init() {
        this.initMonthSelector();

        // Verificar sessão existente
        const session = DB.getSession();
        if (session.user_id) {
            this.userId = session.user_id;
            this.user = session;
            this.showApp();
        }
    },

    initMonthSelector() {
        const sel = document.getElementById('month-selector');
        const now = new Date();
        sel.innerHTML = '';
        for (let i = -6; i <= 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const opt = document.createElement('option');
            opt.value = d.toISOString();
            opt.textContent = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            if (i === 0) opt.selected = true;
            sel.appendChild(opt);
        }
    },

    // ===== AUTH =====
    showRegister() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        this.hideAuthError();
    },

    showLogin() {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
        this.hideAuthError();
    },

    showAuthError(msg) {
        const el = document.getElementById('auth-error');
        el.textContent = msg;
        el.style.display = 'block';
    },

    hideAuthError() {
        document.getElementById('auth-error').style.display = 'none';
    },

    login() {
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            this.showAuthError('Preencha email e senha.');
            return;
        }

        const user = DB.findUser(email);
        if (!user) {
            this.showAuthError('Email não cadastrado. Crie uma conta.');
            return;
        }
        if (user.password !== password) {
            this.showAuthError('Senha incorreta.');
            return;
        }

        this.user = { user_id: user.id, email: user.email, full_name: user.full_name };
        this.userId = user.id;
        DB.setSession(user);
        this.showApp();
    },

    register() {
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim().toLowerCase();
        const password = document.getElementById('register-password').value;

        if (!name || !email || !password) {
            this.showAuthError('Preencha todos os campos.');
            return;
        }
        if (password.length < 6) {
            this.showAuthError('Senha deve ter no mínimo 6 caracteres.');
            return;
        }
        if (DB.findUser(email)) {
            this.showAuthError('Este email já está cadastrado.');
            return;
        }

        // Criar usuario
        const user = DB.createUser(name, email, password);

        // Criar familiar titular
        DB.addFamily({
            id: DB.id(),
            user_id: user.id,
            name: name,
            email: email,
            role: 'titular',
            color: '#6366F1',
            is_active: true,
            created_at: DB.now()
        });

        this.user = { user_id: user.id, email: user.email, full_name: user.full_name };
        this.userId = user.id;
        DB.setSession(user);
        this.showApp();
    },

    showApp() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';

        document.getElementById('user-name-display').textContent = this.user.full_name.split(' ')[0];
        document.getElementById('settings-name').value = this.user.full_name;
        document.getElementById('settings-email').value = this.user.email;
        document.getElementById('dashboard-greeting').textContent = `Olá, ${this.user.full_name.split(' ')[0]}!`;

        // Gerar faturas e alertas
        const cards = DB.getCards(this.userId);
        DB.generateInvoices(this.userId, cards);
        DB.generateAlerts(this.userId, cards);

        this.renderDashboard();
    },

    logout() {
        DB.clearSession();
        this.user = null;
        this.userId = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    },

    updateProfile() {
        const name = document.getElementById('settings-name').value.trim();
        if (!name) { this.toast('Informe seu nome.', 'error'); return; }

        const users = DB.getUsers();
        const u = users.find(u => u.id === this.userId);
        if (u) {
            u.full_name = name;
            DB.saveUsers(users);
        }

        this.user.full_name = name;
        DB.setSession(this.user);

        document.getElementById('user-name-display').textContent = name.split(' ')[0];
        document.getElementById('dashboard-greeting').textContent = `Olá, ${name.split(' ')[0]}!`;
        this.toast('Perfil atualizado!', 'success');
    },

    // ===== NAVIGATION =====
    navigate(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const pageEl = document.getElementById(`page-${page}`);
        if (pageEl) pageEl.classList.add('active');

        const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
        if (btn) btn.classList.add('active');

        if (page === 'cards') { this.hideCardDetail(); this.renderCards(); }
        if (page === 'purchases') { this.renderPurchases(); this.populatePurchaseFilters(); }
        if (page === 'family') this.renderFamily();
        if (page === 'alerts') this.renderAlerts();
        if (page === 'dashboard') this.renderDashboard();
    },

    onMonthChange() {
        const sel = document.getElementById('month-selector');
        this.selectedMonth = new Date(sel.value);
        this.renderDashboard();
    },

    // ===== DASHBOARD =====
    renderDashboard() {
        const monthStr = this.selectedMonth.toISOString().substring(0, 7);
        const monthStart = new Date(this.selectedMonth);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        const allInst = DB.getInstallments(this.userId);
        const monthInst = allInst.filter(i => i.reference_month.startsWith(monthStr));
        const allPurchases = DB.getPurchases(this.userId);
        const monthPurchases = allPurchases.filter(p => {
            const d = new Date(p.purchase_date);
            return d >= monthStart && d < monthEnd;
        });
        const allInvoices = DB.getInvoices(this.userId);
        const monthInvoices = allInvoices.filter(i => i.reference_month.startsWith(monthStr));
        const cards = DB.getCards(this.userId);

        // 1. Total gasto
        const totalSpent = monthInst.reduce((s, i) => s + Number(i.amount), 0);
        document.getElementById('dash-total-spent').textContent = this.formatBRL(totalSpent);

        // 2. Faturas abertas
        const openInvoices = monthInvoices.filter(inv => inv.status === 'aberta' || inv.status === 'parcial').length;
        document.getElementById('dash-open-invoices').textContent = openInvoices;

        // 3. Limite disponivel
        let totalLimit = 0, usedLimit = 0;
        for (const card of cards) {
            totalLimit += Number(card.credit_limit);
            const cardUsed = monthInst.filter(i => i.credit_card_id === card.id && !i.is_paid)
                .reduce((s, i) => s + Number(i.amount), 0);
            usedLimit += cardUsed;
        }
        document.getElementById('dash-available-limit').textContent = this.formatBRL(totalLimit - usedLimit);

        // 4. Compras no mes
        document.getElementById('dash-purchases-count').textContent = monthPurchases.length;

        this.renderCategoryChart(monthPurchases);
        this.renderMonthlyChart(allInst);
        this.renderFamilyChart(monthInst);
        this.renderDashboardInvoices(monthInvoices);
        this.renderRecentPurchases(monthPurchases);
        this.updateAlertBadge();
    },

    renderCategoryChart(purchases) {
        const ctx = document.getElementById('chart-category');
        if (!purchases || purchases.length === 0) {
            if (this.charts.category) this.charts.category.destroy();
            this.charts.category = null;
            return;
        }

        const cats = {};
        purchases.forEach(p => {
            const cat = p.category || 'Outros';
            cats[cat] = (cats[cat] || 0) + Number(p.total_amount);
        });

        const labels = Object.keys(cats);
        const data = Object.values(cats);
        const colors = ['#6366F1','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#8B5CF6','#06B6D4','#F97316','#6B7280'];

        if (this.charts.category) this.charts.category.destroy();
        this.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } } }
        });
    },

    renderMonthlyChart(installments) {
        const ctx = document.getElementById('chart-monthly');
        if (!installments || installments.length === 0) {
            if (this.charts.monthly) this.charts.monthly.destroy();
            this.charts.monthly = null;
            return;
        }

        const months = {};
        installments.forEach(i => {
            const key = i.reference_month.substring(0, 7);
            months[key] = (months[key] || 0) + Number(i.amount);
        });

        const sorted = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
        const labels = sorted.map(([k]) => { const [y, m] = k.split('-'); return `${m}/${y}`; });
        const data = sorted.map(([, v]) => v);

        if (this.charts.monthly) this.charts.monthly.destroy();
        this.charts.monthly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Gasto (R$)', data, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6, borderSkipped: false }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, ticks: { callback: v => this.formatBRL(v) } } },
                plugins: { legend: { display: false } }
            }
        });
    },

    renderFamilyChart(installments) {
        const ctx = document.getElementById('chart-family');
        const family = DB.getFamily(this.userId);
        if (!installments || installments.length === 0) {
            if (this.charts.family) this.charts.family.destroy();
            this.charts.family = null;
            return;
        }

        const fams = {};
        installments.forEach(i => {
            const fm = family.find(f => f.id === i.family_member_id);
            const name = fm ? fm.name : 'Titular';
            fams[name] = (fams[name] || 0) + Number(i.amount);
        });

        const labels = Object.keys(fams);
        const data = Object.values(fams);
        const colors = ['#6366F1','#EC4899','#10B981','#F59E0B','#3B82F6','#8B5CF6'];

        if (this.charts.family) this.charts.family.destroy();
        this.charts.family = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } } }
        });
    },

    renderDashboardInvoices(invoices) {
        const el = document.getElementById('dash-invoices-list');
        if (!invoices || invoices.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhuma fatura neste mês</p></div>';
            return;
        }

        const cards = DB.getCards(this.userId);

        el.innerHTML = invoices.map(inv => {
            const card = cards.find(c => c.id === inv.credit_card_id) || {};
            const due = inv.due_date ? new Date(inv.due_date) : null;
            const daysLeft = due ? Math.ceil((due - new Date()) / (1000*60*60*24)) : null;
            const dueText = daysLeft !== null ? (daysLeft > 0 ? `${daysLeft} dias` : 'Vencida') : '';

            return `
                <div class="invoice-item-compact" onclick="App.showInvoice('${inv.id}')">
                    <div class="inv-left">
                        <span class="inv-icon">💳</span>
                        <div>
                            <div class="inv-name">${card.name || 'Cartão'}</div>
                            <div class="inv-due">${dueText} <span class="status-badge status-${inv.status}">${inv.status}</span></div>
                        </div>
                    </div>
                    <div class="inv-right"><div class="inv-amount">${this.formatBRL(inv.total_amount)}</div></div>
                </div>
            `;
        }).join('');
    },

    renderRecentPurchases(purchases) {
        const el = document.getElementById('dash-recent-purchases');
        if (!purchases || purchases.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><p>Nenhuma compra neste mês</p></div>';
            return;
        }

        const cards = DB.getCards(this.userId);
        const family = DB.getFamily(this.userId);

        el.innerHTML = purchases.slice(0, 5).map(p => {
            const card = cards.find(c => c.id === p.credit_card_id) || {};
            const fm = family.find(f => f.id === p.family_member_id);
            const date = new Date(p.purchase_date).toLocaleDateString('pt-BR');
            const instInfo = p.installment_count > 1 ? `${p.installment_count}x` : '';

            return `
                <div class="purchase-item" onclick="App.showPurchaseDetail('${p.id}')">
                    <div class="pur-left">
                        <span class="pur-icon">${this.getCategoryIcon(p.category)}</span>
                        <div>
                            <div class="pur-merchant">${p.merchant}</div>
                            <div class="pur-meta">${card.name || ''} ${fm ? '• ' + fm.name : ''} • ${date}</div>
                        </div>
                    </div>
                    <div>
                        <div class="pur-amount">${this.formatBRL(p.total_amount)}</div>
                        ${instInfo ? `<div class="pur-installments">${instInfo}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    // ===== CARDS =====
    renderCards() {
        const el = document.getElementById('cards-list');
        const cards = DB.getCards(this.userId);

        if (cards.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div><p>Nenhum cartão cadastrado.<br>Clique em "+ Novo Cartão" para começar.</p></div>';
            return;
        }

        const allInst = DB.getInstallments(this.userId);
        const monthStr = this.selectedMonth.toISOString().substring(0, 7);

        el.innerHTML = cards.map(card => {
            const gradient = this.getCardGradient(card.brand);
            const used = allInst.filter(i => i.credit_card_id === card.id && i.reference_month.startsWith(monthStr) && !i.is_paid)
                .reduce((s, i) => s + Number(i.amount), 0);
            const pct = Number(card.credit_limit) > 0 ? (used / Number(card.credit_limit) * 100) : 0;

            return `
                <div class="credit-card-item cc-gradient-${gradient}" onclick="App.showCardDetail('${card.id}')">
                    <div class="cc-header">
                        <div>
                            <div class="cc-name">${card.name}</div>
                            <div class="cc-brand">${card.brand || 'Cartão'}</div>
                        </div>
                    </div>
                    <div class="cc-digits">•••• •••• •••• ${card.last_four_digits || '••••'}</div>
                    <div class="cc-footer">
                        <div>
                            <div class="cc-limit-label">Limite</div>
                            <div class="cc-limit-value">${this.formatBRL(card.credit_limit)}</div>
                        </div>
                        <div style="text-align:right">
                            <div class="cc-limit-label">Fechamento</div>
                            <div class="cc-limit-value">Dia ${card.closing_day}</div>
                        </div>
                    </div>
                    <div class="cc-limit-bar"><div class="cc-limit-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
                </div>
            `;
        }).join('');
    },

    getCardGradient(brand) {
        const map = {
            'Nubank': 'nubank', 'Visa': 'visa', 'Mastercard': 'mastercard',
            'Elo': 'elo', 'Amex': 'amex', 'Inter': 'inter', 'Itau': 'itau', 'Itaú': 'itau'
        };
        return map[brand] || 'default';
    },

    showCardDetail(cardId) {
        const cards = DB.getCards(this.userId);
        const card = cards.find(c => c.id === cardId);
        if (!card) return;

        const monthStr = this.selectedMonth.toISOString().substring(0, 7);
        const allInst = DB.getInstallments(this.userId);
        const allInvoices = DB.getInvoices(this.userId);
        const invoice = allInvoices.find(inv => inv.credit_card_id === cardId && inv.reference_month.startsWith(monthStr));

        const usedLimit = allInst.filter(i => i.credit_card_id === cardId && i.reference_month.startsWith(monthStr) && !i.is_paid)
            .reduce((s, i) => s + Number(i.amount), 0);
        const pct = Number(card.credit_limit) > 0 ? (usedLimit / Number(card.credit_limit) * 100) : 0;

        const invoiceInfo = invoice ? `
            <div style="background:var(--bg);border-radius:10px;padding:14px;margin-top:12px">
                <div style="font-weight:600;margin-bottom:8px">Fatura do Mês</div>
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
                    <span style="color:var(--text-secondary)">Total</span>
                    <span style="font-weight:700">${this.formatBRL(invoice.total_amount)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
                    <span style="color:var(--text-secondary)">Pago</span>
                    <span style="font-weight:600">${this.formatBRL(invoice.paid_amount)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:4px 0">
                    <span style="color:var(--text-secondary)">Restante</span>
                    <span style="font-weight:700;color:var(--error)">${this.formatBRL(invoice.total_amount - invoice.paid_amount)}</span>
                </div>
            </div>
            <button class="btn-primary btn-full btn-sm" style="margin-top:12px" onclick="App.showInvoice('${invoice.id}')">Ver Fatura Completa</button>
        ` : '<p style="color:var(--text-muted);font-size:13px;margin-top:12px">Fatura ainda não gerada para este mês.</p>';

        document.getElementById('card-detail-content').innerHTML = `
            <h3>${card.name}</h3>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Bandeira</span>
                <span style="font-weight:600">${card.brand || '-'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Limite</span>
                <span style="font-weight:600">${this.formatBRL(card.credit_limit)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Utilizado</span>
                <span style="font-weight:600">${this.formatBRL(usedLimit)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Disponível</span>
                <span style="font-weight:600">${this.formatBRL(Number(card.credit_limit) - usedLimit)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Fechamento</span>
                <span style="font-weight:600">Dia ${card.closing_day}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:14px">
                <span style="color:var(--text-secondary)">Vencimento</span>
                <span style="font-weight:600">Dia ${card.due_day}</span>
            </div>
            <div style="margin-top:8px">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Uso do limite: ${pct.toFixed(0)}%</div>
                <div class="cc-limit-bar" style="background:rgba(0,0,0,0.1)"><div class="cc-limit-bar-fill" style="width:${Math.min(pct,100)}%"></div></div>
            </div>
            ${invoiceInfo}
            <div style="display:flex;gap:8px;margin-top:16px">
                <button class="btn-secondary" style="flex:1" onclick="App.editCard('${card.id}')">Editar</button>
                <button class="btn-danger" style="flex:1" onclick="App.deleteCard('${card.id}')">Excluir</button>
            </div>
        `;

        document.getElementById('cards-list').style.display = 'none';
        document.querySelector('#page-cards .page-header').style.display = 'none';
        document.getElementById('card-detail').style.display = 'block';
    },

    hideCardDetail() {
        document.getElementById('card-detail').style.display = 'none';
        document.getElementById('cards-list').style.display = '';
        document.querySelector('#page-cards .page-header').style.display = '';
    },

    showAddCard() {
        document.getElementById('modal-card-title').textContent = 'Novo Cartão';
        document.getElementById('card-name').value = '';
        document.getElementById('card-brand').value = '';
        document.getElementById('card-digits').value = '';
        document.getElementById('card-limit').value = '';
        document.getElementById('card-closing').value = '';
        document.getElementById('card-due').value = '';
        delete document.getElementById('card-name').dataset.editId;
        this.openModal('modal-card');
    },

    editCard(cardId) {
        const cards = DB.getCards(this.userId);
        const card = cards.find(c => c.id === cardId);
        if (!card) return;

        document.getElementById('modal-card-title').textContent = 'Editar Cartão';
        document.getElementById('card-name').value = card.name;
        document.getElementById('card-brand').value = card.brand || '';
        document.getElementById('card-digits').value = card.last_four_digits || '';
        document.getElementById('card-limit').value = card.credit_limit;
        document.getElementById('card-closing').value = card.closing_day;
        document.getElementById('card-due').value = card.due_day;
        document.getElementById('card-name').dataset.editId = cardId;
        this.openModal('modal-card');
    },

    saveCard() {
        const editId = document.getElementById('card-name').dataset.editId;
        const data = {
            name: document.getElementById('card-name').value.trim(),
            brand: document.getElementById('card-brand').value,
            last_four_digits: document.getElementById('card-digits').value,
            credit_limit: parseFloat(document.getElementById('card-limit').value) || 0,
            closing_day: parseInt(document.getElementById('card-closing').value) || 15,
            due_day: parseInt(document.getElementById('card-due').value) || 25,
            user_id: this.userId
        };

        if (!data.name || !data.credit_limit) {
            this.toast('Preencha nome e limite.', 'error');
            return;
        }

        if (editId) {
            DB.updateCard(editId, data);
            delete document.getElementById('card-name').dataset.editId;
        } else {
            data.id = DB.id();
            data.is_active = true;
            data.created_at = DB.now();
            DB.addCard(data);
        }

        this.toast(editId ? 'Cartão atualizado!' : 'Cartão adicionado!', 'success');
        this.closeModal('modal-card');
        this.renderCards();
        this.hideCardDetail();
    },

    deleteCard(cardId) {
        if (!confirm('Tem certeza que deseja excluir este cartão?')) return;
        DB.deleteCard(cardId);
        this.toast('Cartão excluído.', 'success');
        this.renderCards();
        this.hideCardDetail();
    },

    // ===== PURCHASES =====
    showAddPurchase() {
        const cards = DB.getCards(this.userId);
        const family = DB.getFamily(this.userId);

        const cardSel = document.getElementById('purchase-card');
        cardSel.innerHTML = '<option value="">Selecione...</option>' +
            cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        const famSel = document.getElementById('purchase-family');
        famSel.innerHTML = '<option value="">Selecione...</option>' +
            family.map(f => `<option value="${f.id}">${f.name} (${f.role})</option>`).join('');

        document.getElementById('purchase-merchant').value = '';
        document.getElementById('purchase-category').value = '';
        document.getElementById('purchase-amount').value = '';
        document.getElementById('purchase-installments').value = '1';
        document.getElementById('purchase-installment-value').value = '';
        document.getElementById('purchase-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('purchase-notes').value = '';
        this.openModal('modal-purchase');
    },

    calcInstallmentValue() {
        const amount = parseFloat(document.getElementById('purchase-amount').value) || 0;
        const count = parseInt(document.getElementById('purchase-installments').value) || 1;
        const val = count > 0 ? amount / count : 0;
        document.getElementById('purchase-installment-value').value = this.formatBRL(val);
    },

    savePurchase() {
        const cardId = document.getElementById('purchase-card').value;
        const familyId = document.getElementById('purchase-family').value || null;
        const merchant = document.getElementById('purchase-merchant').value.trim();
        const category = document.getElementById('purchase-category').value;
        const amount = parseFloat(document.getElementById('purchase-amount').value);
        const installmentCount = parseInt(document.getElementById('purchase-installments').value) || 1;
        const date = document.getElementById('purchase-date').value;
        const notes = document.getElementById('purchase-notes').value.trim();

        if (!cardId || !merchant || !amount || !date) {
            this.toast('Preencha cartão, estabelecimento, valor e data.', 'error');
            return;
        }

        const installmentValue = Math.round((amount / installmentCount) * 100) / 100;

        const purchase = {
            id: DB.id(),
            user_id: this.userId,
            credit_card_id: cardId,
            family_member_id: familyId,
            merchant, category,
            total_amount: amount,
            installment_count: installmentCount,
            installment_value: installmentValue,
            purchase_date: date, notes,
            created_at: DB.now()
        };

        DB.addPurchase(purchase);

        // Regenerar faturas e alertas
        const cards = DB.getCards(this.userId);
        DB.generateInvoices(this.userId, cards);
        DB.generateAlerts(this.userId, cards);

        this.toast(`Compra registrada! ${installmentCount > 1 ? installmentCount + ' parcelas geradas.' : ''}`, 'success');
        this.closeModal('modal-purchase');
        this.renderPurchases();
        this.populatePurchaseFilters();
        this.updateAlertBadge();
    },

    renderPurchases() {
        const el = document.getElementById('purchases-list');
        const purchases = DB.getPurchases(this.userId);
        const cards = DB.getCards(this.userId);
        const family = DB.getFamily(this.userId);

        if (purchases.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><p>Nenhuma compra encontrada.</p></div>';
            return;
        }

        const search = (document.getElementById('purchase-search')?.value || '').toLowerCase();
        const filterCard = document.getElementById('purchase-filter-card')?.value || '';
        const filterFamily = document.getElementById('purchase-filter-family')?.value || '';

        let filtered = purchases;
        if (search) filtered = filtered.filter(p => p.merchant.toLowerCase().includes(search));
        if (filterCard) filtered = filtered.filter(p => p.credit_card_id === filterCard);
        if (filterFamily) filtered = filtered.filter(p => p.family_member_id === filterFamily);

        el.innerHTML = filtered.map(p => {
            const card = cards.find(c => c.id === p.credit_card_id);
            const fm = family.find(f => f.id === p.family_member_id);
            const date = new Date(p.purchase_date).toLocaleDateString('pt-BR');
            const instInfo = p.installment_count > 1 ? ` • ${p.installment_count}x de ${this.formatBRL(p.installment_value)}` : '';

            return `
                <div class="purchase-item" onclick="App.showPurchaseDetail('${p.id}')">
                    <div class="pur-left">
                        <span class="pur-icon">${this.getCategoryIcon(p.category)}</span>
                        <div>
                            <div class="pur-merchant">${p.merchant}</div>
                            <div class="pur-meta">${card ? card.name : ''} ${fm ? '• ' + fm.name : ''} • ${date}${instInfo}</div>
                        </div>
                    </div>
                    <div class="pur-amount">${this.formatBRL(p.total_amount)}</div>
                </div>
            `;
        }).join('');
    },

    filterPurchases() { this.renderPurchases(); },

    populatePurchaseFilters() {
        const cards = DB.getCards(this.userId);
        const family = DB.getFamily(this.userId);

        const cardSel = document.getElementById('purchase-filter-card');
        cardSel.innerHTML = '<option value="">Todos os cartões</option>' +
            cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        const famSel = document.getElementById('purchase-filter-family');
        famSel.innerHTML = '<option value="">Todos os familiares</option>' +
            family.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    },

    showPurchaseDetail(purchaseId) {
        const purchases = DB.getPurchases(this.userId);
        const p = purchases.find(x => x.id === purchaseId);
        if (!p) return;

        const installments = DB.getInstallments(this.userId).filter(i => i.purchase_id === purchaseId).sort((a, b) => a.installment_number - b.installment_number);
        const cards = DB.getCards(this.userId);
        const family = DB.getFamily(this.userId);

        const card = cards.find(c => c.id === p.credit_card_id);
        const fm = family.find(f => f.id === p.family_member_id);
        const date = new Date(p.purchase_date).toLocaleDateString('pt-BR');

        let html = `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Estabelecimento</span><span style="font-weight:600">${p.merchant}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Cartão</span><span style="font-weight:600">${card ? card.name : '-'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Quem comprou</span><span style="font-weight:600">${fm ? fm.name : 'Titular'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Categoria</span><span style="font-weight:600">${this.getCategoryIcon(p.category)} ${p.category || '-'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
                <span style="color:var(--text-secondary)">Data</span><span style="font-weight:600">${date}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:14px">
                <span style="color:var(--text-secondary)">Valor Total</span><span style="font-weight:700;color:var(--primary)">${this.formatBRL(p.total_amount)}</span>
            </div>
        `;

        if (p.installment_count > 1) {
            html += `<div style="margin-top:16px"><h4 style="font-size:14px;font-weight:600;margin-bottom:8px">Parcelas (${p.installment_count}x de ${this.formatBRL(p.installment_value)})</h4><div class="invoice-items-list">`;
            installments.forEach(i => {
                html += `
                    <div class="item">
                        <div class="item-left">
                            <div class="item-merchant">${i.installment_number}/${i.total_installments}</div>
                            <div class="item-meta">${i.reference_month.substring(0, 7)} ${i.is_paid ? '✅ Paga' : '⏳ Pendente'}</div>
                        </div>
                        <div class="item-amount">${this.formatBRL(i.amount)}</div>
                    </div>
                `;
            });
            html += `</div></div>`;
        }

        if (p.notes) html += `<div style="margin-top:12px"><span style="color:var(--text-secondary);font-size:12px">Obs:</span> ${p.notes}</div>`;

        // Botão excluir
        html += `<button class="btn-danger btn-full" style="margin-top:16px" onclick="App.deletePurchase('${p.id}')">Excluir Compra</button>`;

        document.getElementById('purchase-detail-content').innerHTML = html;
        this.openModal('modal-purchase-detail');
    },

    deletePurchase(purchaseId) {
        if (!confirm('Excluir esta compra e todas as suas parcelas?')) return;
        let purchases = DB._get('purchases');
        purchases = purchases.filter(p => p.id !== purchaseId);
        DB._set('purchases', purchases);

        let installments = DB._get('installments');
        installments = installments.filter(i => i.purchase_id !== purchaseId);
        DB._set('installments', installments);

        this.toast('Compra excluída.', 'success');
        this.closeModal('modal-purchase-detail');
        this.renderPurchases();
    },

    // ===== FAMILY =====
    showAddFamily() {
        document.getElementById('family-name').value = '';
        document.getElementById('family-email').value = '';
        document.getElementById('family-color').value = '#6366F1';
        this.openModal('modal-family');
    },

    saveFamily() {
        const name = document.getElementById('family-name').value.trim();
        const email = document.getElementById('family-email').value.trim();
        const color = document.getElementById('family-color').value;

        if (!name) { this.toast('Informe o nome.', 'error'); return; }

        DB.addFamily({
            id: DB.id(), user_id: this.userId, name, email, color,
            role: 'dependente', is_active: true, created_at: DB.now()
        });

        this.toast('Familiar adicionado!', 'success');
        this.closeModal('modal-family');
        this.renderFamily();
    },

    renderFamily() {
        const el = document.getElementById('family-list');
        const family = DB.getFamily(this.userId);

        if (family.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Nenhum familiar cadastrado.</p></div>';
            return;
        }

        const monthStr = this.selectedMonth.toISOString().substring(0, 7);
        const monthInst = DB.getInstallments(this.userId).filter(i => i.reference_month.startsWith(monthStr) && !i.is_paid);

        el.innerHTML = family.map(fm => {
            const initial = fm.name.charAt(0).toUpperCase();
            const spent = monthInst.filter(i => i.family_member_id === fm.id).reduce((s, i) => s + Number(i.amount), 0);

            return `
                <div class="family-item">
                    <div class="family-avatar" style="background:${fm.color}">${initial}</div>
                    <div class="family-info">
                        <div class="family-name">${fm.name}</div>
                        <div class="family-role">${fm.role === 'titular' ? '👑 Titular' : 'Dependente'}</div>
                    </div>
                    <div class="family-spent">
                        <div class="family-spent-amount">${this.formatBRL(spent)}</div>
                        <div class="family-spent-label">pendente</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // ===== INVOICES =====
    showInvoice(invoiceId) {
        const allInvoices = DB.getInvoices(this.userId);
        const invoice = allInvoices.find(i => i.id === invoiceId);
        if (!invoice) { this.toast('Fatura não encontrada.', 'error'); return; }

        const cards = DB.getCards(this.userId);
        const card = cards.find(c => c.id === invoice.credit_card_id) || {};

        const monthStr = invoice.reference_month.substring(0, 7);
        const allInst = DB.getInstallments(this.userId);
        const items = allInst.filter(i => i.credit_card_id === invoice.credit_card_id && i.reference_month.startsWith(monthStr));

        const payments = DB.getPaymentsByInvoice(invoiceId);
        const family = DB.getFamily(this.userId);
        const purchases = DB.getPurchases(this.userId);

        const remaining = invoice.total_amount - invoice.paid_amount;
        const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
        const daysLeft = dueDate ? Math.ceil((dueDate - new Date()) / (1000*60*60*24)) : null;

        let html = `
            <div class="invoice-info-box">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div>
                        <div style="font-weight:700;font-size:16px">${card.name || 'Cartão'}</div>
                        <div style="font-size:13px;color:var(--text-secondary)">
                            ${invoice.reference_month.substring(0,7)} • Venc: ${dueDate ? dueDate.toLocaleDateString('pt-BR') : '-'}
                            ${daysLeft !== null ? ` • ${daysLeft > 0 ? daysLeft + ' dias' : 'Vencida'}` : ''}
                        </div>
                    </div>
                    <span class="status-badge status-${invoice.status}">${invoice.status}</span>
                </div>
                <div class="invoice-summary-row"><span class="label">Total</span><span class="value total">${this.formatBRL(invoice.total_amount)}</span></div>
                <div class="invoice-summary-row"><span class="label">Pago</span><span class="value" style="color:var(--secondary)">${this.formatBRL(invoice.paid_amount)}</span></div>
                <div class="invoice-summary-row"><span class="label">Restante</span><span class="value" style="color:var(--error)">${this.formatBRL(remaining)}</span></div>
            </div>
        `;

        // Pagamentos
        if (payments.length > 0) {
            html += `<div style="margin-bottom:16px"><h4 style="font-size:14px;font-weight:600;margin-bottom:8px">Pagamentos</h4>`;
            payments.forEach(pay => {
                const payFm = family.find(f => f.id === pay.family_member_id);
                html += `
                    <div class="payment-item">
                        <div>
                            <div style="font-weight:600">${payFm ? payFm.name : 'Titular'}</div>
                            <div style="font-size:11px;color:var(--text-muted)">${pay.payment_method || '-'} • ${new Date(pay.payment_date).toLocaleDateString('pt-BR')}</div>
                        </div>
                        <div style="font-weight:700;color:var(--secondary)">${this.formatBRL(pay.amount)}</div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        // Itens
        html += `<h4 style="font-size:14px;font-weight:600;margin-bottom:8px">Itens (${items.length})</h4>`;
        html += `<div class="invoice-items-list">`;
        if (items.length > 0) {
            items.forEach(item => {
                const p = purchases.find(x => x.id === item.purchase_id) || {};
                const fm = family.find(f => f.id === item.family_member_id);
                html += `
                    <div class="item">
                        <div class="item-left">
                            <div class="item-merchant">${p.merchant || 'Compra'}</div>
                            <div class="item-meta">
                                ${item.installment_number}/${item.total_installments} • ${p.category || ''}
                                ${fm ? ' • ' + fm.name : ''}
                                ${item.is_paid ? ' ✅' : ''}
                            </div>
                        </div>
                        <div class="item-amount">${this.formatBRL(item.amount)}</div>
                    </div>
                `;
            });
        } else {
            html += '<p style="color:var(--text-muted);font-size:13px">Nenhum item</p>';
        }
        html += `</div>`;

        if (remaining > 0) {
            html += `<button class="btn-primary btn-full" style="margin-top:12px" onclick="App.closeModal('modal-invoice');App.showPaymentModal('${invoiceId}')">💰 Registrar Pagamento</button>`;
        }

        document.getElementById('invoice-detail-content').innerHTML = html;
        this.openModal('modal-invoice');
    },

    // ===== PAYMENTS =====
    currentPaymentInvoiceId: null,

    showPaymentModal(invoiceId) {
        this.currentPaymentInvoiceId = invoiceId;
        const family = DB.getFamily(this.userId);

        const famSel = document.getElementById('payment-family');
        famSel.innerHTML = '<option value="">Titular</option>' +
            family.filter(f => f.role === 'dependente').map(f => `<option value="${f.id}">${f.name}</option>`).join('');

        document.getElementById('payment-amount').value = '';
        document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('payment-method').value = 'pix';
        document.getElementById('payment-notes').value = '';

        const allInvoices = DB.getInvoices(this.userId);
        const invoice = allInvoices.find(i => i.id === invoiceId);
        if (invoice) {
            const remaining = invoice.total_amount - invoice.paid_amount;
            document.getElementById('payment-invoice-info').innerHTML = `
                <div style="font-weight:600;margin-bottom:4px">Fatura - ${this.formatBRL(invoice.total_amount)}</div>
                <div style="font-size:13px;color:var(--text-secondary)">Pago: ${this.formatBRL(invoice.paid_amount)} | Restante: <strong style="color:var(--error)">${this.formatBRL(remaining)}</strong></div>
            `;
            document.getElementById('payment-amount').value = remaining.toFixed(2);
        }

        this.openModal('modal-payment');
    },

    savePayment() {
        const familyId = document.getElementById('payment-family').value || null;
        const amount = parseFloat(document.getElementById('payment-amount').value);
        const date = document.getElementById('payment-date').value;
        const method = document.getElementById('payment-method').value;
        const notes = document.getElementById('payment-notes').value.trim();

        if (!amount || !date || !this.currentPaymentInvoiceId) {
            this.toast('Preencha valor e data.', 'error');
            return;
        }

        DB.addPayment({
            id: DB.id(),
            invoice_id: this.currentPaymentInvoiceId,
            user_id: this.userId,
            family_member_id: familyId,
            amount, payment_date: date, payment_method: method, notes,
            created_at: DB.now()
        });

        this.toast('Pagamento registrado!', 'success');
        this.closeModal('modal-payment');
        this.renderDashboard();
    },

    // ===== ALERTS =====
    renderAlerts() {
        const el = document.getElementById('alerts-list');
        const alerts = DB.getAlerts(this.userId);

        if (alerts.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><p>Nenhuma notificação.</p></div>';
            return;
        }

        const icons = { closing_soon: '📅', due_soon: '⏰', overdue: '❌', limit_warning: '⚠️' };

        el.innerHTML = alerts.map(a => `
            <div class="alert-item type-${a.type} ${a.is_read ? '' : 'unread'}">
                <span class="alert-icon">${icons[a.type] || '🔔'}</span>
                <div class="alert-content">
                    <div class="alert-title">${a.title}</div>
                    <div class="alert-message">${a.message}</div>
                    <div class="alert-date">${new Date(a.created_at).toLocaleDateString('pt-BR')} ${new Date(a.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                ${!a.is_read ? `<button class="alert-read-btn" onclick="App.markAlertRead('${a.id}')">✓</button>` : ''}
            </div>
        `).join('');
    },

    markAlertRead(alertId) {
        DB.markAlertRead(alertId);
        this.renderAlerts();
        this.updateAlertBadge();
    },

    markAllAlertsRead() {
        DB.markAllAlertsRead(this.userId);
        this.renderAlerts();
        this.updateAlertBadge();
        this.toast('Todas marcadas como lidas.', 'success');
    },

    updateAlertBadge() {
        const alerts = DB.getAlerts(this.userId);
        const unread = alerts.filter(a => !a.is_read).length;
        const badge = document.getElementById('alert-badge');
        if (unread > 0) {
            badge.textContent = unread > 9 ? '9+' : unread;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    },

    // ===== MODALS =====
    openModal(id) {
        document.getElementById(id).style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeModal(id) {
        document.getElementById(id).style.display = 'none';
        document.body.style.overflow = '';
    },

    // ===== UTILS =====
    formatBRL(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    },

    getCategoryIcon(cat) {
        const icons = {
            'Alimentação': '🍔', 'Transporte': '🚗', 'Vestuário': '👕',
            'Saúde': '💊', 'Educação': '📚', 'Lazer': '🎮',
            'Casa': '🏠', 'Tecnologia': '💻', 'Assinaturas': '📱', 'Outros': '📦'
        };
        return icons[cat] || '📦';
    },

    toast(msg, type = '') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
};

// Close modals on backdrop click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        document.body.style.overflow = '';
    }
});

// Keyboard: Escape closes modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal[style*="display: flex"]').forEach(m => {
            m.style.display = 'none';
            document.body.style.overflow = '';
        });
    }
});

// Init
document.addEventListener('DOMContentLoaded', () => App.init());
