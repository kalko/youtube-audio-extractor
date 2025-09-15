// ApifyYouTubeProxy - Clean version with only working yt-dlp extraction
// Handles YouTube audio extraction with IP rotation and Cloudflare R2 uploads

import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { Actor } from 'apify'
import { gotScraping } from 'got-scraping'
import { YtDlpExtractor } from './YtDlpExtractor.js'

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

export class ApifyYouTubeProxy {
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
            console.log('R2 client initialized from environment variables')
        } else {
            console.log('R2 environment variables not found - R2 upload disabled')
        }

        console.log('Apify Actor initialized with:')
        console.log(`Proxy: ${this.proxyUrl ? 'ENABLED (Residential)' : 'DISABLED'}`)
        console.log(`Profile: ${this.currentProfile.platform}`)
        console.log(`R2 Upload: ${this.r2Client ? 'ENABLED' : 'DISABLED'}`)

        // Log current IP address
        await this.logCurrentIP()
    }

    async logCurrentIP() {
        try {
            const ipResponse = await this.makeRequest('https://httpbin.org/ip')
            const ipData = JSON.parse(ipResponse.body)
            console.log(`Current IP: ${ipData.origin}`)
        } catch (error) {
            console.log(`Could not determine IP: ${error.message}`)
        }
    }

    async extractYouTubeVideo(videoUrl, uploadToR2 = false) {
        const videoId = this.extractVideoId(videoUrl)
        if (!videoId) {
            throw new Error('Invalid YouTube URL')
        }

        console.log(`Extracting video: ${videoId}`)

        // Use yt-dlp as the primary extraction method
        try {
            console.log('Using yt-dlp extraction method')
            const result = await this.extractViaYtDlp(videoId)

            // For R2 upload mode, check if this is a direct yt-dlp R2 result
            if (uploadToR2) {
                if (result && result.ytDlpDirect && result.r2Upload) {
                    console.log('yt-dlp direct R2 upload completed successfully')
                    return result
                } else {
                    throw new Error('yt-dlp did not return a valid R2 upload result')
                }
            } else {
                // Original logic for non-R2 mode
                if (result && (result.audioFormats?.length > 0 || result.url)) {
                    return result
                } else {
                    throw new Error('yt-dlp did not return usable result')
                }
            }
        } catch (error) {
            console.log(`yt-dlp extraction failed: ${error.message}`)
            throw new Error('YouTube extraction failed')
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

            console.log(`IP Rotated: ${randomCountry} | Profile: ${this.currentProfile.platform}`)

            // Log new IP after rotation
            try {
                const ipResponse = await this.makeRequest('https://httpbin.org/ip')
                const ipData = JSON.parse(ipResponse.body)
                console.log(`New IP: ${ipData.origin}`)
            } catch (error) {
                console.log(`Could not verify new IP: ${error.message}`)
            }
        } catch (error) {
            console.log(`Failed to rotate proxy: ${error.message}`)
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
            timeout: { request: 120000 }, // 2 minutes timeout for large audio files
            retry: { limit: 0 },
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

    async extractViaYtDlp(videoId) {
        console.log(`Trying yt-dlp direct download for ${videoId}`)

        try {
            // Use yt-dlp direct download with proxy if available
            const extractorOptions = {}
            if (this.proxyUrl) {
                extractorOptions.proxy = this.proxyUrl
            }

            // Use yt-dlp to download the file directly
            const result = await YtDlpExtractor.downloadAudioDirect(videoId, extractorOptions)

            if (result.filePath) {
                console.log(`yt-dlp downloaded audio successfully to: ${result.filePath}`)
                
                // Read the file and upload to R2 directly
                const fs = await import('fs')
                const fileBuffer = await fs.promises.readFile(result.filePath)
                
                // Upload to R2
                const bucketName = process.env.CLOUDFLARE_R2_BUCKET
                if (!bucketName) {
                    throw new Error('CLOUDFLARE_R2_BUCKET environment variable not set')
                }

                const objectKey = `temp-audio/${videoId}.mp4`
                console.log(`Uploading yt-dlp file to R2: ${objectKey}`)

                const upload = new Upload({
                    client: this.r2Client,
                    params: {
                        Bucket: bucketName,
                        Key: objectKey,
                        Body: fileBuffer,
                        ContentType: 'audio/mp4',
                        Metadata: {
                            videoId: videoId,
                            title: 'yt-dlp extracted',
                            format: 'audio-best-quality',
                            processingStatus: 'ready-for-transcription',
                            extractedAt: new Date().toISOString(),
                            method: 'yt-dlp-direct',
                            whisperOptimized: 'true',
                        },
                    },
                })

                const uploadResult = await upload.done()
                console.log(`yt-dlp audio uploaded successfully to R2`)

                // Clean up temporary file
                try {
                    await fs.promises.unlink(result.filePath)
                    console.log(`Cleaned up temporary file: ${result.filePath}`)
                } catch (cleanupError) {
                    console.log(`Could not clean up temp file: ${cleanupError.message}`)
                }

                // Return R2 upload result directly
                return {
                    success: true,
                    videoId,
                    videoInfo: { title: 'yt-dlp extracted' },
                    audioFormat: {
                        itag: 'yt-dlp',
                        mimeType: 'audio/mp4',
                        audioQuality: 'AUDIO_QUALITY_HIGH',
                        bitrate: 128000,
                        codec: 'mp4a.40.2',
                        whisperReady: true,
                        ytDlpExtracted: true,
                    },
                    whisperReady: {
                        audioUrl: `https://${bucketName}.r2.dev/${objectKey}`,
                        format: 'audio/mp4',
                        codec: 'best-quality',
                        filename: `${videoId}.mp4`,
                    },
                    r2Upload: {
                        bucket: bucketName,
                        key: objectKey,
                        url: `https://${bucketName}.r2.dev/${objectKey}`,
                        etag: uploadResult.ETag,
                        location: uploadResult.Location,
                    },
                    proxyInfo: {
                        proxyUsed: !!this.proxyUrl,
                        profile: this.currentProfile.platform,
                        extractionMethod: 'yt-dlp-direct-download',
                    },
                    extractedAt: new Date().toISOString(),
                    method: 'yt-dlp-r2-direct',
                    ytDlpDirect: true // Flag for direct yt-dlp result
                }
            }
        } catch (error) {
            throw new Error(`yt-dlp direct download failed: ${error.message}`)
        }

        throw new Error('yt-dlp extraction returned no audio file')
    }

    async proxyGenericRequest(targetUrl) {
        console.log(`Proxying request to: ${targetUrl}`)

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
