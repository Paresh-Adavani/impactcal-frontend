'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let KEY = localStorage.getItem('impactcal_key') || '';
const api = async (u,o={}) => {
  o.headers = Object.assign({'x-admin-key':KEY}, o.headers||{});
  const r = await fetch(u,o); const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||r.statusText); return j; };
const fmt=(n,d=0)=> n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let META=null, DIRTY=new Map();

/* ------------------------------- shell ---------------------------------- */
function view(v){ $$('[data-view]').forEach(s=>s.classList.toggle('hidden',s.dataset.view!==v));
  $$('header nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  ({rfq:loadRfqs,quotes:loadQuotes,price:loadPrice,cad:loadCad,settings:loadSettings}[v]||(()=>{}))(); }
$$('header nav button').forEach(b=>b.onclick=()=>view(b.dataset.v));
$('#akeySave').onclick=()=>{ KEY=$('#akey').value.trim(); localStorage.setItem('impactcal_key',KEY); start(); };

async function start(){
  try{ await api('/api/settings'); }catch(e){ $('#keyBar').classList.remove('hidden');
    $('#keyBar').insertAdjacentHTML('beforeend',`<div class="note bad">${e.message}</div>`); return; }
  $('#keyBar').classList.add('hidden');
  META = await (await fetch('/api/meta')).json();
  $('#fSeries').innerHTML='<option value="">All</option>'+META.series.map(s=>`<option>${s.series}</option>`).join('');
  view('rfq');
}

/* -------------------------------- RFQ ----------------------------------- */
async function loadRfqs(){
  const st=$('#rfqFilter').value;
  const rows=await api('/api/rfqs'+(st?'?status='+st:''));
  $('#rfqTbl tbody').innerHTML = rows.map(r=>`<tr>
    <td><b>${esc(r.number)}</b></td><td>${(r.created_at||'').slice(0,10)}</td><td>${esc(r.customer||'—')}</td>
    <td class="mono">${esc(r.gstin||'—')}</td><td>${esc(r.state_name||'—')}</td><td>${esc(r.project||'—')}</td>
    <td class="n">${r.items}</td><td>${esc(r.formats||'—')}</td>
    <td><span class="pill ${r.status==='new'?'brand':r.status==='closed'?'ok':''}">${r.status}</span></td>
    <td>${r.quote_number?esc(r.quote_number):'—'}</td>
    <td><button class="btn ghost sm" data-rfq="${r.id}">Open</button></td></tr>`).join('')
    || `<tr><td colspan="11" class="muted">No requests yet.</td></tr>`;
  $$('[data-rfq]').forEach(b=>b.onclick=()=>openRfq(b.dataset.rfq));
}
$('#rfqRefresh').onclick=loadRfqs; $('#rfqFilter').onchange=loadRfqs;

async function openRfq(id){
  const r=await api('/api/rfq/'+id);
  const sel=r.selection?JSON.parse(r.selection.results||'{}'):null;
  const cad=await api('/api/cad'+(r.items[0]&&r.items[0].bk?'?bk='+encodeURIComponent(r.items[0].bk):''));
  $('#rfqDetail').innerHTML=`<div class="card">
    <div class="spread"><h3>${esc(r.number)} <span class="pill">${r.status}</span></h3>
      <div class="row">
        <button class="btn" id="mkQuote">Prepare quotation</button>
        <select id="rfqStatus">${['new','quoted','cad_pending','closed','lost'].map(s=>`<option ${s===r.status?'selected':''}>${s}</option>`).join('')}</select>
      </div></div>
    <div class="grid" style="margin-top:12px">
      <div><label>Customer</label><input readonly value="${esc(r.customer?.name||'')}"></div>
      <div><label>Contact</label><input readonly value="${esc([r.customer?.contact,r.customer?.email,r.customer?.phone].filter(Boolean).join(' · '))}"></div>
      <div><label>GSTIN</label><input readonly value="${esc(r.customer?.gstin||'not given')}"></div>
      <div><label>Place of supply</label><input readonly value="${esc(r.customer?.state_name||'—')}"></div>
    </div>
    ${r.message?`<div class="note blue"><b>Message</b><br>${esc(r.message)}</div>`:''}
    ${sel?`<div class="note ok"><b>Their calculation</b> — ${esc(r.selection.case_id)} under ${esc(r.selection.standard)}:
      design velocity ${sel.duty?.v?.toFixed(3)} m/s · ${fmt(sel.duty?.E_t)} Nm per impact · ${fmt(sel.duty?.E_tc)} Nm/h
      · effective mass ${fmt(sel.duty?.m_e)} kg · selected <b>${esc(sel.chosen?.model)}</b>
      at ${(sel.chosen?.u_stroke*100).toFixed(0)}% of rated energy, ${sel.chosen?.a.toFixed(2)} m/s² deceleration</div>`:''}
    <div class="tw"><table><thead><tr><th>Model</th><th class="n">Qty</th><th>Mounting</th><th>Rod end</th></tr></thead>
      <tbody>${r.items.map(i=>`<tr><td><b>${esc(i.model)}</b></td><td class="n">${i.qty}</td>
        <td>${esc(i.mounting||'—')}</td><td>${esc(i.cap||'—')}</td></tr>`).join('')}</tbody></table></div>
    <h4 style="margin-top:18px">Release CAD — requested: ${esc(r.formats||'none')}</h4>
    <p class="hint">Nothing has been sent. Tick the files to release and the customer gets expiring links.</p>
    <div class="tw" style="max-height:220px"><table><thead><tr><th></th><th>File</th><th>Model</th><th>Mounting</th><th>Format</th></tr></thead>
      <tbody>${cad.length?cad.map(a=>`<tr><td><input type="checkbox" class="cadPick" value="${a.id}"></td>
        <td>${esc(a.filename)}</td><td>${esc(a.model||'')}</td><td>${esc(a.mounting||'')}</td><td>${a.fmt}</td></tr>`).join('')
        :`<tr><td colspan="5" class="muted">No CAD on file for this model — upload it in the CAD library first.</td></tr>`}</tbody></table></div>
    <div class="row" style="margin-top:12px"><button class="btn blue" id="relCad">Release ticked files</button>
      <div><label>Link expiry (days)</label><input id="relDays" type="number" value="30" style="width:110px"></div></div>
    <div id="relOut"></div></div>`;
  $('#rfqStatus').onchange=async e=>{ await api('/api/rfq/'+id,{method:'PATCH',
    headers:{'content-type':'application/json'},body:JSON.stringify({status:e.target.value})}); loadRfqs(); };
  $('#mkQuote').onclick=async()=>{ const q=await api('/api/rfq/'+id+'/quote',{method:'POST',
    headers:{'content-type':'application/json'},body:'{}'}); view('quotes'); openQuote(q.id); };
  $('#relCad').onclick=async()=>{
    const ids=$$('.cadPick:checked').map(c=>Number(c.value));
    if(!ids.length){ $('#relOut').innerHTML=`<div class="note bad">Tick at least one file.</div>`; return; }
    const out=await api('/api/rfq/'+id+'/release-cad',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({asset_ids:ids,expiry_days:Number($('#relDays').value)||30})});
    $('#relOut').innerHTML=`<div class="note ok"><b>Released.</b> Send these links:<br>`+
      out.links.map(l=>`<code>${location.origin}${l.url}</code> — ${esc(l.filename)}`).join('<br>')+`</div>`;
    loadRfqs(); };
}

/* ----------------------------- quotations -------------------------------- */
async function loadQuotes(){
  const rows=await api('/api/quotations');
  $('#qTbl tbody').innerHTML=rows.map(q=>`<tr><td><b>${esc(q.number)}</b></td><td class="n">${q.rev}</td>
    <td>${q.date}</td><td>${esc(q.customer||'—')}</td><td>${q.supply_type||'—'}</td>
    <td class="n">${fmt(q.grand_total,2)}</td><td><span class="pill">${q.status}</span></td>
    <td><button class="btn ghost sm" data-q="${q.id}">Open</button></td></tr>`).join('')
    || `<tr><td colspan="8" class="muted">No quotations yet — open an RFQ and press “Prepare quotation”.</td></tr>`;
  $$('[data-q]').forEach(b=>b.onclick=()=>openQuote(b.dataset.q));
}
$('#qRefresh').onclick=loadQuotes;

function itemRows(items){
  return items.map((i,n)=>`<tr data-n="${n}">
    <td class="n">${n+1}</td>
    <td><input value="${esc(i.description)}" data-f="description" style="min-width:260px"></td>
    <td><input value="${esc(i.hsn)}" data-f="hsn" class="mono" style="width:100px"></td>
    <td><input value="${esc(i.uom)}" data-f="uom" style="width:70px"></td>
    <td><input type="number" step="any" value="${i.qty}" data-f="qty" style="width:80px"></td>
    <td><input type="number" step="any" value="${i.rate}" data-f="rate" style="width:110px"></td>
    <td><input type="number" step="any" value="${i.discount_pct}" data-f="discount_pct" style="width:70px"></td>
    <td><input type="number" step="any" value="${i.gst_rate}" data-f="gst_rate" style="width:70px"></td>
    <td><button class="btn ghost sm" data-del="${n}">×</button></td></tr>`).join('');
}

async function openQuote(id){
  const q=await api('/api/quotation/'+id);
  const c=q.company, t=q.tax, cu=q.customer||{};
  const d=Number(q.hsn_digits||8), hs=h=>String(h||'').slice(0,d);
  const taxCols = q.supply_type==='intra'
    ? `<th class="n">CGST</th><th class="n">SGST</th>` : q.supply_type==='inter' ? `<th class="n">IGST</th>` : '';
  $('#quoteEditor').innerHTML=`
  <div class="card noprint">
    <div class="spread"><h3>${esc(q.number)} rev ${q.rev}</h3>
      <div class="row">
        <select id="qPos">${Object.entries(META.states).map(([k,v])=>`<option value="${k}" ${k===q.place_of_supply_code?'selected':''}>${k} — ${v}</option>`).join('')}</select>
        <span class="pill ${q.supply_type==='intra'?'ok':'brand'}">${q.supply_type==='intra'?'CGST + SGST':q.supply_type==='inter'?'IGST':'Export — zero rated'}</span>
        <button class="btn ghost sm" id="qAdd">Add line</button>
        <button class="btn sm" id="qSave">Save</button>
        <button class="btn ghost sm" id="qRev">New revision</button>
        <button class="btn blue sm" id="qPrint">Print / PDF</button>
      </div></div>
    <div class="tw" style="margin-top:12px"><table id="qItems"><thead><tr><th class="n">#</th><th>Description</th>
      <th>HSN</th><th>UOM</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Disc %</th><th class="n">GST %</th><th></th></tr></thead>
      <tbody>${itemRows(q.items)}</tbody></table></div>
    <div class="grid" style="margin-top:12px">
      <div><label>Freight ₹</label><input id="qFreight" type="number" step="any" value="${q.freight}"></div>
      <div><label>Freight SAC</label><input id="qFreightHsn" class="mono" value="${esc(q.freight_hsn||'996511')}"></div>
      <div><label>Packing ₹</label><input id="qPacking" type="number" step="any" value="${q.packing}"></div>
      <div><label>Valid (days)</label><input id="qValid" type="number" value="${q.valid_days}"></div>
      <div><label>Status</label><select id="qStatus">${['draft','sent','accepted','lost'].map(s=>`<option ${s===q.status?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="grid" style="margin-top:12px">
      <div><label>Payment</label><textarea id="tPay" rows="2">${esc(q.terms_payment||'')}</textarea></div>
      <div><label>Delivery</label><textarea id="tDel" rows="2">${esc(q.terms_delivery||'')}</textarea></div>
      <div><label>Warranty</label><textarea id="tWar" rows="2">${esc(q.terms_warranty||'')}</textarea></div>
      <div><label>Other</label><textarea id="tOth" rows="2">${esc(q.terms_other||'')}</textarea></div>
    </div>
  </div>

  <div class="card" id="qPaper">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid var(--brand);padding-bottom:10px">
      <div><div style="font-size:22px;font-weight:700;color:var(--navy)">${esc(c.name)}</div>
        <div class="muted">${esc(c.addr1)}, ${esc(c.addr2)}<br>${esc(c.city)} ${esc(c.pincode)} · ${esc(c.state_name)}, India<br>
        Works: ${esc(c.works)}<br>${esc(c.tel)} · ${esc(c.phone)} · ${esc(c.email)}</div></div>
      <div style="text-align:right"><div style="font-size:17px;font-weight:600">QUOTATION</div>
        <div class="mono">${esc(q.number)}${q.rev?` rev ${q.rev}`:''}</div>
        <div class="muted">Date ${q.date}<br>Valid ${q.valid_days} days<br>
          <b>GSTIN ${esc(c.gstin)}</b></div></div></div>
    <div style="display:flex;gap:30px;margin:14px 0;flex-wrap:wrap">
      <div style="flex:1 1 300px"><div class="muted">To</div><b>${esc(cu.name||'—')}</b><br>
        ${esc([cu.addr_line1,cu.addr_line2,cu.city,cu.pincode].filter(Boolean).join(', ')||'')}<br>
        ${cu.gstin?`GSTIN <span class="mono">${esc(cu.gstin)}</span><br>`:''}
        ${esc([cu.contact,cu.email,cu.phone].filter(Boolean).join(' · '))}</div>
      <div style="flex:0 1 250px"><div class="muted">Place of supply</div><b>${esc(q.place_of_supply_code)} — ${esc(q.place_of_supply_name)}</b>
        <div class="muted" style="margin-top:6px">Project</div>${esc(q.project?.name||'—')}
        ${q.project?.reference?`<br><span class="muted">Ref ${esc(q.project.reference)}</span>`:''}</div>
    </div>
    <div class="tw"><table><thead><tr><th class="n">#</th><th>Description</th><th>HSN/SAC</th><th>UOM</th>
      <th class="n">Qty</th><th class="n">Rate</th><th class="n">Disc</th><th class="n">Taxable</th>
      ${taxCols}<th class="n">Amount</th></tr></thead><tbody>
      ${t.rows.map((r,n)=>`<tr><td class="n">${n+1}</td><td style="white-space:normal">${esc(r.description)}</td>
        <td class="mono">${hs(r.hsn)}</td><td>${esc(r.uom)}</td><td class="n">${fmt(r.qty,0)}</td>
        <td class="n">${fmt(r.rate,2)}</td><td class="n">${r.discount?fmt(r.discount,2):'—'}</td>
        <td class="n">${fmt(r.taxable,2)}</td>
        ${q.supply_type==='intra'?`<td class="n">${fmt(r.cgst,2)}</td><td class="n">${fmt(r.sgst,2)}</td>`:''}
        ${q.supply_type==='inter'?`<td class="n">${fmt(r.igst,2)}</td>`:''}
        <td class="n"><b>${fmt(r.total,2)}</b></td></tr>`).join('')}
      </tbody></table></div>
    <div style="display:flex;justify-content:space-between;gap:24px;margin-top:14px;flex-wrap:wrap">
      <div style="flex:1 1 320px">
        <div class="muted" style="margin-bottom:4px">HSN summary</div>
        <table style="font-size:12px"><thead><tr><th>HSN</th><th class="n">Taxable</th><th class="n">Rate</th><th class="n">Tax</th></tr></thead>
          <tbody>${t.hsn_summary.map(h=>`<tr><td class="mono">${hs(h.hsn)}</td><td class="n">${fmt(h.taxable,2)}</td>
            <td class="n">${h.gst_rate}%</td><td class="n">${fmt(h.cgst+h.sgst+h.igst,2)}</td></tr>`).join('')}</tbody></table>
      </div>
      <div style="flex:0 1 300px">
        <table style="font-size:13px"><tbody>
          <tr><td>Taxable value</td><td class="n">${fmt(t.taxable,2)}</td></tr>
          ${q.supply_type==='intra'?`<tr><td>CGST</td><td class="n">${fmt(t.cgst,2)}</td></tr><tr><td>SGST</td><td class="n">${fmt(t.sgst,2)}</td></tr>`:''}
          ${q.supply_type==='inter'?`<tr><td>IGST</td><td class="n">${fmt(t.igst,2)}</td></tr>`:''}
          ${q.supply_type==='export'?`<tr><td colspan="2" class="muted">Export — zero rated, supply under LUT without payment of IGST</td></tr>`:''}
          <tr><td>Rounding</td><td class="n">${fmt(t.round_off,2)}</td></tr>
          <tr style="font-weight:700;font-size:15px"><td>Grand total ₹</td><td class="n">${fmt(t.grand_total,2)}</td></tr>
        </tbody></table>
      </div></div>
    <div class="note" style="margin-top:10px"><b>${esc(q.amount_in_words)}</b></div>
    <div style="margin-top:12px;font-size:12.5px">
      <b>Payment</b> ${esc(q.terms_payment||'')}<br>
      <b>Delivery</b> ${esc(q.terms_delivery||'')}<br>
      <b>Warranty</b> ${esc(q.terms_warranty||'')}<br>
      ${(q.terms_other||'').split('\n').filter(Boolean).map(l=>esc(l)).join('<br>')}
    </div>
    <div style="margin-top:24px;display:flex;justify-content:space-between">
      <div class="muted">E &amp; O E. This is a quotation, not a tax invoice.</div>
      <div style="text-align:right">For ${esc(c.name)}<br><br><br>Authorised signatory</div></div>
  </div>`;

  const collect=()=>$$('#qItems tbody tr').map(tr=>{ const o={kind:'product'};
    tr.querySelectorAll('[data-f]').forEach(i=>o[i.dataset.f]=i.value); return o; });
  $('#qAdd').onclick=()=>{ const items=collect();
    items.push({description:'',hsn:'84798999',uom:'NOS',qty:1,rate:0,discount_pct:0,gst_rate:18});
    $('#qItems tbody').innerHTML=itemRows(items); bindDel(); };
  const bindDel=()=>$$('[data-del]').forEach(b=>b.onclick=()=>{ const items=collect();
    items.splice(Number(b.dataset.del),1); $('#qItems tbody').innerHTML=itemRows(items); bindDel(); });
  bindDel();
  $('#qSave').onclick=async()=>{
    await api('/api/quotation/'+id,{method:'PATCH',headers:{'content-type':'application/json'},
      body:JSON.stringify({freight:Number($('#qFreight').value)||0, freight_hsn:$('#qFreightHsn').value,
        packing:Number($('#qPacking').value)||0, valid_days:Number($('#qValid').value)||30,
        status:$('#qStatus').value, place_of_supply_code:$('#qPos').value,
        terms_payment:$('#tPay').value, terms_delivery:$('#tDel').value,
        terms_warranty:$('#tWar').value, terms_other:$('#tOth').value})});
    await api('/api/quotation/'+id+'/items',{method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({items:collect()})});
    openQuote(id); loadQuotes(); };
  $('#qRev').onclick=async()=>{ const n=await api('/api/quotation/'+id+'/revise',{method:'POST'}); openQuote(n.id); loadQuotes(); };
  $('#qPrint').onclick=()=>window.print();
  $('#qPos').onchange=()=>$('#qSave').click();
}

/* ------------------------------ pricelist -------------------------------- */
const PCOLS=[['model','model'],['series',null],['stroke_mm',null],['nm_per_cycle',null],['nm_per_hour',null],
  ['hsn','hsn'],['gst_rate','gst_rate'],['uom','uom'],['list_price','list_price'],
  ['lead_time_days','lead_time_days'],['status','status'],['note','note']];
async function loadPrice(){
  const qs=new URLSearchParams(); if($('#fSeries').value)qs.set('series',$('#fSeries').value);
  if($('#fQ').value)qs.set('q',$('#fQ').value);
  const rows=await api('/api/products?'+qs);
  DIRTY.clear(); $('#savePrice').disabled=true;
  $('#priceTbl tbody').innerHTML=rows.map(p=>`<tr data-bk="${esc(p.bk)}">`+PCOLS.map(([f,edit],ci)=>{
    const v=p[f]??''; const numeric=['stroke_mm','nm_per_cycle','nm_per_hour','gst_rate','list_price','lead_time_days'].includes(f);
    return `<td class="${numeric?'n':''}" data-f="${f}" data-c="${ci}" ${edit?'contenteditable="true"':''}>${
      numeric&&v!==''?fmt(v, f==='list_price'?2:0):esc(v)}</td>`;}).join('')+'</tr>').join('');
  bindGrid();
  const acc=META? null:null;
  const accs=await (await fetch('/api/meta')).json();
  $('#accTbl tbody').innerHTML=accs.accessories.map(a=>`<tr data-code="${esc(a.code)}">
    <td class="mono">${esc(a.code)}</td><td>${esc(a.name)}</td><td>${esc(a.kind)}</td>
    <td class="mono">${esc(a.hsn)}</td><td class="n">${a.gst_rate}</td>
    <td class="n">${a.list_price==null?'—':fmt(a.list_price,2)}</td><td>${esc(a.status)}</td></tr>`).join('');
  $('#bkList').innerHTML=rows.map(p=>`<option value="${esc(p.bk)}">${esc(p.model)}</option>`).join('');
}
function bindGrid(){
  const tb=$('#priceTbl tbody');
  tb.querySelectorAll('td[contenteditable]').forEach(td=>{
    td.addEventListener('input',()=>mark(td));
    td.addEventListener('paste',ev=>{
      const text=(ev.clipboardData||window.clipboardData).getData('text');
      if(!text.includes('\t')&&!text.includes('\n')) return;      // single cell: let it through
      ev.preventDefault();
      const grid=text.replace(/\r/g,'').split('\n').filter(l=>l.length).map(l=>l.split('\t'));
      const tr0=td.parentElement, c0=Number(td.dataset.c);
      let tr=tr0;
      for(const line of grid){
        if(!tr) break;
        line.forEach((val,j)=>{ const cell=tr.querySelector(`td[data-c="${c0+j}"]`);
          if(cell&&cell.isContentEditable){ cell.textContent=val.trim(); mark(cell); } });
        tr=tr.nextElementSibling;
      }
    });
  });
}
function mark(td){
  td.classList.add('dirty');
  const tr=td.parentElement, bk=tr.dataset.bk;
  const o=DIRTY.get(bk)||{bk}; let v=td.textContent.trim().replace(/,/g,'');
  o[td.dataset.f]=v; DIRTY.set(bk,o); $('#savePrice').disabled=DIRTY.size===0;
  $('#savePrice').textContent=`Save ${DIRTY.size} changed row${DIRTY.size===1?'':'s'}`;
}
$('#fGo').onclick=loadPrice;
$('#savePrice').onclick=async()=>{
  const out=await api('/api/products/bulk',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({rows:[...DIRTY.values()]})});
  $('#priceMsg').innerHTML=`<div class="note ok">${out.updated} rows saved.</div>`;
  loadPrice();
};
$('#dlXlsx').onclick=e=>{ e.preventDefault(); window.location='/api/pricelist.xlsx?key='+encodeURIComponent(KEY); };
$('#upXlsx').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  const fd=new FormData(); fd.append('file',f);
  const r=await fetch('/api/pricelist/import',{method:'POST',headers:{'x-admin-key':KEY},body:fd});
  const j=await r.json();
  $('#priceMsg').innerHTML=`<div class="note ${j.error?'bad':'ok'}">`+
    (j.error?esc(j.error):`Updated <b>${j.products}</b> products and <b>${j.accessories}</b> accessories.`+
     (j.skipped?.length?`<br>Skipped unknown keys: ${j.skipped.slice(0,10).map(esc).join(', ')}${j.skipped.length>10?' …':''}`:'')+
     (j.warnings?.length?`<br><b>Warnings:</b><br>${j.warnings.slice(0,10).map(esc).join('<br>')}`:''))+`</div>`;
  e.target.value=''; loadPrice();
};

/* --------------------------------- CAD ----------------------------------- */
async function loadCad(){
  const rows=await api('/api/cad');
  $('#cadTbl tbody').innerHTML=rows.map(a=>`<tr><td>${esc(a.filename)}</td><td>${esc(a.model||'')}</td>
    <td>${esc(a.mounting||'')}</td><td>${a.fmt}</td><td class="n">${fmt((a.bytes||0)/1024)} kB</td>
    <td>${(a.uploaded_at||'').slice(0,16)}</td></tr>`).join('')||`<tr><td colspan="6" class="muted">Nothing uploaded yet.</td></tr>`;
}
$('#cadUp').onclick=async()=>{
  const fs=$('#cadFiles').files; if(!fs.length) return;
  const fd=new FormData();
  [...fs].forEach(f=>fd.append('files',f));
  fd.append('bk',$('#cadBk').value); fd.append('mounting',$('#cadMount').value); fd.append('rev',$('#cadRev').value);
  const r=await fetch('/api/cad',{method:'POST',headers:{'x-admin-key':KEY},body:fd});
  const j=await r.json();
  $('#cadMsg').innerHTML=`<div class="note ${j.error?'bad':'ok'}">${j.error?esc(j.error):`${j.uploaded.length} file(s) uploaded.`}</div>`;
  $('#cadFiles').value=''; loadCad();
};

/* ------------------------------ settings --------------------------------- */
const SET_LABEL={'company.name':'Company name','company.gstin':'GSTIN','company.state_code':'State code',
 'company.state_name':'State','company.addr1':'Address line 1','company.addr2':'Address line 2',
 'company.city':'City','company.pincode':'PIN','company.works':'Works address','company.phone':'Mobile',
 'company.tel':'Telephone','company.email':'Email','company.web':'Website','invoice.hsn_digits':'HSN digits on documents',
 'quote.valid_days':'Quotation validity (days)','quote.prefix':'Quotation prefix','rfq.prefix':'RFQ prefix',
 'engine.eta_hydraulic':'Damping efficiency — hydraulic','engine.eta_spring':'Damping efficiency — spring',
 'engine.eta_pu':'Damping efficiency — polyurethane','engine.util_min':'Utilisation floor','engine.util_max':'Utilisation ceiling'};
async function loadSettings(){
  const s=await api('/api/settings');
  $('#setForm').innerHTML=Object.entries(SET_LABEL).map(([k,l])=>
    `<div><label>${l}</label><input data-k="${k}" value="${esc(s[k]??'')}"></div>`).join('')
    +['quote.terms_payment','quote.terms_delivery','quote.terms_warranty','quote.terms_other'].map(k=>
    `<div style="grid-column:1/-1"><label>${k.split('.')[1].replace('terms_','Terms — ')}</label>
      <textarea data-k="${k}" rows="2">${esc(s[k]??'')}</textarea></div>`).join('');
  const a=await api('/api/audit');
  $('#auditTbl tbody').innerHTML=a.map(x=>`<tr><td>${x.at}</td><td>${esc(x.who)}</td><td>${esc(x.what)}</td>
    <td>${esc(x.ref)}</td><td style="white-space:normal">${esc((x.detail||'').slice(0,120))}</td></tr>`).join('');
}
$('#setSave').onclick=async()=>{
  const body={}; $$('#setForm [data-k]').forEach(i=>body[i.dataset.k]=i.value);
  await api('/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  $('#setMsg').innerHTML=`<div class="note ok">Saved.</div>`;
};

if(KEY){ $('#akey').value=KEY; start(); } else $('#keyBar').classList.remove('hidden');

