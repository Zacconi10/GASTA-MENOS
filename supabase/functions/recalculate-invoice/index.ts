// supabase/functions/recalculate-invoice/index.ts
// Recalcula o total pago de uma fatura e atualiza seu status
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { invoiceId } = await req.json();

  if (!invoiceId) {
    return new Response(
      JSON.stringify({ error: 'invoiceId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Busca a fatura
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('credit_card_id, reference_month, total_amount')
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return new Response(
      JSON.stringify({ error: 'Invoice not found', details: invoiceError }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Soma todas as parcelas do mes
  const { data: installments } = await supabase
    .from('installments')
    .select('amount')
    .eq('credit_card_id', invoice.credit_card_id)
    .eq('reference_month', invoice.reference_month);

  const totalAmount = installments?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;

  // Soma pagamentos
  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .eq('invoice_id', invoiceId);

  const paidAmount = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  // Determina status
  const remaining = totalAmount - paidAmount;
  let status = 'aberta';
  if (remaining <= 0) {
    status = 'paga';
  } else if (paidAmount > 0) {
    status = 'parcial';
  }

  // Atualiza fatura
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      total_amount: totalAmount,
      paid_amount: paidAmount,
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', invoiceId);

  if (updateError) {
    return new Response(
      JSON.stringify({ error: 'Failed to update invoice', details: updateError }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      remaining,
      status
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
