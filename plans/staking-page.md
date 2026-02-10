# $CMEM Staking Landing Page — Implementation Plan

**Created:** 2026-02-09  
**Target URL:** staking.cmem.ai  
**Status:** Planning

---

## Phase 0: Documentation Discovery (Findings)

### Existing Project Structure
- **Location:** `/Projects/crab-mem/`
- **vercel.json:** `{ "cleanUrls": true, "trailingSlash": false }` — minimal config, easy to extend
- **Vercel project:** `prj_7DiPFIwVOyDaq1F0Dqc81x8OLFD9` (org: `team_sVgyOl1uwaKjwQHfirtq57um`, name: `crab-mem-site`)
- **HTML files:** `index.html`, `bounties.html`, `feed.html` — all static, single-file pattern
- **API routes:** `api/` dir with `bounties.js`, `observations.js`, `version.ts`
- **Pattern:** Each page is a standalone HTML file with inline CSS/JS, Google Fonts CDN, emoji favicon, no build step
- **Fonts used:** Cinzel, Crimson Text, JetBrains Mono (existing); we'll use Space Grotesk, Inter, JetBrains Mono

### Solana Wallet Adapter (CDN / No Bundler)
- **@solana/web3.js** has an IIFE build available at:
  ```html
  <script src="https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js"></script>
  ```
  This exposes `window.solanaWeb3` global.
- **Wallet adapters** (Phantom, Solflare) do NOT have official CDN IIFE bundles. However:
  - Phantom injects `window.solana` (or `window.phantom.solana`) automatically when extension is installed
  - Solflare injects `window.solflare`
  - **Strategy:** Use direct provider detection (`window.phantom?.solana`, `window.solflare`) instead of the wallet-adapter library. This is simpler for a static page and avoids bundler requirements.
- **Buffer polyfill** needed for web3.js in browser:
  ```html
  <script src="https://unpkg.com/buffer@6.0.3/index.js"></script>
  <script>window.Buffer = window.buffer.Buffer;</script>
  ```

### Vercel Host-Based Rewrites
- Vercel rewrites support a `has` condition array with `type: "host"` matching:
  ```json
  {
    "rewrites": [
      {
        "source": "/(.*)",
        "has": [{ "type": "host", "value": "staking.cmem.ai" }],
        "destination": "/staking.html"
      }
    ]
  }
  ```
- This serves `staking.html` for ALL paths when accessed via `staking.cmem.ai`
- Existing routes on `cmem.ai` / `crab-mem.sh` remain unaffected
- Must add `staking.cmem.ai` as a domain in Vercel project settings (dashboard or CLI)

### Cloudflare DNS
- **No wrangler CLI** installed on system
- **No CF tokens** in environment variables
- **Manual approach:** Add CNAME record via Cloudflare dashboard:
  - Name: `staking` → Target: `cname.vercel-dns.com`
  - Proxy status: DNS only (grey cloud) — required for Vercel SSL
- **Alternative:** Use Cloudflare API with curl if token is provided later

