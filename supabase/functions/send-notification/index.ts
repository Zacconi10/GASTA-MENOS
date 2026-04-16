// supabase/functions/send-notification/index.ts
// Envia push notification quando um alerta e criado
// Conectar via Supabase Database Webhook na tabela alerts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const FIREBASE_MESSAGING_URL = 'https://fcm.googleapis.com/fcm/send';
const FIREBASE_SERVER_KEY = Deno.env.get('FIREBASE_SERVER_KEY');

interface AlertPayload {
  record: {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
  };
}

serve(async (req: Request) => {
  try {
    const payload: AlertPayload = await req.json();
    const { record } = payload;

    if (!record || !record.user_id) {
      return new Response(
        JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Mapeia tipo do alerta para icon/cor
    const alertConfig: Record<string, { icon: string; color: string }> = {
      closing_soon: { icon: '📅', color: '#F59E0B' },
      due_soon: { icon: '⏰', color: '#EF4444' },
      overdue: { icon: '❌', color: '#DC2626' },
      limit_warning: { icon: '⚠️', color: '#F97316' }
    };

    const config = alertConfig[record.type] || { icon: '🔔', color: '#6366F1' };

    // Enviar via Firebase Cloud Messaging
    if (FIREBASE_SERVER_KEY) {
      // Buscar FCM token do usuario no banco (salvo durante login do app)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: userTokens } = await supabase
        .from('user_device_tokens')
        .select('fcm_token')
        .eq('user_id', record.user_id);

      if (userTokens && userTokens.length > 0) {
        for (const token of userTokens) {
          await fetch(FIREBASE_MESSAGING_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `key=${FIREBASE_SERVER_KEY}`
            },
            body: JSON.stringify({
              to: token.fcm_token,
              notification: {
                title: `${config.icon} ${record.title}`,
                body: record.message,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
              },
              data: {
                alert_id: record.id,
                alert_type: record.type,
                screen: 'alerts'
              }
            })
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, alert_id: record.id }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
