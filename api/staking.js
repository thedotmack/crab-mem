const bs58 = require('bs58');

const RPC = 'https://solana-mainnet.core.chainstack.com/4b5d10489d562e85842bb86306766cbd';
const POOL_ADDR = '2uBHsavcfVQAgs8nMuMwogaap9BV1MwQuADearz1e6Kg';
const STAKE_PROGRAM = 'STAKEvGqQTtzJZH6BWDcbpzXXn2BBerPAgQ3EGLN2GH';
const DECIMALS = 1e9; // CMEM has 9 decimals

async function rpcCall(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function readU64LE(buf, offset) {
  // Read as two 32-bit values to handle large numbers
  const lo = buf[offset] | (buf[offset+1] << 8) | (buf[offset+2] << 16) | ((buf[offset+3] << 24) >>> 0);
  const hi = buf[offset+4] | (buf[offset+5] << 8) | (buf[offset+6] << 16) | ((buf[offset+7] << 24) >>> 0);
  return (hi >>> 0) * 0x100000000 + (lo >>> 0);
}

function readI64LE(buf, offset) {
  return readU64LE(buf, offset);
}

function pubkeyToBase58(buf, offset) {
  return bs58.encode(buf.slice(offset, offset + 32));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    // Fetch pool account
    const poolResult = await rpcCall('getAccountInfo', [
      POOL_ADDR,
      { encoding: 'base64' },
    ]);

    let totalStaked = 0;
    let maxDuration = 0;
    let minDuration = 0;

    if (poolResult?.value?.data?.[0]) {
      const poolBuf = Buffer.from(poolResult.value.data[0], 'base64');
      // Layout: disc(8) + bump(1) + nonce(1) + mint(32) + creator(32) + authority(32) = 106
      // minWeight(8) + maxWeight(8) + minDuration(8) + maxDuration(8) + permissionless(1) + vault(32) + stakeMint(32) = +97 = 203
      // totalStake(8) at offset 203
      minDuration = readU64LE(poolBuf, 122); // 106 + 8 + 8 = 122
      maxDuration = readU64LE(poolBuf, 130); // 122 + 8
      totalStaked = readU64LE(poolBuf, 203) / DECIMALS;
    }

    // Fetch stake entries
    // Discriminator filter: base58 "YMx1BScecEs" at offset 0
    // Pool filter: pool pubkey at offset 12
    const entriesResult = await rpcCall('getProgramAccounts', [
      STAKE_PROGRAM,
      {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: 0, bytes: 'YMx1BScecEs' } },
          { memcmp: { offset: 12, bytes: POOL_ADDR } },
        ],
      },
    ]);

    const stakers = [];
    if (entriesResult) {
      for (const entry of entriesResult) {
        const buf = Buffer.from(entry.account.data[0], 'base64');
        // StakeEntry: disc(8) + nonce(4) + stakePool(32) + payer(32) + authority(32) + amount(8) + duration(8) + effectiveAmount(16) + createdTs(8) + closedTs(8)
        const authority = pubkeyToBase58(buf, 76); // 8+4+32+32 = 76
        const amount = readU64LE(buf, 108) / DECIMALS; // 76+32 = 108
        const duration = readU64LE(buf, 116); // 108+8
        const createdTs = readU64LE(buf, 140); // 116+8+16 = 140
        const closedTs = readU64LE(buf, 148); // 140+8

        if (closedTs === 0) {
          stakers.push({
            address: authority,
            amount,
            duration: Math.round(duration / 86400), // seconds to days
            createdTs,
          });
        }
      }
    }

    // Sort by amount descending
    stakers.sort((a, b) => b.amount - a.amount);

    res.json({
      pool: {
        totalStaked,
        minDuration: Math.round(minDuration / 86400),
        maxDuration: Math.round(maxDuration / 86400),
        stakerCount: stakers.length,
        expiry: '2027-01-26T05:00:00Z',
      },
      stakers,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Staking API error:', err);
    res.status(500).json({ error: 'Failed to fetch staking data', message: err.message });
  }
};
