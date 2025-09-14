// Apify Actor for YouTube Audio Extraction with IP Rotation and R2 Upload
// Extracts audio-only streams from YouTube and uploads directly to Cloudflare R2

import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { Actor } from 'apify'
import { gotScraping } from 'got-scraping'

// Browser fingerprint profiles optimized for YouTube
const BROWSER_PROFILES = [
    {
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'Win32',
        region: 'US',
    },
    {
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'MacIntel',
        region: 'US',
    },
    {
        userAgent:
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-GB,en;q=0.9',
        platform: 'Linux x86_64',
        region: 'GB',
    },
]

class ApifyYouTubeProxy {
    constructor() {
        this.proxyUrl = null
        this.currentProfile = null
        this.r2Client = null
    }

    async initialize(input = {}) {
        // Get Apify proxy configuration (automatic IP rotation)
        const proxyConfiguration = await Actor.createProxyConfiguration({
            groups: ['RESIDENTIAL'], // Use residential IPs for better stealth
            countryCode: input.countryCode || 'US',
        })
        
        this.proxyUrl = await proxyConfiguration.newUrl()
        this.currentProfile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]

        // Initialize R2 client using environment variables
        const r2AccountId = process.env.CLOUDFLARE_ACCOUNT_ID
        const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
        const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
        const r2Endpoint = process.env.CLOUDFLARE_R2_ENDPOINT

