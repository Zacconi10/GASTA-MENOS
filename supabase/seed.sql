-- ============================================
-- Dados de Teste - FinControl
-- Execute APÓS o schema.sql
-- ============================================

-- Primeiro, crie um usuario de teste manualmente no Supabase Dashboard:
-- Authentication > Users > Add User
-- Email: teste@fincontrol.com / Senha: Teste123!
-- Depois substitua o UUID abaixo pelo ID gerado.

-- Para fins de teste, substitua 'SEU_USER_ID_AQUI' pelo UUID real do usuario.
-- Voce pode obter com: SELECT id FROM auth.users WHERE email = 'teste@fincontrol.com';

-- Supondo que o user_id seja: 00000000-0000-0000-0000-000000000001
-- (ajuste para o UUID real do seu usuario de teste)

-- ============================================
-- Categorias padrao
-- ============================================
INSERT INTO categories (user_id, name, icon, color) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Alimentação', '🍔', '#EF4444'),
    ('00000000-0000-0000-0000-000000000001', 'Transporte', '🚗', '#3B82F6'),
    ('00000000-0000-0000-0000-000000000001', 'Vestuário', '👕', '#8B5CF6'),
    ('00000000-0000-0000-0000-000000000001', 'Saúde', '💊', '#10B981'),
    ('00000000-0000-0000-0000-000000000001', 'Educação', '📚', '#F59E0B'),
    ('00000000-0000-0000-0000-000000000001', 'Lazer', '🎮', '#EC4899'),
    ('00000000-0000-0000-0000-000000000001', 'Casa', '🏠', '#6366F1'),
    ('00000000-0000-0000-0000-000000000001', 'Tecnologia', '💻', '#06B6D4'),
    ('00000000-0000-0000-0000-000000000001', 'Assinaturas', '📱', '#F97316'),
    ('00000000-0000-0000-0000-000000000001', 'Outros', '📦', '#6B7280');

-- ============================================
-- Cartoes de credito de teste
-- ============================================
INSERT INTO credit_cards (user_id, name, brand, last_four_digits, credit_limit, closing_day, due_day) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Nubank Roxo', 'Nubank', '1234', 5000.00, 15, 25),
    ('00000000-0000-0000-0000-000000000001', 'Inter Gold', 'Mastercard', '5678', 8000.00, 5, 15),
    ('00000000-0000-0000-0000-000000000001', 'Itau Azul', 'Visa', '9012', 3500.00, 20, 30);

-- ============================================
-- Familiares de teste
-- ============================================
INSERT INTO family_members (user_id, name, email, role, color) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Raphael', 'raphael@email.com', 'titular', '#6366F1'),
    ('00000000-0000-0000-0000-000000000001', 'Maria', 'maria@email.com', 'dependente', '#EC4899'),
    ('00000000-0000-0000-0000-000000000001', 'Joao', 'joao@email.com', 'dependente', '#10B981');

-- ============================================
-- Compras de teste (o trigger gerará as parcelas automaticamente)
-- ============================================

-- Compra à vista - Alimentação (Nubank)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '1234'),
     (SELECT id FROM family_members WHERE name = 'Raphael' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'Supermercado Extra', 'Alimentação', 245.90, 1, 245.90, CURRENT_DATE - interval '5 days');

-- Compra parcelada 12x - Tecnologia (Inter)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '5678'),
     (SELECT id FROM family_members WHERE name = 'Raphael' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'Apple Store', 'Tecnologia', 5988.00, 12, 499.00, CURRENT_DATE - interval '10 days');

-- Compra parcelada 6x - Vestuário (Nubank, pela Maria)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '1234'),
     (SELECT id FROM family_members WHERE name = 'Maria' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'Renner', 'Vestuário', 1194.00, 6, 199.00, CURRENT_DATE - interval '8 days');

-- Compra à vista - Lazer (Itau, pelo Joao)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '9012'),
     (SELECT id FROM family_members WHERE name = 'Joao' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'Netflix', 'Assinaturas', 39.90, 1, 39.90, CURRENT_DATE - interval '3 days');

-- Compra parcelada 3x - Saúde (Inter)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '5678'),
     (SELECT id FROM family_members WHERE name = 'Raphael' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'OdontoPrev', 'Saúde', 897.00, 3, 299.00, CURRENT_DATE - interval '15 days');

-- Compra à vista - Alimentação (Nubank, pela Maria)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '1234'),
     (SELECT id FROM family_members WHERE name = 'Maria' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'iFood', 'Alimentação', 67.50, 1, 67.50, CURRENT_DATE - interval '1 day');

-- Compra parcelada 10x - Casa (Itau)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '9012'),
     (SELECT id FROM family_members WHERE name = 'Raphael' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'MadeiraMadeira', 'Casa', 2490.00, 10, 249.00, CURRENT_DATE - interval '20 days');

-- Compra parcelada 4x - Educação (Nubank, pelo Joao)
INSERT INTO purchases (user_id, credit_card_id, family_member_id, merchant, category, total_amount, installment_count, installment_value, purchase_date) VALUES
    ('00000000-0000-0000-0000-000000000001',
     (SELECT id FROM credit_cards WHERE last_four_digits = '1234'),
     (SELECT id FROM family_members WHERE name = 'Joao' AND user_id = '00000000-0000-0000-0000-000000000001'),
     'Udemy', 'Educação', 199.60, 4, 49.90, CURRENT_DATE - interval '7 days');

-- ============================================
-- Gerar faturas do mes atual
-- ============================================
-- A função generate_monthly_invoices cria faturas para todos os cartões
-- Para teste, executamos manualmente:

SELECT public.generate_monthly_invoices(date_trunc('month', CURRENT_DATE)::date);

-- ============================================
-- Gerar alertas de teste
-- ============================================
SELECT public.generate_alerts();

-- ============================================
-- Verificar resultados
-- ============================================

-- Ver parcelas geradas
-- SELECT purchase_id, installment_number, total_installments, amount, reference_month
-- FROM installments ORDER BY purchase_id, installment_number;

-- Ver faturas
-- SELECT cc.name, inv.reference_month, inv.total_amount, inv.status
-- FROM invoices inv JOIN credit_cards cc ON cc.id = inv.credit_card_id;

-- Ver alertas
-- SELECT type, title, message FROM alerts;