### Existing Staking Contract
- **Platform:** Streamflow Finance (app.streamflow.finance)
- **Staking pool URL:** `https://app.streamflow.finance/staking/solana/mainnet/2uBHsavcfVQAgs8nMuMwogaap9BV1MwQuADearz1e6Kg`
- **Pool address:** `2uBHsavcfVQAgs8nMuMwogaap9BV1MwQuADearz1e6Kg`
- **Protocol:** Streamflow staking protocol on Solana
- Streamflow is a JS-rendered app (couldn't scrape details), but the pool ID is confirmed
- **For the landing page:** We can either:
  1. Link out to Streamflow for actual staking (simple, trustworthy)
  2. Integrate Streamflow SDK (`@streamflow/staking`) for in-page staking (complex, requires bundler)
  - **Recommendation:** Phase 1 links to Streamflow; Phase 2 attempts direct integration or keeps the redirect

### Allowed APIs / Available Tools
| Tool | Available | Notes |
|------|-----------|-------|
| Vercel CLI | ✅ Check | May need `npx vercel` |
| Cloudflare CLI | ❌ | Use dashboard or curl |
| @solana/web3.js CDN | ✅ | IIFE build on unpkg |
| Wallet adapter CDN | ❌ | Use direct provider detection |
| Streamflow SDK CDN | ❌ | No IIFE build; link to app instead |
| Google Fonts CDN | ✅ | Space Grotesk, Inter, JetBrains Mono |

---

## Phase 1: Image Generation (Degen Crab Assets)

**Tool:** `openai-image-gen` skill (`python3 /usr/lib/node_modules/openclaw/skills/openai-image-gen/scripts/gen.py`)  
**Output directory:** `/Projects/crab-mem/images/staking/`  
**Style baseline:** "photorealistic, anthropomorphic crab character, crypto degen aesthetic, detailed, cinematic lighting"

### Images to Generate

#### 1. Hero Background (1792x1024)
```bash
python3 /usr/lib/node_modules/openclaw/skills/openai-image-gen/scripts/gen.py \
  --model dall-e-3 --size 1792x1024 --quality hd --style vivid \
  --out-dir /Projects/crab-mem/images/staking \
  --prompt "Epic underwater ocean scene with neon crypto holographic elements floating in dark water, bioluminescent coral reef, dark moody atmosphere in deep navy blue #0a1628 palette, volumetric light rays piercing through water, Bitcoin and Solana symbols glowing faintly in the deep, cinematic wide shot, photorealistic, 8k detail"
```
**File:** `hero-bg.png` (rename after generation)  
**Usage:** Hero section full-width background image

#### 2. Crab Character Hero (1024x1024)
```bash
python3 /usr/lib/node_modules/openclaw/skills/openai-image-gen/scripts/gen.py \
  --model gpt-image-1 --size 1024x1024 --quality high \
  --background transparent --output-format webp \
  --out-dir /Projects/crab-mem/images/staking \
  --prompt "Photorealistic anthropomorphic crab character standing confidently, wearing oversized reflective sunglasses and a thick gold chain necklace, arms crossed, smug expression, crypto degen aesthetic, detailed shell texture with slight iridescence, cinematic lighting, simple dark background for easy cutout"
```
**File:** `crab-hero.webp` (rename after generation)  
**Usage:** Hero section main character, positioned next to CTA

#### 3. Crab Staking / Trading (1024x1024)
```bash
python3 /usr/lib/node_modules/openclaw/skills/openai-image-gen/scripts/gen.py \
  --model gpt-image-1 --size 1024x1024 --quality high \
  --output-format webp \
  --out-dir /Projects/crab-mem/images/staking \
  --prompt "Photorealistic anthropomorphic crab sitting at a futuristic trading desk with multiple glowing monitors showing green crypto charts going up, crab claws on keyboard, wearing a backwards cap, energy drink cans scattered around, neon blue and green ambient lighting, crypto degen aesthetic, detailed, cinematic lighting"
```
**File:** `crab-staking.webp` (rename after generation)  
**Usage:** "Why Stake" section illustration

#### 4. Crab Celebrating (1024x1024)
```bash
python3 /usr/lib/node_modules/openclaw/skills/openai-image-gen/scripts/gen.py \
  --model gpt-image-1 --size 1024x1024 --quality high \
  --output-format webp \
  --out-dir /Projects/crab-mem/images/staking \
  --prompt "Photorealistic anthropomorphic crab doing a triumphant victory pose with claws raised high, gold confetti raining down, holding stacks of shiny gold coins in one claw, wearing sunglasses pushed up on head, huge grin, celebratory explosion of light behind, crypto degen aesthetic, detailed shell texture, cinematic dramatic lighting"
```
**File:** `crab-celebrating.webp` (rename after generation)  
**Usage:** Success/confirmation modal after staking, leaderboard section header

#### 5. Crab Logo/Icon (1024x1024)
```bash
python3 /usr/lib/node_modules/openclaw/skills/openai-image-gen/scripts/gen.py \
  --model gpt-image-1 --size 1024x1024 --quality high \
  --background transparent --output-format webp \
  --out-dir /Projects/crab-mem/images/staking \
  --prompt "Close-up photorealistic portrait of an anthropomorphic crab face, wearing tiny round sunglasses, slight smirk, detailed texture on shell and eyes, simple clean dark background, works as an icon or avatar, crypto degen aesthetic, cinematic lighting, centered composition"
```
**File:** `crab-icon.webp` (rename after generation)  
**Usage:** Favicon (convert to ICO/SVG), nav logo, Open Graph image accent

### Post-Generation Steps
1. Rename generated files to semantic names listed above
2. Optimize: ensure files are < 500KB each (webp should be fine)
3. Create a 64x64 favicon version from `crab-icon.webp`
4. Update `prompts.json` mapping for reference

### Verification Checklist
- [ ] All 5 images generated successfully
- [ ] Images match the vibe (dark, neon, degen, crab)
- [ ] Hero bg is wide format (1792x1024)
- [ ] Transparent backgrounds work on crab-hero and crab-icon
- [ ] File sizes reasonable (< 500KB each for webp, < 1MB for hero png)
- [ ] Images saved to `/Projects/crab-mem/images/staking/`

### Anti-Patterns
- ❌ Don't generate with DALL-E 2 (quality too low for photorealistic)
- ❌ Don't use `--count` > 1 with DALL-E 3 (not supported)
- ❌ Don't skip renaming — generated filenames are UUIDs
- ❌ Don't use massive uncompressed PNGs for in-page images (use webp)

---

## Phase 2: Build the HTML Page

**File:** `/Projects/crab-mem/staking.html`  
**Scope:** Complete single-file page with all sections, styling, animations. No wallet logic yet.

### What to Implement

1. **HTML structure** — Single file, inline `<style>` and `<script>` tags
2. **Google Fonts** — Space Grotesk (headings), Inter (body), JetBrains Mono (code/numbers)
3. **CSS custom properties** — `--ocean: #0a1628`, `--crab: #ff6b35`, `--sol-green: #00ffa3`, `--white: #f0f0f0`
4. **Mobile-first responsive** — Base styles for mobile, `@media (min-width: 768px)` for desktop

### Sections (in order)

#### 1. Hero
- Full-viewport height, `images/staking/hero-bg.png` as background with ocean blue gradient overlay
- `images/staking/crab-hero.webp` as the main character image (CSS bounce/wave animation)
- "69% APY" in massive type (Space Grotesk, gradient text)
- "STAKE $CMEM" CTA button (crab orange, glow effect)
- Animated wave SVG at bottom

#### 2. How It Works
- 3 cards in a row (stack on mobile)
- Step 1: 🦀 "Connect Wallet" — "Even crabs have wallets now"
- Step 2: 💰 "Stake $CMEM" — "30 days minimum. We're not day-traders."
- Step 3: 📈 "Earn 69% APY" — "Nice."
- Crab orange accent borders, numbered with crab emojis

#### 3. Live Pool Stats
- Animated counting numbers (JS `requestAnimationFrame` counters)
- Stats: Total Staked, APY, Stakers, Time Remaining
- Grid layout, JetBrains Mono for numbers
- Placeholder values initially (will connect to on-chain data later)

#### 4. In-Page Staking Widget
- Card with wallet connect button (placeholder in Phase 1)
- Amount input with MAX button
- Stake / Unstake tabs
- "Powered by Streamflow" badge
- Links to Streamflow app as fallback
- Disabled state with "Connect Wallet First" messaging

#### 5. Why Stake
- 2-column layout — `images/staking/crab-staking.webp` on left, text on right
- Crab personality copy: confident, slightly unhinged
- Bullet points with crab emoji markers
- Gradient accent line

#### 6. Leaderboard
- Sortable table (vanilla JS)
- Columns: Rank, Address (truncated), Amount Staked, Duration, Badge
- Badges: 🦀 Crab King (top 1), 🔱 Trident (top 10), 🐚 Shell (top 100)
- "Share to Twitter" button per row (pre-filled tweet)
- Placeholder data (10-20 mock entries)
- Mobile: horizontal scroll or card view

#### 7. Contract Info
- Serious tone section (contrast with rest)
- Token address with copy button: `2TsmuYUrsctE57VLckZBYEEzdokUF8j8e1GavekWBAGS`
- Pool address with copy button: `2uBHsavcfVQAgs8nMuMwogaap9BV1MwQuADearz1e6Kg`
- Links to Solscan/Solana Explorer
- "Verified" badge styling

#### 8. FAQ
- Accordion (vanilla JS, no library)
- Questions in crab voice:
  - "Is this safe?" → "As safe as a crab's shell..."
  - "What's the minimum stake?" → "30 days. We're building, not flipping."
  - "When do rewards distribute?" → Details about Streamflow pool
  - "What happens when the pool expires?" → Jan 27, 2027 info
  - 4-6 questions total

#### 9. Footer
- Links: Main site, Twitter, Telegram, Docs
- "Built by crabs 🦀" tagline
- Token address (small)

### Animations
- **Crab bounce:** `@keyframes crab-bounce` — translateY oscillation
- **Wave:** SVG path animation at section bottoms
- **Counter:** JS animated counting from 0 to target value on scroll intersection
- **Confetti:** JS canvas confetti effect (triggered later on successful stake) + show `images/staking/crab-celebrating.webp`
- **Glow pulse:** CTA button pulsing box-shadow
- **Fade-in on scroll:** IntersectionObserver for section reveals

### Verification Checklist
- [ ] Page renders correctly at `/staking` locally
- [ ] Mobile responsive (320px - 1440px)
- [ ] All animations smooth (no jank)
- [ ] Counters animate on scroll
- [ ] FAQ accordion works
- [ ] Leaderboard sorts work
- [ ] Copy buttons work (clipboard API)
- [ ] All links valid
- [ ] Lighthouse score > 90 (performance)

### Anti-Patterns
- ❌ Don't use any npm packages or build tools
- ❌ Don't use external CSS frameworks (Bootstrap, Tailwind CDN)
- ❌ Don't lazy-load above-the-fold content
- ❌ Don't use `innerHTML` for user-facing data (XSS risk)
- ❌ Don't make the page depend on JS for core content visibility

---

## Phase 3: Wallet Integration

**File:** Same `staking.html` — add to existing `<script>` section  
**Dependencies:** `@solana/web3.js` IIFE bundle + Buffer polyfill

### What to Implement

1. **Script tags** (add to `<head>`):
   ```html
   <script src="https://unpkg.com/buffer@6.0.3/index.js"></script>
   <script>window.Buffer = window.buffer.Buffer;</script>
   <script src="https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js"></script>
   ```

2. **Wallet detection & connection:**
   - Detect Phantom (`window.phantom?.solana`), Solflare (`window.solflare`)
   - Show available wallets in a modal
   - Connect flow: `provider.connect()` → get `publicKey`
   - Display truncated address in nav/widget
   - Disconnect button
   - Handle account changes (`accountChanged` event)

3. **Staking widget logic:**
   - Fetch token balance using `solanaWeb3.Connection` + `getTokenAccountsByOwner`
   - MAX button fills balance
   - Amount validation (min amount, decimal handling)
   - Stake button → redirect to Streamflow with pre-filled params OR construct transaction
   - **Primary approach:** Deep-link to Streamflow app (`https://app.streamflow.finance/staking/solana/mainnet/2uBHsavcfVQAgs8nMuMwogaap9BV1MwQuADearz1e6Kg`)
   - **Stretch goal:** If Streamflow has a direct instruction format, build the transaction client-side

4. **Live pool stats (on-chain):**
   - Use `solanaWeb3.Connection` to read pool account data
   - Parse Streamflow pool account structure (may need to reverse-engineer or use known layout)
   - Fallback: hardcode stats with "Last updated" timestamp
   - RPC endpoint: `https://api.mainnet-beta.solana.com` (free tier, rate limited)
   - Consider: Helius/Quicknode free RPC for better reliability

5. **Confetti on stake:**
   - Inline confetti implementation (canvas-based, ~50 lines)
   - Trigger on successful wallet connection + stake action

### Verification Checklist
- [ ] Phantom wallet detected and connects
- [ ] Solflare wallet detected and connects
- [ ] "No wallet" state shows install links
- [ ] Token balance displays correctly
- [ ] Stake button redirects to Streamflow (or submits tx)
- [ ] Disconnect works
- [ ] Mobile wallet (in-app browser) works
- [ ] Error states handled gracefully (rejected, timeout, network error)

### Anti-Patterns
- ❌ Don't store private keys or seed phrases
- ❌ Don't auto-connect without user action
- ❌ Don't use mainnet RPC for heavy polling (rate limits)
- ❌ Don't show raw error messages to users
- ❌ Don't assume wallet is always Phantom

---

## Phase 4: Vercel Config + Deploy

### What to Implement

1. **Update vercel.json** (`/Projects/crab-mem/vercel.json`):
   ```json
   {
     "cleanUrls": true,
     "trailingSlash": false,
     "rewrites": [
       {
         "source": "/(.*)",
         "has": [{ "type": "host", "value": "staking.cmem.ai" }],
         "destination": "/staking.html"
       }
     ]
   }
   ```

2. **Add domain in Vercel:**
   ```bash
   cd /Projects/crab-mem
   npx vercel domains add staking.cmem.ai
   ```
   Or via Vercel dashboard: Project Settings → Domains → Add `staking.cmem.ai`

3. **Deploy:**
   ```bash
   cd /Projects/crab-mem
   npx vercel --prod
   ```

4. **Verify deployment:**
   - Check `vercel domains ls` shows staking.cmem.ai
   - Check deployment logs for errors

### Verification Checklist
- [ ] `vercel.json` is valid JSON
- [ ] Deploy succeeds without errors
- [ ] Existing pages (cmem.ai, crab-mem.sh) still work
- [ ] `staking.cmem.ai` domain added to project
- [ ] Rewrite rule serves staking.html on subdomain

### Anti-Patterns
- ❌ Don't remove existing vercel.json config (merge, don't replace)
- ❌ Don't deploy to preview — must be `--prod`
- ❌ Don't forget to add the domain before deploying (rewrite won't work without it)

