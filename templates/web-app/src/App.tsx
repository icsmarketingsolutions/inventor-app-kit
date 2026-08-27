import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import project from './project.generated.json';
import { makeDemoInvention, normalizeDraft, validateDraft } from './lib/inventions';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { inventionStatuses, type Invention, type InventionDraft, type InventionStatus } from './types';

const statusLabels: Record<InventionStatus, string> = {
  idea: 'Idea',
  prototype: 'Prototipo',
  complete: 'Terminado',
};

const initialDemo: Invention[] = [{
  id: 'welcome',
  title: project.firstAction,
  description: project.problem,
  status: 'idea',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}];

function AuthPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function authenticate(action: 'sign-in' | 'sign-up') {
    if (!supabase) return;
    setBusy(true);
    setMessage('');
    const credentials = { email: email.trim(), password };
    const result = action === 'sign-in'
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);
    setMessage(result.error ? result.error.message : action === 'sign-up'
      ? 'Cuenta creada. Revisá tu correo si el proyecto exige confirmación.'
      : 'Sesión iniciada.');
    setBusy(false);
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Tu taller privado</p>
      <h2 id="auth-title">Entrá para guardar tus inventos</h2>
      <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="current-password" /></label>
      <div className="actions">
        <button type="button" disabled={busy || !email || password.length < 8} onClick={() => authenticate('sign-in')}>Entrar</button>
        <button className="secondary" type="button" disabled={busy || !email || password.length < 8} onClick={() => authenticate('sign-up')}>Crear cuenta</button>
      </div>
      {message && <p className="message" role="status">{message}</p>}
    </section>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [inventions, setInventions] = useState<Invention[]>(isSupabaseConfigured ? [] : initialDemo);
  const [draft, setDraft] = useState<InventionDraft>({ title: '', description: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const activeUserId = useRef<string | null>(null);
  const requestGeneration = useRef(0);

  const loadInventions = useCallback(async (userId: string) => {
    if (!supabase) return;
    const generation = requestGeneration.current;
    setLoading(true);
    const { data, error } = await supabase
      .from('inventions')
      .select('id,title,description,status,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (generation !== requestGeneration.current || activeUserId.current !== userId) return;
    setMessage(error?.message ?? '');
    if (data) setInventions(data as Invention[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let disposed = false;
    let authEventSeen = false;
    const applySession = (nextSession: Session | null) => {
      if (disposed) return;
      const nextUserId = nextSession?.user.id ?? null;
      if (activeUserId.current !== nextUserId) {
        activeUserId.current = nextUserId;
        requestGeneration.current += 1;
        setInventions([]);
        setMessage('');
      }
      setSession(nextSession);
      if (!nextSession) setLoading(false);
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventSeen = true;
      applySession(nextSession);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!authEventSeen) applySession(data.session);
    });
    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) void loadInventions(session.user.id);
    else if (isSupabaseConfigured) {
      setInventions([]);
      setLoading(false);
    }
  }, [session, loadInventions]);

  async function addInvention(event: FormEvent) {
    event.preventDefault();
    const validation = validateDraft(draft);
    if (validation) {
      setMessage(validation);
      return;
    }
    const normalized = normalizeDraft(draft);
    if (!supabase) {
      setInventions((current) => [makeDemoInvention(normalized), ...current]);
      setDraft({ title: '', description: '' });
      setMessage('Idea agregada en modo demostración.');
      return;
    }
    const { error } = await supabase.from('inventions').insert(normalized);
    if (error) setMessage(error.message);
    else {
      setDraft({ title: '', description: '' });
      setMessage('Invento guardado.');
      if (session) await loadInventions(session.user.id);
    }
  }

  async function changeStatus(invention: Invention, status: InventionStatus) {
    if (!supabase) {
      setInventions((current) => current.map((item) => item.id === invention.id ? { ...item, status } : item));
      return;
    }
    const { error } = await supabase
      .from('inventions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', invention.id);
    if (error) setMessage(error.message);
    else if (session) await loadInventions(session.user.id);
  }

  async function removeInvention(invention: Invention) {
    if (!window.confirm(`¿Eliminar “${invention.title}”? Esta acción no se puede deshacer.`)) return;
    if (!supabase) {
      setInventions((current) => current.filter((item) => item.id !== invention.id));
      return;
    }
    const { error } = await supabase.from('inventions').delete().eq('id', invention.id);
    if (error) setMessage(error.message);
    else if (session) await loadInventions(session.user.id);
  }

  const canUseApp = !isSupabaseConfigured || Boolean(session);

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">{project.audience}</p>
          <h1>{project.name}</h1>
          <p className="lead">{project.problem}</p>
        </div>
        <span className={`mode ${isSupabaseConfigured ? 'connected' : ''}`}>
          {isSupabaseConfigured ? 'Supabase conectado' : 'Modo demostración'}
        </span>
      </header>

      {!isSupabaseConfigured && (
        <aside className="notice">
          Ya podés probar la interfaz. Para guardar usuarios y datos reales, seguí <code>SUPABASE_LOCAL.md</code>.
        </aside>
      )}

      {isSupabaseConfigured && !session && <AuthPanel />}

      {canUseApp && (
        <>
          <section className="composer" aria-labelledby="new-title">
            <div><p className="eyebrow">Primer paso</p><h2 id="new-title">{project.firstAction}</h2></div>
            <form onSubmit={addInvention}>
              <label>Nombre<input value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ejemplo: riego solar" /></label>
              <label>Descripción<textarea value={draft.description} maxLength={2000} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="¿Qué resuelve y cuál es el siguiente experimento?" /></label>
              <button type="submit">Guardar idea</button>
            </form>
            {message && <p className="message" role="status">{message}</p>}
          </section>

          <section aria-labelledby="list-title">
            <div className="section-heading"><h2 id="list-title">Inventos</h2><span>{inventions.length}</span></div>
            {loading ? <p>Cargando…</p> : inventions.length === 0 ? <p className="empty">Tu primera idea empieza arriba.</p> : (
              <div className="grid">
                {inventions.map((invention) => (
                  <article className="invention" key={invention.id}>
                    <div><span className={`status status-${invention.status}`}>{statusLabels[invention.status]}</span><h3>{invention.title}</h3><p>{invention.description || 'Sin descripción todavía.'}</p></div>
                    <div className="card-actions">
                      <label>Estado<select value={invention.status} onChange={(event) => changeStatus(invention, event.target.value as InventionStatus)}>{inventionStatuses.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
                      <button className="danger" type="button" onClick={() => removeInvention(invention)}>Eliminar</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {session && <button className="sign-out" type="button" onClick={() => supabase?.auth.signOut()}>Cerrar sesión</button>}
    </main>
  );
}

export default App;
