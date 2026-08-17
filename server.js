import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import {findRecipe} from "./recipes.js";
import {getSimvolyConfig,listWebsiteTemplates,createWebsite} from "./simvoly-client.js";
import {scoreTemplates} from "./template-scorer.js";

const app = express();
app.use(express.json({limit:"1mb"}));
app.use(express.static("public"));

const ai = process.env.OPENAI_API_KEY ? new OpenAI({apiKey:process.env.OPENAI_API_KEY}) : null;

const schema = {
  type:"object", additionalProperties:false,
  properties:{
    business_name:{type:"string"}, industry:{type:"string"}, subcategory:{type:"string"},
    primary_goal:{type:"string"}, navigation:{type:"string"},
    pages:{type:"array",items:{type:"string"}},
    homepage_blocks:{type:"array",items:{type:"string"}},
    primary_cta:{type:"string"}, hero_headline:{type:"string"}, hero_subheadline:{type:"string"},
    rationale:{type:"string"},
    selected_template_id:{type:"integer"},
    alternative_template_ids:{type:"array",items:{type:"integer"},maxItems:4}
  },
  required:["business_name","industry","subcategory","primary_goal","navigation","pages","homepage_blocks",
            "primary_cta","hero_headline","hero_subheadline","rationale","selected_template_id","alternative_template_ids"]
};

function fallback(input,recipe,ranked){
  const goal=input.primaryGoal||"lead";
  const cta={call:"Call Now",appointment:"Book an Appointment",online_order:"Order Online",reservation:"Make a Reservation",
             quote:"Request a Quote",visit:"Get Directions",inventory:"View Inventory",consultation:"Get a Free Consultation",lead:"Contact Us"}[goal]||"Get Started";
  return {
    business_name:input.businessName||"Your Business",
    industry:recipe.industry, subcategory:recipe.subcategory, primary_goal:goal, navigation:"top",
    pages:recipe.pages, homepage_blocks:recipe.homepageBlocks, primary_cta:cta,
    hero_headline:input.city ? `${input.businessName||"Your Business"} in ${input.city}` : (input.businessName||"Your Business"),
    hero_subheadline:input.description||`Welcome to ${input.businessName||"our business"}.`,
    rationale:"Matched against the live Smart 1 / Simvoly template catalog.",
    selected_template_id:ranked[0]?.id||0,
    alternative_template_ids:ranked.slice(1,5).map(t=>t.id)
  };
}

app.get("/api/health",(req,res)=>{
  const s=getSimvolyConfig();
  res.json({ok:true,aiConfigured:!!ai,simvolyConfigured:!!(s.domain&&s.clientKey),simvolyDomain:s.domain||null});
});

app.get("/api/templates",async(req,res)=>{
  try {
    const templates=await listWebsiteTemplates({visibleOnly:req.query.all!=="1"});
    res.json({count:templates.length,templates});
  } catch(e) {
    res.status(e.code==="SIMVOLY_NOT_CONFIGURED"?503:502).json({error:e.message,details:e.details||null});
  }
});

app.post("/api/site-plan",async(req,res)=>{
  const input=req.body||{};
  const recipe=findRecipe(input);
  let templates=[];
  try { templates=await listWebsiteTemplates({visibleOnly:true}); } catch(e){ console.warn(e.message); }
  const ranked=scoreTemplates(templates,input);
  const candidates=ranked.slice(0,12);

  if(!ai){
    const plan=fallback(input,recipe,ranked);
    return res.json({mode:"rules",plan,templates:candidates,
      selectedTemplate:templates.find(t=>t.id===plan.selected_template_id)||null});
  }

  try{
    const response=await ai.responses.create({
      model:process.env.OPENAI_MODEL||"gpt-5.6",
      instructions:`You are the Smart 1 AI Website Planner.
Choose ONLY from the live template candidates below.
selected_template_id must exactly match one candidate id.
Prefer relevant Smart 1 custom templates when comparable.
Build for mobile conversion. Do not invent business claims.
Recipe:
${JSON.stringify(recipe,null,2)}
Live template candidates:
${JSON.stringify(candidates,null,2)}`,
      input:JSON.stringify(input,null,2),
      text:{format:{type:"json_schema",name:"smart1_site_plan",strict:true,schema}}
    });
    const plan=JSON.parse(response.output_text);
    const allowed=new Set(candidates.map(t=>t.id));
    if(!allowed.has(plan.selected_template_id)) plan.selected_template_id=candidates[0]?.id||0;
    plan.alternative_template_ids=(plan.alternative_template_ids||[]).filter(id=>allowed.has(id)&&id!==plan.selected_template_id).slice(0,4);
    res.json({mode:"ai",plan,templates:candidates,
      selectedTemplate:templates.find(t=>t.id===plan.selected_template_id)||null});
  }catch(e){
    console.error(e);
    const plan=fallback(input,recipe,ranked);
    res.json({mode:"rules-fallback",plan,templates:candidates,
      selectedTemplate:templates.find(t=>t.id===plan.selected_template_id)||null});
  }
});

app.post("/api/simvoly/create-site",async(req,res)=>{
  try { res.json(await createWebsite(req.body||{})); }
  catch(e){ res.status(e.code==="SIMVOLY_NOT_CONFIGURED"?503:502).json({error:e.message,details:e.details||null}); }
});

app.listen(process.env.PORT||3000,()=>console.log("Smart 1 Sites Creator started"));