---

## Phase 5: Cloudflare DNS

### What to Implement

1. **Add CNAME record** in Cloudflare dashboard for `cmem.ai`:
   - Type: `CNAME`
   - Name: `staking`
   - Target: `cname.vercel-dns.com`
   - Proxy status: **DNS only** (grey cloud) ← Critical for Vercel SSL
   - TTL: Auto

2. **Alternative (API with curl):**
   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records" \
     -H "Authorization: Bearer {cf_token}" \
     -H "Content-Type: application/json" \
     --data '{
       "type": "CNAME",
       "name": "staking",
       "content": "cname.vercel-dns.com",
       "ttl": 1,
       "proxied": false
     }'
   ```
   Requires: CF API token with DNS edit permissions, zone ID for cmem.ai

3. **Wait for DNS propagation** (usually < 5 minutes with Cloudflare)

4. **Vercel SSL:** Vercel auto-provisions SSL cert once DNS points correctly. May take a few minutes.

### Verification Checklist
- [ ] CNAME record exists: `dig staking.cmem.ai CNAME` → `cname.vercel-dns.com`
- [ ] DNS is NOT proxied (grey cloud in Cloudflare)
- [ ] SSL certificate provisioned by Vercel (check dashboard)
- [ ] `https://staking.cmem.ai` loads without cert errors

