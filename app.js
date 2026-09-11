'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const api = async (u, o) => { const r = await fetch(u, o); const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || r.statusText); return j; };
const fmt = (n, d = 0) => n == null || !isFinite(n) ? '—' :
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const S = JSON.parse(localStorage.getItem('impactcal') || '{}');
const save = () => localStorage.setItem('impactcal', JSON.stringify(S));

let META = null, RESULT = null, CHOSEN = null, GROUP = 'crane';

/* ---------- duty field definitions per case ---------- */
const F = {
  m:   ['Mass', 'kg', 'the mass that actually reaches the buffer'],
  v:   ['Rated travel speed', 'm/min', 'the standard applies its own factor to this'],
  v_ms:['Impact velocity', 'm/s', ''],
  m2:  ['Second mass', 'kg', ''], v2: ['Second speed', 'm/min', ''],
  P:   ['Travel motor power', 'kW', 'leave blank if the drive is off at impact'],
  H_M: ['Stall torque factor', '–', 'normally 2.5'],
  F:   ['Propelling force', 'N', 'cylinder or drive force still acting during the stroke'],
  C:   ['Impacts per hour', '1/h', ''],
  n:   ['Buffers taking the impact', '–', ''],
  mu:  ['Friction coefficient', '–', ''], H: ['Drop height', 'm', ''],
  beta:['Incline angle', '°', ''], J: ['Moment of inertia', 'kg·m²', ''],
  omega:['Angular velocity', 'rad/s', ''], M_t: ['Torque', 'N·m', ''],
  r:   ['Torque radius', 'm', ''], R: ['Buffer radius', 'm', ''],
  temp_min:['Min. temperature', '°C', ''], temp_max:['Max. temperature', '°C', ''],
  max_stroke:['Available stroke', 'mm', 'leave blank if unconstrained'],
};
const CASE_FIELDS = {
  C1:['m','v','P','H_M','C','n'], C2:['m','v','P','H_M','C','n'],
  C3:['m','v','m2','v2','P','H_M','C','n'], C4:['m','v','m2','v2','P','H_M','C','n'],
  I1:['m','v_ms','C','n'], I2:['m','v_ms','F','C','n'], I3:['m','v_ms','P','H_M','C','n'],
  I4:['m','v_ms','mu','C','n'], I5:['m','H','C','n'], I6:['m','v_ms','beta','mu','C','n'],
  I7:['J','omega','M_t','r','R','C','n'], I8:['J','omega','m','v_ms','M_t','r','R','C','n'],
  I9:['m','v_ms','F','r','R','C','n'], I10:['m','v_ms','F','C','n'],
};
const DEF = { H_M:2.5, n:2, C:20, temp_min:-10, temp_max:60 };

function fields() {
  const c = $('#caseId').value;
  const keys = [...(CASE_FIELDS[c] || ['m','v_ms','C','n']), 'temp_min','temp_max','max_stroke'];
  $('#dutyFields').innerHTML = keys.map(k => {
    const [lab, unit, hint] = F[k];
    const v = S['d_' + k] ?? DEF[k] ?? '';
    return `<div><label>${lab} <span class="muted">${unit}</span></label>
      <input id="d_${k}" data-k="${k}" type="number" step="any" value="${v}">
      ${hint ? `<div class="muted" style="margin-top:3px">${hint}</div>` : ''}</div>`;
  }).join('');
  $$('#dutyFields input').forEach(i => i.addEventListener('input', () => { S['d_' + i.dataset.k] = i.value; save(); }));
}

function duty() {
  const g = k => { const e = $('#d_' + k); return e && e.value !== '' ? Number(e.value) : undefined; };
  const d = { n: g('n') || 1, C: g('C') || 0, H_M: g('H_M') ?? 2.5,
              temp_min: g('temp_min') ?? -10, temp_max: g('temp_max') ?? 60 };
  for (const k of ['m','m2','F','mu','H','J','omega','M_t','r','R']) { const v = g(k); if (v !== undefined) d[k] = v; }
  if (g('v')  !== undefined) d.v  = g('v') / 60;     // m/min -> m/s
  if (g('v2') !== undefined) d.v2 = g('v2') / 60;
  if (g('v_ms') !== undefined) d.v = g('v_ms');
  if (g('P') !== undefined) d.P = g('P') * 1000;     // kW -> W
  if (g('beta') !== undefined) d.beta = g('beta') * Math.PI / 180;
  return d;
}

