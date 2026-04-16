-- Migration 003: purchases + installments + triggers
-- ============================================

-- ============================================
-- purchases
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
-- installments
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

CREATE INDEX idx_installments_card_month
    ON installments(credit_card_id, reference_month)
    WHERE is_paid = false;

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios veem suas parcelas"
    ON installments FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Trigger: gerar parcelas automaticamente
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
            purchase_id, user_id, credit_card_id, family_member_id,
            installment_number, total_installments, amount,
            reference_month, is_paid
        ) VALUES (
            NEW.id, NEW.user_id, NEW.credit_card_id, NEW.family_member_id,
            i, NEW.installment_count, NEW.installment_value,
            ref_month, false
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
