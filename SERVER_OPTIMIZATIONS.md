# Server-Side Performance Optimizations

## Critical Issue
**API response time: 19.5 seconds** - This is the #1 bottleneck preventing fast content loading.

## Immediate Server-Side Fixes Needed

### 1. **Add Response Caching** (Highest Priority)
```javascript
// Add Redis or in-memory cache for /api/news/chunks
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 minute cache

app.get('/api/news/chunks', async (req, res) => {
  const cacheKey = `chunks:${req.query.size}:${req.query.start}:${req.query.count}`;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  
  // ... fetch from database ...
  const result = { chunks, totalChunks };
  
  // Cache the result
  cache.set(cacheKey, result);
  res.json(result);
});
```

**Impact**: Reduces API time from 19.5s → <100ms for cached requests

### 2. **Add Database Indexes**
```javascript
// In your MongoDB collection
db.news.createIndex({ idNumber: -1 });
db.news.createIndex({ publishedAt: -1 });
db.news.createIndex({ category: 1, idNumber: -1 });
```

**Impact**: Speeds up queries by 10-50x

### 3. **Optimize Database Queries**

**Before** (Slow):
```javascript
// Loading all items then slicing in memory
const allItems = await newsCollection.find({}).toArray();
const chunk = allItems.slice(start * size, (start + 1) * size);
```

**After** (Fast):
```javascript
// Use database pagination
const chunk = await newsCollection
  .find({})
  .sort({ idNumber: -1 })
  .skip(start * size)
  .limit(size)
  .toArray();
```

**Impact**: Reduces query time from 15s → <500ms

### 4. **Add HTTP Compression**
```javascript
const compression = require('compression');
app.use(compression());
```

**Impact**: Reduces response size by 70-80%

### 5. **Add ETag/Cache-Control Headers**
```javascript
app.get('/api/news/chunks', async (req, res) => {
  const etag = generateEtag(data); // Based on data hash
  
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // Not Modified
  }
  
  res.set({
    'ETag': etag,
    'Cache-Control': 'public, max-age=300' // 5 minutes
  });
  
  res.json(data);
});
```

**Impact**: Repeat visits load instantly from browser cache

### 6. **Defer Heavy Database Operations**

**Optimize Analytics Endpoints** - These are taking 33+ seconds!
```javascript
// Make all analytics fire-and-forget
app.post('/api/analytics/identify', async (req, res) => {
  res.json({ ok: true }); // Respond immediately
  
  // Process async (don't await)
  saveAnalytics(req.body).catch(console.error);
});

app.post('/api/analytics/session/heartbeat', async (req, res) => {
  res.json({ ok: true }); // Respond immediately
  
  // Batch heartbeats - process every 10 requests
  heartbeatQueue.push(req.body);
  if (heartbeatQueue.length >= 10) {
    processHeartbeats(heartbeatQueue).catch(console.error);
    heartbeatQueue = [];
  }
});
```

**Impact**: Removes 33s from critical path

### 7. **Use Connection Pooling**
```javascript
const { MongoClient } = require('mongodb');
const client = new MongoClient(uri, {
  maxPoolSize: 50, // Increase pool size
  minPoolSize: 10,
  maxIdleTimeMS: 30000
});
```

**Impact**: Reduces connection overhead from 1-2s → <10ms

### 8. **Add Request Timeouts**
```javascript
app.use((req, res, next) => {
  req.setTimeout(5000); // 5 second timeout
  res.setTimeout(5000);
  next();
});
```

**Impact**: Prevents hung requests from blocking server

### 9. **Optimize Image Proxy**

The `/img` endpoint should:
```javascript
app.get('/img', async (req, res) => {
  const { u: url, w: width } = req.query;
  
  // Generate cache key
  const cacheKey = `img:${url}:${width}`;
  
  // Check disk cache or CDN
  const cached = await checkImageCache(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
    return res.sendFile(cached);
  }
  
  // Fetch, resize, cache
  const image = await fetchAndResize(url, width);
  await saveToCache(cacheKey, image);
  
  res.set('Cache-Control', 'public, max-age=31536000');
  res.send(image);
});
```

**Impact**: Reduces image load time from 4s → <500ms

### 10. **Enable HTTP/2**
```javascript
const http2 = require('http2');
const server = http2.createSecureServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
}, app);
```

