// Apify Actor for YouTube Audio Extraction with IP Rotation and R2 Upload
// Main entry point that orchestrates YouTube audio extraction and R2 uploads

import { Actor } from 'apify'
import { ApifyYouTubeProxy } from './ApifyYouTubeProxy.js'

// Main Apify Actor entry point
Actor.main(async () => {
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
            } else {
                console.log('YouTube audio extraction mode (no R2 upload)')
                result = await extractor.extractYouTubeVideo(input.youtubeUrl, false)
            }

            console.log('YouTube extraction successful')
        } else if (input.proxyUrl) {
            // Generic proxy mode
            result = await extractor.proxyGenericRequest(input.proxyUrl)
            console.log('Proxy request successful')
        } else {
            // Default test mode
            result = {
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
        }

        // Save result to Apify dataset
        await Actor.pushData(result)
        console.log('Result saved to dataset')

        // Also save to key-value store
        await Actor.setValue('RESULT', result)
        console.log('Result saved to key-value store')
    } catch (error) {
        console.error('Actor failed:', error)

        const errorResult = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
        }

        await Actor.pushData(errorResult)
        await Actor.setValue('ERROR', errorResult)

        throw error
    }

    console.log('Apify Actor completed successfully!')
})
