

// ---- Feature: Social Sally -----------------------------------------------
// Guided sales and marketing advisor. Captures company details, then builds a
// tailored growth plan from a structured industry knowledge base.

const SALLY_KEY = 'nicom-ai-sally-profiles-v1';

function sallyLoadProfiles() {
  try { return JSON.parse(localStorage.getItem(SALLY_KEY)) || []; } catch (e) { return []; }
}
function sallySaveProfile(p) {
  const list = sallyLoadProfiles();
  list.push(p);
  try { localStorage.setItem(SALLY_KEY, JSON.stringify(list.slice(-50))); } catch (e) {}
}

const SALLY_INDUSTRIES = {
  retail: {
    label: 'Retail (physical or online store)',
    competitors: ['National retail chains', 'Local independent shops', 'Online marketplaces (Takealot, Amazon, Shein)'],
    channels: ['Instagram and Facebook shops with product tagging', 'Google Business Profile with local SEO', 'WhatsApp Business catalogue for orders', 'Weekly promotions and loyalty programmes'],
    opportunities: ['Partner with complementary local businesses for cross-promotion', 'Offer local delivery or click-and-collect', 'Host in-store or community events'],
    kpis: ['Footfall or site visits', 'Conversion rate', 'Average basket size', 'Repeat customer rate']
  },
  hospitality: {
    label: 'Hospitality (restaurant, caf\u00e9, guest house)',
    competitors: ['Nearby restaurants or accommodation', 'Delivery platforms', 'Booking sites (Booking.com, Airbnb)'],
    channels: ['Instagram food and venue photography', 'Google and TripAdvisor review management', 'Local food influencers', 'Weekly specials via WhatsApp and email'],
    opportunities: ['Host local events, tastings or live music', 'Corporate lunch or conference packages', 'Collaborate with nearby attractions'],
    kpis: ['Occupancy or covers per day', 'Average spend per guest', 'Review scores', 'Repeat booking rate']
  },
  professional: {
    label: 'Professional services (consulting, finance, legal)',
    competitors: ['National firms with local branches', 'Boutique local consultancies', 'Freelance specialists'],
    channels: ['LinkedIn thought leadership and articles', 'Targeted email newsletters', 'Webinars and workshops', 'Referral partnerships with adjacent firms'],
    opportunities: ['Free diagnostic workshops for local businesses', 'Chamber of commerce and industry association membership', 'Local business awards entries for credibility'],
    kpis: ['Qualified leads per month', 'Proposal win rate', 'Client lifetime value', 'Referral share of new business']
  },
  trades: {
    label: 'Trades and construction (building, plumbing, electrical)',
    competitors: ['Established local contractors', 'Franchise operators', 'Informal independent traders'],
    channels: ['Google Business Profile with project photos and reviews', 'Facebook community groups and local marketplaces', 'Before-and-after project galleries on Instagram', 'Vehicle branding and site signage'],
    opportunities: ['Municipal and property-management contracts', 'Maintenance retainers with estates and complexes', 'Partnerships with architects and estate agents'],
    kpis: ['Quote-to-job conversion rate', 'Job value average', 'Repeat maintenance contracts', 'Review volume and rating']
  },
  tech: {
    label: 'Technology and software',
    competitors: ['Global SaaS platforms', 'Local development agencies', 'In-house teams'],
    channels: ['Content marketing and SEO around client problems', 'LinkedIn outreach to decision makers', 'Product-led free trials or demos', 'Case studies and testimonials'],
    opportunities: ['Local enterprise digital-transformation budgets', 'Partnerships with ICT resellers', 'Government and school digitisation tenders'],
    kpis: ['Trial-to-paid conversion', 'Monthly recurring revenue', 'Churn rate', 'Sales cycle length']
  },
  health: {
    label: 'Health and wellness',
    competitors: ['Nearby clinics, gyms or practices', 'National franchises', 'Online alternatives'],
    channels: ['Google Business Profile and health directory listings', 'Educational content and short videos', 'Community wellness events and screenings', 'Referral relationships with doctors and pharmacies'],
    opportunities: ['Corporate wellness programmes', 'Medical scheme partnerships', 'Senior and school community programmes'],
    kpis: ['New patient or member numbers', 'Appointment utilisation', 'Package retention', 'Referral counts']
  },
  other: {
    label: 'Other',
    competitors: ['Direct local providers of similar services', 'National brands expanding into the area', 'Substitute solutions customers use instead'],
    channels: ['Google Business Profile and local SEO', 'Social media on the platform your customers use most', 'Email and WhatsApp nurture lists', 'Local networking and partnerships'],
    opportunities: ['Local business associations and networking events', 'Partnerships with complementary providers', 'Community sponsorships for visibility'],
    kpis: ['Leads per month', 'Conversion rate', 'Customer retention', 'Revenue per customer']
  }
};

function renderSocialSally(root) {
  root.innerHTML =
    '<h2>Social Sally</h2>' +
    '<p class="subtitle">Sales and marketing advisor. Answer four questions and Sally will research your industry and build your growth plan.</p>' +
    '<div id="sally-body"></div>';

  const body = root.querySelector('#sally-body');
  renderSallyForm(body);
}

