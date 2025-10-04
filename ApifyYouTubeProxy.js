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

const AUDIO_MIME_TYPES = {
    webm: 'audio/webm',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    mp3: 'audio/mpeg',
    opus: 'audio/opus',
}

const PROXY_GROUPS = {
    DATACENTER: ['SHADER'],
    RESIDENTIAL: ['RESIDENTIAL'],
}

const pickRandomProfile = () => BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]

export class ApifyYouTubeProxy {
    constructor() {
        this.proxyUrl = null
        this.currentProfile = null
        this.r2Client = null
        this.r2Bucket = process.env.CLOUDFLARE_R2_BUCKET || null
        this.minimizeSize = true
        this.proxyConfigurations = {}
        this.currentProxyGroup = null
        this.proxyStrategy = 'datacenter-first'
        this.preferResidential = false
        this.input = {}
    }

    async initialize(input = {}) {
        this.input = input || {}
        this.minimizeSize = input.minimizeSize === undefined ? true : Boolean(input.minimizeSize)
        this.preferResidential = Boolean(input.preferResidential)
        this.proxyConfigurations = {}
        this.proxyUrl = null
        this.currentProxyGroup = null
        this.currentProfile = null
        this.proxyStrategy = this.resolveProxyStrategy(input)

        // Initialize R2 client using environment variables
        const r2AccountId = process.env.CLOUDFLARE_ACCOUNT_ID
        const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
        const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
        const r2Endpoint = process.env.CLOUDFLARE_R2_ENDPOINT
        this.r2Bucket = process.env.CLOUDFLARE_R2_BUCKET || this.r2Bucket

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

        await this.establishInitialProxy()

        console.log('Apify Actor initialized with:')
        console.log(`Proxy strategy: ${this.proxyStrategy}`)
        console.log(`Proxy group: ${this.currentProxyGroup || 'NONE'}`)
        console.log(`Profile: ${this.currentProfile?.platform || 'unknown'}`)
        console.log(`R2 Upload: ${this.r2Client ? 'ENABLED' : 'DISABLED'}`)
        console.log(`Minimize size mode: ${this.minimizeSize ? 'ON' : 'OFF'}`)

        if (this.proxyUrl) {
            await this.logCurrentIP()
        } else {
            console.log('No proxy configured at initialization')
        }
    }

    resolveProxyStrategy(input = {}) {
        if (typeof input.proxyStrategy === 'string') {
            const normalized = input.proxyStrategy.toLowerCase()
            if (
                ['datacenter-first', 'residential-first', 'datacenter-only', 'residential-only'].includes(
                    normalized,
                )
            ) {
                return normalized
            }
        }

        if (input.preferResidential) {
            return 'residential-first'
        }

        return 'datacenter-first'
    }

    getProxyPlan() {
        const normalized = (this.proxyStrategy || '').toLowerCase()

        switch (normalized) {
            case 'residential-only':
                return [{ key: 'RESIDENTIAL', label: 'residential' }]
            case 'residential-first':
                return [
                    { key: 'RESIDENTIAL', label: 'residential' },
                    { key: 'DATACENTER', label: 'datacenter' },
                ]
            case 'datacenter-only':
                return [{ key: 'DATACENTER', label: 'datacenter' }]
            case 'datacenter-first':
            default:
                return [
                    { key: 'DATACENTER', label: 'datacenter' },
                    { key: 'RESIDENTIAL', label: 'residential' },
                ]
        }
    }

    async establishInitialProxy() {
        const plan = this.getProxyPlan()
        let lastError = null

        for (const attempt of plan) {
            try {
                await this.useProxyGroup(attempt.key)
                console.log(`Initial proxy group set to ${attempt.label}`)
                return
            } catch (error) {
                lastError = error
                console.log(`Failed to initialize ${attempt.label} proxy group: ${error.message}`)
            }
        }

        if (lastError) {
            throw lastError
        }
    }

    async useProxyGroup(groupKey) {
        const normalized = (groupKey || '').toUpperCase()
        const groups = PROXY_GROUPS[normalized]

        if (!groups) {
            throw new Error(`Unsupported proxy group: ${groupKey}`)
        }

        if (!this.proxyConfigurations[normalized]) {
            const configOptions = { groups }
            if (normalized === 'RESIDENTIAL' && this.input?.countryCode) {
                configOptions.countryCode = this.input.countryCode
            }

            this.proxyConfigurations[normalized] = await Actor.createProxyConfiguration(configOptions)
        }

        const proxyConfiguration = this.proxyConfigurations[normalized]
        const newUrl = await proxyConfiguration.newUrl()

        if (!newUrl) {
            throw new Error(`Failed to retrieve proxy URL for group ${normalized}`)
        }

        this.proxyUrl = newUrl
        this.currentProxyGroup = normalized
        this.currentProfile = pickRandomProfile()

        console.log(`Proxy group switched to ${normalized.toLowerCase()}`)
    }

