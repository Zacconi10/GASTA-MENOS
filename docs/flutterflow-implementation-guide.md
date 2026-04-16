# Guia de Implementacao - FlutterFlow + Supabase
## SaaS Controle Financeiro Pessoal

---

## 1. Configuracao Inicial do Supabase

### 1.1 Criar Projeto
1. Acesse https://supabase.com e crie um novo projeto
2. Aguarde a inicializacao ( ~2 min)

### 1.2 Executar Schema
1. Va para **SQL Editor** no dashboard do Supabase
2. Cole todo o conteudo de `supabase/schema.sql`
3. Execute o script

### 1.3 Habilitar pg_cron (Plano Pro+)
1. Va para **Settings > Database**
2. Em **Extensions**, habilite `pg_cron`
3. Descomente as linhas de `cron.schedule` no final do `schema.sql` e execute

### 1.4 Configurar Database Webhook (para notificacoes)
1. Va para **Database > Webhooks**
2. Crie um novo webhook:
   - **Table:** `alerts`
   - **Event:** INSERT
   - **URL:** URL da Edge Function `send-notification`
   - **Headers:** `Authorization: Bearer <service_role_key>`

### 1.5 Coletar Credenciais
No dashboard do Supabase, va para **Settings > API**:
- `Project URL` (ex: `https://xyzabc.supabase.co`)
- `anon public` key
- `service_role` key (NUNCA expor no frontend)

---

## 2. Configuracao do FlutterFlow

### 2.1 Criar Projeto
1. Acesse https://flutterflow.io e crie um novo projeto
2. Nome: `FinControl` (ou seu nome)
3. Package Name: `com.seunome.fincontrol`

### 2.2 Conectar ao Supabase
1. Va para **Settings & Integrations > Supabase**
2. Cole a `Project URL` e `anon key`
3. Clique em **Connect**
4. Habilite **Supabase Auth** como provedor de autenticacao

### 2.3 Configurar Theme
**Colors:**
| Name | Hex |
|---|---|
| `primary` | `#6366F1` |
| `primaryDark` | `#4F46E5` |
| `secondary` | `#10B981` |
| `warning` | `#F59E0B` |
| `error` | `#EF4444` |
| `background` | `#F8FAFC` |
| `surface` | `#FFFFFF` |
| `textPrimary` | `#1E293B` |
| `textSecondary` | `#64748B` |

**Typography:**
- Font Family: **Inter** (Google Fonts)
- Display: 32px, Bold
- H1: 24px, SemiBold
- H2: 20px, SemiBold
- H3: 16px, Medium
- Body: 14px, Regular
- Caption: 12px, Regular

**Dark Mode:** Habilitar em Theme > Dark Mode

---

## 3. AppState Variables

Crie as seguintes variaveis no AppState:

| Nome | Tipo | Default | Descricao |
|---|---|---|---|
| `userId` | String | `""` | ID do usuario logado |
| `selectedCardId` | String | `""` | Cartao selecionado |
| `selectedMonth` | DateTime | `current month` | Mes selecionado no dashboard |
| `selectedPurchaseId` | String | `""` | Compra selecionada |
| `selectedInvoiceId` | String | `""` | Fatura selecionada |
| `selectedFamilyId` | String | `""` | Familiar selecionado |

---

## 4. Custom Actions (importar arquivos Dart)

Para cada arquivo em `flutterflow/custom_actions/`:

1. Va para **Custom Code > Custom Actions**
2. Clique em **+ New Action**
3. Copie o conteudo do arquivo .dart
4. Adicione os parametros conforme descrito no arquivo

### 4.1 calculateInstallmentValue
- **Parametros:** `totalAmount` (double), `installmentCount` (int)
- **Retorno:** double
- **Uso:** Na tela AddPurchase, ao mudar o numero de parcelas, atualizar o campo "Valor da Parcela"

### 4.2 formatCurrencyBRL
- **Parametros:** `value` (double)
- **Retorno:** String
- **Uso:** Em todos os lugares que exibe valor monetario

### 4.3 getDaysUntilDue
- **Parametros:** `dueDate` (DateTime)
- **Retorno:** int
- **Uso:** No dashboard e tela de fatura para mostrar "X dias para vencer"