function step(n) {
  $$('.step').forEach(s => s.classList.toggle('on', s.dataset.s == n));
  $$('[data-p]').forEach(p => p.classList.toggle('hidden', p.dataset.p != n));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function boot() {
  META = await api('/api/meta');
  $('#standard').innerHTML = META.standards.map(s =>
    `<option value="${s.code}" ${s.code === 'IS3177' ? 'selected' : ''}>${s.name}</option>`).join('');
  $('#series').innerHTML = META.series.map(s => `<option value="${s.series}">${s.series} (${s.n})</option>`).join('');
  const mount = META.accessories.filter(a => a.kind === 'mounting');
  const caps  = META.accessories.filter(a => a.kind === 'cap');
  $('#rmount').innerHTML = '<option value="">—</option>' + mount.map(a => `<option>${a.name}</option>`).join('');
  $('#rcap').innerHTML   = '<option value="">—</option>' + caps.map(a => `<option>${a.name}</option>`).join('');
  setGroup('crane');
  for (const k of ['pname','pcust','pcontact','pref','pequip','pby','pemail','pphone','pgstin'])
    if (S[k]) $('#' + k).value = S[k];
  $$('.card input, .card textarea').forEach(i => i.addEventListener('input', () => { S[i.id] = i.value; save(); }));
  stdNote();
}
function setGroup(g) {
  GROUP = g;
  $('#tabCrane').classList.toggle('on', g === 'crane');
  $('#tabInd').classList.toggle('on', g === 'industrial');
  const cs = META.cases.filter(c => c.group === g);
  $('#caseId').innerHTML = cs.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
  $('#standard').value = g === 'crane' ? 'IS3177' : 'NONE';
  fields(); stdNote();
}
function stdNote() {
  const s = META.standards.find(x => x.code === $('#standard').value);
  $('#stdNote').innerHTML = `<b>${s.name}</b> — design speed ${(s.speed_factor * 100).toFixed(0)}% of rated`
    + (s.decel_limit ? `, deceleration limit ${s.decel_limit} m/s²` : ', no deceleration limit')
    + `.<br><span class="muted">${s.note}</span>`;
}

async function calculate() {
  const body = { duty: duty(), case_id: $('#caseId').value, standard: $('#standard').value,
    series: [...$('#series').selectedOptions].map(o => o.value), limit: 60 };
  const ms = $('#d_max_stroke'); if (ms && ms.value) body.max_stroke_mm = Number(ms.value);
  RESULT = await api('/api/select', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  const d = RESULT.duty_applied;
  $('#dutyOut').innerHTML = !d ? `<div class="note bad">Nothing in the catalogue satisfies this duty. Try a longer stroke, more buffers, or relax the standard.</div>` :
    `<div class="note ok"><b>${RESULT.count} models pass every check.</b>
      Design velocity <b>${d.v.toFixed(3)} m/s</b> · kinetic energy per buffer <b>${fmt(d.E_k)} Nm</b>
      <br><span class="muted">${RESULT.standard.name} · ${RESULT.case.title}.
      Total energy, energy per hour and effective mass depend on the stroke — a drive still pushing adds F&times;S —
      so they are shown per model in the table below.</span></div>`;
  $('#picks').innerHTML = RESULT.candidates.filter(c => c.picks.length)
    .map(c => `<span class="pill brand" style="margin-left:6px">${c.picks[0]}: ${c.model}</span>`).join('');
  const tb = $('#resTbl tbody');
  tb.innerHTML = RESULT.candidates.map((c, i) => `<tr data-i="${i}">
    <td><input type="radio" name="pick"></td><td><b>${c.model}</b>${c.picks.map(p=>` <span class="pill brand">${p}</span>`).join('')}</td>
    <td>${c.series}</td><td class="n">${fmt(c.stroke_mm)}</td><td class="n">${fmt(c.nm_per_cycle)}</td>
    <td class="n">${fmt(c.nm_per_hour)}</td><td class="n">${(c.u_stroke*100).toFixed(0)}%</td>
    <td class="n">${(c.u_hour*100).toFixed(0)}%</td><td class="n">${c.a.toFixed(2)}</td>
    <td class="n">${(c.F_s/1000).toFixed(1)}</td><td class="n">${fmt(c.m_e)}</td>
    <td>${c.flags.map(f=>`<span class="pill warn">${f}</span>`).join(' ') || '<span class="pill ok">clear</span>'}</td></tr>`).join('');
  tb.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => {
    tb.querySelectorAll('tr').forEach(x => x.classList.remove('sel'));
    tr.classList.add('sel'); tr.querySelector('input').checked = true;
    CHOSEN = RESULT.candidates[tr.dataset.i]; $('#toRfq').disabled = false;
  }));
  step(4);
}