    async logCurrentIP() {
        if (!this.proxyUrl) {
            console.log('Skipping IP check because no proxy URL is configured')
            return
        }

        console.log(`Checking current IP via ${this.currentProxyGroup || 'unknown'} proxies`)
        try {
            const ipResponse = await this.makeRequest('https://httpbin.org/ip')
            console.log('IP check status:', ipResponse.statusCode)
            console.log('IP check headers:', ipResponse.headers)
            console.log('Raw IP check response:', ipResponse.body)
            let ipData
            try {
                ipData = JSON.parse(ipResponse.body)
                console.log(`Current IP: ${ipData.origin}`)
            } catch (jsonErr) {
                console.error(
                    'IP check did not return JSON. Possible block or CAPTCHA. Raw response:',
                    ipResponse.body,
                )
            }
        } catch (error) {
            console.log('IP check failed. Error details:')
            console.log('Error name:', error.name)
            console.log('Error message:', error.message)
            if (error.response) {
                console.log('Error response status:', error.response.statusCode)
                console.log('Error response headers:', error.response.headers)
                console.log('Error response body:', error.response.body)
            }
            if (error.code) {
                console.log('Error code:', error.code)
            }
        }
    }

    async extractYouTubeVideo(videoUrl, uploadToR2 = false) {
        const videoId = this.extractVideoId(videoUrl)
        if (!videoId) {
            throw new Error('Invalid YouTube URL')
        }

        console.log(`Extracting video: ${videoId} (proxy strategy: ${this.proxyStrategy})`)

        // Fast path: check if file exists on R2 first
        if (uploadToR2 && this.r2Client && this.r2Bucket) {
            const cachedAsset = await this.findExistingR2Asset(videoId)
            if (cachedAsset) {
                const { key, url, metadata, contentType, etag, lastModified, size } = cachedAsset
                console.log('File already exists on R2, skipping download.')

                const bitrateKbps = metadata.audio_bitrate_kbps
                    ? Number(metadata.audio_bitrate_kbps)
                    : undefined
                const bitrate = Number.isFinite(bitrateKbps) ? bitrateKbps * 1000 : undefined
                const filename = key.split('/').pop()
                const codec = metadata.audio_codec || 'unknown'
                const ext = metadata.audio_ext || (filename?.includes('.') ? filename.split('.').pop() : '')
                const minimizeSizeMeta = metadata.minimize_size === 'true'

                return {
                    success: true,
                    videoId,
                    videoInfo: {
                        title: metadata.title || 'yt-dlp extracted (cached)',
                    },
                    audioFormat: {
                        itag: metadata.ytdlp_format_id || metadata.audio_itag || 'yt-dlp',
                        mimeType: contentType,
                        audioQuality:
                            metadata.audio_quality ||
                            (minimizeSizeMeta ? 'AUDIO_QUALITY_MINIMIZED' : 'AUDIO_QUALITY_HIGH'),
                        bitrate,
                        codec,
                        whisperReady: metadata.whisper_ready !== 'false',
                        ytDlpExtracted: true,
                        minimizeSize: minimizeSizeMeta,
                        formatUsed: metadata.format || metadata.format_used || null,
                    },
                    whisperReady: {
                        audioUrl: url,
                        format: contentType,
                        codec,
                        bitrateKbps,
                        filename,
                        sizeBytes: size,
                    },
                    r2Upload: {
                        bucket: this.r2Bucket,
                        key,
                        url,
                        etag,
                        lastModified,
                    },
                    proxyInfo: {
                        proxyUsed: !!this.proxyUrl,
                        profile: this.currentProfile?.platform || 'unknown',
                        extractionMethod: 'yt-dlp-r2-cached',
                        minimizeSize: minimizeSizeMeta,
                        group: this.currentProxyGroup,
                        strategy: this.proxyStrategy,
                    },
                    extractedAt: metadata.extracted_at || new Date().toISOString(),
                    method: metadata.method || 'yt-dlp-r2-direct',
                    ytDlpDirect: true,
                    cached: true,
                }
            }
        }

        const plan = this.getProxyPlan()
        let lastError = null

        for (let index = 0; index < plan.length; index++) {
            const attempt = plan[index]
            const hasMore = index < plan.length - 1

            try {
                await this.useProxyGroup(attempt.key)
                console.log(`Attempt ${index + 1}/${plan.length} using ${attempt.label} proxies`)
                await this.logCurrentIP()
            } catch (configError) {
                lastError = configError
                console.log(`Proxy configuration for ${attempt.label} proxies failed: ${configError.message}`)
                if (!hasMore) {
                    throw configError
                }
                continue
            }

            try {
                const result = await this.performExtractionWithCurrentProxy(videoId, uploadToR2)
                return result
            } catch (error) {
                lastError = error
                console.log(
                    `Extraction with ${attempt.label} proxies failed: ${error.message}${
                        hasMore ? ' - falling back to next proxy group' : ''
                    }`,
                )
                if (!hasMore) {
                    throw error
                }
            }
        }

        throw lastError || new Error('All proxy attempts failed')
    }

