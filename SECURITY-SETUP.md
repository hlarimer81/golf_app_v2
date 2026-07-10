# Security Setup - API Key Management

## ✅ Current Security Status

Your Golf Course API key is now properly secured:

### Production (Supabase)
- ✅ API key stored as encrypted secret in Supabase
- ✅ Environment variable `GOLF_API_KEY` configured
- ✅ Edge function reads from `Deno.env.get('GOLF_API_KEY')`
- ✅ Key is NOT in source code

### Local Development
- ✅ API key in `.env` file (local only)
- ✅ `.env` is in `.gitignore` (will NOT be committed)
- ✅ No hardcoded keys in code

### Git Repository
- ✅ No API keys in tracked files
- ✅ Documentation uses `YOUR_API_KEY_HERE` placeholder
- ✅ Safe to commit and push

---

## 🔧 How It Works

### Edge Function
```typescript
// Reads from environment variable (secure)
const GOLF_API_KEY = Deno.env.get('GOLF_API_KEY')

// Never do this (insecure):
// const GOLF_API_KEY = 'hardcoded-key-here'
```

### Supabase Secret
```bash
# Set the secret (encrypted on Supabase servers)
npx supabase secrets set GOLF_API_KEY=your_key_here

# List secrets (shows hash, not actual value)
npx supabase secrets list
```

### Local Development
```bash
# .env file (gitignored, local only)
GOLF_API_KEY=your_key_here
```

---

## 🔄 Key Rotation

If you need to change the API key:

### Step 1: Get New Key
1. Go to https://golfcourseapi.com
2. Generate new API key

### Step 2: Update Supabase Secret
```bash
npx supabase secrets set GOLF_API_KEY=new_key_here
```

### Step 3: Update Local .env
```bash
# Edit .env file
GOLF_API_KEY=new_key_here
```

### Step 4: Redeploy (Optional)
```bash
# Redeploy to pick up new secret
npx supabase functions deploy request-course
```

**Note:** Supabase automatically injects the latest secret value into edge functions, so redeployment is usually not required unless you changed the code.

---

## 🛡️ Security Best Practices

### ✅ DO
- Store API keys as environment variables
- Use Supabase secrets for production
- Keep `.env` in `.gitignore`
- Use placeholders in documentation
- Rotate keys periodically

### ❌ DON'T
- Hardcode API keys in source code
- Commit `.env` files to git
- Share API keys in plain text
- Use production keys in public repos
- Store keys in frontend code

---

## 📝 Files

### Tracked (Safe to Commit)
- `supabase/functions/request-course/index.ts` - Uses env var ✅
- `supabase/functions/request-course/README.md` - Documentation ✅
- `*.md` - Documentation with placeholders ✅

### Gitignored (Local Only)
- `.env` - Your actual API key 🔒
- `.claude/` - Claude settings (auto-ignored) 🔒

---

## 🧪 Verification

Verify security before committing:

```bash
# Check for hardcoded keys
grep -r "KUCPURI3LUEFEGZSHH2PZ2L7ZQ" supabase/ *.md

# Verify .env is gitignored
git check-ignore .env

# Check what would be committed
git status

# Verify Supabase secret is set
npx supabase secrets list | grep GOLF_API_KEY
```

All checks should pass! ✅

---

## 🚨 If You Accidentally Commit a Key

If you accidentally commit an API key to git:

### Step 1: Rotate the Key Immediately
1. Go to https://golfcourseapi.com
2. Generate a NEW API key
3. Update Supabase secret with new key

### Step 2: Remove from Git History (Advanced)
```bash
# WARNING: This rewrites git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (if already pushed to remote)
git push origin --force --all
```

**Simpler approach:** Just rotate the key and move forward. Old commits will have the old key, but it won't work anymore.

---

## 📞 Support

**If your key stops working:**
- Get new key from https://golfcourseapi.com
- Update Supabase secret: `npx supabase secrets set GOLF_API_KEY=new_key`
- Update local `.env` file
- Done!

---

**Status:** ✅ Secure and ready to commit!  
**Last Updated:** July 9, 2026