function renderSallyForm(body) {
  body.innerHTML =
    '<form id="sally-form" class="sally-form">' +
    '  <label>1. What industry is your company in?' +
    '    <select id="sally-industry">' +
    Object.keys(SALLY_INDUSTRIES).map(function (k) {
      return '<option value="' + k + '">' + SALLY_INDUSTRIES[k].label + '</option>';
    }).join('') +
    '    </select></label>' +
    '  <label>2. Area of operation (town, city or region)' +
    '    <input id="sally-area" type="text" placeholder="e.g. Cape Town, Western Cape" required /></label>' +
    '  <label>3. Website address (or "none yet")' +
    '    <input id="sally-website" type="text" placeholder="e.g. www.mycompany.co.za" /></label>' +
    '  <label>4. Describe your business services or products' +
    '    <textarea id="sally-desc" rows="4" placeholder="What do you sell, to whom, and what makes you different?" required></textarea></label>' +
    '  <button type="submit" class="joe-btn sally-go">Build my growth plan</button>' +
    '</form>';

  body.querySelector('#sally-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const profile = {
      industry: body.querySelector('#sally-industry').value,
      area: body.querySelector('#sally-area').value.trim(),
      website: body.querySelector('#sally-website').value.trim(),
      description: body.querySelector('#sally-desc').value.trim(),
      createdAt: new Date().toISOString()
    };
    sallySaveProfile(profile);
    renderSallyPlan(body, profile);
  });
}

function renderSallyPlan(body, p) {
  const ind = SALLY_INDUSTRIES[p.industry] || SALLY_INDUSTRIES.other;
  const desc = p.description;
  const firstWords = desc.split(/[,.]/)[0].trim();

  body.innerHTML =
    '<div class="sally-plan">' +
    '  <div class="sally-header"><strong>Growth plan for:</strong> ' + firstWords + ' &mdash; ' + p.area + '</div>' +

    '  <h3>1. Industry snapshot</h3>' +
    '  <p>You operate in the ' + ind.label.toLowerCase() + ' sector in ' + p.area + '. Growth in this sector is driven by' +
    '  visibility, trust and repeat business. World-class companies in this space win by being the most findable,' +
    '  the most recommended and the most consistent provider in their local market before expanding outward.</p>' +

    '  <h3>2. Competitor landscape</h3>' +
    '  <p>Your competitors will typically include:</p><ul>' +
    ind.competitors.map(function (c) { return '<li>' + c + '</li>'; }).join('') +
    '  </ul>' +
    '  <p><strong>Your research task (this week):</strong> identify the top 5 competitors in ' + p.area +
    '  by searching Google and social media as a customer would. Record for each: their pricing, their reviews' +
    '  (score and common complaints), their website quality' + (p.website && p.website !== 'none yet' ? ' compared to yours (' + p.website + ')' : ' (you have no website yet: this is your first gap to close)') +
    ', and their social media activity. Your opportunity lies in the complaints customers leave: every recurring' +
    '  complaint against competitors is a promise you can make and keep.</p>' +

    '  <h3>3. Local opportunities in ' + p.area + '</h3><ul>' +
    ind.opportunities.map(function (o) { return '<li>' + o + '</li>'; }).join('') +
    '  </ul>' +

    '  <h3>4. Positioning to become world class</h3>' +
    '  <p>Define one clear promise based on what your customers value most in your description: "' + desc.slice(0, 120) +
    (desc.length > 120 ? '..."' : '"') +
    '  Position your company as the specialist, not the generalist: publish your process, guarantee your standards,' +
    '  and collect proof (reviews, case studies, before-and-after results) from every single client.</p>' +

    '  <h3>5. Marketing channels to activate</h3><ul>' +
    ind.channels.map(function (c) { return '<li>' + c + '</li>'; }).join('') +
    '  </ul>' +

    '  <h3>6. Ninety-day action plan</h3>' +
    '  <ul>' +
    '    <li><strong>Days 1-14:</strong> Complete your Google Business Profile, fix or launch your website landing page,' +
    '    set up or clean up your main social profile, and gather your first 10 reviews from existing customers.</li>' +
    '    <li><strong>Days 15-30:</strong> Publish your core message and offer, contact 5 complementary local businesses' +
    '    for partnerships, and start one content rhythm (one useful post per week).</li>' +
    '    <li><strong>Days 31-60:</strong> Launch one local campaign (event, special or workshop), begin systematic' +
    '    follow-up with past customers, and track your KPIs weekly.</li>' +
    '    <li><strong>Days 61-90:</strong> Double down on the channel producing the best leads, formalise referral' +
    '    incentives, and document your service standards so quality scales with demand.</li>' +
    '  </ul>' +

    '  <h3>7. Measure these numbers</h3><ul>' +
    ind.kpis.map(function (k) { return '<li>' + k + '</li>'; }).join('') +
    '  </ul>' +

    '  <p class="joe-note">Sally bases this plan on your captured details and her built-in industry knowledge base.' +
    '  For live web research on named competitors, a backend research service will need to be connected later.</p>' +
    '  <button id="sally-again" class="joe-btn">Advise another company</button>' +
    '</div>';

  body.querySelector('#sally-again').addEventListener('click', function () {
    renderSallyForm(body);
  });
}