    async performExtractionWithCurrentProxy(videoId, uploadToR2) {
        try {
            console.log('Using yt-dlp extraction method')
            const result = await this.extractViaYtDlp(videoId)

            if (uploadToR2) {
                if (result && result.ytDlpDirect && result.r2Upload) {
                    console.log('yt-dlp direct R2 upload completed successfully')
                    return result
                }
                throw new Error('yt-dlp did not return a valid R2 upload result')
            }

            if (result && (result.audioFormats?.length > 0 || result.url || result.r2Upload)) {
                return result
            }

            throw new Error('yt-dlp did not return usable result')
        } catch (error) {
            throw new Error(
                `YouTube extraction failed via ${this.currentProxyGroup || 'unknown'} proxies: ${
                    error.message
                }`,
            )
        }
    }

    async extractViaYtDlp(videoId) {
        console.log(`Trying yt-dlp direct download for ${videoId}`)

        try {
            const extractorOptions = {
                minimizeSize: this.minimizeSize,
            }
            if (this.proxyUrl) {
                extractorOptions.proxy = this.proxyUrl
            }

            const result = await YtDlpExtractor.downloadAudioDirect(videoId, extractorOptions)

            if (!result.filePath) {
                throw new Error('yt-dlp did not return a file path')
            }

            const fs = await import('fs')
            const fileBuffer = await fs.promises.readFile(result.filePath)

            if (!this.r2Client || !this.r2Bucket) {
                throw new Error('R2 client or bucket is not configured')
            }

            const ext = result.ext || 'mp4'
            const objectKey = this.buildR2ObjectKey(videoId, ext)
            const contentType = this.resolveMimeType(ext)

            console.log(`Uploading yt-dlp file to R2: ${objectKey}`)

            const metadata = this.buildObjectMetadata({
                videoId,
                formatMeta: result.formatMeta,
                minimizeSize: this.minimizeSize,
                fileSizeBytes: result.fileSizeBytes ?? fileBuffer.length,
                ext,
            })

            const upload = new Upload({
                client: this.r2Client,
                params: {
                    Bucket: this.r2Bucket,
                    Key: objectKey,
                    Body: fileBuffer,
                    ContentType: contentType,
                    Metadata: metadata,
                },
            })

            const uploadResult = await upload.done()
            console.log(`yt-dlp audio uploaded successfully to R2`)
            console.log('Upload result details:', {
                bucket: this.r2Bucket,
                key: objectKey,
                etag: uploadResult.ETag,
                location: uploadResult.Location,
                url: `https://${this.r2Bucket}.r2.dev/${objectKey}`,
            })

            try {
                await fs.promises.unlink(result.filePath)
                console.log(`Cleaned up temporary file: ${result.filePath}`)
            } catch (cleanupError) {
                console.log(`Could not clean up temp file: ${cleanupError.message}`)
            }

            const bitrateKbps = result.formatMeta?.bitrateKbps
            const bitrate = Number.isFinite(bitrateKbps) ? bitrateKbps * 1000 : undefined
            const codec = result.formatMeta?.codec || (ext === 'webm' ? 'opus' : 'mp4a.40.2')
            const audioQuality = this.minimizeSize ? 'AUDIO_QUALITY_MINIMIZED' : 'AUDIO_QUALITY_HIGH'

            return {
                success: true,
                videoId,
                videoInfo: { title: 'yt-dlp extracted' },
                audioFormat: {
                    itag: result.formatMeta?.itag || 'yt-dlp',
                    mimeType: contentType,
                    audioQuality,
                    bitrate,
                    codec,
                    whisperReady: true,
                    ytDlpExtracted: true,
                    minimizeSize: this.minimizeSize,
                },
                whisperReady: {
                    audioUrl: `https://${this.r2Bucket}.r2.dev/${objectKey}`,
                    format: contentType,
                    codec,
                    bitrateKbps,
                    filename: objectKey.split('/').pop(),
                    sizeBytes: result.fileSizeBytes ?? fileBuffer.length,
                },
                r2Upload: {
                    bucket: this.r2Bucket,
                    key: objectKey,
                    url: `https://${this.r2Bucket}.r2.dev/${objectKey}`,
                    etag: uploadResult.ETag,
                    location: uploadResult.Location,
                },
                proxyInfo: {
                    proxyUsed: !!this.proxyUrl,
                    profile: this.currentProfile?.platform || 'unknown',
                    extractionMethod: 'yt-dlp-direct-download',
                    minimizeSize: this.minimizeSize,
                    group: this.currentProxyGroup,
                    strategy: this.proxyStrategy,
                },
                extractedAt: new Date().toISOString(),
                method: 'yt-dlp-r2-direct',
                ytDlpDirect: true,
            }
        } catch (error) {
            console.log(`yt-dlp extraction failed: ${error.message}`)
            throw new Error(`yt-dlp direct download failed: ${error.message}`)
        }
    }

