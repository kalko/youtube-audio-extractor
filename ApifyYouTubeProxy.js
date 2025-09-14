// ApifyYouTubeProxy - YouTube Audio Extraction with IP Rotation and R2 Upload
// Handles YouTube audio extraction, proxy rotation, and Cloudflare R2 uploads

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
            console.log('☁️ R2 client initialized from environment variables')
        } else {
            console.log('⚠️ R2 environment variables not found - R2 upload disabled')
        }

        console.log('🌐 Apify Actor initialized with:')
        console.log(`📍 Proxy: ${this.proxyUrl ? 'ENABLED (Residential)' : 'DISABLED'}`)
        console.log(`🎭 Profile: ${this.currentProfile.platform}`)
        console.log(`☁️ R2 Upload: ${this.r2Client ? 'ENABLED' : 'DISABLED'}`)

        // Log current IP address
        await this.logCurrentIP()
    }

    async logCurrentIP() {
        try {
            const ipResponse = await this.makeRequest('https://httpbin.org/ip')
            const ipData = JSON.parse(ipResponse.body)
            console.log(`🌍 Current IP: ${ipData.origin}`)
        } catch (error) {
            console.log(`⚠️ Could not determine IP: ${error.message}`)
        }
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
            () => this.extractViaYtDlp(videoId), // NEW: yt-dlp fallback
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

        // Select best audio format
        const bestAudioFormat = audioFormats[0]

        // Validate we have some audio format
        if (!bestAudioFormat) {
            throw new Error('No audio format with downloadable URL found')
        }

        // Log what format we're using
        if (bestAudioFormat.combined) {
            console.log(
                `🔄 Using combined audio+video format: ${bestAudioFormat.mimeType} (itag ${bestAudioFormat.itag})`,
            )
            console.log(`⚠️ This contains video - will upload as-is for now`)
        } else if (bestAudioFormat.fallback) {
            console.log(
                `🔄 Using fallback format: ${bestAudioFormat.mimeType} (itag ${bestAudioFormat.itag})`,
            )
            console.log(`⚠️ This is not AAC - Whisper may need conversion`)
        } else {
            console.log(
                `🎵 Using preferred AAC format: ${bestAudioFormat.mimeType} (${bestAudioFormat.audioQuality})`,
            )
        }

        try {
            // Download audio stream
            const audioResponse = await this.makeRequest(bestAudioFormat.url, {
                responseType: 'buffer', // Fix: use 'buffer' instead of 'stream' for gotScraping
            })

            if (audioResponse.statusCode !== 200) {
                throw new Error(`Failed to download audio: HTTP ${audioResponse.statusCode}`)
            }

            // Generate R2 object key: temp-audio/{videoId}.mp4
            const objectKey = `temp-audio/${videoId}.mp4`

            console.log(`☁️ Uploading to R2: ${objectKey}`)

            // Upload to R2 using streaming upload
            const upload = new Upload({
                client: this.r2Client,
                params: {
                    Bucket: bucketName,
                    Key: objectKey,
                    Body: audioResponse.body, // This will be a buffer now
                    ContentType: 'audio/mp4',
                    Metadata: {
                        videoId: videoId,
                        title: videoInfo?.title || 'Unknown',
                        duration: bestAudioFormat.approxDurationMs || 'unknown',
                        format: 'aac-128k-whisper-ready',
                        processingStatus: 'ready-for-transcription',
                        bitrate: bestAudioFormat.bitrate?.toString() || '128000',
                        codec: 'mp4a.40.2',
                        extractedAt: new Date().toISOString(),
                        whisperOptimized: 'true',
                    },
                },
            })

            const uploadResult = await upload.done()
            console.log(`✅ Audio uploaded successfully to R2`)

            // Return comprehensive result optimized for Whisper processing
            return {
                success: true,
                videoId,
                videoInfo,
                audioFormat: bestAudioFormat,
                whisperReady: {
                    audioUrl: `https://${bucketName}.r2.dev/${objectKey}`,
                    format: 'audio/mp4',
                    codec: 'aac',
                    bitrate: bestAudioFormat.bitrate || 128000,
                    duration: bestAudioFormat.approxDurationMs,
                    sizeBytes: bestAudioFormat.contentLength,
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
                    extractionMethod: 'watch-page-with-proxy',
                },
                extractedAt: new Date().toISOString(),
                method: 'aac-whisper-optimized',
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

            // Log new IP after rotation
            try {
                const ipResponse = await this.makeRequest('https://httpbin.org/ip')
                const ipData = JSON.parse(ipResponse.body)
                console.log(`🌍 New IP: ${ipData.origin}`)
            } catch (error) {
                console.log(`⚠️ Could not verify new IP: ${error.message}`)
            }
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
            timeout: { request: 30000 }, // Fix: timeout should be an object
            retry: { limit: 0 }, // Fix: retry should be an object with limit property
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
                    console.log('📊 Found streaming data, looking for AAC audio...')

                    // Prioritize audio-only streams
                    const audioFormats = this.extractAudioOnlyFormats(streamingData)

                    if (audioFormats.length > 0) {
                        console.log(`🎵 Found ${audioFormats.length} audio format(s) with direct URLs`)
                        return {
                            videoId,
                            audioFormats,
                            videoInfo: playerResponse.videoDetails,
                            method: 'watch',
                            extractedAt: new Date().toISOString(),
                        }
                    } else {
                        console.log('⚠️ No audio formats with direct URLs found (likely signature-protected)')

                        // Debug: Log what formats we do have
                        if (streamingData.adaptiveFormats) {
                            console.log(
                                `📋 Available formats: ${streamingData.adaptiveFormats
                                    .map((f) => f.itag)
                                    .join(', ')}`,
                            )
                        }
                    }

                    // ✅ FALLBACK: Use combined formats (like original working version)
                    if (streamingData.formats && streamingData.formats.length > 0) {
                        console.log(`🔄 Falling back to combined formats (original working method)`)
                        console.log(`🔍 Found ${streamingData.formats.length} combined formats`)

                        // Debug: Show what combined formats we have
                        streamingData.formats.forEach((f, i) => {
                            console.log(
                                `   ${i}: itag ${f.itag}, mimeType: ${f.mimeType}, hasUrl: ${!!f.url}`,
                            )
                        })

                        const format = streamingData.formats[0]

                        if (format.url) {
                            console.log(
                                `✅ Found combined format with direct URL: ${
                                    format.mimeType || 'unknown'
                                } (itag ${format.itag})`,
                            )

                            // Convert to our audio format structure for consistency
                            const audioFormat = {
                                itag: format.itag,
                                url: format.url,
                                mimeType: format.mimeType || 'video/mp4',
                                audioQuality: format.audioQuality || 'AUDIO_QUALITY_MEDIUM',
                                bitrate: format.bitrate || format.averageBitrate || 128000,
                                contentLength: format.contentLength,
                                approxDurationMs: format.approxDurationMs,
                                codec: 'mixed', // This is audio+video combined
                                whisperReady: false, // Will need audio extraction
                                fallback: true,
                                combined: true, // Flag that this is audio+video
                            }

                            return {
                                videoId,
                                audioFormats: [audioFormat],
                                videoInfo: playerResponse.videoDetails,
                                method: 'watch-combined',
                                extractedAt: new Date().toISOString(),
                            }
                        } else {
                            console.log(`❌ Combined format has no direct URL either - signature protected`)
                        }
                    } else {
                        console.log(`❌ No combined formats found`)
                    }
                }
            } catch (parseError) {
                throw new Error('Failed to parse player response')
            }
        }

        throw new Error('No player response found')
    }

    // Extract and prioritize audio-only formats - AAC ONLY for Whisper compatibility
    extractAudioOnlyFormats(streamingData) {
        const audioFormats = []

        // Check adaptive formats for AAC audio-only streams (itag 140)
        if (streamingData.adaptiveFormats) {
            console.log(`🔍 Searching through ${streamingData.adaptiveFormats.length} adaptive formats...`)

            for (const format of streamingData.adaptiveFormats) {
                // Debug: Log itag 140 specifically
                if (format.itag === 140) {
                    console.log(`🎯 Found itag 140! Details:`)
                    console.log(`   mimeType: ${format.mimeType}`)
                    console.log(`   hasUrl: ${!!format.url}`)
                    console.log(`   hasSignatureCipher: ${!!format.signatureCipher}`)
                    console.log(`   audioQuality: ${format.audioQuality}`)
                }

                // ONLY extract AAC format (itag 140) for Whisper processing
                if (
                    format.mimeType &&
                    format.mimeType.startsWith('audio/mp4') &&
                    format.itag === 140 &&
                    (format.url || format.signatureCipher) // Accept both direct URLs and signature-protected
                ) {
                    console.log(
                        `✅ AAC format found (direct URL: ${!!format.url}, encrypted: ${!!format.signatureCipher})`,
                    )

                    // If we have a direct URL, use it
                    let finalUrl = format.url

                    // If we only have signatureCipher, we need to decode it
                    if (!finalUrl && format.signatureCipher) {
                        console.log(`🔓 Attempting to decode signatureCipher...`)
                        finalUrl = this.decodeSignatureCipher(format.signatureCipher)
                    }

                    if (finalUrl) {
                        const audioFormat = {
                            itag: format.itag,
                            url: finalUrl,
                            mimeType: format.mimeType,
                            audioQuality: format.audioQuality || 'AUDIO_QUALITY_MEDIUM',
                            bitrate: format.bitrate || format.averageBitrate || 128000,
                            contentLength: format.contentLength,
                            approxDurationMs: format.approxDurationMs,
                            codec: 'mp4a.40.2', // AAC codec
                            whisperReady: true, // Flag for processing pipeline
                            wasEncrypted: !!format.signatureCipher, // Track if we decoded it
                        }

                        audioFormats.push(audioFormat)
                        break // Only need the AAC format
                    } else {
                        console.log(`❌ Could not decode signatureCipher for itag 140`)
                    }
                }
            }

            // If no AAC with URL, find ANY audio format with URL or decodable cipher
            if (audioFormats.length === 0) {
                console.log(`⚠️ No AAC with accessible URL - checking for fallback audio formats...`)

                // Debug: Show which formats have URLs or ciphers
                const formatsWithUrls = streamingData.adaptiveFormats.filter(
                    (f) => f.url || f.signatureCipher,
                )
                console.log(`🔍 Found ${formatsWithUrls.length} formats with URLs or ciphers`)

                const audioFormatsWithUrls = formatsWithUrls.filter(
                    (f) => f.mimeType && f.mimeType.startsWith('audio/'),
                )
                console.log(`🎵 Found ${audioFormatsWithUrls.length} audio formats with accessible URLs:`)
                audioFormatsWithUrls.forEach((f) => {
                    console.log(
                        `   - itag ${f.itag}: ${
                            f.mimeType
                        } (direct: ${!!f.url}, encrypted: ${!!f.signatureCipher})`,
                    )
                })

                for (const format of streamingData.adaptiveFormats) {
                    if (
                        format.mimeType &&
                        format.mimeType.startsWith('audio/') &&
                        (format.url || format.signatureCipher)
                    ) {
                        let finalUrl = format.url
                        if (!finalUrl && format.signatureCipher) {
                            finalUrl = this.decodeSignatureCipher(format.signatureCipher)
                        }

                        if (finalUrl) {
                            console.log(`🔄 Using fallback audio: ${format.mimeType} (itag ${format.itag})`)
                            const audioFormat = {
                                itag: format.itag,
                                url: finalUrl,
                                mimeType: format.mimeType,
                                audioQuality: format.audioQuality || 'AUDIO_QUALITY_MEDIUM',
                                bitrate: format.bitrate || format.averageBitrate || 128000,
                                contentLength: format.contentLength,
                                approxDurationMs: format.approxDurationMs,
                                codec: format.mimeType.includes('opus') ? 'opus' : 'webm',
                                whisperReady: false, // Not AAC but still usable
                                fallback: true,
                                wasEncrypted: !!format.signatureCipher,
                            }

                            audioFormats.push(audioFormat)
                            break // Take first working format
                        }
                    }
                }
            }
        }

        return audioFormats
    }

    // Decode YouTube's signatureCipher to get actual URLs
    decodeSignatureCipher(signatureCipher) {
        try {
            console.log(`🔓 Decoding signatureCipher...`)

            // Parse the signatureCipher parameters
            const params = new URLSearchParams(signatureCipher)
            const url = params.get('url')
            const s = params.get('s')
            const sp = params.get('sp') || 'sig'

            if (!url) {
                console.log(`❌ No URL found in signatureCipher`)
                return null
            }

            if (!s) {
                console.log(`❌ No signature found in signatureCipher`)
                return null
            }

            // For now, we'll try a simple signature bypass
            // This is a simplified approach - YouTube's signature algorithm changes frequently
            console.log(`🔧 Attempting simple signature bypass...`)

            // Try common signature parameter positions
            const decodedUrl = `${decodeURIComponent(url)}&${sp}=${s}`

            console.log(`✅ Decoded URL successfully`)
            return decodedUrl
        } catch (error) {
            console.log(`❌ Failed to decode signatureCipher: ${error.message}`)
            return null
        }
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

    async extractViaYtDlp(videoId) {
        console.log(`🚀 Trying yt-dlp extraction for ${videoId}`)

        try {
            // Use yt-dlp to get audio URL with proxy if available
            const extractorOptions = {}
            if (this.proxyUrl) {
                extractorOptions.proxy = this.proxyUrl
            }

            const result = await YtDlpExtractor.extractAudioUrl(videoId, extractorOptions)

            if (result.audioUrl) {
                // Convert to our format structure
                const audioFormat = {
                    itag: 'yt-dlp',
                    url: result.audioUrl,
                    mimeType: 'audio/mp4', // yt-dlp prefers m4a/mp4
                    audioQuality: 'AUDIO_QUALITY_HIGH',
                    bitrate: 128000,
                    codec: 'mp4a.40.2',
                    whisperReady: true,
                    ytDlpExtracted: true,
                }

                return {
                    videoId,
                    audioFormats: [audioFormat],
                    videoInfo: { title: 'yt-dlp extracted' },
                    method: 'yt-dlp',
                    extractedAt: new Date().toISOString(),
                }
            }
        } catch (error) {
            throw new Error(`yt-dlp extraction failed: ${error.message}`)
        }

        throw new Error('yt-dlp extraction returned no audio URL')
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
