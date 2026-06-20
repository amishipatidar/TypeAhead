/**
 * Dataset Generator
 * 
 * Generates 120,000+ synthetic search queries with Zipf-distributed counts.
 * Categories: tech, programming, shopping, health, entertainment, food, travel, etc.
 * 
 * Output: data/queries.csv (query,count)
 */

const fs = require('fs');
const path = require('path');

// Category templates
const categories = {
    tech: {
        bases: ['iphone', 'samsung', 'macbook', 'laptop', 'airpods', 'pixel', 'ipad', 'android', 'windows', 'chrome', 'firefox', 'safari', 'google', 'apple', 'microsoft', 'tesla', 'nvidia', 'amd', 'intel', 'dell', 'hp', 'lenovo', 'asus', 'lg', 'sony', 'xiaomi', 'oneplus', 'oppo', 'vivo', 'realme', 'nothing phone', 'galaxy', 'surface', 'chromebook', 'kindle', 'alexa', 'siri', 'chatgpt', 'copilot', 'gemini ai', 'claude ai', 'openai', 'meta quest', 'oculus', 'steam deck', 'playstation', 'xbox', 'nintendo switch'],
        modifiers: ['price', 'review', 'specs', 'buy', 'sale', 'deals', 'vs', 'case', 'charger', 'screen protector', 'accessories', 'pro', 'max', 'mini', 'plus', 'ultra', 'release date', 'features', 'comparison', 'best', 'cheapest', 'new', 'used', 'refurbished', 'warranty', 'repair', 'settings', 'tips', 'tricks', 'update', 'upgrade']
    },
    programming: {
        bases: ['python', 'javascript', 'java', 'c++', 'rust', 'go', 'typescript', 'react', 'angular', 'vue', 'node.js', 'django', 'flask', 'spring boot', 'express', 'next.js', 'tailwind', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'mongodb', 'postgresql', 'mysql', 'redis', 'kafka', 'graphql', 'rest api', 'git', 'github', 'vscode', 'linux', 'bash', 'sql', 'html', 'css', 'swift', 'kotlin', 'flutter', 'react native'],
        modifiers: ['tutorial', 'course', 'documentation', 'for beginners', 'advanced', 'cheat sheet', 'examples', 'best practices', 'interview questions', 'projects', 'roadmap', 'certification', 'vs', 'install', 'setup', 'debug', 'error', 'fix', 'performance', 'optimization', 'crash course', 'free course', 'book', 'guide', 'tips']
    },
    shopping: {
        bases: ['nike', 'adidas', 'puma', 'zara', 'h&m', 'uniqlo', 'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'shoes', 'sneakers', 'jeans', 'shirt', 'dress', 'watch', 'sunglasses', 'backpack', 'headphones', 'earbuds', 'speaker', 'camera', 'tv', 'refrigerator', 'washing machine', 'air conditioner', 'microwave', 'mixer grinder'],
        modifiers: ['price', 'sale', 'discount', 'coupon', 'offer', 'best', 'cheap', 'premium', 'online', 'near me', 'delivery', 'return policy', 'review', 'size guide', 'color', 'men', 'women', 'kids', 'latest', 'trending', 'new arrival', 'clearance', 'combo', 'exchange']
    },
    health: {
        bases: ['yoga', 'meditation', 'gym', 'workout', 'diet', 'protein', 'vitamins', 'weight loss', 'muscle gain', 'running', 'cycling', 'swimming', 'stretching', 'sleep', 'stress', 'anxiety', 'mental health', 'nutrition', 'calories', 'bmi', 'blood pressure', 'diabetes', 'cholesterol', 'immunity', 'skin care', 'hair care', 'dental care', 'eye care'],
        modifiers: ['tips', 'benefits', 'exercises', 'routine', 'plan', 'for beginners', 'at home', 'natural remedies', 'symptoms', 'treatment', 'causes', 'prevention', 'food', 'supplement', 'doctor', 'hospital', 'near me', 'online consultation', 'app', 'tracker']
    },
    entertainment: {
        bases: ['netflix', 'prime video', 'disney plus', 'hotstar', 'youtube', 'spotify', 'movie', 'web series', 'anime', 'manga', 'bollywood', 'hollywood', 'korean drama', 'thriller', 'comedy', 'horror', 'action', 'romance', 'documentary', 'podcast', 'music', 'concert', 'game', 'esports', 'cricket', 'football', 'basketball', 'tennis', 'f1', 'olympics'],
        modifiers: ['best', 'new', 'latest', 'top 10', 'recommendation', 'review', 'download', 'stream', 'free', 'subscription', 'cancel', 'rating', 'cast', 'trailer', 'release date', 'season', 'episode', 'soundtrack', 'tickets', 'schedule', 'live', 'highlights', 'score']
    },
    food: {
        bases: ['biryani', 'pizza', 'burger', 'pasta', 'sushi', 'ramen', 'tacos', 'curry', 'fried rice', 'noodles', 'cake', 'ice cream', 'coffee', 'tea', 'smoothie', 'salad', 'sandwich', 'soup', 'bread', 'pancake', 'dosa', 'idli', 'paratha', 'samosa', 'momos', 'chicken', 'paneer', 'dal', 'fish', 'egg'],
        modifiers: ['recipe', 'near me', 'delivery', 'restaurant', 'how to make', 'easy', 'homemade', 'healthy', 'vegan', 'vegetarian', 'calories', 'best', 'authentic', 'quick', 'instant', 'microwave', 'air fryer', 'oven', 'ingredients', 'variations']
    },
    travel: {
        bases: ['goa', 'manali', 'maldives', 'bali', 'dubai', 'thailand', 'paris', 'london', 'new york', 'tokyo', 'singapore', 'switzerland', 'australia', 'canada', 'usa', 'europe', 'kerala', 'rajasthan', 'himachal', 'uttarakhand', 'kashmir', 'ladakh', 'andaman', 'ooty', 'munnar'],
        modifiers: ['trip', 'tour package', 'flights', 'hotels', 'resorts', 'best time to visit', 'budget', 'itinerary', 'places to visit', 'things to do', 'food', 'weather', 'visa', 'passport', 'travel guide', 'road trip', 'solo travel', 'family trip', 'honeymoon', 'adventure']
    },
    education: {
        bases: ['iit', 'neet', 'upsc', 'cat', 'gate', 'gre', 'ielts', 'toefl', 'sat', 'jee', 'board exam', 'cbse', 'icse', 'ncert', 'mathematics', 'physics', 'chemistry', 'biology', 'english', 'history', 'geography', 'economics', 'computer science', 'data science', 'machine learning', 'artificial intelligence', 'mba', 'engineering', 'medical'],
        modifiers: ['preparation', 'syllabus', 'exam date', 'result', 'cutoff', 'previous year papers', 'study material', 'notes', 'online coaching', 'best books', 'tips', 'strategy', 'mock test', 'practice', 'free resources', 'scholarship', 'admission', 'eligibility', 'rank', 'college']
    },
    finance: {
        bases: ['stock market', 'mutual fund', 'sip', 'fixed deposit', 'credit card', 'debit card', 'upi', 'gpay', 'paytm', 'phonepe', 'loan', 'insurance', 'tax', 'gst', 'income tax', 'emi', 'budget', 'savings', 'investment', 'bitcoin', 'crypto', 'nft', 'trading', 'zerodha', 'groww', 'angel one'],
        modifiers: ['best', 'how to', 'tips', 'for beginners', 'returns', 'calculator', 'comparison', 'apply', 'eligibility', 'interest rate', 'charges', 'review', 'safe', 'risk', 'portfolio', 'strategy', 'tax saving', 'long term', 'short term', 'daily']
    },
    questions: {
        bases: ['what is', 'how to', 'why is', 'when is', 'where is', 'who is', 'which is', 'how does', 'what does', 'can you', 'should i', 'is it', 'how much', 'how many', 'what are', 'how do i', 'why do', 'when will', 'where can i', 'who invented'],
        modifiers: ['the meaning of life', 'artificial intelligence', 'blockchain', 'climate change', 'the earth round', 'water wet', 'the sky blue', 'gravity work', 'photosynthesis work', 'dna', 'black hole', 'quantum computing', 'machine learning', 'deep learning', 'neural network', 'internet work', 'computer work', 'electricity work', 'vaccine work', 'democracy', 'capitalism', 'socialism', 'global warming', 'recycling', 'renewable energy', 'electric vehicle', 'self driving car', 'space travel', '5g', 'metaverse']
    }
};

/**
 * Generate a Zipf-distributed count
 * Few queries get very high counts, most get low counts
 */
function zipfCount(rank, maxCount = 500000) {
    return Math.max(1, Math.floor(maxCount / Math.pow(rank, 0.8)));
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generate() {
    console.log('🔄 Generating dataset...');
    const queries = new Set();
    const entries = [];

    // Generate combinations
    for (const [categoryName, category] of Object.entries(categories)) {
        const { bases, modifiers } = category;

        // Base queries alone (skipped for questions to avoid orphan question starters like "how does")
        if (categoryName !== 'questions') {
            for (const base of bases) {
                queries.add(base);
            }
        }

        // Base + modifier combinations
        if (categoryName !== 'questions') {
            for (const base of bases) {
                for (const mod of modifiers) {
                    queries.add(`${base} ${mod}`);

                    // Some 3-word combinations
                    if (Math.random() < 0.3) {
                        const mod2 = modifiers[Math.floor(Math.random() * modifiers.length)];
                        if (mod !== mod2) {
                            queries.add(`${base} ${mod} ${mod2}`);
                        }
                    }
                }
            }
        }

        // Modifier + base (reversed for question-style queries)
        if (categoryName === 'questions') {
            const nouns = [
                'artificial intelligence', 'blockchain', 'climate change', 'dna', 
                'quantum computing', 'machine learning', 'deep learning', 'neural network', 
                'democracy', 'capitalism', 'socialism', 'global warming', 'recycling', 
                'renewable energy', 'electric vehicle', 'self driving car', 'space travel', 
                '5g', 'metaverse'
            ];
            const singularNouns = ['black hole'];
            const facts = ['the earth round', 'water wet', 'the sky blue'];
            const verbs = [
                'gravity work', 'photosynthesis work', 'the internet work', 
                'a computer work', 'electricity work', 'a vaccine work'
            ];
            
            // Generate clean questions using templates
            for (const noun of nouns) {
                queries.add(`what is ${noun}`);
                queries.add(`how to learn ${noun}`);
                queries.add(`how to use ${noun}`);
                queries.add(`why is ${noun} important`);
                queries.add(`how does ${noun} work`);
                queries.add(`what does ${noun} mean`);
                queries.add(`should i learn ${noun}`);
                queries.add(`is ${noun} hard to learn`);
                queries.add(`who invented ${noun}`);
                queries.add(`where can i learn ${noun}`);
            }
            for (const noun of singularNouns) {
                queries.add(`what is a ${noun}`);
                queries.add(`how does a ${noun} work`);
                queries.add(`why does a ${noun} form`);
                queries.add(`who invented the term ${noun}`);
            }
            for (const fact of facts) {
                queries.add(`why is ${fact}`);
                queries.add(`is ${fact}`);
            }
            for (const verb of verbs) {
                queries.add(`how does ${verb}`);
                queries.add(`why does ${verb}`);
            }
            queries.add(`what is the meaning of life`);
        }
    }

    // Add some extra common searches to reach 120K+
    const extras = [
        // Utility searches
        'weather today', 'news', 'translate', 'calculator', 'time', 'date',
        'currency converter', 'unit converter', 'word meaning', 'synonyms',
        'antonyms', 'spelling check', 'grammar check', 'pdf to word',
        'image to text', 'qr code generator', 'password generator',
        'random number generator', 'countdown timer', 'stopwatch',
        'online editor', 'code compiler', 'json formatter', 'regex tester',
        'color picker', 'font generator', 'emoji keyboard', 'ascii art',
        'meme generator', 'gif maker', 'video editor', 'photo editor',
        'resume builder', 'cover letter', 'linkedin', 'indeed', 'naukri',
        'jobs near me', 'work from home', 'freelance', 'internship',
        'online earning', 'side hustle', 'passive income',

        // Umbrella category terms
        'food near me', 'food delivery', 'food recipes', 'food ideas', 'food truck near me',
        'food ordering app', 'food photography', 'food blogger', 'food poisoning symptoms',
        'tech news', 'tech gadgets', 'tech deals', 'tech reviews', 'tech startups',
        'tech industry trends', 'tech jobs', 'tech salary',
        'health tips', 'health insurance', 'health checkup near me', 'health benefits',
        'health app', 'health news', 'health tracker', 'health supplements',
        'travel plans', 'travel insurance', 'travel deals', 'travel agency near me',
        'travel tips', 'travel blog', 'travel backpack', 'travel checklist',
        'entertainment news', 'entertainment tonight', 'entertainment weekly',
        'finance news', 'finance tips', 'finance app', 'finance calculator',
        'education system', 'education news', 'education loan', 'education policy',
        'shopping deals', 'shopping online', 'shopping mall near me', 'shopping app',
        'programming languages', 'programming for beginners', 'programming jobs',
        'programming memes', 'programming projects', 'programming roadmap',

        // Celebrities & public figures
        'ariana grande', 'ariana grande songs', 'ariana grande album', 'ariana grande concert',
        'taylor swift', 'taylor swift songs', 'taylor swift eras tour', 'taylor swift albums',
        'elon musk', 'elon musk net worth', 'elon musk twitter', 'elon musk companies',
        'shah rukh khan', 'shah rukh khan movies', 'shah rukh khan age', 'shah rukh khan net worth',
        'virat kohli', 'virat kohli stats', 'virat kohli centuries', 'virat kohli net worth',
        'ms dhoni', 'ms dhoni retirement', 'ms dhoni age', 'ms dhoni records',
        'narendra modi', 'narendra modi speech', 'narendra modi age',
        'cristiano ronaldo', 'cristiano ronaldo goals', 'cristiano ronaldo net worth',
        'lionel messi', 'lionel messi goals', 'lionel messi inter miami',
        'drake songs', 'drake album', 'drake net worth',
        'beyonce', 'beyonce songs', 'beyonce albums', 'beyonce tour',
        'kim kardashian', 'kim kardashian net worth',
        'jeff bezos', 'jeff bezos net worth', 'jeff bezos amazon',
        'mark zuckerberg', 'mark zuckerberg net worth', 'mark zuckerberg meta',
        'sundar pichai', 'sundar pichai salary', 'sundar pichai google',
        'bill gates', 'bill gates net worth', 'bill gates foundation',
        'pewdiepie', 'pewdiepie subscribers', 'mrbeast', 'mrbeast net worth',

        // Trending real-world topics
        'chatgpt login', 'chatgpt app', 'chatgpt vs gemini', 'chatgpt alternative',
        'ai tools', 'ai image generator', 'ai chatbot', 'ai music generator',
        'ipl schedule', 'ipl points table', 'ipl live score', 'ipl auction',
        'world cup', 'world cup schedule', 'world cup results',
        'olympics', 'olympics schedule', 'olympics medal tally',
        'spotify wrapped', 'spotify premium', 'spotify download',
        'netflix new releases', 'netflix top 10', 'netflix plans',
        'instagram reels', 'instagram download', 'instagram story',
        'whatsapp update', 'whatsapp web', 'whatsapp status',
        'youtube premium', 'youtube shorts', 'youtube music', 'youtube download',
    ];

    for (const q of extras) {
        queries.add(q);
    }

    // If we don't have enough, generate numbered variations
    const baseSet = Array.from(queries);
    const suffixes = ['2024', '2025', 'online', 'free', 'download', 'app', 'website', 'alternatives', 'reddit', 'quora'];
    const questionStarters = ['what ', 'how ', 'why ', 'when ', 'where ', 'who ', 'which ', 'can ', 'should ', 'is ', 'do '];
    
    for (const base of baseSet) {
        if (queries.size >= 125000) break;
        // Skip question-style queries — appending random suffixes makes them nonsensical
        const isQuestion = questionStarters.some(starter => base.startsWith(starter));
        if (isQuestion) continue;
        for (const suffix of suffixes) {
            if (queries.size >= 125000) break;
            queries.add(`${base} ${suffix}`);
        }
    }

    // Convert to array and assign Zipf counts
    const queryArray = shuffle(Array.from(queries));

    for (let i = 0; i < queryArray.length; i++) {
        const count = zipfCount(i + 1);
        entries.push({ query: queryArray[i], count });
    }

    // Sort by count descending for readability
    entries.sort((a, b) => b.count - a.count);

    // Write to CSV
    const outputDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'queries.csv');
    const csvContent = 'query,count\n' + entries.map(e => `"${e.query}",${e.count}`).join('\n');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`✅ Generated ${entries.length} queries`);
    console.log(`📁 Saved to: ${outputPath}`);
    console.log(`📊 Top 10 queries:`);
    entries.slice(0, 10).forEach((e, i) => {
        console.log(`   ${i + 1}. "${e.query}" → ${e.count}`);
    });

    return entries;
}

// Run if called directly
if (require.main === module) {
    generate();
}

module.exports = { generate };
