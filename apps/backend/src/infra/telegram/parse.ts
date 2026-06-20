export function parseNumberedReply(text: string): Map<number, string> {
    const result = new Map<number, string>();
    const re = /^\s*(\d+)[).:\-]\s*([\s\S]*?)(?=^\s*\d+[).:\-]|$)/gm;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        result.set(Number(match[1]), match[2].trim());
    }
    return result;
}