async function sendRfq() {
  if (!CHOSEN) return;
  const cust = { name: $('#pcust').value || $('#pname').value || 'Enquiry', contact: $('#pcontact').value,
    email: $('#pemail').value, phone: $('#pphone').value, gstin: $('#pgstin').value };
  if (!cust.email || !cust.phone) { $('#rfqOut').innerHTML = `<div class="note bad">Email and phone are required so we can send the drawings and quotation.</div>`; return; }
  const proj = await api('/api/project', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name: $('#pname').value || 'Untitled', reference: $('#pref').value,
      equipment: $('#pequip').value, prepared_by: $('#pby').value }) });
  const sel = await api('/api/selection', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ project_id: proj.id, line: GROUP, case_id: RESULT.case.id,
      standard: RESULT.standard.code, inputs: duty(), results: { duty: RESULT.duty_applied, chosen: CHOSEN },
      chosen_bk: CHOSEN.bk }) });
  const r = await api('/api/rfq', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ customer: cust, project_id: proj.id, selection_id: sel.id,
      formats: [...$('#rfmt').selectedOptions].map(o => o.value), message: $('#rmsg').value,
      items: [{ bk: CHOSEN.bk, model: CHOSEN.model, qty: Number($('#rqty').value) || 1,
                mounting: $('#rmount').value, cap: $('#rcap').value }] }) });
  $('#rfqOut').innerHTML = `<div class="note ok"><b>Request ${r.number} received.</b>
    We will send the drawings and a quotation, usually within one working day.
    A copy of this calculation has been attached to your request.</div>`;
}

document.addEventListener('click', e => {
  const g = e.target.dataset && e.target.dataset.go;
  if (g) { if (g === '5') { $('#rfqLines').innerHTML = CHOSEN
      ? `<div class="note blue"><b>${CHOSEN.model}</b> — ${fmt(CHOSEN.stroke_mm)} mm stroke, ${fmt(CHOSEN.nm_per_cycle)} Nm/cycle</div>` : ''; }
    step(g); }
});
$$('.step').forEach(s => s.addEventListener('click', () => step(s.dataset.s)));
$('#tabCrane').onclick = () => setGroup('crane');
$('#tabInd').onclick   = () => setGroup('industrial');
$('#caseId').onchange  = fields;
$('#standard').onchange = stdNote;
$('#calc').onclick = () => calculate().catch(e => alert(e.message));
$('#toRfq').onclick = () => { $('#rfqLines').innerHTML = `<div class="note blue"><b>${CHOSEN.model}</b> — ${fmt(CHOSEN.stroke_mm)} mm stroke, ${fmt(CHOSEN.nm_per_cycle)} Nm/cycle</div>`; step(5); };
$('#sendRfq').onclick = () => sendRfq().catch(e => alert(e.message));
$('#printReport').onclick = () => window.print();
$('#loadExample').onclick = () => {
  Object.assign(S, { pname:'Bay 3 gantry — end stops', pcust:'Example Engineering Ltd.',
    pequip:'20 t EOT crane, 22 m span', d_m:20000, d_v:40, d_P:15, d_C:20, d_n:2 });
  save(); location.reload();
};
$('#pgstin').addEventListener('blur', async () => {
  const g = $('#pgstin').value.trim(); if (!g) { $('#gstinMsg').innerHTML = ''; return; }
  const v = await api('/api/gstin/' + encodeURIComponent(g));
  $('#gstinMsg').innerHTML = v.ok
    ? `<div class="note ok">Valid — ${v.state_name} (state code ${v.state_code}), PAN ${v.pan}</div>`
    : `<div class="note bad">Not a valid GSTIN: ${v.reason}.` +
      (v.suggestions && v.suggestions.length ? ` Did you mean <b>${v.suggestions[0]}</b>?` : '') + `</div>`;
});
boot().catch(e => document.body.insertAdjacentHTML('afterbegin', `<div class="note bad">${e.message}</div>`));
