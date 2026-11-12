import re
from math import sqrt

WORD_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?")
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")

REPLACEMENTS = (
    (r"\bin order to\b", "to"),
    (r"\bdue to the fact that\b", "because"),
    (r"\bit is important to note that\b", "notably,"),
    (r"\bit should be noted that\b", "notably,"),
    (r"\butilize\b", "use"),
    (r"\bfacilitate\b", "help"),
    (r"\bnumerous\b", "many"),
    (r"\bindividuals\b", "people"),
    (r"\bcommence\b", "start"),
    (r"\bterminate\b", "end"),
    (r"\bmoreover,?\b", "also,"),
    (r"\bfurthermore,?\b", "also,"),
    (r"\bnevertheless,?\b", "still,"),
    (r"\btherefore,?\b", "so,"),
    (r"\bcannot\b", "can't"),
    (r"\bdo not\b", "don't"),
    (r"\bdoes not\b", "doesn't"),
    (r"\bwill not\b", "won't"),
    (r"\bit is\b", "it's"),
)

TRANSITIONS = {
    "additionally",
    "furthermore",
    "moreover",
    "consequently",
    "therefore",
    "notably",
    "overall",
    "ultimately",
    "thus",
}


def _match_case(source: str, replacement: str) -> str:
    if source[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def humanize(text: str) -> str:
    """Make formal, repetitive prose more direct without inventing new facts."""
    result = re.sub(r"[ \t]+", " ", text.strip())
    result = re.sub(r"\s*\n\s*", "\n", result)
    for pattern, replacement in REPLACEMENTS:
        result = re.sub(
            pattern,
            lambda match, value=replacement: _match_case(match.group(), value),
            result,
            flags=re.IGNORECASE,
        )
    result = re.sub(r",\s*,", ",", result)
    result = re.sub(r"\s+([,.;:!?])", r"\1", result)
    result = re.sub(r"([.!?])(?=[A-Za-z])", r"\1 ", result)
    return result


def detect(text: str) -> dict:
    """Return a transparent style-pattern estimate, not an authorship verdict."""
    words = [word.lower().replace("’", "'") for word in WORD_RE.findall(text)]
    sentences = [part for part in SENTENCE_RE.split(text.strip()) if WORD_RE.search(part)]
    lengths = [len(WORD_RE.findall(sentence)) for sentence in sentences] or [len(words)]
    mean = sum(lengths) / max(len(lengths), 1)
    variance = sum((length - mean) ** 2 for length in lengths) / max(len(lengths), 1)
    variation = sqrt(variance) / max(mean, 1)
    uniformity = max(0.0, 1.0 - min(variation / 0.75, 1.0))

    trigrams = list(zip(words, words[1:], words[2:]))
    repeated = 1.0 - len(set(trigrams)) / max(len(trigrams), 1)
    transition_rate = sum(word in TRANSITIONS for word in words) / max(len(words), 1)
    contractions = sum("'" in word for word in words) / max(len(words), 1)
    punctuation_types = sum(mark in text for mark in ";:!?—()")
    punctuation_uniformity = 1.0 - min(punctuation_types / 4, 1.0)

    score = (
        0.42 * uniformity
        + 0.22 * min(repeated * 8, 1.0)
        + 0.16 * min(transition_rate * 25, 1.0)
        + 0.12 * punctuation_uniformity
        + 0.08 * (1.0 - min(contractions * 30, 1.0))
    )
    ai = round(max(5, min(95, score * 100)))
    confidence = "low" if len(words) < 80 else "medium" if len(words) < 200 else "higher"
    signals = []
    if uniformity > 0.7:
        signals.append("Sentence lengths are unusually consistent.")
    if repeated > 0.03:
        signals.append("Some three-word patterns repeat.")
    if transition_rate > 0.025:
        signals.append("Formal transition words appear often.")
    if contractions < 0.005:
        signals.append("The writing uses few conversational contractions.")
    if not signals:
        signals.append("The sample has varied, less predictable writing patterns.")
    return {
        "ai_percentage": ai,
        "human_percentage": 100 - ai,
        "confidence": confidence,
        "word_count": len(words),
        "signals": signals[:3],
    }
