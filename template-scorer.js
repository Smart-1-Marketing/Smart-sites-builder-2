function words(v="") {
  return new Set(String(v).toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(Boolean));
}
function overlap(a,b){ let n=0; for(const w of a) if(b.has(w)) n++; return n; }

export function scoreTemplates(templates,input={}) {
  const q = words([input.businessType,input.description,input.primaryGoal,input.city].filter(Boolean).join(" "));
  return templates.map(t => {
    const tw = words([t.name,t.primaryCategories,t.categories].join(" "));
    let score = overlap(q,tw)*12;
    const lower = `${t.name} ${t.primaryCategories} ${t.categories}`.toLowerCase();
    const bt = String(input.businessType||"").toLowerCase();
    if (bt && lower.includes(bt)) score += 40;
    if (/wing|wings/.test(bt) && /restaurant|food|bar|grill|cafe/.test(lower)) score += 20;
    if (/pizza/.test(bt) && /restaurant|food|pizza/.test(lower)) score += 20;
    if (/hvac|heating|cooling/.test(bt) && /service|business|contractor|home/.test(lower)) score += 18;
    if (/law|lawyer|attorney/.test(bt) && /law|legal|business|consult/.test(lower)) score += 18;
    if (/dealer|automotive|car/.test(bt) && /auto|car|dealer|business/.test(lower)) score += 18;
    if (!t.systemTemplate) score += 8;
    if (t.visible) score += 3;
    return {...t,score};
  }).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
}
