import { supabase } from './supabase';

export async function redeemActivationCode(
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('redeem_activation_code', {
    p_code: code.trim(),
  });

  if (error) {
    const message = error.message.includes('already been used')
      ? 'This activation code has already been used'
      : error.message.includes('Invalid activation code')
        ? 'Invalid activation code'
        : error.message;
    return { ok: false, message };
  }

  return { ok: true };
}
