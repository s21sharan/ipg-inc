const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Initialize clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

if (!openaiKey) {
  console.error('Missing OPENAI_API_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

const DUOLINGO_DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

// Same questions as the original generate_interviews.js
const questions = [
  { question: "Intro greeting", time_limit_sec: 0 },
  { question: "Short version of your life story?", time_limit_sec: 180 },
  { question: "Where did you grow up?", time_limit_sec: 60 },
  { question: "What was it like growing up there?", time_limit_sec: 90 },
  { question: "One turning point in your life?", time_limit_sec: 150 },
  { question: "Why was that a turning point?", time_limit_sec: 120 },
  { question: "How did you handle that situation?", time_limit_sec: 120 },
  { question: "What do you care most about right now?", time_limit_sec: 150 },
  { question: "Why is that important?", time_limit_sec: 120 },
  { question: "What is a good day for you?", time_limit_sec: 120 },
  { question: "What makes you say \"this was a good day\"?", time_limit_sec: 90 },
  { question: "How do you make big decisions?", time_limit_sec: 120 },
  { question: "Planner or go-with-the-flow?", time_limit_sec: 90 },
  { question: "Example showing that?", time_limit_sec: 120 },
  { question: "How do you handle risk?", time_limit_sec: 120 },
  { question: "Typical weekday?", time_limit_sec: 180 },
  { question: "Which parts take the most energy?", time_limit_sec: 120 },
  { question: "What do you wish you had more time or energy for?", time_limit_sec: 120 },
  { question: "Biggest constraint last year?", time_limit_sec: 150 },
  { question: "How do you deal with that constraint?", time_limit_sec: 120 },
  { question: "People you feel closest to?", time_limit_sec: 120 },
  { question: "Describe those relationships.", time_limit_sec: 90 },
  { question: "Where do you spend most of your time?", time_limit_sec: 90 },
  { question: "How do you feel in those spaces?", time_limit_sec: 120 },
  { question: "What makes you feel that way?", time_limit_sec: 90 },
  { question: "Who do you turn to when problems arise?", time_limit_sec: 120 },
  { question: "One tough moment in the last year?", time_limit_sec: 150 },
  { question: "How did it affect you?", time_limit_sec: 120 },
  { question: "How did you cope?", time_limit_sec: 150 },
  { question: "What helps when you're overwhelmed?", time_limit_sec: 120 },
  { question: "What do you want life to look like in a few years?", time_limit_sec: 150 },
  { question: "What do you want to be different?", time_limit_sec: 120 },
  { question: "Before Duolingo, how did you handle language learning?", time_limit_sec: 180 },
  { question: "Most annoying part of old method?", time_limit_sec: 150 },
  { question: "Time it really failed?", time_limit_sec: 150 },
  { question: "How did you first hear about Duolingo?", time_limit_sec: 90 },
  { question: "What convinced you to try it?", time_limit_sec: 120 },
  { question: "Walk through a recent Duolingo use.", time_limit_sec: 210 },
  { question: "Most helpful part?", time_limit_sec: 120 },
  { question: "Most frustrating part?", time_limit_sec: 150 },
  { question: "Most frustrating part of Duolingo overall?", time_limit_sec: 150 },
  { question: "One time that frustration showed up?", time_limit_sec: 180 },
  { question: "Do you use workarounds?", time_limit_sec: 150 },
  { question: "What do workarounds give you that Duolingo doesn't?", time_limit_sec: 150 },
  { question: "Worst-case scenario in this space?", time_limit_sec: 150 },
  { question: "When you open Duolingo, what do you hope it does?", time_limit_sec: 150 },
  { question: "How do you know Duolingo worked?", time_limit_sec: 120 },
  { question: "One thing you'd change about Duolingo?", time_limit_sec: 120 },
  { question: "One thing you'd change about the whole problem space?", time_limit_sec: 120 },
  { question: "Anything important we didn't cover?", time_limit_sec: 90 },
  { question: "Permission to build a digital twin?", time_limit_sec: 60 },
];

// 139 new diverse user profiles
const newUserProfiles = [
  { name: 'Alejandro', profile: 'Mexican businessman in Texas, 42, learning Mandarin for trade deals with China. Uses Duolingo Plus. Speaks with confident Mexican-American business style. Mixed feelings - good for basics but needs more business vocabulary.' },
  { name: 'Bianca', profile: 'Italian-American fashion designer in NYC, 29, relearning Italian for Milan fashion week. Very positive about Duolingo streaks. Speaks with fashionista energy and some Italian expressions.' },
  { name: 'Cedric', profile: 'Haitian-Canadian accountant in Montreal, 35, learning Spanish for clients. Already speaks French/Creole/English. Finds Duolingo too slow. Speaks precisely with slight Caribbean lilt.' },
  { name: 'Dahlia', profile: 'Persian-American therapist in LA, 38, learning Farsi to connect with elderly patients. Emotional about heritage language. Speaks thoughtfully with therapeutic vocabulary.' },
  { name: 'Emilio', profile: 'Filipino nurse in Dubai, 32, learning Arabic for work. Positive about Duolingo accessibility. Speaks with Filipino English patterns and healthcare references.' },
  { name: 'Freya', profile: 'Norwegian exchange student in Spain, 20, learning Spanish immersively. Uses Duolingo to supplement. Speaks with Scandinavian directness and student slang.' },
  { name: 'Gabriel', profile: 'Brazilian DJ in Berlin, 27, learning German for the club scene. Casual Duolingo user. Speaks with Brazilian enthusiasm and music industry slang.' },
  { name: 'Helena', profile: 'Greek grandmother in Australia, 65, learning English better after 30 years. Loves Duolingo patience. Speaks warmly with Greek-Australian expressions.' },
  { name: 'Isaac', profile: 'Orthodox Jewish software developer in Israel, 28, learning Japanese for anime. Night owl Duolingo user. Speaks with tech references and occasional Hebrew/Yiddish.' },
  { name: 'Julia', profile: 'Polish au pair in France, 23, learning French for her host family. Intensive Duolingo user. Speaks with young Polish enthusiasm and some anxiety.' },
  { name: 'Kai', profile: 'Hawaiian surfer and yoga instructor, 31, learning Indonesian for Bali trips. Laid-back Duolingo approach. Speaks with surf culture vocabulary and aloha spirit.' },
  { name: 'Luna', profile: 'Colombian artist in Barcelona, 26, learning Catalan for local galleries. Creative perspective on language. Speaks poetically with artistic references.' },
  { name: 'Marco', profile: 'Italian chef in London, 44, perfecting English for his restaurant. Uses Duolingo between services. Speaks with passionate Italian-English mix and food metaphors.' },
  { name: 'Nina', profile: 'Serbian model in Milan, 24, learning Italian for career. Social media focused. Speaks with Eastern European directness and fashion terminology.' },
  { name: 'Oscar', profile: 'Salvadoran construction worker in Houston, 48, learning English for safety certifications. Grateful for free Duolingo. Speaks with Central American Spanish influence.' },
  { name: 'Petra', profile: 'Czech veterinarian in UK, 36, perfecting English medical terms. Frustrated Duolingo lacks specialized vocab. Speaks precisely with medical terminology.' },
  { name: 'Quinn', profile: 'Irish non-binary artist in Berlin, 25, learning German. Appreciates Duolingo gender-neutral options. Speaks with Dublin wit and art world references.' },
  { name: 'Rosa', profile: 'Dominican hairstylist in NYC, 39, learning Korean for K-beauty trends. Enthusiastic Duolingo user. Speaks with Dominican Spanish flair and beauty industry terms.' },
  { name: 'Samuel', profile: 'Jamaican reggae musician in London, 33, learning Spanish for Caribbean tours. Casual learner. Speaks with Jamaican patois and music references.' },
  { name: 'Tara', profile: 'Indian yoga teacher in Bali, 30, learning Indonesian for her studio. Spiritual approach to learning. Speaks with yoga terminology and mindfulness references.' },
  { name: 'Ulrich', profile: 'German banker in Singapore, 50, learning Mandarin for APAC markets. Disciplined Duolingo user. Speaks with German precision and finance terminology.' },
  { name: 'Vera', profile: 'Russian chess player in US, 22, improving English for tournaments. Analytical approach. Speaks with chess metaphors and strategic thinking.' },
  { name: 'William', profile: 'British retiree in Portugal, 70, learning Portuguese for retirement. Patient Duolingo user. Speaks with proper British English and retirement contentment.' },
  { name: 'Xena', profile: 'Greek-Australian personal trainer, 28, learning Spanish for fitness retreats. High-energy learner. Speaks with Aussie fitness slang and motivational tone.' },
  { name: 'Yosef', profile: 'Ethiopian-Israeli in tech, 29, learning German for Berlin startup scene. Multilingual perspective. Speaks with Israeli directness and startup vocabulary.' },
  { name: 'Zoe', profile: 'French pastry chef in Tokyo, 32, learning Japanese for her patisserie. Perfectionist approach. Speaks with French culinary terms and artistic sensitivity.' },
  { name: 'Andre', profile: 'Angolan oil engineer in Norway, 40, learning Norwegian for work integration. Appreciates Duolingo structure. Speaks with Portuguese-African formality.' },
  { name: 'Beatriz', profile: 'Portuguese fado singer in Paris, 35, learning French for performances. Musical approach to language. Speaks with soulful Portuguese emotion.' },
  { name: 'Cristian', profile: 'Romanian truck driver across Europe, 38, learning German for routes. Practical Duolingo user. Speaks with Romanian directness and road life stories.' },
  { name: 'Diana', profile: 'Venezuelan journalist in Miami, 31, improving English for US media. Critical of Duolingo depth. Speaks with journalist precision and Venezuelan expressions.' },
  { name: 'Erik', profile: 'Swedish game developer, 26, learning Japanese for game localization. Gamification expert perspective. Speaks with gamer references and Swedish dry humor.' },
  { name: 'Fiona', profile: 'Scottish nurse in New Zealand, 34, learning Maori for patient care. Cultural respect motivation. Speaks with Scottish warmth and healthcare compassion.' },
  { name: 'Gustavo', profile: 'Argentinian psychologist in Spain, 45, learning Catalan for Barcelona practice. Analytical learner. Speaks with Argentinian Spanish and psychological insights.' },
  { name: 'Hannah', profile: 'German environmental scientist, 29, learning Portuguese for Amazon research. Academic approach. Speaks with scientific precision and environmental passion.' },
  { name: 'Ivan', profile: 'Bulgarian weightlifter, 27, learning English for international competitions. Simple Duolingo user. Speaks with athletic directness and Bulgarian accent patterns.' },
  { name: 'Jade', profile: 'Chinese-Canadian influencer, 22, learning Korean for content. Social media focused. Speaks with Gen-Z slang and influencer vocabulary.' },
  { name: 'Kevin', profile: 'Irish pub owner in Spain, 52, learning Spanish for his Costa del Sol bar. Practical learner. Speaks with Irish humor and hospitality warmth.' },
  { name: 'Lila', profile: 'Moroccan fashion blogger in Paris, 25, perfecting French. Style-conscious approach. Speaks with Moroccan-French mix and fashion terminology.' },
  { name: 'Miguel', profile: 'Cuban musician in Miami, 60, learning English after decades in US. Late learner perspective. Speaks with Cuban musical soul and immigrant wisdom.' },
  { name: 'Natasha', profile: 'Ukrainian ballet teacher in Canada, 42, improving English for her academy. Graceful approach. Speaks with artistic sensitivity and dance terminology.' },
  { name: 'Oliver', profile: 'British food critic in Tokyo, 38, learning Japanese for restaurant reviews. Sophisticated learner. Speaks with refined British and culinary vocabulary.' },
  { name: 'Paula', profile: 'Chilean sommelier in France, 33, learning French for wine industry. Sensory approach to learning. Speaks with wine terminology and Chilean warmth.' },
  { name: 'Rafael', profile: 'Spanish football coach in Qatar, 47, learning Arabic for team communication. Sports-focused learner. Speaks with football metaphors and Spanish passion.' },
  { name: 'Selena', profile: 'Filipina caregiver in Israel, 35, learning Hebrew for elderly patients. Compassionate learner. Speaks with Filipino care and healthcare dedication.' },
  { name: 'Thomas', profile: 'Belgian chocolate maker in Switzerland, 55, learning German for business. Artisan perspective. Speaks with Belgian precision and craft pride.' },
  { name: 'Uma', profile: 'Indian classical dancer in UK, 28, learning Spanish for Latin dance fusion. Artistic learner. Speaks with dancer grace and cultural bridge-building.' },
  { name: 'Vincent', profile: 'French sommelier in Napa Valley, 40, perfecting English for wine tours. Refined learner. Speaks with French sophistication and wine expertise.' },
  { name: 'Wendy', profile: 'Taiwanese semiconductor engineer in Germany, 32, learning German for work. Technical learner. Speaks with engineering precision and Taiwanese politeness.' },
  { name: 'Xavier', profile: 'Senegalese footballer in France, 24, perfecting French for media. Sports star learner. Speaks with Senegalese French and athlete confidence.' },
  { name: 'Yara', profile: 'Lebanese architect in Dubai, 30, learning Arabic formally (grew up with dialect). Professional motivation. Speaks with Lebanese creativity and design vocabulary.' },
  { name: 'Zachary', profile: 'American missionary kid, 19, grew up in Brazil, now learning Mandarin. Polyglot perspective. Speaks with global awareness and young enthusiasm.' },
  { name: 'Anita', profile: 'Goan nurse in UK, 45, learning Portuguese to reconnect with heritage. Emotional journey. Speaks with Indian-British warmth and nursing care.' },
  { name: 'Bruno', profile: 'Brazilian MMA fighter in US, 29, improving English for UFC interviews. Fighter mentality. Speaks with Brazilian fighter spirit and sports intensity.' },
  { name: 'Carmen', profile: 'Spanish flamenco teacher in Japan, 38, learning Japanese for her studio. Passionate learner. Speaks with Spanish fire and artistic expression.' },
  { name: 'David', profile: 'Welsh rugby player retired, 35, learning French for coaching in France. Sports transition. Speaks with Welsh humor and rugby references.' },
  { name: 'Eva', profile: 'Hungarian pianist in Austria, 27, perfecting German for Vienna conservatory. Musical precision. Speaks with artistic sensitivity and Hungarian determination.' },
  { name: 'Felix', profile: 'Swiss banker in Hong Kong, 48, learning Cantonese for client relations. Business motivation. Speaks with Swiss precision and financial vocabulary.' },
  { name: 'Gloria', profile: 'Colombian coffee farmer daughter in US, 23, relearning Spanish formally. Heritage reconnection. Speaks with coffee culture references and bilingual struggles.' },
  { name: 'Hugo', profile: 'Portuguese surf instructor in Australia, 30, perfecting English for business. Laid-back learner. Speaks with surf culture and Portuguese chill.' },
  { name: 'Iris', profile: 'Dutch graphic designer in Barcelona, 26, learning Spanish and Catalan. Creative learner. Speaks with Dutch directness and design vocabulary.' },
  { name: 'Jorge', profile: 'Peruvian archaeologist in Egypt, 40, learning Arabic for research. Academic learner. Speaks with scholarly precision and Peruvian warmth.' },
  { name: 'Kira', profile: 'Japanese manga artist in France, 25, learning French for publishing. Visual learner perspective. Speaks with anime references and artistic sensitivity.' },
  { name: 'Luis', profile: 'Mexican pilot in Canada, 36, perfecting English for international routes. Safety-focused learner. Speaks with aviation terminology and Mexican professionalism.' },
  { name: 'Marta', profile: 'Polish midwife in Sweden, 33, learning Swedish for healthcare. Medical motivation. Speaks with Polish determination and healthcare compassion.' },
  { name: 'Nicolas', profile: 'French ski instructor in Japan, 28, learning Japanese for resort work. Adventure learner. Speaks with French charm and mountain culture.' },
  { name: 'Ophelia', profile: 'Greek marine biologist in Australia, 31, learning Indonesian for research. Scientific learner. Speaks with ocean passion and Greek expressiveness.' },
  { name: 'Pedro', profile: 'Brazilian capoeira master in Germany, 45, learning German for his academy. Cultural ambassador. Speaks with Brazilian rhythm and martial arts philosophy.' },
  { name: 'Rebecca', profile: 'American rabbi in Israel, 38, improving Hebrew for congregation. Spiritual learner. Speaks with religious depth and American warmth.' },
  { name: 'Steven', profile: 'Australian wine maker in France, 50, learning French for winery. Artisan learner. Speaks with Aussie directness and wine craftsmanship.' },
  { name: 'Tatiana', profile: 'Russian figure skating coach in US, 42, perfecting English for competitions. Perfectionist learner. Speaks with skating terminology and Russian discipline.' },
  { name: 'Ulysses', profile: 'Greek shipping heir in London, 26, learning Mandarin for family business. Business motivation. Speaks with Greek-British polish and shipping industry terms.' },
  { name: 'Valeria', profile: 'Italian opera singer in Germany, 34, learning German for Wagner roles. Musical learner. Speaks with operatic drama and Italian passion.' },
  { name: 'Wesley', profile: 'Jamaican cricket player in UK, 25, perfecting English for commentary career. Sports transition. Speaks with Caribbean rhythm and cricket terminology.' },
  { name: 'Xiomara', profile: 'Nicaraguan poet in Spain, 32, perfecting Castilian Spanish. Literary learner. Speaks with poetic expression and Central American roots.' },
  { name: 'Yusuf', profile: 'Turkish restaurateur in Berlin, 55, learning German for his kebab empire. Practical learner. Speaks with Turkish hospitality and food business wisdom.' },
  { name: 'Zelda', profile: 'South African game ranger, 29, learning Swahili for East African reserves. Nature lover. Speaks with safari references and South African English.' },
  { name: 'Arnold', profile: 'Austrian bodybuilder in US, 35, perfecting English for fitness industry. Motivational learner. Speaks with Austrian-American mix and gym culture.' },
  { name: 'Brenda', profile: 'Kenyan marathon runner in Japan, 27, learning Japanese for races. Athletic learner. Speaks with Kenyan English and running discipline.' },
  { name: 'Connor', profile: 'Irish bartender in Australia, 24, learning Italian for girlfriend family. Romantic motivation. Speaks with Irish charm and pub culture.' },
  { name: 'Daphne', profile: 'Cypriot hotel manager in UAE, 40, learning Arabic for luxury hospitality. Service-focused learner. Speaks with Mediterranean warmth and hotel professionalism.' },
  { name: 'Ezra', profile: 'American jazz musician in France, 33, learning French for Parisian scene. Musical learner. Speaks with jazz improvisation philosophy and cool vocabulary.' },
  { name: 'Francesca', profile: 'Italian fashion buyer in China, 36, learning Mandarin for sourcing. Business learner. Speaks with Italian fashion sense and trade vocabulary.' },
  { name: 'Gregory', profile: 'Canadian ice hockey coach in Sweden, 45, learning Swedish for team. Sports motivation. Speaks with hockey terminology and Canadian friendliness.' },
  { name: 'Hazel', profile: 'Filipino flight attendant based in Dubai, 28, learning Arabic for passengers. Service learner. Speaks with Filipino warmth and airline professionalism.' },
  { name: 'Idris', profile: 'Ghanaian tech entrepreneur in Netherlands, 30, learning Dutch for startup scene. Business motivation. Speaks with Ghanaian English and tech startup energy.' },
  { name: 'Josephine', profile: 'Congolese fashion designer in Paris, 27, perfecting French for haute couture. Creative learner. Speaks with African French elegance and fashion passion.' },
  { name: 'Klaus', profile: 'German classical conductor in Japan, 55, learning Japanese for orchestra. Artistic learner. Speaks with German precision and musical philosophy.' },
  { name: 'Leila', profile: 'Iranian filmmaker in Canada, 34, improving English for international festivals. Artistic learner. Speaks with cinematic references and Persian poetics.' },
  { name: 'Matteo', profile: 'Italian race car mechanic in Germany, 29, learning German for F1 team. Technical learner. Speaks with motor racing terminology and Italian passion.' },
  { name: 'Noor', profile: 'Jordanian doctor in UK, 38, perfecting English for NHS. Medical learner. Speaks with Arabic-British professionalism and healthcare vocabulary.' },
  { name: 'Orlando', profile: 'Cuban salsa instructor in Mexico, 42, perfecting Mexican Spanish. Dance motivation. Speaks with Cuban salsa rhythm and dance instruction style.' },
  { name: 'Patricia', profile: 'Brazilian telenovela actress in Spain, 30, learning Castilian for roles. Performance learner. Speaks with Brazilian drama and acting vocabulary.' },
  { name: 'Rodrigo', profile: 'Chilean astronomer in Hawaii, 35, improving English for research collaboration. Scientific learner. Speaks with stellar references and Chilean thoughtfulness.' },
  { name: 'Simone', profile: 'French pastry chef in Tokyo, 28, learning Japanese for her patisserie. Artisan learner. Speaks with French culinary precision and artistic sensitivity.' },
  { name: 'Tobias', profile: 'Swedish furniture designer in Italy, 32, learning Italian for Milan design week. Design learner. Speaks with Scandinavian minimalism and design vocabulary.' },
  { name: 'Ursula', profile: 'German marine biologist in Costa Rica, 40, learning Spanish for conservation. Environmental learner. Speaks with scientific passion and ocean advocacy.' },
  { name: 'Vincenzo', profile: 'Italian espresso machine engineer in US, 50, perfecting English for business. Technical learner. Speaks with Italian coffee culture and engineering precision.' },
  { name: 'Whitney', profile: 'American gospel singer in Nigeria, 35, learning Yoruba for church. Spiritual learner. Speaks with Southern gospel warmth and musical soul.' },
  { name: 'Xander', profile: 'Dutch extreme sports athlete, 26, learning Spanish for South American adventures. Adventure learner. Speaks with adrenaline vocabulary and Dutch directness.' },
  { name: 'Yvonne', profile: 'Cameroonian UN translator in Geneva, 38, perfecting German for diplomacy. Professional learner. Speaks with diplomatic precision and African-French elegance.' },
  { name: 'Zeke', profile: 'American skateboard designer in Japan, 27, learning Japanese for street culture. Youth culture learner. Speaks with skate slang and creative vocabulary.' },
  { name: 'Adriana', profile: 'Romanian gymnast coach in US, 35, perfecting English for Olympics commentary. Sports transition. Speaks with gymnastics terminology and Romanian determination.' },
  { name: 'Benjamin', profile: 'French winemaker in Argentina, 45, learning Spanish for Malbec production. Artisan learner. Speaks with wine vocabulary and French-Argentine blend.' },
  { name: 'Claudia', profile: 'Colombian coffee expert in Italy, 33, learning Italian for espresso culture. Craft learner. Speaks with coffee passion and Colombian warmth.' },
  { name: 'Derek', profile: 'Jamaican reggae producer in UK, 40, perfecting English for music industry. Music business learner. Speaks with reggae rhythm and production terminology.' },
  { name: 'Elisa', profile: 'Spanish marine archaeologist in Greece, 32, learning Greek for underwater excavations. Academic learner. Speaks with archaeological precision and Spanish curiosity.' },
  { name: 'Fernando', profile: 'Portuguese fado guitarist in Brazil, 38, learning Brazilian Portuguese differences. Musical learner. Speaks with fado soul and Portuguese-Brazilian connection.' },
  { name: 'Giselle', profile: 'Haitian ballerina in France, 25, perfecting French for Paris Opera. Artistic learner. Speaks with ballet grace and Haitian-French elegance.' },
  { name: 'Henry', profile: 'British antique dealer in China, 55, learning Mandarin for sourcing. Collector learner. Speaks with refined British and antiques vocabulary.' },
  { name: 'Isabella', profile: 'Argentine polo player in UK, 28, perfecting English for international circuit. Sports learner. Speaks with polo terminology and Argentine passion.' },
  { name: 'Jackson', profile: 'African American blues guitarist in France, 45, learning French for Parisian scene. Musical learner. Speaks with blues soul and Southern roots.' },
  { name: 'Kamila', profile: 'Polish figure skater in Canada, 22, learning French for Montreal training. Athletic learner. Speaks with skating terminology and Polish determination.' },
  { name: 'Leonardo', profile: 'Brazilian architect in Portugal, 35, adjusting to European Portuguese. Professional learner. Speaks with architectural vocabulary and Brazilian creativity.' },
  { name: 'Monica', profile: 'Mexican muralist in US, 40, perfecting English for gallery representation. Artistic learner. Speaks with visual arts vocabulary and Mexican cultural pride.' },
  { name: 'Nathan', profile: 'Australian Aboriginal artist in Germany, 30, learning German for exhibitions. Cultural ambassador. Speaks with Indigenous perspective and artistic sensitivity.' },
  { name: 'Paloma', profile: 'Spanish bullfighter daughter turned animal rights activist, 27, learning English for international campaigns. Activist learner. Speaks with Spanish passion and advocacy vocabulary.' },
  { name: 'Quincy', profile: 'American jazz drummer in Netherlands, 35, learning Dutch for Amsterdam residency. Musical learner. Speaks with jazz rhythm and percussion philosophy.' },
  { name: 'Renata', profile: 'Czech glass artist in Italy, 42, learning Italian for Murano collaboration. Artisan learner. Speaks with craft precision and Czech-Italian artistic connection.' },
  { name: 'Santiago', profile: 'Chilean wine sommelier in France, 38, perfecting French for Burgundy specialization. Wine learner. Speaks with sommelier vocabulary and Chilean-French blend.' },
  { name: 'Thalia', profile: 'Greek Olympic swimmer retired, 30, learning English for sports broadcasting. Transition learner. Speaks with swimming terminology and Greek expressiveness.' },
  { name: 'Umberto', profile: 'Italian truffle hunter in US, 60, learning English for export business. Traditional craft learner. Speaks with Italian earthiness and truffle hunting mystique.' },
  { name: 'Viola', profile: 'Swedish death metal drummer, 25, learning Norwegian for Scandinavian tours. Music scene learner. Speaks with metal culture vocabulary and Nordic connection.' },
  { name: 'Warren', profile: 'Australian pearl diver in Japan, 35, learning Japanese for Mikimoto collaboration. Luxury craft learner. Speaks with diving expertise and pearl industry vocabulary.' },
  { name: 'Ximena', profile: 'Mexican luchadora in Japan, 28, learning Japanese for wrestling promotion. Sports entertainment learner. Speaks with wrestling persona and Mexican wrestling tradition.' },
  { name: 'Yolanda', profile: 'Cuban cigar roller in Spain, 50, learning Castilian for tobacco industry. Craft learner. Speaks with Cuban tobacco culture and artisan pride.' },
  { name: 'Zander', profile: 'South African safari photographer in Kenya, 32, learning Swahili for wildlife guides. Nature learner. Speaks with photography vocabulary and African wildlife passion.' },
  { name: 'Alina', profile: 'Ukrainian rhythmic gymnast in Italy, 23, learning Italian for competition circuit. Athletic learner. Speaks with grace and Ukrainian-Italian artistic expression.' },
  { name: 'Boris', profile: 'Serbian basketball coach in Spain, 48, learning Spanish for Liga ACB. Sports learner. Speaks with basketball strategy and Serbian directness.' },
  { name: 'Celia', profile: 'Cuban salsa legend in Miami, 65, perfecting English after decades. Legacy motivation. Speaks with Cuban salsa royalty presence and musical wisdom.' },
  { name: 'Dimitri', profile: 'Greek chef in Australia, 38, perfecting English for cooking shows. Media learner. Speaks with Greek culinary passion and television presence.' },
  { name: 'Esperanza', profile: 'Bolivian textile artist in Peru, 35, learning Quechua for traditional patterns. Heritage craft learner. Speaks with Andean textile vocabulary and indigenous pride.' },
  { name: 'Federico', profile: 'Argentine tango master in Japan, 55, learning Japanese for his milonga. Dance ambassador. Speaks with tango philosophy and Argentine passion.' },
  { name: 'Giovanna', profile: 'Italian leather craftsman in France, 45, learning French for luxury market. Artisan learner. Speaks with Florentine leather tradition and craft pride.' },
  { name: 'Henrik', profile: 'Danish furniture restorer in UK, 50, perfecting English for antique trade. Craft learner. Speaks with Danish design sensibility and restoration expertise.' },
  { name: 'Irina', profile: 'Russian prima ballerina in US, 35, perfecting English for teaching. Artistic transition. Speaks with ballet excellence and Russian artistic tradition.' },
];

async function generateInterview(userProfile) {
  const systemPrompt = `You are simulating a user interview for a language learning app research study. You will generate realistic, conversational responses as if you are the person being interviewed.

The person you're simulating:
Name: ${userProfile.name}
Profile: ${userProfile.profile}

CRITICAL INSTRUCTIONS:
1. Speak EXACTLY as this person would speak - use their dialect, slang, filler words, speech patterns
2. Keep responses conversational and natural - people don't speak in perfect paragraphs
3. Include "um", "like", "you know", "I mean", verbal tics appropriate to the character
4. Responses should feel like real spoken language, not written text
5. Be authentic to their background - cultural references, expressions from their community
6. Their attitude toward Duolingo should match the profile (positive, negative, or mixed)
7. Reference competing apps if mentioned in profile (Babbel, Rosetta Stone, Pimsleur, Memrise, HelloChinese, etc.)
8. IMPORTANT: Responses should be DETAILED and SUBSTANTIVE - typically 4-8 sentences each. People in interviews ramble, explain themselves, give examples, go on tangents. Short answers are not realistic.
9. Show personality and emotion in responses - people share stories, memories, frustrations in detail
10. If they're negative about Duolingo, be genuinely critical with specific examples. If positive, be genuinely enthusiastic with specific examples.
11. Include specific anecdotes, concrete examples, and personal stories - not generic statements
12. For questions about Duolingo usage, describe specific screens, features, moments in detail
13. People in interviews often answer more than was asked - they connect things to their life, explain context, justify their feelings

Generate a complete interview with answers to all questions provided.`;

  const userPrompt = `Generate interview responses for all these questions. Return as a JSON object.

Questions:
${JSON.stringify(questions, null, 2)}

Remember: This person is ${userProfile.name}. ${userProfile.profile}

Make sure to also generate:
- A "summary" field (one sentence capturing their key insight about Duolingo)
- A "top_quotes" array with exactly 3 of their most impactful quotes about Duolingo/language learning

Return format:
{
  "user_name": "${userProfile.name}",
  "summary": "...",
  "top_quotes": ["...", "...", "..."],
  "interview_script": [{"question": "...", "time_limit_sec": ..., "answer": "..."}, ...]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 8000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    const data = JSON.parse(content);

    // Extract metadata from profile
    const ageMatch = userProfile.profile.match(/(\d+)/);
    const age = ageMatch ? parseInt(ageMatch[1]) : null;

    const genderKeywords = { 'she': 'female', 'her': 'female', 'woman': 'female', 'female': 'female', 'he': 'male', 'his': 'male', 'man': 'male', 'male': 'male' };
    let gender = 'unknown';
    for (const [keyword, g] of Object.entries(genderKeywords)) {
      if (userProfile.profile.toLowerCase().includes(keyword)) {
        gender = g;
        break;
      }
    }

    const languageKeywords = ['Spanish', 'French', 'German', 'Japanese', 'Italian', 'Portuguese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese', 'Arabic', 'Hindi', 'Russian', 'Dutch', 'Swedish', 'Norwegian', 'Turkish', 'Hebrew', 'Greek', 'Polish', 'Vietnamese', 'Thai', 'Indonesian', 'Swahili', 'Yoruba', 'Catalan', 'Farsi', 'Persian'];
    let learningLanguage = 'unknown';
    for (const lang of languageKeywords) {
      if (userProfile.profile.includes(lang)) {
        learningLanguage = lang;
        break;
      }
    }

    const countries = ['US', 'USA', 'United States', 'UK', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Brazil', 'Mexico', 'India', 'Japan', 'Spain', 'Italy', 'Netherlands', 'Sweden', 'Norway', 'Dubai', 'UAE', 'Singapore', 'Hong Kong', 'China', 'Korea', 'Israel', 'Portugal', 'Switzerland', 'Austria', 'Belgium', 'Ireland', 'Poland', 'Greece', 'Turkey', 'Egypt', 'Nigeria', 'Kenya', 'South Africa', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Qatar', 'Thailand', 'Indonesia', 'Philippines', 'Vietnam'];
    let country = 'unknown';
    for (const c of countries) {
      if (userProfile.profile.includes(c)) {
        country = c;
        break;
      }
    }

    // Build the interview object for Supabase
    return {
      workspace_id: DUOLINGO_DEMO_WORKSPACE_ID,
      name: data.user_name || userProfile.name,
      summary: data.summary,
      top_quotes: data.top_quotes,
      transcript: data.interview_script,
      age,
      gender,
      country,
      learning_language: learningLanguage,
      occupation: null,
      hometown: null,
      race: null,
      learning_goal: null,
      usage_frequency: null,
      is_premium_user: userProfile.profile.toLowerCase().includes('plus') || userProfile.profile.toLowerCase().includes('premium'),
      sentiments: {},
      personality: [],
      pain_points: [],
      value_props: [],
      other_apps: [],
      primary_app: 'Duolingo'
    };
  } catch (error) {
    console.error(`Error generating interview for ${userProfile.name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Generating 139 new Duolingo interviews using original prompt style...\n');

  // Get existing names from database
  const { data: existingInterviews, error } = await supabase
    .from('interviews')
    .select('name')
    .eq('workspace_id', DUOLINGO_DEMO_WORKSPACE_ID);

  if (error) {
    console.error('Error fetching existing interviews:', error.message);
    process.exit(1);
  }

  const existingNames = new Set(existingInterviews?.map(i => i.name.toLowerCase()) || []);
  console.log(`Found ${existingNames.size} existing interviews\n`);

  // Filter out profiles with names that already exist
  const profilesToGenerate = newUserProfiles.filter(p => !existingNames.has(p.name.toLowerCase()));
  console.log(`${profilesToGenerate.length} unique profiles to generate\n`);

  let successCount = 0;
  let errorCount = 0;

  // Process in batches of 3 (like original script)
  const batchSize = 3;
  for (let i = 0; i < profilesToGenerate.length; i += batchSize) {
    const batch = profilesToGenerate.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(profilesToGenerate.length / batchSize);

    console.log(`\nBatch ${batchNum}/${totalBatches}: Generating ${batch.map(p => p.name).join(', ')}...`);

    const results = await Promise.all(
      batch.map(profile => generateInterview(profile))
    );

    const validInterviews = results.filter(i => i !== null);

    if (validInterviews.length > 0) {
      const { error: insertError } = await supabase
        .from('interviews')
        .insert(validInterviews);

      if (insertError) {
        console.error(`  Error inserting batch:`, insertError.message);
        errorCount += validInterviews.length;
      } else {
        successCount += validInterviews.length;
        console.log(`  ✓ Inserted ${validInterviews.length} interviews`);
      }
    }

    errorCount += batch.length - validInterviews.length;

    // Delay between batches to avoid rate limiting
    if (i + batchSize < profilesToGenerate.length) {
      console.log('  Waiting before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n========================================`);
  console.log(`Generation complete!`);
  console.log(`Successfully created: ${successCount} interviews`);
  console.log(`Failed: ${errorCount} interviews`);

  // Verify total
  const { data: totalInterviews } = await supabase
    .from('interviews')
    .select('id')
    .eq('workspace_id', DUOLINGO_DEMO_WORKSPACE_ID);

  console.log(`\nTotal Duolingo Demo interviews: ${totalInterviews?.length || 0}`);
}

main().catch(console.error);
