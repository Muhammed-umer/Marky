import { words } from "@/lib/qualification/score";
import type { QualificationCandidate, QualificationContext } from "@/lib/qualification/types";

export const NEAR_DUPLICATE_THRESHOLD = 0.8;

/**
 * Domains that republish other people's writing. Their URLs are not the
 * canonical home of the story, so storing them breaks attribution.
 */
const AGGREGATOR_DOMAINS = new Set([
  "news.ycombinator.com",
  "reddit.com",
  "lobste.rs",
  "techmeme.com",
  "flipboard.com",
  "getpocket.com",
  "news.google.com",
  "medium.datadriveninvestor.com",
  "hackernewsletter.com",
]);

const SPAM_MARKERS = [
  "sponsored post",
  "paid partnership",
  "this post is sponsored",
  "affiliate link",
  "buy now",
  "coupon code",
];

const PAYWALL_MARKERS = [
  "subscribe to continue",
  "subscribers only",
  "this article is for paid",
  "become a member to read",
  "create an account to keep reading",
];

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Word bigrams, falling back to unigrams for titles too short to shingle. */
export function shingles(title: string): Set<string> {
  const tokens = words(title);
  if (tokens.length < 2) return new Set(tokens);
  const result = new Set<string>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    result.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return result;
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const entry of left) if (right.has(entry)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function isNearDuplicateTitle(title: string, recentTitles: string[]): boolean {
  const target = shingles(title);
  return recentTitles.some((recent) => jaccard(target, shingles(recent)) > NEAR_DUPLICATE_THRESHOLD);
}

export function isAggregatorDomain(url: string): boolean {
  const host = hostname(url);
  if (!host) return true;
  return [...AGGREGATOR_DOMAINS].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function looksLikeSpam(candidate: QualificationCandidate): boolean {
  const haystack = `${candidate.title} ${candidate.summary ?? ""}`.toLowerCase();
  return SPAM_MARKERS.some((marker) => haystack.includes(marker));
}

export function isPaywalledWithoutSummary(candidate: QualificationCandidate): boolean {
  if (candidate.paywalled && !candidate.summary && !candidate.bodyText) return true;
  const body = (candidate.bodyText ?? candidate.summary ?? "").toLowerCase();
  if (!body) return false;
  return PAYWALL_MARKERS.some((marker) => body.includes(marker)) && body.length < 400;
}


/**
 * Marky's topics, aliases and UI are English, so a story nobody in the audience
 * can read is not a lower-quality story -- it is the wrong story. Medium tag
 * feeds in particular mix languages freely under an English tag.
 *
 * Detection is deliberately two-stage and conservative, because a false
 * positive silently drops a legitimate article.
 */

/** Scripts that are never incidental to an English technology article. */
const NON_LATIN_SCRIPT =
  /[ऀ-ॿঀ-৿਀-੿஀-௿ఀ-౿ഀ-ൿ฀-๿Ѐ-ӿ؀-ۿ֐-׿一-鿿぀-ヿ가-힯Ͱ-Ͽ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/**
 * Fraction of letters written in a non-Latin script. A ratio rather than mere
 * presence: an English post may legitimately quote a Chinese model name or a
 * Devanagari example without being a non-English post.
 */
export function nonLatinRatio(text: string): number {
  const nonLatin = (text.match(NON_LATIN_SCRIPT) ?? []).length;
  const latin = (text.match(LATIN_LETTER) ?? []).length;
  const total = nonLatin + latin;
  return total === 0 ? 0 : nonLatin / total;
}

const NON_LATIN_LIMIT = 0.2;

/**
 * Function words carry no topic meaning, so their absence is a better language
 * signal than any keyword list. Checked only on Latin-script text, where the
 * script test cannot help -- this is what catches Spanish or Indonesian posts,
 * and transliterated Hindi written in Latin letters.
 */
const ENGLISH_STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "you", "your", "are", "was", "have",
  "has", "not", "but", "can", "will", "how", "what", "when", "which", "they", "their", "its",
  "it", "is", "of", "to", "in", "on", "at", "by", "we", "our", "as", "an", "be", "or", "if",
]);

/** Below this share of function words, Latin-script prose is very unlikely to be English. */
const MIN_STOPWORD_RATIO = 0.08;
/** Short text has too few function words to judge; a title alone proves nothing. */
const MIN_WORDS_TO_JUDGE = 40;

export function englishStopwordRatio(text: string): number {
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (!tokens.length) return 0;
  return tokens.filter((token) => ENGLISH_STOPWORDS.has(token)).length / tokens.length;
}

/** Distinct words needed before a stopword ratio means anything. */
const MIN_DISTINCT_WORDS = 20;

/**
 * Function words of the Latin-script languages that reach the feed: mostly
 * Indonesian/Malay, Spanish, Portuguese, French, German, Italian, Dutch,
 * Turkish, Vietnamese, Tagalog, Polish, Romanian, Czech, Hungarian and the
 * Nordic languages. Function words, not vocabulary: "yang", "untuk", "dengan"
 * appear in every Indonesian sentence, whereas a topic word appears in one.
 *
 * Anything that is also an English word, a common English name or a common
 * acronym is deliberately left out -- "die", "was", "mit", "dan", "son",
 * "plus", "met", "men", "may", "do", "as", "no" -- because the test below is
 * decided by counting, and a name in an English title must never count.
 *
 * This exists because the stopword ratio above needs 40 words: a Medium tag
 * feed hands over a title and a one-line teaser, so an Indonesian post such as
 * "Drama OpenAI vs Anthropic Gara-Gara Soal Matematika: Ini yang Bisa
 * Dipelajari Marketer" (stored 2026-09-14) sailed through with fewer than 20.
 */
const FOREIGN_FUNCTION_WORDS = new Set([
  // Indonesian / Malay
  "yang", "untuk", "dari", "dengan", "ini", "itu", "bisa", "tidak", "akan", "pada", "oleh",
  "juga", "adalah", "kita", "kami", "anda", "sudah", "telah", "karena", "sebagai", "saja", "atau",
  "bagaimana", "cara", "apa", "kenapa", "mengapa", "soal", "gara", "tentang", "lebih", "seperti",
  "hanya", "harus", "agar", "bahwa", "dalam", "ke", "di", "belajar", "membuat", "menggunakan",
  "terbaru", "baru", "bukan", "sangat", "banyak", "setelah", "sebelum", "hingga", "mereka", "saya",
  // Spanish
  "el", "la", "los", "las", "del", "que", "para", "por", "con", "una", "es", "como", "cómo", "más",
  "pero", "sobre", "este", "esta", "esto", "sus", "hay", "muy", "también", "cuando", "nuevo", "nueva",
  "nuevos", "nuevas", "entre", "desde", "hasta", "porque", "qué", "ser", "tiene", "todos",
  "lo", "se", "su", "sin", "ese", "esa", "un", "aquí", "ahora", "cada", "puede", "mejor", "mejores",
  // Portuguese
  "da", "dos", "das", "uma", "não", "nao", "mais", "tambem", "isso", "seu", "sua", "ele",
  "ela", "você", "voce", "está", "são", "sao", "foi", "tem", "muito", "pelo", "pela", "ao", "à", "é",
  "onde", "porquê", "ainda", "novo", "novos", "novas", "nós",
  // French
  "le", "les", "des", "du", "de", "une", "pour", "avec", "dans", "sur", "pas", "qui", "ce",
  "cette", "ces", "sont", "vous", "nous", "votre", "notre", "comment", "aussi", "mais", "très", "être",
  "etre", "chez", "où", "il", "elle", "ils", "ne", "au", "aux", "sa", "ses", "leur", "leurs",
  "tout", "tous", "toute", "toutes", "faire", "fait", "peut", "cela", "ça", "déjà", "pourquoi", "quoi",
  "nouveau", "nouvelle", "nouveaux", "nouvelles", "voici", "après", "avant",
  // German
  "der", "das", "und", "ist", "nicht", "ein", "eine", "einen", "einer", "eines", "für", "von", "zu",
  "zum", "zur", "auf", "im", "aus", "bei", "nach", "über", "wie", "wir", "sie", "ihr", "ihre", "dem",
  "den", "oder", "auch", "aber", "wenn", "dass", "sich", "noch", "nur", "mehr", "kann", "werden",
  "wird", "sind", "haben", "wurde", "dieser", "diese", "dieses", "ich", "neu", "neue", "neuen",
  "neues", "warum", "jetzt", "alle", "durch", "gegen", "beim", "vom", "zwischen", "sehr",
  // Italian
  "gli", "di", "che", "sono", "della", "dei", "delle", "nel", "nella", "più",
  "anche", "questo", "questa", "questi", "sul", "sulla", "tra", "fra", "ha", "hanno", "essere", "molto",
  "dove", "quando", "perché", "perche", "cosa", "ogni", "nuovo", "nuova", "nuovi", "nuove", "ecco",
  // Dutch
  "het", "een", "en", "van", "voor", "niet", "hoe", "je", "ook", "dit", "wat", "zijn", "wordt",
  "worden", "naar", "bij", "om", "uit", "maar", "nog", "als", "zo", "deze", "meer", "wel",
  "onze", "jouw", "hun", "nieuw", "nieuwe", "waarom", "hier", "nu",
  // Turkish
  "ve", "bir", "için", "icin", "ile", "bu", "ne", "nasıl", "nasil", "çok", "cok", "olan", "olarak",
  "daha", "gibi", "kadar", "sonra", "ama", "bunu", "şu", "şey", "yeni", "hakkında", "hakkinda",
  "neden", "mi", "mı", "mu", "mü", "ise", "değil", "degil",
  // Vietnamese
  "và", "của", "cho", "với", "là", "không", "có", "các", "những", "được", "này", "một", "trong", "để",
  "khi", "từ", "như", "về", "đã", "sẽ", "bạn", "cách", "làm", "người", "tại", "theo", "nhưng", "thì",
  "đến", "mà", "gì", "sao", "mới",
  // Tagalog / Filipino
  "ang", "ng", "sa", "mga", "ay", "na", "ko", "mo", "ito", "iyon", "kung", "dito", "siya",
  "kayo", "ako", "ikaw", "nang", "din", "rin", "kasi", "dahil", "upang", "paano", "bakit",
  // Polish
  "nie", "się", "sie", "jak", "oraz", "dla", "przez", "jako", "tego", "jego", "jej", "ich",
  "które", "który", "która", "można", "aby", "ale", "bardzo", "tylko", "już", "czy", "tak", "przy",
  "może", "być", "tym", "przed", "nowy", "nowe", "nowa", "dlaczego",
  // Romanian
  "și", "este", "pentru", "sunt", "cu", "din", "mai", "nu", "sau", "într", "dacă", "când",
  "cum", "acest", "această", "prin", "fost", "poate", "foarte", "nou", "noua", "nouă", "noi",
  // Czech / Slovak
  "je", "že", "ze", "byl", "byla", "jsou", "jsem", "této", "tento", "nebo", "také", "protože",
  "proč", "nový", "nové", "nová", "jsme",
  // Hungarian
  "és", "egy", "hogy", "nem", "van", "ez", "csak", "már", "még", "vagy",
  "minden", "ezt", "azt", "lehet", "kell", "miért", "új",
  // Swedish / Norwegian / Danish
  "och", "att", "för", "är", "inte", "det", "den", "som", "hon", "ett", "av", "på", "og", "ikke",
  "vil", "skal", "også", "eller", "när", "når", "hvordan", "varför", "hvorfor", "nya", "nye", "nytt",
]);

/**
 * The English side of the balance. Wider than ENGLISH_STOPWORDS, whose size is
 * tuned to the ratio threshold above; here more English words only make the
 * test more conservative.
 */
const ENGLISH_FUNCTION_WORDS = new Set([
  ...ENGLISH_STOPWORDS,
  "a", "i", "us", "so", "do", "does", "did", "been", "more", "than", "then", "there", "these",
  "those", "also", "just", "about", "into", "over", "some", "any", "all", "who", "why", "where",
  "were", "had", "him", "her", "his", "she", "he", "my", "me", "no", "yes", "up", "out", "new",
  "one", "get", "use", "using", "vs", "should", "would", "could", "here", "now", "only", "every",
  "each", "make", "made", "without", "through", "before", "after", "between", "while", "still",
  "much", "many", "most", "very", "own", "same", "other", "another", "first", "last", "next", "best",
]);

/** Every word, including accented ones, so Vietnamese and Turkish are counted whole. */
function letterTokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
}