**Impact**: Parallel requests load 2-3x faster

## Implementation Priority

### Phase 1: Immediate (Do Today) ⚡
1. ✅ **Remove `await` from analytics** (Done in frontend)
2. **Add response caching** for `/api/news/chunks`
3. **Add database indexes**
4. **Make analytics fire-and-forget**

**Expected Result**: API time drops from 19.5s → 2-3s

### Phase 2: This Week 🚀
5. **Add compression middleware**
6. **Optimize database queries** (use skip/limit)
7. **Add ETag headers**
8. **Implement connection pooling**

**Expected Result**: API time drops to <1s

### Phase 3: Next Week 📈
9. **Add Redis cache layer**
10. **Implement CDN for images**
11. **Enable HTTP/2**
12. **Add request timeouts**

**Expected Result**: API time drops to <300ms

## Quick Wins You Can Do Now

### Install and Use Compression (30 seconds)
```bash
npm install compression
```
```javascript
const compression = require('compression');
app.use(compression());
```

### Add Simple In-Memory Cache (2 minutes)
```bash
npm install node-cache
```
```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 });

// Wrap your chunk endpoint
app.get('/api/news/chunks', async (req, res) => {
  const key = `${req.query.size}:${req.query.start}`;
  let data = cache.get(key);
  if (!data) {
    data = await fetchChunks(req.query); // Your existing logic
    cache.set(key, data);
  }
  res.json(data);
});
```

## Monitoring

Add performance logging:
```javascript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  next();
});
```

## Expected Final Results

| Metric | Before | After Phase 1 | After Phase 2 | After Phase 3 |
|--------|--------|---------------|---------------|---------------|
| **API Response** | 19.5s | 2-3s | <1s | <300ms |
| **LCP** | 3.1s | 1.8s | 1.2s | <1.0s |
| **Speed Index** | 6.0s | 3.0s | 2.0s | <1.5s |
| **Performance Score** | 65 | 80 | 90 | 95+ |

## Critical Path Analysis

Current bottleneck chain (33.88s):
```
Initial Navigation (520ms)
  ↓
index.js loads (822ms)
  ↓
analytics/identify (2,598ms) ← BLOCKING
  ↓
session/start (3,084ms) ← BLOCKING
  ↓
session/heartbeat (18,880ms) ← BLOCKING
  ↓
session/heartbeat (33,880ms) ← BLOCKING
```

After fixes:
```
Initial Navigation (520ms)
  ↓
index.js loads (822ms)
  ↓
[Analytics deferred 2s, fire-and-forget]
  ↓
Content renders immediately
```

## Database Query Optimization Example

**Before** (19.5s):
```javascript
const all = await db.collection('news').find({}).toArray(); // Loads EVERYTHING
const sorted = all.sort((a, b) => b.idNumber - a.idNumber); // Sorts in memory
const chunked = sorted.slice(start, start + size); // Slices in memory
```

**After** (<500ms):
```javascript
const chunked = await db.collection('news')
  .find({})
  .sort({ idNumber: -1 }) // Database sorts with index
  .skip(start * size)
  .limit(size)
  .toArray(); // Only loads what's needed
```

## Image Optimization

Current: Each image takes 4+ seconds to load

**Solution**: Use a CDN or optimize your image proxy:
```javascript
// Add to server
const sharp = require('sharp');

app.get('/img', async (req, res) => {
  const cacheKey = `${req.query.u}:${req.query.w}`;
  
  // Check cache
  if (imageCache.has(cacheKey)) {
    res.set('Cache-Control', 'public, max-age=31536000');
    return res.send(imageCache.get(cacheKey));
  }
  
  // Fetch and optimize
  const response = await fetch(req.query.u);
  const buffer = await response.buffer();
  
  const optimized = await sharp(buffer)
    .resize(parseInt(req.query.w))
    .webp({ quality: 80 })
    .toBuffer();
  
  imageCache.set(cacheKey, optimized);
  res.set('Cache-Control', 'public, max-age=31536000');
  res.send(optimized);
});
```

---

**Bottom Line**: The frontend is now optimized. The **server is the bottleneck** with 19.5s API responses. Implement caching and optimize database queries to achieve sub-2 second loads.



