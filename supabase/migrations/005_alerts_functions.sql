-- Migration 005: alerts + helper functions + views + automation
-- ============================================

-- ============================================
-- alerts
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
-- FUNCAO: Calcular mes da fatura
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
        v_last_day_of_month := EXTRACT(
            DAY FROM (target_month + interval '1 month' - interval '1 day')
        )::integer;

        v_closing_date := make_date(
            EXTRACT(YEAR FROM target_month)::integer,
            EXTRACT(MONTH FROM target_month)::integer,
            LEAST(card.closing_day, v_last_day_of_month)
        );

        v_due_date := v_closing_date + interval '10 days';

        IF EXISTS (
            SELECT 1 FROM invoices
            WHERE credit_card_id = card.id AND reference_month = target_month
        ) THEN
            CONTINUE;
        END IF;

        SELECT COALESCE(SUM(amount), 0) INTO v_total
        FROM installments
        WHERE credit_card_id = card.id
          AND reference_month = target_month
          AND is_paid = false;

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
    FOR card IN SELECT * FROM credit_cards WHERE is_active = true LOOP
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

        -- Fechamento em 3 dias
        IF v_closing_date BETWEEN v_today AND v_today + interval '3 days'
           AND NOT EXISTS (
               SELECT 1 FROM alerts WHERE user_id = card.user_id
                 AND type = 'closing_soon' AND reference_date = v_closing_date
                 AND created_at >= v_today
           )
        THEN
            INSERT INTO alerts (user_id, type, title, message, reference_date)
            VALUES (card.user_id, 'closing_soon',
                'Fatura fechando em breve!',
                'A fatura do cartao ' || card.name || ' fecha dia '
                    || to_char(v_closing_date, 'DD/MM/YYYY') || '.',
                v_closing_date);
        END IF;

        -- Vencimento em 5 dias
        IF v_due_date BETWEEN v_today AND v_today + interval '5 days'
           AND NOT EXISTS (
               SELECT 1 FROM alerts WHERE user_id = card.user_id
                 AND type = 'due_soon' AND reference_date = v_due_date
                 AND created_at >= v_today
           )
        THEN
            INSERT INTO alerts (user_id, type, title, message, reference_date)
            VALUES (card.user_id, 'due_soon',
                'Vencimento proximo!',
                'A fatura do cartao ' || card.name || ' vence dia '
                    || to_char(v_due_date, 'DD/MM/YYYY') || '.',
                v_due_date);
        END IF;

        -- Fatura vencida
        IF v_due_date < v_today
           AND NOT EXISTS (
               SELECT 1 FROM alerts WHERE user_id = card.user_id
                 AND type = 'overdue' AND reference_date = v_due_date
                 AND created_at >= v_today
           )
        THEN
            INSERT INTO alerts (user_id, type, title, message, reference_date)
            VALUES (card.user_id, 'overdue',
                'Fatura vencida!',
                'A fatura do cartao ' || card.name || ' venceu dia '
                    || to_char(v_due_date, 'DD/MM/YYYY') || '.',
                v_due_date);
        END IF;

        -- Limite > 80%
        v_used := public.get_used_limit(card.id, date_trunc('month', v_today)::date);
        IF card.credit_limit > 0 THEN
            v_pct := (v_used / card.credit_limit) * 100;
            IF v_pct >= 80
               AND NOT EXISTS (
                   SELECT 1 FROM alerts WHERE user_id = card.user_id
                     AND type = 'limit_warning' AND reference_date = v_today
                     AND created_at >= v_today
               )
            THEN
                INSERT INTO alerts (user_id, type, title, message, reference_date)
                VALUES (card.user_id, 'limit_warning',
                    'Limite quase esgotado!',
                    'O cartao ' || card.name || ' esta com '
                        || round(v_pct, 0)::text || '% do limite utilizado.',
                    v_today);
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: Fatura com parcelas detalhadas
-- ============================================
CREATE OR REPLACE VIEW v_invoice_detail AS
SELECT
    inv.id AS invoice_id,
    inv.credit_card_id, inv.user_id, inv.reference_month,
    inv.total_amount, inv.paid_amount, inv.closing_date,
    inv.due_date, inv.status,
    inst.id AS installment_id, inst.purchase_id,
    inst.installment_number, inst.total_installments,
    inst.amount AS installment_amount, inst.is_paid,
    p.merchant, p.purchase_date, p.category,
    fm.name AS family_member_name, fm.color AS family_member_color
FROM invoices inv
JOIN installments inst
    ON inst.credit_card_id = inv.credit_card_id
    AND inst.reference_month = inv.reference_month
JOIN purchases p ON p.id = inst.purchase_id
LEFT JOIN family_members fm ON fm.id = inst.family_member_id;

-- ============================================
-- VIEW: Gastos por familiar
-- ============================================
CREATE OR REPLACE VIEW v_family_spending AS
SELECT
    fm.id AS family_member_id, fm.user_id,
    fm.name, fm.role, fm.color, fm.is_active,
    inst.reference_month,
    COALESCE(SUM(inst.amount), 0) AS total_spent,
    COUNT(inst.id) AS installment_count
FROM family_members fm
LEFT JOIN installments inst
    ON inst.family_member_id = fm.id AND inst.is_paid = false
GROUP BY fm.id, fm.user_id, fm.name, fm.role, fm.color, fm.is_active, inst.reference_month;

-- ============================================
-- CRON JOBS (descomentar se pg_cron disponivel)
-- ============================================
-- SELECT cron.schedule('generate-monthly-invoices', '0 0 1 * *',
--     'SELECT public.generate_monthly_invoices(date_trunc(''month'', now())::date)');
-- SELECT cron.schedule('generate-daily-alerts', '0 8 * * *',
--     'SELECT public.generate_alerts()');