### 4.4 getInvoiceStatusColor
- **Parametros:** `status` (String)
- **Retorno:** Color
- **Uso:** Badge de status na lista de faturas

### 4.5 getCardBrandGradient
- **Parametros:** `brand` (String)
- **Retorno:** List<Color>
- **Uso:** Gradiente do card visual na tela de cartoes

---

## 5. Estrutura de Telas (13 telas)

### 5.1 Auth Flow

#### LoginScreen
- **Layout:** Column centralizada
- **Componentes:**
  - Image/Logo (topo)
  - TextFormField: Email (keyboardType: email)
  - TextFormField: Senha (obscureText: true)
  - ElevatedButton: "Entrar"
- **Action do botao:** `Supabase Auth Sign In` (email + senha)
  - On Success: Navigate to DashboardScreen
  - On Error: Show SnackBar com mensagem

#### RegisterScreen
- **Layout:** Column centralizada
- **Componentes:**
  - TextFormField: Nome completo
  - TextFormField: Email
  - TextFormField: Senha
  - TextFormField: Confirmar senha
  - ElevatedButton: "Criar conta"
- **Action:** `Supabase Auth Sign Up` com metadata `{"full_name": nomeCompleto}`
  - O trigger `handle_new_user()` cria o perfil automaticamente

#### ForgotPasswordScreen
- TextFormField: Email
- Button: "Enviar link de recuperacao"
- Action: `Supabase Auth Reset Password`

### 5.2 Main App (Bottom Navigation - 5 tabs)

Configurar no FlutterFlow: **Navigation > Bottom Navigation Bar**
- Items: Dashboard, Cartoes, Compras, Familia, Configuracoes

---

#### DashboardScreen (Tab 1)

**Backend Queries:**

```
Query: totalSpentMonth
Collection: installments
Filters: user_id = currentUser.id AND reference_month = selectedMonth
Aggregation: SUM(amount)

Query: openInvoices
Collection: invoices
Filters: user_id = currentUser.id AND status IN ['aberta','parcial'] AND reference_month = selectedMonth
Aggregation: COUNT

Query: categoryBreakdown
Collection: purchases
Filters: user_id = currentUser.id AND MONTH(purchase_date) = MONTH(selectedMonth)
Group By: category
Aggregation: SUM(total_amount)

Query: monthlyEvolution
Collection: installments
Filters: user_id = currentUser.id AND reference_month >= 6 meses atras
Group By: reference_month
Aggregation: SUM(amount)
Order: reference_month DESC

Query: currentInvoices
Collection: invoices
Filters: user_id = currentUser.id AND reference_month = selectedMonth
Order: due_date ASC

Query: recentPurchases
Collection: purchases
Filters: user_id = currentUser.id
Order: purchase_date DESC
Limit: 5

Query: unreadAlerts
Collection: alerts
Filters: user_id = currentUser.id AND is_read = false
Order: created_at DESC
Limit: 3
```

**Layout:**
```
Column
├── Row (Header)
│   ├── Text: "Ola, [nome]"
│   ├── IconButton: Mes selecionado (showDialog com DatePicker)
│   └── IconButton: Notificacoes -> AlertsScreen
│
├── GridView (2x2 cards de resumo)
│   ├── Card: Total gasto (gradiente primary)
│   ├── Card: Faturas abertas
│   ├── Card: Limite disponivel
│   └── Card: Compras no mes
│
├── Container: Grafico Pizza (categorias)
│   └── Chart widget (fl_chart custom)
│
├── Container: Grafico Barras (evolucao mensal)
│   └── Chart widget (fl_chart custom)
│
├── Section: "Faturas do Mes"
│   └── ListView.builder -> InvoiceCard widgets
│
└── Section: "Ultimas Compras"
    └── ListView.horizontal -> PurchaseCard widgets
```

---

#### CardsScreen (Tab 2)

**Backend Query:**
```
Query: userCards
Collection: credit_cards
Filters: user_id = currentUser.id AND is_active = true
Order: created_at DESC
```

