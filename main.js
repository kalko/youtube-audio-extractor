// Apify Actor for YouTube Audio Extraction with IP Rotation and R2 Upload
// Main entry point that orchestrates YouTube audio extraction and R2 uploads

import { Actor } from 'apify'
import { ApifyYouTubeProxy } from './ApifyYouTubeProxy.js'

// Main Apify Actor entry point
Actor.main(async () => {
    const runStartedAt = Date.now()
    let runSucceeded = false
    let resultMeta = { mode: 'unknown', youtubeId: null }
    console.log('Apify YouTube Audio Extractor Actor starting...')

    // Get input from Apify
    const input = await Actor.getInput()
    console.log('Input received:', input)

    const extractor = new ApifyYouTubeProxy()
    await extractor.initialize(input)

    try {
        let result

        if (input.youtubeUrl) {
            // YouTube audio extraction mode
            const uploadToR2 = !!process.env.CLOUDFLARE_R2_BUCKET && !!extractor.r2Client

            if (uploadToR2) {
                console.log('YouTube audio extraction + R2 upload mode')
                result = await extractor.extractYouTubeVideo(input.youtubeUrl, true)
                resultMeta.mode = 'youtube+r2'
            } else {
                console.log('YouTube audio extraction mode (no R2 upload)')
                result = await extractor.extractYouTubeVideo(input.youtubeUrl, false)
                resultMeta.mode = 'youtube'
            }

            // Extract youtubeId for telemetry
            try {
                const match = input.youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
                resultMeta.youtubeId = match ? match[1] : null
            } catch {}

            console.log('YouTube extraction successful')
            runSucceeded = true

            // Save result to Apify dataset
            await Actor.pushData(result)
            console.log('Result saved to dataset')

            // Also save to key-value store
            await Actor.setValue('RESULT', result)
            console.log('Result saved to key-value store')
        } else if (input.proxyUrl) {
            // Generic proxy mode
            result = await extractor.proxyGenericRequest(input.proxyUrl)
            console.log('Proxy request successful')
            resultMeta.mode = 'proxy'
            runSucceeded = true

            await Actor.pushData(result)
            await Actor.setValue('RESULT', result)
        } else {
            // Default test mode
            const info = {
                message: 'Apify YouTube Audio Extractor Actor is running!',
                availableModes: ['youtubeUrl (with automatic R2 upload)', 'proxyUrl'],
                environment: {
                    r2Configured: !!process.env.CLOUDFLARE_R2_BUCKET,
                    bucket: process.env.CLOUDFLARE_R2_BUCKET || 'not-configured',
                },
                example: {
                    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    proxyUrl: 'https://httpbin.org/ip',
                },
                timestamp: new Date().toISOString(),
            }
            await Actor.pushData(info)
            await Actor.setValue('RESULT', info)
        }
    } catch (error) {
        console.error('Actor failed:', error)

        const errorResult = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
        }

        try {
            await Actor.pushData(errorResult)
            await Actor.setValue('ERROR', errorResult)
        } catch {}

        runSucceeded = false
        throw error
    } finally {
        // Lightweight telemetry: duration + outcome to an external webhook (optional)
        try {
            const runEndedAt = Date.now()
            const durationMs = runEndedAt - runStartedAt
            const webhookUrl = process.env.METRICS_WEBHOOK_URL
            const webhookToken = process.env.METRICS_WEBHOOK_TOKEN
            const env = Actor.getEnv() || {}
            if (webhookUrl) {
                const payload = {
                    service: 'apify-youtube-audio-extractor',
                    actorRunId: env.actorRunId,
                    actorId: env.actorId,
                    actorTaskId: env.actorTaskId,
                    success: runSucceeded,
                    durationMs,
                    mode: resultMeta.mode,
                    youtubeId: resultMeta.youtubeId,
                    timestamp: new Date().toISOString(),
                }
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), 2000)
                try {
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
                        },
                        body: JSON.stringify(payload),
                        signal: controller.signal,
                    })
                    console.log('Telemetry posted')
                } finally {
                    clearTimeout(timeout)
                }
            }
        } catch (telemetryErr) {
            console.log('Telemetry post failed (non-fatal):', telemetryErr.message)
        }
    }

    console.log('Apify Actor completed successfully!')
})
