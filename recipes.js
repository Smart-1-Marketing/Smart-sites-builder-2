export function findRecipe(input={}) {
  const text = `${input.businessType||""} ${input.description||""}`.toLowerCase();
  if (/wing|wings/.test(text)) return {
    industry:"Restaurant", subcategory:"Wing Restaurant",
    pages:["Home","Menu","Order Online","Catering","About","Locations","Contact"],
    homepageBlocks:["hero","order_cta","featured_menu","specials","reviews","catering","location_hours","final_cta"]
  };
  if (/restaurant|pizza|bar|pub|cafe|food/.test(text)) return {
    industry:"Restaurant", subcategory:"Restaurant",
    pages:["Home","Menu","Order Online","About","Reviews","Locations","Contact"],
    homepageBlocks:["hero","primary_cta","menu_preview","specials","reviews","about","location_hours","final_cta"]
  };
  if (/hvac|heating|cooling/.test(text)) return {
    industry:"Home Services", subcategory:"HVAC",
    pages:["Home","Heating","Cooling","Maintenance","Financing","Reviews","Contact"],
    homepageBlocks:["hero","emergency_cta","services","trust","reviews","financing","service_area","faq","final_cta"]
  };
  if (/law|lawyer|attorney/.test(text)) return {
    industry:"Legal", subcategory:"Law Firm",
    pages:["Home","Practice Areas","Attorneys","Results","Reviews","FAQ","Contact"],
    homepageBlocks:["hero","consultation_cta","trust","practice_areas","results","reviews","attorneys","faq","final_cta"]
  };
  return {
    industry:"Business", subcategory:"Local Business",
    pages:["Home","Services","About","Reviews","FAQ","Contact"],
    homepageBlocks:["hero","primary_cta","services","trust","reviews","about","faq","final_cta"]
  };
}
