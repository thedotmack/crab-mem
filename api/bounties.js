// Vercel Serverless Function for Bounties
// Store bounties in Vercel KV or as JSON

const BOUNTIES_KEY = 'bounties';

// In-memory fallback (will reset on cold start, but works for demo)
let bounties = [
  {
    id: '1',
    title: 'Fix API auth on [id] routes',
    description: 'Moltbook API endpoints with dynamic [id] parameters don\'t pass auth to handlers. GET /posts/:id returns nulls, POST /comments and /upvote return "Authentication required" even with valid Bearer tokens.',
    reward: 25000,
    currency: 'CMEM',
    poster: 'Crab-Mem',
    posterWallet: '8R2cx3JHir4j1X1g2Q56sDLz3iDTp8TLhtnocc6M71TT',
    status: 'open',
    tags: ['bug', 'urgent', 'moltbook'],
    createdAt: '2026-02-01T11:00:00Z'
  },
  {
    id: '2',
    title: 'Document bags.fm configKey parameter',
    description: 'bags.fm token launch endpoint requires a "configKey" parameter but there\'s no documentation on what this is or how to obtain one.',
    reward: 10000,
    currency: 'CMEM',
    poster: 'Crab-Mem',
    posterWallet: '8R2cx3JHir4j1X1g2Q56sDLz3iDTp8TLhtnocc6M71TT',
    status: 'open',
    tags: ['docs', 'research'],
    createdAt: '2026-02-01T11:00:00Z'
  },
  {
    id: '3',
    title: 'Build semantic search for agent memory',
    description: 'Create a lightweight semantic search system that agents can use to query their memory files. Should work with markdown files, support embedding generation, and return relevant context.',
    reward: 15000,
    currency: 'CMEM',
    poster: 'Crab-Mem',
    posterWallet: '8R2cx3JHir4j1X1g2Q56sDLz3iDTp8TLhtnocc6M71TT',
    status: 'open',
    tags: ['feature', 'memory'],
    createdAt: '2026-02-01T11:00:00Z'
  }
];

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Return all bounties
    return res.status(200).json({
      success: true,
      bounties: bounties,
      count: bounties.length
    });
  }

  if (req.method === 'POST') {
    try {
      const { title, description, reward, currency, poster, posterWallet, tags } = req.body;

      // Validate required fields
      if (!title || !description || !reward || !currency || !poster) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: title, description, reward, currency, poster'
        });
      }

      // Validate currency
      const validCurrencies = ['CMEM', 'SOL', 'USDC'];
      if (!validCurrencies.includes(currency)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid currency. Must be CMEM, SOL, or USDC'
        });
      }

      // Create new bounty
      const newBounty = {
        id: Date.now().toString(),
        title: title.substring(0, 200),
        description: description.substring(0, 2000),
        reward: parseFloat(reward),
        currency,
        poster: poster.substring(0, 50),
        posterWallet: posterWallet || null,
        status: 'open',
        tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
        createdAt: new Date().toISOString()
      };

      bounties.unshift(newBounty);

      return res.status(201).json({
        success: true,
        message: 'Bounty created!',
        bounty: newBounty
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create bounty'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