        if (r2AccountId && r2AccessKeyId && r2SecretAccessKey) {
            this.r2Client = new S3Client({
                region: 'auto',
                endpoint: r2Endpoint || `https://${r2AccountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: r2AccessKeyId,
                    secretAccessKey: r2SecretAccessKey,
                },
            })
            console.log('☁️ R2 client initialized from environment variables')
        } else {
            console.log('⚠️ R2 environment variables not found - R2 upload disabled')
        }

        console.log('🌐 Apify Actor initialized with:')
        console.log(`📍 Proxy: ${this.proxyUrl ? 'ENABLED (Residential)' : 'DISABLED'}`)
        console.log(`🎭 Profile: ${this.currentProfile.platform}`)
        console.log(`☁️ R2 Upload: ${this.r2Client ? 'ENABLED' : 'DISABLED'}`)
    }

    async extractYouTubeVideo(videoUrl, uploadToR2 = false) {
        const videoId = this.extractVideoId(videoUrl)
        if (!videoId) {
            throw new Error('Invalid YouTube URL')
        }

        console.log(`🎯 Extracting video: ${videoId}`)

        // Try multiple extraction methods with proxy rotation
        const extractionMethods = [
            () => this.extractViaWatchPage(videoId),
            () => this.extractViaEmbedPage(videoId),
            () => this.extractViaMobileAPI(videoId),
            () => this.extractViaOEmbed(videoId),
        ]

        for (const [index, method] of extractionMethods.entries()) {
            try {
                console.log(`📡 Attempt ${index + 1}: ${method.name}`)
                const result = await method()

                if (result && (result.audioFormats?.length > 0 || result.url)) {
                    // If we found audio formats and R2 upload is requested
                    if (uploadToR2 && result.audioFormats?.length > 0 && this.r2Client) {
                        console.log('🎵 Audio formats found, downloading and uploading to R2...')
                        const r2Result = await this.downloadAndUploadAudio(result)
                        return r2Result
                    }

                    return result
                }
            } catch (error) {
                console.log(`❌ Method ${index + 1} failed: ${error.message}`)

                // Rotate IP and profile for next attempt
                await this.rotateIPAndProfile()
            }
        }

        throw new Error('All extraction methods failed')
    }

    async downloadAndUploadAudio(extractionResult) {
        const { videoId, audioFormats, videoInfo } = extractionResult
        const bucketName = process.env.CLOUDFLARE_R2_BUCKET

        if (!bucketName) {
            throw new Error('CLOUDFLARE_R2_BUCKET environment variable not set')
        }

        if (!audioFormats || audioFormats.length === 0) {
            throw new Error('No audio formats available')
        }

        // Select best audio format (prioritized in extractAudioOnlyFormats)
        const bestAudioFormat = audioFormats[0]
        console.log(`🎵 Downloading audio: ${bestAudioFormat.mimeType} (${bestAudioFormat.audioQuality})`)

        try {
            // Download audio stream
            const audioResponse = await this.makeRequest(bestAudioFormat.url, {
                responseType: 'stream',
            })

            if (audioResponse.statusCode !== 200) {
                throw new Error(`Failed to download audio: HTTP ${audioResponse.statusCode}`)
            }

            // Generate R2 object key
            const fileExtension = bestAudioFormat.mimeType.includes('mp4')
                ? 'mp4'
                : bestAudioFormat.mimeType.includes('webm')
                ? 'webm'
                : 'audio'
            const objectKey = `youtube-audio/${videoId}/${Date.now()}.${fileExtension}`

            console.log(`☁️ Uploading to R2: ${objectKey}`)

            // Upload to R2 using streaming upload
            const upload = new Upload({
                client: this.r2Client,
                params: {
                    Bucket: bucketName,
                    Key: objectKey,
                    Body: audioResponse.body,
                    ContentType: bestAudioFormat.mimeType,
                    Metadata: {
                        videoId: videoId,
                        title: videoInfo?.title || 'Unknown',
                        audioQuality: bestAudioFormat.audioQuality,
                        bitrate: bestAudioFormat.bitrate?.toString() || 'unknown',
                        duration: bestAudioFormat.approxDurationMs || 'unknown',
                        extractedAt: new Date().toISOString(),
                    },
                },
            })

            const uploadResult = await upload.done()
            console.log(`✅ Audio uploaded successfully to R2`)

            // Return comprehensive result
            return {
                success: true,
                videoId,
                videoInfo,
                audioFormat: bestAudioFormat,
                r2Upload: {
                    bucket: bucketName,
                    key: objectKey,
                    url: `https://${bucketName}.r2.dev/${objectKey}`, // Adjust based on your R2 domain
                    etag: uploadResult.ETag,
                    location: uploadResult.Location,
                },
                extractedAt: new Date().toISOString(),
                method: 'audio-only-r2-upload',
            }
        } catch (error) {
            console.error(`❌ Audio download/upload failed: ${error.message}`)
            throw new Error(`Audio processing failed: ${error.message}`)
        }
    }

    async rotateIPAndProfile() {
        // Force new IP by getting new proxy URL
        const countries = ['US', 'GB', 'CA', 'AU', 'DE']
        const randomCountry = countries[Math.floor(Math.random() * countries.length)]

        try {
            const proxyConfiguration = await Actor.createProxyConfiguration({
                groups: ['RESIDENTIAL'],
                countryCode: randomCountry,
            })
            
            this.proxyUrl = await proxyConfiguration.newUrl(`session_${Date.now()}`)
            this.currentProfile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]

            console.log(`🔄 IP Rotated: ${randomCountry} | Profile: ${this.currentProfile.platform}`)
        } catch (error) {
            console.log(`⚠️ Failed to rotate proxy: ${error.message}`)
        }

        // Add delay to simulate human behavior
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000))
    }

    async makeRequest(url, options = {}) {
        const requestOptions = {
            url,
            headers: {
                'User-Agent': this.currentProfile.userAgent,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': this.currentProfile.acceptLanguage,
                'Accept-Encoding': 'gzip, deflate, br',
                DNT: '1',
                Connection: 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                ...options.headers,
            },
            timeout: 30000,
            retry: 0, // We handle retries manually
            ...options,
        }

        // Use Apify proxy if available
        if (this.proxyUrl) {
            requestOptions.proxyUrl = this.proxyUrl
        }

        return await gotScraping(requestOptions)
    }

    extractVideoId(url) {
        const regex =
            /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
        const match = url.match(regex)
        return match ? match[1] : null
    }

    async extractViaEmbedPage(videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}`
        const response = await this.makeRequest(embedUrl)

        // Extract video info from embed page
        const htmlContent = response.body

        // Look for video stream URLs
        const streamRegex = /"url":"([^"]+)"/g
        const matches = [...htmlContent.matchAll(streamRegex)]

        if (matches.length > 0) {
            const videoUrl = decodeURIComponent(matches[0][1].replace(/\\u0026/g, '&'))
            return {
                videoId,
                url: videoUrl,
                method: 'embed',
                extractedAt: new Date().toISOString(),
            }
        }

        throw new Error('No video streams found in embed page')
    }

    async extractViaWatchPage(videoId) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
        const response = await this.makeRequest(watchUrl, {
            headers: {
                Referer: 'https://www.google.com/',
            },
        })

        const htmlContent = response.body

        // Extract from player config
        const configRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/
        const match = htmlContent.match(configRegex)

        if (match) {
            try {
                const playerResponse = JSON.parse(match[1])
                const streamingData = playerResponse.streamingData

                if (streamingData) {
                    // Prioritize audio-only streams
                    const audioFormats = this.extractAudioOnlyFormats(streamingData)

                    if (audioFormats.length > 0) {
                        return {
                            videoId,
                            audioFormats,
                            videoInfo: playerResponse.videoDetails,
                            method: 'watch',
                            extractedAt: new Date().toISOString(),
                        }
                    }

                    // Fallback to combined formats if no audio-only found
                    if (streamingData.formats && streamingData.formats.length > 0) {
                        const format = streamingData.formats[0]
                        return {
                            videoId,
                            url: format.url,
                            audioFormats: [],
                            videoInfo: playerResponse.videoDetails,
                            method: 'watch-fallback',
                            extractedAt: new Date().toISOString(),
                        }
                    }
                }
            } catch (parseError) {
                throw new Error('Failed to parse player response')
            }
        }

        throw new Error('No player response found')
    }

    // Extract and prioritize audio-only formats
    extractAudioOnlyFormats(streamingData) {
        const audioFormats = []

        // Check adaptive formats for audio-only streams
        if (streamingData.adaptiveFormats) {
            for (const format of streamingData.adaptiveFormats) {
                // Audio-only formats (no video)
                if (format.mimeType && format.mimeType.startsWith('audio/')) {
                    const audioFormat = {
                        itag: format.itag,
                        url: format.url,
                        mimeType: format.mimeType,
                        audioQuality: format.audioQuality || 'unknown',
                        bitrate: format.bitrate || format.averageBitrate,
                        contentLength: format.contentLength,
                        approxDurationMs: format.approxDurationMs,
                        codec: this.extractCodec(format.mimeType),
                    }

                    // Prioritize by quality and codec
                    if (format.itag === 140) {
                        // AAC 128kbps - most compatible
                        audioFormats.unshift(audioFormat)
                    } else if (format.itag === 251) {
                        // Opus - high quality
                        audioFormats.push(audioFormat)
                    } else if (format.itag === 249 || format.itag === 250) {
                        // Opus lower quality
                        audioFormats.push(audioFormat)
                    } else {
                        audioFormats.push(audioFormat)
                    }
                }
            }
        }

        return audioFormats
    }

    extractCodec(mimeType) {
        const codecMatch = mimeType.match(/codecs="([^"]+)"/)
        return codecMatch ? codecMatch[1] : 'unknown'
    }

    async extractViaMobileAPI(videoId) {
        const mobileUrl = `https://m.youtube.com/watch?v=${videoId}`
        const response = await this.makeRequest(mobileUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
            },
        })

        // Mobile extraction logic
        const htmlContent = response.body
        const streamRegex = /"url":"([^"]+)"/g
        const matches = [...htmlContent.matchAll(streamRegex)]

        if (matches.length > 0) {
            return {
                videoId,
                url: decodeURIComponent(matches[0][1]),
                method: 'mobile',
                extractedAt: new Date().toISOString(),
            }
        }

        throw new Error('Mobile extraction failed')
    }

    async extractViaOEmbed(videoId) {
        const oembedUrl = `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`
        const response = await this.makeRequest(oembedUrl)

        const data = JSON.parse(response.body)
        return {
            videoId,
            title: data.title,
            thumbnail: data.thumbnail_url,
            author: data.author_name,
            method: 'oembed',
            extractedAt: new Date().toISOString(),
        }
    }

    async proxyGenericRequest(targetUrl) {
        console.log(`🔗 Proxying request to: ${targetUrl}`)

        try {
            const response = await this.makeRequest(targetUrl)
            return {
                success: true,
                status: response.statusCode,
                headers: response.headers,
                body: response.body,
                proxyInfo: {
                    proxyUsed: !!this.proxyUrl,
                    profile: this.currentProfile.platform,
                    timestamp: new Date().toISOString(),
                },
            }
        } catch (error) {
            throw new Error(`Proxy request failed: ${error.message}`)
        }
    }
}

