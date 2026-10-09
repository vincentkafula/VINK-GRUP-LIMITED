// Content for the Social Responsibility page (source: Social Development website content).
// Each tab is a list of blocks, rendered in order by CorporateSocialResponsibilityViewer.

export type Block =
  | { t: "lead"; text: string }
  | { t: "p"; text: string }
  | { t: "note"; text: string }
  | { t: "h"; text: string }
  | { t: "list"; items: string[] }
  | { t: "pairs"; items: { label: string; value: string }[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "cta"; actions: string[] };

export interface Tab { label: string; title: string; blocks: Block[] }

const ROLLOUT = "These services will be rolled out city by city as each programme launches.";

export const TABS: Tab[] = [
  {
    label: "About",
    title: "About Social Development",
    blocks: [
      { t: "lead", text: "Cleaner, safer and more inclusive cities across South Africa and Zambia." },
      { t: "p", text: "Social Development is the social responsibility arm of VINK. We exist to help our cities become cleaner, safer, more inclusive and more economically vibrant." },
      { t: "p", text: "A dedicated portion of VINK’s profits is allocated to fund our programmes. A professional management team delivers them in partnership with local businesses, non-governmental organisations and non-profit organisations. We start in one precinct, prove the model, and then replicate it. We are preparing to bring it to seven cities across South Africa and Zambia: Cape Town, Johannesburg, Pretoria, Durban, Lusaka, Kitwe and Ndola." },
      { t: "h", text: "Our mission" },
      { t: "p", text: "To build safe, clean, welcoming and inclusive urban environments where businesses can thrive, residents feel secure and every person has the opportunity to rise." },
      { t: "h", text: "What we do" },
      { t: "list", items: [
        "Provide visible safety and security support alongside the police and metropolitan authorities",
        "Keep public spaces clean, attractive and well maintained",
        "Connect vulnerable people to shelter, care, skills and work",
        "Tell the story of our cities and promote them as places to live, work, play, visit and invest",
      ] },
      { t: "h", text: "How we are organised" },
      { t: "p", text: "Our work is led by five teams: the Office of the CEO, Safety & Security, Urban Management, Social Development, and Communications. Each is described on its own tab." },
      { t: "h", text: "Our values" },
      { t: "pairs", items: [
        { label: "Dignity", value: "every person is treated with respect." },
        { label: "Partnership", value: "we work with, not instead of, government, business and civil society." },
        { label: "Accountability", value: "we report openly on how funds are used and what they achieve." },
        { label: "Local impact", value: "each city programme is shaped by the needs of its own communities." },
      ] },
    ],
  },
  {
    label: "Cities We Serve",
    title: "Cities We Serve",
    blocks: [
      { t: "p", text: "Social Development is being built to serve seven cities across two countries. Each programme follows the same model, funded by VINK profits and delivered with local business, NGO and non-profit partners." },
      { t: "note", text: "All cities are coming soon." },
      { t: "h", text: "South Africa" },
      { t: "pairs", items: [
        { label: "Cape Town (Western Cape)", value: "Coming soon" },
        { label: "Johannesburg (Gauteng)", value: "Coming soon" },
        { label: "Pretoria (Gauteng)", value: "Coming soon" },
        { label: "Durban (KwaZulu-Natal)", value: "Coming soon" },
      ] },
      { t: "h", text: "Zambia" },
      { t: "pairs", items: [
        { label: "Lusaka (Lusaka Province)", value: "Coming soon" },
        { label: "Kitwe (Copperbelt Province)", value: "Coming soon" },
        { label: "Ndola (Copperbelt Province)", value: "Coming soon" },
      ] },
      { t: "h", text: "One model, local delivery" },
      { t: "p", text: "In every city we work with local partners who understand the area: businesses and property owners, community organisations, shelters and skills-development NGOs, and the relevant police and municipal authorities. Priorities differ from city to city, so each programme begins with a consultation and needs assessment before services are rolled out." },
      { t: "h", text: "Public safety partners by city" },
      { t: "note", text: "Planned partners, to be confirmed in each city." },
      { t: "table", head: ["City", "Planned primary public safety partners"], rows: [
        ["Cape Town", "South African Police Service (SAPS), City of Cape Town Law Enforcement"],
        ["Johannesburg", "SAPS, Johannesburg Metropolitan Police Department"],
        ["Pretoria", "SAPS, Tshwane Metropolitan Police Department"],
        ["Durban", "SAPS, eThekwini Metropolitan Police"],
        ["Lusaka, Kitwe and Ndola", "Zambia Police Service, local council authorities"],
      ] },
      { t: "h", text: "Be part of the launch" },
      { t: "p", text: "We are building our partner network now. If you are a business owner, property owner, NGO, non-profit or community organisation in any of these cities, get in touch to discuss how we can work together from day one." },
      { t: "cta", actions: ["Register your interest", "Become a partner"] },
    ],
  },
  {
    label: "Office of the CEO",
    title: "Administration: Office of the CEO",
    blocks: [
      { t: "p", text: "The Office of the Chief Executive Officer sets the strategy behind everything Social Development does. It oversees the day-to-day running of all four operational departments and makes sure each city programme meets the same standard of delivery, accountability and impact." },
      { t: "h", text: "What this office does" },
      { t: "list", items: [
        "Sets the long-term vision and strategy for every city we serve",
        "Coordinates the work of all departments so they operate as one team",
        "Leads special projects, new programmes and research into emerging urban challenges",
        "Develops new products and services for business owners, property owners, residents and other stakeholders",
        "Manages partnerships with businesses, NGOs, non-profit organisations and government bodies",
        "Oversees financial administration, including the responsible allocation of profit-funded budgets",
        "Leads human resources, recruitment, training and staff development",
      ] },
      { t: "h", text: "Our commitment" },
      { t: "p", text: "We hold ourselves to transparent reporting, sound financial governance and measurable results. Every city programme is reviewed regularly so that funding goes where it makes the greatest difference." },
    ],
  },
  {
    label: "Safety & Security Department",
    title: "Safety & Security",
    blocks: [
      { t: "note", text: ROLLOUT },
      { t: "p", text: "A safe city is the foundation of a thriving economy. Our Safety & Security department works to create secure, welcoming environments where people can live, work, trade and visit with confidence." },
      { t: "h", text: "How we operate" },
      { t: "p", text: "Our trained Public Safety Officers are deployed on foot and by vehicle, in clearly identifiable uniforms. They complement the work of our primary safety partners: the South African Police Service and metropolitan police departments in South Africa, and the Zambia Police Service in Zambia. We do not replace these agencies. We support them with additional eyes, ears and rapid response." },
      { t: "h", text: "Our services" },
      { t: "list", items: [
        "Visible patrols with day and night supervision",
        "A control room for radio communication, coordination and incident tracking",
        "Rapid response units to attend to incidents quickly",
        "Body-worn cameras to promote accountability, professional conduct and evidence gathering",
        "Mobile kiosks and visible safety points within our precincts",
        "Joint operations and information sharing with law enforcement, community police forums, neighbourhood watches and neighbouring improvement districts",
        "Close working relationships with local businesses, building a broad network of community eyes and ears",
      ] },
      { t: "h", text: "Partnerships with the law" },
      { t: "p", text: "Where required, we work alongside law enforcement officers who hold the authority to make arrests and issue fines, so that safety interventions carry the full reach of the law." },
      { t: "h", text: "A note on CCTV footage" },
      { t: "p", text: "Public CCTV networks are normally owned and operated by the relevant municipality or authority, not by VINK. Requests for footage are generally made through the police, once a case has been opened, or through the applicable access-to-information process. We will publish the correct procedure for each city we operate in." },
    ],
  },
  {
    label: "Urban Management",
    title: "Urban Management",
    blocks: [
      { t: "note", text: ROLLOUT },
      { t: "p", text: "Clean, well-maintained public spaces attract investment, support local trade and give residents pride in their city. Urban Management works around the clock to keep our precincts clean, attractive and functional." },
      { t: "h", text: "How we work" },
      { t: "p", text: "Our team walks the precinct daily, noting defects, recording changes and speaking directly with retailers and property owners. We provide top-up services over and above those delivered by the municipality, and we coordinate our cleaning and maintenance teams to fix even the smallest problems quickly. Where an issue belongs to the municipality, we report it to the relevant department and follow it up." },
      { t: "h", text: "Our services" },
      { t: "list", items: [
        "Street sweeping, litter picking and emptying of public bins",
        "Removal of waste, including illegally dumped waste",
        "Clearing of stormwater drains, gullies and channels to reduce flood risk in the rainy season",
        "Removal of graffiti, illegal posters and stickers",
        "Monitoring of streetlights and reporting of outages and faults",
        "Planting, tree trimming and maintenance of tree wells",
        "Beautification projects such as painting benches, lampposts, railings and bollards, and seasonal floral and festive displays",
        "Minor road and pavement repairs, road marking and signage maintenance",
        "Pest control monitoring",
      ] },
      { t: "h", text: "Creating jobs while cleaning cities" },
      { t: "p", text: "We partner with professional cleaning contractors for day and night shifts, so streets are cleared of debris before business starts each morning. We also work with skills-development NGOs to create work opportunities for people who are unemployed or living on the street. Participants build routine, take on responsibility, regularise their personal documents and gain practical skills, helping them become more employable and move toward a more stable future." },
      { t: "h", text: "Public awareness" },
      { t: "p", text: "We run anti-litter education campaigns that explain the environmental and financial cost of littering and encourage everyone to take ownership of their city." },
    ],
  },
  {
    label: "Social Development",
    title: "Social Development",
    blocks: [
      { t: "note", text: ROLLOUT },
      { t: "p", text: "A city is only successful when it works for everyone. Our Social Development team engages daily with the most vulnerable people in our precincts, particularly people living on the streets, and connects them to the support they need." },
      { t: "h", text: "Our approach" },
      { t: "p", text: "Lasting change begins with trust. Our qualified social workers and field workers build relationships with people over time, treating each person with dignity and without stigma. We recognise the challenges many face, including lack of housing, limited resources, mental health and substance-use challenges, safety concerns, discrimination and limited employment opportunities." },
      { t: "h", text: "What we do" },
      { t: "list", items: [
        "Daily outreach and individual assessment",
        "Referrals to shelters, rehabilitation, medical and mental health care",
        "Family reunification and reintegration support",
        "Links to employment opportunities and skills-development programmes",
        "Help to obtain identity documents and other essential paperwork",
        "Access to safe places to sleep",
        "Harm-reduction support, guided by qualified professionals",
      ] },
      { t: "h", text: "Working with partners" },
      { t: "p", text: "We cannot do this alone. In Cape Town, Johannesburg, Pretoria, Durban, Lusaka, Kitwe and Ndola, Social Development will work with established NGOs and non-profit organisations that provide accommodation, family reunification, skills training, vocational programmes, work-based rehabilitation and faith-based support. We fund and coordinate these partnerships, and we invite new organisations that share our goals to work with us." },
      { t: "h", text: "Give responsibly, show you care" },
      { t: "p", text: "Giving money directly on the street, though well meant, often does not lead to lasting change. We encourage the public to support the registered organisations that provide shelter, food, training and rehabilitation, or to volunteer and share information about these services. Details on how to donate to our partner organisations will be published for each city." },
      { t: "h", text: "Partner with us" },
      { t: "p", text: "Are you an NGO, non-profit or business that wants to be part of this work? Contact our team to explore how we can work together." },
      { t: "cta", actions: ["Become a partner"] },
    ],
  },
  {
    label: "Communications",
    title: "Communications",
    blocks: [
      { t: "p", text: "The Communications department tells the story of Social Development and builds the trust that makes our work possible. While the other departments work on the ground, Communications supports them all, keeping a clear, consistent and honest message across every city." },
      { t: "h", text: "What we do" },
      { t: "list", items: [
        "Keep stakeholders, residents, partners and the public informed about our work",
        "Research and write editorial content, reports and publications",
        "Produce educational and awareness materials",
        "Run departmental campaigns, including anti-litter and “give responsibly” initiatives",
        "Plan and host stakeholder events, including an annual business breakfast",
        "Manage our website, social media and online platforms",
        "Issue press releases and handle media enquiries",
        "Maintain strong relationships with business owners, property owners, government and community groups",
      ] },
      { t: "h", text: "Promoting our cities" },
      { t: "p", text: "We also promote each city we serve as a place to live, work, play, visit and invest: inclusive, safe, clean and full of opportunity." },
    ],
  },
  {
    label: "Get Involved",
    title: "Get Involved",
    blocks: [
      { t: "p", text: "Safer, cleaner and more inclusive cities are built by many hands. There are several ways to be part of Social Development as we prepare to launch." },
      { t: "h", text: "Businesses and property owners" },
      { t: "p", text: "Join our partner network, help shape the services in your precinct and be among the first to benefit when your city launches." },
      { t: "h", text: "NGOs and non-profit organisations" },
      { t: "p", text: "If you provide shelter, skills training, rehabilitation, family reunification or other support, we want to hear from you. Our programmes are built around strong local partners." },
      { t: "h", text: "Community organisations and residents" },
      { t: "p", text: "Tell us what matters most in your area. Our consultations will guide where we start and what we prioritise." },
      { t: "cta", actions: ["Register your interest", "Become a partner"] },
    ],
  },
];
