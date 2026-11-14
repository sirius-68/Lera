import { useState } from 'react';
import { chat, listModels } from '../ai/client';
import { AiConfig, aiReady, NO_AI, ProviderId, PROVIDERS } from '../ai/providers';
import { Lera } from '../mascot/Lera';
import { actions, getState, useStore } from '../store';
import { back, resetNav } from '../store/nav';
import { Button3D, confirmDialog, toast } from '../ui/kit';
import { Icon } from '../ui/icons';

type Test = { state: 'idle' } | { state: 'busy' } | { state: 'ok'; text: string } | { state: 'fail'; text: string };

export function SettingsScreen() {
  const profile = useStore((s) => s.profile);
  const saved = useStore((s) => s.ai);
  const [ai, setAi] = useState<AiConfig>(saved);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<Test>({ state: 'idle' });
  const preset = ai.provider === 'none' ? null : PROVIDERS[ai.provider];

  const update = (patch: Partial<AiConfig>) => {
    const next = { ...ai, ...patch };
    setAi(next);
    actions.setAi(next);
    setTest({ state: 'idle' });
  };

  const pick = (id: ProviderId) => {
    setModels([]);
    if (id === 'none') return update({ ...NO_AI });
    const p = PROVIDERS[id];
    update({ provider: id, baseUrl: p.baseUrl, model: p.defaultModel, apiKey: id === ai.provider ? ai.apiKey : '' });
  };

  const load = async () => {
    setLoading(true);
    try {
      const list = await listModels(ai);
      setModels(list);
      if (!list.length) toast('The provider returned no models.');
      else if (!ai.model) {
        const free = list.find((m) => m.endsWith(':free')) ?? list[0];
        update({ model: free });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t load the model list.', 4000);
    }
    setLoading(false);
  };

  const run = async () => {
    setTest({ state: 'busy' });
    try {
      const reply = await chat(ai, [{ role: 'user', content: 'In one short sentence, say hello to a student who is about to practise algebra.' }], { maxTokens: 60, temperature: 0.5 });
      setTest({ state: 'ok', text: reply.trim() });
    } catch (e) {
      setTest({ state: 'fail', text: e instanceof Error ? e.message : 'The request failed.' });
    }
  };

  const exportData = async () => {
    const { ai: _omit, ...rest } = getState();
    void _omit;
    const json = JSON.stringify(rest, null, 2);
    if (__SINGLE_FILE__) {
      // the one-file preview usually runs embedded, where downloads are blocked
      try {
        await navigator.clipboard.writeText(json);
        toast('Progress copied — paste it into a file to keep it.');
      } catch {
        toast('This preview can’t export. Run the app yourself to download your progress.', 4000);
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `lera-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="screen" data-dir="1">
      <div className="topbar">
        <button className="iconbtn" onClick={back} aria-label="Back"><Icon name="back" /></button>
        <h1>Settings</h1>
      </div>
      <div className="scroll">
        <div className="stagger" style={{ padding: '4px 20px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="col" style={{ gap: 8 }}>
            <span className="label">You</span>
            <input className="field" value={profile.name} placeholder="First name" onChange={(e: { target: { value: string } }) => actions.setProfile({ name: e.target.value })} aria-label="First name" />
            <label className="row" style={{ justifyContent: 'space-between', fontSize: 15 }}>
              Session length
              <select className="field" style={{ width: 150, padding: '10px 12px' }} value={profile.focusMinutes} onChange={(e: { target: { value: string } }) => actions.setProfile({ focusMinutes: Number(e.target.value) })}>
                {[5, 10, 20, 30, 40, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </label>
          </section>

          <section className="col" style={{ gap: 10 }}>
            <span className="label">AI assistant</span>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <Lera size={50} mood={aiReady(ai) ? 'happy' : 'idle'} />
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Checking your algebra never needs AI — that’s done by Lera’s own engine, on this device. A model adds three things: tidier lessons from messy files, open questions in <b>Ask Lera</b>, and marking of word problems.
              </p>
            </div>
            <div className="col" style={{ gap: 8 }}>
              <button className={`option ${ai.provider === 'none' ? 'on' : ''}`} onClick={() => pick('none')}>
                <span className="grow" style={{ textAlign: 'left' }}><b>No AI</b><span className="sub">Everything built in. Nothing leaves this device.</span></span>
                <span className="radio" />
              </button>
              {(Object.keys(PROVIDERS) as Exclude<ProviderId, 'none'>[]).map((id) => (
                <button key={id} className={`option ${ai.provider === id ? 'on' : ''}`} onClick={() => pick(id)}>
                  <span className="grow" style={{ textAlign: 'left' }}><b>{PROVIDERS[id].name}</b><span className="sub">{PROVIDERS[id].note}</span></span>
                  <span className="radio" />
                </button>
              ))}
            </div>

            {preset && __SINGLE_FILE__ && (
              <p className="warn"><Icon name="alert" size={17} /> <span>This one-file preview may be blocked from reaching the internet, so a model can fail to connect here even with a good key. It works when you run the app with <b>npm run dev</b>.</span></p>
            )}
            {preset && (
              <div className="card col" style={{ gap: 10 }}>
                {(ai.provider === 'custom' || ai.provider === 'ollama') && (
                  <label className="col" style={{ gap: 4, fontSize: 13.5 }}>
                    <span className="muted">Address</span>
                    <input className="field" value={ai.baseUrl} placeholder="https://…/v1" onChange={(e: { target: { value: string } }) => update({ baseUrl: e.target.value.trim() })} spellCheck={false} />
                  </label>
                )}
                {preset.needsKey && (
                  <label className="col" style={{ gap: 4, fontSize: 13.5 }}>
                    <span className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="muted">API key</span>
                      {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontWeight: 600 }}>Get a free key ↗</a>}
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <input className="field" type={showKey ? 'text' : 'password'} value={ai.apiKey} placeholder="Paste your key" onChange={(e: { target: { value: string } }) => update({ apiKey: e.target.value.trim() })} autoComplete="off" spellCheck={false} />
                      <button className="iconbtn" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Hide key' : 'Show key'}><Icon name="eye" size={19} /></button>
                    </span>
                  </label>
                )}
                <label className="col" style={{ gap: 4, fontSize: 13.5 }}>
                  <span className="muted">Model</span>
                  <span className="row" style={{ gap: 6 }}>
                    {models.length ? (
                      <select className="field" value={ai.model} onChange={(e: { target: { value: string } }) => update({ model: e.target.value })}>
                        {!models.includes(ai.model) && <option value={ai.model}>{ai.model || 'Choose a model'}</option>}
                        {models.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input className="field" value={ai.model} placeholder="Model name" onChange={(e: { target: { value: string } }) => update({ model: e.target.value.trim() })} spellCheck={false} />
                    )}
                    <Button3D small variant="secondary" busy={loading} onClick={load}>List</Button3D>
                  </span>
                </label>
                <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  The key is kept in this browser and sent only to the address above. For anything public, put the key on a server instead — see the README.
                </p>
                <Button3D small disabled={!aiReady(ai)} busy={test.state === 'busy'} onClick={run} style={{ alignSelf: 'flex-start' }}>Test connection</Button3D>
                {test.state === 'ok' && <p className="warn okw"><Icon name="check" size={17} stroke={3} /> <span>Connected. The model said: “{test.text}”</span></p>}
                {test.state === 'fail' && <p className="warn"><Icon name="alert" size={17} /> <span>{test.text}</span></p>}
              </div>
            )}
          </section>

          <section className="col" style={{ gap: 8 }}>
            <span className="label">This build</span>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Real: reading PDF and Word files, lessons, highlights and notes, line-by-line checking, diagnosis, the review queue. Placeholders: sign-in, the paid trial, push reminders and the Russian and French interface.
            </p>
            <p className="faint" style={{ fontSize: 13 }}>Plan: {profile.plan === 'trial' ? 'Free trial (demo — nothing is charged)' : 'Free'}</p>
          </section>

          <section className="col" style={{ gap: 8 }}>
            <span className="label">Your data</span>
            <Button3D small variant="secondary" onClick={exportData} style={{ alignSelf: 'flex-start' }}><Icon name="share" size={16} /> Export progress</Button3D>
            <button
              className="linkbtn"
              style={{ color: 'var(--gap)', alignSelf: 'flex-start', paddingLeft: 0 }}
              onClick={async () => {
                if (await confirmDialog('Erase everything?', { body: 'All notes, progress and settings on this device will be removed.', yes: 'Erase', danger: true })) {
                  actions.reset();
                  resetNav();
                }
              }}
            >
              <Icon name="trash" size={16} /> Erase everything and start again
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