    async makeRequest(url, options = {}) {
        const profile = this.currentProfile || pickRandomProfile()
        if (!this.currentProfile) {
            this.currentProfile = profile
        }

        const requestOptions = {
            url,
            headers: {
                'User-Agent': profile.userAgent,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': profile.acceptLanguage,
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
                    profile: this.currentProfile?.platform || 'unknown',
                    group: this.currentProxyGroup,
                    strategy: this.proxyStrategy,
                    timestamp: new Date().toISOString(),
                },
            }
        } catch (error) {
            throw new Error(`Proxy request failed: ${error.message}`)
        }
    }

    resolveMimeType(ext) {
        if (!ext) return 'application/octet-stream'
        return AUDIO_MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream'
    }

    buildR2ObjectKey(videoId, ext) {
        const safeExt = (ext || 'mp4').toLowerCase()
        return `temp-audio/${videoId}.${safeExt}`
    }

    buildCandidateKeys(videoId) {
        const prioritizedExts = this.minimizeSize
            ? ['webm', 'm4a', 'mp4', 'mp3']
            : ['m4a', 'mp4', 'webm', 'mp3']
        const uniqueExts = Array.from(new Set(prioritizedExts))
        return uniqueExts.map((ext) => this.buildR2ObjectKey(videoId, ext))
    }

    async findExistingR2Asset(videoId) {
        if (!this.r2Client || !this.r2Bucket) {
            return null
        }

        const keys = this.buildCandidateKeys(videoId)
        const { HeadObjectCommand } = await import('@aws-sdk/client-s3')

        for (const key of keys) {
            try {
                const head = await this.r2Client.send(
                    new HeadObjectCommand({ Bucket: this.r2Bucket, Key: key }),
                )

                const metadata = head.Metadata || {}
                const contentType = head.ContentType || this.resolveMimeType(key.split('.').pop())

                return {
                    key,
                    metadata,
                    contentType,
                    url: `https://${this.r2Bucket}.r2.dev/${key}`,
                    etag: head.ETag,
                    lastModified: head.LastModified,
                    size: head.ContentLength,
                }
            } catch (err) {
                if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
                    console.error('Error checking R2 for existing file:', err)
                }
            }
        }

        return null
    }

    buildObjectMetadata({ videoId, formatMeta, minimizeSize, fileSizeBytes, ext }) {
        const metadata = {
            video_id: videoId,
            method: 'yt-dlp-direct',
            extracted_at: new Date().toISOString(),
            minimize_size: minimizeSize ? 'true' : 'false',
            audio_ext: (ext || '').toLowerCase(),
            whisper_ready: 'true',
            title: 'yt-dlp extracted',
            audio_quality: minimizeSize ? 'AUDIO_QUALITY_MINIMIZED' : 'AUDIO_QUALITY_HIGH',
            proxy_group: (this.currentProxyGroup || '').toLowerCase(),
            proxy_strategy: this.proxyStrategy || 'unknown',
        }

        if (Number.isFinite(fileSizeBytes)) {
            metadata.file_size_bytes = String(fileSizeBytes)
        }

        if (formatMeta?.itag) {
            metadata.ytdlp_format_id = String(formatMeta.itag)
        }

        if (formatMeta?.codec) {
            metadata.audio_codec = String(formatMeta.codec)
        }

        if (Number.isFinite(formatMeta?.bitrateKbps)) {
            metadata.audio_bitrate_kbps = String(Math.round(formatMeta.bitrateKbps))
        }

        if (formatMeta?.itag) {
            metadata.format_used = String(formatMeta.itag)
        }

        if (formatMeta?.filesizeApprox) {
            metadata.source_filesize_bytes = String(formatMeta.filesizeApprox)
        }

        return metadata
    }
}