/**
 * Non-English function words against English ones. Both figures are counts of
 * whole words, so a stray "de" in a surname or an "en-US" locale tag competes
 * with every "the" and "of" in the same text and loses.
 */
export function functionWordBalance(text: string): { foreign: number; foreignDistinct: number; english: number } {
  const seen = new Set<string>();
  let foreign = 0;
  let english = 0;
  for (const token of letterTokens(text)) {
    if (ENGLISH_FUNCTION_WORDS.has(token)) english += 1;
    else if (FOREIGN_FUNCTION_WORDS.has(token)) {
      foreign += 1;
      seen.add(token);
    }
  }
  return { foreign, foreignDistinct: seen.size, english };
}

/**
 * Latin letters carrying diacritics, as a share of all Latin letters. English
 * has essentially none; Vietnamese is written in them. Turkish, Polish and
 * Czech sit in between and are usually caught by the word test instead.
 */
const ACCENTED_LATIN = /[À-ÖØ-öø-ɏḀ-ỿ]/g;
const ACCENTED_LIMIT = 0.12;
/** Fewer accented letters than this is a name or a loanword, not a language. */
const MIN_ACCENTED_LETTERS = 3;

export function accentedLatinRatio(text: string): number {
  const accented = (text.match(ACCENTED_LATIN) ?? []).length;
  if (accented < MIN_ACCENTED_LETTERS) return 0;
  const plain = (text.match(LATIN_LETTER) ?? []).length;
  return accented / (accented + plain);
}

