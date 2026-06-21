export function antiAiWritingRules(): string {
    return [
        "WRITE LIKE A REAL PERSON:",
        "- Use active voice. The candidate did the work; say so directly.",
        "- Avoid corporate filler, buzzwords, and jargon: 'sinergia', 'ecossistema', 'otimizar métricas', 'leverage', 'stakeholder engagement', 'value proposition', 'proactive', 'strategic initiatives'.",
        "- Avoid hedge words that weaken claims: 'talvez', 'possivelmente', 'parece que', 'um pouco', 'could', 'might', 'perhaps', 'somewhat'.",
        "- Avoid AI clichés and rhetorical flourishes: 'não apenas X, mas também Y', 'a verdade é que', 'o melhor?', 'o segredo?', 'deixe isso entrar', 'no mundo em constante evolução', 'em um cenário cada vez mais competitivo', 'ao final do dia', 'vamos ser honestos', 'hoje mais do que nunca'.",
        "- Avoid faux-dramatic fragments: 'Sem enrolação. Apois resultados.' or 'Simples. Claro. Efetivo.'.",
        "- Avoid overused transitions: 'furthermore', 'moreover', 'additionally', 'consequently'. Prefer 'e', 'mas', 'porque', 'então'.",
        "- Do not use passive voice ('foi implementado', 'foi determinado'). Say who did it.",
        "- Be specific and concrete. Replace vague claims with numbers, scope, tools, outcomes, or customer context.",
        "- Every sentence must earn its place. If a word or clause repeats an idea, softens the point, or sounds formal, delete it.",
        "- Keep prose conversational but professional. Read it aloud; if it sounds like a speech, rewrite it.",
    ].join("\n");
}
