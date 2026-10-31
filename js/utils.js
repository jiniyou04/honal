// 공통 도우미 함수 (텍스트 나누기, 유사도 계산, HTML 이스케이프)

export function splitTextIntoChunks(text, maxChars = 500, overlap = 50) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        let end = Math.min(i + maxChars, text.length);
        let chunkText = text.slice(i, end);
        chunks.push({
            text: chunkText,
            embedding: Array.from({length: 128}, () => Math.random() * 2 - 1)
        });
        if (end === text.length) break;
        i += (maxChars - overlap);
    }
    return chunks;
}

export function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
