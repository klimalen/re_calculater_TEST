import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.js';
import { detectTimezone } from './timezone.js';

export async function signUp(email, password, displayName) {
  // Step 1: IP rate limit check via Edge Function (~300ms, lightweight DB query only).
  // The actual account creation stays in the Supabase JS SDK to avoid any
  // Web Lock stalls that occur when proxying auth through an Edge Function.
  const checkRes = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body:    JSON.stringify({ email }),
  });

  if (!checkRes.ok) {
    const checkData = await checkRes.json();
    const err = new Error(checkData.error || 'Ошибка регистрации');
    if (checkData.code) err.code = checkData.code;
    throw err;
  }

  // Step 2: Actual signup via Supabase JS — normal auth flow, no Web Lock issues.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split('@')[0] } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email) {
  const redirectTo = `${window.location.origin}/#reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function deleteAccount() {
  // Calls an RPC that cascades delete of all user data, then deletes auth user
  const { error } = await supabase.rpc('delete_user_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Map Supabase auth error messages to Russian */
export function authErrorMessage(error) {
  const msg  = error?.message || '';
  const code = error?.code    || '';
  if (code === 'IP_RATE_LIMIT') return error.message; // already Russian text from Edge Function
  if (msg.includes('Invalid login credentials')) return 'Неверный email или пароль';
  if (msg.includes('User already registered')) return 'Этот email уже зарегистрирован';
  if (msg.includes('Email not confirmed')) return 'Подтвердите email — письмо отправлено';
  if (msg.includes('Password should be')) return 'Пароль должен быть не менее 6 символов';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Слишком много попыток. Попробуйте позже';
  if (msg.includes('network') || msg.includes('fetch')) return 'Нет соединения с сетью';
  return 'Что-то пошло не так. Попробуйте ещё раз';
}
