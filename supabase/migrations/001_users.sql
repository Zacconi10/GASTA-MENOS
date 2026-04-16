-- Migration 001: Helper + users + categories
-- ============================================

-- Helper: updated_at automatico
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- users (extende auth.users)
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
-- categories
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
