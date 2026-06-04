import { useState, useEffect, useCallback } from "react";

// ─── SM-2 Spaced Repetition Algorithm ───────────────────────────────────────
function sm2(card, quality) {
  let { interval, repetitions, easeFactor } = card;
  const qScaled = [0, 2, 4, 5][quality];
  if (qScaled < 3) { repetitions = 0; interval = 1; }
  else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - qScaled) * (0.08 + (5 - qScaled) * 0.02));
  const nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { interval, repetitions, easeFactor, nextReview, lastQuality: quality };
}

function isDue(card) { return !card.nextReview || Date.now() >= card.nextReview; }

// ─── Storage (works in Claude sandbox AND standalone/Vercel) ─────────────────
const STORAGE_KEY = "afp-srq-cards";
const API_KEY_STORAGE = "afp-srq-apikey";

async function loadCards() {
  try {
    if (typeof window !== "undefined" && window.storage?.get) {
      const r = await window.storage.get(STORAGE_KEY);
      return r ? JSON.parse(r.value) : [];
    }
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}
async function saveCards(cards) {
  try {
    if (typeof window !== "undefined" && window.storage?.set) {
      await window.storage.set(STORAGE_KEY, JSON.stringify(cards));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    }
  } catch (e) { console.error("Save failed", e); }
}
function loadApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch { return ""; }
}
function saveApiKey(key) {
  try { localStorage.setItem(API_KEY_STORAGE, key); } catch {} }

// ─── Constants ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "diagnosis", label: "Diagnosis", icon: "🔬", color: "#3B82F6" },
  { id: "treatment", label: "Treatment", icon: "💊", color: "#10B981" },
  { id: "labs", label: "Labs / Imaging", icon: "🧪", color: "#F59E0B" },
  { id: "monitoring", label: "Monitoring", icon: "📊", color: "#8B5CF6" },
  { id: "side_effects", label: "Side Effects", icon: "⚠️", color: "#EF4444" },
  { id: "duration", label: "Duration", icon: "⏱️", color: "#06B6D4" },
  { id: "definition", label: "Definition", icon: "📖", color: "#EC4899" },
];

const QUALITY_BTNS = [
  { label: "Again", sub: "< 1 day", q: 0, color: "#EF4444", key: "1" },
  { label: "Hard", sub: "~1 day", q: 1, color: "#F97316", key: "2" },
  { label: "Good", sub: "few days", q: 2, color: "#10B981", key: "3" },
  { label: "Easy", sub: "1+ week", q: 3, color: "#3B82F6", key: "4" },
];