**Layout:**
```
Scaffold
├── AppBar: "Meus Cartoes"
├── ListView.builder
│   └── Para cada cartao: Container com gradiente (bandeira)
│       ├── Text: nome do cartao
│       ├── Text: **** **** **** last_four_digits
│       ├── Text: Limite: R$ XXXX
│       └── LinearProgressIndicator: limite usado / limite total
│
└── FAB: "Adicionar Cartao" -> AddCardScreen (dialog)
```

---

#### CardDetailScreen

**Backend Queries:**
```
Query: cardInfo
Collection: credit_cards
Filters: id = selectedCardId

Query: currentInvoice
Collection: invoices
Filters: credit_card_id = selectedCardId AND reference_month = selectedMonth

Query: invoiceInstallments
Collection: installments
Filters: credit_card_id = selectedCardId AND reference_month = selectedMonth
Joins: purchases (merchant, purchase_date), family_members (name)

Query: invoiceHistory
Collection: invoices
Filters: credit_card_id = selectedCardId
Order: reference_month DESC
Limit: 12
```

**Layout:**
```
Column
├── Container: Card visual com gradiente da bandeira
├── Row: Limite utilizado (CircularPercentIndicator)
├── Section: "Fatura Atual"
│   ├── Text: Total, Pago, Restante
│   ├── Badge: status
│   └── ListView: itens da fatura
│
├── Section: "Historico de Faturas"
│   └── ListView -> InvoiceSummary widgets
│
└── Button: "Ver Fatura Completa" -> InvoiceScreen
```

---

#### AddPurchaseScreen

**Layout:**
```
Form
├── Dropdown: Cartao (query: userCards)
├── Dropdown: Familiar (query: familyMembers)
├── TextFormField: Estabelecimento
├── Dropdown: Categoria
├── CurrencyField: Valor total
├── IntegerField: Numero de parcelas (default: 1)
│   └── OnChange: call calculateInstallmentValue
│       -> update Valor da Parcela field
├── CurrencyField: Valor da parcela (read-only, calculado)
├── DatePicker: Data da compra (default: hoje)
├── TextFormField: Observacoes
└── ElevatedButton: "Salvar Compra"
```

**Action do botao:**
- `Supabase Query: Insert` na collection `purchases`
- Campos: `credit_card_id`, `family_member_id`, `merchant`, `category`, `total_amount`, `installment_count`, `installment_value`, `purchase_date`, `notes`, `user_id = currentUser.id`
- O trigger `generate_installments()` cria as parcelas automaticamente
- Navigate back: `pop`

---

#### PurchasesScreen (Tab 3)

**Backend Query:**
```
Query: userPurchases
Collection: purchases
Filters: user_id = currentUser.id
Order: purchase_date DESC
Joins: credit_cards (name), family_members (name)
```

**Layout:**
```
Column
├── AppBar: "Compras"
├── SearchBar: buscar por merchant
├── Row: Filtros (Chip filters)
│   ├── Filtro por cartao
│   ├── Filtro por familiar
│   └── Filtro por periodo
│
└── ListView.builder
    └── ListTile para cada compra:
        ├── Leading: Icone da categoria
        ├── Title: merchant
        ├── Subtitle: familiar + data + parcelas (ex: "2/12")
        └── Trailing: valor formatado
```

---

#### InvoiceScreen

**Backend Queries:**
```
Query: invoiceDetail
Collection: invoices
Filters: id = selectedInvoiceId

Query: invoiceItems
Collection: installments
Filters: credit_card_id = invoice.credit_card_id AND reference_month = invoice.reference_month
Joins: purchases, family_members

Query: invoicePayments
Collection: payments
Filters: invoice_id = selectedInvoiceId
Joins: family_members
```

**Layout:**
```
Column
├── AppBar: Nome do cartao + Mes
├── Card: Resumo
│   ├── Total: R$ XXX
│   ├── Pago: R$ XXX
│   ├── Restante: R$ XXX
│   ├── Vencimento: DD/MM
│   └── Badge: status
│
├── Section: "Itens da Fatura"
│   └── ListView: parcelas com merchant, valor, familiar
│
├── Section: "Pagamentos"
│   └── ListView: pagamentos com quem pagou, valor, metodo
│
└── ElevatedButton: "Registrar Pagamento" -> AddPaymentScreen
```