// Main Apify Actor entry point
Actor.main(async () => {
    console.log('🚀 Apify YouTube Audio Extractor Actor starting...')

    // Get input from Apify
    const input = await Actor.getInput()
    console.log('📥 Input received:', input)

    const extractor = new ApifyYouTubeProxy()
    await extractor.initialize(input)

    try {
        let result

        if (input.youtubeUrl) {
            // YouTube audio extraction mode
            const uploadToR2 = !!process.env.CLOUDFLARE_R2_BUCKET && !!extractor.r2Client

            if (uploadToR2) {
                console.log('🎵 YouTube audio extraction + R2 upload mode')
                result = await extractor.extractYouTubeVideo(input.youtubeUrl, true)
            } else {
                console.log('🎵 YouTube audio extraction mode (no R2 upload)')
                result = await extractor.extractYouTubeVideo(input.youtubeUrl, false)
            }

            console.log('✅ YouTube extraction successful')
        } else if (input.proxyUrl) {
            // Generic proxy mode
            result = await extractor.proxyGenericRequest(input.proxyUrl)
            console.log('✅ Proxy request successful')
        } else {
            // Default test mode
            result = {
                message: 'Apify YouTube Audio Extractor Actor is running!',
                availableModes: ['youtubeUrl (with automatic R2 upload)', 'proxyUrl'],
                environment: {
                    r2Configured: !!process.env.CLOUDFLARE_R2_BUCKET,
                    bucket: process.env.CLOUDFLARE_R2_BUCKET || 'not-configured'
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
        console.log('💾 Result saved to dataset')

        // Also save to key-value store
        await Actor.setValue('RESULT', result)
        console.log('🔑 Result saved to key-value store')
    } catch (error) {
        console.error('❌ Actor failed:', error)

        const errorResult = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
        }

        await Actor.pushData(errorResult)
        await Actor.setValue('ERROR', errorResult)

        throw error
    }

    console.log('🎯 Apify Actor completed successfully!')
})
