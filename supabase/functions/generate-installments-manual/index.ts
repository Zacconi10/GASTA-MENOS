// supabase/functions/generate-installments-manual/index.ts
// Gera parcelas manualmente para uma compra (fallback/importacao em massa)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { purchaseId } = await req.json();

  if (!purchaseId) {
    return new Response(
      JSON.stringify({ error: 'purchaseId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Busca a compra
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .select('*')
    .eq('id', purchaseId)
    .single();

  if (purchaseError || !purchase) {
    return new Response(
      JSON.stringify({ error: 'Purchase not found', details: purchaseError }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verifica se parcelas ja existem
  const { data: existing } = await supabase
    .from('installments')
    .select('id')
    .eq('purchase_id', purchaseId);

  if (existing && existing.length > 0) {
    return new Response(
      JSON.stringify({ error: 'Installments already exist for this purchase' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Gera parcelas
  const installments = [];
  for (let i = 1; i <= purchase.installment_count; i++) {
    const refDate = new Date(purchase.purchase_date);
    refDate.setMonth(refDate.getMonth() + i - 1);
    refDate.setDate(1);

    installments.push({
      purchase_id: purchase.id,
      user_id: purchase.user_id,
      credit_card_id: purchase.credit_card_id,
      family_member_id: purchase.family_member_id,
      installment_number: i,
      total_installments: purchase.installment_count,
      amount: purchase.installment_value,
      reference_month: refDate.toISOString().split('T')[0],
      is_paid: false
    });
  }

  const { error: insertError } = await supabase
    .from('installments')
    .insert(installments);

  if (insertError) {
    return new Response(
      JSON.stringify({ error: 'Failed to generate installments', details: insertError }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      count: installments.length,
      purchase_id: purchaseId
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
