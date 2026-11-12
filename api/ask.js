// Vercel serverless function: Social Sally's AI analysis.
// Requires the MISTRAL_API_KEY environment variable in the Vercel project
// settings. The key is never exposed to the browser.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'AI service not configured. Set MISTRAL_API_KEY in the Vercel project environment variables.' });
  }

  const { company, research } = req.body || {};
  if (!company || !company.industry || !company.area || !company.description) {
    return res.status(400).json({ error: 'Missing company details (industry, area, description are required).' });
  }

  const system = 'You are Social Sally, a world-class sales and marketing advisor. ' +
    'You receive a company profile and live research findings. Produce a concise, ' +
    'specific and actionable growth strategy in plain language with these sections: ' +
    'Market Position, Competitor Angle, Local Opportunities, Brand Promise, ' +
    'Channel Priorities, 90-Day Roadmap, KPIs to Track. Be concrete, reference the ' +
    'company name, area, ideal customers, current marketing situation and stated goal. ' +
    'Maximum 600 words. Plain text with section headings.';

  const user = 'Company profile:\n' +
    'Name: ' + (company.name || 'Not provided') + '\n' +
    'Industry: ' + company.industry + '\n' +
    'Area of operation: ' + company.area + '\n' +
    'Ideal customers: ' + (company.customers || 'Not specified') + '\n' +
    'Website: ' + (company.website || 'none yet') + '\n' +
    'Services description: ' + company.description + '\n' +
    'Current marketing: ' + (company.currentMarketing || 'Not specified') + '\n' +
    'Six-month goal: ' + (company.goal || 'Not specified') + '\n\n' +
    'Live research findings:\n' + (research && research.length
      ? research.map(function (r) { return '- ' + r.title + ': ' + r.extract; }).join('\n')
      : 'None available.');

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        max_tokens: 1200,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({ error: 'AI request failed: ' + detail.slice(0, 200) });
    }

    const data = await response.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) return res.status(502).json({ error: 'AI returned an empty response.' });
    return res.status(200).json({ analysis: text });
  } catch (e) {
    return res.status(502).json({ error: 'AI request error: ' + e.message });
  }
}