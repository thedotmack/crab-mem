// Sensitive data patterns to filter out
const SENSITIVE_PATTERNS = [
  // API Keys & Tokens
  /sk-[a-zA-Z0-9]{20,}/gi,                    // OpenAI keys
  /sk-proj-[a-zA-Z0-9-_]{20,}/gi,             // OpenAI project keys
  /ghp_[a-zA-Z0-9]{36}/gi,                    // GitHub tokens
  /gho_[a-zA-Z0-9]{36}/gi,                    // GitHub OAuth
  /github_pat_[a-zA-Z0-9_]{22,}/gi,           // GitHub PAT
  /xox[baprs]-[a-zA-Z0-9-]{10,}/gi,           // Slack tokens
  /Bearer\s+[a-zA-Z0-9._-]{20,}/gi,           // Bearer tokens
  /token['":\s]+[a-zA-Z0-9._-]{20,}/gi,       // Generic tokens
  /api[_-]?key['":\s]+[a-zA-Z0-9._-]{16,}/gi, // API keys
  /secret['":\s]+[a-zA-Z0-9._-]{16,}/gi,      // Secrets
  
  // Crypto & Wallets
  /[13][a-km-zA-HJ-NP-Z1-9]{25,34}/g,         // Bitcoin addresses
  /0x[a-fA-F0-9]{40}/g,                        // Ethereum addresses
  /[1-9A-HJ-NP-Za-km-z]{32,44}/g,             // Solana addresses (but be careful, this is broad)
  
  // Auth cookies
  /auth_token['":\s]*[a-f0-9]{32,}/gi,        // Auth tokens
  /ct0['":\s]*[a-f0-9]{32,}/gi,               // Twitter ct0
  /session[_-]?id['":\s]*[a-zA-Z0-9._-]{16,}/gi,
  
  // Passwords & credentials
  /password['":\s]+[^\s'"]{8,}/gi,
  /passwd['":\s]+[^\s'"]{8,}/gi,
  /credential[s]?['":\s]+/gi,
  
  // Private keys
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
  /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/gi,
  
  // Database connection strings
  /mongodb(\+srv)?:\/\/[^\s]+/gi,
  /postgres(ql)?:\/\/[^\s]+/gi,
  /mysql:\/\/[^\s]+/gi,
  /redis:\/\/[^\s]+/gi,
  
  // AWS
  /AKIA[0-9A-Z]{16}/g,                         // AWS Access Key ID
  /aws[_-]?secret[_-]?access[_-]?key/gi,
  
  // Environment variables with sensitive names
  /ANTHROPIC_API_KEY/gi,
  /OPENAI_API_KEY/gi,
  /OPENROUTER_API_KEY/gi,
  /VERCEL_TOKEN/gi,
  /MOLTBOOK.*API/gi,
];

// Check if text contains sensitive data
function containsSensitiveData(text) {
  if (!text) return false;
  const str = String(text);
  return SENSITIVE_PATTERNS.some(pattern => {
    pattern.lastIndex = 0; // Reset regex state
    return pattern.test(str);
  });
}

// Check entire observation object
function isSensitiveObservation(obs) {
  const fieldsToCheck = [
    obs.title,
    obs.subtitle,
    obs.narrative,
    obs.text,
    obs.facts,
    obs.files_read,
    obs.files_modified,
  ];
  
  return fieldsToCheck.some(field => containsSensitiveData(field));
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Fetch more than requested to account for filtered items
    const requestedLimit = parseInt(req.query.limit) || 20;
    const requestedOffset = parseInt(req.query.offset) || 0;
    const fetchLimit = Math.min(requestedLimit * 3, 100); // Fetch 3x to have buffer
    
    const response = await fetch(`http://76.13.118.118:37777/api/observations?limit=${fetchLimit}&offset=${requestedOffset}`);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filter out sensitive observations
    const filteredItems = (data.items || [])
      .filter(obs => !isSensitiveObservation(obs))
      .slice(0, requestedLimit);
    
    const filteredCount = (data.items || []).length - filteredItems.length;
    
    res.status(200).json({
      items: filteredItems,
      hasMore: data.hasMore || filteredItems.length < (data.items || []).length,
      offset: data.offset || 0,
      limit: requestedLimit,
      filtered: filteredCount, // Show how many were filtered (for transparency)
    });
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch observations', details: error.message });
  }
}
