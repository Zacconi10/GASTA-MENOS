-- Migration 002: family_members + credit_cards
-- ============================================

-- ============================================
-- family_members
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
-- credit_cards
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
-- Trigger: handle_new_user (agora family_members existe)
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
