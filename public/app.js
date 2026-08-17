const $=id=>document.getElementById(id);
let current=null, selected=null;

function key(){return `s1-template-history:${($("name").value||"anonymous").toLowerCase()}`}
function history(){try{return JSON.parse(localStorage.getItem(key())||"[]")}catch{return[]}}
function save(t,final=false){
  if(!t)return; const h=history(); const i=h.findIndex(x=>Number(x.id)===Number(t.id));
  if(final) h.forEach(x=>x.final=false);
  const item={id:Number(t.id),name:t.name,thumb:t.thumb,previewUrl:t.previewUrl,viewedAt:new Date().toISOString(),final};
  if(i>=0)h[i]={...h[i],...item}; else h.push(item);
  localStorage.setItem(key(),JSON.stringify(h.slice(-12)));
  renderHistory();
}
function renderHistory(){
  const el=$("hist"); if(!el)return; const h=history();
  el.innerHTML=h.length?h.map(x=>`<div class="hist ${x.final?"final":""}"><img src="${x.thumb||""}"><div><strong>${x.name}</strong><br>${x.final?"Final selection":"Viewed"}</div></div>`).join(""):`<p class="tiny">Templates you preview will appear here.</p>`;
}
function preview(t){save(t,false);$("mt").textContent=t.name;$("frame").src=t.previewUrl;$("modal").classList.remove("hidden")}
function choose(t){selected=Number(t.id);save(t,true);document.querySelectorAll(".template").forEach(el=>el.classList.toggle("selected",Number(el.dataset.id)===selected))}
$("close").onclick=()=>{$("modal").classList.add("hidden");$("frame").src="about:blank"}

$("f").onsubmit=async e=>{
  e.preventDefault(); $("out").innerHTML="<p class='lead'>Analyzing your live template catalog…</p>";
  const body={businessName:$("name").value,websiteUrl:$("url").value,businessType:$("type").value,city:$("city").value,primaryGoal:$("goal").value,description:$("desc").value};
  const r=await fetch("/api/site-plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json(); if(!r.ok){$("out").innerHTML=`<p>${d.error||"Error"}</p>`;return}
  current=d; selected=Number(d.plan.selected_template_id);
  const map=new Map((d.templates||[]).map(t=>[Number(t.id),t]));
  $("out").innerHTML=`
    <h2>${d.plan.business_name}</h2>
    <p class="lead">${d.plan.rationale}</p>
    <p><strong>Primary CTA:</strong> ${d.plan.primary_cta}</p>
    <p><strong>Pages:</strong> ${d.plan.pages.join(" · ")}</p>
    <h3>Best Matching Templates</h3>
    <div class="templates">
      ${(d.templates||[]).slice(0,6).map(t=>`<article class="template ${Number(t.id)===selected?"selected":""}" data-id="${t.id}">
        <img src="${t.thumb||""}" alt="${t.name}">
        <div class="tbody"><strong>${t.name}</strong><div class="tiny">${t.systemTemplate?"Simvoly template":"Smart 1 custom template"}</div>
        <div class="actions"><button class="secondary" data-prev="${t.id}">Preview</button><button class="primary" data-pick="${t.id}">${Number(t.id)===selected?"Selected":"Choose"}</button></div></div>
      </article>`).join("")}
    </div>
    <h3>Templates Reviewed</h3><div id="hist" class="history"></div>
    <button id="final" class="primary" style="margin-top:15px">Use Final Selection</button>`;
  renderHistory();
  document.querySelectorAll("[data-prev]").forEach(b=>b.onclick=()=>preview(map.get(Number(b.dataset.prev))));
  document.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{choose(map.get(Number(b.dataset.pick)));document.querySelectorAll("[data-pick]").forEach(x=>x.textContent=Number(x.dataset.pick)===selected?"Selected":"Choose")});
  $("final").onclick=()=>{const t=map.get(selected);save(t,true);alert(`Final template saved: ${t?.name||selected}`)}
};