---

#### AddPaymentScreen

**Layout:**
```
Form
├── Card: Resumo da fatura (readonly)
├── Dropdown: Familiar que esta pagando
├── CurrencyField: Valor pago
├── DatePicker: Data do pagamento (default: hoje)
├── Dropdown: Metodo de pagamento (PIX, Transferencia, Dinheiro, Boleto)
├── TextFormField: Observacoes
└── ElevatedButton: "Registrar Pagamento"
```

**Action:**
- `Supabase Query: Insert` na collection `payments`
- O trigger `update_invoice_status()` atualiza o status da fatura

---

#### FamilyScreen (Tab 4)

**Backend Query:**
```
Query: familyMembers
Collection: family_members
Filters: user_id = currentUser.id AND is_active = true
```

**Layout:**
```
Column
├── AppBar: "Familia"
├── ListView.builder
│   └── ListTile para cada familiar:
│       ├── Leading: CircleAvatar (color = familiar.color)
│       ├── Title: nome
│       ├── Subtitle: role (Titular/Dependente)
│       └── Trailing: total gasto no mes (query separada)
│
└── FAB: "Adicionar Familiar" -> AddFamilyDialog
```

---

#### FamilyDetailScreen

**Backend Queries:**
```
Query: familyInfo
Collection: family_members
Filters: id = selectedFamilyId

Query: familyPurchases
Collection: purchases
Filters: family_member_id = selectedFamilyId
Order: purchase_date DESC

Query: familyPayments
Collection: payments
Filters: family_member_id = selectedFamilyId
Order: payment_date DESC
```

**Layout:**
```
Column
├── Header: Avatar + nome + role
├── Card: Resumo financeiro
│   ├── Total gasto: R$ XXX
│   ├── Total pago: R$ XXX
│   └── Saldo devedor: R$ XXX
├── Section: "Compras"
│   └── ListView
└── Section: "Pagamentos"
    └── ListView
```

---

#### AlertsScreen

**Backend Query:**
```
Query: userAlerts
Collection: alerts
Filters: user_id = currentUser.id
Order: created_at DESC
```

**Layout:**
```
Column
├── AppBar: "Notificacoes" + Badge contador nao lidos
├── Toggle: Todos / Nao lidos
└── ListView.builder
    └── Para cada alerta:
        ├── Leading: Icone colorido por tipo
        ├── Title: titulo
        ├── Subtitle: mensagem
        └── Trailing: "Marcar como lido" (update is_read = true)
```

---

#### SettingsScreen (Tab 5)

**Layout:**
```
ListView
├── ListTile: Perfil (nome, email) -> EditProfileScreen
├── ListTile: Notificacoes (toggle push notifications)
├── ListTile: Categorias -> CategoriesScreen (CRUD)
├── ListTile: Exportar dados (gerar CSV)
├── ListTile: Sobre
└── ListTile: Sair (Supabase Auth Sign Out)
```

---

## 6. Queries do FlutterFlow - Backend Query Setup

No FlutterFlow, va para **Supabase > Backend Queries** e crie as seguintes:

### Dashboard Queries

| Query Name | Collection | Aggregation | Group By | Filters |
|---|---|---|---|---|
| totalSpentMonth | installments | SUM(amount) | - | user_id = currentUser, ref_month = selectedMonth |
| openInvoicesCount | invoices | COUNT | - | user_id, status IN (aberta, parcial) |
| categoryBreakdown | purchases | SUM(total_amount) | category | user_id, mes atual |
| monthlyEvolution | installments | SUM(amount) | reference_month | user_id, ultimos 6 meses |

### Card Queries

| Query Name | Collection | Filters |
|---|---|---|
| userCards | credit_cards | user_id = currentUser, is_active = true |
| cardAvailableLimit | credit_cards (custom SQL) | Ver section 7 abaixo |

### Invoice Queries

| Query Name | Collection | Filters |
|---|---|---|
| currentInvoice | invoices | credit_card_id, reference_month |
| invoiceItems | installments | credit_card_id, reference_month |
| invoicePayments | payments | invoice_id |

