import React, { createContext, useContext, useState, useCallback } from 'react';

const LanguageContext = createContext(null);

const translations = {
    en: {
        you: 'You',
        opponent: 'Opponent',
        yourTurn: 'Your Turn',
        waiting: 'Waiting...',
        connected: 'Connected',
        disconnected: 'Disconnected',
        connectionFailed: 'Connection failed',
        tilesRemaining: 'Tiles Remaining',
        total: 'Total',
        tiles: 'tiles',
        turnHistory: 'Turn History',
        noMovesYet: 'No moves yet',
        chat: 'Chat',
        noMessagesYet: 'No messages yet',
        typeMessage: 'Type a message...',
        send: 'Send',
        turn: 'TURN',
        passed: 'Passed',
        swappedTiles: 'Swapped tiles',
        helpTitle: 'Game Rules',
        helpClose: 'Close',
        confirmNewGame: 'Start a new game? Current game will be lost.',
        confirmPass: 'Pass your turn?',
        yes: 'Yes',
        no: 'No',
        tagline: 'Tamil Scrabble',
        createGame: 'Create Game',
        joinGame: 'Join Game',
        enterGameCode: 'Enter game code',
        join: 'Join',
        howToPlay: 'Game Rules',
        invalidCode: 'Enter a valid game code (4-8 characters)',
        gameOverTie: 'Tie Game!',
        gameOverWon: 'You Won!',
        gameOverLost: 'You Lost',
        gameOverPasses: 'Both players passed/swapped consecutively',
        gameOverTilesOut: 'Tile bag exhausted',
        gameOverNewGame: 'Start a New Game to play again',
        vs: 'vs',
        playVsComputer: 'Play vs Computer',
        computer: 'Computer',
        computerThinking: 'Thinking...',
        vsComputer: 'vs Computer',
        helpSections: [
            { title: 'Goal', body: 'Form valid Tamil words on the board to score points. The player with the highest score at the end wins.' },
            { title: 'Tiles', body: 'There are 4 tile types: Vowels (உயிர்), Consonants (மெய்), Combined letters (உயிர்மெய்), and Bonus tiles (மாயம்). Drag tiles from your rack onto the board.' },
            { title: 'Forming Words', body: 'Place tiles in a single row or column. The first word must cover one of the 5 star squares. After that, new words can either connect to existing words on the board, or cover a star square.' },
            { title: 'Combining Letters', body: 'Drag a vowel tile onto a consonant tile (or vice versa) to form a combined letter (உயிர்மெய்). Double-click a combined letter to split it back.' },
            { title: 'Bonus Tile', body: 'The bonus tile (மாயம்) can represent any letter. Double-click it to choose which letter it becomes.' },
            { title: 'Scoring', body: 'Each tile has point values. Multiplier squares on the board multiply letter or word scores. Star squares give 2x word score.' },
            { title: 'Swapping Tiles', body: 'Click the swap button, then select tiles on your rack, then click the swap button again to exchange them for new tiles from the bag.' },
            { title: 'Passing', body: 'You can pass your turn without playing. If both players pass or swap twice in a row, the game ends.' },
        ],
    },
    ta: {
        you: 'நீங்கள்',
        opponent: 'எதிரி',
        yourTurn: 'உங்கள் முறை',
        waiting: 'காத்திருக்கிறது...',
        connected: 'இணைக்கப்பட்டது',
        disconnected: 'துண்டிக்கப்பட்டது',
        connectionFailed: 'இணைப்பு தோல்வி',
        tilesRemaining: 'மீதமுள்ள எழுத்துகள்',
        total: 'மொத்தம்',
        tiles: 'எழுத்துகள்',
        turnHistory: 'ஆட்ட வரலாறு',
        noMovesYet: 'இன்னும் ஆட்டம் இல்லை',
        chat: 'உரையாடல்',
        noMessagesYet: 'இன்னும் செய்திகள் இல்லை',
        typeMessage: 'செய்தி எழுதுங்கள்...',
        send: 'அனுப்பு',
        turn: 'முறை',
        passed: 'தவிர்த்தார்',
        swappedTiles: 'எழுத்துகள் மாற்றினார்',
        helpTitle: 'விளையாட்டு முறை',
        helpClose: 'மூடு',
        confirmNewGame: 'புது விளையாட்டு தொடங்கவா? நடப்பு ஆட்டம் இழக்கப்படும்.',
        confirmPass: 'உங்கள் முறையைத் தவிர்க்கவா?',
        yes: 'ஆம்',
        no: 'வேண்டாம்',
        tagline: 'தமிழ் ஸ்கிராபிள்',
        createGame: 'புது ஆட்டம்',
        joinGame: 'ஆட்டத்தில் சேர',
        enterGameCode: 'ஆட்ட குறியீடு',
        join: 'சேர்',
        howToPlay: 'விளையாட்டு முறை',
        invalidCode: 'சரியான ஆட்ட குறியீடு உள்ளிடவும் (4-8 எழுத்துகள்)',
        gameOverTie: 'சமநிலை!',
        gameOverWon: 'நீங்கள் வென்றீர்கள்!',
        gameOverLost: 'நீங்கள் தோற்றீர்கள்',
        gameOverPasses: 'இரு வீரர்களும் தொடர்ச்சியாக தவிர்த்தனர்',
        gameOverTilesOut: 'எழுத்துப் பை காலியானது',
        gameOverNewGame: 'மீண்டும் விளையாட புது விளையாட்டு தொடங்கவும்',
        vs: 'எதிர்',
        playVsComputer: 'கணினியுடன் விளையாடு',
        computer: 'கணினி',
        computerThinking: 'யோசிக்கிறது...',
        vsComputer: 'கணினி எதிரி',
        helpSections: [
            { title: 'குறிக்கோள்', body: 'பலகையில் சரியான தமிழ் சொற்களை உருவாக்கி புள்ளிகள் பெறுங்கள். அதிக புள்ளிகள் பெறுபவர் வெற்றி.' },
            { title: 'எழுத்துகள்', body: 'நான்கு வகை எழுத்துகள்: உயிர், மெய், உயிர்மெய், மாயம் (போனஸ்). எழுத்துகளை உங்கள் தட்டிலிருந்து பலகைக்கு இழுக்கவும்.' },
            { title: 'சொற்களை உருவாக்குதல்', body: 'ஒரே வரிசையில் அல்லது நெடுவரிசையில் எழுத்துகளை வையுங்கள். முதல் சொல் 5 நட்சத்திர கட்டங்களில் ஒன்றை மறைக்க வேண்டும். அதன் பிறகு, புதிய சொற்கள் ஏற்கனவே உள்ள சொற்களுடன் இணையலாம், அல்லது நட்சத்திர கட்டத்தை மறைத்து தனியாகவும் வைக்கலாம்.' },
            { title: 'எழுத்துகளை இணைத்தல்', body: 'உயிர் எழுத்தை மெய் எழுத்தின் மீது இழுத்தால் உயிர்மெய் எழுத்து உருவாகும். உயிர்மெய் எழுத்தை இரட்டை சொடுக்கினால் பிரிக்கலாம்.' },
            { title: 'மாயம் எழுத்து', body: 'மாயம் (போனஸ்) எழுத்து எந்த எழுத்தாகவும் மாறலாம். அதை இரட்டை சொடுக்கி எழுத்தை தேர்வு செய்யவும்.' },
            { title: 'புள்ளிகள்', body: 'ஒவ்வொரு எழுத்துக்கும் புள்ளி மதிப்பு உண்டு. பலகையில் உள்ள பெருக்கி கட்டங்கள் எழுத்து அல்லது சொல் புள்ளிகளை பெருக்கும். நட்சத்திர கட்டம் 2x சொல் புள்ளி தரும்.' },
            { title: 'எழுத்துகளை மாற்றுதல்', body: 'மாற்று பொத்தானை அழுத்தி, தட்டில் உள்ள எழுத்துகளைத் தேர்வு செய்து, மீண்டும் மாற்று பொத்தானை அழுத்தினால் புதிய எழுத்துகள் கிடைக்கும்.' },
            { title: 'தவிர்த்தல்', body: 'உங்கள் முறையை தவிர்க்கலாம். இரு வீரர்களும் இரண்டு முறை தொடர்ச்சியாக தவிர்த்தால் அல்லது மாற்றினால் ஆட்டம் முடியும்.' },
        ],
    },
};

export function LanguageProvider({ children }) {
    const [language, setLanguage] = useState('ta');

    const toggleLanguage = useCallback(() => {
        setLanguage(prev => prev === 'en' ? 'ta' : 'en');
    }, []);

    const t = translations[language];

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