/**
 * Enough foreign function words to outnumber the English ones. Two distinct
 * words are required so a single "la" or "del" inside an English title -- a
 * band, a brand, a surname -- can never decide on its own.
 */
function foreignWordsDominate(text: string, minDistinct: number): boolean {
  const balance = functionWordBalance(text);
  return balance.foreignDistinct >= minDistinct && balance.foreign > balance.english;
}

export function isLikelyNonEnglish(candidate: QualificationCandidate): boolean {
  const text = `${candidate.title} ${candidate.summary ?? ""} ${candidate.bodyText ?? ""}`.trim();
  if (!text) return false;

  // Stage 1: script. Reliable, and the reason this check exists -- Devanagari,
  // CJK, Cyrillic and the rest are never incidental to an English article.
  //
  // The title is measured on its own as well as with the body, because summary
  // boilerplate (author lines, URLs, tags) is Latin even on a foreign-language
  // post and drags the combined ratio down. Measured against the stored rows on
  // 2026-09-09: a Marathi, a Russian and a Chinese article all scored 0.14-0.19
  // combined -- under any sane combined threshold -- while their titles scored
  // 0.48, 0.86 and 1.00.
  if (nonLatinRatio(candidate.title) > NON_LATIN_LIMIT) return true;
  if (nonLatinRatio(text) > NON_LATIN_LIMIT) return true;

  // Stage 2: Latin-script languages, judged by their function words. The title
  // is judged alone first, for the same reason as above: a tag feed's teaser is
  // English boilerplate ("Continue reading on Medium") whatever the post is.
  // Then the whole text, where three distinct foreign words are required.
  if (foreignWordsDominate(candidate.title, 2)) return true;
  if (foreignWordsDominate(text, 3)) return true;

  // Stage 3: diacritics. Catches Vietnamese even when its function words are
  // split by the tokenizer, and any Latin-script language dense in accents.
  if (accentedLatinRatio(candidate.title) > ACCENTED_LIMIT) return true;
  if (accentedLatinRatio(text) > ACCENTED_LIMIT) return true;

  // Stage 4: absence of English function words, for long Latin-script prose in
  // a language the list above does not cover. Deliberately hard to trigger,
  // because a false positive silently drops a real article while a false
  // negative merely shows one odd item.
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (tokens.length < MIN_WORDS_TO_JUDGE) return false;
  // Vocabulary this narrow is boilerplate, a word list or placeholder text --
  // not prose whose language can be judged either way.
  if (new Set(tokens).size < MIN_DISTINCT_WORDS) return false;
  return englishStopwordRatio(text) < MIN_STOPWORD_RATIO;
}

/**
 * Checks that make scoring pointless. Returns a machine-readable reason, or
 * null when the candidate should go on to be scored.
 */
export function hardRejectReason(candidate: QualificationCandidate, context: QualificationContext): string | null {
  if (context.duplicate) return "duplicate_url_hash";
  if (isAggregatorDomain(candidate.canonicalUrl)) return "aggregator_domain";
  if (looksLikeSpam(candidate)) return "spam_markers";
  if (isPaywalledWithoutSummary(candidate)) return "paywalled_without_summary";
  if (isNearDuplicateTitle(candidate.title, context.recentTitles ?? [])) return "near_duplicate_title";
  if (isLikelyNonEnglish(candidate)) return "non_english";
  return null;
}
