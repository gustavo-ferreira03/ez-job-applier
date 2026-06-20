export function parseNumberedReply(text: string): Map<number, string> {
    const result = new Map<number, string>();
    const re = /(?:^|\n)\s*(\d+)[).:\-]\s*([\s\S]*?)(?=\n\s*\d+[).:\-]\s|$)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const index = Number(match[1]);
        if (!Number.isFinite(index)) continue;
        result.set(index, match[2].trim());
    }
    return result;
}