### Family Queries

| Query Name | Collection | Aggregation | Group By |
|---|---|---|---|
| familySpending | family_members | - | - |
| familyInstallmentTotal | installments | SUM(amount) | family_member_id |

---

## 7. Custom SQL Queries para FlutterFlow

Use estas queries como **Custom Queries** no FlutterFlow:

### Limite disponivel por cartao
```sql
SELECT
  cc.id,
  cc.name,
  cc.credit_limit,
  COALESCE(SUM(CASE WHEN i.is_paid = false THEN i.amount ELSE 0 END), 0) as used_limit,
  cc.credit_limit - COALESCE(SUM(CASE WHEN i.is_paid = false THEN i.amount ELSE 0 END), 0) as available_limit,
  CASE
    WHEN cc.credit_limit > 0
    THEN (COALESCE(SUM(CASE WHEN i.is_paid = false THEN i.amount ELSE 0 END), 0) / cc.credit_limit) * 100
    ELSE 0
  END as usage_percentage
FROM credit_cards cc
LEFT JOIN installments i ON i.credit_card_id = cc.id
  AND i.reference_month = :selectedMonth
WHERE cc.user_id = :userId AND cc.is_active = true
GROUP BY cc.id, cc.name, cc.credit_limit;
```

### Gastos por familiar
```sql
SELECT
  fm.id,
  fm.name,
  fm.color,
  fm.role,
  COALESCE(SUM(i.amount), 0) as total_spent,
  COALESCE(SUM(p.amount), 0) as total_paid
FROM family_members fm
LEFT JOIN installments i ON i.family_member_id = fm.id
  AND i.is_paid = false
  AND i.reference_month = :selectedMonth
LEFT JOIN payments p ON p.family_member_id = fm.id
  AND p.invoice_id IN (
    SELECT id FROM invoices WHERE reference_month = :selectedMonth
  )
WHERE fm.user_id = :userId AND fm.is_active = true
GROUP BY fm.id, fm.name, fm.color, fm.role;
```

### Resumo da fatura
```sql
SELECT
  inv.id,
  cc.name as card_name,
  inv.total_amount,
  inv.paid_amount,
  inv.total_amount - inv.paid_amount as remaining,
  inv.due_date,
  inv.status,
  inv.closing_date
FROM invoices inv
JOIN credit_cards cc ON cc.id = inv.credit_card_id
WHERE inv.id = :invoiceId;
```

---

## 8. Checklist de Implementacao

### Fase 1 - Foundation
- [x] Schema SQL criado
- [x] Edge Functions criadas
- [x] Custom Actions criadas
- [ ] Executar schema no Supabase
- [ ] Configurar pg_cron
- [ ] Conectar FlutterFlow ao Supabase
- [ ] Configurar Auth + Theme
- [ ] Criar AppState variables
- [ ] Importar Custom Actions
- [ ] Criar LoginScreen + RegisterScreen
- [ ] Testar registro (verificar trigger handle_new_user)

### Fase 2 - Core
- [ ] Criar Bottom Navigation (5 tabs)
- [ ] CardsScreen + AddCardScreen
- [ ] FamilyScreen + AddFamilyDialog
- [ ] AddPurchaseScreen (com calculo automatico de parcelas)
- [ ] PurchasesScreen (com filtros)
- [ ] Testar: criar compra parcelada -> verificar parcelas no banco

### Fase 3 - Invoices
- [ ] CardDetailScreen
- [ ] InvoiceScreen
- [ ] AddPaymentScreen
- [ ] Testar: registrar pagamento -> verificar status da fatura

### Fase 4 - Dashboard
- [ ] DashboardScreen com todos os widgets
- [ ] Grafico de pizza (categorias)
- [ ] Grafico de barras (evolucao)
- [ ] Cards de resumo
- [ ] Filtro por mes

### Fase 5 - Polish
- [ ] AlertsScreen
- [ ] SettingsScreen
- [ ] Dark mode
- [ ] Responsividade tablet
- [ ] Testes completos
- [ ] Deploy
