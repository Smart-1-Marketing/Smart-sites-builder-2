function words(value="") { return new Set(String(value).toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(w=>w.length>2)); }
function overlap(a,b){ let n=0; for(const w of a) if(b.has(w)) n++; return n; }
export function scoreTemplates(templates, context={}) {
  const q=words([context.industry,context.businessType,context.title,context.siteName,context.metaDescription,(context.headings||[]).slice(0,20).join(" ")].filter(Boolean).join(" "));
  return templates.map(t=>{ const tw=words([t.name,t.primaryCategories,t.categories].join(" ")); let score=overlap(q,tw)*10; const lower=`${t.name} ${t.primaryCategories} ${t.categories}`.toLowerCase(); const source=[...q].join(" ");
    if(/restaurant|cafe|food|pizza|wing/.test(source)&&/restaurant|food|cafe|bar/.test(lower))score+=35;
    if(/camp|rv|resort|hotel|travel|tourism/.test(source)&&/travel|hotel|business|real estate|service/.test(lower))score+=25;
    if(/hvac|plumb|contractor|roof|electric/.test(source)&&/business|service|home/.test(lower))score+=25;
    if(/law|attorney|legal/.test(source)&&/legal|law|business|consult/.test(lower))score+=25;
    if(/auto|dealer|car|vehicle/.test(source)&&/auto|business|store/.test(lower))score+=25;
    if(!t.systemTemplate)score+=7; if(t.visible)score+=3; return {...t,score};
  }).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
}
