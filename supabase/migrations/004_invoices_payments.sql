-- Migration 004: invoices + payments + triggers
-- ============================================

-- ============================================
-- invoices
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
-- payments
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
-- Trigger: atualizar status da fatura ao pagar
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
    SELECT credit_card_id, reference_month
    INTO v_card_id, v_ref_month
    FROM invoices WHERE id = NEW.invoice_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM installments
    WHERE credit_card_id = v_card_id AND reference_month = v_ref_month;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments WHERE invoice_id = NEW.invoice_id;

    v_remaining := v_total - v_paid;

    IF v_remaining <= 0 THEN
        UPDATE invoices SET status = 'paga', paid_amount = v_total, updated_at = now()
        WHERE id = NEW.invoice_id;
    ELSIF v_paid > 0 THEN
        UPDATE invoices SET status = 'parcial', paid_amount = v_paid, updated_at = now()
        WHERE id = NEW.invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_invoice_status
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_invoice_status();
