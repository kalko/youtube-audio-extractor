# Deno Deploy Proxy Function

A serverless proxy service built for Deno Deploy that provides CORS-enabled proxy functionality. Perfect for bypassing CORS restrictions and accessing external APIs from your Node.js web applications.

## Features

-   🚀 **Serverless**: Deploy to Deno Deploy for free (100k requests/day)
-   🦕 **TypeScript Native**: Built-in TypeScript support, no build step needed
-   🔒 **CORS Support**: Built-in CORS headers for web app integration
-   🎭 **Realistic Headers**: Mimics real browser requests
-   ⚡ **Fast**: Edge deployment with global CDN
-   📊 **Logging**: Built-in request/response logging
-   🛡️ **Error Handling**: Comprehensive error responses

## Quick Start

### 1. Local Development

Clone and run locally:

```bash
# Clone the repository
git clone <your-repo-url>
cd examples-hello-world

# Start development server
deno task dev
```

The function will be available at `http://localhost:8000`

### 2. Deploy to Deno Deploy

#### Option A: Deploy via GitHub Integration

1. Push your code to GitHub
2. Go to [dash.deno.com](https://dash.deno.com)
3. Create a new project
4. Connect your GitHub repository
5. Set entrypoint to `main.ts`
6. Deploy!

#### Option B: Deploy via CLI

```bash
# Install Deno Deploy CLI
deno install -A --global https://deno.land/x/deploy/deployctl.ts

# Deploy your function
deployctl deploy --project=your-project-name main.ts
```

### 3. Get Your Function URL

After deployment, your function will be available at:

```
https://your-project-name.deno.dev
```

## Usage

### Basic Usage

```javascript
// Your deployed function URL
const functionUrl = 'https://your-project-name.deno.dev'

// Target URL you want to proxy
const targetUrl = 'https://api.example.com/data'

// Make request through proxy
const response = await fetch(`${functionUrl}/?url=${encodeURIComponent(targetUrl)}`)
const data = await response.text()
```

### Node.js Web App Integration

```javascript
// In your Node.js application
const express = require('express')
const app = express()

app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url
    const functionUrl = 'https://your-project-name.deno.dev'

    try {
        const response = await fetch(`${functionUrl}/?url=${encodeURIComponent(targetUrl)}`)

        if (!response.ok) {
            const error = await response.json()
            return res.status(response.status).json(error)
        }

        const data = await response.text()
        res.send(data)
    } catch (error) {
        res.status(500).json({ error: 'Proxy request failed' })
    }
})

app.listen(3000, () => {
    console.log('Server running on port 3000')
})
```

### Frontend Integration

```javascript
// From your frontend application
async function fetchThroughProxy(url) {
    const functionUrl = 'https://your-project-name.deno.dev'
    const response = await fetch(`${functionUrl}/?url=${encodeURIComponent(url)}`)

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Proxy request failed')
    }

    return response
}

// Usage examples:
// const youtubeData = await fetchThroughProxy('https://youtube.com/watch?v=VIDEO_ID')
// const apiData = await fetchThroughProxy('https://api.example.com/data')
```

### Example API Calls

```bash
# Basic proxy request
curl "https://your-project-name.deno.dev/?url=https://httpbin.org/json"

# Proxy YouTube page
curl "https://your-project-name.deno.dev/?url=https://youtube.com/watch?v=dQw4w9WgXcQ"

# Proxy API with JSON response
curl "https://your-project-name.deno.dev/?url=https://jsonplaceholder.typicode.com/posts/1"
```

## Development Commands

```bash
# Start development server with hot reload
deno task dev

# Run the function once
deno task start

# Run tests
deno task test

# Format code
deno task format

# Lint code
deno task lint
```

## Configuration

### Environment Variables

You can add environment variables in Deno Deploy dashboard or use them locally:

```bash
# Set environment variables for local development
export ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
export LOG_LEVEL="info"

# Run with environment variables
deno task dev
```

Access them in your code:

```typescript
const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || ['*']
```

### Custom Domain

To use a custom domain with Deno Deploy:

1. Go to your project settings in Deno Deploy dashboard
2. Add your custom domain
3. Configure DNS records as instructed
4. Enable HTTPS (automatic with Let's Encrypt)

## Error Responses

The function returns structured error responses:

### 400 - Bad Request

```json
{
    "error": "Missing url parameter",
    "usage": "Add ?url=https://example.com to your request"
}
```

### 400 - Invalid URL

```json
{
    "error": "Invalid URL format",
    "provided": "invalid-url"
}
```

### 500 - Proxy Error

```json
{
    "error": "Proxy request failed",
    "message": "fetch failed",
    "targetUrl": "https://example.com",
    "timestamp": "2025-09-13T12:00:00.000Z"
}
```

## Limits

### Deno Deploy Free Tier

-   100,000 requests/day
-   10ms CPU time per request
-   128MB memory per request
-   Global edge deployment

### Pro Plans

-   Unlimited requests
-   Higher CPU and memory limits
-   Priority support

## Security Considerations

1. **Rate Limiting**: Consider implementing rate limiting for production use
2. **Origin Validation**: Add origin validation if needed:
    ```typescript
    const origin = request.headers.get('origin')
    const allowedOrigins = ['https://yourdomain.com']
    if (!allowedOrigins.includes(origin)) {
        return new Response('Forbidden', { status: 403 })
    }
    ```
3. **URL Filtering**: Implement URL allowlist/blocklist as required
4. **API Keys**: Add authentication for sensitive use cases

## Troubleshooting

### Common Issues

1. **CORS Errors**: The function includes CORS headers by default
2. **Large Responses**: Deno Deploy handles streaming automatically
3. **Timeouts**: Functions have execution time limits
4. **Rate Limits**: Monitor your usage in Deno Deploy dashboard

### Debugging

Check logs in Deno Deploy dashboard or use local logging:

```typescript
console.log(`Proxying request to: ${targetUrl}`)
console.log(`Response: ${response.status} ${response.statusText}`)
```

## Examples

See `example-nodejs-integration.js` for a complete Node.js application example.

## License

MIT License - feel free to use in your projects!

## Deploy Button

[![Deploy on Deno](https://deno.com/deno-deploy-button.svg)](https://dash.deno.com/new?clone=https://github.com/your-username/examples-hello-world)
