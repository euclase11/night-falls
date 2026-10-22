import { supabase } from './supabase.js';

const LOCK_DURATION_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;

export async function getCurrentUser() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user ?? null;
}

export async function getLock(table, id) {
    const { data, error } = await supabase
        .from('edit_locks')
        .select('user_id, user_email, expires_at')
        .eq('entry_table', table)
        .eq('entry_id', String(id))
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
    if (error) {
        console.error('getLock', error);
        return null;
    }
    return data;
}

export async function acquireLock(table, id) {
    const user = await getCurrentUser();
    if (!user) return { ok: false, reason: 'no-session' };
    const entryId = String(id);
    const expiresAt = new Date(Date.now() + LOCK_DURATION_MS).toISOString();

    await supabase
        .from('edit_locks')
        .delete()
        .eq('entry_table', table)
        .eq('entry_id', entryId)
        .lt('expires_at', new Date().toISOString());

    const existing = await getLock(table, entryId);
    if (existing && existing.user_id !== user.id) {
        return { ok: false, reason: 'locked', holder: existing };
    }

    const { error } = await supabase
        .from('edit_locks')
        .upsert(
            {
                entry_table: table,
                entry_id: entryId,
                user_id: user.id,
                user_email: user.email,
                locked_at: new Date().toISOString(),
                expires_at: expiresAt,
            },
            { onConflict: 'entry_table,entry_id' }
        );

    if (error) {
        if (error.code === '23505') {
            const holder = await getLock(table, entryId);
            if (holder && holder.user_id !== user.id) {
                return { ok: false, reason: 'locked', holder };
            }
        }
        console.error('acquireLock', error);
        return { ok: false, reason: 'error', error };
    }

    return { ok: true };
}

export async function releaseLock(table, id) {
    const user = await getCurrentUser();
    if (!user) return;
    const { error } = await supabase
        .from('edit_locks')
        .delete()
        .eq('entry_table', table)
        .eq('entry_id', String(id))
        .eq('user_id', user.id);
    if (error) console.error('releaseLock', error);
}

export function startHeartbeat(table, id) {
    const timer = setInterval(async () => {
        const user = await getCurrentUser();
        if (!user) return;
        const { error } = await supabase
            .from('edit_locks')
            .update({ expires_at: new Date(Date.now() + LOCK_DURATION_MS).toISOString() })
            .eq('entry_table', table)
            .eq('entry_id', String(id))
            .eq('user_id', user.id);
        if (error) console.error('heartbeat', error);
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
}