### Anti-Patterns
- ❌ Don't enable Cloudflare proxy (orange cloud) — breaks Vercel SSL
- ❌ Don't use A record — use CNAME to `cname.vercel-dns.com`
- ❌ Don't forget to check SSL provisioning status in Vercel

---

## Phase 6: Verification

### Full End-to-End Checks

1. **Desktop browsers:** Chrome, Firefox, Safari
   - [ ] Page loads at `https://staking.cmem.ai`
   - [ ] All sections render
   - [ ] Animations play
   - [ ] Wallet connect works (Phantom)
   - [ ] Links to Streamflow work
   - [ ] Copy buttons work

2. **Mobile:**
   - [ ] Responsive layout correct
   - [ ] Touch interactions work (accordion, buttons)
   - [ ] Phantom mobile browser works
   - [ ] No horizontal scroll

3. **SEO / Social:**
   - [ ] `<title>` and `<meta description>` set
   - [ ] Open Graph tags (og:title, og:image, og:description)
   - [ ] Twitter card meta tags
   - [ ] Favicon loads

4. **Performance:**
   - [ ] Page load < 3s on 3G
   - [ ] No render-blocking resources (fonts loaded with `display=swap`)
   - [ ] Images optimized (SVG/emoji preferred)

5. **Existing site:**
   - [ ] `cmem.ai` still works as before
   - [ ] `cmem.ai/bounties` still works
   - [ ] `cmem.ai/feed` still works

### Rollback Plan
If something breaks:
1. Remove the `rewrites` array from `vercel.json`
2. Redeploy: `npx vercel --prod`
3. Existing site restored immediately
4. DNS record can stay (harmless without rewrite)

---

## Summary Timeline

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Phase 1: Image generation | ~15 min | OPENAI_API_KEY |
| Phase 2: HTML page | ~2-3 hours | Phase 1 (images) |
| Phase 3: Wallet integration | ~1-2 hours | Phase 2 |
| Phase 4: Vercel config | ~15 min | Phase 2 |
| Phase 5: Cloudflare DNS | ~10 min | Phase 4 + CF dashboard access |
| Phase 6: Verification | ~30 min | All phases |

**Total estimated effort: 4.5-6.5 hours**

Phase 1 (images) must complete first so Phase 2 can reference real assets. Phases 3+4 can be done in parallel. Phase 5 requires human action (Cloudflare dashboard) unless API token is provided.
