// Apify Actor for YouTube Video Extraction with IP Rotation
// This runs as a serverless function with different IPs on each execution

import { Actor } from 'apify';
import { gotScraping } from 'got-scraping';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Browser fingerprint profiles optimized for YouTube
const BROWSER_PROFILES = [
    {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'Win32',
        region: 'US'
    },
    {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'MacIntel',
        region: 'US'
    },
    {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-GB,en;q=0.9',
        platform: 'Linux x86_64',
        region: 'GB'
    }
];

class ApifyYouTubeProxy {
    constructor() {
        this.proxyUrl = null;
        this.currentProfile = null;
    }

    async initialize() {
        // Get Apify proxy configuration (automatic IP rotation)
        this.proxyUrl = Actor.getProxyUrl({
            groups: ['RESIDENTIAL'], // Use residential IPs for better stealth
            countryCode: 'US', // Can be randomized per request
        });
        
        this.currentProfile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
        
        console.log('🌐 Apify Actor initialized with:');
        console.log(`📍 Proxy: ${this.proxyUrl ? 'ENABLED (Residential)' : 'DISABLED'}`);
        console.log(`🎭 Profile: ${this.currentProfile.platform}`);
    }

    async extractYouTubeVideo(videoUrl) {
        const videoId = this.extractVideoId(videoUrl);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        console.log(`🎯 Extracting video: ${videoId}`);
        
        // Try multiple extraction methods with proxy rotation
        const extractionMethods = [
            () => this.extractViaEmbedPage(videoId),
            () => this.extractViaWatchPage(videoId),
            () => this.extractViaMobileAPI(videoId),
            () => this.extractViaOEmbed(videoId)
        ];

        for (const [index, method] of extractionMethods.entries()) {
            try {
                console.log(`📡 Attempt ${index + 1}: ${method.name}`);
                const result = await method();
                if (result && result.url) {
                    return result;
                }
            } catch (error) {
                console.log(`❌ Method ${index + 1} failed: ${error.message}`);
                
                // Rotate IP and profile for next attempt
                await this.rotateIPAndProfile();
            }
        }

        throw new Error('All extraction methods failed');
    }

    async rotateIPAndProfile() {
        // Force new IP by getting new proxy URL
        const countries = ['US', 'GB', 'CA', 'AU', 'DE'];
        const randomCountry = countries[Math.floor(Math.random() * countries.length)];
        
        this.proxyUrl = Actor.getProxyUrl({
            groups: ['RESIDENTIAL'],
            countryCode: randomCountry,
            session: `session_${Date.now()}` // Force new session = new IP
        });
        
        this.currentProfile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
        
        console.log(`🔄 IP Rotated: ${randomCountry} | Profile: ${this.currentProfile.platform}`);
        
        // Add delay to simulate human behavior
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    }

    async makeRequest(url, options = {}) {
        const requestOptions = {
            url,
            headers: {
                'User-Agent': this.currentProfile.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': this.currentProfile.acceptLanguage,
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                ...options.headers
            },
            timeout: 30000,
            retry: 0, // We handle retries manually
            ...options
        };

        // Use Apify proxy if available
        if (this.proxyUrl) {
            requestOptions.agent = {
                https: new HttpsProxyAgent(this.proxyUrl),
                http: new HttpsProxyAgent(this.proxyUrl)
            };
        }

        return await gotScraping(requestOptions);
    }

    extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async extractViaEmbedPage(videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        const response = await this.makeRequest(embedUrl);
        
        // Extract video info from embed page
        const htmlContent = response.body;
        
        // Look for video stream URLs
        const streamRegex = /"url":"([^"]+)"/g;
        const matches = [...htmlContent.matchAll(streamRegex)];
        
        if (matches.length > 0) {
            const videoUrl = decodeURIComponent(matches[0][1].replace(/\\u0026/g, '&'));
            return {
                videoId,
                url: videoUrl,
                method: 'embed',
                extractedAt: new Date().toISOString()
            };
        }
        
        throw new Error('No video streams found in embed page');
    }

    async extractViaWatchPage(videoId) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await this.makeRequest(watchUrl, {
            headers: {
                'Referer': 'https://www.google.com/'
            }
        });
        
        const htmlContent = response.body;
        
        // Extract from player config
        const configRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/;
        const match = htmlContent.match(configRegex);
        
        if (match) {
            try {
                const playerResponse = JSON.parse(match[1]);
                const streamingData = playerResponse.streamingData;
                
                if (streamingData && streamingData.formats) {
                    const format = streamingData.formats[0];
                    return {
                        videoId,
                        url: format.url,
                        method: 'watch',
                        extractedAt: new Date().toISOString()
                    };
                }
            } catch (parseError) {
                throw new Error('Failed to parse player response');
            }
        }
        
        throw new Error('No player response found');
    }

    async extractViaMobileAPI(videoId) {
        const mobileUrl = `https://m.youtube.com/watch?v=${videoId}`;
        const response = await this.makeRequest(mobileUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
            }
        });
        
        // Mobile extraction logic
        const htmlContent = response.body;
        const streamRegex = /"url":"([^"]+)"/g;
        const matches = [...htmlContent.matchAll(streamRegex)];
        
        if (matches.length > 0) {
            return {
                videoId,
                url: decodeURIComponent(matches[0][1]),
                method: 'mobile',
                extractedAt: new Date().toISOString()
            };
        }
        
        throw new Error('Mobile extraction failed');
    }

    async extractViaOEmbed(videoId) {
        const oembedUrl = `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await this.makeRequest(oembedUrl);
        
        const data = JSON.parse(response.body);
        return {
            videoId,
            title: data.title,
            thumbnail: data.thumbnail_url,
            author: data.author_name,
            method: 'oembed',
            extractedAt: new Date().toISOString()
        };
    }

    async proxyGenericRequest(targetUrl) {
        console.log(`🔗 Proxying request to: ${targetUrl}`);
        
        try {
            const response = await this.makeRequest(targetUrl);
            return {
                success: true,
                status: response.statusCode,
                headers: response.headers,
                body: response.body,
                proxyInfo: {
                    proxyUsed: !!this.proxyUrl,
                    profile: this.currentProfile.platform,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            throw new Error(`Proxy request failed: ${error.message}`);
        }
    }
}

// Main Apify Actor entry point
Actor.main(async () => {
    console.log('🚀 Apify YouTube Proxy Actor starting...');
    
    // Get input from Apify
    const input = await Actor.getInput();
    console.log('📥 Input received:', input);
    
    const proxy = new ApifyYouTubeProxy();
    await proxy.initialize();
    
    try {
        let result;
        
        if (input.youtubeUrl) {
            // YouTube video extraction mode
            result = await proxy.extractYouTubeVideo(input.youtubeUrl);
            console.log('✅ YouTube extraction successful');
        } else if (input.proxyUrl) {
            // Generic proxy mode
            result = await proxy.proxyGenericRequest(input.proxyUrl);
            console.log('✅ Proxy request successful');
        } else {
            // Default test mode
            result = {
                message: 'Apify YouTube Proxy Actor is running!',
                availableModes: ['youtubeUrl', 'proxyUrl'],
                example: {
                    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    proxyUrl: 'https://httpbin.org/ip'
                },
                timestamp: new Date().toISOString()
            };
        }
        
        // Save result to Apify dataset
        await Actor.pushData(result);
        console.log('💾 Result saved to dataset');
        
        // Also save to key-value store
        await Actor.setValue('RESULT', result);
        console.log('🔑 Result saved to key-value store');
        
    } catch (error) {
        console.error('❌ Actor failed:', error);
        
        const errorResult = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
        
        await Actor.pushData(errorResult);
        await Actor.setValue('ERROR', errorResult);
        
        throw error;
    }
    
    console.log('🎯 Apify Actor completed successfully!');
});