// ─── Hardcoded AFP seed cards (May 2026 issue) ───────────────────────────────
const SEED_CARDS = [
  // ── BOTULINUM TOXIN ──────────────────────────────────────────────────────────
  {sid:"bt-01",articleTitle:"Botulinum Toxin Procedures",question:"Which cellular target does botulinum toxin cleave to inhibit acetylcholine release?",options:["A. VAMP-2 (synaptobrevin)","B. SNAP-25","C. Syntaxin-1","D. Munc-18"],correctIndex:1,explanation:"Botulinum toxin cleaves SNAP-25 (synaptosomal-associated protein of 25 kDa) on neuronal membranes, preventing vesicle fusion and acetylcholine release at the neuromuscular junction.",category:"definition"},
  {sid:"bt-02",articleTitle:"Botulinum Toxin Procedures",question:"How long does it typically take for botulinum toxin clinical effects to fully develop after injection?",options:["A. 24 hours","B. 3–5 days","C. 2 weeks","D. 4–6 weeks"],correctIndex:2,explanation:"Clinical effects of botulinum toxin typically take 2 weeks to fully develop. Partial reduction in function of targeted glabellar complex muscles typically occurs by the third day.",category:"treatment"},
  {sid:"bt-03",articleTitle:"Botulinum Toxin Procedures",question:"How long do botulinum toxin clinical effects generally last?",options:["A. 1–2 months","B. 3–4 months","C. 6–8 months","D. 12 months"],correctIndex:1,explanation:"Botulinum toxin effects typically last approximately 3 to 4 months, though with repeated treatments some patients can extend intervals beyond this.",category:"duration"},
  {sid:"bt-04",articleTitle:"Botulinum Toxin Procedures",question:"Which of the following is a contraindication to botulinum toxin injection?",options:["A. Static wrinkles","B. Age over 65","C. Myasthenia gravis","D. History of migraines"],correctIndex:2,explanation:"Neuromuscular disorders such as myasthenia gravis, ALS, and Lambert-Eaton syndrome are contraindications to botulinum toxin injection because these patients have impaired neuromuscular signaling.",category:"treatment"},
  {sid:"bt-05",articleTitle:"Botulinum Toxin Procedures",question:"For glabellar line treatment, botulinum toxin is injected at how many sites using what needle gauge?",options:["A. 3 sites, 25-gauge","B. 4 sites, 27-gauge","C. 5 sites, 30-gauge","D. 6 sites, 22-gauge"],correctIndex:2,explanation:"Botulinum toxin is injected at five sites — one in the procerus and two in each corrugator supercilii bilaterally — using a 30-gauge, 1-inch needle.",category:"treatment"},
  {sid:"bt-06",articleTitle:"Botulinum Toxin Procedures",question:"What is the FDA-approved dose of onabotulinumtoxinA (Botox) for glabellar lines?",options:["A. 10 units","B. 20 units","C. 40 units","D. 50 units"],correctIndex:1,explanation:"The FDA-approved starting dose of onabotulinumtoxinA (Botox) for glabellar lines is 20 units. DaxibotulinumtoxinA uses 40 units, and abobotulinumtoxinA uses 50 units due to its 2.5:1 dosing ratio.",category:"treatment"},
  {sid:"bt-07",articleTitle:"Botulinum Toxin Procedures",question:"What is the dosing ratio of abobotulinumtoxinA (Dysport) to onabotulinumtoxinA (Botox)?",options:["A. 1:1","B. 1.5:1","C. 2.5:1","D. 3:1"],correctIndex:2,explanation:"AbobotulinumtoxinA (Dysport) has a 2.5:1 dosing ratio to onabotulinumtoxinA, meaning 50 units of Dysport is used compared to 20 units of Botox for glabellar lines.",category:"treatment"},
  {sid:"bt-08",articleTitle:"Botulinum Toxin Procedures",question:"Which botulinum toxin product is contraindicated in patients with cow's milk protein allergy?",options:["A. OnabotulinumtoxinA (Botox)","B. AbobotulinumtoxinA (Dysport)","C. IncobotulinumtoxinA (Xeomin)","D. PrabotulinumtoxinA (Jeuveau)"],correctIndex:1,explanation:"AbobotulinumtoxinA (Dysport) contains bovine protein and lactose monohydrate, making it contraindicated in patients with cow's milk protein allergy.",category:"side_effects"},
  {sid:"bt-09",articleTitle:"Botulinum Toxin Procedures",question:"Blepharoptosis after glabellar botulinum toxin injection is treated with which class of eye drops?",options:["A. Beta-blockers","B. Prostaglandin analogs","C. Alpha-adrenergic agents","D. Corticosteroids"],correctIndex:2,explanation:"Alpha-adrenergic ophthalmic agents such as naphazoline/pheniramine or oxymetazoline 0.1% (Upneeq) stimulate the Müller muscle to elevate the eyelid and treat blepharoptosis.",category:"treatment"},
  {sid:"bt-10",articleTitle:"Botulinum Toxin Procedures",question:"What percentage of patients may develop temporary blepharoptosis after glabellar complex botulinum toxin treatment?",options:["A. Less than 1%","B. Up to 5%","C. 10–15%","D. 20–25%"],correctIndex:1,explanation:"Temporary blepharoptosis can occur in up to 5% of patients after glabellar complex treatment, with rates as low as 1% as injector skill improves.",category:"side_effects"},
  {sid:"bt-11",articleTitle:"Botulinum Toxin Procedures",question:"To minimize bruising, patients should discontinue aspirin and antiplatelet medications for how long before botulinum toxin injections?",options:["A. 24 hours","B. 3 days","C. 2 weeks","D. 4 weeks"],correctIndex:2,explanation:"To minimize bruising, patients are advised to discontinue aspirin and other antiplatelet or anticoagulant medications for 2 weeks before treatment, unless prescribed by a physician.",category:"monitoring"},
  {sid:"bt-12",articleTitle:"Botulinum Toxin Procedures",question:"Facial botulinum toxin injections are coded using which CPT code?",options:["A. 64612","B. 64615","C. 11900","D. 96372"],correctIndex:0,explanation:"Facial botulinum toxin injections for muscles innervated by the facial nerve are coded as CPT 64612 (chemodenervation). Cosmetic treatments are not covered by insurance and cost approximately $250–$550 per treatment.",category:"definition"},
  {sid:"bt-m1",articleTitle:"Botulinum Toxin Procedures",question:"How soon after botulinum toxin injection should a follow-up visit be scheduled, and what is its purpose?",options:["A. 1 week — to assess for early complications only","B. 2 weeks — to assess results and perform a touch-up injection if needed","C. 4 weeks — to assess full duration of effect","D. 6 weeks — to plan the next treatment cycle"],correctIndex:1,explanation:"A 2-week follow-up visit is standard after botulinum toxin treatment to assess results at maximal clinical effect and perform a touch-up injection if needed. Photographic documentation is recommended before treatment and at this 2-week visit.",category:"monitoring"},
  {sid:"bt-m2",articleTitle:"Botulinum Toxin Procedures",question:"When should the next botulinum toxin injection be advised after initial treatment?",options:["A. Exactly 3 months on a fixed schedule","B. After 4 months regardless of appearance","C. When muscle contraction is visible in the treatment area before facial lines return to pretreatment appearance","D. Only when the patient requests it"],correctIndex:2,explanation:"Subsequent injection is advised when muscle contraction is visible in the treatment area before facial lines return to their pretreatment appearance — not on a fixed schedule. Muscle function typically returns 3 to 4 months after treatment.",category:"monitoring"},
  {sid:"bt-m3",articleTitle:"Botulinum Toxin Procedures",question:"What type of photographic documentation is recommended for botulinum toxin treatment, and when should it be obtained?",options:["A. Static photos only at baseline","B. Dynamic and static images before treatment and at 2 weeks post-treatment","C. Dynamic photos only at each visit","D. Photos only if a complication occurs"],correctIndex:1,explanation:"Photographic documentation including both dynamic (during muscle contraction) and static images is recommended before treatment and at 2 weeks post-treatment to capture maximal clinical effects.",category:"monitoring"},

  // ── HIV ───────────────────────────────────────────────────────────────────────
  {sid:"hiv-01",articleTitle:"HIV Infection",question:"Per USPSTF guidelines, HIV screening is recommended universally for which age group?",options:["A. Ages 13–64","B. Ages 15–65","C. Ages 18–70","D. All adults regardless of age"],correctIndex:1,explanation:"The USPSTF recommends universal HIV screening for adolescents and adults ages 15 to 65 years. Those in other age groups at increased risk should also be screened.",category:"diagnosis"},
  {sid:"hiv-02",articleTitle:"HIV Infection",question:"Fourth-generation HIV antigen-antibody immunoassays can detect HIV infection within how many days of exposure?",options:["A. 3–7 days","B. 10–14 days","C. 15–17 days","D. 21–28 days"],correctIndex:2,explanation:"Fourth-generation antigen-antibody immunoassays detect HIV-1 p24 antigen and HIV-1 and -2 antibodies and can identify HIV infection within 15 to 17 days of exposure.",category:"labs"},
  {sid:"hiv-03",articleTitle:"HIV Infection",question:"What is the preferred first-line antiretroviral therapy class for treatment-naive HIV patients?",options:["A. Protease inhibitors","B. NNRTIs","C. Integrase strand transfer inhibitors","D. CCR5 antagonists"],correctIndex:2,explanation:"Integrase strand transfer inhibitor–based regimens containing bictegravir or dolutegravir are preferred first-line therapy due to superior viral suppression, tolerability, minimal toxicity, and high resistance barriers.",category:"treatment"},
  {sid:"hiv-04",articleTitle:"HIV Infection",question:"When should antiretroviral therapy ideally be initiated after HIV diagnosis?",options:["A. After CD4 count returns","B. Same day or within 7 days of diagnosis, if patient is ready and no opportunistic infection is suspected","C. Within 30 days","D. After 6 weeks of counseling"],correctIndex:1,explanation:"ART should be initiated as soon as possible, ideally on the same day or within 7 days of diagnosis, provided the patient is ready and no opportunistic infection is suspected.",category:"treatment"},
  {sid:"hiv-05",articleTitle:"HIV Infection",question:"For HIV patients ages 40–75 with 10-year ASCVD risk of 5% to less than 20%, what statin intensity is recommended?",options:["A. Low-intensity statin","B. Moderate-intensity statin","C. High-intensity statin","D. No statin required"],correctIndex:1,explanation:"The REPRIEVE trial showed moderate-intensity statins reduced major adverse cardiovascular events by 35% in HIV patients with low-to-intermediate ASCVD risk. Patients with 10-year risk of 5%–<20% should receive a moderate-intensity statin such as pitavastatin 4 mg/day.",category:"treatment"},
  {sid:"hiv-06",articleTitle:"HIV Infection",question:"DoxyPEP reduces bacterial STI incidence by what percentage in MSM and transgender women?",options:["A. 33%","B. 50%","C. 66%","D. 80%"],correctIndex:2,explanation:"DoxyPEP has been shown to reduce the incidence of bacterial STI by 66% in MSM and transgender women with recent bacterial STIs when administered within 72 hours of unprotected sex.",category:"treatment"},
  {sid:"hiv-07",articleTitle:"HIV Infection",question:"What is the dose of doxycycline used for doxyPEP?",options:["A. 100 mg","B. 200 mg","C. 400 mg","D. 100 mg twice daily for 7 days"],correctIndex:1,explanation:"DoxyPEP consists of 200 mg of doxycycline taken after anal or oral sex without condom use, within 72 hours of exposure.",category:"treatment"},
  {sid:"hiv-08",articleTitle:"HIV Infection",question:"For live attenuated vaccines in HIV patients, administration should be deferred until CD4 count remains at what level?",options:["A. Above 50 cells/μL","B. Above 100 cells/μL","C. Above 200 cells/μL","D. Above 350 cells/μL"],correctIndex:2,explanation:"Administration of live attenuated vaccines should be deferred for HIV patients until the CD4 cell count remains at 200 cells/μL or greater for several months.",category:"monitoring"},
  {sid:"hiv-09",articleTitle:"HIV Infection",question:"Anal cancer screening for MSM and transgender women with HIV should start at what age?",options:["A. Age 21","B. Age 25","C. Age 35","D. Age 45"],correctIndex:2,explanation:"MSM and transgender women with HIV should be screened for anal cancer starting at age 35, while all other patients with HIV should start screening at age 45.",category:"monitoring"},
  {sid:"hiv-10",articleTitle:"HIV Infection",question:"What is the preferred PEP regimen per 2025 CDC guidelines?",options:["A. TDF/FTC for 28 days","B. Bictegravir/emtricitabine/tenofovir alafenamide (Biktarvy) or dolutegravir plus tenofovir/emtricitabine for 28 days","C. Raltegravir plus TDF/3TC for 28 days","D. Darunavir/ritonavir plus TDF/FTC for 28 days"],correctIndex:1,explanation:"Preferred PEP regimens include bictegravir/emtricitabine/tenofovir alafenamide (Biktarvy) or dolutegravir plus tenofovir alafenamide or TDF plus emtricitabine or lamivudine for a 28-day course.",category:"treatment"},
  {sid:"hiv-11",articleTitle:"HIV Infection",question:"For patients with prior injectable cabotegravir PrEP exposure who develop HIV, what empiric treatment is recommended?",options:["A. Bictegravir-based regimen","B. Dolutegravir-based regimen","C. Boosted darunavir-based regimen","D. Rilpivirine-based regimen"],correctIndex:2,explanation:"For patients with prior long-acting injectable cabotegravir exposure, guidelines recommend empiric therapy with boosted darunavir-containing regimens due to risk of integrase resistance from cabotegravir's long half-life.",category:"treatment"},
  {sid:"hiv-12",articleTitle:"HIV Infection",question:"The maximum interval between negative Pap tests after a negative HPV test for cervical cancer screening in HIV patients age ≥30 is:",options:["A. 1 year","B. 3 years","C. 5 years","D. Same as general population (5 years)"],correctIndex:1,explanation:"For HIV patients, the maximum interval between negative Pap tests after a negative HPV test should be no more than 3 years (vs 5 years for the general population), and this screening should not stop after age 65.",category:"monitoring"},
  {sid:"hiv-m1",articleTitle:"HIV Infection",question:"How frequently should HIV RNA (viral load) be monitored after ART initiation?",options:["A. Monthly until undetectable, then annually","B. Every 4–6 weeks after initiation, then every 3 months until undetectable, then every 6 months if stable","C. Every 3 months indefinitely","D. Every 6 months starting at initiation"],correctIndex:1,explanation:"HIV RNA should be measured 4–6 weeks after ART initiation, then every 3 months until undetectable, then every 6 months if the patient is stable (no signs of clinical, immunologic, or virologic failure).",category:"monitoring"},
  {sid:"hiv-m2",articleTitle:"HIV Infection",question:"How frequently should CD4 cell count be monitored after ART initiation?",options:["A. Monthly for the first year, then annually","B. Every 3 months after initiation, then every 3–6 months until 2 years; decrease to every 12 months if CD4 >300 cells/μL","C. Only at diagnosis and after opportunistic infections","D. Every 6 months indefinitely"],correctIndex:1,explanation:"CD4 count should be checked 3 months after ART initiation, then every 3–6 months until 2 years. It can decrease to every 12 months if CD4 >300 cells/μL. CD4 count is optional if >500 cells/μL for 2 years with suppressed viral load.",category:"monitoring"},
  {sid:"hiv-m3",articleTitle:"HIV Infection",question:"Chemistry profile (liver/kidney function) should be repeated how often during ART?",options:["A. Every month for the first year","B. 2–8 weeks after initiation, then every 3–6 months","C. Annually only","D. Only when symptoms arise"],correctIndex:1,explanation:"Chemistry profile should be checked 2–8 weeks after ART initiation, then every 3–6 months. Serum creatinine should be specifically monitored for patients on tenofovir disoproxil fumarate-containing regimens.",category:"monitoring"},
  {sid:"hiv-m4",articleTitle:"HIV Infection",question:"Fasting blood glucose or A1C should be checked how often during ART in HIV patients?",options:["A. Only at diagnosis","B. 3–6 months after initiation, then every 12 months","C. Every 6 months indefinitely","D. Only if BMI >30"],correctIndex:1,explanation:"Fasting blood glucose or A1C should be measured 3–6 months after ART initiation, then every 12 months. A1C may underestimate diabetes risk in HIV patients on ART — if A1C <6.5%, fasting blood glucose testing should be used instead.",category:"monitoring"},
  {sid:"hiv-m5",articleTitle:"HIV Infection",question:"How often should fasting lipids be checked in HIV patients on ART?",options:["A. At diagnosis only","B. Every 6 months","C. Annually","D. Only before starting a statin"],correctIndex:2,explanation:"Fasting or random serum lipids should be checked at diagnosis and repeated annually during ART. HIV patients have increased cardiometabolic risk, and certain ART regimens may affect lipid levels.",category:"monitoring"},
  {sid:"hiv-m6",articleTitle:"HIV Infection",question:"STI testing in HIV patients should be performed how often, and which anatomic sites must be sampled for gonorrhea and chlamydia?",options:["A. Only at diagnosis; urine only","B. Every 6 months; urine only","C. Annually or more frequently with multiple/anonymous partners; all sites of sexual exposure (urine, throat, rectum)","D. Every 2 years if asymptomatic; urine only"],correctIndex:2,explanation:"STI testing should be performed annually in HIV patients, or more frequently in those with multiple or anonymous partners. Testing for gonorrhea and chlamydia must include all sites of sexual exposure — urine, pharynx, and rectum.",category:"monitoring"},
  {sid:"hiv-m7",articleTitle:"HIV Infection",question:"What CD4 threshold triggers cryptococcal antigen screening at HIV diagnosis?",options:["A. CD4 ≤200 cells/μL","B. CD4 ≤100 cells/μL","C. CD4 ≤50 cells/μL","D. Any CD4 level"],correctIndex:1,explanation:"Cryptococcal antigen screening is indicated at diagnosis if CD4 ≤100 cells/μL or if symptoms are consistent with infection. A positive CSF result requires hospitalization; negative CSF can be treated with oral fluconazole.",category:"labs"},
  {sid:"hiv-m8",articleTitle:"HIV Infection",question:"Before prescribing TDF/FTC PrEP, what minimum creatinine clearance is required?",options:["A. ≥30 mL/min/1.73 m²","B. ≥45 mL/min/1.73 m²","C. ≥60 mL/min/1.73 m²","D. No renal restriction"],correctIndex:2,explanation:"TDF/FTC PrEP is not recommended if creatinine clearance is <60 mL/min/1.73 m². TAF/FTC has a lower threshold of ≥30 mL/min/1.73 m². Injectable cabotegravir and lenacapavir have no renal restrictions.",category:"labs"},
  {sid:"hiv-m9",articleTitle:"HIV Infection",question:"Which HIV test must be performed within 1 week before starting PrEP, and why?",options:["A. CBC and metabolic panel","B. Fourth-generation HIV antigen-antibody test — to confirm HIV-negative status before treatment","C. HIV RNA only if symptoms present","D. Rapid antibody test is sufficient"],correctIndex:1,explanation:"HIV-negative status must be confirmed with a fourth-generation HIV antigen-antibody test within 1 week before starting PrEP to prevent drug resistance from inadvertent PrEP initiation during acute HIV infection. HIV RNA testing is required before starting injectable PrEP.",category:"labs"},
  {sid:"hiv-m10",articleTitle:"HIV Infection",question:"How frequently should HIV screening be performed for MSM at increased risk who are taking PrEP?",options:["A. Annually","B. Every 6 months","C. Every 3 or 6 months","D. Every 2 years"],correctIndex:2,explanation:"The CDC recommends more frequent HIV screening — every 3 or 6 months — for MSM at increased risk, individuals taking PrEP medications, and those taking doxyPEP for bacterial STIs.",category:"monitoring"},

  // ── FOOT & ANKLE ─────────────────────────────────────────────────────────────
  {sid:"fa-01",articleTitle:"Injections of the Foot and Ankle",question:"What corticosteroid dose is used for plantar fascia injections?",options:["A. 10 mg methylprednisolone","B. 20 mg triamcinolone","C. 40 mg methylprednisolone or 40 mg triamcinolone","D. 80 mg methylprednisolone"],correctIndex:2,explanation:"For plantar fascia injections, 40 mg methylprednisolone or 40 mg triamcinolone is used along with 2 mL lidocaine 1%, ropivacaine 0.5%, or bupivacaine 0.5%.",category:"treatment"},
  {sid:"fa-02",articleTitle:"Injections of the Foot and Ankle",question:"What is the incidence of plantar fascia rupture after a series of up to three corticosteroid injections?",options:["A. 0.5%","B. 2.4%","C. 5%","D. 10%"],correctIndex:1,explanation:"A retrospective review of 120 patients found the incidence of fascia rupture after up to three corticosteroid injections was 2.4%, and rupture can result in lasting disability even after 1 year. Risk increases with each successive injection.",category:"side_effects"},
  {sid:"fa-03",articleTitle:"Injections of the Foot and Ankle",question:"PRP for plantar fasciitis outperforms corticosteroid injection starting at what timepoint, and how long do benefits persist?",options:["A. 2 weeks; up to 3 months","B. 6 weeks; up to 6 months","C. 3 months; benefits persist 6–12 months","D. 6 months; benefits persist 12–24 months"],correctIndex:2,explanation:"According to a systematic review and meta-analysis, PRP outperformed corticosteroid injection at 3 months, and benefits persisted for 6 to 12 months, making it a promising alternative for persistent symptoms.",category:"treatment"},
  {sid:"fa-04",articleTitle:"Injections of the Foot and Ankle",question:"Intratendinous corticosteroid injection into which tendon is specifically not recommended due to rupture risk?",options:["A. Posterior tibial tendon","B. Peroneal tendon","C. Achilles tendon","D. Flexor hallucis longus tendon"],correctIndex:2,explanation:"Intratendinous corticosteroid injection into weight-bearing tendons, such as the Achilles tendon, is not recommended due to increased risk of tendon rupture.",category:"treatment"},
  {sid:"fa-05",articleTitle:"Injections of the Foot and Ankle",question:"For tarsal tunnel injection, the needle should be inserted how proximal to the landmark and at what angle?",options:["A. 1 cm proximal, 15-degree angle","B. 2 cm proximal, 30-degree angle","C. 3 cm proximal, 45-degree angle","D. 1 cm proximal, 45-degree angle"],correctIndex:1,explanation:"For tarsal tunnel anatomic technique, a 25-gauge needle should be inserted 2 cm proximal to the landmark at a 30-degree angle, with depth usually approximately 4 mm.",category:"treatment"},
  {sid:"fa-06",articleTitle:"Injections of the Foot and Ankle",question:"Interdigital neuromas most commonly occur between which metatarsals?",options:["A. 1st and 2nd","B. 2nd and 3rd","C. 3rd and 4th","D. 4th and 5th"],correctIndex:2,explanation:"Although a neuroma may occur between any pair of metatarsals, between the third and fourth metatarsals is most common. Patients typically present with burning in the forefoot and the feeling of having a pebble in their shoe.",category:"definition"},
  {sid:"fa-07",articleTitle:"Injections of the Foot and Ankle",question:"What is the recommended aftercare period of relative rest after a foot/ankle injection?",options:["A. 8–12 hours","B. 24–48 hours","C. 3–5 days","D. 1 week"],correctIndex:1,explanation:"Aftercare typically involves relative rest for 24 to 48 hours after the injection, with gradual resumption of activity afterward, plus bandaging the puncture wound for 24 hours.",category:"duration"},
  {sid:"fa-08",articleTitle:"Injections of the Foot and Ankle",question:"For first MTP joint arthritis, corticosteroid injections are most beneficial for which severity?",options:["A. All grades equally","B. Severe osteoarthritis","C. Mild to moderate osteoarthritis","D. Post-traumatic arthritis only"],correctIndex:2,explanation:"Corticosteroid injections are most beneficial for mild to moderate grades of osteoarthritis of the first MTP joint, rather than severe osteoarthritis.",category:"treatment"},
  {sid:"fa-09",articleTitle:"Injections of the Foot and Ankle",question:"What imaging modality is recommended when foot/ankle symptoms persist despite normal radiograph findings?",options:["A. CT scan","B. Nuclear bone scan","C. MRI","D. PET scan"],correctIndex:2,explanation:"MRI is recommended for symptoms that persist despite normal radiograph findings, advanced tendon or ligament injuries or occult osseous injuries, or preoperative planning.",category:"labs"},
  {sid:"fa-10",articleTitle:"Injections of the Foot and Ankle",question:"Which pain-reduction tip during injection is supported by evidence?",options:["A. Inject as quickly as possible","B. Warm the injection solution","C. Have the patient watch the procedure","D. Avoid any anesthetic"],correctIndex:1,explanation:"Warming the injection solution may reduce injection pain. Other evidence-based tips include pinching the skin, buffering with sodium bicarbonate, using coolant spray, and having the patient look away during injection.",category:"treatment"},

  // ── METABOLIC SURGERY ────────────────────────────────────────────────────────
  {sid:"ms-01",articleTitle:"Postoperative Management After Metabolic Surgery",question:"What percentage of patients who have had metabolic and bariatric surgery experience complications?",options:["A. 2–5%","B. 10–20%","C. 25–35%","D. 40–50%"],correctIndex:1,explanation:"Although overall perioperative mortality rates are low, 10% to 20% of patients who have had metabolic and bariatric surgery experience complications.",category:"monitoring"},
  {sid:"ms-02",articleTitle:"Postoperative Management After Metabolic Surgery",question:"How often should patients be screened for micronutrient and mineral deficiencies after bariatric surgery?",options:["A. Every 6 months for life","B. Quarterly for 1 year, then annually","C. Annually only","D. Only if symptomatic"],correctIndex:1,explanation:"Patients should be screened for micronutrient and mineral deficiencies at least quarterly for 1 year, then annually thereafter. Bariatric multivitamins should be taken daily.",category:"monitoring"},
  {sid:"ms-03",articleTitle:"Postoperative Management After Metabolic Surgery",question:"What percentage of bariatric surgery patients with type 2 diabetes experience remission (fasting glucose <126 mg/dL without medication)?",options:["A. 30%","B. 50%","C. 70%","D. 90%"],correctIndex:2,explanation:"Approximately 70% of surgical patients experience diabetes remission, and 38% maintain remission at 10 years after metabolic and bariatric surgery.",category:"treatment"},
  {sid:"ms-04",articleTitle:"Postoperative Management After Metabolic Surgery",question:"What is the recommended timing for bone mineral density screening after metabolic and bariatric surgery?",options:["A. Only if symptomatic","B. Before or soon after surgery, then every 1–2 years","C. 5 years after surgery","D. Annually starting at age 60"],correctIndex:1,explanation:"Bone mineral density screening should be performed before or soon after metabolic and bariatric surgery, with follow-up screening every 1 to 2 years depending on the procedure and patient risk factors.",category:"monitoring"},
  {sid:"ms-05",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Which medication is effective for treating poor weight loss or suboptimal GLP-1 response after bariatric surgery?",options:["A. Metformin","B. Orlistat","C. Liraglutide (Saxenda)","D. Topiramate"],correctIndex:2,explanation:"One randomized clinical trial found liraglutide (Saxenda) effective for treating poor weight loss and suboptimal GLP-1 response for at least 1 year after metabolic and bariatric surgery.",category:"treatment"},
  {sid:"ms-06",articleTitle:"Postoperative Management After Metabolic Surgery",question:"What is the prevalence of dumping syndrome (rapid gastric emptying) after Roux-en-Y gastric bypass?",options:["A. ~5%","B. ~20%","C. ~40%","D. ~60%"],correctIndex:2,explanation:"Dumping syndrome occurs in approximately 40% of Roux-en-Y gastric bypass patients, presenting with nausea, vomiting, diarrhea, and abdominal cramping.",category:"diagnosis"},
  {sid:"ms-07",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Expert consensus recommends waiting how long after bariatric surgery before attempting pregnancy?",options:["A. 3–6 months","B. 6–12 months","C. 12–24 months","D. 24–36 months"],correctIndex:2,explanation:"Expert consensus recommends waiting 12 to 24 months after surgery before conception to avoid pregnancy during rapid weight loss and to allow for weight stability.",category:"duration"},
  {sid:"ms-08",articleTitle:"Postoperative Management After Metabolic Surgery",question:"What daily vitamin D3 dose is recommended post-bariatric surgery, and what is the goal 25-hydroxyvitamin D level?",options:["A. 1,000 IU/day; goal >20 ng/mL","B. At least 3,000 IU/day; goal >30 ng/mL","C. 5,000 IU/day; goal >50 ng/mL","D. 2,000 IU/day; goal >25 ng/mL"],correctIndex:1,explanation:"Oral vitamin D3 at least 3,000 IU daily is recommended post-bariatric surgery, with a goal 25-hydroxyvitamin D level greater than 30 ng/mL (74.88 nmol/L).",category:"treatment"},
  {sid:"ms-09",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Oral contraceptive pills are less effective after which bariatric procedure?",options:["A. Sleeve gastrectomy","B. Laparoscopic adjustable gastric banding","C. Roux-en-Y gastric bypass","D. Biliopancreatic diversion"],correctIndex:2,explanation:"Oral contraceptive pills are less effective after Roux-en-Y gastric bypass because the bypass of the duodenum and upper jejunum reduces consistent daily medication absorption, especially in patients with frequent vomiting.",category:"side_effects"},
  {sid:"ms-10",articleTitle:"Postoperative Management After Metabolic Surgery",question:"What calcium dose is recommended for Roux-en-Y gastric bypass or sleeve gastrectomy patients?",options:["A. 600–800 mg/day","B. 1,000 mg/day","C. 1,200–1,500 mg/day","D. 2,000 mg/day"],correctIndex:2,explanation:"For RYGB, sleeve gastrectomy, or LAGB patients, oral calcium supplementation of 1,200–1,500 mg/day is recommended in divided doses. Calcium carbonate should be taken with a meal.",category:"treatment"},
  {sid:"ms-11",articleTitle:"Postoperative Management After Metabolic Surgery",question:"A sleep study to assess need for continued CPAP should be performed after what percentage of weight loss post-bariatric surgery?",options:["A. 5%","B. 10%","C. 20%","D. 30%"],correctIndex:2,explanation:"It is recommended to continue CPAP postoperatively and perform a sleep study after 20% weight loss to assess the need for continued use for obstructive sleep apnea.",category:"monitoring"},
  {sid:"ms-m1",articleTitle:"Postoperative Management After Metabolic Surgery",question:"After Roux-en-Y gastric bypass, vitamin A levels should be monitored how often?",options:["A. Only at 1 year post-op","B. At least quarterly for 1 year, then annually","C. Annually starting at 2 years post-op","D. Only if night blindness symptoms develop"],correctIndex:1,explanation:"Vitamin A should be monitored at least quarterly for 1 year, then annually after RYGB or biliopancreatic diversion with duodenal switch. Deficiency causes night blindness, Bitot spots, and xerophthalmia.",category:"monitoring"},
  {sid:"ms-m2",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Vitamin B12 and methylmalonic acid should be monitored how often after bariatric surgery?",options:["A. Only if neurologic symptoms develop","B. At least quarterly for 1 year, then annually, or if symptomatic","C. Every 2 years","D. Once at 6 months post-op"],correctIndex:1,explanation:"Vitamin B12 (measured with methylmalonic acid, with or without homocysteine) should be monitored at least quarterly for 1 year, then annually or if symptomatic with anemia, peripheral neuropathy, or gait abnormalities.",category:"monitoring"},
  {sid:"ms-m3",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Iron studies (iron, ferritin, TIBC, CBC) should be checked how often after bariatric surgery?",options:["A. Only if anemia symptoms develop","B. At least quarterly for 1 year, then annually","C. Every 6 months indefinitely","D. At 1, 3, and 6 months only"],correctIndex:1,explanation:"Iron, ferritin, TIBC, and CBC should be measured at least quarterly for 1 year, then annually. Menstruating women and post-RYGB patients require higher supplementation (45–60 mg elemental iron/day).",category:"monitoring"},
  {sid:"ms-m4",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Calcium monitoring post-bariatric surgery requires which specific labs, at what intervals?",options:["A. Serum calcium only, annually","B. Comprehensive metabolic panel, 25-hydroxyvitamin D, and intact PTH at 1, 3, and 6 months; then symptom-guided","C. Ionized calcium monthly for 1 year","D. DEXA scan only at 2 years"],correctIndex:1,explanation:"Calcium monitoring uses CMP, 25-hydroxyvitamin D, and intact PTH at 1, 3, and 6 months. After 6 months, clinical symptoms guide further testing. Bone mineral density screening is recommended at 2 years post-surgery.",category:"monitoring"},
  {sid:"ms-m5",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Copper and ceruloplasmin should be monitored annually after which specific bariatric procedures?",options:["A. Sleeve gastrectomy and LAGB only","B. Roux-en-Y gastric bypass and biliopancreatic diversion with duodenal switch","C. All bariatric procedures equally","D. Only if zinc supplementation is being used"],correctIndex:1,explanation:"Serum copper and ceruloplasmin should be monitored annually after RYGB or biliopancreatic diversion with duodenal switch. For LAGB or sleeve gastrectomy, monitoring is as clinically indicated. Copper deficiency causes anemia, ataxia, and pancytopenia.",category:"monitoring"},
  {sid:"ms-m6",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Which vitamin D test is preferred post-bariatric surgery, and what is the target level?",options:["A. 1,25-dihydroxyvitamin D; goal >20 ng/mL","B. 25-hydroxyvitamin D; goal >30 ng/mL","C. 25-hydroxyvitamin D; goal >50 ng/mL","D. Either test; goal >25 ng/mL"],correctIndex:1,explanation:"Screening with 25-hydroxyvitamin D (not 1,25-dihydroxyvitamin D) is preferred. The goal is >30 ng/mL (74.88 nmol/L), achieved with oral vitamin D3 at least 3,000 IU daily.",category:"labs"},
  {sid:"ms-m7",articleTitle:"Postoperative Management After Metabolic Surgery",question:"Thiamine (B1) screening after bariatric surgery is indicated in which high-risk populations?",options:["A. All patients quarterly","B. Female patients, Black patients, patients with severe GI symptoms, excessive alcohol use, rapid weight loss, heart failure, or chronic malnutrition","C. Only patients with neurologic symptoms","D. Only after Roux-en-Y gastric bypass"],correctIndex:1,explanation:"Thiamine screening is recommended in symptomatic patients and specific high-risk groups: female patients, Black patients, patients not attending nutritional clinics, and those with severe GI symptoms, excessive alcohol, rapid weight loss, heart failure, or chronic malnutrition.",category:"monitoring"},
  {sid:"ms-m8",articleTitle:"Postoperative Management After Metabolic Surgery",question:"How should gestational diabetes be screened after malabsorptive bariatric procedures?",options:["A. Standard 1-hour 50g glucose challenge test at 24–28 weeks","B. In-home fasting and 2-hour postprandial glucose monitoring for 1 week at 24–28 weeks' gestation","C. HbA1c at 24 weeks","D. No screening required after bariatric surgery"],correctIndex:1,explanation:"Patients after malabsorptive procedures may experience dumping syndrome with standard OGTT. Screening uses in-home fasting and 2-hour postprandial glucose monitoring for 1 week during 24–28 weeks' gestation. Adjustable gastric banding patients use the standard OGTT.",category:"monitoring"},

  // ── SEVERE HYPERTENSION ──────────────────────────────────────────────────────
  {sid:"ht-01",articleTitle:"Severe Hypertension",question:"Per AHA/ACC, severe hypertension is defined as BP at or above which threshold in the absence of target organ damage?",options:["A. 160/100 mm Hg","B. 170/110 mm Hg","C. 180/120 mm Hg","D. 200/120 mm Hg"],correctIndex:2,explanation:"Per AHA/ACC guidelines, severe hypertension is defined as systolic BP ≥180 mm Hg and/or diastolic BP ≥110–120 mm Hg in the absence of new or worsening target organ damage.",category:"definition"},
  {sid:"ht-02",articleTitle:"Severe Hypertension",question:"What percentage of adults with preexisting hypertension had BP ≥180/120 mm Hg in a large retrospective cohort study?",options:["A. 4.6%","B. 8.3%","C. 13.1%","D. 21.4%"],correctIndex:2,explanation:"A retrospective cohort study (N=213,836) found that 13.1% of adults with preexisting hypertension had severe BP elevations of 180/120 mm Hg or greater.",category:"definition"},
  {sid:"ht-03",articleTitle:"Severe Hypertension",question:"In hospitalized patients with severe hypertension who received no antihypertensive therapy, BP spontaneously decreased to <140/90 mm Hg in what percentage within 3 hours?",options:["A. 15%","B. 28%","C. 44%","D. 62%"],correctIndex:2,explanation:"A retrospective cohort study (N=12,825) showed BP spontaneously reduced to less than 140/90 mm Hg within 3 hours in 44% of hospitalized patients with severe hypertension who did not receive antihypertensive therapy.",category:"treatment"},
  {sid:"ht-04",articleTitle:"Severe Hypertension",question:"Treatment of asymptomatic severe hypertension in inpatients has been associated with increased risk of which adverse outcomes?",options:["A. Only increased length of stay","B. Acute kidney injury, stroke, MI, hypotension, longer hospital stay, and mortality","C. Atrial fibrillation only","D. Increased cost without clinical harm"],correctIndex:1,explanation:"Multiple trials showed treating asymptomatic severe hypertension is associated with increased risk of AKI, stroke, MI, hypotension, hospital readmission, longer hospital stay, and mortality — with no short-term benefit.",category:"side_effects"},
  {sid:"ht-05",articleTitle:"Severe Hypertension",question:"In the outpatient setting, what is the most common cause of severe hypertension?",options:["A. Secondary hypertension","B. Medication nonadherence","C. Dietary sodium excess","D. Renal artery stenosis"],correctIndex:1,explanation:"In the outpatient setting, medication nonadherence is the most common cause of severe hypertension, typically requiring reinitiating or increasing the dosage of antihypertensive therapy.",category:"diagnosis"},
  {sid:"ht-06",articleTitle:"Severe Hypertension",question:"Resistant hypertension is defined as inadequate BP control despite how many maximally tolerated antihypertensive agents including a diuretic?",options:["A. Two","B. Three","C. Four","D. Five"],correctIndex:1,explanation:"Resistant hypertension is defined as inadequate BP control despite three maximally tolerated antihypertensive agents (including a diuretic), or requiring more than four medications.",category:"definition"},
  {sid:"ht-07",articleTitle:"Severe Hypertension",question:"What is the most common cause of secondary hypertension?",options:["A. Primary aldosteronism","B. Renovascular hypertension","C. Obstructive sleep apnea","D. Kidney parenchymal disease"],correctIndex:2,explanation:"Obstructive sleep apnea is the most common cause of secondary hypertension (25–50%), followed by primary aldosteronism (8–20%) and renovascular hypertension (5–34%).",category:"diagnosis"},
  {sid:"ht-08",articleTitle:"Severe Hypertension",question:"Use of as-needed vs scheduled antihypertensive medications is associated with how much greater relative risk of myocardial infarction?",options:["A. 1.2-fold higher","B. 1.5-fold higher","C. 2.92-fold higher","D. 4.1-fold higher"],correctIndex:2,explanation:"As-needed antihypertensive medications compared with scheduled medications are associated with a relative risk of MI of 2.92, stroke RR 1.99, and death RR 1.52, per evidence from VA hospitals.",category:"side_effects"},
  {sid:"ht-09",articleTitle:"Severe Hypertension",question:"Each antihypertensive medication class at standard doses can be expected to reduce BP by approximately how much?",options:["A. 5–8/3–5 mm Hg","B. 12–16/8–12 mm Hg","C. 20–25/12–15 mm Hg","D. 8–10/5–8 mm Hg"],correctIndex:1,explanation:"At standard dosages, each class of antihypertensive medication can reduce BP by 12 to 16/8 to 12 mm Hg. Combining multiple classes has a synergistic effect.",category:"treatment"},
  {sid:"ht-10",articleTitle:"Severe Hypertension",question:"Limiting sodium intake to 1,500 mg/day reduces systolic BP by approximately how much?",options:["A. 2 mm Hg","B. 5 mm Hg","C. 11 mm Hg","D. 15 mm Hg"],correctIndex:1,explanation:"Effective nonpharmacologic interventions include limiting sodium to 1,500 mg/day (−5 mm Hg), healthy diet (−11 mm Hg), 150 min/week physical activity (−5 mm Hg), and weight loss (−1 mm Hg per kg lost).",category:"treatment"},
  {sid:"ht-m1",articleTitle:"Severe Hypertension",question:"For patients discharged with elevated BP, how soon should follow-up occur?",options:["A. 1 month, to assess medication tolerance","B. 1–2 weeks, as early follow-up may reduce 30-day all-cause readmission","C. 3 months, for stable reassessment","D. No specific interval is recommended"],correctIndex:1,explanation:"For patients with elevated BP at hospital discharge, early follow-up within 1 to 2 weeks is recommended as it may reduce the 30-day all-cause readmission rate.",category:"monitoring"},
  {sid:"ht-m2",articleTitle:"Severe Hypertension",question:"In outpatient severe hypertension management, how often should antihypertensive therapy be reassessed after initiation?",options:["A. At 1-month intervals until adequate BP control is achieved","B. Every 2 weeks for the first month, then monthly","C. Every 3 months","D. Only if BP remains >160/100 mm Hg"],correctIndex:0,explanation:"Management of asymptomatic severe hypertension outpatient should include oral antihypertensive therapy with close follow-up at 1-month intervals until adequate BP control is achieved.",category:"monitoring"},
  {sid:"ht-m3",articleTitle:"Severe Hypertension",question:"If hypertensive emergency is suspected in an inpatient, which diagnostic workup is indicated?",options:["A. Troponin and BNP only","B. Basic metabolic panel, CBC, chest radiography, and 12-lead ECG","C. Urinalysis and renal ultrasound","D. Comprehensive metabolic panel and coagulation studies"],correctIndex:1,explanation:"If hypertensive emergency is a diagnostic consideration, evaluation should include BMP, CBC, chest radiography, and 12-lead ECG. Funduscopic examination is also recommended to assess for hypertensive retinopathy.",category:"labs"},
  {sid:"ht-m4",articleTitle:"Severe Hypertension",question:"What is the BP-lowering timeline for antihypertensive agents, and what is the clinical implication for inpatient management?",options:["A. Full effect in 24–48 hours; reduction achievable during hospitalization","B. Initial effect in 24–48 hours, full effect in 2–4 weeks; significant reduction unlikely during short hospitalization","C. Full effect in 72 hours; useful for inpatient titration","D. Effect begins immediately; useful for acute management"],correctIndex:1,explanation:"BP-lowering effects begin within 24–48 hours, but full effects take 2–4 weeks. Significant BP reductions are unlikely during a short hospitalization, supporting gradual outpatient management over aggressive inpatient dose escalation.",category:"monitoring"},

  // ── SKIN & SOFT TISSUE ───────────────────────────────────────────────────────
  {sid:"st-01",articleTitle:"Skin and Soft Tissue Infections",question:"The initial diagnosis of cellulitis is incorrect in what percentage of cases?",options:["A. 15%","B. 27%","C. 41%","D. 55%"],correctIndex:2,explanation:"One systematic review found the initial diagnosis of cellulitis is incorrect in 41% of cases compared with expert diagnosis after 24 hours of treatment.",category:"diagnosis"},
  {sid:"st-02",articleTitle:"Skin and Soft Tissue Infections",question:"Which antibiotic is recommended for nonpurulent, mild cellulitis, and for how long?",options:["A. TMP/SMX, 7 days","B. Clindamycin, 5 days","C. Penicillin or first-generation cephalosporins, 5 days","D. Doxycycline, 10 days"],correctIndex:2,explanation:"Nonpurulent, mild cellulitis should be treated with penicillin or first-generation cephalosporins for 5 days. Adding TMP/SMX does not improve clinical cure rates for nonpurulent cellulitis.",category:"treatment"},
  {sid:"st-03",articleTitle:"Skin and Soft Tissue Infections",question:"For uncomplicated abscesses after incision and drainage, which antibiotics reduce treatment failure?",options:["A. Amoxicillin/clavulanate or cephalexin","B. Clindamycin or trimethoprim/sulfamethoxazole","C. Ciprofloxacin or azithromycin","D. Penicillin or ampicillin"],correctIndex:1,explanation:"After incision and drainage, clindamycin or TMP/SMX reduces the risk of treatment failure. TMP/SMX improved clinical cure vs placebo with NNT=11 without increasing adverse events.",category:"treatment"},
  {sid:"st-04",articleTitle:"Skin and Soft Tissue Infections",question:"Necrotizing fasciitis presents with septic shock in what percentage of patients?",options:["A. 5%","B. 10%","C. 30%","D. 50%"],correctIndex:2,explanation:"Necrotizing fasciitis is a surgical emergency that presents with septic shock in up to 30% of patients. Pain out of proportion to examination and crepitus are key findings.",category:"diagnosis"},
  {sid:"st-05",articleTitle:"Skin and Soft Tissue Infections",question:"The NECROSIS score identifies necrotizing infections using which three criteria?",options:["A. Fever, elevated WBC, crepitus","B. Systolic BP ≤120 mm Hg, WBC ≥15,000/μL, violaceous skin","C. Elevated CRP, bandemia, skin necrosis","D. Elevated lactate, tachycardia, bullae"],correctIndex:1,explanation:"The NECROSIS score uses systolic BP (≤120 mm Hg), WBC (≥15,000/μL), and violaceous skin. In a multicenter prospective study, positive predictive value was 100% for necrotizing infection when all three were present.",category:"diagnosis"},
  {sid:"st-06",articleTitle:"Skin and Soft Tissue Infections",question:"Point-of-care ultrasonography for distinguishing abscess from cellulitis has what positive likelihood ratio?",options:["A. 2.1","B. 4.3","C. 8.6","D. 14.2"],correctIndex:2,explanation:"Point-of-care ultrasonography can reliably distinguish cellulitis from abscess with a positive likelihood ratio of 8.6 and a negative likelihood ratio of 0.07 compared with incision and drainage or CT.",category:"labs"},
  {sid:"st-07",articleTitle:"Skin and Soft Tissue Infections",question:"For patients with 2+ episodes of lower extremity cellulitis in the past 24 months, what reduces recurrence with NNT=4?",options:["A. Prophylactic penicillin 250 mg twice daily","B. Compression stockings","C. Daily chlorhexidine washes","D. Monthly azithromycin"],correctIndex:1,explanation:"For patients with two or more episodes of lower extremity cellulitis in the same area in the past 24 months, compression stockings reduce recurrence with an NNT of 4.",category:"treatment"},
  {sid:"st-08",articleTitle:"Skin and Soft Tissue Infections",question:"What is the recurrence rate of cellulitis?",options:["A. 5–8%","B. 12–29%","C. 35–45%","D. 50–60%"],correctIndex:1,explanation:"Rates of cellulitis recurrence range from 12% to 29%. Risk factors include lymphedema, venous insufficiency, tinea pedis, and malignancy.",category:"diagnosis"},
  {sid:"st-09",articleTitle:"Skin and Soft Tissue Infections",question:"For severe nonpurulent skin and soft tissue infections, which antibiotic combination covers MRSA and anaerobes?",options:["A. Ceftriaxone plus metronidazole","B. Vancomycin or linezolid plus piperacillin/tazobactam or carbapenem","C. TMP/SMX plus amoxicillin/clavulanate","D. Daptomycin plus azithromycin"],correctIndex:1,explanation:"Patients with suspected necrotizing infections should be treated with IV vancomycin or linezolid (MRSA coverage) plus piperacillin/tazobactam, meropenem, or imipenem/cilastatin (gram-negative and anaerobic coverage), with clindamycin to bind endotoxins.",category:"treatment"},
  {sid:"st-10",articleTitle:"Skin and Soft Tissue Infections",question:"For moderate to severe skin and soft tissue infections, what is the recommended antibiotic duration?",options:["A. 3–5 days","B. 5–7 days","C. 7–14 days","D. 21 days"],correctIndex:2,explanation:"For moderate to severe infections, antibiotic therapy should be administered for 7 to 14 days depending on host factors (e.g., neutropenia), prior treatment, and severity of infection.",category:"duration"},
  {sid:"st-11",articleTitle:"Skin and Soft Tissue Infections",question:"Penicillin prophylaxis at 250 mg twice daily for 12 months for patients with 2+ lower extremity cellulitis episodes in past 6 months has what NNT?",options:["A. NNT=3","B. NNT=7","C. NNT=12","D. NNT=20"],correctIndex:1,explanation:"For patients with two or more episodes of lower extremity cellulitis in the past 6 months, penicillin 250 mg twice daily for 12 months reduces recurrence at 1 year with NNT=7. Recurrence rates return to baseline when prophylaxis is discontinued.",category:"treatment"},
  {sid:"st-m1",articleTitle:"Skin and Soft Tissue Infections",question:"How should clinicians monitor treatment response in cellulitis, and what is the expected improvement at 72 hours?",options:["A. Repeat CBC at 72 hours; expect WBC normalization","B. Mark the affected area with a surgical pen; expect erythema to improve by approximately 30% at 72 hours","C. Repeat skin culture at 48 hours","D. Daily wound photography; expect complete resolution by 72 hours"],correctIndex:1,explanation:"The affected area should be marked with a single-use surgical pen at diagnosis to monitor spread or improvement. In most cases, erythema improves by approximately 30% at 72 hours. Swelling and warmth can persist at day 10 without indicating clinical failure.",category:"monitoring"},
  {sid:"st-m2",articleTitle:"Skin and Soft Tissue Infections",question:"What WBC count threshold is used to assess severity in moderate-to-severe skin and soft tissue infections?",options:["A. WBC >7,500/μL","B. WBC >10,000/μL","C. WBC >15,000/μL","D. WBC >20,000/μL"],correctIndex:1,explanation:"For moderate to severe infection, a WBC count greater than 10,000/μL (10 × 10⁹/L) and metabolic panel can aid in determining severity by assessing for end-organ damage such as acute kidney injury.",category:"labs"},
  {sid:"st-m3",articleTitle:"Skin and Soft Tissue Infections",question:"In children with cellulitis receiving IV antibiotics, what scoring system determines if continued IV therapy is needed after 24 hours, and what is the threshold score?",options:["A. LRINEC score ≥6","B. Melbourne ASSET score ≥4","C. ALT-70 score ≥3","D. SIARI score ≥3"],correctIndex:1,explanation:"The Melbourne ASSET (area, systemic features, swelling, eye, tenderness) score helps determine if continued IV therapy is warranted after 24 hours. Scores range from 0–7; scores of 4 or higher indicate the need for ongoing IV antibiotics.",category:"monitoring"},
  {sid:"st-m4",articleTitle:"Skin and Soft Tissue Infections",question:"Under which circumstances are blood cultures indicated in skin and soft tissue infections?",options:["A. All hospitalized patients with cellulitis","B. Concern for deep space infection, severe systemic symptoms, or underlying immunosuppression","C. Any patient with fever above 38.5°C","D. All abscess patients before incision and drainage"],correctIndex:1,explanation:"Blood cultures should be obtained if there is concern for deep space infection, severe systemic symptoms, or an underlying immunosuppressing condition. For uncomplicated cellulitis without systemic symptoms, blood cultures are not indicated.",category:"labs"},
];

const SEED_IDS = new Set(SEED_CARDS.map(c => c.sid));

async function seedIfNeeded(existingCards) {
  const existingSids = new Set(existingCards.map(c => c.sid).filter(Boolean));
  const missing = SEED_CARDS.filter(c => !existingSids.has(c.sid));
  if (missing.length === 0) return existingCards;
  const stamped = missing.map(c => ({
    ...c,
    id: c.sid + "-" + Date.now(),
    interval: 1, repetitions: 0, easeFactor: 2.5,
    nextReview: null, lastQuality: null, timesReviewed: 0,
  }));
  const merged = [...existingCards, ...stamped];
  await saveCards(merged);
  return merged;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function extractTextFromPDF(base64Data, apiKey = "") {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 4000,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
        { type: "text", text: "Extract all text content from this AFP article. Return the full text preserving paragraphs. Include all clinical details, numbers, drug names, doses, and recommendations." }
      ]}],
    }),
  });
  const data = await resp.json();
  return data.content?.find(b => b.type === "text")?.text || "";
}

async function generateQuestionsFromText(articleText, articleTitle, apiKey = "") {
  const systemPrompt = `You are a Family Medicine board question writer specializing in AFP (American Family Physician) article content.
Generate multiple-choice questions strictly from the provided article text.
Focus exclusively on: diagnosis criteria, treatment protocols, medication dosing/duration/side effects, lab values, imaging indications, monitoring parameters, and disease definitions.
Return ONLY a valid JSON array. No markdown, no preamble.
Format:
[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"correctIndex":0,"explanation":"...","category":"diagnosis|treatment|labs|monitoring|side_effects|duration|definition","articleTitle":"..."}]
Generate 10-15 high-yield clinical questions. Make distractors plausible. Every question must be directly answerable from the article text.`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 4000, system: systemPrompt,
      messages: [{ role: "user", content: `Article title: "${articleTitle}"\n\nArticle text:\n${articleText.slice(0, 12000)}` }],
    }),
  });
  const data = await resp.json();
  const raw = data.content?.find(b => b.type === "text")?.text || "[]";
  const questions = JSON.parse(raw.replace(/```json|```/g, "").trim());
  return questions.map((q, i) => ({
    id: `${Date.now()}-${i}`, ...q,
    interval: 1, repetitions: 0, easeFactor: 2.5,
    nextReview: null, lastQuality: null, timesReviewed: 0,
  }));
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AFPQuizApp() {
  const [screen, setScreen] = useState("dashboard");
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [showApiKey, setShowApiKey] = useState(false);

  // Quiz state
  const [quizQueue, setQuizQueue] = useState([]);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });

  // Article selection state
  const [selectedArticles, setSelectedArticles] = useState(new Set()); // empty = all
  const [showArticlePicker, setShowArticlePicker] = useState(false);

  useEffect(() => {
    // Inject global styles
    const id = "afp-srq-styles";
    if (!document.getElementById(id)) {
      const tag = document.createElement("style");
      tag.id = id;
      tag.innerHTML = "@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}";
      document.head.appendChild(tag);
    }
    loadCards().then(c => seedIfNeeded(c)).then(c => { setCards(c); setLoading(false); });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (screen !== "quiz") return;
    const handler = (e) => {
      if (!showAnswer) {
        if (e.key >= "1" && e.key <= "4") {
          const idx = parseInt(e.key) - 1;
          const card = quizQueue[currentCardIdx];
          if (card && idx < card.options.length) handleSelectOption(idx);
        }
        if (e.key === " ") { e.preventDefault(); setShowAnswer(true); }
      } else {
        const btn = QUALITY_BTNS.find(b => b.key === e.key);
        if (btn) handleQuality(btn.q);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, showAnswer, currentCardIdx, quizQueue]);

  const articles = [...new Set(cards.map(c => c.articleTitle))];
  const activeArticles = selectedArticles.size === 0 ? new Set(articles) : selectedArticles;

  const filteredCards = cards.filter(c => activeArticles.has(c.articleTitle));
  const dueCards = filteredCards.filter(isDue);
  const masteredCards = cards.filter(c => c.repetitions >= 3);

  const startQuiz = () => {
    if (dueCards.length === 0) return;
    const queue = [...dueCards].sort(() => Math.random() - 0.5);
    setQuizQueue(queue);
    setCurrentCardIdx(0);
    setShowAnswer(false);
    setSelectedOption(null);
    setSessionStats({ reviewed: 0, correct: 0 });
    setScreen("quiz");
  };

  const handleSelectOption = (idx) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    setShowAnswer(true);
  };

  const handleQuality = useCallback(async (q) => {
    const card = quizQueue[currentCardIdx];
    if (!card) return;
    const updated = sm2({ ...card }, q);
    updated.timesReviewed = (card.timesReviewed || 0) + 1;
    const newCards = cards.map(c => c.id === card.id ? { ...c, ...updated } : c);
    setCards(newCards);
    await saveCards(newCards);
    setSessionStats(s => ({ reviewed: s.reviewed + 1, correct: s.correct + (q >= 2 ? 1 : 0) }));
    if (currentCardIdx + 1 >= quizQueue.length) { setScreen("review"); }
    else { setCurrentCardIdx(i => i + 1); setShowAnswer(false); setSelectedOption(null); }
  }, [cards, quizQueue, currentCardIdx]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (!apiKey.trim()) {
      setUploadStatus("⚠️ Please enter your Anthropic API key above before uploading.");
      return;
    }
    saveApiKey(apiKey.trim());
    setUploading(true);
    let allNewCards = [];
    for (const file of files) {
      setUploadStatus(`Reading ${file.name}…`);
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const title = file.name.replace(/\.pdf$/i, "");
      setUploadStatus(`Extracting text from "${title}"…`);
      const text = await extractTextFromPDF(base64, apiKey);
      setUploadStatus(`Generating cards for "${title}"…`);
      const newCards = await generateQuestionsFromText(text, title, apiKey);
      allNewCards = [...allNewCards, ...newCards];
    }
    const merged = [...cards, ...allNewCards];
    setCards(merged);
    await saveCards(merged);
    setUploading(false);
    setUploadStatus(`✓ Added ${allNewCards.length} cards from ${files.length} article(s)`);
    setTimeout(() => { setUploadStatus(""); setScreen("dashboard"); }, 2500);
  };

  const deleteArticle = async (title) => {
    if (!confirm(`Delete all cards for "${title}"?`)) return;
    const newCards = cards.filter(c => c.articleTitle !== title);
    setCards(newCards);
    await saveCards(newCards);
    setSelectedArticles(prev => { const next = new Set(prev); next.delete(title); return next; });
  };

  const toggleArticle = (title) => {
    setSelectedArticles(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const selectAll = () => setSelectedArticles(new Set());
  const selectNone = () => setSelectedArticles(new Set(articles));

  // ── SCREENS ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={s.loadingScreen}><div style={s.spinner} />
      <p style={{ color: "#94A3B8", marginTop: 16, fontFamily: "Georgia,serif" }}>Loading your deck…</p>
    </div>
  );

  // ── QUIZ ─────────────────────────────────────────────────────────────────────
  if (screen === "quiz") {
    const card = quizQueue[currentCardIdx];
    if (!card) return null;
    const cat = CATEGORIES.find(c => c.id === card.category) || CATEGORIES[0];
    const progress = (currentCardIdx / quizQueue.length) * 100;
    return (
      <div style={s.quizScreen}>
        <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${progress}%` }} /></div>
        <div style={s.quizHeader}>
          <button onClick={() => setScreen("dashboard")} style={s.backBtn}>← Back</button>
          <span style={{ ...s.catBadge, background: cat.color + "22", color: cat.color, border: `1px solid ${cat.color}44` }}>{cat.icon} {cat.label}</span>
          <span style={s.counter}>{currentCardIdx + 1} / {quizQueue.length}</span>
        </div>
        <p style={s.articleLabel}>{card.articleTitle}</p>
        <div style={s.questionCard}><p style={s.questionText}>{card.question}</p></div>
        <div style={s.optionsGrid}>
          {card.options.map((opt, i) => {
            let bg = "rgba(30,41,59,0.6)", border = "1px solid rgba(148,163,184,0.15)", color = "#CBD5E1";
            if (showAnswer) {
              if (i === card.correctIndex) { bg = "rgba(16,185,129,0.15)"; border = "1px solid #10B981"; color = "#6EE7B7"; }
              else if (i === selectedOption) { bg = "rgba(239,68,68,0.15)"; border = "1px solid #EF4444"; color = "#FCA5A5"; }
            } else if (selectedOption === i) { bg = "rgba(59,130,246,0.15)"; border = "1px solid #3B82F6"; color = "#93C5FD"; }
            return (
              <button key={i} onClick={() => handleSelectOption(i)} disabled={showAnswer} style={{ ...s.optionBtn, background: bg, border, color }}>
                <span style={s.optionKey}>{i + 1}</span>{opt}
              </button>
            );
          })}
        </div>
        {showAnswer && (
          <div style={s.explanationBox}>
            <p style={s.explanationTitle}>📋 Explanation</p>
            <p style={s.explanationText}>{card.explanation}</p>
          </div>
        )}
        {!showAnswer
          ? <button onClick={() => setShowAnswer(true)} style={s.revealBtn}>Space / Tap to reveal</button>
          : <div style={s.qualityRow}>
              <p style={s.qualityLabel}>How well did you know this?</p>
              <div style={s.qualityBtns}>
                {QUALITY_BTNS.map(b => (
                  <button key={b.q} onClick={() => handleQuality(b.q)} style={{ ...s.qualityBtn, borderColor: b.color, color: b.color }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{b.label}</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{b.sub}</span>
                    <span style={{ fontSize: 10, opacity: 0.5 }}>[ {b.key} ]</span>
                  </button>
                ))}
              </div>
            </div>
        }
      </div>
    );
  }

  // ── REVIEW ────────────────────────────────────────────────────────────────────
  if (screen === "review") {
    const pct = Math.round((sessionStats.correct / sessionStats.reviewed) * 100);
    return (
      <div style={s.reviewScreen}>
        <div style={s.reviewCard}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>{pct >= 80 ? "🎉" : pct >= 60 ? "💪" : "📚"}</div>
          <h2 style={s.reviewTitle}>Session Complete</h2>
          <div style={s.reviewStats}>
            {[["Cards Reviewed", sessionStats.reviewed, "#F1F5F9"], ["Recall Rate", `${pct}%`, "#10B981"], ["Total Mastered", masteredCards.length, "#F59E0B"]].map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "Georgia,serif" }}>{val}</span>
                <span style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6, margin: "0 0 28px" }}>
            {pct >= 80 ? "Outstanding recall!" : pct >= 60 ? "Good work — review the tricky ones again soon." : "Spaced repetition will reinforce these. You'll see them again."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={() => setScreen("dashboard")} style={s.reviewDashBtn}>← Dashboard</button>
            {dueCards.length > 0 && <button onClick={startQuiz} style={s.reviewAgainBtn}>Study More →</button>}
          </div>
        </div>
      </div>
    );
  }

  // ── UPLOAD ────────────────────────────────────────────────────────────────────
  if (screen === "upload") {
    const keySet = apiKey.trim().length > 0;
    return (
      <div style={s.uploadScreen}>
        <button onClick={() => setScreen("dashboard")} style={s.backBtn2}>← Dashboard</button>
        <h2 style={s.uploadTitle}>Upload AFP Articles</h2>
        <p style={s.uploadSub}>The AI extracts clinical content from AFP PDFs and generates spaced repetition cards automatically.</p>

        {/* API Key input */}
        <div style={s.apiKeyBox}>
          <div style={s.apiKeyHeader}>
            <span style={s.apiKeyLabel}>🔑 Anthropic API Key</span>
            {keySet && <span style={s.apiKeyBadge}>Saved</span>}
          </div>
          <p style={s.apiKeyHint}>
            Required for PDF uploads. Get your key at{" "}
            <a href="https://console.anthropic.com/keys" target="_blank" rel="noreferrer" style={{ color: "#60A5FA" }}>console.anthropic.com</a>.
            {" "}Stored only in your browser.
          </p>
          <div style={s.apiKeyRow}>
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onBlur={() => { if (apiKey.trim()) saveApiKey(apiKey.trim()); }}
              placeholder="sk-ant-api03-..."
              style={s.apiKeyInput}
            />
            <button onClick={() => setShowApiKey(v => !v)} style={s.apiKeyToggle}>
              {showApiKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {!uploading ? (
          <label style={{ ...s.dropZone, opacity: keySet ? 1 : 0.5 }}>
            <input type="file" accept=".pdf" multiple onChange={handleFileUpload} style={{ display: "none" }} disabled={!keySet} />
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#94A3B8" }}>
              {keySet ? "Click to select PDFs" : "Enter API key above first"}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569" }}>Supports multiple files at once</p>
          </label>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", gap: 16 }}>
            <div style={s.spinner} /><p style={{ color: "#94A3B8", fontSize: 14, textAlign: "center" }}>{uploadStatus}</p>
          </div>
        )}
        {(uploadStatus.startsWith("✓") || uploadStatus.startsWith("⚠️")) && (
          <div style={{ background: uploadStatus.startsWith("✓") ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", border: `1px solid ${uploadStatus.startsWith("✓") ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`, borderRadius: 10, padding: "12px 16px", color: uploadStatus.startsWith("✓") ? "#34D399" : "#FBB040", fontSize: 14, fontWeight: 600, textAlign: "center", marginBottom: 20 }}>{uploadStatus}</div>
        )}
        <div style={{ marginTop: 24 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Questions generated cover:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map(c => (
              <div key={c.id} style={{ fontSize: 12, border: `1px solid ${c.color}55`, borderRadius: 20, padding: "4px 12px", fontWeight: 600, color: c.color }}>{c.icon} {c.label}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ARTICLE PICKER MODAL ──────────────────────────────────────────────────────
  const ArticlePicker = () => {
    const allSelected = selectedArticles.size === 0;
    return (
      <div style={s.modalOverlay} onClick={() => setShowArticlePicker(false)}>
        <div style={s.modalBox} onClick={e => e.stopPropagation()}>
          <div style={s.modalHeader}>
            <h3 style={s.modalTitle}>Select Articles</h3>
            <button onClick={() => setShowArticlePicker(false)} style={s.modalClose}>✕</button>
          </div>
          <p style={s.modalSub}>Choose which articles to include in your study session.</p>

          {/* Quick actions */}
          <div style={s.pickerActions}>
            <button onClick={selectAll} style={{ ...s.pickerActionBtn, ...(allSelected ? s.pickerActionActive : {}) }}>
              ✓ All Articles {allSelected && <span style={s.activeDot} />}
            </button>
            <button onClick={selectNone} style={{ ...s.pickerActionBtn, ...(!allSelected && selectedArticles.size === articles.length ? s.pickerActionActive : {}) }}>
              None
            </button>
          </div>

          {/* Article list */}
          <div style={s.pickerList}>
            {articles.map(title => {
              const aCards = cards.filter(c => c.articleTitle === title);
              const aDue = aCards.filter(isDue).length;
              const isActive = allSelected || selectedArticles.has(title);
              const isSelected = selectedArticles.has(title);

              return (
                <div key={title} style={{ ...s.pickerItem, borderColor: isSelected ? "#3B82F666" : "rgba(148,163,184,0.1)", background: isSelected ? "rgba(59,130,246,0.07)" : "rgba(30,41,59,0.5)" }}>
                  <button onClick={() => toggleArticle(title)} style={s.pickerCheckArea}>
                    <div style={{ ...s.checkbox, borderColor: isSelected ? "#3B82F6" : "#334155", background: isSelected ? "#3B82F6" : "transparent" }}>
                      {isSelected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isSelected ? "#93C5FD" : "#CBD5E1", lineHeight: 1.4 }}>{title}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "#475569" }}>{aCards.length} cards · {aDue} due</p>
                    </div>
                  </button>
                  <button onClick={() => deleteArticle(title)} style={s.deleteArticleBtn} title="Delete article">🗑</button>
                </div>
              );
            })}
          </div>

          <div style={s.pickerFooter}>
            <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
              {allSelected ? `All ${articles.length} articles selected` : `${selectedArticles.size} of ${articles.length} selected`}
              {" · "}{dueCards.length} cards due
            </p>
            <button onClick={() => setShowArticlePicker(false)} style={s.pickerDone}>Done</button>
          </div>
        </div>
      </div>
    );
  };

  // ── DASHBOARD ─────────────────────────────────────────────────────────────────
  const allSelected = selectedArticles.size === 0;
  const selectionLabel = allSelected ? "All articles" : `${selectedArticles.size} article${selectedArticles.size !== 1 ? "s" : ""}`;

  return (
    <div style={s.dashboard}>
      {showArticlePicker && <ArticlePicker />}

      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.appTitle}>AFP<span style={s.titleAccent}> · SRS</span></h1>
          <p style={s.appSub}>Spaced Repetition · Family Medicine</p>
        </div>
        <button onClick={() => setScreen("upload")} style={s.uploadBtn}>+ Upload</button>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        {[
          { label: "Total Cards", value: cards.length, color: "#3B82F6" },
          { label: "Due Now", value: dueCards.length, color: dueCards.length > 0 ? "#F59E0B" : "#10B981" },
          { label: "Mastered", value: masteredCards.length, color: "#10B981" },
          { label: "Articles", value: articles.length, color: "#8B5CF6" },
        ].map(st => (
          <div key={st.label} style={s.statBox}>
            <span style={{ ...s.statNum, color: st.color }}>{st.value}</span>
            <span style={s.statLabel}>{st.label}</span>
          </div>
        ))}
      </div>

      {/* Article filter bar */}
      {articles.length > 0 && (
        <div style={s.filterBar}>
          <div style={s.filterLeft}>
            <span style={s.filterIcon}>📚</span>
            <span style={s.filterLabel}>{selectionLabel}</span>
          </div>
          <button onClick={() => setShowArticlePicker(true)} style={s.filterBtn}>
            Select Articles →
          </button>
        </div>
      )}

      {/* CTA */}
      {cards.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <h3 style={{ color: "#94A3B8", fontFamily: "Georgia,serif", margin: "0 0 8px" }}>No cards yet</h3>
          <p style={{ color: "#64748B", margin: "0 0 20px", fontSize: 14 }}>Upload AFP articles to generate your first cards</p>
          <button onClick={() => setScreen("upload")} style={s.uploadBtn}>Upload First Article</button>
        </div>
      ) : dueCards.length > 0 ? (
        <button onClick={startQuiz} style={s.studyNowBtn}>
          <span style={{ fontSize: 28 }}>🧠</span>
          <div>
            <p style={s.studyNowTitle}>Study {dueCards.length} Due Card{dueCards.length !== 1 ? "s" : ""}</p>
            <p style={s.studyNowSub}>{selectionLabel} · ready for review</p>
          </div>
          <span style={{ color: "#94A3B8", fontSize: 20 }}>→</span>
        </button>
      ) : (
        <div style={s.allDoneBox}>
          <span>✅</span>
          <p style={{ margin: 0, color: "#10B981", fontWeight: 600 }}>
            {filteredCards.length === 0 ? "No cards in selected articles." : "All caught up! Come back tomorrow."}
          </p>
        </div>
      )}

      {/* Articles list */}
      {articles.length > 0 && (
        <div style={s.section}>
          <p style={s.sectionTitle}>Articles in Deck</p>
          {articles.map(a => {
            const aCards = cards.filter(c => c.articleTitle === a);
            const aDue = aCards.filter(isDue).length;
            const isActive = allSelected || selectedArticles.has(a);
            return (
              <div key={a} style={{ ...s.articleRow, opacity: isActive ? 1 : 0.4, borderColor: isActive ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.05)" }}>
                <div style={{ flex: 1 }}>
                  <p style={s.articleName}>{a}</p>
                  <p style={s.articleMeta}>{aCards.length} cards · {aDue} due</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {aDue > 0 && isActive && <span style={s.articleDuePill}>{aDue} due</span>}
                  <button onClick={() => { setSelectedArticles(new Set([a])); startQuiz(); }} disabled={aDue === 0} style={{ ...s.studyArticleBtn, opacity: aDue === 0 ? 0.3 : 1 }}>Study</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cards.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 32, paddingBottom: 32 }}>
          <button onClick={async () => { if (!confirm("Delete ALL cards?")) return; setCards([]); await saveCards([]); }} style={s.clearBtn}>Clear All Cards</button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  loadingScreen: { minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0F172A" },
  spinner: { width:36, height:36, border:"3px solid rgba(148,163,184,0.2)", borderTop:"3px solid #3B82F6", borderRadius:"50%", animation:"spin 0.8s linear infinite" },

  dashboard: { minHeight:"100vh", background:"#0F172A", padding:"0 0 40px", fontFamily:"'DM Sans',system-ui,sans-serif", color:"#E2E8F0", maxWidth:640, margin:"0 auto" },
  header: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"28px 20px 0" },
  appTitle: { margin:0, fontSize:26, fontFamily:"Georgia,'Times New Roman',serif", fontWeight:700, color:"#F1F5F9", letterSpacing:-0.5 },
  titleAccent: { color:"#3B82F6" },
  appSub: { margin:"2px 0 0", fontSize:12, color:"#475569", letterSpacing:0.5, textTransform:"uppercase" },
  uploadBtn: { background:"#1E40AF", color:"#BFDBFE", border:"1px solid #3B82F655", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer" },

  statsRow: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, padding:"20px 20px 0" },
  statBox: { background:"rgba(30,41,59,0.7)", border:"1px solid rgba(148,163,184,0.1)", borderRadius:12, padding:"14px 10px", display:"flex", flexDirection:"column", alignItems:"center" },
  statNum: { fontSize:24, fontWeight:800, lineHeight:1, fontFamily:"Georgia,serif" },
  statLabel: { fontSize:10, color:"#64748B", marginTop:4, textAlign:"center", textTransform:"uppercase", letterSpacing:0.5 },

  filterBar: { display:"flex", justifyContent:"space-between", alignItems:"center", margin:"16px 20px 0", background:"rgba(30,41,59,0.5)", border:"1px solid rgba(148,163,184,0.1)", borderRadius:12, padding:"10px 14px" },
  filterLeft: { display:"flex", alignItems:"center", gap:8 },
  filterIcon: { fontSize:14 },
  filterLabel: { fontSize:13, fontWeight:600, color:"#94A3B8" },
  filterBtn: { fontSize:12, fontWeight:600, color:"#60A5FA", background:"transparent", border:"none", cursor:"pointer", padding:0 },

  emptyState: { margin:"40px 20px", background:"rgba(30,41,59,0.5)", border:"1px solid rgba(148,163,184,0.1)", borderRadius:16, padding:"40px 20px", textAlign:"center" },
  studyNowBtn: { display:"flex", alignItems:"center", gap:14, margin:"16px 20px 0", background:"linear-gradient(135deg,rgba(59,130,246,0.15),rgba(99,102,241,0.15))", border:"1px solid rgba(99,102,241,0.4)", borderRadius:14, padding:"18px 20px", cursor:"pointer", width:"calc(100% - 40px)", boxSizing:"border-box", textAlign:"left" },
  studyNowTitle: { margin:0, fontWeight:700, fontSize:16, color:"#F1F5F9" },
  studyNowSub: { margin:"2px 0 0", fontSize:12, color:"#64748B" },
  allDoneBox: { display:"flex", alignItems:"center", gap:10, margin:"16px 20px 0", background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)", borderRadius:12, padding:"16px 20px" },

  section: { margin:"28px 20px 0" },
  sectionTitle: { margin:"0 0 12px", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:1 },
  articleRow: { display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(30,41,59,0.5)", border:"1px solid", borderRadius:10, padding:"12px 16px", marginBottom:8, transition:"opacity 0.2s" },
  articleName: { margin:0, fontSize:13, fontWeight:600, color:"#CBD5E1" },
  articleMeta: { margin:"2px 0 0", fontSize:11, color:"#64748B" },
  articleDuePill: { fontSize:11, fontWeight:700, borderRadius:20, padding:"3px 10px", background:"rgba(245,158,11,0.15)", color:"#F59E0B", whiteSpace:"nowrap" },
  studyArticleBtn: { fontSize:11, fontWeight:700, color:"#60A5FA", background:"rgba(59,130,246,0.1)", border:"1px solid rgba(59,130,246,0.25)", borderRadius:8, padding:"4px 12px", cursor:"pointer" },
  clearBtn: { background:"transparent", color:"#475569", border:"1px solid #1E293B", borderRadius:8, padding:"8px 16px", fontSize:12, cursor:"pointer" },

  // Modal
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(4px)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:"0 0 0 0" },
  modalBox: { background:"#1E293B", border:"1px solid rgba(148,163,184,0.15)", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:620, maxHeight:"85vh", display:"flex", flexDirection:"column", overflow:"hidden" },
  modalHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 20px 0" },
  modalTitle: { margin:0, fontSize:18, fontFamily:"Georgia,serif", color:"#F1F5F9", fontWeight:700 },
  modalClose: { background:"transparent", border:"none", color:"#64748B", fontSize:18, cursor:"pointer", padding:4 },
  modalSub: { margin:"6px 20px 16px", fontSize:13, color:"#475569" },
  pickerActions: { display:"flex", gap:10, padding:"0 20px 12px" },
  pickerActionBtn: { fontSize:12, fontWeight:600, color:"#94A3B8", background:"rgba(30,41,59,0.6)", border:"1px solid rgba(148,163,184,0.1)", borderRadius:8, padding:"6px 14px", cursor:"pointer" },
  pickerActionActive: { background:"rgba(59,130,246,0.15)", color:"#60A5FA", borderColor:"rgba(59,130,246,0.3)" },
  activeDot: { width:6, height:6, borderRadius:"50%", background:"#3B82F6", display:"inline-block", marginLeft:6 },
  pickerList: { flex:1, overflowY:"auto", padding:"0 20px" },
  pickerItem: { display:"flex", alignItems:"center", border:"1px solid", borderRadius:12, marginBottom:8, overflow:"hidden", transition:"all 0.15s" },
  pickerCheckArea: { display:"flex", alignItems:"center", gap:12, flex:1, padding:"12px 14px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left" },
  checkbox: { width:20, height:20, borderRadius:6, border:"2px solid", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" },
  deleteArticleBtn: { background:"transparent", border:"none", cursor:"pointer", padding:"12px 14px", fontSize:14, color:"#475569", borderLeft:"1px solid rgba(148,163,184,0.08)" },
  pickerFooter: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderTop:"1px solid rgba(148,163,184,0.1)" },
  pickerDone: { background:"#1E40AF", color:"#BFDBFE", border:"1px solid #3B82F655", borderRadius:8, padding:"8px 20px", fontSize:13, fontWeight:600, cursor:"pointer" },

  // Upload
  uploadScreen: { minHeight:"100vh", background:"#0F172A", padding:"28px 20px", fontFamily:"'DM Sans',system-ui,sans-serif", color:"#E2E8F0", maxWidth:540, margin:"0 auto" },
  backBtn2: { background:"transparent", color:"#64748B", border:"none", cursor:"pointer", fontSize:14, padding:"0 0 20px", display:"block" },
  uploadTitle: { margin:"0 0 8px", fontSize:22, fontFamily:"Georgia,serif", fontWeight:700 },
  uploadSub: { margin:"0 0 20px", fontSize:13, color:"#64748B", lineHeight:1.6 },
  dropZone: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:"2px dashed rgba(99,102,241,0.4)", borderRadius:16, padding:"48px 20px", cursor:"pointer", textAlign:"center", marginBottom:24, background:"rgba(99,102,241,0.04)", transition:"opacity 0.2s" },
  apiKeyBox: { background:"rgba(30,41,59,0.6)", border:"1px solid rgba(148,163,184,0.12)", borderRadius:14, padding:"16px", marginBottom:20 },
  apiKeyHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 },
  apiKeyLabel: { fontSize:13, fontWeight:700, color:"#94A3B8" },
  apiKeyBadge: { fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"rgba(16,185,129,0.15)", color:"#34D399", border:"1px solid rgba(16,185,129,0.3)" },
  apiKeyHint: { margin:"0 0 10px", fontSize:12, color:"#475569", lineHeight:1.5 },
  apiKeyRow: { display:"flex", gap:8 },
  apiKeyInput: { flex:1, background:"rgba(15,23,42,0.8)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:8, padding:"8px 12px", color:"#E2E8F0", fontSize:13, fontFamily:"monospace", outline:"none" },
  apiKeyToggle: { background:"rgba(30,41,59,0.8)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:8, padding:"8px 12px", color:"#94A3B8", fontSize:12, cursor:"pointer", whiteSpace:"nowrap" },

  // Quiz
  quizScreen: { minHeight:"100vh", background:"#0F172A", padding:"0 0 32px", fontFamily:"'DM Sans',system-ui,sans-serif", color:"#E2E8F0", maxWidth:620, margin:"0 auto", display:"flex", flexDirection:"column" },
  progressBar: { height:3, background:"rgba(148,163,184,0.1)", position:"sticky", top:0, zIndex:10 },
  progressFill: { height:"100%", background:"linear-gradient(90deg,#3B82F6,#8B5CF6)", transition:"width 0.4s" },
  quizHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px" },
  backBtn: { background:"transparent", color:"#64748B", border:"none", cursor:"pointer", fontSize:13, padding:0 },
  catBadge: { fontSize:12, fontWeight:600, padding:"4px 10px", borderRadius:20 },
  counter: { fontSize:13, color:"#475569", fontWeight:600 },
  articleLabel: { margin:"0 20px 4px", fontSize:11, color:"#475569", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
  questionCard: { margin:"0 20px", background:"rgba(30,41,59,0.7)", border:"1px solid rgba(148,163,184,0.1)", borderRadius:14, padding:"20px" },
  questionText: { margin:0, fontSize:16, lineHeight:1.6, color:"#F1F5F9", fontFamily:"Georgia,serif" },
  optionsGrid: { display:"flex", flexDirection:"column", gap:10, padding:"16px 20px 0" },
  optionBtn: { display:"flex", alignItems:"flex-start", gap:12, borderRadius:12, padding:"14px 16px", cursor:"pointer", fontSize:14, lineHeight:1.5, textAlign:"left", transition:"all 0.15s", fontFamily:"inherit" },
  optionKey: { minWidth:22, height:22, borderRadius:6, background:"rgba(148,163,184,0.1)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#64748B", marginTop:1, flexShrink:0 },
  explanationBox: { margin:"16px 20px 0", background:"rgba(30,41,59,0.8)", border:"1px solid rgba(148,163,184,0.12)", borderRadius:12, padding:"16px" },
  explanationTitle: { margin:"0 0 8px", fontSize:12, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:0.5 },
  explanationText: { margin:0, fontSize:13, color:"#CBD5E1", lineHeight:1.65 },
  revealBtn: { margin:"20px 20px 0", background:"transparent", border:"1px dashed rgba(148,163,184,0.2)", borderRadius:10, padding:"10px 20px", color:"#475569", fontSize:13, cursor:"pointer" },
  qualityRow: { margin:"16px 20px 0" },
  qualityLabel: { margin:"0 0 10px", fontSize:11, color:"#475569", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
  qualityBtns: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 },
  qualityBtn: { display:"flex", flexDirection:"column", alignItems:"center", gap:2, background:"transparent", border:"1px solid", borderRadius:10, padding:"12px 6px", cursor:"pointer", fontFamily:"inherit" },

  // Review
  reviewScreen: { minHeight:"100vh", background:"#0F172A", display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'DM Sans',system-ui,sans-serif" },
  reviewCard: { background:"rgba(30,41,59,0.8)", border:"1px solid rgba(148,163,184,0.12)", borderRadius:20, padding:"40px 32px", maxWidth:420, width:"100%", textAlign:"center" },
  reviewTitle: { margin:"0 0 28px", fontSize:22, fontFamily:"Georgia,serif", color:"#F1F5F9" },
  reviewStats: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:20 },
  reviewDashBtn: { background:"transparent", border:"1px solid rgba(148,163,184,0.2)", borderRadius:10, padding:"10px 20px", color:"#94A3B8", fontSize:14, cursor:"pointer" },
  reviewAgainBtn: { background:"rgba(59,130,246,0.15)", border:"1px solid rgba(59,130,246,0.4)", borderRadius:10, padding:"10px 20px", color:"#93C5FD", fontSize:14, fontWeight:600, cursor:"pointer" },
};
