-- ============================================
-- SaaS Controle Financeiro Pessoal
-- Schema completo - Supabase / PostgreSQL
-- Cartoes de Credito + Compras Parceladas
-- ============================================

-- Schema public (padrao do Supabase)
CREATE SCHEMA IF NOT EXISTS public;

-- ============================================
-- HELPER: Trigger para updated_at automatico
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 1. TABELA: users (perfis de usuarios)
-- Extende auth.users do Supabase
-- ============================================
CREATE TABLE users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text NOT NULL,
    phone text,
    avatar_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios veem seu proprio perfil"
    ON users FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Usuarios atualizam seu proprio perfil"
    ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Usuarios inserem seu proprio perfil"
    ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. TABELA: family_members (familiares)
-- ============================================
CREATE TABLE family_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text,
    role text NOT NULL DEFAULT 'dependente'
        CHECK (role IN ('titular', 'dependente')),
    color text DEFAULT '#6366F1',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_family_members_user_id ON family_members(user_id);

CREATE TRIGGER set_family_members_updated_at
    BEFORE UPDATE ON family_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gerenciam seus familiares"
    ON family_members FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 3. TABELA: credit_cards (cartoes de credito)
-- ============================================
CREATE TABLE credit_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    brand text,
    last_four_digits text,
    credit_limit numeric(12,2) NOT NULL CHECK (credit_limit >= 0),
    closing_day integer NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
    due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_credit_cards_user_id ON credit_cards(user_id);

CREATE TRIGGER set_credit_cards_updated_at
    BEFORE UPDATE ON credit_cards
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gerenciam seus cartoes"
    ON credit_cards FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 4. TABELA: purchases (compras)
-- ============================================
CREATE TABLE purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
    family_member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
    merchant text NOT NULL,
    category text,
    total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0),
    installment_count integer NOT NULL DEFAULT 1
        CHECK (installment_count BETWEEN 1 AND 48),
    installment_value numeric(12,2) NOT NULL CHECK (installment_value > 0),
    purchase_date date NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_purchases_user_id ON purchases(user_id);
CREATE INDEX idx_purchases_credit_card_id ON purchases(credit_card_id);
CREATE INDEX idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX idx_purchases_family_member_id ON purchases(family_member_id);

CREATE TRIGGER set_purchases_updated_at
    BEFORE UPDATE ON purchases
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gerenciam suas compras"
    ON purchases FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 5. TABELA: installments (parcelas)
-- Gerada automaticamente via trigger
-- ============================================
CREATE TABLE installments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
    family_member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
    installment_number integer NOT NULL CHECK (installment_number >= 1),
    total_installments integer NOT NULL CHECK (total_installments >= 1),
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    reference_month date NOT NULL,
    is_paid boolean DEFAULT false,
    paid_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_installments_user_id ON installments(user_id);
CREATE INDEX idx_installments_purchase_id ON installments(purchase_id);
CREATE INDEX idx_installments_credit_card_id ON installments(credit_card_id);
CREATE INDEX idx_installments_reference_month ON installments(reference_month);
CREATE INDEX idx_installments_is_paid ON installments(is_paid);
CREATE INDEX idx_installments_family_member_id ON installments(family_member_id);

-- Indice parcial: parcelas nao pagas por cartao + mes (consulta de fatura)
CREATE INDEX idx_installments_card_month
    ON installments(credit_card_id, reference_month)
    WHERE is_paid = false;

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios veem suas parcelas"
    ON installments FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 6. TABELA: invoices (faturas)
-- ============================================
CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reference_month date NOT NULL,
    total_amount numeric(12,2) NOT NULL DEFAULT 0,
    paid_amount numeric(12,2) NOT NULL DEFAULT 0,
    closing_date date NOT NULL,
    due_date date NOT NULL,
    status text NOT NULL DEFAULT 'aberta'
        CHECK (status IN ('aberta', 'fechada', 'paga', 'parcial')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Unique: uma fatura por cartao por mes
CREATE UNIQUE INDEX idx_invoices_card_month
    ON invoices(credit_card_id, reference_month);

CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_status ON invoices(status);

CREATE TRIGGER set_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios veem suas faturas"
    ON invoices FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 7. TABELA: payments (pagamentos)
-- ============================================
CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    payment_date date NOT NULL,
    payment_method text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_family_member_id ON payments(family_member_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gerenciam seus pagamentos"
    ON payments FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 8. TABELA: alerts (alertas)
-- ============================================
CREATE TABLE alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL
        CHECK (type IN ('closing_soon', 'due_soon', 'overdue', 'limit_warning')),
    title text NOT NULL,
    message text NOT NULL,
    reference_date date,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_unread ON alerts(user_id, is_read) WHERE is_read = false;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios veem seus alertas"
    ON alerts FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 9. TABELA: categories (categorias)
-- ============================================
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    icon text,
    color text DEFAULT '#6366F1',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_categories_user_id ON categories(user_id);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gerenciam suas categorias"
    ON categories FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER: Gerar parcelas automaticamente
-- Disparado ao inserir uma compra
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_installments()
RETURNS TRIGGER AS $$
DECLARE
    i integer;
    ref_month date;
BEGIN
    FOR i IN 1..NEW.installment_count LOOP
        ref_month := (date_trunc('month', NEW.purchase_date)::date
                      + (i - 1) * interval '1 month');

        INSERT INTO installments (
            purchase_id,
            user_id,
            credit_card_id,
            family_member_id,
            installment_number,
            total_installments,
            amount,
            reference_month,
            is_paid
        ) VALUES (
            NEW.id,
            NEW.user_id,
            NEW.credit_card_id,
            NEW.family_member_id,
            i,
            NEW.installment_count,
            NEW.installment_value,
            ref_month,
            false
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_installments
    AFTER INSERT ON purchases
    FOR EACH ROW
    WHEN (NEW.installment_count > 0)
    EXECUTE FUNCTION public.generate_installments();

-- ============================================
-- TRIGGER: Atualizar status da fatura
-- Disparado ao inserir/atualizar pagamento
-- ============================================
CREATE OR REPLACE FUNCTION public.update_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
    v_total numeric(12,2);
    v_paid numeric(12,2);
    v_remaining numeric(12,2);
    v_card_id uuid;
    v_ref_month date;
BEGIN
    -- Busca cartao e mes da fatura
    SELECT credit_card_id, reference_month
    INTO v_card_id, v_ref_month
    FROM invoices WHERE id = NEW.invoice_id;

    -- Soma todas as parcelas do mes (pagas e nao pagas)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total
    FROM installments
    WHERE credit_card_id = v_card_id
      AND reference_month = v_ref_month;

    -- Soma pagamentos registrados
    SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM payments
    WHERE invoice_id = NEW.invoice_id;

    v_remaining := v_total - v_paid;

    IF v_remaining <= 0 THEN
        UPDATE invoices
        SET status = 'paga',
            paid_amount = v_total,
            updated_at = now()
        WHERE id = NEW.invoice_id;
    ELSIF v_paid > 0 THEN
        UPDATE invoices
        SET status = 'parcial',
            paid_amount = v_paid,
            updated_at = now()
        WHERE id = NEW.invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_invoice_status
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_invoice_status();

-- ============================================
-- FUNCAO: Calcular mes da fatura
-- Considera o dia de fechamento do cartao
-- ============================================
CREATE OR REPLACE FUNCTION public.get_invoice_month(
    p_purchase_date date,
    p_closing_day integer
) RETURNS date AS $$
DECLARE
    purchase_month date := date_trunc('month', p_purchase_date)::date;
    purchase_day integer := EXTRACT(DAY FROM p_purchase_date)::integer;
BEGIN
    IF purchase_day >= p_closing_day THEN
        RETURN (purchase_month + interval '1 month')::date;
    ELSE
        RETURN purchase_month;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- FUNCAO: Calcular limite utilizado
-- ============================================
CREATE OR REPLACE FUNCTION public.get_used_limit(
    p_card_id uuid,
    p_month date
) RETURNS numeric(12,2) AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(amount) FROM installments
         WHERE credit_card_id = p_card_id
           AND reference_month = p_month
           AND is_paid = false),
        0
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- FUNCAO: Gerar faturas mensalmente
-- Executada via pg_cron todo dia 1
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(
    target_month date
) RETURNS void AS $$
DECLARE
    card RECORD;
    v_closing_date date;
    v_due_date date;
    v_total numeric(12,2);
    v_last_day_of_month integer;
BEGIN
    FOR card IN
        SELECT cc.*, u.id as user_id
        FROM credit_cards cc
        JOIN users u ON u.id = cc.user_id
        WHERE cc.is_active = true
    LOOP
        -- Ultimo dia do mes alvo
        v_last_day_of_month := EXTRACT(
            DAY FROM (target_month + interval '1 month' - interval '1 day')
        )::integer;

        -- Data de fechamento
        v_closing_date := make_date(
            EXTRACT(YEAR FROM target_month)::integer,
            EXTRACT(MONTH FROM target_month)::integer,
            LEAST(card.closing_day, v_last_day_of_month)
        );

        -- Data de vencimento (closing + ~10 dias)
        v_due_date := v_closing_date + interval '10 days';

        -- Pula se ja existe
        IF EXISTS (
            SELECT 1 FROM invoices
            WHERE credit_card_id = card.id
              AND reference_month = target_month
        ) THEN
            CONTINUE;
        END IF;

        -- Soma parcelas nao pagas deste mes
        SELECT COALESCE(SUM(amount), 0)
        INTO v_total
        FROM installments
        WHERE credit_card_id = card.id
          AND reference_month = target_month
          AND is_paid = false;

        -- Insere fatura
        INSERT INTO invoices (
            credit_card_id, user_id, reference_month,
            total_amount, paid_amount, closing_date, due_date, status
        ) VALUES (
            card.id, card.user_id, target_month,
            v_total, 0, v_closing_date, v_due_date,
            CASE WHEN v_total > 0 THEN 'aberta' ELSE 'fechada' END
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCAO: Gerar alertas diarios
-- Executada via pg_cron as 08:00 UTC
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_alerts()
RETURNS void AS $$
DECLARE
    card RECORD;
    v_closing_date date;
    v_due_date date;
    v_today date := CURRENT_DATE;
    v_last_day integer;
    v_used numeric(12,2);
    v_pct numeric;
BEGIN
    FOR card IN
        SELECT * FROM credit_cards WHERE is_active = true
    LOOP
        v_last_day := EXTRACT(
            DAY FROM (date_trunc('month', v_today)
                      + interval '1 month' - interval '1 day')
        )::integer;

        v_closing_date := make_date(
            EXTRACT(YEAR FROM v_today)::integer,
            EXTRACT(MONTH FROM v_today)::integer,
            LEAST(card.closing_day, v_last_day)
        );

        v_due_date := v_closing_date + interval '10 days';

        -- Alerta: fechamento em 3 dias
        IF v_closing_date BETWEEN v_today AND v_today + interval '3 days'
           AND NOT EXISTS (
               SELECT 1 FROM alerts
               WHERE user_id = card.user_id
                 AND type = 'closing_soon'
                 AND reference_date = v_closing_date
                 AND created_at >= v_today
           )
        THEN
            INSERT INTO alerts (user_id, type, title, message, reference_date)
            VALUES (
                card.user_id, 'closing_soon',
                'Fatura fechando em breve!',
                'A fatura do cartao ' || card.name
                    || ' fecha dia ' || to_char(v_closing_date, 'DD/MM/YYYY') || '.',
                v_closing_date
            );
        END IF;

        -- Alerta: vencimento em 5 dias
        IF v_due_date BETWEEN v_today AND v_today + interval '5 days'
           AND NOT EXISTS (
               SELECT 1 FROM alerts
               WHERE user_id = card.user_id
                 AND type = 'due_soon'
                 AND reference_date = v_due_date
                 AND created_at >= v_today
           )
        THEN
            INSERT INTO alerts (user_id, type, title, message, reference_date)
            VALUES (
                card.user_id, 'due_soon',
                'Vencimento proximo!',
                'A fatura do cartao ' || card.name
                    || ' vence dia ' || to_char(v_due_date, 'DD/MM/YYYY') || '.',
                v_due_date
            );
        END IF;

        -- Alerta: fatura vencida
        IF v_due_date < v_today
           AND NOT EXISTS (
               SELECT 1 FROM alerts
               WHERE user_id = card.user_id
                 AND type = 'overdue'
                 AND reference_date = v_due_date
                 AND created_at >= v_today
           )
        THEN
            INSERT INTO alerts (user_id, type, title, message, reference_date)
            VALUES (
                card.user_id, 'overdue',
                'Fatura vencida!',
                'A fatura do cartao ' || card.name
                    || ' venceu dia ' || to_char(v_due_date, 'DD/MM/YYYY') || '.',
                v_due_date
            );
        END IF;

        -- Alerta: limite > 80%
        v_used := public.get_used_limit(card.id, date_trunc('month', v_today)::date);
        IF card.credit_limit > 0 THEN
            v_pct := (v_used / card.credit_limit) * 100;
            IF v_pct >= 80
               AND NOT EXISTS (
                   SELECT 1 FROM alerts
                   WHERE user_id = card.user_id
                     AND type = 'limit_warning'
                     AND reference_date = v_today
                     AND created_at >= v_today
               )
            THEN
                INSERT INTO alerts (user_id, type, title, message, reference_date)
                VALUES (
                    card.user_id, 'limit_warning',
                    'Limite quase esgotado!',
                    'O cartao ' || card.name || ' esta com '
                        || round(v_pct, 0)::text || '% do limite utilizado ('
                        || 'R$ ' || to_char(v_used, '9G999G999D99') || ' de R$ '
                        || to_char(card.credit_limit, '9G999G999D99') || ').',
                    v_today
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Criar perfil ao registrar usuario
-- Disparado no auth.users do Supabase
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Cria perfil do usuario
    INSERT INTO public.users (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );

    -- Cria o titular automaticamente
    INSERT INTO public.family_members (user_id, name, role, color)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Titular'),
        'titular',
        '#6366F1'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- VIEW: Fatura com parcelas detalhadas
-- ============================================
CREATE OR REPLACE VIEW v_invoice_detail AS
SELECT
    inv.id AS invoice_id,
    inv.credit_card_id,
    inv.user_id,
    inv.reference_month,
    inv.total_amount,
    inv.paid_amount,
    inv.closing_date,
    inv.due_date,
    inv.status,
    inst.id AS installment_id,
    inst.purchase_id,
    inst.installment_number,
    inst.total_installments,
    inst.amount AS installment_amount,
    inst.is_paid,
    p.merchant,
    p.purchase_date,
    p.category,
    fm.name AS family_member_name,
    fm.color AS family_member_color
FROM invoices inv
JOIN installments inst
    ON inst.credit_card_id = inv.credit_card_id
    AND inst.reference_month = inv.reference_month
JOIN purchases p ON p.id = inst.purchase_id
LEFT JOIN family_members fm ON fm.id = inst.family_member_id;

-- ============================================
-- VIEW: Gastos por familiar no mes
-- ============================================
CREATE OR REPLACE VIEW v_family_spending AS
SELECT
    fm.id AS family_member_id,
    fm.user_id,
    fm.name,
    fm.role,
    fm.color,
    fm.is_active,
    inst.reference_month,
    COALESCE(SUM(inst.amount), 0) AS total_spent,
    COUNT(inst.id) AS installment_count
FROM family_members fm
LEFT JOIN installments inst
    ON inst.family_member_id = fm.id
    AND inst.is_paid = false
GROUP BY fm.id, fm.user_id, fm.name, fm.role, fm.color, fm.is_active, inst.reference_month;

-- ============================================
-- CRON JOBS (pg_cron - requer extensao habilitada)
-- Descomente se pg_cron estiver disponivel no seu plano Supabase
-- ============================================

-- Gerar faturas todo dia 1 do mes as 00:00 UTC
-- SELECT cron.schedule(
--     'generate-monthly-invoices',
--     '0 0 1 * *',
--     'SELECT public.generate_monthly_invoices(date_trunc(''month'', now())::date)'
-- );

-- Gerar alertas todo dia as 08:00 UTC (05:00 BRT)
-- SELECT cron.schedule(
--     'generate-daily-alerts',
--     '0 8 * * *',
--     'SELECT public.generate_alerts()'
-- );
